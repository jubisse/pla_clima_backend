// routes/auth.js - VERSÃO DEFINITIVA CORRIGIDA
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const router = express.Router();

// Sistema de logging robusto
const authLogger = {
  info: (message) => console.log(`🔐 AUTH: ${message}`),
  error: (message, error) => {
    console.error(`❌ AUTH ERROR: ${message}`);
    if (error) console.error(`   Detalhes: ${error.message}`);
  },
  warn: (message) => console.log(`⚠️ AUTH: ${message}`)
};

// Middleware de logging
const logAuthRequest = (req, res, next) => {
  const { email } = req.body;
  authLogger.info(`Tentativa de login: ${email || 'email não fornecido'}`);
  next();
};

// Rota de login - VERSÃO COMPLETAMENTE CORRIGIDA
router.post('/login', logAuthRequest, async (req, res) => {
  console.log('🔄 INICIANDO PROCESSO DE LOGIN...');
  
  try {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      authLogger.warn('Tentativa de login sem email ou senha');
      return res.status(400).json({ 
        success: false,
        error: 'Email e senha são obrigatórios' 
      });
    }

    authLogger.info(`Buscando usuário: ${email}`);

    // BUSCAR USUÁRIO - ABORDAGEM SUPER SEGURA
    let userResults = [];
    try {
      console.log('🔍 Executando query no banco...');
      const query = 'SELECT id, nome, email, senha_hash as senha, perfil, telefone, organizacao, provincia, distrito, created_at FROM usuarios WHERE email = ?';
      const [rows] = await db.execute(query, [email.trim().toLowerCase()]);
      
      // GARANTIR que seja um array
      if (Array.isArray(rows)) {
        userResults = rows;
      } else if (rows) {
        // Se for um objeto único, coloca em um array
        userResults = [rows];
      } else {
        userResults = [];
      }

      console.log(`📊 Resultado bruto:`, rows);
      console.log(`👥 Usuários encontrados: ${userResults.length}`);
      
    } catch (dbError) {
      console.error('💥 ERRO NO BANCO:', dbError);
      authLogger.error('Erro ao buscar usuário no banco', dbError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro interno do servidor - Banco de dados' 
      });
    }

    // VERIFICAR SE USUÁRIO EXISTE
    if (!userResults || userResults.length === 0) {
      authLogger.warn(`Usuário não encontrado: ${email}`);
      return res.status(401).json({ 
        success: false,
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResults[0];
    console.log('✅ Usuário encontrado:', {
      id: user.id,
      nome: user.nome,
      email: user.email,
      temSenha: !!user.senha
    });

    // VERIFICAÇÃO DE SEGURANÇA EXTREMA
    if (!user || typeof user !== 'object') {
      authLogger.error('Usuário é inválido após busca');
      return res.status(500).json({ 
        success: false,
        error: 'Erro interno - Dados do usuário corrompidos' 
      });
    }

    if (!user.senha) {
      authLogger.error(`Usuário sem senha: ${user.email}`);
      return res.status(500).json({ 
        success: false,
        error: 'Erro de configuração do usuário' 
      });
    }

    // VERIFICAR SENHA
    authLogger.info('Verificando senha...');
    let validPassword = false;
    try {
      validPassword = await bcrypt.compare(password, user.senha);
      console.log(`🔑 Senha válida: ${validPassword}`);
    } catch (bcryptError) {
      authLogger.error('Erro ao comparar senhas', bcryptError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro interno - Autenticação' 
      });
    }
    
    if (!validPassword) {
      authLogger.warn(`Senha inválida para: ${email}`);
      return res.status(401).json({ 
        success: false,
        error: 'Credenciais inválidas' 
      });
    }

    // GERAR TOKEN JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      perfil: user.perfil,
      nome: user.nome
    };

    console.log('🎫 Gerando token JWT...');
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'fallback-secret-key-for-development-only',
      { expiresIn: '24h' }
    );

    // Preparar resposta sem a senha
    const userResponse = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      telefone: user.telefone,
      organizacao: user.organizacao,
      provincia: user.provincia,
      distrito: user.distrito,
      created_at: user.created_at
    };

    console.log('✅ Login bem-sucedido!');
    
    res.json({
      success: true,
      token,
      user: userResponse,
      message: 'Login realizado com sucesso'
    });

  } catch (error) {
    console.error('💥 ERRO CRÍTICO NO LOGIN:', error);
    authLogger.error('Erro crítico no processo de login', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor' 
    });
  }
});

// Rota de verificação de token
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Token não fornecido' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-development-only');
    
    // Buscar usuário atualizado
    const [users] = await db.execute(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito FROM usuarios WHERE id = ?',
      [decoded.id]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Usuário não encontrado' 
      });
    }

    res.json({
      valid: true,
      user: users[0]
    });

  } catch (error) {
    authLogger.error('Erro na verificação do token', error);
    res.status(401).json({ 
      valid: false, 
      error: 'Token inválido' 
    });
  }
});

// Rota de logout
router.post('/logout', (req, res) => {
  authLogger.info('Logout realizado');
  res.json({ success: true, message: 'Logout realizado com sucesso' });
});

module.exports = router;