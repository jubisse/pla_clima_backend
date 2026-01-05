const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// ✅ Garante que o middleware seja carregado corretamente independente da exportação
const authenticateToken = typeof authMiddleware === 'function' 
    ? authMiddleware 
    : authMiddleware.authenticateToken;

// Funções Auxiliares
const getMockProgresso = (perfil) => {
    const mocks = { 'admin': 100, 'facilitador': 80, 'coordenador': 60 };
    return mocks[perfil] || 40;
};

// ✅ ROTA DE STATUS
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [users] = await db.query(
            'SELECT id, nome, email, perfil, provincia, distrito FROM usuarios WHERE id = ?', 
            [userId]
        );

        if (!users || users.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const usuario = users[0];
        res.json({
            success: true,
            data: {
                usuario,
                progresso: {
                    progressoPercentual: getMockProgresso(usuario.perfil),
                    modulosConcluidos: 3,
                    totalModulos: 5,
                    testeAprovado: true,
                    votacaoConcluida: false
                }
            }
        });
    } catch (error) {
        console.error('Erro /status:', error);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// ✅ ROTA DE PERFIL
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
        res.json({ success: true, data: users[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
