const winston = require('winston');

// Logger seguro e simples - sem recursão
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'climate-adaptation-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log'
    })
  ]
});

// Middleware de request seguro
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log da requisição
  logger.info('Requisição recebida', {
    ip: req.ip,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Log da resposta
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Resposta enviada', {
      duration: `${duration}ms`,
      method: req.method,
      statusCode: res.statusCode,
      timestamp: new Date().toISOString(),
      url: req.url
    });
  });

  next();
};

// Middleware de autenticação
const authLogger = (req, res, next) => {
  logger.info('Middleware de autenticação', {
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
    tokenPresent: !!req.headers.authorization
  });
  next();
};

module.exports = {
  logger,
  requestLogger,
  authLogger
};