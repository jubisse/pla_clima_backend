const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Obter atividades para votação
router.get('/atividades', authenticateToken, async (req, res) => {
  try {
    const { sessao_id = 1 } = req.query;

    const [atividades] = await db.query(`
      SELECT * FROM atividades_classificadas 
      WHERE sessao_id = ? 
      ORDER BY prioridade DESC, atividade ASC
    `, [sessao_id]);

    // Converter JSON strings para objetos
    const atividadesComCriterios = atividades.map(atividade => ({
      ...atividade,
      criterios: typeof atividade.criterios === 'string' 
        ? JSON.parse(atividade.criterios)
        : atividade.criterios
    }));

    res.json({
      success: true,
      data: atividadesComCriterios
    });

  } catch (error) {
    console.error('Erro ao obter atividades:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Submeter votos
router.post('/votar', authenticateToken, async (req, res) => {
  try {
    const { sessao_id = 1, votos } = req.body;
    const usuario_id = req.user.id;

    // Verificar se o usuário já votou
    const [votacaoExistente] = await db.query(
      'SELECT * FROM usuario_votacao_status WHERE usuario_id = ? AND sessao_id = ?',
      [usuario_id, sessao_id]
    );

    if (votacaoExistente.length > 0 && votacaoExistente[0].votacao_concluida) {
      return res.status(400).json({ 
        success: false,
        message: 'Você já votou nesta sessão' 
      });
    }

    // Iniciar transação
    await db.query('START TRANSACTION');

    try {
      // Inserir/atualizar votos
      for (const voto of votos) {
        const [votoExistente] = await db.query(
          'SELECT * FROM votos_usuario WHERE usuario_id = ? AND atividade_id = ? AND sessao_id = ?',
          [usuario_id, voto.atividade_id, sessao_id]
        );

        if (votoExistente.length > 0) {
          // Atualizar voto existente
          await db.query(
            'UPDATE votos_usuario SET pontuacao = ?, prioridade_usuario = ?, comentario = ?, updated_at = CURRENT_TIMESTAMP WHERE usuario_id = ? AND atividade_id = ? AND sessao_id = ?',
            [voto.pontuacao, voto.prioridade_usuario, voto.comentario, usuario_id, voto.atividade_id, sessao_id]
          );
        } else {
          // Inserir novo voto
          await db.query(
            'INSERT INTO votos_usuario (usuario_id, atividade_id, sessao_id, pontuacao, prioridade_usuario, comentario) VALUES (?, ?, ?, ?, ?, ?)',
            [usuario_id, voto.atividade_id, sessao_id, voto.pontuacao, voto.prioridade_usuario, voto.comentario]
          );
        }
      }

      // Atualizar status da votação
      if (votacaoExistente.length > 0) {
        await db.query(
          'UPDATE usuario_votacao_status SET votacao_concluida = 1, data_conclusao = CURRENT_TIMESTAMP WHERE usuario_id = ? AND sessao_id = ?',
          [usuario_id, sessao_id]
        );
      } else {
        await db.query(
          'INSERT INTO usuario_votacao_status (usuario_id, sessao_id, votacao_concluida, data_conclusao) VALUES (?, ?, 1, CURRENT_TIMESTAMP)',
          [usuario_id, sessao_id]
        );
      }

      await db.query('COMMIT');

      res.json({
        success: true,
        message: 'Votos submetidos com sucesso'
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Erro ao submeter votos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Obter resultados da votação
router.get('/resultados', authenticateToken, async (req, res) => {
  try {
    const { sessao_id = 1 } = req.query;

    const [resultados] = await db.query(`
      SELECT 
        ac.id as atividade_id,
        ac.atividade,
        ac.objectivo_estrategico,
        ac.descricao,
        ac.prioridade,
        ac.tempo_impacto,
        ac.capex,
        ac.risco_maladaptacao,
        AVG(vu.pontuacao) as pontuacao_media,
        COUNT(vu.id) as total_votos,
        COUNT(DISTINCT vu.usuario_id) as participantes_votantes
      FROM atividades_classificadas ac
      LEFT JOIN votos_usuario vu ON ac.id = vu.atividade_id AND vu.sessao_id = ?
      WHERE ac.sessao_id = ?
      GROUP BY ac.id, ac.atividade, ac.objectivo_estrategico, ac.descricao, ac.prioridade, ac.tempo_impacto, ac.capex, ac.risco_maladaptacao
      ORDER BY pontuacao_media DESC
    `, [sessao_id, sessao_id]);

    // Adicionar ranking
    const resultadosComRanking = resultados.map((resultado, index) => ({
      ...resultado,
      ranking: index + 1,
      pontuacao_media: resultado.pontuacao_media ? parseFloat(resultado.pontuacao_media) : 0
    }));

    res.json({
      success: true,
      data: resultadosComRanking
    });

  } catch (error) {
    console.error('Erro ao obter resultados:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Verificar status da votação
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const { sessao_id = 1 } = req.query;
    const usuario_id = req.user.id;

    const [status] = await db.query(
      'SELECT * FROM usuario_votacao_status WHERE usuario_id = ? AND sessao_id = ?',
      [usuario_id, sessao_id]
    );

    const votacaoConcluida = status.length > 0 && status[0].votacao_concluida;

    res.json({
      success: true,
      data: { votacao_concluida }
    });

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

module.exports = router;