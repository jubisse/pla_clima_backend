const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class SessionController {
    // Listar sessões com paginação e filtros
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

            if (provincia) {
                whereClause += ' AND s.provincia = ?';
                queryParams.push(provincia);
            }

            if (distrito) {
                whereClause += ' AND s.distrito = ?';
                queryParams.push(distrito);
            }

            if (estado) {
                whereClause += ' AND s.estado = ?';
                queryParams.push(estado);
            }

            if (tipo) {
                whereClause += ' AND s.tipo = ?';
                queryParams.push(tipo);
            }

            const [sessions] = await connection.execute(
                `SELECT 
                    s.id, s.titulo, s.descricao, s.data, s.horario, s.duracao,
                    s.distrito, s.provincia, s.tipo, s.estado, s.created_at,
                    u.nome AS facilitador_nome,
                    s.participantes_previstos,
                    s.participantes_confirmados,
                    (
                        SELECT COUNT(*) 
                        FROM atividades_classificadas ac 
                        WHERE JSON_EXTRACT(ac.criterios, '$.sessao_id') = s.id
                    ) AS total_atividades
                FROM sessions s
                LEFT JOIN usuarios u ON s.facilitador_id = u.id
                ${whereClause}
                ORDER BY s.data DESC, s.created_at DESC
                LIMIT ? OFFSET ?`,
                [...queryParams, parseInt(limit), offset]
            );

            // Contar total
            const [countResult] = await connection.execute(
                `SELECT COUNT(*) as total FROM sessions s ${whereClause}`,
                queryParams
            );

            const total = countResult[0].total;

            logger.info('Sessões listadas', { total, page });

            res.json({
                success: true,
                data: sessions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        }).catch(next);
    }

    // Obter sessão específica
    static async getSession(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            logger.info('Buscando sessão específica', { sessionId: id });

            const [sessions] = await connection.execute(
                `SELECT 
                    s.*,
                    u.nome as facilitador_nome,
                    u.email as facilitador_email
                FROM sessions s
                LEFT JOIN usuarios u ON s.facilitador_id = u.id
                WHERE s.id = ?`,
                [id]
            );

            if (sessions.length === 0) {
                throw new AppError('Sessão não encontrada', 404);
            }

            res.json({
                success: true,
                data: sessions[0]
            });
        }).catch(next);
    }

    // Criar nova sessão
    static async createSession(req, res, next) {
        await withTransaction(async (connection) => {
            const {
                titulo,
                descricao,
                data,
                horario,
                duracao,
                distrito,
                provincia,
                facilitador_id,
                participantes_previstos,
                tipo,
                localizacao,
                link_virtual,
                observacoes,
                atividades = []
            } = req.body;

            logger.info('Criando nova sessão', { 
                titulo, 
                facilitador_id: facilitador_id || req.user.id,
                atividadesCount: atividades.length 
            });

            // Inserir sessão
            const [sessaoResult] = await connection.execute(
                `INSERT INTO sessions (
                    titulo, descricao, data, horario, duracao, distrito, provincia,
                    facilitador_id, participantes_previstos, tipo, localizacao,
                    link_virtual, observacoes, estado, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendada', NOW())`,
                [
                    titulo,
                    descricao || '',
                    data,
                    horario,
                    duracao || 2,
                    distrito,
                    provincia,
                    facilitador_id || req.user.id,
                    participantes_previstos || 20,
                    tipo || 'presencial',
                    localizacao || '',
                    link_virtual || '',
                    observacoes || ''
                ]
            );

            const sessaoId = sessaoResult.insertId;

            // Inserir atividades se fornecidas
            if (atividades && atividades.length > 0) {
                logger.info(`Inserindo ${atividades.length} atividades para sessão ${sessaoId}`);
                
                for (let i = 0; i < atividades.length; i++) {
                    const atividade = atividades[i];
                    
                    await connection.execute(
                        `INSERT INTO atividades_classificadas (
                            objectivo_estrategico, atividade, descricao, criterios,
                            prioridade, tempo_impacto, capex, risco_maladaptacao, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                        [
                            atividade.objetivoEstrategico || 'OE - Não definido',
                            atividade.atividade,
                            atividade.descricao || '',
                            JSON.stringify({
                                indicadoresSelecionados: atividade.indicadoresSelecionados || [],
                                sessao_id: sessaoId
                            }),
                            atividade.prioridade || 'Média',
                            atividade.tempo_impacto || 'Médio',
                            atividade.capex || 'Médio',
                            atividade.risco_maladaptacao || 'Baixo'
                        ]
                    );
                }
            }

            // Buscar sessão criada com join
            const [sessoes] = await connection.execute(
                `SELECT 
                    s.*,
                    u.nome as facilitador_nome
                 FROM sessions s
                 LEFT JOIN usuarios u ON s.facilitador_id = u.id
                 WHERE s.id = ?`,
                [sessaoId]
            );

            const sessaoCriada = sessoes[0];

            logger.info('Sessão criada com sucesso', { 
                id: sessaoCriada.id, 
                titulo: sessaoCriada.titulo,
                estado: sessaoCriada.estado 
            });

            res.status(201).json({
                success: true,
                message: `Sessão criada com ${atividades.length} atividades`,
                data: sessaoCriada
            });
        }).catch(next);
    }

    // Atualizar sessão
    static async updateSession(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;
            const updates = req.body;

            logger.info('Atualizando sessão', { sessionId: id, updates: Object.keys(updates) });

            // Remover campos que não devem ser atualizados
            delete updates.id;
            delete updates.created_at;
            delete updates.facilitador_nome;

            if (Object.keys(updates).length === 0) {
                throw new AppError('Nenhum campo para atualizar', 400);
            }

            const setClause = Object.keys(updates)
                .map(key => `${key} = ?`)
                .join(', ');
            const values = [...Object.values(updates), id];

            const [result] = await connection.execute(
                `UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = ?`,
                values
            );

            if (result.affectedRows === 0) {
                throw new AppError('Sessão não encontrada', 404);
            }

            // Buscar sessão atualizada
            const [updatedSessao] = await connection.execute(
                'SELECT * FROM sessions WHERE id = ?',
                [id]
            );

            res.json({
                success: true,
                message: 'Sessão atualizada com sucesso',
                data: updatedSessao[0]
            });
        }).catch(next);
    }

    // Excluir sessão
    static async deleteSession(req, res, next) {
        await withTransaction(async (connection) => {
            const { id } = req.params;

            logger.info('Excluindo sessão', { sessionId: id });

            // Verificar se existem atividades associadas
            const [atividades] = await connection.execute(
                `SELECT COUNT(*) as total 
                 FROM atividades_classificadas 
                 WHERE JSON_EXTRACT(criterios, '$.sessao_id') = ?`,
                [id]
            );

            if (atividades[0].total > 0) {
                // Opcional: excluir atividades associadas ou lançar erro
                await connection.execute(
                    `DELETE FROM atividades_classificadas 
                     WHERE JSON_EXTRACT(criterios, '$.sessao_id') = ?`,
                    [id]
                );
                logger.info(`${atividades[0].total} atividades excluídas da sessão ${id}`);
            }

            const [result] = await connection.execute(
                'DELETE FROM sessions WHERE id = ?',
                [id]
            );

            if (result.affectedRows === 0) {
                throw new AppError('Sessão não encontrada', 404);
            }

            logger.info('Sessão excluída com sucesso', { sessionId: id });

            res.json({
                success: true,
                message: 'Sessão excluída com sucesso'
            });
        }).catch(next);
    }

    // Obter atividades da sessão
    static async getSessionActivities(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            logger.info('Buscando atividades da sessão', { sessionId: id });

            const [atividades] = await connection.execute(
                `SELECT 
                    ac.*
                 FROM atividades_classificadas ac
                 WHERE JSON_EXTRACT(ac.criterios, '$.sessao_id') = ?
                 ORDER BY ac.created_at`,
                [id]
            );

            // Processar critérios JSON
            const atividadesProcessadas = atividades.map(atividade => {
                let criterios = {};
                try {
                    if (typeof atividade.criterios === 'string') {
                        criterios = JSON.parse(atividade.criterios);
                    } else {
                        criterios = atividade.criterios;
                    }
                } catch (error) {
                    logger.error('Erro ao parsear critérios:', error);
                    criterios = { sessao_id: id, indicadoresSelecionados: [] };
                }

                return {
                    ...atividade,
                    criterios: criterios
                };
            });

            res.json({
                success: true,
                data: atividadesProcessadas,
                total: atividadesProcessadas.length
            });
        }).catch(next);
    }

    // Obter resultados da sessão
    static async getSessionResults(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;

            logger.info('Buscando resultados da sessão', { sessionId: id });

            // Buscar a sessão
            const [sessoes] = await connection.execute(
                'SELECT id, titulo, descricao, data, provincia, distrito FROM sessions WHERE id = ?',
                [id]
            );

            if (sessoes.length === 0) {
                throw new AppError('Sessão não encontrada', 404);
            }

            const sessao = sessoes[0];

            // Buscar atividades da sessão com estatísticas de votação
            const [atividades] = await connection.execute(
                `SELECT 
                    ac.id,
                    ac.objectivo_estrategico,
                    ac.atividade,
                    ac.descricao,
                    ac.criterios,
                    ac.prioridade,
                    ac.tempo_impacto,
                    ac.capex,
                    ac.risco_maladaptacao,
                    COUNT(vu.id) as total_votos,
                    AVG(vu.pontuacao) as media_pontuacao,
                    AVG(vu.prioridade_usuario) as media_prioridade
                FROM atividades_classificadas ac
                LEFT JOIN votos_usuario vu ON ac.id = vu.atividade_id
                WHERE JSON_EXTRACT(ac.criterios, '$.sessao_id') = ?
                GROUP BY ac.id
                ORDER BY media_pontuacao DESC`,
                [id]
            );

            // Processar atividades
            const atividadesProcessadas = atividades.map(atividade => {
                let criterios;
                try {
                    if (typeof atividade.criterios === 'string') {
                        criterios = JSON.parse(atividade.criterios);
                    } else {
                        criterios = atividade.criterios;
                    }
                } catch (error) {
                    criterios = {};
                }

                return {
                    ...atividade,
                    criterios: criterios,
                    media_pontuacao: atividade.media_pontuacao ? parseFloat(atividade.media_pontuacao) : 0,
                    media_prioridade: atividade.media_prioridade ? parseFloat(atividade.media_prioridade) : 0
                };
            });

            // Estatísticas gerais
            const estatisticas = {
                total_atividades: atividadesProcessadas.length,
                total_votos: atividadesProcessadas.reduce((sum, a) => sum + a.total_votos, 0),
                media_geral: atividadesProcessadas.length > 0 
                    ? atividadesProcessadas.reduce((sum, a) => sum + a.media_pontuacao, 0) / atividadesProcessadas.length 
                    : 0
            };

            res.json({
                success: true,
                data: {
                    sessao,
                    estatisticas,
                    atividades: atividadesProcessadas
                }
            });
        }).catch(next);
    }
}

module.exports = SessionController;