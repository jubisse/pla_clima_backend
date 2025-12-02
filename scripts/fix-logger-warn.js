// backend/scripts/fix-logger-warn.js
const fs = require('fs');
const path = require('path');

console.log('🔧 CORRIGINDO FUNÇÃO logger.warn...\n');

// 1. Corrigir sessions.js
const sessionsPath = path.join(__dirname, '../routes/sessions.js');
if (fs.existsSync(sessionsPath)) {
  let sessionsContent = fs.readFileSync(sessionsPath, 'utf8');
  
  // Substituir a definição do logger
  const oldLogger = `// ✅ LOGGER ROBUSTO
const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.log(\`[SESSIONS-INFO] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.error(\`[SESSIONS-ERROR] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toLocaleString('pt-MZ');
      console.log(\`[SESSIONS-DEBUG] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
    }
  }
};`;

  const newLogger = `// ✅ LOGGER ROBUSTO
const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.log(\`[SESSIONS-INFO] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.error(\`[SESSIONS-ERROR] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
  },
  warn: (message, meta = {}) => {
    const timestamp = new Date().toLocaleString('pt-MZ');
    console.warn(\`[SESSIONS-WARN] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toLocaleString('pt-MZ');
      console.log(\`[SESSIONS-DEBUG] \${timestamp} | \${message}\`, Object.keys(meta).length ? meta : '');
    }
  }
};`;

  if (sessionsContent.includes('logger.warn')) {
    sessionsContent = sessionsContent.replace(oldLogger, newLogger);
    fs.writeFileSync(sessionsPath, sessionsContent);
    console.log('✅ sessions.js corrigido');
  } else {
    console.log('⚠️ sessions.js não usa logger.warn, verificando estrutura...');
  }
}

// 2. Verificar se há outros arquivos com o mesmo problema
const routesDir = path.join(__dirname, '../routes');
const files = fs.readdirSync(routesDir);

files.forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('logger.warn') && !content.includes('warn:')) {
      console.log(`🔍 ${file} usa logger.warn mas não tem a função definida`);
      
      // Adicionar função warn ao logger
      if (content.includes('const logger = {')) {
        content = content.replace(
          /error:.*?,\s*debug:/s,
          'error: (message, meta = {}) => {\n    const timestamp = new Date().toLocaleString(\'pt-MZ\');\n    console.error(`[ERROR] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : \'\');\n  },\n  warn: (message, meta = {}) => {\n    const timestamp = new Date().toLocaleString(\'pt-MZ\');\n    console.warn(`[WARN] ${timestamp} | ${message}`, Object.keys(meta).length ? meta : \'\');\n  },\n  debug:'
        );
        fs.writeFileSync(filePath, content);
        console.log(`✅ ${file} corrigido`);
      }
    }
  }
});

console.log('\n🎉 CORREÇÃO DO LOGGER CONCLUÍDA!');
console.log('\n📝 REINICIE O SERVIDOR: npm start');