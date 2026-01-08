const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Função auxiliar para gerar PIN de 6 caracteres (sem O, 0, I, 1 para evitar confusão)
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
    
    // 1. Listar sessões com paginação e filtros
    static async listSessions(req, res, next) {
        await withConnection(async (connection) => {
            const { 
                page = 1, 
                limit = 20, 
                provincia = '', 
                distrito = '',
                estado = '',
                tipo = ''
            } = req.query;
            
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            let queryParams = [];

            if (provincia) { whereClause += ' AND s.provincia = ?'; queryParams.push(provincia); }
            if (distrito) { whereClause += ' AND s.distrito = ?'; queryParams.push(distrito); }
            if (estado) { whereClause += ' AND s.estado = ?'; queryParams.push(estado); }
            if (tipo) { whereClause += ' AND s.tipo = ?'; queryParams.push(tipo); }

            const [sessions] = await connection.execute(
                `SELECT s.*, u.nome AS facilitador_nome,
                (SELECT COUNT(*) FROM atividades_classificadas ac WHERE JSON_EXTRACT(ac.criterios, '$.sessao_id') = s.id) AS total_atividades
                FROM sessions s
                LEFT JOIN usuarios u ON s.facilitador_id = u.id
                ${whereClause}
                ORDER BY s.data DESC, s.created_at DESC
                LIMIT ? OFFSET ?`,
                [...queryParams, parseInt(limit), offset]
            );

            const [countResult] = await connection.execute(
                `SELECT COUNT(*) as total FROM sessions s ${whereClause}`,
                queryParams
            );

            res.json({
                success: true,
                data: sessions,
                pagination: { page: parseInt(page), total: countResult[0].total }
            });
        }).catch(next);
    }

    // 2. Criar nova sessão (Gera PIN automaticamente)
    static async createSession(req, res, next) {
        await withTransaction(async (connection) => {
            const {
                titulo, descricao, data, horario, duracao, distrito, provincia,
                facilitador_id, participantes_previstos, tipo, localizacao,
                link_virtual, observacoes, atividades = []
            } = req.body;

            const codigo_pin = gerarNovoPin();

            const [sessaoResult] = await connection.execute(
                `INSERT INTO sessions (
                    titulo, descricao, data, horario, duracao, distrito, provincia,
                    facilitador_id, participantes_previstos, tipo, localizacao,
                    link_virtual, observacoes, estado, codigo_pin, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendada', ?, NOW())`,
                [
                    titulo, descricao || '', data, horario, duracao || 2, distrito, provincia,
                    facilitador_id || req.user.id, participantes_previstos || 20, 
                    tipo || 'presencial', localizacao || '', link_virtual || '', 
                    observacoes || '', codigo_pin
                ]
            );

            const sessaoId = sessaoResult.insertId;

            if (atividades.length > 0) {
                for (const atividade of atividades) {
                    await connection.execute(
                        `INSERT INTO atividades_classificadas (
                            objectivo_estrategico, atividade, descricao, criterios, created_at
                        ) VALUES (?, ?, ?, ?, NOW())`,
                        [
                            atividade.objetivoEstrategico, atividade.atividade, atividade.descricao || '',
                            JSON.stringify({ indicadoresSelecionados: atividade.indicadoresSelecionados || [], sessao_id: sessaoId })
                        ]
                    );
                }
            }

            res.status(201).json({
                success: true,
                message: `Sessão criada com PIN: ${codigo_pin}`,
                data: { id: sessaoId, codigo_pin }
            });
        }).catch(next);
    }

    // 3. Entrar na Sessão via PIN (Cria vínculo na tabela participantes_sessao)
    static async joinWithPin(req, res, next) {
        await withTransaction(async (connection) => {
            const { pin } = req.body;
            const usuarioId = req.user.id;

            const [sessoes] = await connection.execute(
                'SELECT id, titulo FROM sessions WHERE codigo_pin = ? AND estado != "finalizada"',
                [pin.toUpperCase()]
            );

            if (sessoes.length === 0) throw new AppError('PIN inválido ou sessão encerrada', 404);

            const sessaoId = sessoes[0].id;

            // Insere ou atualiza para 'confirmado'
            await connection.execute(
                `INSERT INTO participantes_sessao (sessao_id, usuario_id, status, progresso_treinamento) 
                 VALUES (?, ?, 'confirmado', 0)
                 ON DUPLICATE KEY UPDATE status = 'confirmado'`,
                [sessaoId, usuarioId]
            );

            res.json({ success: true, data: { sessao_id: sessaoId, titulo: sessoes[0].titulo } });
        }).catch(next);
    }

    // 4. Atualizar Progresso de Treinamento
    static async updateProgress(req, res, next) {
        await withConnection(async (connection) => {
            const { sessao_id, progresso } = req.body;
            const usuarioId = req.user.id;

            await connection.execute(
                `UPDATE participantes_sessao SET progresso_treinamento = ? 
                 WHERE sessao_id = ? AND usuario_id = ?`,
                [progresso, sessao_id, usuarioId]
            );

            res.json({ success: true, message: 'Progresso atualizado' });
        }).catch(next);
    }

    // 5. Finalizar Teste (Trava para Votação)
    static async submitTest(req, res, next) {
        await withConnection(async (connection) => {
            const { sessao_id, nota } = req.body;
            const usuarioId = req.user.id;
            const aprovado = nota >= 70 ? 1 : 0;

            await connection.execute(
                `UPDATE participantes_sessao SET 
                 teste_realizado = 1, teste_aprovado = ? 
                 WHERE sessao_id = ? AND usuario_id = ?`,
                [aprovado, sessao_id, usuarioId]
            );

            res.json({ success: true, aprovado: !!aprovado });
        }).catch(next);
    }

    // 6. Obter Resultados e Estatísticas (Votos)
    static async getSessionResults(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            const [atividades] = await connection.execute(
                `SELECT ac.*, COUNT(vu.id) as total_votos, AVG(vu.pontuacao) as media_pontuacao
                FROM atividades_classificadas ac
                LEFT JOIN votos_usuario vu ON ac.id = vu.atividade_id
                WHERE JSON_EXTRACT(ac.criterios, '$.sessao_id') = ?
                GROUP BY ac.id ORDER BY media_pontuacao DESC`,
                [id]
            );

            res.json({ success: true, data: atividades });
        }).catch(next);
    }
}

module.exports = SessionController;
