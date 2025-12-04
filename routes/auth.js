// routes/auth.js - VERSÃO SUPER ROBUSTA PARA POSTGRES
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Carregar a conexão PostgreSQL
let db;
try {
  db = require('../config/database');
  console.log('✅ PostgreSQL conectado nas rotas de auth');
} catch (dbError) {
  console.error('❌ ERRO CRÍTICO: Não foi possível carregar o módulo database:', dbError.message);
  db = {
    query: async () => {
      console.error('⚠️ Tentativa de usar db.query() sem módulo database');
      throw new Error('Módulo de banco de dados não disponível');
    }
  };
}

const router = express.Router();

// ===================== SISTEMA DE LOGGING =====================
const authLogger = {
  info: (msg, data = {}) => console.log(`🔐 AUTH INFO: ${msg}`, data),
  warn: (msg, data = {}) => console.warn(`⚠️ AUTH WARN: ${msg}`, data),
  error: (msg, error = null, context = {}) => {
    console.error(`❌ AUTH ERROR: ${msg}`);
    if (error) {
      console.error('   📍 Stack:', error.stack);
      console.error('   🔧 Context:', context);
    }
  },
  debug: (msg, data = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 AUTH DEBUG: ${msg}`, data);
    }
  }
};

// ===================== MIDDLEWARES =====================
const logAuthRequest = (req, res, next) => {
  authLogger.info("Tentativa de autenticação", {
    ip: req.headers['x-forwarded-for'] || req.ip,
    email: req.body.email || "não fornecido"
  });
  next();
};

const validateLoginFields = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    authLogger.warn("Campos ausentes");
    return res.status(400).json({ success: false, error: "Email e senha são obrigatórios" });
  }
  next();
};

// ===================== DB SAFE QUERY PARA POSTGRES =====================
const safeDbQuery = async (query, params = [], operation = 'query') => {
  try {
    authLogger.debug(`Executando query [${operation}]`, { query, params });

    const result = await db.query(query, params);

    return result.rows || [];
  } catch (err) {
    authLogger.error(`Erro na query [${operation}]`, err, { query, params });

    // Traduções úteis
    if (err.code === '28P01') throw new Error('Credenciais inválidas do banco');
    if (err.code === 'ECONNREFUSED') throw new Error('Banco indisponível');

    throw err;
  }
};

// ===================== JWT =====================
const generateToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    perfil: user.perfil,
    nome: user.nome,
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
    { expiresIn: '24h' }
  );
};

// ===================== POST /login =====================
router.post('/login', logAuthRequest, validateLoginFields, async (req, res) => {
  const { email, password } = req.body;
  const sanitizedEmail = email.trim().toLowerCase();

  try {
    // Buscar usuário no PostgreSQL
    const users = await safeDbQuery(`
      SELECT 
        id, nome, email, senha_hash AS senha,
        perfil, telefone, organizacao, provincia, distrito, created_at
      FROM usuarios
      WHERE email = $1
      LIMIT 1
    `, [sanitizedEmail], 'buscar-usuario');

    if (!users.length) {
      authLogger.warn("Usuário não encontrado");
      await bcrypt.compare("dummy", "$2a$12$invalidinvalidinvalidinvalidinvalidinv");
      return res.status(401).json({ success: false, error: "Credenciais inválidas" });
    }

    const user = users[0];

    // Validar senha
    const isPasswordValid = await bcrypt.compare(password, user.senha);

    if (!isPasswordValid) {
      authLogger.warn("Senha incorreta", { email });
      return res.status(401).json({ success: false, error: "Credenciais inválidas" });
    }

    // Gerar token
    const token = generateToken(user);

    // Resposta
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        telefone: user.telefone,
        organizacao: user.organizacao,
        provincia: user.provincia,
        distrito: user.distrito,
        created_at: user.created_at
      }
    });

  } catch (err) {
    authLogger.error("Erro inesperado no login", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ===================== GET /verify =====================
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) return res.status(401).json({ valid: false, error: "Token não fornecido" });

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
    );

    const users = await safeDbQuery(
      `SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito 
       FROM usuarios WHERE id = $1`,
      [decoded.id],
      'verificar-usuario'
    );

    if (!users.length) return res.status(401).json({ valid: false, error: "Usuário não encontrado" });

    res.json({
      valid: true,
      user: users[0],
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });

  } catch (err) {
    res.status(401).json({ valid: false, error: "Token inválido" });
  }
});

// ===================== POST /logout =====================
router.post('/logout', (req, res) => {
  authLogger.info("Logout efetuado");
  res.json({ success: true, message: "Logout realizado" });
});

// ===================== GET /health =====================
router.get('/health', async (req, res) => {
  try {
    await safeDbQuery('SELECT 1', [], 'health-check');
    res.json({ success: true, status: "operational" });
  } catch {
    res.json({ success: false, status: "degraded" });
  }
});

// ===================== DEBUG (dev only) =====================
if (process.env.NODE_ENV !== "production") {
  router.get('/debug/hash/:password', (req, res) => {
    const password = req.params.password;
    const hash = bcrypt.hashSync(password, 12);
    res.json({ password, hash });
  });
}

// ===================== EXPORTAÇÃO =====================
module.exports = router;

authLogger.info("Rotas de autenticação carregadas (PostgreSQL)");
