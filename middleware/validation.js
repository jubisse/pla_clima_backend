const Joi = require('joi');
const logger = require('./logger');

// Schemas de validação - CORRIGIDOS sem .pick() ou .omit()
const schemas = {
    registro: Joi.object({
        nome: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        senha: Joi.string().min(6).required(),
        telefone: Joi.string().allow('').optional(),
        organizacao: Joi.string().allow('').optional(),
        cargo: Joi.string().allow('').optional(),
        provincia: Joi.string().allow('').optional(),
        distrito: Joi.string().allow('').optional()
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        senha: Joi.string().required()
    }),

    recuperarSenha: Joi.object({
        email: Joi.string().email().required()
    }),

    verificarCodigo: Joi.object({
        email: Joi.string().email().required(),
        codigo: Joi.string().length(6).pattern(/^\d+$/).required()
    }),

    redefinirSenha: Joi.object({
        token: Joi.string().required(),
        nova_senha: Joi.string().min(6).required(),
        confirmar_senha: Joi.string().valid(Joi.ref('nova_senha')).required()
    }),

    // NOVO: Schema específico para atualizar perfil
    atualizarPerfil: Joi.object({
        nome: Joi.string().min(2).max(100).required(),
        telefone: Joi.string().allow('').optional(),
        organizacao: Joi.string().allow('').optional(),
        cargo: Joi.string().allow('').optional(),
        provincia: Joi.string().allow('').optional(),
        distrito: Joi.string().allow('').optional()
    }),

    // NOVO: Schema específico para alterar senha
    alterarSenha: Joi.object({
        senha_atual: Joi.string().required(),
        nova_senha: Joi.string().min(6).required(),
        confirmar_senha: Joi.string().valid(Joi.ref('nova_senha')).required()
    }),

    // NOVO: Schema específico para atualizar status
    atualizarStatus: Joi.object({
        ativo: Joi.boolean().required()
    }),

    sessao: Joi.object({
        titulo: Joi.string().min(5).max(200).required(),
        descricao: Joi.string().allow('').optional(),
        data: Joi.date().iso().required(),
        horario: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        duracao: Joi.number().integer().min(1).max(8).optional(),
        distrito: Joi.string().required(),
        provincia: Joi.string().required(),
        facilitador_id: Joi.number().integer().optional(),
        participantes_previstos: Joi.number().integer().min(1).max(1000).optional(),
        tipo: Joi.string().valid('presencial', 'virtual', 'hibrido').optional(),
        localizacao: Joi.string().allow('').optional(),
        link_virtual: Joi.string().uri().allow('').optional(),
        observacoes: Joi.string().allow('').optional()
    }),

    voto: Joi.object({
        atividade_id: Joi.number().integer().required(),
        pontuacao: Joi.number().integer().min(1).max(5).required(),
        prioridade_usuario: Joi.number().integer().min(1).max(10).optional(),
        comentario: Joi.string().allow('').max(500).optional()
    })
};

const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            logger.warn('Validação falhou', { errors, path: req.path });
            
            return res.status(400).json({
                success: false,
                error: 'Dados de entrada inválidos',
                details: errors
            });
        }

        // Substituir body pelos dados validados
        req.body = value;
        next();
    };
};

// Validação de parâmetros de URL
const validateParams = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.params);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: 'Parâmetros de URL inválidos'
            });
        }
        
        next();
    };
};

module.exports = {
    schemas,
    validateRequest,
    validateParams
};