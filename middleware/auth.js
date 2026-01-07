const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    // 1. Verifica se o header existe
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido ou formato inválido'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 2. Decodifica o Token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
    );

    // 3. BUSCA INTELIGENTE DO ID (Evita o erro de "undefined reading id")
    // Tenta pegar o ID de 'id', 'userId', 'sub' ou de dentro de um objeto 'user'
    const userId = decoded.id || decoded.userId || (decoded.user && decoded.user.id) || decoded.sub;

    if (!userId) {
      console.error('❌ Payload do Token JWT não contém um ID reconhecível:', decoded);
      return res.status(401).json({
        success: false,
        error: 'Token inválido: Identificador do usuário não encontrado'
      });
    }
    
    // 4. Busca no banco usando o novo db.execute() do seu database.js
    // A desestruturação [users] agora funciona porque o database.js retorna o formato padrão
    const [users] = await db.execute(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito FROM usuarios WHERE id = ?',
      [userId]
    );
    
    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Sessão inválida: Usuário não existe mais no sistema'
      });
    }
    
    // 5. Anexa o usuário à requisição para uso nas rotas (como as de sessões)
    req.user = users[0];
    req.userId = users[0].id;
    
    console.log(`✅ [AUTH] ${req.user.email} autenticado com sucesso (ID: ${req.user.id})`);
    next();
    
  } catch (error) {
    console.error('❌ [AUTH ERROR]:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Sessão expirada. Por favor, faça login novamente.', 
        code: 'TOKEN_EXPIRED' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      error: 'Falha na autenticação: Token inválido ou corrompido' 
    });
  }
};

/**
 * Middleware para restringir acesso por perfil (ex: admin, facilitador)
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.perfil)) {
      console.warn(`🚫 [ACCESS DENIED] Usuário ${req.user?.email} tentou acessar rota restrita.`);
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: você não tem permissão para realizar esta ação'
      });
    }
    next();
  };
};

module.exports = authMiddleware; 
module.exports.authenticateToken = authMiddleware;
module.exports.requireRole = requireRole;
