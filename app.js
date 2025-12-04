const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { createUploadDirs } = require('./config/upload');
const db = require('./config/database');

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
      'https://pla-clima-backend.onrender.com'
    ].filter(Boolean);

    // Allow requests with no origin (like mobile apps or curl requests)
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight requests

// Trust proxy for rate limiting and real IP
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'production' ? 100 : 1000, // Max requests per window
  message: {
    success: false,
    error: 'Muitas requisições. Tente novamente mais tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request logging middleware
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toLocaleString('pt-MZ');
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
  
  console.log(`📍 ${timestamp} | ${req.method} ${req.originalUrl} | IP: ${ip}`);
  
  // Log body for debugging (except sensitive data)
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '***';
    if (safeBody.senha) safeBody.senha = '***';
    if (safeBody.senha_hash) safeBody.senha_hash = '***';
    if (safeBody.token) safeBody.token = '***';
    
    console.log(`📦 Body:`, JSON.stringify(safeBody));
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

    // Create upload directories
    await createUploadDirs();
    
    // Test database connection
    console.log('🔍 Testando conexão com o banco...');
    try {
      const [testResult] = await db.execute('SELECT 1 as test');
      console.log('✅ Conexão com banco de dados OK');
    } catch (dbError) {
      console.error('❌ Erro na conexão com banco:', dbError.message);
      // Não lançamos o erro em produção, apenas logamos
      if (NODE_ENV !== 'production') {
        throw dbError;
      }
    }

    // Initialize database only in development
    if (NODE_ENV !== 'production') {
      try {
        await require('./scripts/initDatabaseSimple')();
        console.log('✅ Banco de dados inicializado');
      } catch (initError) {
        console.warn('⚠️ Erro na inicialização do banco:', initError.message);
      }
    } else {
      console.log("⚠️ Inicialização do banco ignorada em produção.");
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

// ===================== ROTAS DE DEBUG =====================
// Estas rotas devem ser removidas em produção ou protegidas

// Test database connection
app.get('/api/debug/test-db', async (req, res) => {
  try {
    console.log('🔍 Testando conexão com MySQL...');
    const [result] = await db.execute('SELECT 1 as test');
    res.json({ 
      success: true, 
      message: 'Conexão com MySQL OK',
      data: result,
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  } catch (error) {
    console.error('❌ Erro na conexão MySQL:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      environment: NODE_ENV
    });
  }
});

// List all users
app.get('/api/debug/users', async (req, res) => {
  try {
    console.log('🔍 Listando usuários...');
    const [users] = await db.execute('SELECT id, nome, email, perfil, created_at FROM usuarios ORDER BY id');
    
    // Remove sensitive info for logging
    const safeUsers = users.map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil }));
    console.log(`👥 ${users.length} usuários encontrados`);
    
    res.json({ 
      success: true, 
      count: users.length,
      users: safeUsers,
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

// Generate password hash (temporary)
app.get('/api/debug/generate-hash', (req, res) => {
  if (NODE_ENV === 'production' && !req.query.admin) {
    return res.status(403).json({ success: false, error: 'Acesso negado em produção' });
  }
  
  const bcrypt = require('bcryptjs');
  const password = req.query.password || 'demo123';
  const hash = bcrypt.hashSync(password, 12);
  
  res.json({
    password: password,
    hash: hash,
    length: hash.length,
    sqlCommand: `UPDATE usuarios SET senha_hash = '${hash}' WHERE email = 'jane@demo.mz';`
  });
});

// Check specific user's password
app.post('/api/debug/check-user-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório' });
    }
    
    const [users] = await db.execute(
      'SELECT email, senha_hash FROM usuarios WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      return res.json({ success: false, error: 'Usuário não encontrado' });
    }
    
    const user = users[0];
    res.json({
      success: true,
      user: {
        email: user.email,
        hash_start: user.senha_hash.substring(0, 30) + '...',
        hash_length: user.senha_hash.length,
        is_bcrypt: user.senha_hash.startsWith('$2a$')
      }
    });
  } catch (error) {
    console.error('❌ Erro ao verificar senha:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== IMPORTAR ROTAS PRINCIPAIS =====================
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

// ===================== ROTAS DE SISTEMA =====================

// Health check endpoint (for Render health checks)
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const [dbTest] = await db.execute('SELECT 1 as test');
    
    res.json({
      success: true,
      message: 'Servidor operacional',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: process.uptime(),
      database: 'connected',
      memory: process.memoryUsage()
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Servidor com problemas',
      error: error.message,
      database: 'disconnected'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API PlaClima Backend',
    version: '1.0.0',
    environment: NODE_ENV,
    docs: '/api/docs', // Consider adding Swagger docs
    endpoints: {
      auth: '/api/auth',
      sessions: '/api/sessoes',
      voting: '/api/votacao',
      users: '/api/users',
      admin: '/api/admin',
      dashboard: '/api/dashboard'
    }
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
    timestamp: new Date().toISOString()
  });
});

// Global error handler
const errorLogger = (err, req, res, next) => {
  console.error(`💥 ERRO CRÍTICO em ${req.method} ${req.url}:`, {
    message: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
    body: req.body,
    params: req.params,
    query: req.query
  });
  next(err);
};

app.use(errorLogger);

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Erro interno do servidor';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
});

// ===================== INICIAR SERVIDOR =====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${NODE_ENV}`);
  console.log(`🔗 URL: https://pla-clima-backend.onrender.com`);
  console.log(`📊 Health check: https://pla-clima-backend.onrender.com/api/health`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} recebido. Encerrando...`);
  
  server.close(() => {
    console.log('✅ Servidor HTTP encerrado');
    
    // Close database connections if any
    if (db.end) {
      db.end((err) => {
        if (err) console.error('❌ Erro ao fechar conexões do banco:', err);
        console.log('✅ Conexões do banco encerradas');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Shutdown forçado após timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Exceção não capturada:', error);
  // Don't exit in production, let the process continue
  if (NODE_ENV === 'production') {
    console.log('⚠️ Continuando apesar da exceção não capturada');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promise rejeitada não tratada:', reason);
});

module.exports = app;