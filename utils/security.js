const bcrypt = require('bcryptjs');
const { VALIDATION } = require('../config/constants');

// Hash de senha
const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

// Verificar senha
const verifyPassword = async (password, hashedPassword) => {
    if (!password || !hashedPassword) {
        return false;
    }
    
    return await bcrypt.compare(password, hashedPassword);
};

// Validar força da senha
const validatePasswordStrength = (password) => {
    const minLength = VALIDATION.PASSWORD_MIN_LENGTH;
    
    if (password.length < minLength) {
        return {
            valid: false,
            message: `A senha deve ter pelo menos ${minLength} caracteres`
        };
    }

    // Adicionar mais validações conforme necessário
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
        return {
            valid: false,
            message: 'A senha deve conter letras maiúsculas, minúsculas e números'
        };
    }

    return { valid: true };
};

// Gerar código de recuperação
const generateRecoveryCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Sanitizar dados para prevenir SQL injection básico
const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input.replace(/['"\\;]/g, '');
    }
    return input;
};

module.exports = {
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    generateRecoveryCode,
    sanitizeInput
};