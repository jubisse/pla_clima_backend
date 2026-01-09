const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 1. Listar módulos com status de conclusão para o usuário logado
router.get('/modulos', authenticateToken, async (req, res) => {
  try {
    const usuario_id = req.user.id;

    // Join para saber se o usuário já concluiu o módulo
    const [modulos] = await db.query(`
      SELECT 
        m.*, 
        IF(p.concluido, CAST(1 AS UNSIGNED), CAST(0 AS UNSIGNED)) as concluido
      FROM modulos_aprendizagem m
      LEFT JOIN progresso_aprendizagem p ON m.id = p.modulo_id AND p.usuario_id = ?
      WHERE m.ativo = 1 
      ORDER BY m.ordem ASC
    `, [usuario_id]);

    res.json({
      success: true,
      data: modulos
    });
  } catch (error) {
    console.error('Erro ao listar módulos:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// 2. Atualizar progresso (Chamado ao clicar em "Concluir Módulo")
router.post('/progresso', authenticateToken, async (req, res) => {
  try {
    const { modulo_id, concluido = true, progresso = 100 } = req.body;
    const usuario_id = req.user.id;

    // Upsert (Insert or Update) do progresso
    const query = `
      INSERT INTO progresso_aprendizagem (usuario_id, modulo_id, concluido, progresso)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE concluido = VALUES(concluido), progresso = VALUES(progresso), atualizado_em = CURRENT_TIMESTAMP
    `;

    await db.query(query, [usuario_id, modulo_id, concluido, progresso]);

    res.json({ success: true, message: 'Progresso guardado' });
  } catch (error) {
    console.error('Erro ao atualizar progresso:', error);
    res.status(500).json({ success: false, message: 'Erro no servidor' });
  }
});

// 3. Obter perguntas do teste (Sincronizado com o Frontend)
router.get('/teste/perguntas', authenticateToken, async (req, res) => {
  try {
    // Busca perguntas aleatórias para o teste
    const [perguntas] = await db.query(
      'SELECT id, pergunta, opcoes_json, dificuldade FROM perguntas_teste WHERE ativa = 1 ORDER BY RAND() LIMIT 10'
    );

    const perguntasFormatadas = perguntas.map(p => ({
      id: p.id,
      pergunta: p.pergunta,
      opcoes: typeof p.opcoes_json === 'string' ? JSON.parse(p.opcoes_json) : p.opcoes_json,
      dificuldade: p.dificuldade
    }));

    res.json({ success: true, data: perguntasFormatadas });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar teste' });
  }
});

// 4. Submeter Teste (Lógica de aprovação de 75%)
router.post('/teste/submeter', authenticateToken, async (req, res) => {
  try {
    const { respostas, sessao_id } = req.body;
    const usuario_id = req.user.id;

    if (!respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ success: false, message: 'Formato de resposta inválido' });
    }

    let acertos = 0;
    const detalhes = [];

    for (const r of respostas) {
      const [pergunta] = await db.query('SELECT resposta_correta FROM perguntas_teste WHERE id = ?', [r.pergunta_id]);
      
      if (pergunta.length > 0) {
        const correta = pergunta[0].resposta_correta === r.resposta_usuario;
        if (correta) acertos++;
        detalhes.push({ pergunta_id: r.pergunta_id, correta });
      }
    }

    const pontuacao = (acertos / respostas.length) * 100;
    const aprovado = pontuacao >= 75;

    // Grava o resultado final
    await db.query(`
      INSERT INTO resultados_teste (usuario_id, sessao_id, pontuacao, aprovado, total_perguntas, acertos)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [usuario_id, sessao_id, pontuacao, aprovado, respostas.length, acertos]);

    res.json({
      success: true,
      data: { aprovado, nota: acertos, total_perguntas: respostas.length, pontuacao }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Erro ao processar teste' });
  }
});

module.exports = router;
