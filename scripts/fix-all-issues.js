// backend/scripts/fix-all-issues.js
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

async function fixAllIssues() {
  console.log('🔧 INICIANDO CORREÇÃO COMPLETA DO SISTEMA\n');

  let connection;
  
  try {
    // 1. Conectar ao banco de dados
    console.log('1. 🔌 Conectando ao banco de dados...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'climatica_mz',
      multipleStatements: true
    });
    console.log('   ✅ Conectado ao banco de dados');

    // 2. Criar tabelas faltantes
    console.log('\n2. 🗄️ Criando tabelas faltantes...');
    
    const createTablesSQL = `
      -- Criar tabela usuarios se não existir
      CREATE TABLE IF NOT EXISTS usuarios (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          perfil ENUM('admin', 'facilitador', 'participante', 'coordenador') DEFAULT 'participante',
          telefone VARCHAR(20),
          organizacao VARCHAR(255),
          provincia VARCHAR(100),
          distrito VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      -- Criar tabela participantes_sessao se não existir
      CREATE TABLE IF NOT EXISTS participantes_sessao (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sessao_id INT NOT NULL,
          usuario_id INT NOT NULL,
          status ENUM('pendente', 'confirmado', 'cancelado') DEFAULT 'pendente',
          data_inscricao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sessao_id) REFERENCES sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
          UNIQUE KEY unique_participante_sessao (sessao_id, usuario_id)
      );
    `;

    await connection.execute(createTablesSQL);
    console.log('   ✅ Tabelas criadas/verificadas');

    // 3. Inserir usuários de exemplo
    console.log('\n3. 👥 Inserindo usuários de exemplo...');
    
    const insertUsersSQL = `
      INSERT IGNORE INTO usuarios (id, nome, email, password_hash, perfil, telefone, organizacao, provincia, distrito) VALUES
      (1, 'Admin Sistema', 'admin@demo.mz', '$2b$10$ExampleHashForDemo', 'admin', '+258 84 123 4567', 'Sistema', 'Maputo', 'Cidade'),
      (2, 'João Facilitador', 'joao@demo.mz', '$2b$10$ExampleHashForDemo', 'facilitador', '+258 86 987 6543', 'ONG Ambiental', 'Maputo', 'KaMubukwana'),
      (3, 'Maria Coordenadora', 'maria@demo.mz', '$2b$10$ExampleHashForDemo', 'coordenador', '+258 82 555 1234', 'Governo Provincial', 'Maputo', 'Matola'),
      (4, 'Carlos Participante', 'carlos@demo.mz', '$2b$10$ExampleHashForDemo', 'participante', '+258 83 444 5678', 'Comunidade Local', 'Maputo', 'Boane'),
      (5, 'Ana Facilitadora', 'ana@demo.mz', '$2b$10$ExampleHashForDemo', 'facilitador', '+258 85 333 9012', 'Associação Agrária', 'Gaza', 'Xai-Xai');
    `;

    await connection.execute(insertUsersSQL);
    console.log('   ✅ Usuários de exemplo inseridos');

    // 4. Atualizar sessions com facilitador_id
    console.log('\n4. 🔄 Atualizando sessions com facilitadores...');
    
    const updateSessionsSQL = `
      UPDATE sessions SET facilitador_id = 2 WHERE facilitador_id IS NULL OR facilitador_id = 0;
      UPDATE sessions SET facilitador_id = 5 WHERE id IN (SELECT id FROM sessions WHERE facilitador_id IS NULL OR facilitador_id = 0 LIMIT 1);
    `;

    await connection.execute(updateSessionsSQL);
    console.log('   ✅ Sessions atualizadas com facilitadores');

    // 5. Verificar resultado
    console.log('\n5. 📊 Verificando resultado...');
    
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('   ✅ Tabelas no banco:');
    tables.forEach(table => {
      console.log(`      - ${table.Tables_in_climate_adaptation}`);
    });

    const [userCount] = await connection.execute('SELECT COUNT(*) as total FROM usuarios');
    const [sessionCount] = await connection.execute('SELECT COUNT(*) as total FROM sessions');
    
    console.log(`   ✅ Total de usuários: ${userCount[0].total}`);
    console.log(`   ✅ Total de sessões: ${sessionCount[0].total}`);

    console.log('\n🎉 CORREÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('   1. ✅ As tabelas faltantes foram criadas');
    console.log('   2. ✅ Usuários de exemplo foram inseridos');
    console.log('   3. ✅ Sessions foram atualizadas com facilitadores');
    console.log('   4. 🔄 Reinicie o servidor: npm start');
    console.log('   5. 🌐 Teste as rotas no frontend');

  } catch (error) {
    console.error('💥 ERRO NA CORREÇÃO:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão com banco encerrada');
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  fixAllIssues();
}

module.exports = fixAllIssues;