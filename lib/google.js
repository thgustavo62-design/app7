/* Cliente mínimo da API do Google Sheets, com conta de serviço. Sem dependências.
   Faz espera crescente quando o Google responde 429 ou erro 5xx. */
const crypto = require('crypto');
const b64u = v => Buffer.from(v).toString('base64url');
const sleepReal = ms => new Promise(r => setTimeout(r, ms));
const tokenCache = {};
/* mensagens sem segredo, mostradas na tela para facilitar o diagnóstico */
const fail = msg => Object.assign(new Error(msg), { status: 500, expose: true });

/* Tolerante a colagem imperfeita (quebras de linha no meio da chave, aspas ao redor, chave sem o "}" final):
   tenta o JSON normal e, se falhar, extrai client_email e private_key do texto e remonta o PEM. */
function rescueServiceAccount(raw) {
  const text = raw.replace(/\s+/g, '');                              /* sem espaços nem quebras: a colagem pode ter cortado em qualquer ponto */
  const email = (text.match(/client_email[\\"':]+([^\\"',]+@[^\\"',]+)/) || [])[1];
  const pem = text.match(/-----BEGINPRIVATEKEY-----([\s\S]*?)-----ENDPRIVATEKEY-----/);
  if (!email || !pem) return null;
  const body = pem[1].replace(/\\[nr]/g, '');                         /* tira os \n literais */
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return null;
  const token_uri = (text.match(/token_uri[\\"':]+(https:\/\/[^\\"',]+)/) || [])[1];
  return { client_email: email, private_key: `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`, token_uri };
}
function parseServiceAccount(raw) {
  let text = String(raw || '').trim();
  if (!text) throw fail('Falta a variável GOOGLE_SERVICE_ACCOUNT_JSON na Vercel');
  if (!/^["']?\{/.test(text) && !/client_email|BEGIN PRIVATE KEY/.test(text)) { try { text = Buffer.from(text, 'base64').toString('utf8'); } catch (e) { /* segue com o texto */ } }
  let sa;
  try { sa = JSON.parse(text); } catch (e) { sa = rescueServiceAccount(text); }
  if (!sa) {
    const flat = text.replace(/\s+/g, ''), sim = re => (re.test(flat) ? 'sim' : 'não');   /* só diz o que existe no texto; nada da chave aparece */
    throw fail(`GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido: cole o arquivo de chave inteiro (de { até }); precisa conter client_email e private_key. Recebi ${String(raw).length} caracteres; client_email: ${sim(/client_email/)}; início da chave (BEGIN PRIVATE KEY): ${sim(/BEGINPRIVATEKEY/)}; fim da chave (END PRIVATE KEY): ${sim(/ENDPRIVATEKEY/)}. Um arquivo de chave completo tem uns 2.300 caracteres.`);
  }
  if (!sa.client_email || !sa.private_key) throw fail('Chave da conta de serviço incompleta (faltam client_email ou private_key)');
  try { crypto.createPrivateKey(sa.private_key); } catch (e) { throw fail('A private_key da conta de serviço está incompleta ou corrompida: recopie o arquivo de chave inteiro'); }
  return sa;
}

class SheetsClient {
  constructor({ sheetId, serviceAccount, fetchFn = fetch, now = Date.now, sleep = sleepReal, retries = 4 }) {
    if (!sheetId) throw fail('Falta a variável SHEET_ID_DB na Vercel');
    this.id = sheetId; this.sa = parseServiceAccount(serviceAccount);
    this.fetch = fetchFn; this.now = now; this.sleep = sleep; this.retries = retries;
  }
  async token() {
    const c = tokenCache[this.sa.client_email];
    if (c && c.exp - 60e3 > this.now()) return c.value;
    const iat = Math.floor(this.now() / 1000), aud = this.sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud, iat, exp: iat + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key);
    const res = await this.fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64u(sig) }).toString() });
    if (!res.ok) throw fail(`Google recusou a conta de serviço (${res.status}). Confira a chave em GOOGLE_SERVICE_ACCOUNT_JSON`);
    const j = await res.json();
    tokenCache[this.sa.client_email] = { value: j.access_token, exp: this.now() + (j.expires_in || 3600) * 1000 };
    return j.access_token;
  }
  async call(method, path, { query, body } = {}) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.id}${path}${query ? '?' + query : ''}`;
    let last;
    for (let i = 0; i <= this.retries; i++) {
      const res = await this.fetch(url, { method, headers: { Authorization: 'Bearer ' + await this.token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 || res.status >= 500) { last = res.status; await this.sleep(300 * 2 ** i + Math.floor(Math.random() * 250)); continue; }
      if (!res.ok) { let t = ''; try { t = (await res.json()).error.message; } catch (e) { /* sem corpo */ } throw fail(`Sheets ${res.status}: ${t}${res.status === 403 || res.status === 404 ? ' (compartilhe a planilha com o e-mail da conta de serviço como Editor)' : ''}`); }
      return res.json();
    }
    throw new Error(`Sheets indisponível (${last})`);
  }
  batchGet(ranges) { return this.call('GET', '/values:batchGet', { query: ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&') + '&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE' }); }
  values(range) { return this.call('GET', `/values/${encodeURIComponent(range)}`, { query: 'majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE' }); }
  append(range, rows) { return this.call('POST', `/values/${encodeURIComponent(range)}:append`, { query: 'valueInputOption=RAW&insertDataOption=INSERT_ROWS', body: { values: rows } }); }
  update(range, rows) { return this.call('PUT', `/values/${encodeURIComponent(range)}`, { query: 'valueInputOption=RAW', body: { values: rows } }); }
  clear(range) { return this.call('POST', `/values/${encodeURIComponent(range)}:clear`, { body: {} }); }
}
module.exports = { SheetsClient, parseServiceAccount, _tokenCache: tokenCache };
