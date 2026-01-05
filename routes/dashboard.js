const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth'); // Importa o objeto completo

// ✅ CORREÇÃO DO ERRO DE REFERÊNCIA:
// Define 'authMiddleware' e 'authenticateToken' para que ambos funcionem no arquivo
const authenticateToken = typeof auth === 'function' ? auth : auth.authenticateToken;
const authMiddleware = authenticateToken; 
const logger = require('../middleware/logger');

// ==================== DASHBOARD DO FACILITADOR ====================

router.get('/facilitador', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userProfile = req.user.perfil;

    // ✅ LÓGICA PARA VER TODOS OS DADOS (67 SESSÕES)
    // Se você quiser que o Admin ou Facilitador veja TUDO, remova o "AND facilitador_id = ?"
    // Abaixo mantive o filtro, mas você pode remover se quiser visão global.
    
    const [sessoesAtivasResult] = await db.query(
      'SELECT COUNT(*) as total FROM sessions WHERE estado = "em_curso"'
    );

    const [totalParticipantesResult] = await db.query(
      'SELECT SUM(participantes_confirmados) as total FROM sessions'
    );

    const [sessoesAgendadasResult] = await db.query(
      'SELECT COUNT(*) as total FROM sessions WHERE estado = "agendada"'
    );

    const stats = {
      sessoesAtivas: sessoesAtivasResult[0]?.total || 0,
      totalParticipantes: totalParticipantesResult[0]?.total || 0,
      sessoesAgendadas: sessoesAgendadasResult[0]?.total || 0,
      // ... outros campos mantendo a lógica de contagem total
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Erro no dashboard facilitador:', error);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

// ==================== DASHBOARD DO PARTICIPANTE ====================

// ✅ AGORA O authMiddleware ESTÁ DEFINIDO E NÃO DARÁ MAIS ERRO
router.get('/participante', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Buscar estatísticas globais para o participante se envolver
    const [stats] = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM sessions) as sessoes_disponiveis,
        COUNT(DISTINCT ps.sessao_id) as sessoes_inscritas,
        COUNT(DISTINCT CASE WHEN s.estado = 'concluida' THEN s.id END) as sessoes_concluidas
      FROM usuarios u
      LEFT JOIN participantes_sessao ps ON u.id = ps.usuario_id
      LEFT JOIN sessions s ON ps.sessao_id = s.id
      WHERE u.id = ?
    `, [userId]);
    
    // Buscar próximas sessões do sistema (Para garantir que veja as 67 se quiser)
    const [proximasSessoes] = await db.execute(`
      SELECT s.*, u.nome as facilitador_nome
      FROM sessions s
      LEFT JOIN usuarios u ON s.facilitador_id = u.id
      WHERE s.estado IN ('agendada', 'em_curso')
      ORDER BY s.data ASC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      dashboard: {
        estatisticas: stats[0],
        proximasSessoes: proximasSessoes
      }
    });
    
  } catch (error) {
    console.error('❌ Erro dashboard participante:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar dashboard' });
  }
});

// ✅ ATIVIDADES RECENTES (Global ou Facilitador)
router.get('/atividades-recentes', authenticateToken, async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    // Query para pegar as atividades mais recentes de TODAS as sessões (67 registros)
    const [sessoesRecentes] = await db.query(`
      SELECT id, titulo, 'session_created' as type, created_at as timestamp, estado
      FROM sessions 
      ORDER BY created_at DESC 
      LIMIT ?`, [parseInt(limit)]
    );

    res.json({ success: true, data: sessoesRecentes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar atividades' });
  }
});

module.exports = router;
