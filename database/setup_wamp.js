const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupWampDatabase() {
    let connection;
    
    try {
        console.log('🚀 Iniciando configuração para WAMP...');
        console.log('📊 Conectando ao MySQL do WAMP...');
        
        // Configuração para WAMP (normalmente sem password)
        const config = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        };

        connection = mysql.createConnection(config);
        
        // Conectar à base de dados
        await new Promise((resolve, reject) => {
            connection.connect((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        
        console.log('✅ Conectado ao MySQL do WAMP');
        
        // Ler o ficheiro SQL
        const sqlPath = path.join(__dirname, 'setup_wamp.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('📦 Executando script SQL...');
        
        // Executar o script SQL
        await new Promise((resolve, reject) => {
            connection.query(sql, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
        
        console.log('🎉 Base de dados criada com sucesso no WAMP!');
        console.log('\n📋 RESUMO DA CONFIGURAÇÃO:');
        console.log('   🌐 Servidor: localhost:3306');
        console.log('   🗄️  Base de Dados: climatica_mz');
        console.log('   👤 Utilizador: root');
        console.log('   🔐 Password: (vazio)');
        
        console.log('\n👤 USUÁRIOS DE DEMONSTRAÇÃO:');
        console.log('   📧 admin@demo.mz');
        console.log('   📧 facilitador@demo.mz');
        console.log('   📧 participante@demo.mz');
        console.log('   🔑 Senha para todos: Demo123!');
        
        console.log('\n🚀 PRÓXIMOS PASSOS:');
        console.log('   1. Inicie o servidor: npm run dev');
        console.log('   2. Aceda: http://localhost:5000');
        console.log('   3. Faça login com um dos usuários demo');
        
    } catch (error) {
        console.error('❌ Erro ao configurar base de dados:', error.message);
        console.log('\n🔧 SOLUÇÕES COMUNS:');
        console.log('   • Verifique se o WAMP está executando');
        console.log('   • Verifique se o MySQL está ativo no WAMP');
        console.log('   • Confirme que não há password no root');
        console.log('   • Verifique a porta do MySQL (normalmente 3306)');
        
        process.exit(1);
    } finally {
        if (connection) {
            connection.end();
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    setupWampDatabase();
}

module.exports = setupWampDatabase;