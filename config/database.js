const mysql = require('mysql2/promise');
const logger = require('../middleware/logger');

// 🧱 Criação do pool de conexões
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'climatica_mz',
    port: process.env.DB_PORT || 3306,
    connectionLimit: Number(process.env.DB_MAX_CONNECTIONS) || 10,
    waitForConnections: true,
    queueLimit: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 🧩 Testar conexão inicial
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conectado à base de dados MySQL');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar à base de dados:', error.message);
        return false;
    }
}

// 🔁 Middleware opcional para injetar conexão no request
const databaseMiddleware = async (req, res, next) => {
    try {
        req.db = pool;
        next();
    } catch (error) {
        logger.error('Erro no middleware de base de dados', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Erro de conexão com a base de dados'
        });
    }
};

// ✅ Exporta o pool diretamente, como no padrão mysql2/promise
module.exports = pool;

