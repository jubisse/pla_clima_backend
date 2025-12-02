const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';
let authToken = '';

// Configurar axios
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Dados de teste
const TEST_DATA = {
  usuario: {
    email: 'john@demo.mz',
    senha: 'password123'
  },
  sessao: {
    id: 1
  }
};

async function testAPIs() {
  console.log('🧪 INICIANDO TESTES DAS APIs...\n');

  try {
    // 1. Testar Health Check
    await testHealthCheck();

    // 2. Testar Autenticação
    await testAuth();

    // 3. Testar APIs de Sessões
    await testSessionAPIs();

    // 4. Testar APIs de Votação
    await testVotingAPIs();

    // 5. Testar APIs de Notificações
    await testNotificationAPIs();

    console.log('\n✅ TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO!');

  } catch (error) {
    console.error('\n❌ ERRO NOS TESTES:', error.message);
    process.exit(1);
  }
}

async function testHealthCheck() {
  console.log('1. 🩺 TESTANDO HEALTH CHECK...');
  
  const response = await api.get('/health');
  
  if (response.data.success) {
    console.log('   ✅ Health Check - OK');
  } else {
    throw new Error('Health Check falhou');
  }
}

async function testAuth() {
  console.log('2. 🔐 TESTANDO AUTENTICAÇÃO...');
  
  // Login para obter token
  const loginResponse = await api.post('/auth/login', {
    email: TEST_DATA.usuario.email,
    senha: TEST_DATA.usuario.senha
  });

  if (loginResponse.data.success && loginResponse.data.token) {
    authToken = loginResponse.data.token;
    api.defaults.headers.Authorization = `Bearer ${authToken}`;
    console.log('   ✅ Login - OK');
  } else {
    throw new Error('Falha no login');
  }
}

async function testSessionAPIs() {
  console.log('3. 📋 TESTANDO APIs DE SESSÕES...');

  // Listar participantes da sessão
  const participantesResponse = await api.get(`/sessoes/${TEST_DATA.sessao.id}/participantes`);
  if (participantesResponse.data.success) {
    console.log('   ✅ Listar participantes - OK');
  }

  // Inscrever participante (usando usuário de teste)
  const inscricaoResponse = await api.post('/sessoes/participantes/inscrever', {
    sessao_id: TEST_DATA.sessao.id,
    usuario_id: 4 // John Teste
  });
  
  if (inscricaoResponse.data.success) {
    console.log('   ✅ Inscrever participante - OK');
  }

  // Atualizar status do participante
  const statusResponse = await api.put(`/sessoes/${TEST_DATA.sessao.id}/participantes/4`, {
    status: 'confirmado'
  });
  
  if (statusResponse.data.success) {
    console.log('   ✅ Atualizar status - OK');
  }

  // Listar sessões do usuário
  const sessoesUsuarioResponse = await api.get('/sessoes/usuario/4');
  if (sessoesUsuarioResponse.data.success) {
    console.log('   ✅ Listar sessões do usuário - OK');
  }
}

async function testVotingAPIs() {
  console.log('4. 🗳️ TESTANDO APIs DE VOTAÇÃO...');

  // Obter atividades para votação
  const atividadesResponse = await api.get('/votacao/atividades?sessao_id=1');
  if (atividadesResponse.data.success) {
    console.log('   ✅ Obter atividades - OK');
  }

  // Verificar status da votação
  const statusResponse = await api.get('/votacao/status?sessao_id=1');
  if (statusResponse.data.success) {
    console.log('   ✅ Verificar status - OK');
  }

  // Submeter votos (apenas se não tiver votado ainda)
  if (!statusResponse.data.data.votacao_concluida) {
    const votos = [
      {
        atividade_id: 1,
        pontuacao: 5,
        prioridade_usuario: 1,
        comentario: 'Excelente atividade'
      },
      {
        atividade_id: 2,
        pontuacao: 4,
        prioridade_usuario: 2
      },
      {
        atividade_id: 3,
        pontuacao: 3,
        prioridade_usuario: 3
      }
    ];

    const votacaoResponse = await api.post('/votacao/votar', {
      sessao_id: 1,
      votos
    });

    if (votacaoResponse.data.success) {
      console.log('   ✅ Submeter votos - OK');
    }
  } else {
    console.log('   ⚠️ Usuário já votou - Pulando submissão');
  }

  // Obter resultados
  const resultadosResponse = await api.get('/votacao/resultados?sessao_id=1');
  if (resultadosResponse.data.success) {
    console.log('   ✅ Obter resultados - OK');
  }
}

async function testNotificationAPIs() {
  console.log('5. 🔔 TESTANDO APIs DE NOTIFICAÇÕES...');

  // Obter notificações
  const notificacoesResponse = await api.get('/notificacoes');
  if (notificacoesResponse.data.success) {
    console.log('   ✅ Obter notificações - OK');
  }

  // Obter contador
  const contadorResponse = await api.get('/notificacoes/contador');
  if (contadorResponse.data.success) {
    console.log('   ✅ Obter contador - OK');
  }

  // Marcar uma notificação como lida (se houver notificações)
  if (notificacoesResponse.data.data.length > 0) {
    const marcarLidaResponse = await api.put(`/notificacoes/${notificacoesResponse.data.data[0].id}/ler`);
    if (marcarLidaResponse.data.success) {
      console.log('   ✅ Marcar como lida - OK');
    }
  }

  // Marcar todas como lidas
  const marcarTodasResponse = await api.put('/notificacoes/ler-todas');
  if (marcarTodasResponse.data.success) {
    console.log('   ✅ Marcar todas como lidas - OK');
  }
}

// Executar testes
testAPIs().catch(console.error);