const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    // Obter token do header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verificar token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
    );
    
    // Buscar usuário no banco
    const [users] = await db.execute(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito FROM usuarios WHERE id = ?',
      [decoded.id]
    );
    
    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }
    
    // Adicionar usuário à requisição
    req.user = users[0];
    req.userId = users[0].id;
    
    console.log(`👤 Usuário autenticado: ${req.user.email} (ID: ${req.user.id})`);
    
    next();
    
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }
    
    res.status(401).json({
      success: false,
      error: 'Falha na autenticação'
    });
  }
};

module.exports = authMiddleware;
module.exports.authenticateToken = authMiddleware;
module.exports.authMiddleware = authMiddleware;
