/* Configuração lida do ambiente a cada chamada (facilita testes).
   "hosted" é verdadeiro em qualquer ambiente da Vercel (produção ou prévia): nele não existe
   segredo padrão nem login de desenvolvimento. */
function cfg() {
  const e = process.env;
  const hosted = !!e.VERCEL || e.NODE_ENV === 'production';
  return {
    hosted,
    driver: e.DB_DRIVER || (e.DB_BACKEND === 'pg' && (e.DATABASE_URL || e.POSTGRES_URL) ? 'pg' : (e.SHEET_ID_DB && e.GOOGLE_SERVICE_ACCOUNT_JSON ? 'sheets' : 'memory')),
    databaseUrl: e.DATABASE_URL || e.POSTGRES_URL || '',                 /* POSTGRES_URL é o nome que as integrações de banco da Vercel (Neon, Supabase) criam sozinhas */
    sheetId: e.SHEET_ID_DB || '',
    serviceAccount: e.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    clientId: e.GOOGLE_CLIENT_ID || '',
    sessionSecret: e.SESSION_SECRET || (hosted ? '' : 'segredo-so-para-desenvolvimento-local'),
    devEmail: hosted ? '' : (e.AUTH_DEV_EMAIL || 'dev@local'),
    windsorKey: e.WINDSOR_API_KEY || '',
    cronSecret: e.CRON_SECRET || '',
    leituraToken: e.LEITURA_TOKEN || '',                                 /* chave do computador da agência que lê PDFs e estoques (PowerShell) */
    centralSheetId: e.CENTRAL_SHEET_ID || '',
    defaultPassword: e.SENHA_PADRAO || (hosted ? '' : 'Nova7@dev123'),
    sessionTtl: Number(e.SESSION_TTL_SECONDS) || 12 * 3600
  };
}
/* Erro de configuração ou de acesso ao Google: a mensagem não tem segredo e aparece na tela para facilitar o diagnóstico. */
class ConfigError extends Error { constructor(msg) { super(msg); this.name = 'ConfigError'; this.status = 500; this.expose = true; } }
module.exports = { cfg, ConfigError };
