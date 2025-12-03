// routes/auth.js - VERSÃO SUPER ROBUSTA
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Tentar carregar o banco de dados com tratamento de erro
let db;
try {
  db = require('../config/database');
  console.log('✅ Módulo database carregado nas rotas de auth');
} catch (dbError) {
  console.error('❌ ERRO CRÍTICO: Não foi possível carregar o módulo database:', dbError.message);
  // Criar um stub para permitir que o servidor inicie
  db = {
    execute: async () => {
      console.error('⚠️ Tentativa de usar db.execute() sem módulo database');
      throw new Error('Módulo de banco de dados não disponível');
    },
    query: async () => {
      console.error('⚠️ Tentativa de usar db.query() sem módulo database');
      throw new Error('Módulo de banco de dados não disponível');
    }
  };
}

const router = express.Router();

// ===================== SISTEMA DE LOGGING AVANÇADO =====================
const authLogger = {
  info: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`🔐 [${timestamp}] AUTH INFO: ${message}`, data);
  },
  
  error: (message, error = null, context = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`❌ [${timestamp}] AUTH ERROR: ${message}`);
    if (error) {
      console.error(`   📍 Stack:`, error.stack || 'N/A');
      console.error(`   🔧 Context:`, context);
    }
  },
  
  warn: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`⚠️ [${timestamp}] AUTH WARN: ${message}`, data);
  },
  
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.debug(`🐛 [${timestamp}] AUTH DEBUG: ${message}`, data);
    }
  }
};

// ===================== MIDDLEWARES =====================

// Middleware de logging de requisições de autenticação
const logAuthRequest = (req, res, next) => {
  const { email } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
  
  authLogger.info('Tentativa de autenticação recebida', {
    email: email || 'não fornecido',
    ip: ip,
    userAgent: req.headers['user-agent'] || 'desconhecido',
    timestamp: new Date().toISOString()
  });
  
  next();
};

// Middleware de validação de campos obrigatórios para login
const validateLoginFields = (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    authLogger.warn('Campos obrigatórios faltando', {
      emailProvided: !!email,
      passwordProvided: !!password
    });
    
    return res.status(400).json({
      success: false,
      error: 'Email e senha são obrigatórios',
      code: 'VALIDATION_ERROR'
    });
  }
  
  // Validar formato do email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    authLogger.warn('Formato de email inválido', { email });
    
    return res.status(400).json({
      success: false,
      error: 'Formato de email inválido',
      code: 'INVALID_EMAIL'
    });
  }
  
  next();
};

// ===================== UTILITÁRIOS =====================

// Função para executar queries com tratamento de erro unificado
const safeDbQuery = async (query, params = [], operation = 'query') => {
  try {
    authLogger.debug(`Executando query ${operation}`, { 
      query: query.substring(0, 100), 
      paramCount: params.length 
    });
    
    let result;
    
    // Verificar qual método de banco está disponível
    if (typeof db.execute === 'function') {
      result = await db.execute(query, params);
      // db.execute geralmente retorna [rows, fields] para MySQL
      return Array.isArray(result[0]) ? result[0] : result;
    } 
    else if (typeof db.query === 'function') {
      result = await db.query(query, params);
      // db.query para PostgreSQL retorna { rows }
      return result.rows || result;
    }
    else {
      throw new Error('Nenhum método de banco de dados disponível');
    }
  } catch (dbError) {
    authLogger.error(`Erro na operação ${operation}`, dbError, {
      query: query.substring(0, 200),
      params: params.map(p => typeof p === 'string' ? p.substring(0, 50) : p)
    });
    
    // Reclassificar erros comuns
    if (dbError.code === 'ER_ACCESS_DENIED_ERROR' || dbError.code === '28P01') {
      throw new Error('Credenciais de banco de dados inválidas');
    }
    if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ENOTFOUND') {
      throw new Error('Banco de dados indisponível');
    }
    if (dbError.code === 'ER_NO_SUCH_TABLE') {
      throw new Error('Tabela não encontrada no banco de dados');
    }
    
    throw dbError;
  }
};

// Função para gerar token JWT
const generateToken = (user) => {
  try {
    const payload = {
      id: user.id,
      email: user.email,
      perfil: user.perfil,
      nome: user.nome,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas
    };
    
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
      { algorithm: 'HS256' }
    );
    
    authLogger.debug('Token JWT gerado', { 
      userId: user.id,
      expiresIn: '24h' 
    });
    
    return token;
  } catch (jwtError) {
    authLogger.error('Erro ao gerar token JWT', jwtError);
    throw new Error('Falha na geração do token de autenticação');
  }
};

// ===================== ROTAS DE AUTENTICAÇÃO =====================

// Rota de login - VERSÃO SUPER ROBUSTA
router.post('/login', logAuthRequest, validateLoginFields, async (req, res) => {
  const startTime = Date.now();
  const { email, password } = req.body;
  const sanitizedEmail = email.trim().toLowerCase();
  
  try {
    authLogger.info('Iniciando processo de login', { email: sanitizedEmail });
    
    // 1. BUSCAR USUÁRIO NO BANCO
    let user = null;
    try {
      authLogger.debug('Buscando usuário no banco', { email: sanitizedEmail });
      
      const query = `
        SELECT 
          id, nome, email, senha_hash as senha, perfil, 
          telefone, organizacao, provincia, distrito, created_at
        FROM usuarios 
        WHERE email = ?
        LIMIT 1
      `;
      
      const users = await safeDbQuery(query, [sanitizedEmail], 'buscar-usuario');
      
      if (!users || users.length === 0) {
        authLogger.warn('Usuário não encontrado', { email: sanitizedEmail });
        
        // Pequeno delay para evitar timing attacks
        await bcrypt.compare('dummy_password', '$2a$12$dummyhashdummyhashdummyhashdummyhash');
        
        return res.status(401).json({
          success: false,
          error: 'Credenciais inválidas',
          code: 'INVALID_CREDENTIALS'
        });
      }
      
      user = users[0];
      authLogger.info('Usuário encontrado', { 
        userId: user.id,
        nome: user.nome,
        perfil: user.perfil 
      });
      
    } catch (dbError) {
      authLogger.error('Falha na busca do usuário', dbError, { email: sanitizedEmail });
      
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'DATABASE_ERROR',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
    
    // 2. VALIDAR ESTRUTURA DO USUÁRIO
    if (!user || typeof user !== 'object') {
      authLogger.error('Estrutura de usuário inválida', null, { user });
      
      return res.status(500).json({
        success: false,
        error: 'Erro interno - Dados do usuário corrompidos',
        code: 'CORRUPTED_USER_DATA'
      });
    }
    
    if (!user.senha || typeof user.senha !== 'string') {
      authLogger.error('Usuário sem senha hash válida', null, { userId: user.id });
      
      return res.status(500).json({
        success: false,
        error: 'Erro de configuração da conta',
        code: 'INVALID_USER_PASSWORD'
      });
    }
    
    // 3. VERIFICAR SENHA
    let isPasswordValid = false;
    try {
      authLogger.debug('Verificando senha', { userId: user.id });
      
      // Verificar se o hash parece ser um hash bcrypt válido
      if (!user.senha.startsWith('$2a$') && !user.senha.startsWith('$2b$') && !user.senha.startsWith('$2y$')) {
        authLogger.error('Formato de hash de senha inválido', null, { 
          userId: user.id,
          hashStart: user.senha.substring(0, 20) 
        });
        
        return res.status(500).json({
          success: false,
          error: 'Erro de configuração da conta',
          code: 'INVALID_PASSWORD_HASH'
        });
      }
      
      isPasswordValid = await bcrypt.compare(password, user.senha);
      authLogger.debug('Resultado da verificação de senha', { 
        userId: user.id,
        isValid: isPasswordValid 
      });
      
    } catch (bcryptError) {
      authLogger.error('Erro na verificação de senha', bcryptError, { userId: user.id });
      
      return res.status(500).json({
        success: false,
        error: 'Erro interno de autenticação',
        code: 'PASSWORD_VERIFICATION_ERROR'
      });
    }
    
    if (!isPasswordValid) {
      authLogger.warn('Senha inválida', { 
        userId: user.id,
        email: sanitizedEmail 
      });
      
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // 4. GERAR TOKEN JWT
    let token;
    try {
      token = generateToken(user);
    } catch (tokenError) {
      authLogger.error('Falha na geração do token', tokenError, { userId: user.id });
      
      return res.status(500).json({
        success: false,
        error: 'Erro interno de autenticação',
        code: 'TOKEN_GENERATION_ERROR'
      });
    }
    
    // 5. PREPARAR RESPOSTA
    const userResponse = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      telefone: user.telefone || null,
      organizacao: user.organizacao || null,
      provincia: user.provincia || null,
      distrito: user.distrito || null,
      created_at: user.created_at
    };
    
    const responseTime = Date.now() - startTime;
    
    authLogger.info('Login realizado com sucesso', {
      userId: user.id,
      email: user.email,
      perfil: user.perfil,
      responseTime: `${responseTime}ms`
    });
    
    // 6. ENVIAR RESPOSTA
    res.json({
      success: true,
      token,
      user: userResponse,
      message: 'Login realizado com sucesso',
      expiresIn: '24h',
      timestamp: new Date().toISOString()
    });
    
  } catch (unexpectedError) {
    const responseTime = Date.now() - startTime;
    
    authLogger.error('Erro inesperado no processo de login', unexpectedError, {
      email: sanitizedEmail,
      responseTime: `${responseTime}ms`
    });
    
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        debug: unexpectedError.message
      })
    });
  }
});

// Rota de verificação de token
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        valid: false,
        error: 'Token não fornecido',
        code: 'MISSING_TOKEN'
      });
    }
    
    // Verificar token
    let decoded;
    try {
      decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
      );
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          valid: false,
          error: 'Token expirado',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          valid: false,
          error: 'Token inválido',
          code: 'INVALID_TOKEN'
        });
      }
      
      throw jwtError;
    }
    
    // Buscar usuário atualizado
    const users = await safeDbQuery(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito FROM usuarios WHERE id = ?',
      [decoded.id],
      'verificar-usuario'
    );
    
    if (!users || users.length === 0) {
      return res.status(401).json({
        valid: false,
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.json({
      valid: true,
      user: users[0],
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
    
  } catch (error) {
    authLogger.error('Erro na verificação do token', error);
    
    res.status(500).json({
      valid: false,
      error: 'Erro interno na verificação do token',
      code: 'VERIFICATION_ERROR'
    });
  }
});

// Rota de logout
router.post('/logout', (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  authLogger.info('Logout realizado', {
    tokenPresent: !!token,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    message: 'Logout realizado com sucesso',
    timestamp: new Date().toISOString()
  });
});

// Rota de refresh de token (se necessário no futuro)
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token é obrigatório',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }
    
    // Implementar lógica de refresh token aqui
    authLogger.info('Refresh token solicitado');
    
    res.json({
      success: true,
      message: 'Refresh token recebido (implementação pendente)'
    });
    
  } catch (error) {
    authLogger.error('Erro no refresh token', error);
    
    res.status(500).json({
      success: false,
      error: 'Erro interno no refresh token'
    });
  }
});

// Rota de verificação de saúde da autenticação
router.get('/health', async (req, res) => {
  const healthCheck = {
    success: true,
    service: 'authentication',
    timestamp: new Date().toISOString(),
    status: 'operational',
    checks: {}
  };
  
  try {
    // Verificar conexão com banco
    healthCheck.checks.database = 'connected';
    await safeDbQuery('SELECT 1', [], 'health-check');
  } catch (error) {
    healthCheck.checks.database = 'disconnected';
    healthCheck.status = 'degraded';
    healthCheck.message = 'Banco de dados offline';
  }
  
  // Verificar bcrypt
  try {
    await bcrypt.compare('test', '$2a$12$dummyhash');
    healthCheck.checks.bcrypt = 'operational';
  } catch (error) {
    healthCheck.checks.bcrypt = 'failed';
    healthCheck.status = 'degraded';
  }
  
  // Verificar JWT
  try {
    jwt.sign({ test: true }, 'test');
    healthCheck.checks.jwt = 'operational';
  } catch (error) {
    healthCheck.checks.jwt = 'failed';
    healthCheck.status = 'degraded';
  }
  
  res.json(healthCheck);
});

// ===================== ROTAS DE DEBUG (APENAS DESENVOLVIMENTO) =====================

if (process.env.NODE_ENV !== 'production') {
  // Rota para verificar hash de senha de um usuário
  router.post('/debug/check-password', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email é obrigatório'
        });
      }
      
      const users = await safeDbQuery(
        'SELECT email, senha_hash FROM usuarios WHERE email = ?',
        [email],
        'debug-check-password'
      );
      
      if (users.length === 0) {
        return res.json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }
      
      const user = users[0];
      const isValid = password ? await bcrypt.compare(password, user.senha_hash) : null;
      
      res.json({
        success: true,
        data: {
          email: user.email,
          hashStart: user.senha_hash.substring(0, 30) + '...',
          hashLength: user.senha_hash.length,
          isBcrypt: user.senha_hash.startsWith('$2'),
          passwordValid: isValid,
          possibleIssues: !user.senha_hash.startsWith('$2') ? 'Hash não parece ser bcrypt' : null
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Rota para gerar hash de senha
  router.get('/debug/generate-hash/:password?', (req, res) => {
    const password = req.params.password || 'demo123';
    const hash = bcrypt.hashSync(password, 12);
    
    res.json({
      password,
      hash,
      sqlCommand: `UPDATE usuarios SET senha_hash = '${hash}' WHERE email = 'seu-email@exemplo.com';`
    });
  });
  
  // Rota para resetar senha de um usuário
  router.post('/debug/reset-password', async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      
      if (!email || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Email e nova senha são obrigatórios'
        });
      }
      
      const hash = bcrypt.hashSync(newPassword, 12);
      
      const result = await safeDbQuery(
        'UPDATE usuarios SET senha_hash = ? WHERE email = ?',
        [hash, email],
        'debug-reset-password'
      );
      
      res.json({
        success: true,
        message: 'Senha redefinida',
        email,
        affectedRows: result.affectedRows || result.rowCount || 0
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

// ===================== EXPORTAÇÃO =====================
module.exports = router;

// Log de inicialização
authLogger.info('Rotas de autenticação carregadas', {
  routes: ['POST /login', 'GET /verify', 'POST /logout', 'GET /health'],
  environment: process.env.NODE_ENV || 'development',
  hasDatabase: !!db && (typeof db.execute === 'function' || typeof db.query === 'function'),
  timestamp: new Date().toISOString()
});
