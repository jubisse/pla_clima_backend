const express = require('express');
const router = express.Router();
const db = require('../config/database');
const sessionController = require('../controllers/sessionController');
const { authenticateToken } = require('../middleware/auth');

// ✅ LOGGER
const logger = {
    error: (message, meta = {}) => {
        const timestamp = new Date().toLocaleString('pt-MZ');
        console.error(`[ERROR-ROUTE] ${timestamp} | ${message}`, meta);
    }
};

// ==================== ROTAS DE SESSÕES ====================

router.get('/', authenticateToken, sessionController.listSessions);
router.post('/', authenticateToken, sessionController.createSession);

// ✅ Detalhes da Sessão (Inclui atividades para a votação)
router.get('/:id', authenticateToken, sessionController.getSessionById);

// Estatísticas para o Dashboard do Facilitador
router.get('/stats/facilitador', authenticateToken, async (req, res) => {
    try {
        const [statsSessoes] = await db.query('SELECT COUNT(*) as total FROM sessions');

        let totalParticipantes = 0;
        try {
            const [resPart] = await db.query('SELECT COUNT(*) as total FROM participantes_sessao');
            totalParticipantes = resPart[0].total;
        } catch (e) { console.log("Tabela participantes_sessao não encontrada."); }

        let totalVotos = 0;
        try {
            const [resVotos] = await db.query('SELECT COUNT(*) as total FROM votos_usuario'); 
            totalVotos = resVotos[0].total;
        } catch (e) { console.error("Erro ao aceder à tabela votos_usuario:", e.message); }

        const [sessoesRecentes] = await db.query(`
            SELECT id, titulo, data, status, participantes_previstos 
            FROM sessions 
            ORDER BY data DESC LIMIT 5
        `);

        res.json({ 
            success: true, 
            data: {
                totalSessoes: statsSessoes[0].total || 0,
                totalParticipantes: totalParticipantes,
                taxaParticipacao: totalParticipantes > 0 ? 85 : 0,
                votosRecebidos: totalVotos,
                sessoesRecentes: sessoesRecentes || []
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ✅ Atualizar dados/estado da sessão
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const keys = Object.keys(updates);
        if (keys.length === 0) return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar' });

        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), id];

        const [result] = await db.query(`UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = ?`, values);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Sessão não encontrada' });

        res.json({ success: true, message: 'Sessão atualizada' });
    } catch (error) {
        logger.error('Erro ao atualizar sessão', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// ==================== TREINAMENTO E PROGRESSO (NOVO) ====================

// ✅ Conteúdo educativo (Vídeos, Textos, Imagens)
router.get('/:id/content', authenticateToken, sessionController.getSessionContent);

// ✅ Questões do Teste de Conhecimento
router.get('/:id/questions', authenticateToken, sessionController.getSessionQuestions);

// ✅ Atualizar progresso (0-100%)
router.post('/update-progress', authenticateToken, sessionController.updateProgress);

// ✅ Submeter respostas do teste
router.post('/submit-test', authenticateToken, sessionController.submitTest);

// ==================== SISTEMA DE VOTAÇÃO ====================

router.post('/join-pin', authenticateToken, sessionController.joinWithPin);
router.post('/submit-votes', authenticateToken, sessionController.submitVotes);
router.get('/:id/live-results', authenticateToken, sessionController.getLiveResults);

// ==================== GESTÃO DE PARTICIPANTES ====================

router.get('/me/participating', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT s.*, ps.status as p_status, ps.progresso_treinamento, ps.teste_realizado, ps.teste_aprovado
            FROM sessions s
            JOIN participantes_sessao ps ON s.id = ps.sessao_id
            WHERE ps.usuario_id = ?
            ORDER BY s.data DESC`;
        const [sessoes] = await db.query(query, [req.user.id]);
        res.json({ success: true, data: sessoes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao listar sessões' });
    }
});

router.get('/:id/participants', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT ps.*, u.nome, u.email, u.organizacao, u.provincia, u.distrito
            FROM participantes_sessao ps
            JOIN usuarios u ON ps.usuario_id = u.id
            WHERE ps.sessao_id = ?`, [req.params.id]);

        const formatados = rows.map(row => ({
            ...row,
            usuario: { nome: row.nome, email: row.email, organizacao: row.organizacao }
        }));
        res.json({ success: true, data: formatados });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao listar participantes' });
    }
});

router.delete('/:sessaoId/participants/:usuarioId', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?', 
            [req.params.sessaoId, req.params.usuarioId]);
        res.json({ success: true, message: 'Participante removido' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover' });
    }
});

module.exports = router;
