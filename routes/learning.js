const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Listar módulos de aprendizagem
router.get('/modulos', authenticateToken, async (req, res) => {
  try {
    const [modulos] = await db.execute(`
      SELECT * FROM modulos_aprendizagem 
      WHERE ativo = 1 
      ORDER BY ordem ASC
    `);

    res.json({
      success: true,
      data: modulos
    });

  } catch (error) {
    console.error('Erro ao listar módulos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Obter módulo específico
router.get('/modulos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [modulos] = await db.execute(
      'SELECT * FROM modulos_aprendizagem WHERE id = ? AND ativo = 1',
      [id]
    );

    if (modulos.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Módulo não encontrado' 
      });
    }

    res.json({
      success: true,
      data: modulos[0]
    });

  } catch (error) {
    console.error('Erro ao obter módulo:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Obter progresso do usuário
router.get('/progresso', authenticateToken, async (req, res) => {
  try {
    const usuario_id = req.user.id;

    const [progresso] = await db.execute(`
      SELECT 
        pa.modulo_id,
        ma.titulo,
        ma.ordem,
        pa.concluido,
        pa.progresso,
        pa.atualizado_em
      FROM progresso_aprendizagem pa
      INNER JOIN modulos_aprendizagem ma ON pa.modulo_id = ma.id
      WHERE pa.usuario_id = ?
      ORDER BY ma.ordem ASC
    `, [usuario_id]);

    // Calcular progresso geral
    const [totalModulos] = await db.execute(
      'SELECT COUNT(*) as total FROM modulos_aprendizagem WHERE ativo = 1'
    );
    
    const modulosConcluidos = progresso.filter(p => p.concluido).length;
    const progressoPercentual = Math.round((modulosConcluidos / totalModulos[0].total) * 100);

    res.json({
      success: true,
      data: {
        progressoDetalhado: progresso,
        resumo: {
          modulosConcluidos,
          totalModulos: totalModulos[0].total,
          progressoPercentual
        }
      }
    });

  } catch (error) {
    console.error('Erro ao obter progresso:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Atualizar progresso do módulo
router.post('/progresso', authenticateToken, async (req, res) => {
  try {
    const { modulo_id, concluido = false, progresso = 0 } = req.body;
    const usuario_id = req.user.id;

    // Verificar se o módulo existe
    const [modulo] = await db.execute(
      'SELECT * FROM modulos_aprendizagem WHERE id = ? AND ativo = 1',
      [modulo_id]
    );

    if (modulo.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Módulo não encontrado' 
      });
    }

    // Verificar se já existe progresso
    const [progressoExistente] = await db.execute(
      'SELECT * FROM progresso_aprendizagem WHERE usuario_id = ? AND modulo_id = ?',
      [usuario_id, modulo_id]
    );

    if (progressoExistente.length > 0) {
      // Atualizar progresso existente
      await db.execute(
        'UPDATE progresso_aprendizagem SET concluido = ?, progresso = ?, atualizado_em = CURRENT_TIMESTAMP WHERE usuario_id = ? AND modulo_id = ?',
        [concluido, progresso, usuario_id, modulo_id]
      );
    } else {
      // Inserir novo progresso
      await db.execute(
        'INSERT INTO progresso_aprendizagem (usuario_id, modulo_id, concluido, progresso) VALUES (?, ?, ?, ?)',
        [usuario_id, modulo_id, concluido, progresso]
      );
    }

    res.json({
      success: true,
      message: 'Progresso atualizado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao atualizar progresso:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Obter perguntas do teste
router.get('/teste/perguntas', authenticateToken, async (req, res) => {
  try {
    const { modulo, dificuldade, limit = 10 } = req.query;

    let query = 'SELECT * FROM perguntas_teste WHERE ativa = 1';
    let params = [];

    if (modulo) {
      query += ' AND modulo = ?';
      params.push(modulo);
    }

    if (dificuldade) {
      query += ' AND dificuldade = ?';
      params.push(dificuldade);
    }

    query += ' ORDER BY RAND() LIMIT ?';
    params.push(parseInt(limit));

    const [perguntas] = await db.execute(query, params);

    // Parse das opções JSON
    const perguntasComOpcoes = perguntas.map(pergunta => ({
      ...pergunta,
      opcoes: typeof pergunta.opcoes_json === 'string' 
        ? JSON.parse(pergunta.opcoes_json)
        : pergunta.opcoes_json
    }));

    res.json({
      success: true,
      data: perguntasComOpcoes
    });

  } catch (error) {
    console.error('Erro ao obter perguntas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

// Submeter teste
router.post('/teste/submeter', authenticateToken, async (req, res) => {
  try {
    const { respostas, sessao_id = 1 } = req.body;
    const usuario_id = req.user.id;

    if (!respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ 
        success: false,
        message: 'Respostas não fornecidas' 
      });
    }

    // Calcular pontuação
    let acertos = 0;
    const detalhesRespostas = [];

    for (const resposta of respostas) {
      const [pergunta] = await db.execute(
        'SELECT * FROM perguntas_teste WHERE id = ?',
        [resposta.pergunta_id]
      );

      if (pergunta.length > 0) {
        const correta = pergunta[0].resposta_correta === resposta.resposta_usuario;
        if (correta) acertos++;

        detalhesRespostas.push({
          pergunta_id: resposta.pergunta_id,
          modulo: pergunta[0].modulo,
          resposta_usuario: resposta.resposta_usuario,
          resposta_correta: pergunta[0].resposta_correta,
          correta: correta
        });
      }
    }

    const pontuacao = (acertos / respostas.length) * 100;
    const aprovado = pontuacao >= 75; // 75% para aprovação

    // Salvar resultado
    await db.execute(`
      INSERT INTO resultados_teste 
      (usuario_id, sessao_id, pontuacao, aprovado, total_perguntas, acertos, detalhes_respostas) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      usuario_id, 
      sessao_id, 
      pontuacao, 
      aprovado, 
      respostas.length, 
      acertos, 
      JSON.stringify(detalhesRespostas)
    ]);

    res.json({
      success: true,
      data: {
        pontuacao,
        aprovado,
        total_perguntas: respostas.length,
        acertos,
        detalhes: detalhesRespostas
      }
    });

  } catch (error) {
    console.error('Erro ao submeter teste:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
});

module.exports = router;