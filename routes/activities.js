// routes/activities.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Middleware de autenticação (se necessário)
const authMiddleware = require('../middleware/authMiddleware');

// Rota para atividades recentes
router.get('/atividades-recentes', authMiddleware, async (req, res) => {
  try {
    const { scope = 'participante', limit = 6 } = req.query;
    const userId = req.user.id;
    
    console.log(`📊 Buscando atividades recentes para ${scope}, limit: ${limit}`);
    
    let atividades = [];
    
    if (scope === 'participante') {
      // Buscar sessões recentes do participante
      const [sessoes] = await db.execute(`
        SELECT 
          s.id,
          s.titulo,
          s.descricao,
          s.data,
          s.horario,
          s.estado,
          s.tipo,
          s.distrito,
          s.provincia,
          ps.status as inscricao_status,
          ps.data_inscricao,
          'sessao' as tipo_atividade
        FROM sessoes s
        INNER JOIN participantes_sessao ps ON s.id = ps.sessao_id
        WHERE ps.usuario_id = ?
        ORDER BY s.data DESC, s.horario DESC
        LIMIT ?
      `, [userId, parseInt(limit)]);
      
      atividades = sessoes;
    } else if (scope === 'facilitador') {
      // Buscar sessões do facilitador
      const [sessoes] = await db.execute(`
        SELECT 
          id,
          titulo,
          descricao,
          data,
          horario,
          estado,
          tipo,
          distrito,
          provincia,
          created_at as data_criacao,
          'sessao' as tipo_atividade
        FROM sessoes
        WHERE facilitador_id = ?
        ORDER BY data DESC, horario DESC
        LIMIT ?
      `, [userId, parseInt(limit)]);
      
      atividades = sessoes;
    }
    
    res.json({
      success: true,
      atividades,
      count: atividades.length,
      scope,
      limit: parseInt(limit)
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar atividades recentes:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar atividades'
    });
  }
});

module.exports = router;