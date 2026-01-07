const jwt = require('jsonwebtoken');
const { withConnection, withTransaction } = require('../utils/database');
const { hashPassword, verifyPassword, generateRecoveryCode } = require('../utils/security');
const { JWT, USER_ROLES } = require('../config/constants');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class AuthController {
    // Registro de usuário
    static async registro(req, res, next) {
        await withTransaction(async (connection) => {
            const { 
                nome, 
                email, 
                senha, 
                telefone, 
                organizacao, 
                cargo, 
                provincia, 
                distrito 
            } = req.body;

            logger.info('Tentativa de registro', { email, nome });

            // 1. Verificar se email já existe (Desestruturação corrigida para o novo database.js)
            const [existingUsers] = await connection.execute(
                'SELECT id FROM usuarios WHERE email = ?',
                [email]
            );

            if (existingUsers && existingUsers.length > 0) {
                throw new AppError('Já existe uma conta com este email', 409);
            }

            // 2. Hash da senha
            const senhaHash = await hashPassword(senha);

            // 3. Determinar estrutura da tabela para compatibilidade
            const [colunas] = await connection.execute('DESCRIBE usuarios');
            const colunasExistentes = colunas.map(col => col.Field);
            const temColunasCompletas = ['telefone', 'organizacao', 'cargo', 'provincia', 'distrito']
                .every(col => colunasExistentes.includes(col));

            // 4. Inserir usuário
            let result;
            if (temColunasCompletas) {
                [result] = await connection.execute(
                    `INSERT INTO usuarios 
                     (nome, email, senha_hash, telefone, organizacao, cargo, provincia, distrito, perfil, ativo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
                    [
                        nome, email, senhaHash, 
                        telefone || null, organizacao || null, cargo || null, 
                        provincia || null, distrito || null, 
                        USER_ROLES.PARTICIPANTE
                    ]
                );
            } else {
                [result] = await connection.execute(
                    `INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)`,
                    [nome, email, senhaHash]
                );
            }

            const novoUsuarioId = result.insertId;

            // 5. Gerar token JWT (Garantindo campo 'id' para o middleware)
            const token = jwt.sign(
                { 
                    id: novoUsuarioId, 
                    email: email,
                    perfil: USER_ROLES.PARTICIPANTE
                },
                JWT.SECRET,
                { expiresIn: JWT.EXPIRES_IN }
            );

            const userResponse = {
                id: novoUsuarioId,
                nome,
                email,
                perfil: USER_ROLES.PARTICIPANTE
            };

            if (temColunasCompletas) {
                Object.assign(userResponse, {
                    organizacao, provincia, distrito, telefone, cargo
                });
            }

            logger.info('Usuário registrado com sucesso', { id: novoUsuarioId, email });

            res.status(201).json({
                success: true,
                message: 'Conta criada com sucesso',
                data: { user: userResponse, token }
            });
        }).catch(next);
    }

    // Login
    static async login(req, res, next) {
        await withConnection(async (connection) => {
            const { email, senha } = req.body;

            logger.info('Tentativa de login', { email });

            // 1. Buscar usuário ativo
            const [users] = await connection.execute(
                `SELECT id, email, senha_hash, nome, perfil, distrito, organizacao, provincia 
                 FROM usuarios WHERE email = ? AND ativo = TRUE`,
                [email]
            );

            if (!users || users.length === 0) {
                throw new AppError('Credenciais inválidas', 401);
            }

            const user = users[0];

            // 2. Verificar senha
            const senhaValida = await verifyPassword(senha, user.senha_hash);

            if (!senhaValida) {
                // Fallback para desenvolvimento
                if (process.env.NODE_ENV === 'development') {
                    const senhasDev = ['password', '123456', 'senha', 'teste'];
                    if (senhasDev.includes(senha)) {
                        logger.warn('MODO DEV: Senha de desenvolvimento aceita', { email });
                    } else {
                        throw new AppError('Credenciais inválidas', 401);
                    }
                } else {
                    throw new AppError('Credenciais inválidas', 401);
                }
            }

            // 3. Atualizar último login (Silent update)
            connection.execute(
                'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?',
                [user.id]
            ).catch(err => logger.warn('Erro ao atualizar último login', err));

            // 4. Gerar token (Obrigatório campo 'id' para o middleware/auth.js)
            const token = jwt.sign(
                { 
                    id: user.id, 
                    email: user.email, 
                    perfil: user.perfil, 
                    nome: user.nome 
                },
                JWT.SECRET,
                { expiresIn: JWT.EXPIRES_IN }
            );

            logger.info('Login bem-sucedido', { 
                id: user.id, 
                email: user.email,
                perfil: user.perfil 
            });

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    nome: user.nome,
                    perfil: user.perfil,
                    organizacao: user.organizacao,
                    provincia: user.provincia,
                    distrito: user.distrito
                }
            });
        }).catch(next);
    }

    // Recuperação de senha
    static async recuperarSenha(req, res, next) {
        await withTransaction(async (connection) => {
            const { email } = req.body;

            logger.info('Solicitação de recuperação de senha', { email });

            const [users] = await connection.execute(
                'SELECT id, nome FROM usuarios WHERE email = ? AND ativo = TRUE',
                [email]
            );

            if (!users || users.length === 0) {
                logger.info('Email não encontrado na recuperação', { email });
                return res.json({
                    success: true,
                    message: 'Se o email existir, você receberá um código de recuperação'
                });
            }

            const user = users[0];
            const codigoRecuperacao = generateRecoveryCode();
            const expiracao = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

            await connection.execute(
                `INSERT INTO recuperacao_senha (usuario_id, codigo, expiracao, utilizado)
                 VALUES (?, ?, ?, FALSE)
                 ON DUPLICATE KEY UPDATE 
                 codigo = VALUES(codigo), 
                 expiracao = VALUES(expiracao), 
                 utilizado = FALSE`,
                [user.id, codigoRecuperacao, expiracao]
            );

            logger.info('Código de recuperação gerado', { usuario_id: user.id });
            console.log(`📨 Código de recuperação para ${email}: ${codigoRecuperacao}`);

            res.json({
                success: true,
                message: 'Se o email existir, você receberá um código de recuperação',
                ...(process.env.NODE_ENV === 'development' && { codigo: codigoRecuperacao })
            });
        }).catch(next);
    }

    // Verificar código
    static async verificarCodigo(req, res, next) {
        await withConnection(async (connection) => {
            const { email, codigo } = req.body;

            logger.info('Verificação de código', { email });

            const [codigos] = await connection.execute(
                `SELECT rs.*, u.id as usuario_id
                 FROM recuperacao_senha rs
                 JOIN usuarios u ON rs.usuario_id = u.id
                 WHERE u.email = ? AND rs.codigo = ? AND rs.utilizado = FALSE AND rs.expiracao > NOW()`,
                [email, codigo]
            );

            if (!codigos || codigos.length === 0) {
                throw new AppError('Código inválido ou expirado', 400);
            }

            const tokenTemporario = jwt.sign(
                { 
                    id: codigos[0].usuario_id, // Usando 'id' por padrão
                    usuario_id: codigos[0].usuario_id,
                    tipo: 'recuperacao_senha'
                },
                JWT.SECRET,
                { expiresIn: '15m' }
            );

            res.json({
                success: true,
                message: 'Código verificado com sucesso',
                data: {
                    usuario_id: codigos[0].usuario_id,
                    token_temporario: tokenTemporario
                }
            });
        }).catch(next);
    }

    // Redefinir senha
    static async redefinirSenha(req, res, next) {
        await withTransaction(async (connection) => {
            const { token, nova_senha } = req.body;

            logger.info('Tentativa de redefinição de senha');

            let decoded;
            try {
                decoded = jwt.verify(token, JWT.SECRET);
            } catch (error) {
                throw new AppError('Token inválido ou expirado', 400);
            }

            const userId = decoded.id || decoded.usuario_id;

            if (decoded.tipo !== 'recuperacao_senha' || !userId) {
                throw new AppError('Token inválido para redefinição', 400);
            }

            const hashedPassword = await hashPassword(nova_senha);

            await connection.execute(
                'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
                [hashedPassword, userId]
            );

            await connection.execute(
                'UPDATE recuperacao_senha SET utilizado = TRUE WHERE usuario_id = ?',
                [userId]
            );

            logger.info('Senha redefinida com sucesso', { usuario_id: userId });

            res.json({
                success: true,
                message: 'Senha redefinida com sucesso'
            });
        }).catch(next);
    }
}

module.exports = AuthController;
