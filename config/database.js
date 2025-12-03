// config/database.js - VERSÃO POSTGRESQL CORRETA
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Inicializando módulo database PostgreSQL...');
console.log('🔍 Configuração PostgreSQL:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  hasPassword: !!process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production'
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Testar conexão
pool.connect()
  .then(client => {
    console.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    console.log('📊 Server version:', client.serverVersion);
    client.release();
  })
  .catch(error => {
    console.error('❌ Falha na conexão PostgreSQL:', {
      message: error.message,
      code: error.code,
      address: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432
    });
  });

// Adaptador para compatibilidade
module.exports = {
  // Para compatibilidade com db.execute()
  execute: async (sql, params) => {
    try {
      console.log(`📝 Executando query PostgreSQL: ${sql.substring(0, 100)}...`);
      
      // Converter ? para $1, $2, etc para PostgreSQL
      let processedSql = sql;
      let processedParams = params || [];
      
      if (params && params.length > 0) {
        let paramIndex = 1;
        processedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      }
      
      const result = await pool.query(processedSql, processedParams);
      return [result.rows];
    } catch (error) {
      console.error('❌ Erro na query PostgreSQL:', error.message);
      throw error;
    }
  },
  
  // Método nativo
  query: (text, params) => pool.query(text, params),
  
  pool
};
