const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Função auxiliar para garantir que não enviamos 'undefined' para o MySQL.
 * O driver mysql2 exige null para campos vazios.
 */
const clean = (val, fallback = null) => (val === undefined ? fallback : val);

/**
 * Gera um PIN alfanumérico de 6 caracteres (sem zeros ou 'O' para evitar confusão)
 */
const gerarNovoPin = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pin = '';
    for (let i = 0; i < 6; i++) {
        pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
};

class SessionController {
    
    // 1. Listar sessões com filtros e paginação
    static async listSessions(req, res, next) {
        await withConnection(async (connection) => {
            const { page = 1, limit = 20, provincia = '', distrito = '', estado = '', tipo = '' } = req.query;
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            let queryParams = [];

            if (provincia) { whereClause += ' AND s.provincia = ?'; queryParams.push(provincia); }
            if (distrito) { whereClause += ' AND s.distrito = ?'; queryParams.push(distrito); }
            if (estado) { whereClause += ' AND s.estado = ?'; queryParams.push(estado); }
            if (tipo) { whereClause += ' AND s.tipo = ?'; queryParams.push(tipo); }

            const [sessions] = await connection.execute(
                `SELECT s.*, u.nome AS facilitador_nome FROM sessions s 
                 LEFT JOIN usuarios u ON s.facilitador_id = u.id
                 ${whereClause} ORDER BY s.data DESC LIMIT ? OFFSET ?`,
                [...queryParams, parseInt(limit), offset]
            );

            const [countResult] = await connection.execute(`SELECT COUNT(*) as total FROM sessions s ${whereClause}`, queryParams);

            res.json({ 
                success: true, 
                data: sessions, 
                pagination: { page: parseInt(page), total: countResult[0].total } 
            });
        }).catch(next);
    }

    // 2. Criar nova sessão, Atividades e Perguntas
    static async createSession(req, res, next) {
        await withTransaction(async (connection) => {
            const {
                titulo, descricao, data, horario, duracao, distrito, provincia,
                facilitador_id, tipo, atividades = [], perguntas = [] 
            } = req.body;

            const codigo_pin = gerarNovoPin();

            // Inserir na tabela 'sessions'
            const [sessaoResult] = await connection.execute(
                `INSERT INTO sessions (titulo, descricao, data, horario, duracao, distrito, provincia, facilitador_id, estado, codigo_pin, tipo, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendada', ?, ?, NOW())`,
                [
                    clean(titulo), 
                    clean(descricao, ''), 
                    clean(data), 
                    clean(horario), 
                    clean(duracao, 2), 
                    clean(distrito), 
                    clean(provincia), 
                    clean(facilitador_id, req.user.id), 
                    codigo_pin,
                    clean(tipo, 'presencial')
                ]
            );

            const sessaoId = sessaoResult.insertId;

            // Inserir na tabela 'atividades_classificadas'
            if (atividades && atividades.length > 0) {
                for (const atv of atividades) {
                    await connection.execute(
                        `INSERT INTO atividades_classificadas 
                         (sessao_id, objectivo_estrategico, atividade, descricao, criterios, created_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                        [
                            sessaoId, 
                            clean(atv.objetivoEstrategico, 'OE'), 
                            clean(atv.atividade, 'Atividade'), 
                            clean(atv.descricao, ''), 
                            JSON.stringify({ sessao_id: sessaoId, ...atv.dimensoes })
                        ]
                    );
                }
            }

            // Inserir Perguntas do Teste (Tabela: perguntas_teste)
            if (perguntas && perguntas.length > 0) {
                for (const p of perguntas) {
                    await connection.execute(
                        `INSERT INTO perguntas_teste (sessao_id, pergunta, opcoes_json, resposta_correta, modulo, dificuldade, ativa) 
                         VALUES (?, ?, ?, ?, ?, ?, 1)`,
                        [
                            sessaoId, 
                            clean(p.pergunta, 'Pergunta'), 
                            JSON.stringify(clean(p.opcoes, {})), 
                            clean(p.resposta_correta, 'a').toLowerCase(), 
                            clean(p.modulo, 'Geral'), 
                            clean(p.dificuldade, 'medio')
                        ]
                    );
                }
            }

            res.status(201).json({ success: true, data: { id: sessaoId, codigo_pin } });
        }).catch(next);
    }

    // 3. Buscar uma única sessão detalhada
    static async getSessionById(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            const [sessoes] = await connection.execute(
                `SELECT s.*, u.nome AS facilitador_nome FROM sessions s 
                 LEFT JOIN usuarios u ON s.facilitador_id = u.id WHERE s.id = ?`, 
                [id]
            );

            if (sessoes.length === 0) throw new AppError('Sessão não encontrada', 404);

            const [atividades] = await connection.execute(
                `SELECT * FROM atividades_classificadas WHERE sessao_id = ?`, [id]
            );

            res.json({ success: true, data: { ...sessoes[0], atividades } });
        }).catch(next);
    }

    // 4. Buscar perguntas de uma sessão para o mobile
    static async getSessionQuestions(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;
            const [perguntas] = await connection.execute(
                `SELECT id, pergunta, opcoes_json, resposta_correta, explicacao 
                 FROM perguntas_teste WHERE sessao_id = ? AND ativa = 1`,
                [id]
            );

            const data = perguntas.map(p => ({
                ...p,
                opcoes: JSON.parse(p.opcoes_json) 
            }));

            res.json({ success: true, data });
        }).catch(next);
    }

    // 5. Resultados em tempo real
    static async getLiveResults(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;
            const query = `
                SELECT 
                    ac.id, ac.atividade, ac.objectivo_estrategico,
                    AVG(vu.pontuacao) as media_pontuacao,
                    AVG(vu.prioridade_usuario) as media_prioridade,
                    COUNT(vu.id) as total_votos,
                    GROUP_CONCAT(vu.comentario SEPARATOR '||') as comentarios
                FROM atividades_classificadas ac
                INNER JOIN votos_usuario vu ON ac.id = vu.atividade_id
                WHERE vu.sessao_id = ?
                GROUP BY ac.id
                ORDER BY media_pontuacao DESC`;

            const [results] = await connection.execute(query, [id]);
            
            const data = results.map(r => ({
                ...r,
                media_pontuacao: r.media_pontuacao ? parseFloat(r.media_pontuacao).toFixed(1) : "0.0",
                comentarios: r.comentarios ? r.comentarios.split('||').filter(c => c && c !== 'NULL') : []
            }));

            res.json({ success: true, data });
        }).catch(next);
    }

    // 6. Entrar na Sessão via PIN
    static async joinWithPin(req, res, next) {
        await withTransaction(async (connection) => {
            const { pin } = req.body;
            const usuarioId = req.user.id;

            const [sessoes] = await connection.execute(
                'SELECT id, titulo FROM sessions WHERE codigo_pin = ? AND estado != "finalizada"',
                [pin.toUpperCase()]
            );

            if (sessoes.length === 0) throw new AppError('PIN inválido ou sessão encerrada', 404);

            await connection.execute(
                `INSERT INTO participantes_sessao (sessao_id, usuario_id, status) VALUES (?, ?, 'confirmado')
                 ON DUPLICATE KEY UPDATE status = 'confirmado'`,
                [sessoes[0].id, usuarioId]
            );

            res.json({ success: true, data: { sessao_id: sessoes[0].id, titulo: sessoes[0].titulo } });
        }).catch(next);
    }

    // 7. Submeter Votos
    static async submitVotes(req, res, next) {
        await withTransaction(async (connection) => {
            const { sessao_id, votos } = req.body; 
            const usuario_id = req.user.id;

            for (const voto of votos) {
                await connection.execute(
                    `INSERT INTO votos_usuario 
                     (usuario_id, atividade_id, sessao_id, pontuacao, prioridade_usuario, comentario, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE 
                        pontuacao = VALUES(pontuacao), prioridade_usuario = VALUES(prioridade_usuario),
                        comentario = VALUES(comentario), updated_at = NOW()`,
                    [usuario_id, clean(voto.atividade_id), clean(sessao_id), clean(voto.pontuacao, 0), clean(voto.prioridade), clean(voto.comentario)]
                );
            }
            res.json({ success: true, message: 'Votos processados' });
        }).catch(next);
    }

    // 8. Atualizar Sessão
    static async updateSession(req, res, next) {
        await withTransaction(async (connection) => {
            const { id } = req.params;
            const { titulo, descricao, estado, data, horario } = req.body;

            await connection.execute(
                `UPDATE sessions SET titulo = COALESCE(?, titulo), descricao = COALESCE(?, descricao), 
                 estado = COALESCE(?, estado), data = COALESCE(?, data), horario = COALESCE(?, horario), updated_at = NOW()
                 WHERE id = ?`,
                [clean(titulo), clean(descricao), clean(estado), clean(data), clean(horario), id]
            );

            res.json({ success: true, message: 'Sessão atualizada' });
        }).catch(next);
    }

    // 9. Eliminar Sessão
    static async deleteSession(req, res, next) {
        await withTransaction(async (connection) => {
            const { id } = req.params;
            await connection.execute(`DELETE FROM votos_usuario WHERE sessao_id = ?`, [id]);
            await connection.execute(`DELETE FROM participantes_sessao WHERE sessao_id = ?`, [id]);
            await connection.execute(`DELETE FROM perguntas_teste WHERE sessao_id = ?`, [id]);
            await connection.execute(`DELETE FROM atividades_classificadas WHERE sessao_id = ?`, [id]);
            const [result] = await connection.execute(`DELETE FROM sessions WHERE id = ?`, [id]);

            if (result.affectedRows === 0) throw new AppError('Sessão não encontrada', 404);
            res.json({ success: true, message: 'Sessão eliminada' });
        }).catch(next);
    }

    // 10. Atualizar Progresso e Teste
    static async updateProgress(req, res, next) {
        await withConnection(async (connection) => {
            const { sessao_id, progresso } = req.body;
            await connection.execute(
                `UPDATE participantes_sessao SET progresso_treinamento = ? WHERE sessao_id = ? AND usuario_id = ?`,
                [clean(progresso, 0), clean(sessao_id), req.user.id]
            );
            res.json({ success: true });
        }).catch(next);
    }

  static async submitTest(req, res, next) {
    await withConnection(async (connection) => {
        const { sessao_id, respostas } = req.body; // Frontend envia o array de respostas
        const usuario_id = req.user.id;

        // 1. Buscar as respostas corretas no banco
        const [perguntas] = await connection.execute(
            'SELECT id, resposta_correta FROM perguntas_teste WHERE sessao_id = ?', [sessao_id]
        );

        // 2. Calcular nota
        let acertos = 0;
        respostas.forEach(r => {
            const p = perguntas.find(item => item.id === r.pergunta_id);
            if (p && p.resposta_correta === r.resposta_usuario) acertos++;
        });

        const percentual = (acertos / perguntas.length) * 100;
        const aprovado = percentual >= 70 ? 1 : 0;

        // 3. Atualizar status do participante
        await connection.execute(
            `UPDATE participantes_sessao SET teste_realizado = 1, teste_aprovado = ? 
             WHERE sessao_id = ? AND usuario_id = ?`,
            [aprovado, sessao_id, usuario_id]
        );

        res.json({ 
            success: true, 
            aprovado: !!aprovado, 
            acertos, 
            total: perguntas.length 
        });
    }).catch(next);
}
}

module.exports = SessionController;
