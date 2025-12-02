// scripts/initDatabaseSimple.js
const db = require('../config/database');

async function initDatabaseSimple() {
  console.log('🗄️ Inicialização SIMPLES do banco de dados...');

  try {
    // Apenas criar as tabelas essenciais
    console.log('1. Criando tabelas essenciais...');
    
    // Tabela sessions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT,
        data DATE NOT NULL,
        horario TIME NOT NULL,
        duracao INT DEFAULT 2,
        distrito VARCHAR(100) NOT NULL,
        provincia VARCHAR(100) NOT NULL,
        facilitador_id INT,
        participantes_previstos INT DEFAULT 20,
        participantes_confirmados INT DEFAULT 0,
        tipo ENUM('presencial', 'virtual', 'hibrido') DEFAULT 'presencial',
        localizacao VARCHAR(255),
        link_virtual VARCHAR(255),
        observacoes TEXT,
        estado ENUM('rascunho', 'agendada', 'em_curso', 'concluida', 'cancelada') DEFAULT 'agendada',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela sessions criada/verificada');

    // Inserir dados exemplo
    console.log('2. Inserindo dados exemplo...');
    
    try {
      await db.execute(`
        INSERT IGNORE INTO sessions 
        (titulo, descricao, data, horario, duracao, distrito, provincia, participantes_previstos, tipo, estado, localizacao) 
        VALUES 
        ('Workshop de Adaptação Climática', 'Sessão sobre técnicas de adaptação climática para agricultores', '2024-01-15', '10:00:00', 3, 'KaMubukwana', 'Maputo Cidade', 25, 'presencial', 'agendada', 'Centro Comunitário do KaMubukwana'),
        ('Gestão de Recursos Hídricos', 'Sessão sobre conservação e uso eficiente da água', '2024-01-20', '14:00:00', 2, 'Matola', 'Maputo Província', 30, 'hibrido', 'agendada', 'Escola Secundária da Matola')
      `);
      console.log('✅ Dados exemplo inseridos');
    } catch (insertError) {
      console.log('⚠️ Dados já existem ou erro na inserção:', insertError.message);
    }

    console.log('🎉 Base de dados inicializada com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na inicialização simples:', error.message);
    // Não lançar erro para não parar a inicialização
  }
}

module.exports = initDatabaseSimple;