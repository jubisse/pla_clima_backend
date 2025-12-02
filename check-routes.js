// check-routes.js
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando rotas para problemas...');

const routesDir = path.join(__dirname, 'routes');
const routeFiles = fs.readdirSync(routesDir);

routeFiles.forEach(file => {
    if (file.endsWith('.js')) {
        console.log(`\n📁 Verificando: ${file}`);
        const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
        
        // Verificar por métodos problemáticos
        const problematicPatterns = [
            /\.pick\(/,
            /\.omit\(/,
            /schemas\.[a-zA-Z_]+\.[a-zA-Z_]+\(/
        ];
        
        problematicPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                console.log(`❌ Problema encontrado em ${file}: ${matches[0]}`);
            }
        });
        
        console.log(`✅ ${file} - Verificação concluída`);
    }
});

console.log('\n🎉 Verificação de rotas completa!');