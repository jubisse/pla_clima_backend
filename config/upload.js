const fs = require('fs').promises;
const path = require('path');

// Função simples de logging para evitar dependências circulares
const simpleLog = {
  info: (message) => console.log(`✅ ${message}`),
  error: (message, error) => console.error(`❌ ${message}:`, error?.message || error)
};

async function createUploadDirs() {
  const directories = [
    'uploads',
    'uploads/profiles',
    'uploads/documents', 
    'uploads/sessions',
    'uploads/temp'
  ];

  try {
    for (const dir of directories) {
      const dirPath = path.join(process.cwd(), dir);
      
      try {
        await fs.access(dirPath);
        simpleLog.info(`Diretório já existe: ${dir}`);
      } catch (error) {
        // Diretório não existe, criar
        await fs.mkdir(dirPath, { recursive: true });
        simpleLog.info(`Diretório criado: ${dir}`);
      }
    }
    
    simpleLog.info('Todos os diretórios de upload foram criados/verificados');
    return true;
    
  } catch (error) {
    simpleLog.error('Erro ao criar diretórios de upload', error);
    throw error;
  }
}

module.exports = { createUploadDirs };