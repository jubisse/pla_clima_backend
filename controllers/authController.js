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

            // Verificar se email já existe
            const existingUser = await connection.execute(
                'SELECT id FROM usuarios WHERE email = ?',
                [email]
            );

            if (existingUser[0].length > 0) {
                throw new AppError('Já existe uma conta com este email', 409);
            }

            // Hash da senha
            const senhaHash = await hashPassword(senha);

            // Determinar estrutura da tabela
            const [colunas] = await connection.execute('DESCRIBE usuarios');
            const colunasExistentes = colunas.map(col => col.Field);
            const temColunasCompletas = ['telefone', 'organizacao', 'cargo', 'provincia', 'distrito']
                .every(col => colunasExistentes.includes(col));

            // Inserir usuário
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

            // Gerar token JWT
            const token = jwt.sign(
                { 
                    id: result.insertId, 
                    email: email,
                    perfil: USER_ROLES.PARTICIPANTE
                },
                JWT.SECRET,
                { expiresIn: JWT.EXPIRES_IN }
            );

            // Construir resposta
            const userResponse = {
                id: result.insertId,
                nome,
                email,
                perfil: USER_ROLES.PARTICIPANTE
            };

            if (temColunasCompletas) {
                Object.assign(userResponse, {
                    organizacao, provincia, distrito, telefone, cargo
                });
            }

            logger.info('Usuário registrado com sucesso', { id: result.insertId, email });

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

            // Buscar usuário
            const [users] = await connection.execute(
                `SELECT id, email, senha_hash, nome, perfil, distrito, organizacao, provincia 
                 FROM usuarios WHERE email = ? AND ativo = TRUE`,
                [email]
            );

            if (users.length === 0) {
                throw new AppError('Credenciais inválidas', 401);
            }

            const user = users[0];

            // Verificar senha
            const senhaValida = await verifyPassword(senha, user.senha_hash);

            if (!senhaValida) {
                // Fallback para desenvolvimento (REMOVER EM PRODUÇÃO)
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

            // Atualizar último login
            try {
                await connection.execute(
                    'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?',
                    [user.id]
                );
            } catch (error) {
                logger.warn('Não foi possível atualizar último login', error);
            }

            // Gerar token
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

            // Buscar usuário
            const [users] = await connection.execute(
                'SELECT id, nome FROM usuarios WHERE email = ? AND ativo = TRUE',
                [email]
            );

            // Retornar sucesso mesmo se email não existir (por segurança)
            if (users.length === 0) {
                logger.info('Email não encontrado na recuperação', { email });
                return res.json({
                    success: true,
                    message: 'Se o email existir, você receberá um código de recuperação'
                });
            }

            const user = users[0];
            const codigoRecuperacao = generateRecoveryCode();
            const expiracao = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

            // Salvar código
            await connection.execute(
                `INSERT INTO recuperacao_senha (usuario_id, codigo, expiracao, utilizado)
                 VALUES (?, ?, ?, FALSE)
                 ON DUPLICATE KEY UPDATE 
                 codigo = VALUES(codigo), 
                 expiracao = VALUES(expiracao), 
                 utilizado = FALSE`,
                [user.id, codigoRecuperacao, expiracao]
            );

            logger.info('Código de recuperação gerado', { 
                usuario_id: user.id, 
                codigo: codigoRecuperacao 
            });

            // TODO: Enviar email em produção
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

            if (codigos.length === 0) {
                throw new AppError('Código inválido ou expirado', 400);
            }

            const tokenTemporario = jwt.sign(
                { 
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

            // Verificar token
            let decoded;
            try {
                decoded = jwt.verify(token, JWT.SECRET);
            } catch (error) {
                throw new AppError('Token inválido ou expirado', 400);
            }

            if (decoded.tipo !== 'recuperacao_senha') {
                throw new AppError('Token inválido', 400);
            }

            // Hash da nova senha
            const hashedPassword = await hashPassword(nova_senha);

            // Atualizar senha
            await connection.execute(
                'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
                [hashedPassword, decoded.usuario_id]
            );

            // Marcar código como utilizado
            await connection.execute(
                'UPDATE recuperacao_senha SET utilizado = TRUE WHERE usuario_id = ?',
                [decoded.usuario_id]
            );

            logger.info('Senha redefinida com sucesso', { usuario_id: decoded.usuario_id });

            res.json({
                success: true,
                message: 'Senha redefinida com sucesso'
            });
        }).catch(next);
    }
}

module.exports = AuthController;