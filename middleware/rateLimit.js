const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// Rate limiting para autenticação
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 tentativas
    message: {
        success: false,
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    handler: (req, res) => {
        logger.warn('Rate limit excedido', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        
        res.status(429).json({
            success: false,
            error: 'Muitas tentativas. Tente novamente em 15 minutos.'
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting geral para API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requisições por IP
    message: {
        success: false,
        error: 'Muitas requisições. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting mais restritivo para uploads
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10, // máximo 10 uploads por hora
    message: {
        success: false,
        error: 'Limite de uploads excedido. Tente novamente em 1 hora.'
    }
});

module.exports = {
    authLimiter,
    apiLimiter,
    uploadLimiter
};