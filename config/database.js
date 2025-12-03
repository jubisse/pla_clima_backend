const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Necessário para Supabase
  },
  max: 20, // conexões máximas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testar conexão
pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL (Supabase)');
});

pool.on('error', (err) => {
  console.error('❌ Erro na conexão PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
