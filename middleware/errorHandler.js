const logger = require('./logger');

// Classe personalizada para erros da aplicação
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }
}

// Handler global de erros
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    error.statusCode = err.statusCode || 500;

    // Log do erro
    logger.error('Erro no servidor', err, {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    });

    // Erro de MySQL
    if (err.code) {
        switch (err.code) {
            case 'ER_DUP_ENTRY':
                error = new AppError('Registo duplicado', 409);
                break;
            case 'ER_NO_REFERENCED_ROW':
            case 'ER_ROW_IS_REFERENCED':
                error = new AppError('Violação de integridade referencial', 400);
                break;
            case 'ECONNREFUSED':
                error = new AppError('Serviço de base de dados indisponível', 503);
                break;
            default:
                error = new AppError('Erro na base de dados', 500);
        }
    }

    // Erro de JWT
    if (err.name === 'JsonWebTokenError') {
        error = new AppError('Token inválido', 401);
    }
    
    if (err.name === 'TokenExpiredError') {
        error = new AppError('Token expirado', 401);
    }

    // Erro de validação Joi
    if (err.isJoi) {
        const details = err.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));
        
        error = new AppError('Dados de entrada inválidos', 400);
        error.details = details;
    }

    // Erro de Multer (upload)
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = new AppError('Ficheiro muito grande', 413);
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
        error = new AppError('Número máximo de ficheiros excedido', 413);
    }

    const response = {
        success: false,
        error: error.message,
        ...(error.details && { details: error.details }),
        ...(process.env.NODE_ENV === 'development' && { 
            stack: error.stack,
            originalError: err.message 
        })
    };

    res.status(error.statusCode || 500).json(response);
};

// Handler para rotas não encontradas
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404);
    next(error);
};

module.exports = {
    AppError,
    errorHandler,
    notFoundHandler
};