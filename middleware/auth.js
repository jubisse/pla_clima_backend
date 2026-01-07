const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
    );

    // ✅ CORREÇÃO CRÍTICA: Tenta encontrar o ID em diferentes formatos comuns
    const userId = decoded.id || decoded.userId || (decoded.user && decoded.user.id) || decoded.sub;

    if (!userId) {
      console.error('❌ Payload do Token JWT não contém um ID válido:', decoded);
      return res.status(401).json({
        success: false,
        error: 'Token inválido: ID não encontrado'
      });
    }
    
    // Busca usuário no banco usando query()
    const [users] = await db.query(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito FROM usuarios WHERE id = ?',
      [userId]
    );
    
    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não encontrado no banco de dados'
      });
    }
    
    req.user = users[0];
    req.userId = users[0].id;
    
    console.log(`👤 Usuário autenticado com sucesso: ${req.user.email} (ID: ${req.user.id})`);
    next();
    
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    
    res.status(401).json({ success: false, error: 'Falha na autenticação: ' + error.message });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.perfil)) {
      console.error(`🚫 Acesso negado para o perfil: ${req.user?.perfil}`);
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: privilégios insuficientes'
      });
    }
    next();
  };
};

module.exports = authMiddleware; 
module.exports.authenticateToken = authMiddleware;
module.exports.requireRole = requireRole;
