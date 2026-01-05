const express = require('express');
const router = express.Router();
// Importamos o módulo de conexão com o banco
const db = require('../config/database'); 
// Importamos o middleware de forma segura
const auth = require('../middleware/auth');

// ✅ Validação robusta dos middlewares
const authenticateToken = typeof auth === 'function' ? auth : auth.authenticateToken;
const requireRole = auth.requireRole;

if (!requireRole) {
    console.error('❌ ERRO: requireRole não foi encontrado no middleware/auth.js');
}

// Todas as rotas aqui são apenas para admin
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Dashboard administrativo
router.get('/dashboard/estatisticas', async (req, res) => {
    try {
        console.log('📊 Buscando estatísticas administrativas globais');

        // Estatísticas gerais (Aqui o total_sessoes deve retornar 67 se os dados estiverem lá)
        const [usuariosCount] = await db.query('SELECT COUNT(*) as total FROM usuarios');
        const [sessoesCount] = await db.query('SELECT COUNT(*) as total FROM sessions');
        
        // Usamos queries protegidas por TRY/CATCH para tabelas que podem não existir ainda
        let totalAtividades = 0;
        try {
            const [atividades] = await db.query('SELECT COUNT(*) as total FROM atividades_classificadas');
            totalAtividades = atividades[0].total;
        } catch (e) { console.log('Tabela atividades_classificadas não encontrada'); }

        // Sessões por estado
        const [sessoesPorEstado] = await db.query(`
            SELECT estado, COUNT(*) as total 
            FROM sessions 
            GROUP BY estado
        `);

        res.json({
            success: true,
            data: {
                estatisticas_gerais: {
                    total_usuarios: usuariosCount[0].total,
                    total_sessoes: sessoesCount[0].total, // Contabiliza todos os facilitadores
                    total_atividades: totalAtividades
                },
                sessoes_por_estado: sessoesPorEstado,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Erro no dashboard admin:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
