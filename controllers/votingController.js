const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class VotingController {
    // Obter atividades para votação
    static async getVotingActivities(req, res, next) {
        await withConnection(async (connection) => {
            const usuarioId = req.user.id;

            logger.info('Buscando atividades para votação', { usuarioId });

            // Dados de exemplo (fallback)
            const atividadesExemplo = [
                {
                    id: 1,
                    objectivo_estrategico: "OE1 - Resiliência agro-pecuária",
                    atividade: "Sensibilizar para construção de diques nas machambas",
                    descricao: "Minimizar alagamentos nas áreas agrícolas através de diques de proteção",
                    criterios: { ADP: 3, RVC: 3, SAH: 3, GRE: 2, SUS: 2 },
                    prioridade: "Alta",
                    tempo_impacto: "Médio",
                    capex: "Alto",
                    risco_maladaptacao: "Baixo"
                },
                {
                    id: 2,
                    objectivo_estrategico: "OE1 - Resiliência agro-pecuária", 
                    atividade: "Adquirir sementes melhoradas tolerantes a estiagens",
                    descricao: "Implementar sementes resistentes à seca para aumentar resiliência agrícola",
                    criterios: { ADP: 3, RVC: 3, SAH: 2, GRE: 2, SUS: 2 },
                    prioridade: "Alta",
                    tempo_impacto: "Curto", 
                    capex: "Baixo",
                    risco_maladaptacao: "Baixo"
                }
            ];

            let atividades = [];

            try {
                const [atividadesRows] = await connection.execute(
                    `SELECT 
                        id,
                        objectivo_estrategico,
                        atividade,
                        descricao,
                        criterios,
                        prioridade,
                        tempo_impacto,
                        capex,
                        risco_maladaptacao
                    FROM atividades_classificadas 
                    WHERE prioridade IN ('Alta', 'Média')
                    ORDER BY 
                        FIELD(prioridade, 'Alta', 'Média'),
                        tempo_impacto ASC
                    LIMIT 10`
                );
                
                if (atividadesRows.length > 0) {
                    atividades = atividadesRows;
                    logger.info(`Encontradas ${atividades.length} atividades na base de dados`);
                } else {
                    atividades = atividadesExemplo;
                    logger.info('Usando dados de exemplo para atividades');
                }
            } catch (dbError) {
                atividades = atividadesExemplo;
                logger.info('Tabela não encontrada, usando dados de exemplo');
            }

            // Buscar votos existentes do usuário
            const votosMap = {};
            try {
                const [votosExistentes] = await connection.execute(
                    `SELECT atividade_id, pontuacao, prioridade_usuario, comentario
                     FROM votos_usuario 
                     WHERE usuario_id = ?`,
                    [usuarioId]
                );

                votosExistentes.forEach(voto => {
                    votosMap[voto.atividade_id] = {
                        pontuacao: voto.pontuacao,
                        prioridade_usuario: voto.prioridade_usuario,
                        comentario: voto.comentario
                    };
                });
                logger.info(`Encontrados ${votosExistentes.length} votos do usuário`);
            } catch (votosError) {
                logger.info('Tabela de votos não encontrada, continuando sem votos...');
            }

            // Processar atividades
            const atividadesProcessadas = atividades.map(atividade => {
                let criterios;
                try {
                    if (typeof atividade.criterios === 'string') {
                        criterios = JSON.parse(atividade.criterios);
                    } else {
                        criterios = atividade.criterios;
                    }
                } catch (parseError) {
                    logger.error('Erro ao parsear critérios, usando padrão');
                    criterios = { ADP: 3, RVC: 3, SAH: 3, GRE: 2, SUS: 2 };
                }

                return {
                    id: atividade.id,
                    objectivo_estrategico: atividade.objectivo_estrategico,
                    atividade: atividade.atividade,
                    descricao: atividade.descricao,
                    criterios: criterios,
                    prioridade: atividade.prioridade,
                    tempo_impacto: atividade.tempo_impacto,
                    capex: atividade.capex,
                    risco_maladaptacao: atividade.risco_maladaptacao,
                    votos: votosMap[atividade.id] || null
                };
            });

            logger.info(`Retornando ${atividadesProcessadas.length} atividades para votação`);

            res.json({
                success: true,
                data: atividadesProcessadas,
                total: atividadesProcessadas.length,
                message: `Carregadas ${atividadesProcessadas.length} atividades para votação`
            });
        }).catch(next);
    }

    // Submeter votos
    static async submitVotes(req, res, next) {
        await withTransaction(async (connection) => {
            const { votos, sessao_id = 1 } = req.body;
            const usuarioId = req.user.id;

            logger.info('Recebendo submissão de votos', {
                usuarioId,
                totalVotos: votos?.length,
                sessao_id
            });

            if (!votos || !Array.isArray(votos)) {
                throw new AppError('Lista de votos é obrigatória e deve ser um array', 400);
            }

            if (votos.length === 0) {
                throw new AppError('Nenhum voto para submeter', 400);
            }

            // Verificar se usuário está aprovado para votar
            try {
                const [resultados] = await connection.execute(
                    `SELECT aprovado FROM resultados_teste 
                     WHERE usuario_id = ? AND aprovado = TRUE 
                     ORDER BY data_realizacao DESC LIMIT 1`,
                    [usuarioId]
                );

                if (resultados.length === 0) {
                    throw new AppError('Usuário não está aprovado para votar. Complete o teste primeiro.', 403);
                }
            } catch (dbError) {
                logger.info('Tabela resultados_teste não encontrada, continuando sem verificação...');
            }

            // Inserir/atualizar cada voto
            for (let i = 0; i < votos.length; i++) {
                const voto = votos[i];
                logger.info(`Processando voto ${i + 1}/${votos.length}:`, voto);

                // Validação do voto individual
                if (!voto.atividade_id || !voto.pontuacao) {
                    throw new AppError(`Voto inválido: ${JSON.stringify(voto)}`, 400);
                }

                if (voto.pontuacao < 1 || voto.pontuacao > 5) {
                    throw new AppError(`Pontuação inválida: ${voto.pontuacao}. Deve ser entre 1 e 5.`, 400);
                }

                const params = [
                    usuarioId,
                    voto.atividade_id,
                    voto.pontuacao,
                    voto.prioridade_usuario || voto.pontuacao * 2,
                    voto.comentario || '',
                    sessao_id
                ];

                // Sanitizar parâmetros
                const safeParams = params.map(param => param === undefined ? null : param);

                await connection.execute(
                    `INSERT INTO votos_usuario 
                     (usuario_id, atividade_id, pontuacao, prioridade_usuario, comentario, sessao_id)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                     pontuacao = VALUES(pontuacao),
                     prioridade_usuario = VALUES(prioridade_usuario),
                     comentario = VALUES(comentario),
                     updated_at = NOW()`,
                    safeParams
                );

                logger.info(`Voto ${i + 1} salvo com sucesso`);
            }

            // Marcar que usuário completou a votação
            try {
                await connection.execute(
                    `INSERT INTO usuario_votacao_status (usuario_id, sessao_id, votacao_concluida)
                     VALUES (?, ?, TRUE)
                     ON DUPLICATE KEY UPDATE 
                     votacao_concluida = TRUE, 
                     data_conclusao = NOW()`,
                    [usuarioId, sessao_id]
                );
            } catch (statusError) {
                logger.info('Tabela usuario_votacao_status não encontrada, ignorando...');
            }

            logger.info(`Votos submetidos com sucesso: ${votos.length} votos do usuário ${usuarioId}`);

            res.json({
                success: true,
                message: 'Votos submetidos com sucesso',
                data: {
                    total_votos: votos.length,
                    sessao_id: sessao_id,
                    usuario_id: usuarioId,
                    timestamp: new Date().toISOString()
                }
            });
        }).catch(next);
    }

    // Obter resultados da votação
    static async getVotingResults(req, res, next) {
        await withConnection(async (connection) => {
            logger.info('Buscando resultados da votação');

            // Estatísticas gerais de votação
            const [estatisticas] = await connection.execute(`
                SELECT 
                    COUNT(DISTINCT usuario_id) as total_participantes,
                    COUNT(*) as total_votos,
                    AVG(pontuacao) as media_geral,
                    MAX(created_at) as ultima_votacao
                FROM votos_usuario
            `);

            // Top atividades por pontuação média
            const [topAtividades] = await connection.execute(`
                SELECT 
                    a.id,
                    a.atividade,
                    a.objectivo_estrategico,
                    a.prioridade,
                    COUNT(v.id) as total_votos,
                    AVG(v.pontuacao) as media_pontuacao,
                    AVG(v.prioridade_usuario) as media_prioridade_usuario
                FROM atividades_classificadas a
                LEFT JOIN votos_usuario v ON a.id = v.atividade_id
                GROUP BY a.id, a.atividade, a.objectivo_estrategico, a.prioridade
                ORDER BY media_pontuacao DESC, total_votos DESC
                LIMIT 10
            `);

            // Distribuição de votos por pontuação
            const [distribuicao] = await connection.execute(`
                SELECT 
                    pontuacao,
                    COUNT(*) as quantidade
                FROM votos_usuario
                GROUP BY pontuacao
                ORDER BY pontuacao
            `);

            logger.info('Resultados da votação recuperados', {
                total_participantes: estatisticas[0]?.total_participantes || 0,
                total_votos: estatisticas[0]?.total_votos || 0
            });

            res.json({
                success: true,
                data: {
                    estatisticas: estatisticas[0] || {},
                    top_atividades: topAtividades,
                    distribuicao_votos: distribuicao,
                    timestamp: new Date().toISOString()
                }
            });
        }).catch(next);
    }

    // Verificar se usuário já votou
    static async checkUserVoted(req, res, next) {
        await withConnection(async (connection) => {
            const usuarioId = req.user.id;

            const [votos] = await connection.execute(
                `SELECT COUNT(*) as total_votos 
                 FROM votos_usuario 
                 WHERE usuario_id = ?`,
                [usuarioId]
            );

            const jaVotou = votos[0].total_votos > 0;

            res.json({
                success: true,
                data: {
                    ja_votou: jaVotou,
                    total_votos: votos[0].total_votos
                }
            });
        }).catch(next);
    }
}

module.exports = VotingController;