const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Função auxiliar para garantir que não enviamos 'undefined' para o MySQL
 */
const clean = (val, fallback = null) => (val === undefined ? fallback : val);

const gerarNovoPin = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pin = '';
    for (let i = 0; i < 6; i++) {
        pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
};

class SessionController {
    
    // 1. Listar sessões
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

    // 2. Criar nova sessão - CORREÇÃO DE PARAMETROS UNDEFINED AQUI
    static async createSession(req, res, next) {
        await withTransaction(async (connection) => {
            const {
                titulo, descricao, data, horario, duracao, distrito, provincia,
                facilitador_id, tipo, atividades = [], perguntas = [] 
            } = req.body;

            const codigo_pin = gerarNovoPin();

            // Inserir Sessão com tratamento de undefined
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

            // Inserir Atividades
            if (atividades && atividades.length > 0) {
                for (const atv of atividades) {
                    await connection.execute(
                        `INSERT INTO atividades_classificadas (objectivo_estrategico, atividade, criterios, created_at) VALUES (?, ?, ?, NOW())`,
                        [
                            clean(atv.objetivoEstrategico), 
                            clean(atv.atividade), 
                            JSON.stringify({ sessao_id: sessaoId })
                        ]
                    );
                }
            }

            // Inserir Perguntas do Teste
            if (perguntas && perguntas.length > 0) {
                for (const p of perguntas) {
                    await connection.execute(
                        `INSERT INTO perguntas_teste (sessao_id, pergunta, opcoes_json, resposta_correta, modulo, dificuldade, ativa) 
                         VALUES (?, ?, ?, ?, ?, ?, 1)`,
                        [
                            sessaoId, 
                            clean(p.pergunta, 'Pergunta sem título'), 
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

    // ... (restante dos métodos getSessionQuestions, getLiveResults, joinWithPin permanecem iguais, 
    // mas com atenção ao clean() em entradas de formulário no submitVotes)

    static async submitVotes(req, res, next) {
        await withTransaction(async (connection) => {
            const { sessao_id, votos } = req.body; 
            const usuario_id = req.user.id;

            if (!votos || !Array.isArray(votos)) throw new AppError('Dados de votação inválidos', 400);

            for (const voto of votos) {
                await connection.execute(
                    `INSERT INTO votos_usuario 
                     (usuario_id, atividade_id, sessao_id, pontuacao, prioridade_usuario, comentario, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE 
                        pontuacao = VALUES(pontuacao), 
                        prioridade_usuario = VALUES(prioridade_usuario),
                        comentario = VALUES(comentario),
                        updated_at = NOW()`,
                    [
                        usuario_id, 
                        clean(voto.atividade_id), 
                        clean(sessao_id, 1), 
                        clean(voto.pontuacao, 0), 
                        clean(voto.prioridade), 
                        clean(voto.comentario)
                    ]
                );
            }
            res.json({ success: true, message: 'Votação registada com sucesso!' });
        }).catch(next);
    }
}

module.exports = SessionController;
