// config/constants.js
module.exports = {
    // Configurações JWT
    JWT: {
        SECRET: process.env.JWT_SECRET || 'seu_jwt_secret_super_seguro_aqui_mudar_em_producao',
        EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'seu_refresh_secret_aqui',
        REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
    },

    // Configurações de perfis de usuário
    USER_ROLES: {
        ADMIN: 'admin',
        FACILITADOR: 'facilitador',
        PARTICIPANTE: 'participante'
    },

    // Configurações de upload
    UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
        UPLOAD_DIR: 'uploads'
    },

    // Configurações de rate limiting
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15 minutos
        MAX_REQUESTS: 100 // máximo de requisições por windowMs
    },

    // Configurações do banco de dados
    DB: {
        MAX_CONNECTIONS: 10,
        IDLE_TIMEOUT: 30000,
        CONNECTION_TIMEOUT: 10000
    },

    // Configurações da aplicação
    APP: {
        NAME: 'Sistema de Adaptação Climática',
        VERSION: '1.0.0',
        ENVIRONMENT: process.env.NODE_ENV || 'development'
    }
};