// scripts/initDatabase.js
const db = require('../config/database');

// Função simples de logging para inicialização
const log = {
  info: (message) => console.log(`✅ ${message}`),
  error: (message, error) => console.error(`❌ ${message}:`, error?.message || error),
  warn: (message) => console.log(`⚠️ ${message}`)
};

async function initDatabase() {
  let connection;
  try {
    log.info('Inicializando base de dados...');

    // 1. Verificar/Criar tabela de sessions
    log.info('Verificando tabela sessions...');
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

    // 2. Verificar se existem sessões - CORREÇÃO AQUI
    log.info('Verificando sessões existentes...');
    
    // Primeiro, vamos verificar se a tabela tem dados de forma mais segura
    let existingSessionsCount = 0;
    try {
      const [rows] = await db.execute('SELECT COUNT(*) as total FROM sessions');
      console.log('🔍 Resultado da consulta COUNT:', rows);
      
      if (rows && rows.length > 0 && rows[0]) {
        existingSessionsCount = rows[0].total || 0;
      }
    } catch (countError) {
      console.log('⚠️ Erro ao contar sessões, assumindo 0:', countError.message);
      existingSessionsCount = 0;
    }

    log.info(`Total de sessões encontradas: ${existingSessionsCount}`);

    if (existingSessionsCount === 0) {
      log.info('Inserindo sessões de exemplo...');
      
      await db.execute(`
        INSERT INTO sessions 
        (titulo, descricao, data, horario, duracao, distrito, provincia, participantes_previstos, tipo, estado, localizacao) 
        VALUES 
        ('Workshop de Adaptação Climática', 'Sessão sobre técnicas de adaptação climática para agricultores', '2024-01-15', '10:00:00', 3, 'KaMubukwana', 'Maputo Cidade', 25, 'presencial', 'agendada', 'Centro Comunitário do KaMubukwana'),
        ('Gestão de Recursos Hídricos', 'Sessão sobre conservação e uso eficiente da água', '2024-01-20', '14:00:00', 2, 'Matola', 'Maputo Província', 30, 'hibrido', 'agendada', 'Escola Secundária da Matola'),
        ('Sistemas de Alerta Precoce', 'Implementação de sistemas comunitários para eventos climáticos', '2024-01-25', '09:30:00', 2, 'Boane', 'Maputo Província', 20, 'presencial', 'concluida', 'Centro de Saúde de Boane')
      `);
      log.info('Sessões de exemplo inseridas com sucesso!');
    }

    // 3. Verificar/Criar tabela de atividades_classificadas
    log.info('Verificando tabela atividades_classificadas...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS atividades_classificadas (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sessao_id INT NOT NULL,
        codigo VARCHAR(50) NOT NULL,
        atividade TEXT NOT NULL,
        descricao TEXT,
        objectivo_estrategico TEXT NOT NULL,
        criterios JSON,
        prioridade INT DEFAULT 1,
        tempo_impacto INT DEFAULT 2,
        capex INT DEFAULT 3,
        risco_maladaptacao INT DEFAULT 2,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (sessao_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // 4. Verificar/Criar tabela de participantes_sessao
    log.info('Verificando tabela participantes_sessao...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS participantes_sessao (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sessao_id INT NOT NULL,
        usuario_id INT NOT NULL,
        status ENUM('confirmado', 'pendente', 'cancelado') DEFAULT 'pendente',
        data_inscricao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sessao_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        UNIQUE KEY unique_sessao_usuario (sessao_id, usuario_id)
      )
    `);

    // 5. Verificar/Criar tabela de notificacoes
    log.info('Verificando tabela notificacoes...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        usuario_id INT NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        mensagem TEXT NOT NULL,
        tipo ENUM('sistema', 'sessao', 'votacao', 'treinamento') NOT NULL DEFAULT 'sistema',
        lida BOOLEAN DEFAULT FALSE,
        link VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `);

    // 6. Inserir notificações de exemplo se não existirem - CORREÇÃO AQUI
    log.info('Verificando notificações existentes...');
    
    let existingNotificationsCount = 0;
    try {
      const [rows] = await db.execute('SELECT COUNT(*) as total FROM notificacoes');
      console.log('🔍 Resultado da consulta COUNT notificações:', rows);
      
      if (rows && rows.length > 0 && rows[0]) {
        existingNotificationsCount = rows[0].total || 0;
      }
    } catch (countError) {
      console.log('⚠️ Erro ao contar notificações, assumindo 0:', countError.message);
      existingNotificationsCount = 0;
    }

    log.info(`Total de notificações encontradas: ${existingNotificationsCount}`);

    if (existingNotificationsCount === 0) {
      log.info('Inserindo notificações de exemplo...');
      await db.execute(`
        INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, link) VALUES 
        (1, 'Bem-vindo ao Sistema', 'Sua conta de administrador foi ativada com sucesso!', 'sistema', '/dashboard'),
        (2, 'Nova Sessão Disponível', 'Uma nova sessão sobre Adaptação Climática está disponível', 'sessao', '/sessoes/1'),
        (3, 'Lembrete de Votação', 'Não se esqueça de participar da votação das atividades', 'votacao', '/votacao')
      `);
      log.info('Notificações de exemplo inseridas com sucesso!');
    }

    log.info('Base de dados inicializada com sucesso!');
    
  } catch (error) {
    log.error('Erro ao inicializar base de dados', error);
    throw error;
  }
}

module.exports = initDatabase;