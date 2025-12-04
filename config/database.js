// config/database.js - VERSÃO MYSQL CORRIGIDA
const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔧 Inicializando módulo database MySQL...');

// Log das configurações (sem mostrar senha)
console.log('🔍 Configuração MySQL:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  hasPassword: !!process.env.DB_PASSWORD,
  environment: process.env.NODE_ENV
});

// Criar pool de conexões
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para executar queries (compatibilidade)
const execute = async (sql, params = []) => {
  try {
    console.log(`📝 Executando query MySQL: ${sql.substring(0, 100)}...`);
    const [rows, fields] = await pool.execute(sql, params);
    return [rows];
  } catch (error) {
    console.error('❌ Erro na query MySQL:', {
      message: error.message,
      code: error.code,
      sql: sql.substring(0, 200),
      params: params
    });
    throw error;
  }
};

// Testar conexão ao iniciar
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexão MySQL estabelecida com sucesso!');
    console.log('📊 Server info:', {
      threadId: connection.threadId,
      serverVersion: connection._implicitConnect?.connection?._handshakePacket?.serverVersion || 'unknown'
    });
    connection.release();
  } catch (error) {
    console.error('❌ Falha na conexão MySQL:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306
    });
  }
})();

// Exportar módulo com método execute
module.exports = {
  execute,
  query: (sql, params) => pool.query(sql, params),
  getConnection: () => pool.getConnection(),
  pool,
  
  // Métodos adicionais para compatibilidade
  end: (callback) => pool.end(callback)
};