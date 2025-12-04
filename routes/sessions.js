// backend/routes/sessions.js - VERSÃO COMPLETAMENTE CORRIGIDA
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ✅ LOGGER ROBUSTO
const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.log(`[SESSIONS-INFO] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.error(`[ERROR] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  warn: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.warn(`[WARN] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toLocaleString('pt-MZ');
      console.log(`[SESSIONS-DEBUG] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
    }
  }
};

// ==================== ROTAS DE SESSÕES CORRIGIDAS ====================

// ✅ LISTAR SESSÕES - VERSÃO COMPLETAMENTE CORRIGIDA
router.get('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    logger.info('Iniciando listagem de sessões', {
      userId: req.user.id,
      userProfile: req.user.perfil,
      query: req.query
    });

    const { page = 1, limit = 10, status, tipo, provincia, distrito } = req.query;
    const offset = (page - 1) * limit;

    // ✅ VALIDAÇÃO DE PARÂMETROS
    const limitNum = parseInt(limit) || 10;
    const offsetNum = parseInt(offset) || 0;
    const pageNum = parseInt(page) || 1;

    if (limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'O limite máximo por página é 100'
      });
    }

    // ✅ QUERY PRINCIPAL - SIMPLIFICADA E SEGURA
    let baseQuery = `
      SELECT 
        s.*,
        (SELECT nome FROM usuarios WHERE id = s.facilitador_id) as facilitador_nome,
        (SELECT COUNT(*) FROM participantes_sessao WHERE sessao_id = s.id) as total_participantes
      FROM sessions s
      WHERE 1=1
    `;
    let queryParams = [];

    // ✅ APLICAR FILTROS DE FORMA SEGURA
    if (status && status !== 'todas' && status !== 'all') {
      baseQuery += ' AND s.estado = ?';
      queryParams.push(status);
    }

    if (tipo && tipo !== 'todos' && tipo !== 'all') {
      baseQuery += ' AND s.tipo = ?';
      queryParams.push(tipo);
    }

    if (provincia && provincia !== 'todas' && provincia !== 'all') {
      baseQuery += ' AND s.provincia = ?';
      queryParams.push(provincia);
    }

    if (distrito && distrito !== 'todos' && distrito !== 'all') {
      baseQuery += ' AND s.distrito = ?';
      queryParams.push(distrito);
    }

    // ✅ ORDENAÇÃO E PAGINAÇÃO
    baseQuery += ' ORDER BY s.data DESC, s.created_at DESC';
    baseQuery += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    logger.debug('Executando query principal', { 
      query: baseQuery.substring(0, 200) + '...', 
      paramsCount: queryParams.length 
    });

    let sessoes = [];
    try {
      // ✅ EXECUTAR QUERY PRINCIPAL DE FORMA SEGURA
      const [result] = await db.query(baseQuery, queryParams);
      
      // ✅ CORREÇÃO: Verificar se result é um array antes de usar
      if (Array.isArray(result)) {
        sessoes = result;
        logger.info(`Query executada com sucesso: ${sessoes.length} sessões encontradas`);
      } else {
        logger.warn('Resultado da query não é um array, usando array vazio');
        sessoes = [];
      }
    } catch (queryError) {
      logger.error('Erro na query principal', { 
        error: queryError.message,
        sql: queryError.sql,
        code: queryError.code
      });
      
      // ✅ FALLBACK: Query alternativa mais simples
      try {
        const fallbackQuery = `SELECT * FROM sessions ORDER BY data DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
        const [fallbackResult] = await db.query(fallbackQuery);
        
        if (Array.isArray(fallbackResult)) {
          sessoes = fallbackResult;
          logger.info(`Fallback executado: ${sessoes.length} sessões`);
        } else {
          sessoes = [];
          logger.warn('Resultado do fallback não é um array');
        }
      } catch (fallbackError) {
        logger.error('Fallback também falhou', { error: fallbackError.message });
        sessoes = [];
      }
    }

    // ✅ CONTAGEM TOTAL - COMPLETAMENTE REESCRITA
    let total = 0;
    try {
      let countQuery = 'SELECT COUNT(*) as total FROM sessions WHERE 1=1';
      let countParams = [];

      // Aplicar os mesmos filtros da query principal
      if (status && status !== 'todas' && status !== 'all') {
        countQuery += ' AND estado = ?';
        countParams.push(status);
      }

      if (tipo && tipo !== 'todos' && tipo !== 'all') {
        countQuery += ' AND tipo = ?';
        countParams.push(tipo);
      }

      if (provincia && provincia !== 'todas' && provincia !== 'all') {
        countQuery += ' AND provincia = ?';
        countParams.push(provincia);
      }

      if (distrito && distrito !== 'todos' && distrito !== 'all') {
        countQuery += ' AND distrito = ?';
        countParams.push(distrito);
      }

      logger.debug('Executando query de contagem', { 
        query: countQuery,
        paramsCount: countParams.length 
      });

      const [countResult] = await db.query(countQuery, countParams);
      
      // ✅ CORREÇÃO: Verificar estrutura do resultado ANTES de acessar
      if (countResult && 
          Array.isArray(countResult) && 
          countResult.length > 0 && 
          countResult[0] && 
          countResult[0].total !== undefined && 
          countResult[0].total !== null) {
        
        total = parseInt(countResult[0].total);
        logger.debug(`Contagem bem-sucedida: ${total} sessões no total`);
      
      } else {
        logger.warn('Estrutura inesperada na contagem, usando fallback');
        throw new Error('Estrutura de contagem inválida');
      }

    } catch (countError) {
      logger.error('Erro na contagem principal, tentando fallback...', {
        error: countError.message
      });

      try {
        // ✅ FALLBACK DE CONTAGEM: Query simples sem filtros
        const simpleCountQuery = 'SELECT COUNT(*) as total FROM sessions';
        const [simpleCountResult] = await db.query(simpleCountQuery);
        
        // ✅ CORREÇÃO: Verificação robusta da estrutura
        if (simpleCountResult && 
            Array.isArray(simpleCountResult) && 
            simpleCountResult.length > 0 && 
            simpleCountResult[0] && 
            simpleCountResult[0].total !== undefined && 
            simpleCountResult[0].total !== null) {
          
          total = parseInt(simpleCountResult[0].total);
          logger.debug(`Contagem fallback bem-sucedida: ${total} sessões`);
        
        } else {
          logger.error('Estrutura do fallback de contagem também é inválida');
          total = sessoes.length; // Usar contagem dos resultados atuais como fallback
        }
      } catch (simpleCountError) {
        logger.error('Fallback de contagem também falhou', {
          error: simpleCountError.message
        });
        total = sessoes.length; // Último fallback
      }
    }

    // ✅ ENRIQUECER DADOS DAS SESSÕES
    if (sessoes.length > 0) {
      try {
        logger.debug('Enriquecendo dados das sessões...');
        
        for (let i = 0; i < sessoes.length; i++) {
          const sessao = sessoes[i];
          
          // ✅ Garantir que total_participantes seja um número
          if (sessao.total_participantes === undefined || sessao.total_participantes === null) {
            sessao.total_participantes = 0;
          } else {
            sessao.total_participantes = parseInt(sessao.total_participantes) || 0;
          }

          // ✅ Garantir que facilitador_nome tenha um valor padrão
          if (!sessao.facilitador_nome) {
            sessao.facilitador_nome = 'Facilitador não definido';
          }

          // ✅ Garantir valores padrão para campos importantes
          sessao.participantes_confirmados = parseInt(sessao.participantes_confirmados) || 0;
          sessao.participantes_previstos = parseInt(sessao.participantes_previstos) || 20;
          sessao.duracao = parseInt(sessao.duracao) || 2;
        }
        
        logger.debug('Dados das sessões enriquecidos com sucesso');
      } catch (enrichError) {
        logger.error('Erro ao enriquecer dados das sessões', {
          error: enrichError.message
        });
        // Continuar com os dados básicos
      }
    }

    logger.info('Listagem concluída com sucesso', {
      totalSessoes: total,
      sessoesRetornadas: sessoes.length,
      page: pageNum,
      limit: limitNum
    });

    // ✅ RESPOSTA FINAL
    res.json({
      success: true,
      data: sessoes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });

  } catch (error) {
    logger.error('Erro crítico ao listar sessões', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });

    // ✅ RESPOSTA DE FALLBACK EM CASO DE ERRO CRÍTICO
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao listar sessões',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        details: 'O servidor encontrou um erro inesperado'
      })
    });
  }
});

// ✅ OBTER SESSÃO ESPECÍFICA - CORRIGIDA
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // ✅ VALIDAÇÃO DO ID
    const sessaoId = parseInt(id);
    if (isNaN(sessaoId) || sessaoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID da sessão inválido'
      });
    }

    logger.info('Buscando sessão específica', {
      sessionId: sessaoId,
      userId: req.user.id
    });

    // ✅ QUERY SIMPLIFICADA E SEGURA
    const query = `
      SELECT 
        s.*,
        (SELECT nome FROM usuarios WHERE id = s.facilitador_id) as facilitador_nome,
        (SELECT COUNT(*) FROM participantes_sessao WHERE sessao_id = s.id) as total_participantes
      FROM sessions s 
      WHERE s.id = ?
    `;

    const [sessoes] = await db.query(query, [sessaoId]);

    // ✅ VERIFICAÇÃO ROBUSTA DO RESULTADO
    if (!Array.isArray(sessoes) || sessoes.length === 0) {
      logger.warn('Sessão não encontrada', { sessionId: sessaoId });
      return res.status(404).json({ 
        success: false,
        message: 'Sessão não encontrada' 
      });
    }

    const sessao = sessoes[0];

    // ✅ ENRIQUECER DADOS
    if (sessao.total_participantes === undefined || sessao.total_participantes === null) {
      sessao.total_participantes = 0;
    } else {
      sessao.total_participantes = parseInt(sessao.total_participantes);
    }

    if (!sessao.facilitador_nome) {
      sessao.facilitador_nome = 'Facilitador não definido';
    }

    logger.info('Sessão encontrada', { 
      sessionId: sessaoId,
      titulo: sessao.titulo
    });

    res.json({
      success: true,
      data: sessao
    });

  } catch (error) {
    logger.error('Erro ao obter sessão', {
      error: error.message,
      sessionId: req.params.id,
      userId: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ CRIAR NOVA SESSÃO - VERSÃO COMPLETAMENTE CORRIGIDA
router.post('/', authenticateToken, async (req, res) => {
  logger.info('Criar sessão chamado', { 
    user: req.user.id,
    data: {
      titulo: req.body.titulo?.substring(0, 50),
      data: req.body.data,
      tipo: req.body.tipo
    }
  });

  try {
    const {
      titulo,
      descricao,
      data,
      horario,
      duracao = 2,
      distrito,
      provincia,
      tipo = 'presencial',
      participantes_previstos = 20,
      localizacao,
      link_virtual,
      observacoes,
      atividades = []
    } = req.body;

    // ✅ VALIDAÇÕES ROBUSTAS
    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Título é obrigatório'
      });
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        message: 'Data é obrigatória'
      });
    }

    if (!distrito || !provincia) {
      return res.status(400).json({
        success: false,
        message: 'Distrito e província são obrigatórios'
      });
    }

    // ✅ VALIDAR TIPOS
    const tiposPermitidos = ['presencial', 'virtual', 'hibrido'];
    const tipoFinal = tiposPermitidos.includes(tipo) ? tipo : 'presencial';

    // ✅ PREPARAR VALORES COM FALLBACKS
    const valores = [
      titulo.trim(),
      descricao?.trim() || '',
      data,
      horario || '10:00:00',
      parseInt(duracao) || 2,
      distrito.trim(),
      provincia.trim(),
      req.user.id, // facilitador_id
      parseInt(participantes_previstos) || 20,
      tipoFinal,
      localizacao?.trim() || '',
      link_virtual?.trim() || '',
      observacoes?.trim() || '',
      'agendada' // estado
    ];

    logger.info('Valores preparados para inserção', {
      valoresCount: valores.length,
      temAtividades: atividades.length > 0
    });

    // ✅ QUERY DE INSERÇÃO CORRIGIDA
    const query = `
      INSERT INTO sessions (
        titulo, descricao, data, horario, duracao, distrito, provincia,
        facilitador_id, participantes_previstos, tipo, localizacao,
        link_virtual, observacoes, estado, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    let result;
    try {
      // ✅ CORREÇÃO: Não desestruturar diretamente - tratar o resultado
      const queryResult = await db.query(query, valores);
      
      // Verificar a estrutura do resultado
      if (Array.isArray(queryResult) && queryResult.length > 0) {
        result = queryResult[0];
      } else {
        result = queryResult;
      }

      logger.info('Query de inserção executada', { 
        resultType: typeof result,
        insertId: result?.insertId 
      });

    } catch (queryError) {
      logger.error('Erro na query de inserção', {
        error: queryError.message,
        code: queryError.code,
        sqlMessage: queryError.sqlMessage
      });

      // ✅ TRATAMENTO DE ERROS ESPECÍFICOS
      if (queryError.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).json({
          success: false,
          message: 'Facilitador não encontrado'
        });
      }

      if (queryError.code === 'ER_TRUNCATED_WRONG_VALUE') {
        return res.status(400).json({
          success: false,
          message: 'Valor de data ou horário inválido'
        });
      }

      throw queryError;
    }

    // ✅ VERIFICAR SE A INSERÇÃO FOI BEM-SUCEDIDA
    if (!result || !result.insertId) {
      logger.error('Inserção falhou - sem insertId', { result });
      return res.status(500).json({
        success: false,
        message: 'Falha ao criar sessão no banco de dados'
      });
    }

    const sessaoId = result.insertId;

    logger.info('Sessão criada com sucesso', { 
      sessaoId: sessaoId,
      titulo: titulo.substring(0, 50)
    });

    // ✅ PROCESSAR ATIVIDADES SE FORNECIDAS
    let atividadesInseridas = 0;
    if (atividades && atividades.length > 0) {
      logger.info('Processando atividades', { count: atividades.length });
      
      for (const atividade of atividades) {
        try {
          await db.query(
            `INSERT INTO atividades_classificadas (
              sessao_id, atividade, descricao, objectivo_estrategico,
              criterios, prioridade, tempo_impacto, capex, risco_maladaptacao, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              sessaoId,
              atividade.atividade || 'Atividade sem nome',
              atividade.descricao || '',
              atividade.objetivoEstrategico || 'OE - Não definido',
              JSON.stringify({
                indicadores_selecionados: atividade.indicadoresSelecionados || [],
                sessao_id: sessaoId
              }),
              atividade.prioridade || 1,
              atividade.tempo_impacto || 2,
              atividade.capex || 3,
              atividade.risco_maladaptacao || 2
            ]
          );
          atividadesInseridas++;
        } catch (atividadeError) {
          logger.error('Erro ao inserir atividade', {
            error: atividadeError.message,
            sessaoId: sessaoId
          });
          // Continuar mesmo com erro em uma atividade
        }
      }
      logger.info('Atividades processadas', { 
        sucesso: atividadesInseridas,
        total: atividades.length 
      });
    }

    // ✅ BUSCAR SESSÃO CRIADA COM DADOS COMPLETOS
    let sessaoCriada;
    try {
      const [sessoes] = await db.query(
        `SELECT 
          s.*,
          (SELECT nome FROM usuarios WHERE id = s.facilitador_id) as facilitador_nome,
          (SELECT COUNT(*) FROM atividades_classificadas WHERE sessao_id = s.id) as total_atividades
         FROM sessions s 
         WHERE s.id = ?`,
        [sessaoId]
      );

      if (sessoes && sessoes.length > 0) {
        sessaoCriada = sessoes[0];
      } else {
        // Fallback: buscar dados básicos
        const [sessoesBasicas] = await db.query(
          'SELECT * FROM sessions WHERE id = ?',
          [sessaoId]
        );
        sessaoCriada = sessoesBasicas[0] || { id: sessaoId, titulo: titulo };
      }
    } catch (selectError) {
      logger.error('Erro ao buscar sessão criada', {
        error: selectError.message,
        sessaoId: sessaoId
      });
      sessaoCriada = { id: sessaoId, titulo: titulo };
    }

    logger.info('Resposta de criação preparada', { sessaoId: sessaoId });

    res.status(201).json({
      success: true,
      message: `Sessão criada com sucesso${atividadesInseridas > 0 ? ` e ${atividadesInseridas} atividades` : ''}`,
      data: sessaoCriada
    });

  } catch (error) {
    logger.error('Erro crítico ao criar sessão', {
      error: error.message,
      stack: error.stack,
      user: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao criar sessão',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        details: 'Verifique os logs do servidor para mais informações'
      })
    });
  }
});

// ✅ ROTA DE HEALTH CHECK PARA SESSÕES
router.get('/health/check', authenticateToken, async (req, res) => {
  try {
    logger.debug('Health check das sessões solicitado', { userId: req.user.id });

    // Verificar se a tabela sessions existe e tem dados
    const [tableCheck] = await db.query("SHOW TABLES LIKE 'sessions'");
    const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0;

    let totalSessoes = 0;
    if (tableExists) {
      const [countResult] = await db.query('SELECT COUNT(*) as total FROM sessions');
      if (countResult && Array.isArray(countResult) && countResult.length > 0) {
        totalSessoes = countResult[0].total || 0;
      }
    }

    res.json({
      success: true,
      data: {
        table_exists: tableExists,
        total_sessions: totalSessoes,
        service: 'sessions-api',
        status: 'healthy'
      }
    });

  } catch (error) {
    logger.error('Erro no health check das sessões', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Health check falhou',
      error: error.message
    });
  }
});

// ✅ ROTAS DE PARTICIPANTES - ADICIONAR NO FINAL DO ARQUIVO sessions.js

// ✅ LISTAR PARTICIPANTES DE UMA SESSÃO - ROTA CORRIGIDA
router.get('/:id/participantes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    // ✅ VALIDAÇÃO DO ID
    const sessaoId = parseInt(id);
    if (isNaN(sessaoId) || sessaoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID da sessão inválido'
      });
    }

    logger.info('Buscando participantes da sessão', {
      sessionId: sessaoId,
      userId: req.user.id,
      page: page,
      limit: limit
    });

    // ✅ VALIDAÇÃO DE PAGINAÇÃO
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offset = (pageNum - 1) * limitNum;

    if (limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'O limite máximo por página é 100'
      });
    }

    // ✅ VERIFICAR SE A SESSÃO EXISTE PRIMEIRO
    let sessaoExiste = false;
    try {
      const [sessoes] = await db.query('SELECT id FROM sessions WHERE id = ?', [sessaoId]);
      sessaoExiste = Array.isArray(sessoes) && sessoes.length > 0;
    } catch (checkError) {
      logger.error('Erro ao verificar existência da sessão', {
        error: checkError.message,
        sessionId: sessaoId
      });
    }

    if (!sessaoExiste) {
      return res.status(404).json({
        success: false,
        message: 'Sessão não encontrada'
      });
    }

    // ✅ TENTAR BUSCAR PARTICIPANTES DA TABELA CORRETA
    let participantes = [];
    let total = 0;

    try {
      // ✅ PRIMEIRA TENTATIVA: tabela participantes_sessao
      const query = `
        SELECT 
          ps.*,
          u.id as usuario_id,
          u.nome,
          u.email,
          u.telefone,
          u.organizacao,
          u.provincia,
          u.distrito,
          -- Campos de progresso (placeholders por enquanto)
          0 as progresso_treinamento,
          false as teste_realizado,
          false as teste_aprovado,
          false as votacao_concluida
        FROM participantes_sessao ps
        LEFT JOIN usuarios u ON ps.usuario_id = u.id
        WHERE ps.sessao_id = ?
        ORDER BY ps.data_inscricao DESC
        LIMIT ? OFFSET ?
      `;

      const countQuery = 'SELECT COUNT(*) as total FROM participantes_sessao WHERE sessao_id = ?';

      logger.debug('Executando query de participantes', {
        query: query.substring(0, 100) + '...',
        sessionId: sessaoId,
        limit: limitNum,
        offset: offset
      });

      const [result] = await db.query(query, [sessaoId, limitNum, offset]);
      const [countResult] = await db.query(countQuery, [sessaoId]);

      if (Array.isArray(result)) {
        participantes = result;
      }

      if (countResult && Array.isArray(countResult) && countResult.length > 0) {
        total = parseInt(countResult[0].total) || 0;
      }

      logger.info(`Participantes encontrados na tabela padrão: ${participantes.length}`);

    } catch (dbError) {
      logger.warn('Tabela participantes_sessao não encontrada, tentando alternativas...', {
        error: dbError.message,
        code: dbError.code
      });

      // ✅ SEGUNDA TENTATIVA: tabela session_participants (nome alternativo comum)
      try {
        const altQuery = `
          SELECT 
            sp.*,
            u.id as usuario_id,
            u.nome,
            u.email,
            u.telefone,
            u.organizacao,
            u.provincia,
            u.distrito
          FROM session_participants sp
          LEFT JOIN usuarios u ON sp.user_id = u.id
          WHERE sp.session_id = ?
          LIMIT ? OFFSET ?
        `;

        const altCountQuery = 'SELECT COUNT(*) as total FROM session_participants WHERE session_id = ?';

        const [altResult] = await db.query(altQuery, [sessaoId, limitNum, offset]);
        const [altCountResult] = await db.query(altCountQuery, [sessaoId]);

        if (Array.isArray(altResult)) {
          participantes = altResult;
        }

        if (altCountResult && Array.isArray(altCountResult) && altCountResult.length > 0) {
          total = parseInt(altCountResult[0].total) || 0;
        }

        logger.info(`Participantes encontrados na tabela alternativa: ${participantes.length}`);

      } catch (altError) {
        logger.warn('Tabela alternativa também não encontrada, retornando array vazio', {
          error: altError.message
        });
        // Manter arrays vazios como fallback
      }
    }

    // ✅ ESTRUTURAR RESPOSTA NO FORMATO ESPERADO PELO FRONTEND
    const participantesFormatados = participantes.map(participante => {
      // ✅ DADOS DO USUÁRIO (com fallbacks)
      const usuario = {
        id: participante.usuario_id || participante.user_id || participante.id,
        nome: participante.nome || 'Usuário não identificado',
        email: participante.email || 'email@nao-definido.com',
        telefone: participante.telefone || 'N/A',
        organizacao: participante.organizacao || 'N/A',
        provincia: participante.provincia || 'N/A',
        distrito: participante.distrito || 'N/A'
      };

      // ✅ DADOS DE PROGRESSO (com fallbacks)
      const progresso = {
        treinamento: participante.progresso_treinamento || participante.training_progress || 0,
        teste_realizado: participante.teste_realizado || participante.test_completed || false,
        teste_aprovado: participante.teste_aprovado || participante.test_passed || false,
        votacao_concluida: participante.votacao_concluida || participante.voting_completed || false
      };

      return {
        id: participante.id,
        sessao_id: participante.sessao_id || participante.session_id || sessaoId,
        usuario_id: usuario.id,
        status: participante.status || 'pendente',
        data_inscricao: participante.data_inscricao || participante.created_at || new Date().toISOString(),
        usuario: usuario,
        progresso: progresso
      };
    });

    logger.info('Resposta de participantes formatada', {
      sessionId: sessaoId,
      totalParticipantes: total,
      participantesRetornados: participantesFormatados.length
    });

    res.json({
      success: true,
      data: participantesFormatados,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });

  } catch (error) {
    logger.error('Erro crítico ao listar participantes', {
      error: error.message,
      stack: error.stack,
      sessionId: req.params.id,
      userId: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao listar participantes',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message
      })
    });
  }
});

// ✅ ATUALIZAR STATUS DO PARTICIPANTE - NOVA ROTA
router.patch('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
  try {
    const { sessaoId, usuarioId } = req.params;
    const { status } = req.body;

    logger.info('Atualizando status do participante', {
      sessionId: sessaoId,
      userId: usuarioId,
      newStatus: status,
      requestedBy: req.user.id
    });

    // ✅ VALIDAÇÕES
    const sessaoIdNum = parseInt(sessaoId);
    const usuarioIdNum = parseInt(usuarioId);

    if (isNaN(sessaoIdNum) || isNaN(usuarioIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      });
    }

    const statusValidos = ['pendente', 'confirmado', 'cancelado'];
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido. Use: pendente, confirmado ou cancelado'
      });
    }

    // ✅ VERIFICAR SE O PARTICIPANTE EXISTE
    let participanteExiste = false;
    try {
      const query = 'SELECT id FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?';
      const [result] = await db.query(query, [sessaoIdNum, usuarioIdNum]);
      participanteExiste = Array.isArray(result) && result.length > 0;
    } catch (checkError) {
      logger.warn('Erro ao verificar participante, tentando criar...', {
        error: checkError.message
      });
    }

    let result;
    if (participanteExiste) {
      // ✅ ATUALIZAR STATUS EXISTENTE
      const updateQuery = 'UPDATE participantes_sessao SET status = ?, updated_at = NOW() WHERE sessao_id = ? AND usuario_id = ?';
      [result] = await db.query(updateQuery, [status, sessaoIdNum, usuarioIdNum]);
      
      logger.info('Status do participante atualizado', {
        sessionId: sessaoIdNum,
        userId: usuarioIdNum,
        newStatus: status
      });
    } else {
      // ✅ CRIAR NOVO REGISTRO DE PARTICIPAÇÃO
      const insertQuery = `
        INSERT INTO participantes_sessao (sessao_id, usuario_id, status, data_inscricao, created_at) 
        VALUES (?, ?, ?, NOW(), NOW())
      `;
      [result] = await db.query(insertQuery, [sessaoIdNum, usuarioIdNum, status]);
      
      logger.info('Novo registro de participação criado', {
        sessionId: sessaoIdNum,
        userId: usuarioIdNum,
        status: status
      });
    }

    res.json({
      success: true,
      message: `Status do participante atualizado para: ${status}`,
      data: {
        sessao_id: sessaoIdNum,
        usuario_id: usuarioIdNum,
        status: status
      }
    });

  } catch (error) {
    logger.error('Erro ao atualizar status do participante', {
      error: error.message,
      sessionId: req.params.sessaoId,
      userId: req.params.usuarioId,
      requestedBy: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao atualizar status'
    });
  }
});

// ✅ REMOVER PARTICIPANTE - NOVA ROTA
router.delete('/:sessaoId/participantes/:usuarioId', authenticateToken, async (req, res) => {
  try {
    const { sessaoId, usuarioId } = req.params;

    logger.info('Removendo participante da sessão', {
      sessionId: sessaoId,
      userId: usuarioId,
      requestedBy: req.user.id
    });

    // ✅ VALIDAÇÕES
    const sessaoIdNum = parseInt(sessaoId);
    const usuarioIdNum = parseInt(usuarioId);

    if (isNaN(sessaoIdNum) || isNaN(usuarioIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      });
    }

    // ✅ EXECUTAR REMOÇÃO
    const query = 'DELETE FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?';
    const [result] = await db.query(query, [sessaoIdNum, usuarioIdNum]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Participante não encontrado nesta sessão'
      });
    }

    logger.info('Participante removido com sucesso', {
      sessionId: sessaoIdNum,
      userId: usuarioIdNum
    });

    res.json({
      success: true,
      message: 'Participante removido da sessão com sucesso',
      data: {
        sessao_id: sessaoIdNum,
        usuario_id: usuarioIdNum,
        removed: true
      }
    });

  } catch (error) {
    logger.error('Erro ao remover participante', {
      error: error.message,
      sessionId: req.params.sessaoId,
      userId: req.params.usuarioId,
      requestedBy: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao remover participante'
    });
  }
});

// ✅ ADICIONAR PARTICIPANTE À SESSÃO - NOVA ROTA
router.post('/:sessaoId/participantes', authenticateToken, async (req, res) => {
  try {
    const { sessaoId } = req.params;
    const { usuario_id, status = 'pendente' } = req.body;

    logger.info('Adicionando participante à sessão', {
      sessionId: sessaoId,
      userId: usuario_id,
      status: status,
      requestedBy: req.user.id
    });

    // ✅ VALIDAÇÕES
    const sessaoIdNum = parseInt(sessaoId);
    const usuarioIdNum = parseInt(usuario_id);

    if (isNaN(sessaoIdNum) || isNaN(usuarioIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      });
    }

    const statusValidos = ['pendente', 'confirmado', 'cancelado'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido. Use: pendente, confirmado ou cancelado'
      });
    }

    // ✅ VERIFICAR SE A SESSÃO EXISTE
    const [sessoes] = await db.query('SELECT id FROM sessions WHERE id = ?', [sessaoIdNum]);
    if (!Array.isArray(sessoes) || sessoes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sessão não encontrada'
      });
    }

    // ✅ VERIFICAR SE O USUÁRIO EXISTE
    const [usuarios] = await db.query('SELECT id FROM usuarios WHERE id = ?', [usuarioIdNum]);
    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // ✅ VERIFICAR SE JÁ É PARTICIPANTE
    const [existentes] = await db.query(
      'SELECT id FROM participantes_sessao WHERE sessao_id = ? AND usuario_id = ?',
      [sessaoIdNum, usuarioIdNum]
    );

    if (Array.isArray(existentes) && existentes.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Usuário já é participante desta sessão'
      });
    }

    // ✅ INSERIR NOVO PARTICIPANTE
    const query = `
      INSERT INTO participantes_sessao (sessao_id, usuario_id, status, data_inscricao, created_at) 
      VALUES (?, ?, ?, NOW(), NOW())
    `;

    const [result] = await db.query(query, [sessaoIdNum, usuarioIdNum, status]);

    logger.info('Participante adicionado com sucesso', {
      sessionId: sessaoIdNum,
      userId: usuarioIdNum,
      status: status,
      insertId: result.insertId
    });

    // ✅ BUSCAR DADOS COMPLETOS DO PARTICIPANTE
    const [participantes] = await db.query(
      `SELECT 
        ps.*,
        u.nome, u.email, u.telefone, u.organizacao, u.provincia, u.distrito
       FROM participantes_sessao ps
       LEFT JOIN usuarios u ON ps.usuario_id = u.id
       WHERE ps.id = ?`,
      [result.insertId]
    );

    const participante = participantes && participantes[0] ? {
      id: participantes[0].id,
      sessao_id: participantes[0].sessao_id,
      usuario_id: participantes[0].usuario_id,
      status: participantes[0].status,
      data_inscricao: participantes[0].data_inscricao,
      usuario: {
        id: participantes[0].usuario_id,
        nome: participantes[0].nome,
        email: participantes[0].email,
        telefone: participantes[0].telefone,
        organizacao: participantes[0].organizacao,
        provincia: participantes[0].provincia,
        distrito: participantes[0].distrito
      },
      progresso: {
        treinamento: 0,
        teste_realizado: false,
        teste_aprovado: false,
        votacao_concluida: false
      }
    } : null;

    res.status(201).json({
      success: true,
      message: 'Participante adicionado à sessão com sucesso',
      data: participante
    });

  } catch (error) {
    logger.error('Erro ao adicionar participante', {
      error: error.message,
      sessionId: req.params.sessaoId,
      userId: req.body.usuario_id,
      requestedBy: req.user?.id
    });

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao adicionar participante'
    });
  }
});

module.exports = router;