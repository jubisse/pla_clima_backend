const winston = require('winston');
const path = require('path');

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'DD/MM/YYYY, HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} | ${level.toUpperCase()} | ${message}`;
    
    if (stack) {
      log += `\n📍 ${stack}`;
    }
    
    // Adicionar metadados se existirem
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Criar o logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'climate-adaptation-api' },
  transports: [
    // Logs de console para desenvolvimento
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // Arquivo para todos os logs
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Arquivo separado para erros
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Logger simplificado para uso imediato
const simpleLogger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${new Date().toLocaleString()} | ${message}`, Object.keys(meta).length ? meta : '');
    logger.info(message, meta);
  },
  
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${new Date().toLocaleString()} | ${message}`, Object.keys(meta).length ? meta : '');
    logger.error(message, meta);
  },
  
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toLocaleString()} | ${message}`, Object.keys(meta).length ? meta : '');
    logger.warn(message, meta);
  },
  
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${new Date().toLocaleString()} | ${message}`, Object.keys(meta).length ? meta : '');
    }
    logger.debug(message, meta);
  }
};

module.exports = simpleLogger;