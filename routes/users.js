// backend/routes/users.js - VERSÃO CORRIGIDA
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ✅ IMPORTAR CORRETAMENTE - separar USER_ROLES das funções
const { 
  authenticateToken, 
  requireRole, 
  requireOwnershipOrRole 
} = require('../middleware/auth');
const { USER_ROLES } = require('../middleware/auth'); // ✅ Importar USER_ROLES separadamente

// ✅ IMPORTAR LOGGER CORRETAMENTE
const logger = require('../middleware/logger');

// Obter perfil do usuário atual
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    logger.info('Obtendo perfil do usuário', { userId: req.user.id });

    const [users] = await db.execute(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito, created_at FROM usuarios WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      logger.warn('Usuário não encontrado ao buscar perfil', { userId: req.user.id });
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    logger.info('Perfil obtido com sucesso', { userId: req.user.id });
    
    res.json({
      success: true,
      data: users[0]
    });

  } catch (error) {
    logger.error('Erro ao obter perfil', {
      error: error.message,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar perfil do usuário atual
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, organizacao, provincia, distrito } = req.body;

    logger.info('Atualizando perfil do usuário', {
      userId: req.user.id,
      campos: { nome: !!nome, telefone: !!telefone, organizacao: !!organizacao }
    });

    await db.execute(
      'UPDATE usuarios SET nome = ?, telefone = ?, organizacao = ?, provincia = ?, distrito = ? WHERE id = ?',
      [nome, telefone, organizacao, provincia, distrito, req.user.id]
    );

    logger.info('Perfil atualizado com sucesso', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao atualizar perfil', {
      error: error.message,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar todos os usuários (apenas admin)
router.get('/', authenticateToken, requireRole([USER_ROLES.ADMIN]), async (req, res) => {
  try {
    const { page = 1, limit = 10, perfil } = req.query;
    const offset = (page - 1) * limit;

    logger.info('Listando usuários (admin)', {
      adminId: req.user.id,
      filters: { perfil, page, limit }
    });

    let query = `
      SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito, created_at 
      FROM usuarios 
      WHERE 1=1
    `;
    let params = [];

    if (perfil) {
      query += ' AND perfil = ?';
      params.push(perfil);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users] = await db.execute(query, params);

    // Contar total
    let countQuery = 'SELECT COUNT(*) as total FROM usuarios WHERE 1=1';
    let countParams = [];

    if (perfil) {
      countQuery += ' AND perfil = ?';
      countParams.push(perfil);
    }

    const [totalResult] = await db.execute(countQuery, countParams);
    const total = totalResult[0].total;

    logger.info('Listagem de usuários concluída', {
      totalUsuarios: total,
      usuariosRetornados: users.length,
      adminId: req.user.id
    });

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Erro ao listar usuários', {
      error: error.message,
      adminId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter usuário específico (admin ou o próprio usuário)
router.get('/:userId', authenticateToken, requireOwnershipOrRole([USER_ROLES.ADMIN]), async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info('Obtendo usuário específico', {
      requestedBy: req.user.id,
      targetUserId: userId
    });

    const [users] = await db.execute(
      'SELECT id, nome, email, perfil, telefone, organizacao, provincia, distrito, created_at FROM usuarios WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      logger.warn('Usuário não encontrado', { userId });
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    logger.info('Usuário encontrado', { userId });

    res.json({
      success: true,
      data: users[0]
    });

  } catch (error) {
    logger.error('Erro ao obter usuário', {
      error: error.message,
      userId: req.params.userId,
      requestedBy: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar usuário (admin ou o próprio usuário)
router.put('/:userId', authenticateToken, requireOwnershipOrRole([USER_ROLES.ADMIN]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { nome, telefone, organizacao, provincia, distrito, perfil } = req.body;

    logger.info('Atualizando usuário', {
      updatedBy: req.user.id,
      targetUserId: userId,
      camposAtualizados: Object.keys(req.body).filter(key => req.body[key] !== undefined)
    });

    // Verificar se é admin para permitir atualização de perfil
    const canUpdatePerfil = req.user.perfil === USER_ROLES.ADMIN;
    const updates = { nome, telefone, organizacao, provincia, distrito };
    
    if (canUpdatePerfil && perfil) {
      updates.perfil = perfil;
    }

    const setClause = Object.keys(updates)
      .filter(key => updates[key] !== undefined)
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.keys(updates)
      .filter(key => updates[key] !== undefined)
      .map(key => updates[key]);

    if (values.length === 0) {
      logger.warn('Nenhum campo válido para atualizar', { userId });
      return res.status(400).json({
        success: false,
        message: 'Nenhum campo válido para atualizar'
      });
    }

    values.push(userId);

    await db.execute(
      `UPDATE usuarios SET ${setClause} WHERE id = ?`,
      values
    );

    logger.info('Usuário atualizado com sucesso', {
      updatedBy: req.user.id,
      targetUserId: userId
    });

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao atualizar usuário', {
      error: error.message,
      targetUserId: req.params.userId,
      updatedBy: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;