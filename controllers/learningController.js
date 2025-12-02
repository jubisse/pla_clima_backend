const { withConnection, withTransaction } = require('../utils/database');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class LearningController {
    // Obter todos os módulos
    static async getModules(req, res, next) {
        await withConnection(async (connection) => {
            const usuarioId = req.user.id;

            logger.info('Buscando módulos de aprendizagem', { usuarioId });

            const [modulos] = await connection.execute(
                `SELECT 
                    m.*,
                    COALESCE(p.concluido, FALSE) as concluido,
                    p.atualizado_em as data_conclusao
                FROM modulos_aprendizagem m
                LEFT JOIN progresso_aprendizagem p ON m.id = p.modulo_id AND p.usuario_id = ?
                WHERE m.ativo = TRUE
                ORDER BY m.ordem, m.id`,
                [usuarioId]
            );

            // Calcular progresso geral
            const totalModulos = modulos.length;
            const modulosConcluidos = modulos.filter(m => m.concluido).length;
            const progressoPercentual = totalModulos > 0 
                ? Math.round((modulosConcluidos / totalModulos) * 100) 
                : 0;

            res.json({
                success: true,
                data: {
                    modulos,
                    progresso: {
                        total: totalModulos,
                        concluidos: modulosConcluidos,
                        percentual: progressoPercentual
                    }
                }
            });
        }).catch(next);
    }

    // Atualizar progresso do módulo
    static async updateModuleProgress(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;
            const { concluido } = req.body;
            const usuarioId = req.user.id;

            logger.info('Atualizando progresso do módulo', { 
                usuarioId, 
                moduloId: id, 
                concluido 
            });

            // Verificar se o módulo existe
            const [moduloExiste] = await connection.execute(
                'SELECT id, titulo FROM modulos_aprendizagem WHERE id = ? AND ativo = TRUE',
                [id]
            );

            if (moduloExiste.length === 0) {
                throw new AppError('Módulo não encontrado', 404);
            }

            // Inserir ou atualizar progresso
            await connection.execute(
                `INSERT INTO progresso_aprendizagem (usuario_id, modulo_id, concluido, atualizado_em)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                 concluido = VALUES(concluido),
                 atualizado_em = NOW()`,
                [usuarioId, id, concluido === true]
            );

            // Calcular progresso total atualizado
            const [[progresso]] = await connection.execute(
                `SELECT 
                    COUNT(*) as total_modulos,
                    SUM(CASE WHEN p.concluido = TRUE THEN 1 ELSE 0 END) as concluidos
                FROM modulos_aprendizagem m
                LEFT JOIN progresso_aprendizagem p 
                  ON m.id = p.modulo_id AND p.usuario_id = ?
                WHERE m.ativo = TRUE`,
                [usuarioId]
            );

            const percentagem = progresso.total_modulos > 0
                ? Math.round((progresso.concluidos / progresso.total_modulos) * 100)
                : 0;

            logger.info('Progresso do módulo atualizado com sucesso', { 
                usuarioId, 
                moduloId: id, 
                progresso: percentagem 
            });

            res.json({
                success: true,
                message: `Progresso atualizado no módulo ${id}`,
                data: {
                    modulo_id: parseInt(id),
                    concluido: concluido === true,
                    total_modulos: progresso.total_modulos,
                    concluidos: progresso.concluidos,
                    progresso_percentual: percentagem
                }
            });
        }).catch(next);
    }

    // Obter perguntas do teste
    static async getTestQuestions(req, res, next) {
        await withConnection(async (connection) => {
            logger.info('Buscando perguntas do teste');

            const [perguntas] = await connection.execute(`
                SELECT id, pergunta, opcoes_json, resposta_correta, modulo, explicacao
                FROM perguntas_teste
                WHERE ativa = TRUE
                ORDER BY modulo, id ASC
            `);

            // Processar opções JSON
            const perguntasProcessadas = perguntas.map(pergunta => {
                let opcoes;
                try {
                    if (!pergunta.opcoes_json) {
                        opcoes = { a: 'Não definido', b: 'Não definido', c: 'Não definido', d: 'Não definido' };
                    } else if (typeof pergunta.opcoes_json === 'string') {
                        opcoes = JSON.parse(pergunta.opcoes_json);
                    } else {
                        opcoes = pergunta.opcoes_json;
                    }
                } catch (error) {
                    logger.error('Erro ao parsear opções JSON:', error);
                    opcoes = { a: 'Erro', b: 'Erro', c: 'Erro', d: 'Erro' };
                }

                return {
                    id: pergunta.id,
                    pergunta: pergunta.pergunta,
                    modulo: pergunta.modulo,
                    opcoes: opcoes,
                    resposta_correta: pergunta.resposta_correta,
                    explicacao: pergunta.explicacao || ''
                };
            });

            // Agrupar por módulo
            const perguntasPorModulo = perguntasProcessadas.reduce((acc, pergunta) => {
                if (!acc[pergunta.modulo]) {
                    acc[pergunta.modulo] = [];
                }
                acc[pergunta.modulo].push(pergunta);
                return acc;
            }, {});

            logger.info(`Retornando ${perguntasProcessadas.length} perguntas do teste`);

            res.json({
                success: true,
                data: {
                    perguntas: perguntasProcessadas,
                    por_modulo: perguntasPorModulo,
                    total: perguntasProcessadas.length
                }
            });
        }).catch(next);
    }

    // Submeter teste
    static async submitTest(req, res, next) {
        await withTransaction(async (connection) => {
            const { respostas, sessao_id = 1 } = req.body;
            const usuarioId = req.user.id;

            logger.info('Submetendo teste', { usuarioId, totalRespostas: Object.keys(respostas || {}).length });

            if (!respostas) {
                throw new AppError('Respostas são obrigatórias', 400);
            }

            const parsedRespostas = typeof respostas === 'string' ? JSON.parse(respostas) : respostas;

            // Buscar todas as perguntas ativas
            const [perguntas] = await connection.execute(
                `SELECT id, resposta_correta, modulo FROM perguntas_teste WHERE ativa = TRUE`
            );

            if (perguntas.length === 0) {
                throw new AppError('Nenhuma pergunta encontrada', 400);
            }

            let acertos = 0;
            const totalPerguntas = perguntas.length;
            const detalhesRespostas = [];
            const desempenhoPorModulo = {};

            // Calcular resultados
            perguntas.forEach(pergunta => {
                const respostaUsuario = parsedRespostas[pergunta.id];
                const correta = respostaUsuario === pergunta.resposta_correta;

                if (correta) acertos++;

                // Estatísticas por módulo
                if (!desempenhoPorModulo[pergunta.modulo]) {
                    desempenhoPorModulo[pergunta.modulo] = { total: 0, acertos: 0 };
                }
                desempenhoPorModulo[pergunta.modulo].total++;
                if (correta) desempenhoPorModulo[pergunta.modulo].acertos++;

                detalhesRespostas.push({
                    pergunta_id: pergunta.id,
                    resposta_usuario: respostaUsuario,
                    resposta_correta: pergunta.resposta_correta,
                    modulo: pergunta.modulo,
                    correta
                });
            });

            const pontuacao = Math.round((acertos / totalPerguntas) * 100);
            const aprovado = pontuacao >= 75;

            const desempenho = Object.entries(desempenhoPorModulo).map(([modulo, dados]) => ({
                modulo,
                total: dados.total,
                acertos: dados.acertos,
                desempenho: Math.round((dados.acertos / dados.total) * 100)
            }));

            // Salvar resultado no banco
            await connection.execute(
                `INSERT INTO resultados_teste
                 (usuario_id, sessao_id, pontuacao, aprovado, total_perguntas, acertos, detalhes_respostas, data_realizacao)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [usuarioId, sessao_id, pontuacao, aprovado, totalPerguntas, acertos, JSON.stringify(detalhesRespostas)]
            );

            logger.info('Teste submetido e resultado salvo', { 
                usuarioId, 
                pontuacao, 
                aprovado,
                acertos,
                totalPerguntas 
            });

            res.json({
                success: true,
                data: {
                    aprovado,
                    pontuacao,
                    acertos,
                    total: totalPerguntas,
                    detalhes: detalhesRespostas,
                    desempenho,
                    message: aprovado
                        ? 'Parabéns! Você foi aprovado e pode participar da votação.'
                        : `Você acertou ${acertos} de ${totalPerguntas}. É necessário 75% para aprovação.`
                }
            });
        }).catch(next);
    }

    // Obter resultado do teste
    static async getTestResult(req, res, next) {
        await withConnection(async (connection) => {
            const usuarioId = req.user.id;

            logger.info('Buscando resultado do teste', { usuarioId });

            const [resultados] = await connection.execute(
                `SELECT rt.*, s.titulo AS sessao_titulo
                FROM resultados_teste rt
                LEFT JOIN sessions s ON rt.sessao_id = s.id
                WHERE rt.usuario_id = ?
                ORDER BY rt.data_realizacao DESC
                LIMIT 1`,
                [usuarioId]
            );

            if (resultados.length === 0) {
                return res.json({
                    success: true,
                    data: null,
                    message: 'Nenhum teste realizado'
                });
            }

            const resultado = resultados[0];
            
            // Processar detalhes das respostas
            if (typeof resultado.detalhes_respostas === 'string') {
                try {
                    resultado.detalhes_respostas = JSON.parse(resultado.detalhes_respostas);
                } catch {
                    resultado.detalhes_respostas = [];
                }
            }

            logger.info('Resultado do teste encontrado', { 
                usuarioId, 
                pontuacao: resultado.pontuacao,
                aprovado: resultado.aprovado 
            });

            res.json({ 
                success: true, 
                data: resultado 
            });
        }).catch(next);
    }

    // Obter progresso geral do usuário
    static async getUserProgress(req, res, next) {
        await withConnection(async (connection) => {
            const usuarioId = req.user.id;

            // Progresso dos módulos
            const [progressoResult] = await connection.execute(
                `SELECT 
                    COUNT(*) as total_modulos,
                    SUM(CASE WHEN p.concluido = TRUE THEN 1 ELSE 0 END) as modulos_concluidos
                FROM modulos_aprendizagem m
                LEFT JOIN progresso_aprendizagem p ON m.id = p.modulo_id AND p.usuario_id = ?
                WHERE m.ativo = TRUE`,
                [usuarioId]
            );

            // Último resultado do teste
            const [testeResult] = await connection.execute(
                `SELECT aprovado, pontuacao, data_realizacao 
                 FROM resultados_teste 
                 WHERE usuario_id = ? 
                 ORDER BY data_realizacao DESC 
                 LIMIT 1`,
                [usuarioId]
            );

            const progresso = progressoResult[0];
            const percentagemProgresso = progresso.total_modulos > 0 
                ? Math.round((progresso.modulos_concluidos / progresso.total_modulos) * 100)
                : 0;

            res.json({
                success: true,
                data: {
                    modulos: {
                        total: progresso.total_modulos,
                        concluidos: progresso.modulos_concluidos,
                        percentual: percentagemProgresso
                    },
                    teste: testeResult.length > 0 ? testeResult[0] : null,
                    aprovado: testeResult.length > 0 ? testeResult[0].aprovado : false
                }
            });
        }).catch(next);
    }
}

module.exports = LearningController;