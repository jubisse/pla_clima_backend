const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔧 Inicializando módulo database MySQL...');

// Configuração do Pool
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

/**
 * ✅ PADRONIZAÇÃO DE EXPORTAÇÃO
 * Exportamos um objeto que imita o comportamento do driver mysql2 original,
 * mas garante que estamos sempre usando o Pool de conexões.
 */
const db = {
  /**
   * Executa uma query simples. 
   * Retorna [rows, fields] para manter compatibilidade com const [rows] = await...
   */
  query: async (sql, params) => {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      console.error('❌ Erro em db.query:', error.message);
      throw error;
    }
  },

  /**
   * Executa uma Prepared Statement (Mais seguro).
   * Essencial para o seu middleware de autenticação que chama db.execute()
   */
  execute: async (sql, params) => {
    try {
      return await pool.execute(sql, params);
    } catch (error) {
      console.error('❌ Erro em db.execute:', error.message);
      throw error;
    }
  },

  // Exporta o pool caso precise de acesso direto
  pool,

  // Método para pegar uma conexão manual do pool
  getConnection: () => pool.getConnection(),

  // Método para encerrar o pool
  end: () => pool.end()
};

// Teste de conexão imediato
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexão MySQL estabelecida com sucesso!');
    connection.release();
  } catch (error) {
    console.error('❌ Falha crítica na conexão MySQL:', {
      message: error.message,
      host: process.env.DB_HOST
    });
  }
})();

module.exports = db;
