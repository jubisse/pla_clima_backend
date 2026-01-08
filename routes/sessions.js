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

// ✅ Rota específica para detalhes
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT s.*, u.nome AS facilitador_nome,
            (SELECT COUNT(*) FROM participantes_sessao WHERE sessao_id = s.id) AS total_participantes
            FROM sessions s
            LEFT JOIN usuarios u ON s.facilitador_id = u.id
            WHERE s.id = ?`;
        
        const [rows] = await db.query(query, [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Sessão não encontrada' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        logger.error('Erro ao obter sessão', { error: error.message, id });
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// ✅ Atualizar dados/estado da sessão (Faltava esta rota!)
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body; // ex: { estado: 'concluida' }

        // Construir a query dinamicamente com base nos campos enviados
        const keys = Object.keys(updates);
        if (keys.length === 0) return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar' });

        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), id];

        const query = `UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = ?`;
        
        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Sessão não encontrada' });
        }

        res.json({ success: true, message: 'Sessão atualizada com sucesso' });
    } catch (error) {
        logger.error('Erro ao atualizar sessão', { error: error.message, id });
        res.status(500).json({ success: false, message: 'Erro ao atualizar sessão' });
    }
});

// ==================== SISTEMA DE PIN E VOTAÇÃO ====================

router.post('/join-pin', authenticateToken, sessionController.joinWithPin);

// ✅ Rota de Votos (Crítica para o funcionamento do Mobile/Frontend)
router.post('/submit-votes', authenticateToken, sessionController.submitVotes);

// ✅ Resultados Live
router.get('/:id/live-results', authenticateToken, sessionController.getLiveResults);

// ==================== TREINAMENTO E PROGRESSO ====================

router.get('/:id/questions', authenticateToken, sessionController.getSessionQuestions);
router.post('/update-progress', authenticateToken, sessionController.updateProgress);
router.post('/submit-test', authenticateToken, sessionController.submitTest);

// ==================== GESTÃO DE PARTICIPANTES ====================

// ✅ Minhas sessões (Frontend usa: /api/sessions/me/participating)
router.get('/me/participating', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT s.*, ps.status, ps.progresso_treinamento, ps.teste_realizado, ps.teste_aprovado
            FROM sessions s
            JOIN participantes_sessao ps ON s.id = ps.sessao_id
            WHERE ps.usuario_id = ?
            ORDER BY s.data DESC`;
        const [sessoes] = await db.query(query, [req.user.id]);
        res.json({ success: true, data: sessoes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao listar tuas sessões' });
    }
});

// ✅ Listar participantes (Frontend usa: /api/sessions/:id/participants)
// Ajustado de '/participantes' para '/participants' para bater com o SessionService.ts
router.get('/:id/participants', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT ps.*, u.nome, u.email, u.organizacao, u.provincia, u.distrito
            FROM participantes_sessao ps
            JOIN usuarios u ON ps.usuario_id = u.id
            WHERE ps.sessao_id = ?`, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao listar participantes' });
    }
});

router.patch('/:sessaoId/participants/:usuarioId', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        await db.query(
            'UPDATE participantes_sessao SET status = ?, updated_at = NOW() WHERE sessao_id = ? AND usuario_id = ?',
            [status, req.params.sessaoId, req.params.usuarioId]
        );
        res.json({ success: true, message: 'Status atualizado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar status' });
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
