// config/database.js - VERSÃO CORRIGIDA PARA POSTGRESQL
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Inicializando módulo database PostgreSQL...');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Adaptador para compatibilidade com código MySQL
const db = {
  // Método execute (adaptado para PostgreSQL)
  execute: async (sql, params) => {
    console.log(`📝 Executando query PostgreSQL: ${sql.substring(0, 100)}...`);
    try {
      // Converter placeholders ? para $1, $2, etc se necessário
      let processedSql = sql;
      if (params && params.length > 0) {
        // Simples conversão: substituir ? por $1, $2, etc
        let paramIndex = 1;
        processedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      }
      
      const result = await pool.query(processedSql, params);
      // Retornar no formato [rows] para compatibilidade
      return [result.rows];
    } catch (error) {
      console.error('❌ Erro na query PostgreSQL:', error.message);
      throw error;
    }
  },
  
  // Método query nativo
  query: (text, params) => pool.query(text, params),
  
  pool
};

// Testar conexão
pool.connect()
  .then(client => {
    console.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    client.release();
  })
  .catch(error => {
    console.error('❌ Falha na conexão PostgreSQL:', error.message);
  });

module.exports = db;
