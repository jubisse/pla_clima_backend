const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { createUploadDirs } = require('./config/upload');

// SIMPLE LOGGERS
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toLocaleString('pt-MZ');
  console.log(`📍 ${timestamp} | ${req.method} ${req.url} | IP: ${req.ip}`);
  next();
};

const errorLogger = (err, req, res, next) => {
  console.error(`💥 ERRO em ${req.method} ${req.url}:`, err.message);
  next(err);
};

// IMPORT ROUTES
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const usuarioRoutes = require('./routes/usuario');
const sessionsRoutes = require('./routes/sessions');
const votingRoutes = require('./routes/voting');
const learningRoutes = require('./routes/learning');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

// ===================== EXPRESS APP =====================
const app = express();
const PORT = process.env.PORT || 5000;

// 🔥 ESTE COMANDO TEM QUE VIR DEPOIS DE app CRIADO!
app.set("trust proxy", 1);

// ===================== CONFIGURAÇÕES INICIAIS =====================
(async () => {
  try {
    console.log('🚀 Iniciando configurações iniciais...');

    await createUploadDirs();
    await require('./scripts/initDatabaseSimple')();

    console.log('✅ Configurações iniciais concluídas!');
  } catch (error) {
    console.error('❌ Erro nas configurações iniciais:', error.message);
    console.log('⚠️ Continuando...');
  }
})();

// ===================== MIDDLEWARES GLOBAIS =====================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static('uploads'));
app.use(requestLogger);

// RATE LIMIT
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

// ===================== ROTAS =====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/sessoes', sessionsRoutes);
app.use('/api/votacao', votingRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor operacional',
  });
});

// ===================== ERROS =====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada'
  });
});

app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor'
  });
});

// ===================== INICIAR SERVIDOR =====================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Encerrando...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('🛑 Encerrando...');
  server.close(() => process.exit(0));
});

module.exports = app;
