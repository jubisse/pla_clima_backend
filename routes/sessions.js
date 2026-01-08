const express = require('express');
const router = express.Router();
const db = require('../config/database');
const sessionController = require('../controllers/SessionController');
const { authenticateToken } = require('../middleware/auth');

// ✅ LOGGER INTERNO PARA AS ROTAS
const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toLocaleString('pt-MZ');
        console.log(`[SESSIONS-ROUTE] ${timestamp} | ${message}`, meta);
    },
    error: (message, meta = {}) => {
        const timestamp = new Date().toLocaleString('pt-MZ');
        console.error(`[ERROR-ROUTE] ${timestamp} | ${message}`, meta);
    }
};

// ==================== ROTAS DE GESTÃO DE SESSÕES ====================

// 1. Listar sessões (com filtros e paginação)
router.get('/', authenticateToken, sessionController.listSessions);

// 2. Criar nova sessão (Gera PIN automaticamente)
router.post('/', authenticateToken, sessionController.createSession);

// 3. Obter detalhes de uma sessão específica
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [session] = await db.query(`
            SELECT s.*, u.nome as facilitador_nome 
            FROM sessions s 
            LEFT JOIN usuarios u ON s.facilitador_id = u.id 
            WHERE s.id = ?`, [req.params.id]);
        
        if (!session.length) return res.status(404).json({ success: false, message: 'Sessão não encontrada' });
        res.json({ success: true, data: session[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ROTAS DE PARTICIPANTES E PIN ====================

// 4. Entrar numa sessão usando o PIN
router.post('/join', authenticateToken, sessionController.joinWithPin);

// 5. Atualizar progresso de visualização do treinamento
router.post('/progress', authenticateToken, sessionController.updateProgress);

// 6. Submeter resultado do teste (libera votação)
router.post('/submit-test', authenticateToken, sessionController.submitTest);

// 7. Listar sessões onde o utilizador logado é participante
router.get('/me/participating', authenticateToken, async (req, res) => {
    try {
        const [sessoes] = await db.query(`
            SELECT s.*, ps.status, ps.progresso_treinamento, ps.teste_realizado
            FROM sessions s
            JOIN participantes_sessao ps ON s.id = ps.sessao_id
            WHERE ps.usuario_id = ?`, [req.user.id]);
        res.json({ success: true, data: sessoes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ROTAS DE ADMINISTRAÇÃO DA SESSÃO ====================

// 8. Listar todos os participantes de uma sessão específica
router.get('/:id/participantes', authenticateToken, async (req, res) => {
    try {
        const [participantes] = await db.query(`
            SELECT ps.*, u.nome, u.email, u.organizacao
            FROM participantes_sessao ps
            JOIN usuarios u ON ps.usuario_id = u.id
            WHERE ps.sessao_id = ?`, [req.params.id]);
        res.json({ success: true, data: participantes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 9. Atualizar status de um participante (Confirmar/Cancelar)
router.patch('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        await db.query(
            'UPDATE participantes_sessao SET status = ? WHERE sessao_id = ? AND usuario_id = ?',
            [status, req.params.sessaoId, req.params.usuarioId]
        );
        res.json({ success: true, message: 'Status atualizado' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 10. Remover participante da sessão
router.delete('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
    try {
        await db.query(
            'DELETE FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?',
            [req.params.sessaoId, req.params.usuarioId]
        );
        res.json({ success: true, message: 'Participante removido' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 11. Obter resultados da votação da sessão
router.get('/:id/results', authenticateToken, sessionController.getSessionResults);

module.exports = router;
