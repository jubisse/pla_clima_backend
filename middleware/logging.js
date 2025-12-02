const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, originalUrl, ip } = req;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`🌐 ${timestamp} | ${method} ${originalUrl} | IP: ${ip} | Agent: ${userAgent.substring(0, 50)}...`);
  
  // Log do body (exceto senhas)
  if (req.body && Object.keys(req.body).length > 0) {
    const logBody = { ...req.body };
    if (logBody.password) logBody.password = '***';
    if (logBody.senha) logBody.senha = '***';
    console.log(`   📦 Body:`, JSON.stringify(logBody));
  }
  
  next();
};

// Middleware de erro simplificado
const errorLogger = (error, req, res, next) => {
  console.error(`💥 ERRO: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  next(error);
};

module.exports = {
  requestLogger,
  errorLogger
};