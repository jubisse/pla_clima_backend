-- =============================================
-- SCRIPT DE CONFIGURAÇÃO PARA WAMP
-- BASE DE DADOS: CLIMATICA_MZ
-- =============================================

-- Criar base de dados se não existir
CREATE DATABASE IF NOT EXISTS `climatica_mz` 
DEFAULT CHARACTER SET utf8mb4 
DEFAULT COLLATE utf8mb4_unicode_ci;

USE `climatica_mz`;

-- =============================================
-- TABELAS PRINCIPAIS
-- =============================================

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) UNIQUE NOT NULL,
    `senha_hash` VARCHAR(255) NOT NULL,
    `telefone` VARCHAR(20) DEFAULT NULL,
    `organizacao` VARCHAR(255) DEFAULT NULL,
    `cargo` VARCHAR(100) DEFAULT NULL,
    `provincia` VARCHAR(100) DEFAULT NULL,
    `distrito` VARCHAR(100) DEFAULT NULL,
    `perfil` ENUM('participante', 'facilitador', 'admin') DEFAULT 'participante',
    `ativo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `ultimo_login` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de sessões
CREATE TABLE IF NOT EXISTS `sessions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `titulo` VARCHAR(255) NOT NULL,
    `descricao` TEXT,
    `data` DATE NOT NULL,
    `horario` TIME NOT NULL,
    `duracao` INT DEFAULT 2,
    `distrito` VARCHAR(100) NOT NULL,
    `provincia` VARCHAR(100) NOT NULL,
    `facilitador_id` INT DEFAULT NULL,
    `participantes_previstos` INT DEFAULT 20,
    `participantes_confirmados` INT DEFAULT 0,
    `tipo` ENUM('presencial', 'virtual', 'hibrido') DEFAULT 'presencial',
    `localizacao` VARCHAR(255) DEFAULT NULL,
    `link_virtual` VARCHAR(255) DEFAULT NULL,
    `observacoes` TEXT,
    `estado` ENUM('rascunho', 'agendada', 'em_curso', 'concluida', 'cancelada') DEFAULT 'agendada',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`facilitador_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de módulos de aprendizagem
CREATE TABLE IF NOT EXISTS `modulos_aprendizagem` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `titulo` VARCHAR(255) NOT NULL,
    `descricao` TEXT,
    `conteudo` LONGTEXT,
    `duracao_estimada` INT DEFAULT 60,
    `ordem` INT DEFAULT 0,
    `ativo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de progresso
CREATE TABLE IF NOT EXISTS `progresso_aprendizagem` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT NOT NULL,
    `modulo_id` INT NOT NULL,
    `concluido` BOOLEAN DEFAULT FALSE,
    `progresso` INT DEFAULT 0,
    `atualizado_em` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`modulo_id`) REFERENCES `modulos_aprendizagem`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_usuario_modulo` (`usuario_id`, `modulo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de perguntas de teste
CREATE TABLE IF NOT EXISTS `perguntas_teste` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `pergunta` TEXT NOT NULL,
    `opcoes_json` JSON NOT NULL,
    `resposta_correta` VARCHAR(1) NOT NULL,
    `modulo` VARCHAR(100) DEFAULT NULL,
    `dificuldade` ENUM('facil', 'medio', 'dificil') DEFAULT 'medio',
    `explicacao` TEXT,
    `ativa` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de resultados de teste
CREATE TABLE IF NOT EXISTS `resultados_teste` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT NOT NULL,
    `sessao_id` INT DEFAULT 1,
    `pontuacao` DECIMAL(5,2) NOT NULL,
    `aprovado` BOOLEAN DEFAULT FALSE,
    `total_perguntas` INT NOT NULL,
    `acertos` INT NOT NULL,
    `detalhes_respostas` JSON,
    `data_realizacao` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de atividades classificadas
CREATE TABLE IF NOT EXISTS `atividades_classificadas` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `objectivo_estrategico` VARCHAR(255) NOT NULL,
    `atividade` VARCHAR(500) NOT NULL,
    `descricao` TEXT,
    `criterios` JSON,
    `prioridade` ENUM('Baixa', 'Média', 'Alta') DEFAULT 'Média',
    `tempo_impacto` ENUM('Curto', 'Médio', 'Longo') DEFAULT 'Médio',
    `capex` ENUM('Baixo', 'Médio', 'Alto') DEFAULT 'Médio',
    `risco_maladaptacao` ENUM('Baixo', 'Médio', 'Alto') DEFAULT 'Baixo',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de votos
CREATE TABLE IF NOT EXISTS `votos_usuario` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT NOT NULL,
    `atividade_id` INT NOT NULL,
    `sessao_id` INT DEFAULT 1,
    `pontuacao` INT NOT NULL,
    `prioridade_usuario` INT DEFAULT NULL,
    `comentario` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`atividade_id`) REFERENCES `atividades_classificadas`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_usuario_atividade` (`usuario_id`, `atividade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de status de votação
CREATE TABLE IF NOT EXISTS `usuario_votacao_status` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT NOT NULL,
    `sessao_id` INT DEFAULT 1,
    `votacao_concluida` BOOLEAN DEFAULT FALSE,
    `data_conclusao` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_usuario_sessao` (`usuario_id`, `sessao_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de recuperação de senha
CREATE TABLE IF NOT EXISTS `recuperacao_senha` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT NOT NULL,
    `codigo` VARCHAR(6) NOT NULL,
    `expiracao` TIMESTAMP NOT NULL,
    `utilizado` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- DADOS INICIAIS
-- =============================================

-- Inserir usuários de demonstração (senha: Demo123!)
INSERT IGNORE INTO `usuarios` (`nome`, `email`, `senha_hash`, `perfil`, `organizacao`, `provincia`, `distrito`) VALUES
('Administrador Sistema', 'admin@demo.mz', '$2a$12$LQv3c1yqBWyF5e4eG4n4CuwAzDrDLoUYpkh6OqW7O7O8QYVYwJXW', 'admin', 'Disaster Impact', 'Maputo', 'Maputo Cidade'),
('Facilitador Demo', 'facilitador@demo.mz', '$2a$12$LQv3c1yqBWyF5e4eG4n4CuwAzDrDLoUYpkh6OqW7O7O8QYVYwJXW', 'facilitador', 'MINEDH', 'Maputo', 'KaMavota'),
('Participante Teste', 'participante@demo.mz', '$2a$12$LQv3c1yqBWyF5e4eG4n4CuwAzDrDLoUYpkh6OqW7O7O8QYVYwJXW', 'participante', 'Comunidade Local', 'Gaza', 'Chibuto');

-- Módulos de aprendizagem
INSERT IGNORE INTO `modulos_aprendizagem` (`titulo`, `descricao`, `ordem`, `duracao_estimada`) VALUES
('Introdução às Mudanças Climáticas', 'Conceitos básicos sobre mudanças climáticas e seus impactos em Moçambique', 1, 45),
('Adaptação e Resiliência Climática', 'Estratégias de adaptação e construção de resiliência nas comunidades', 2, 60),
('Planificação de Ações de Adaptação', 'Metodologias para priorizar e planificar ações de adaptação climática', 3, 75),
('Mecanismos de Financiamento Climático', 'Fontes de financiamento e mecanismos para projetos climáticos', 4, 50);

-- Perguntas de teste
INSERT IGNORE INTO `perguntas_teste` (`pergunta`, `opcoes_json`, `resposta_correta`, `modulo`, `explicacao`) VALUES
('O que são mudanças climáticas?', '{"a": "Variações naturais do clima", "b": "Mudanças no clima devido a atividades humanas", "c": "Apenas o aumento da temperatura global", "d": "Todas as anteriores"}', 'b', 'Introdução', 'Mudanças climáticas referem-se a alterações no clima devido principalmente a atividades humanas que liberam gases de efeito estufa.'),
('Qual destes é um gás de efeito estufa?', '{"a": "Oxigênio", "b": "Nitrogênio", "c": "Dióxido de Carbono", "d": "Hélio"}', 'c', 'Introdução', 'O dióxido de carbono (CO2) é um dos principais gases de efeito estufa responsáveis pelo aquecimento global.'),
('O que é adaptação climática?', '{"a": "Reduzir emissões de gases", "b": "Ajustar-se aos impactos climáticos", "c": "Monitorar o clima", "d": "Prever eventos extremos"}', 'b', 'Adaptação', 'Adaptação envolve ajustes em sistemas naturais ou humanos em resposta a estímulos climáticos reais ou esperados.');

-- Atividades para votação
INSERT IGNORE INTO `atividades_classificadas` (`objectivo_estrategico`, `atividade`, `descricao`, `criterios`, `prioridade`, `tempo_impacto`, `capex`, `risco_maladaptacao`) VALUES
('OE1 - Resiliência agro-pecuária', 'Sensibilizar para construção de diques nas machambas', 'Minimizar alagamentos nas áreas agrícolas através de diques de proteção', '{"ADP": 3, "RVC": 3, "SAH": 3, "GRE": 2, "SUS": 2, "sessao_id": 1}', 'Alta', 'Médio', 'Alto', 'Baixo'),
('OE1 - Resiliência agro-pecuária', 'Adquirir sementes melhoradas tolerantes a estiagens', 'Implementar sementes resistentes à seca para aumentar resiliência agrícola', '{"ADP": 3, "RVC": 3, "SAH": 2, "GRE": 2, "SUS": 2, "sessao_id": 1}', 'Alta', 'Curto', 'Baixo', 'Baixo'),
('OE3 - Infraestruturas resilientes', 'Abertura de fontes de água', 'Criar novas fontes de água para comunidades vulneráveis', '{"ADP": 3, "RVC": 3, "SAH": 3, "GRE": 2, "SUS": 3, "sessao_id": 1}', 'Alta', 'Curto', 'Médio', 'Baixo');

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================

SELECT '✅ BASE DE DADOS CONFIGURADA COM SUCESSO!' as mensagem;

SELECT 
    TABLE_NAME as 'Tabela',
    TABLE_ROWS as 'Registos'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'climatica_mz';

SELECT 
    '👤 Usuários Demo:' as info,
    'admin@demo.mz' as email,
    'Demo123!' as senha,
    'admin' as perfil
UNION ALL SELECT 
    '👤 Usuários Demo:',
    'facilitador@demo.mz',
    'Demo123!',
    'facilitador'
UNION ALL SELECT 
    '👤 Usuários Demo:',
    'participante@demo.mz',
    'Demo123!',
    'participante';