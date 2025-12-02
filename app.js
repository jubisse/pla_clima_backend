// app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Configurações - IMPORTAR PRIMEIRO (sem dependências circulares)
const { createUploadDirs } = require('./config/upload');

// Middlewares - usar logger simples
//const { requestLogger, authLogger } = require('./middleware/simple-logger');

const requestLogger = (req, res, next) => {
  const timestamp = new Date().toLocaleString('pt-MZ');
  console.log(`📍 ${timestamp} | ${req.method} ${req.url} | IP: ${req.ip}`);
  next();
};

const errorLogger = (err, req, res, next) => {
  console.error(`💥 ERRO em ${req.method} ${req.url}:`, err.message);
  next(err);
};

// Rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const usuarioRoutes = require('./routes/usuario'); 
const sessionsRoutes = require('./routes/sessions');
const votingRoutes = require('./routes/voting');
const learningRoutes = require('./routes/learning');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
// const notificacaoRoutes = require('./routes/notificacoes');

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== CONFIGURAÇÕES INICIAIS ====================
(async () => {
    try {
        console.log('🚀 Iniciando configurações iniciais...');
        
        // 1. Criar diretórios de upload
        await createUploadDirs();
        
        // 3. Inicializar base de dados (versão simplificada)
        await require('./scripts/initDatabaseSimple')();
        
        console.log('✅ Configurações iniciais concluídas com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro nas configurações iniciais:', error.message);
        console.log('⚠️ Continuando inicialização...');
    }
})();

// ==================== MIDDLEWARES GLOBAIS ====================
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir ficheiros estáticos
app.use('/uploads', express.static('uploads'));

// Logging - usar logger simples
app.use(requestLogger);

// Rate limiting básico
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite de 100 requests por windowMs
});
app.use('/api/', apiLimiter);

// ==================== ROTAS ====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/sessoes', sessionsRoutes);
app.use('/api/votacao', votingRoutes);
app.use('/api/learning', learningRoutes);
//app.use('/api/notificacoes', notificacaoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor operacional',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API de Adaptação Climática',
        version: '1.0.0',
        documentation: '/api/health'
    });
});

// ==================== MANIPULAÇÃO DE ERROS SIMPLES ====================
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

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`⏰ Iniciado em: ${new Date().toLocaleString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Recebido SIGINT, encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado');
        process.exit(0);
    });
});

module.exports = app;