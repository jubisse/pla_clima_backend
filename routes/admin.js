const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { withConnection } = require('../utils/database');
const logger = require('../middleware/logger');

const router = express.Router();

// Todas as rotas aqui são apenas para admin
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Dashboard administrativo
router.get('/dashboard/estatisticas', async (req, res, next) => {
    await withConnection(async (connection) => {
        logger.info('Buscando estatísticas administrativas');

        // Estatísticas gerais
        const [[totalUsuarios]] = await connection.execute('SELECT COUNT(*) as total FROM usuarios');
        const [[totalSessoes]] = await connection.execute('SELECT COUNT(*) as total FROM sessions');
        const [[totalAtividades]] = await connection.execute('SELECT COUNT(*) as total FROM atividades_classificadas');
        const [[totalVotos]] = await connection.execute('SELECT COUNT(*) as total FROM votos_usuario');
        
        // Usuários por perfil
        const [usuariosPorPerfil] = await connection.execute(`
            SELECT perfil, COUNT(*) as total 
            FROM usuarios 
            WHERE ativo = TRUE 
            GROUP BY perfil
        `);

        // Sessões por estado
        const [sessoesPorEstado] = await connection.execute(`
            SELECT estado, COUNT(*) as total 
            FROM sessions 
            GROUP BY estado
        `);

        // Progresso de treinamento
        const [progressoTreinamento] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT p.usuario_id) as usuarios_com_treinamento,
                AVG(progresso) as progresso_medio
            FROM (
                SELECT 
                    usuario_id,
                    COUNT(*) as modulos_concluidos,
                    (SELECT COUNT(*) FROM modulos_aprendizagem WHERE ativo = TRUE) as total_modulos,
                    ROUND((COUNT(*) / (SELECT COUNT(*) FROM modulos_aprendizagem WHERE ativo = TRUE)) * 100) as progresso
                FROM progresso_aprendizagem 
                WHERE concluido = TRUE
                GROUP BY usuario_id
            ) as progresso_usuarios
        `);

        // Aprovações no teste
        const [aprovacoesTeste] = await connection.execute(`
            SELECT 
                COUNT(*) as total_testes,
                SUM(CASE WHEN aprovado = TRUE THEN 1 ELSE 0 END) as total_aprovados,
                AVG(pontuacao) as media_pontuacao
            FROM resultados_teste
        `);

        res.json({
            success: true,
            data: {
                estatisticas_gerais: {
                    total_usuarios: totalUsuarios.total,
                    total_sessoes: totalSessoes.total,
                    total_atividades: totalAtividades.total,
                    total_votos: totalVotos.total
                },
                usuarios_por_perfil: usuariosPorPerfil,
                sessoes_por_estado: sessoesPorEstado,
                progresso_treinamento: progressoTreinamento[0] || {},
                aprovacoes_teste: aprovacoesTeste[0] || {},
                timestamp: new Date().toISOString()
            }
        });
    }).catch(next);
});

// Outras rotas administrativas podem ser adicionadas aqui
router.get('/logs/sistema', (req, res) => {
    // Implementar busca de logs do sistema
    res.json({
        success: true,
        data: {
            message: 'Endpoint de logs do sistema (a implementar)'
        }
    });
});

router.get('/backup/database', (req, res) => {
    // Implementar backup da base de dados
    res.json({
        success: true,
        data: {
            message: 'Endpoint de backup (a implementar)'
        }
    });
});

module.exports = router;