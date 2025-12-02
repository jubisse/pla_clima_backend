const { withConnection, withTransaction } = require('../utils/database');
const { hashPassword, verifyPassword } = require('../utils/security');
const { USER_ROLES } = require('../config/constants');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class UserController {
    // Obter perfil do usuário
    static async getProfile(req, res, next) {
        await withConnection(async (connection) => {
            const userId = req.user.id;

            logger.info('Buscando perfil do usuário', { userId });

            const [users] = await connection.execute(
                `SELECT id, nome, email, telefone, organizacao, cargo, provincia, distrito, perfil, ativo, created_at, ultimo_login
                 FROM usuarios WHERE id = ?`,
                [userId]
            );

            if (users.length === 0) {
                throw new AppError('Usuário não encontrado', 404);
            }

            const user = users[0];

            res.json({
                success: true,
                data: user
            });
        }).catch(next);
    }

    // Atualizar perfil do usuário
    static async updateProfile(req, res, next) {
        await withConnection(async (connection) => {
            const userId = req.user.id;
            const { nome, telefone, organizacao, cargo, provincia, distrito } = req.body;

            logger.info('Atualizando perfil do usuário', { userId });

            // Verificar se o usuário existe
            const [existingUsers] = await connection.execute(
                'SELECT id FROM usuarios WHERE id = ?',
                [userId]
            );

            if (existingUsers.length === 0) {
                throw new AppError('Usuário não encontrado', 404);
            }

            // Atualizar usuário
            await connection.execute(
                `UPDATE usuarios 
                 SET nome = ?, telefone = ?, organizacao = ?, cargo = ?, provincia = ?, distrito = ?, updated_at = NOW()
                 WHERE id = ?`,
                [nome, telefone, organizacao, cargo, provincia, distrito, userId]
            );

            // Buscar usuário atualizado
            const [updatedUsers] = await connection.execute(
                `SELECT id, nome, email, telefone, organizacao, cargo, provincia, distrito, perfil, ativo, created_at, ultimo_login
                 FROM usuarios WHERE id = ?`,
                [userId]
            );

            const updatedUser = updatedUsers[0];

            logger.info('Perfil atualizado com sucesso', { userId });

            res.json({
                success: true,
                message: 'Perfil atualizado com sucesso',
                data: updatedUser
            });
        }).catch(next);
    }

    // Alterar senha
    static async changePassword(req, res, next) {
        await withConnection(async (connection) => {
            const userId = req.user.id;
            const { senha_atual, nova_senha } = req.body;

            logger.info('Tentativa de alteração de senha', { userId });

            // Buscar usuário com senha
            const [users] = await connection.execute(
                'SELECT id, senha_hash FROM usuarios WHERE id = ?',
                [userId]
            );

            if (users.length === 0) {
                throw new AppError('Usuário não encontrado', 404);
            }

            const user = users[0];

            // Verificar senha atual
            const senhaValida = await verifyPassword(senha_atual, user.senha_hash);

            if (!senhaValida) {
                throw new AppError('Senha atual incorreta', 400);
            }

            // Hash da nova senha
            const novaSenhaHash = await hashPassword(nova_senha);

            // Atualizar senha
            await connection.execute(
                'UPDATE usuarios SET senha_hash = ?, updated_at = NOW() WHERE id = ?',
                [novaSenhaHash, userId]
            );

            logger.info('Senha alterada com sucesso', { userId });

            res.json({
                success: true,
                message: 'Senha alterada com sucesso'
            });
        }).catch(next);
    }

    // Listar usuários (apenas admin/facilitador)
    static async listUsers(req, res, next) {
        await withConnection(async (connection) => {
            const { page = 1, limit = 20, search = '', role = '' } = req.query;
            const offset = (page - 1) * limit;

            let whereClause = 'WHERE 1=1';
            let queryParams = [];

            if (search) {
                whereClause += ' AND (nome LIKE ? OR email LIKE ? OR organizacao LIKE ?)';
                queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            if (role && Object.values(USER_ROLES).includes(role)) {
                whereClause += ' AND perfil = ?';
                queryParams.push(role);
            }

            // Buscar usuários
            const [users] = await connection.execute(
                `SELECT id, nome, email, telefone, organizacao, cargo, provincia, distrito, perfil, ativo, created_at, ultimo_login
                 FROM usuarios ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [...queryParams, parseInt(limit), offset]
            );

            // Contar total
            const [countResult] = await connection.execute(
                `SELECT COUNT(*) as total FROM usuarios ${whereClause}`,
                queryParams
            );

            const total = countResult[0].total;

            logger.info('Lista de usuários recuperada', { total, page });

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
        }).catch(next);
    }

    // Atualizar status do usuário (apenas admin)
    static async updateUserStatus(req, res, next) {
        await withConnection(async (connection) => {
            const { id } = req.params;
            const { ativo } = req.body;

            logger.info('Atualizando status do usuário', { userId: id, ativo });

            const [result] = await connection.execute(
                'UPDATE usuarios SET ativo = ?, updated_at = NOW() WHERE id = ?',
                [ativo, id]
            );

            if (result.affectedRows === 0) {
                throw new AppError('Usuário não encontrado', 404);
            }

            res.json({
                success: true,
                message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso`
            });
        }).catch(next);
    }

    // Obter estatísticas do usuário
    static async getUserStats(req, res, next) {
        await withConnection(async (connection) => {
            const userId = req.user.id;

            // Progresso de aprendizagem
            const [progressoResult] = await connection.execute(
                `SELECT 
                    COUNT(*) as total_modulos,
                    SUM(CASE WHEN p.concluido = TRUE THEN 1 ELSE 0 END) as modulos_concluidos
                FROM modulos_aprendizagem m
                LEFT JOIN progresso_aprendizagem p ON m.id = p.modulo_id AND p.usuario_id = ?
                WHERE m.ativo = TRUE`,
                [userId]
            );

            // Resultado do teste
            const [testeResult] = await connection.execute(
                `SELECT aprovado, pontuacao, data_realizacao 
                 FROM resultados_teste 
                 WHERE usuario_id = ? 
                 ORDER BY data_realizacao DESC 
                 LIMIT 1`,
                [userId]
            );

            // Votos realizados
            const [votosResult] = await connection.execute(
                `SELECT COUNT(*) as total_votos 
                 FROM votos_usuario 
                 WHERE usuario_id = ?`,
                [userId]
            );

            const progresso = progressoResult[0];
            const percentagemProgresso = progresso.total_modulos > 0 
                ? Math.round((progresso.modulos_concluidos / progresso.total_modulos) * 100)
                : 0;

            res.json({
                success: true,
                data: {
                    progresso_aprendizagem: {
                        total_modulos: progresso.total_modulos,
                        concluidos: progresso.modulos_concluidos,
                        percentagem: percentagemProgresso
                    },
                    teste: testeResult.length > 0 ? testeResult[0] : null,
                    votos: {
                        total: votosResult[0].total_votos
                    }
                }
            });
        }).catch(next);
    }
}

module.exports = UserController;