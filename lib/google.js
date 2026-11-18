/* Cliente mínimo da API do Google Sheets, com conta de serviço. Sem dependências.
   Faz espera crescente quando o Google responde 429 ou erro 5xx. */
const crypto = require('crypto');
const b64u = v => Buffer.from(v).toString('base64url');
const sleepReal = ms => new Promise(r => setTimeout(r, ms));
const tokenCache = {};

function parseServiceAccount(raw) {
  let text = String(raw || '').trim();
  if (!text) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ausente');
  if (text[0] !== '{') text = Buffer.from(text, 'base64').toString('utf8');
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) throw new Error('Chave da conta de serviço incompleta');
  return sa;
}

class SheetsClient {
  constructor({ sheetId, serviceAccount, fetchFn = fetch, now = Date.now, sleep = sleepReal, retries = 4 }) {
    if (!sheetId) throw new Error('SHEET_ID_DB ausente');
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
    if (!res.ok) throw new Error(`Google recusou a conta de serviço (${res.status})`);
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
      if (!res.ok) { let t = ''; try { t = (await res.json()).error.message; } catch (e) { /* sem corpo */ } throw new Error(`Sheets ${res.status}: ${t}`); }
      return res.json();
    }
    throw new Error(`Sheets indisponível (${last})`);
  }
  batchGet(ranges) { return this.call('GET', '/values:batchGet', { query: ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&') + '&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE' }); }
  append(range, rows) { return this.call('POST', `/values/${encodeURIComponent(range)}:append`, { query: 'valueInputOption=RAW&insertDataOption=INSERT_ROWS', body: { values: rows } }); }
  update(range, rows) { return this.call('PUT', `/values/${encodeURIComponent(range)}`, { query: 'valueInputOption=RAW', body: { values: rows } }); }
  clear(range) { return this.call('POST', `/values/${encodeURIComponent(range)}:clear`, { body: {} }); }
}
module.exports = { SheetsClient, parseServiceAccount, _tokenCache: tokenCache };
