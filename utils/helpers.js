const logger = require('../middleware/logger');

/**
 * Formata uma data para o formato local (pt-MZ)
 */
const formatarData = (data, incluirHora = false) => {
    if (!data) return '';
    
    try {
        const opcoes = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Africa/Maputo'
        };
        
        if (incluirHora) {
            Object.assign(opcoes, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
        
        return new Date(data).toLocaleDateString('pt-MZ', opcoes);
    } catch (error) {
        logger.error('Erro ao formatar data:', error);
        return 'Data inválida';
    }
};

/**
 * Gera um código aleatório
 */
const gerarCodigo = (tamanho = 6, numerico = true) => {
    let caracteres;
    let codigo = '';
    
    if (numerico) {
        caracteres = '0123456789';
    } else {
        caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }
    
    for (let i = 0; i < tamanho; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    
    return codigo;
};

/**
 * Valida se um objeto está vazio
 */
const estaVazio = (obj) => {
    return !obj || Object.keys(obj).length === 0;
};

/**
 * Sanitiza um texto para uso em URLs ou identificadores
 */
const sanitizarTexto = (texto) => {
    if (!texto) return '';
    
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

/**
 * Calcula o progresso percentual
 */
const calcularProgresso = (concluidos, total) => {
    if (!total || total === 0) return 0;
    return Math.round((concluidos / total) * 100);
};

/**
 * Valida um email
 */
const validarEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Extrai parâmetros de paginação da query
 */
const extrairPaginacao = (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;
    
    return { page, limit, offset };
};

/**
 * Formata um número como percentagem
 */
const formatarPercentagem = (valor, casasDecimais = 1) => {
    return `${parseFloat(valor).toFixed(casasDecimais)}%`;
};

/**
 * Ordena um array de objetos por uma propriedade
 */
const ordenarPor = (array, propriedade, ordem = 'asc') => {
    return [...array].sort((a, b) => {
        let aVal = a[propriedade];
        let bVal = b[propriedade];
        
        // Converte para número se possível
        if (!isNaN(aVal) && !isNaN(bVal)) {
            aVal = parseFloat(aVal);
            bVal = parseFloat(bVal);
        }
        
        if (ordem === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
};

/**
 * Agrupa um array de objetos por uma propriedade
 */
const agruparPor = (array, propriedade) => {
    return array.reduce((acc, obj) => {
        const key = obj[propriedade];
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
    }, {});
};

/**
 * Debounce function para otimizar chamadas frequentes
 */
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Delay assíncrono
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Converte string para título (capitaliza palavras)
 */
const paraTitulo = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
};

module.exports = {
    formatarData,
    gerarCodigo,
    estaVazio,
    sanitizarTexto,
    calcularProgresso,
    validarEmail,
    extrairPaginacao,
    formatarPercentagem,
    ordenarPor,
    agruparPor,
    debounce,
    delay,
    paraTitulo
};