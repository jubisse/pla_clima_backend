const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Obter notificações do usuário
router.get('/', authenticateToken, async (req, res) => {
  try {
    const usuario_id = req.user.id;

    const [notificacoes] = await db.execute(`
      SELECT * FROM notificacoes 
      WHERE usuario_id = ? 
      ORDER BY created_at DESC
      LIMIT 50
    `, [usuario_id]);

    res.json({
      success: true,
      data: notificacoes
    });

  } catch (error) {
    console.error('Erro ao obter notificações:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Marcar notificação como lida
router.put('/:notificacaoId/ler', authenticateToken, async (req, res) => {
  try {
    const { notificacaoId } = req.params;
    const usuario_id = req.user.id;

    // Verificar se a notificação pertence ao usuário
    const [notificacao] = await db.execute(
      'SELECT * FROM notificacoes WHERE id = ? AND usuario_id = ?',
      [notificacaoId, usuario_id]
    );

    if (notificacao.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Notificação não encontrada' 
      });
    }

    await db.execute(
      'UPDATE notificacoes SET lida = 1 WHERE id = ?',
      [notificacaoId]
    );

    res.json({
      success: true,
      message: 'Notificação marcada como lida'
    });

  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Marcar todas como lidas
router.put('/ler-todas', authenticateToken, async (req, res) => {
  try {
    const usuario_id = req.user.id;

    await db.execute(
      'UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0',
      [usuario_id]
    );

    res.json({
      success: true,
      message: 'Todas as notificações marcadas como lidas'
    });

  } catch (error) {
    console.error('Erro ao marcar todas como lidas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Obter contador de notificações não lidas
router.get('/contador', authenticateToken, async (req, res) => {
  try {
    const usuario_id = req.user.id;
    const [rows] = await db.execute(
      'SELECT COUNT(*) as contador FROM notificacoes WHERE usuario_id = ? AND lida = 0',
      [usuario_id]
    );
    res.json({ success: true, contador: rows[0].contador });
  } catch (error) {
    console.error('Erro ao obter contador:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// Criar notificação (para uso interno)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { usuario_id, titulo, mensagem, tipo = 'sistema', link } = req.body;

    // Verificar se o usuário é admin ou facilitador
    if (!['admin', 'facilitador'].includes(req.user.perfil)) {
      return res.status(403).json({ 
        success: false,
        message: 'Apenas administradores e facilitadores podem criar notificações' 
      });
    }

    await db.execute(
      'INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, link) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, titulo, mensagem, tipo, link]
    );

    res.status(201).json({
      success: true,
      message: 'Notificação criada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

module.exports = router;