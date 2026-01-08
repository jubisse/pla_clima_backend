const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { createUploadDirs } = require('./config/upload');
const authMiddleware = require('./middleware/auth');

// ===================== CONFIGURAÇÃO DE BANCO =====================
let db;
try {
  db = require('./config/database');
  console.log('✅ Módulo database carregado com sucesso');
} catch (error) {
  console.error('❌ ERRO CRÍTICO: Não foi possível carregar módulo database:', error.message);
  // Criar stub para evitar crash
  db = {
    execute: async () => {
      console.error('⚠️ Tentativa de usar database não disponível');
      throw new Error('Database module not loaded');
    }
  };
}

// ===================== CONFIGURAÇÕES =====================
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===================== MIDDLEWARES GLOBAIS =====================

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://climatica.sotservice.co.mz',
      'https://pla-clima-backend.onrender.com',
      'http://localhost:3000'
    ].filter(Boolean);

    // Permitir requisições sem origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS bloqueado: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Trust proxy para Render
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    // Corrigindo o erro de validação IPv6:
    validate: { xForwardedForHeader: false }, 
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            message: "Muitas requisições. Tente novamente mais tarde."
        });
    }
});

app.use('/api/', limiter);

// Logging middleware
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toLocaleString('pt-MZ');
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;
  
  console.log(`📍 ${timestamp} | ${req.method} ${req.originalUrl} | IP: ${ip}`);
  
  // Log body (sensível ofuscado)
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    ['password', 'senha', 'senha_hash', 'token', 'jwt', 'refreshToken'].forEach(key => {
      if (safeBody[key]) safeBody[key] = '***';
    });
    if (Object.keys(safeBody).length > 0) {
      console.log(`📦 Body:`, JSON.stringify(safeBody).substring(0, 500));
    }
  }
  
  next();
};

app.use(requestLogger);

// Static files
app.use('/uploads', express.static('uploads'));

// ===================== CONFIGURAÇÕES INICIAIS =====================
(async () => {
  try {
    console.log('🚀 Iniciando configurações iniciais...');
    console.log(`🌍 Ambiente: ${NODE_ENV}`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`🔗 URL Base: https://pla-clima-backend.onrender.com`);

    // Criar diretórios de upload
    await createUploadDirs();
    console.log('✅ Diretórios de upload verificados/criados');
    
    // Testar conexão com banco
    console.log('🔍 Testando conexão com MySQL...');
    try {
      if (typeof db.execute === 'function') {
        const [testResult] = await db.execute('SELECT 1 as test, NOW() as timestamp');
        console.log('✅ Conexão MySQL OK:', testResult[0]);
      } else {
        console.warn('⚠️ db.execute não é uma função. Verifique config/database.js');
      }
    } catch (dbError) {
      console.error('❌ Erro na conexão MySQL:', {
        message: dbError.message,
        code: dbError.code,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306
      });
      
      if (NODE_ENV !== 'production') {
        throw dbError;
      } else {
        console.log('⚠️ Continuando sem conexão ao banco...');
      }
    }

    // Inicializar banco apenas em desenvolvimento
    if (NODE_ENV !== 'production') {
      try {
        const initDb = require('./scripts/initDatabaseSimple');
        await initDb();
        console.log('✅ Banco de dados inicializado para desenvolvimento');
      } catch (initError) {
        console.warn('⚠️ Erro na inicialização do banco:', initError.message);
      }
    } else {
      console.log("⚠️ Inicialização automática do banco ignorada em produção");
    }

    console.log('✅ Configurações iniciais concluídas!');
  } catch (error) {
    console.error('❌ Erro nas configurações iniciais:', error.message);
    if (NODE_ENV === 'production') {
      console.log('⚠️ Continuando apesar do erro...');
    } else {
      throw error;
    }
  }
})();

// ===================== ROTAS DE DEBUG E DIAGNÓSTICO =====================

// Teste de conexão com banco
app.get('/api/debug/test-db', async (req, res) => {
  try {
    console.log('🔍 Testando conexão MySQL via API...');
    
    if (typeof db.execute !== 'function') {
      return res.status(503).json({
        success: false,
        error: 'Módulo database não carregado corretamente',
        environment: NODE_ENV
      });
    }
    
    const [result] = await db.execute('SELECT 1 as test, NOW() as server_time, DATABASE() as database_name, USER() as mysql_user');
    
    res.json({
      success: true,
      message: 'Conexão MySQL OK',
      data: result[0],
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      dbConfig: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
      }
    });
  } catch (error) {
    console.error('❌ Erro no teste MySQL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      environment: NODE_ENV,
      dbConfig: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
      }
    });
  }
});

// Listar usuários (apenas desenvolvimento)
app.get('/api/debug/users', async (req, res) => {
  if (NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado em produção'
    });
  }
  
  try {
    const [users] = await db.execute('SELECT id, nome, email, perfil, created_at FROM usuarios ORDER BY id');
    
    res.json({
      success: true,
      count: users.length,
      users: users,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Gerar hash de senha (apenas desenvolvimento)
app.get('/api/debug/generate-hash', (req, res) => {
  if (NODE_ENV === 'production' && !req.query.admin) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado em produção'
    });
  }
  
  const bcrypt = require('bcryptjs');
  const password = req.query.password || 'demo123';
  const hash = bcrypt.hashSync(password, 12);
  
  res.json({
    password: password,
    hash: hash,
    length: hash.length,
    sqlCommand: `UPDATE usuarios SET senha_hash = '${hash}' WHERE email = 'seu-email@exemplo.com';`
  });
});

// Verificar senha de usuário (apenas desenvolvimento)
app.post('/api/debug/check-password', async (req, res) => {
  if (NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado em produção'
    });
  }
  
  try {
    const { email, password } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      });
    }
    
    const [users] = await db.execute(
      'SELECT id, email, senha_hash FROM usuarios WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      return res.json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }
    
    const user = users[0];
    const bcrypt = require('bcryptjs');
    const isValid = password ? await bcrypt.compare(password, user.senha_hash) : null;
    
    res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        hashStart: user.senha_hash.substring(0, 30) + '...',
        hashLength: user.senha_hash.length,
        isBcrypt: user.senha_hash.startsWith('$2a$') || user.senha_hash.startsWith('$2b$'),
        passwordValid: isValid,
        issues: !user.senha_hash.startsWith('$2') ? 'Hash não parece ser bcrypt' : null
      }
    });
  } catch (error) {
    console.error('❌ Erro ao verificar senha:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===================== IMPORTAR ROTAS PRINCIPAIS =====================
const activitiesRoutes = require('./routes/activities');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const usuarioRoutes = require('./routes/usuario');
const sessionsRoutes = require('./routes/sessions');
const votingRoutes = require('./routes/voting');
const learningRoutes = require('./routes/learning');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

// ===================== ROTAS PRINCIPAIS =====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/sessoes', sessionsRoutes);
app.use('/api/votacao', votingRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', activitiesRoutes);

// ===================== ROTAS DE SISTEMA =====================

// Health check para Render
app.get('/api/health', async (req, res) => {
  const healthData = {
    success: true,
    message: 'Servidor operacional',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      server: 'operational',
      database: 'unknown'
    }
  };
  
  try {
    // Testar conexão com banco
    if (typeof db.execute === 'function') {
      const [testResult] = await db.execute('SELECT 1 as test');
      healthData.checks.database = 'connected';
      healthData.database = {
        status: 'connected',
        type: 'MySQL',
        test: testResult[0]
      };
    } else {
      healthData.checks.database = 'module_not_loaded';
      healthData.database = {
        status: 'disconnected',
        error: 'Módulo database não carregado'
      };
    }
  } catch (error) {
    healthData.success = false;
    healthData.message = 'Servidor com problemas no banco de dados';
    healthData.status = 'degraded';
    healthData.checks.database = 'disconnected';
    healthData.database = {
      status: 'disconnected',
      error: error.message,
      code: error.code
    };
    
    return res.status(503).json(healthData);
  }
  
  res.json(healthData);
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API PlaClima Backend',
    version: '2.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    documentation: 'https://github.com/seu-repo/docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      sessions: '/api/sessoes',
      voting: '/api/votacao',
      learning: '/api/learning',
      admin: '/api/admin',
      dashboard: '/api/dashboard',
      health: '/api/health',
      docs: '/api/docs'
    },
    status: 'operational',
    uptime: process.uptime()
  });
});

// ===================== MANEJO DE ERROS =====================

// 404 - Rota não encontrada
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: [
      'Verifique a URL',
      'Consulte a documentação em /',
      'Entre em contato com o suporte'
    ]
  });
});

// Global error handler
const errorLogger = (err, req, res, next) => {
  console.error(`💥 ERRO CRÍTICO em ${req.method} ${req.url}:`, {
    message: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
    body: req.body ? JSON.stringify(req.body).substring(0, 500) : null,
    params: req.params,
    query: req.query,
    ip: req.headers['x-forwarded-for'] || req.ip
  });
  next(err);
};

app.use(errorLogger);

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const message = NODE_ENV === 'production' && statusCode === 500 
    ? 'Erro interno do servidor' 
    : error.message;
  
  const response = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };
  
  if (NODE_ENV === 'development') {
    response.stack = error.stack;
    response.details = {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
  }
  
  res.status(statusCode).json(response);
});

// ===================== INICIAR SERVIDOR =====================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${NODE_ENV}`);
  console.log(`🔗 URL: https://pla-clima-backend.onrender.com`);
  console.log(`📊 Health check: https://pla-clima-backend.onrender.com/api/health`);
  console.log(`📈 Status: https://pla-clima-backend.onrender.com`);
  console.log(`🔍 Debug: https://pla-clima-backend.onrender.com/api/debug/test-db`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} recebido. Encerrando graciosamente...`);
  
  server.close(async () => {
    console.log('✅ Servidor HTTP encerrado');
    
    // Encerrar conexões do banco
    try {
      if (db && typeof db.end === 'function') {
        await new Promise((resolve, reject) => {
          db.end((err) => {
            if (err) {
              console.error('❌ Erro ao fechar conexões do banco:', err);
              reject(err);
            } else {
              console.log('✅ Conexões do banco encerradas');
              resolve();
            }
          });
        });
      }
    } catch (dbError) {
      console.error('❌ Erro no encerramento do banco:', dbError);
    }
    
    console.log('👋 Encerramento completo');
    process.exit(0);
  });

  // Shutdown forçado após 30 segundos
  setTimeout(() => {
    console.error('❌ Shutdown forçado após timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 EXCEÇÃO NÃO CAPTURADA:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  if (NODE_ENV === 'production') {
    console.log('⚠️ Continuando apesar da exceção não capturada...');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 PROMISE REJEITADA NÃO TRATADA:', {
    reason: reason?.message || reason,
    promise: promise,
    timestamp: new Date().toISOString()
  });
});

// ===================== EXPORTAÇÃO =====================
module.exports = app;
