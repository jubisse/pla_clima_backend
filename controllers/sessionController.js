const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Função auxiliar para gerar PIN de 6 caracteres
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
    
    // 1. Listar sessões (Mantido)
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

            res.json({ success: true, data: sessions, pagination: { page: parseInt(page), total: countResult[0].total } });
        }).catch(next);
    }

    // 2. Criar nova sessão (AGORA GRAVA PERGUNTAS TAMBÉM)
    static async createSession(req, res, next) {
        await withTransaction(async (connection) => {
            const {
                titulo, descricao, data, horario, duracao, distrito, provincia,
                facilitador_id, participantes_previstos, tipo, localizacao,
                link_virtual, observacoes, atividades = [], perguntas = [] 
            } = req.body;

            const codigo_pin = gerarNovoPin();

            // Inserir Sessão
            const [sessaoResult] = await connection.execute(
                `INSERT INTO sessions (titulo, descricao, data, horario, duracao, distrito, provincia, facilitador_id, estado, codigo_pin, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendada', ?, NOW())`,
                [titulo, descricao || '', data, horario, duracao || 2, distrito, provincia, facilitador_id || req.user.id, codigo_pin]
            );

            const sessaoId = sessaoResult.insertId;

            // Inserir Atividades
            if (atividades.length > 0) {
                for (const atv of atividades) {
                    await connection.execute(
                        `INSERT INTO atividades_classificadas (objectivo_estrategico, atividade, criterios, created_at) VALUES (?, ?, ?, NOW())`,
                        [atv.objetivoEstrategico, atv.atividade, JSON.stringify({ sessao_id: sessaoId })]
                    );
                }
            }

            // Inserir Perguntas do Teste (Conforme sua tabela perguntas_teste)
            if (perguntas.length > 0) {
                for (const p of perguntas) {
                    await connection.execute(
                        `INSERT INTO perguntas_teste (sessao_id, pergunta, opcoes_json, resposta_correta, modulo, dificuldade, ativa) 
                         VALUES (?, ?, ?, ?, ?, ?, 1)`,
                        [
                            sessaoId, 
                            p.pergunta, 
                            JSON.stringify(p.opcoes), // 
                            p.resposta_correta.toLowerCase(), // 'a', 'b', 'c' ou 'd' 
                            p.modulo || 'Geral', 
                            p.dificuldade || 'medio'
                        ]
                    );
                }
            }

            res.status(201).json({ success: true, data: { id: sessaoId, codigo_pin } });
        }).catch(next);
    }

    // 3. Buscar perguntas de uma sessão para o participante
    static async getSessionQuestions(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            const [perguntas] = await connection.execute(
                `SELECT id, pergunta, opcoes_json, resposta_correta, explicacao 
                 FROM perguntas_teste WHERE sessao_id = ? AND ativa = 1`,
                [id]
            );

            // Formata o JSON de volta para objeto para o Frontend
            const data = perguntas.map(p => ({
                ...p,
                opcoes: JSON.parse(p.opcoes_json) // 
            }));

            res.json({ success: true, data });
        }).catch(next);
    }

    // 4. Entrar na Sessão via PIN (Mantido)
    static async joinWithPin(req, res, next) {
        await withTransaction(async (connection) => {
            const { pin } = req.body;
            const usuarioId = req.user.id;

            const [sessoes] = await connection.execute(
                'SELECT id, titulo FROM sessions WHERE codigo_pin = ? AND estado != "finalizada"',
                [pin.toUpperCase()]
            );

            if (sessoes.length === 0) throw new AppError('PIN inválido', 404);

            await connection.execute(
                `INSERT INTO participantes_sessao (sessao_id, usuario_id, status) VALUES (?, ?, 'confirmado')
                 ON DUPLICATE KEY UPDATE status = 'confirmado'`,
                [sessoes[0].id, usuarioId]
            );

            res.json({ success: true, data: { sessao_id: sessoes[0].id, titulo: sessoes[0].titulo } });
        }).catch(next);
    }

    // 5. Atualizar Progresso (Mantido)
    static async updateProgress(req, res, next) {
        await withConnection(async (connection) => {
            const { sessao_id, progresso } = req.body;
            await connection.execute(
                `UPDATE participantes_sessao SET progresso_treinamento = ? WHERE sessao_id = ? AND usuario_id = ?`,
                [progresso, sessao_id, req.user.id]
            );
            res.json({ success: true });
        }).catch(next);
    }

    // 6. Submeter Teste
    static async submitTest(req, res, next) {
        await withConnection(async (connection) => {
            const { sessao_id, nota } = req.body;
            const aprovado = nota >= 70 ? 1 : 0;

            await connection.execute(
                `UPDATE participantes_sessao SET teste_realizado = 1, teste_aprovado = ? 
                 WHERE sessao_id = ? AND usuario_id = ?`,
                [aprovado, sessao_id, req.user.id]
            );

            res.json({ success: true, aprovado: !!aprovado });
        }).catch(next);
    }
}

module.exports = SessionController;
