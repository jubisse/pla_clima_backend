const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔧 Inicializando módulo database MySQL...');

// Verificar variáveis de ambiente
console.log('🔍 Variáveis DB configuradas:', {
  DB_HOST: process.env.DB_HOST ? 'Definido' : 'Não definido',
  DB_USER: process.env.DB_USER ? 'Definido' : 'Não definido',
  DB_NAME: process.env.DB_NAME ? 'Definido' : 'Não definido',
  DB_PORT: process.env.DB_PORT || 3306,
  NODE_ENV: process.env.NODE_ENV
});

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
  // Configurações específicas para MySQL
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  charset: 'utf8mb4',
  timezone: 'Z'
});

// Testar conexão
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexão MySQL estabelecida com sucesso!');
    console.log('📊 Informações da conexão:', {
      threadId: connection.threadId,
      serverVersion: connection._implicitConnect.connection._handshakePacket.serverVersion
    });
    connection.release();
  } catch (error) {
    console.error('❌ Falha na conexão MySQL:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      address: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306
    });
    
    // Sugestões de solução
    if (error.code === 'ENOTFOUND') {
      console.error('💡 SOLUÇÃO: Verifique se DB_HOST está correto');
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 SOLUÇÃO: Verifique se o MySQL está rodando na porta 3306');
    }
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 SOLUÇÃO: Verifique DB_USER e DB_PASSWORD');
    }
  }
})();

// Exportar com compatibilidade para o código existente
module.exports = {
  // Para compatibilidade com código que usa db.execute()
  execute: async (sql, params) => {
    try {
      console.log(`📝 Executando query MySQL: ${sql.substring(0, 100)}...`);
      const [rows, fields] = await pool.execute(sql, params || []);
      return [rows];
    } catch (error) {
      console.error('❌ Erro na query MySQL:', {
        message: error.message,
        sql: sql.substring(0, 200),
        code: error.code
      });
      throw error;
    }
  },
  
  // Para compatibilidade com código que usa db.query()
  query: async (sql, params) => {
    return pool.query(sql, params);
  },
  
  // Para acesso direto ao pool se necessário
  getConnection: () => pool.getConnection(),
  
  pool
};