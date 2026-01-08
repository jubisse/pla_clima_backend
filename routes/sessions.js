const express = require('express');
const router = express.Router();
const db = require('../config/database');
const sessionController = require('../controllers/sessionController');
const { authenticateToken } = require('../middleware/auth');

// ✅ LOGGER ROBUSTO INTEGRADO
const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toLocaleString('pt-MZ');
        console.log(`[SESSIONS-ROUTE] ${timestamp} | ${message}`, meta);
    },
    error: (message, meta = {}) => {
        const timestamp = new Date().toLocaleString('pt-MZ');
        console.error(`[ERROR-ROUTE] ${timestamp} | ${message}`, meta);
    },
    debug: (message, meta = {}) => {
        if (process.env.NODE_ENV === 'development') {
            const timestamp = new Date().toLocaleString('pt-MZ');
            console.log(`[DEBUG] ${timestamp} | ${message}`, meta);
        }
    }
};

// ==================== ROTAS DE SESSÕES (OPERACIONAIS) ====================

// ✅ LISTAR SESSÕES
router.get('/', authenticateToken, sessionController.listSessions);

// ✅ CRIAR NOVA SESSÃO (Processa Atividades e Perguntas do Teste)
router.post('/', authenticateToken, sessionController.createSession);

// ✅ OBTER SESSÃO ESPECÍFICA
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
        res.status(500).json({ success: false, message: 'Erro interno ao buscar sessão' });
    }
});

// ==================== SISTEMA DE PIN, TREINAMENTO E TESTE ====================

// ✅ ENTRAR NA SESSÃO VIA PIN
router.post('/join-pin', authenticateToken, sessionController.joinWithPin);

// ✅ BUSCAR PERGUNTAS DO TESTE (Dinâmicas da tabela perguntas_teste)
// Esta rota alimenta o componente TesteConhecimento.tsx no Frontend
router.get('/:id/questions', authenticateToken, sessionController.getSessionQuestions);

// ✅ ATUALIZAR PROGRESSO DE TREINAMENTO
router.post('/update-progress', authenticateToken, sessionController.updateProgress);

// ✅ SUBMETER TESTE (Valida a aprovação)
router.post('/submit-test', authenticateToken, sessionController.submitTest);

// ==================== GESTÃO DE PARTICIPANTES ====================

// ✅ LISTAR SESSÕES DO UTILIZADOR LOGADO
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
        logger.error('Erro ao buscar sessões do participante', { error: error.message });
        res.status(500).json({ success: false, message: 'Erro ao listar tuas sessões' });
    }
});

// ✅ LISTAR TODOS OS PARTICIPANTES DE UMA SESSÃO
router.get('/:id/participantes', authenticateToken, async (req, res) => {
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

// ✅ ATUALIZAR STATUS DO PARTICIPANTE
router.patch('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        await db.query(
            'UPDATE participantes_sessao SET status = ?, updated_at = NOW() WHERE sessao_id = ? AND usuario_id = ?',
            [status, req.params.sessaoId, req.params.usuarioId]
        );
        res.json({ success: true, message: 'Status do participante atualizado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar status' });
    }
});

// ✅ REMOVER PARTICIPANTE
router.delete('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?', 
            [req.params.sessaoId, req.params.usuarioId]);
        res.json({ success: true, message: 'Participante removido com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover participante' });
    }
});

// ==================== RESULTADOS E HEALTH CHECK ====================

// ✅ OBTER RESULTADOS DA VOTAÇÃO
router.get('/:id/results', authenticateToken, sessionController.getSessionResults);

// ✅ HEALTH CHECK
router.get('/status/health', async (req, res) => {
    res.json({ status: 'OK', service: 'Sessions API', timestamp: new Date() });
});

module.exports = router;
