// backend/middleware/auth.js - VERSÃO COMPLETAMENTE CORRIGIDA
const jwt = require('jsonwebtoken');

// ✅ LOGGER SIMPLES E CONFIÁVEL
const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.log(`[INFO] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.error(`[ERROR] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  warn: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.warn(`[WARN] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toLocaleString('pt-MZ');
      console.log(`[DEBUG] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : '');
    }
  }
};

// ✅ DEFINIR USER_ROLES NO PRÓPRIO ARQUIVO
const USER_ROLES = {
  ADMIN: 'admin',
  FACILITADOR: 'facilitador',
  PARTICIPANTE: 'participante',
  COORDENADOR: 'coordenador'
};

// ✅ MIDDLEWARE DE AUTENTICAÇÃO PRINCIPAL
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  logger.info('Verificando autenticação', { 
    hasAuthHeader: !!authHeader,
    tokenLength: token ? token.length : 0,
    path: req.path,
    method: req.method
  });

  if (token == null) {
    logger.warn('Acesso negado - Token não fornecido', { path: req.path });
    return res.status(401).json({ 
      success: false,
      message: 'Token de acesso não fornecido' 
    });
  }

  // ✅ SECRET FALLBACK PARA DESENVOLVIMENTO
  const jwtSecret = process.env.JWT_SECRET || 'dev_secret_fallback_2024_climate_adaptation';
  
  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      logger.error('Token inválido', { 
        error: err.message,
        path: req.path 
      });
      
      return res.status(403).json({ 
        success: false,
        message: 'Token inválido ou expirado'
      });
    }

    logger.info('Usuário autenticado com sucesso', { 
      userId: user.id, 
      email: user.email,
      perfil: user.perfil,
      path: req.path
    });

    req.user = user;
    next();
  });
};

// ✅ MIDDLEWARE DE AUTORIZAÇÃO POR PERFIL
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error('Tentativa de autorização sem usuário autenticado');
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    logger.debug('Verificando permissões', {
      userId: req.user.id,
      userProfile: req.user.perfil,
      requiredProfiles: allowedRoles,
      path: req.path
    });

    if (!allowedRoles.includes(req.user.perfil)) {
      logger.warn('Acesso negado - Perfil não autorizado', {
        userId: req.user.id,
        userProfile: req.user.perfil,
        requiredProfiles: allowedRoles,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Acesso não autorizado para o seu perfil'
      });
    }

    logger.debug('Autorização concedida por perfil', {
      userId: req.user.id,
      profile: req.user.perfil,
      path: req.path
    });

    next();
  };
};

// ✅ MIDDLEWARE DE PROPRIEDADE OU PERFIL
const requireOwnershipOrRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error('Tentativa de autorização sem usuário autenticado');
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    const resourceUserId = req.params.userId || req.params.id;
    const isOwner = resourceUserId && resourceUserId === req.user.id.toString();
    const hasRequiredRole = allowedRoles.includes(req.user.perfil);

    logger.debug('Verificando propriedade ou perfil', {
      userId: req.user.id,
      resourceUserId: resourceUserId,
      isOwner: isOwner,
      userProfile: req.user.perfil,
      hasRequiredRole: hasRequiredRole,
      path: req.path
    });

    if (!isOwner && !hasRequiredRole) {
      logger.warn('Acesso negado - Não é proprietário nem tem perfil adequado', {
        userId: req.user.id,
        resourceUserId: resourceUserId,
        userProfile: req.user.perfil,
        requiredProfiles: allowedRoles,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Acesso não autorizado - você não é o proprietário nem tem permissão suficiente'
      });
    }

    logger.debug('Autorização concedida por propriedade ou perfil', {
      userId: req.user.id,
      authorizedBy: isOwner ? 'ownership' : 'role',
      path: req.path
    });

    next();
  };
};

// ✅ MIDDLEWARE OPCIONAL (não bloqueia se não tiver token)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_fallback_2024_climate_adaptation';
    
    jwt.verify(token, jwtSecret, (err, user) => {
      if (!err) {
        logger.debug('Usuário autenticado (opcional)', { userId: user.id });
        req.user = user;
      }
      next();
    });
  } else {
    next();
  }
};

// ✅ EXPORTAR TUDO CORRETAMENTE
module.exports = { 
  authenticateToken, 
  requireRole,
  requireOwnershipOrRole,
  optionalAuth,
  USER_ROLES
};