// Executa o Code.gs real em Node com um SpreadsheetApp falso (em memória) e expõe como HTTP.
// API (doPost + rotas /__* de controle dos testes) em GDV_PORTA_API (8082); web/ estático em GDV_PORTA_WEB (8081).
require('./lib/relogio');   // GDV_DESLOC_MS: desloca o relógio (testes que dependem da data)
const vm = require('vm'), fs = require('fs'), http = require('http'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PORTA_WEB = Number(process.env.GDV_PORTA_WEB) || 8081, PORTA_API = Number(process.env.GDV_PORTA_API) || 8082;
// dia (Manaus, UTC−4) n dias antes de hoje: a linha "antigo-1" fica sempre 3 dias atrás (painel_test/tv_test usam o mesmo cálculo)
const diaManaus = n => new Date(Date.now() - 4 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const sheets = {};
function mkSheet(name) {
  const rows = []; // rows[0] = header
  let extraLinhas = 0;
  const sh = {
    getLastRow: () => rows.length,
    getMaxRows: () => Math.max(1000, rows.length) + extraLinhas,
    getMaxColumns: () => 13,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    insertColumnsAfter() {},
    insertColumnBefore(c) { rows.forEach(r => { if (r.length >= c) r.splice(c - 1, 0, ''); }); },
    insertRowsAfter(_, n) { extraLinhas += n; },
    deleteRows(r, n) { if (r < 2 || r + n - 1 > rows.length) throw new Error('deleteRows fora da faixa (' + r + ', ' + n + ')'); rows.splice(r - 1, n); },
    setFrozenRows() {},
    getRange(r, c, nr, nc) {
      const rg = {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) out.push((rows[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); return out; },
        setValues: v => { v.forEach((l, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; l.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return rg; },
        setValue: v => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; return rg; },
        setNumberFormat: () => rg, setFontWeight: () => rg, setBackground: () => rg
      };
      return rg;
    },
    _rows: rows
  };
  return sh;
}
sheets.Turnos = mkSheet('Turnos');
sheets.Turnos._rows.push(['id','numeroTF','data','letra','inicio','fim','fiscal','local','unidade','posto','encerrado','criadoEm','atualizadoEm','srv_ts']);
sheets.Turnos._rows.push(['antigo-1','TF-001-A-' + diaManaus(3).slice(0, 4),diaManaus(3),'A','04:00','12:00','Maria','CEASA','MANAUS','Fixa',1,1,1,1]);
sheets.Fiscais = mkSheet('Fiscais');
sheets.Fiscais._rows.push(['nome','codigo','expiraEm','ativo','token','ativadoEm']);
sheets.Fiscais._rows.push(['Antigo Fiscal','',1,1,'tok-antigo',1]);
// Planilhas (a principal "fake" e as criadas com SpreadsheetApp.create, ex.: arquivo anual). id → {nome, sheets, api}
const planilhas = {};
function mkSS(id, nome, shs) {
  const api = { getId: () => id, getName: () => nome, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    getSheetByName: n => shs[n] || null, insertSheet: n => (shs[n] = mkSheet(n)), getSheets: () => Object.values(shs) };
  planilhas[id] = { nome, sheets: shs, api };
  return api;
}
const ss = mkSS('fake', 'GDV planilha', sheets);
const props = { ACCESS_KEY: 'segredo' };
const cache = new Map();
let emailAtual = '', emailDono = 'dono@exemplo.gov.br';
const gatilhos = [], emails = []; let trigSeq = 0;
const apiGatilho = t => ({ getHandlerFunction: () => t.fn, getUniqueId: () => t.id });
// ---- Drive falso (pastas/arquivos em memória) ----
const drive = { itens: {}, seq: 0 };
function mkFolder(nome, pai) {
  const id = 'pasta-' + (++drive.seq), f = { kind: 'pasta', id, nome, pai, trashed: false };
  drive.itens[id] = f;
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  f.api = {
    getId: () => id, getName: () => nome, isTrashed: () => f.trashed, setTrashed: v => { f.trashed = !!v; },
    getFoldersByName: n => iter(Object.values(drive.itens).filter(x => x.kind === 'pasta' && x.pai === id && x.nome === n && !x.trashed).map(x => x.api)),
    createFolder: n => mkFolder(n, id).api,
    createFile: blob => {
      const fid = 'arq-' + (++drive.seq), a = { kind: 'arquivo', id: fid, nome: blob.getName(), mime: blob.getContentType(), bytes: blob.bytes, pai: id, trashed: false, compartilhado: false };
      drive.itens[fid] = a;
      return mkArqApi(a);
    },
    getFiles: () => iter(Object.values(drive.itens).filter(x => x.kind === 'arquivo' && x.pai === id).map(x => x.api)),
    getFilesByName: n => iter(Object.values(drive.itens).filter(x => x.kind === 'arquivo' && x.pai === id && x.nome === n).map(x => x.api))
  };
  return f;
}
let relogioDrive = 0;   // datas de criação crescentes (makeCopy no mesmo ms)
function mkArqApi(a) {
  a.criado = a.criado || (Date.now() + (++relogioDrive));
  a.api = { getId: () => a.id, getUrl: () => 'https://drive.google.com/file/d/' + a.id + '/view', getName: () => a.nome, setTrashed: v => { a.trashed = !!v; },
    isTrashed: () => a.trashed, getDateCreated: () => new Date(a.criado), setSharing: () => { a.compartilhado = true; },
    moveTo: pasta => { a.pai = pasta.getId(); return a.api; },
    makeCopy: (nome, pasta) => { if (driveFalha) throw new Error('Drive indisponível (teste)'); const fid = 'arq-' + (++drive.seq), c = { kind: 'arquivo', id: fid, nome, mime: a.mime, bytes: [], pai: pasta.getId(), trashed: false, compartilhado: false, copiaDe: a.id };
      drive.itens[fid] = c; return mkArqApi(c); } };
  return a.api;
}
var driveFalha = false;
const planilhaArq = { kind: 'arquivo', id: 'fake', nome: 'GDV planilha', mime: 'application/vnd.google-apps.spreadsheet', bytes: [], pai: null, trashed: false };
const caminho = it => { const p = []; let x = it; while (x) { p.unshift(x.nome); x = x.pai ? drive.itens[x.pai] : null; } return p.join('/'); };
const DriveApp = {
  getFileById: id => { if (id === 'fake') return planilhaArq.api || mkArqApi(planilhaArq); const f = drive.itens[id]; if (!f || f.kind !== 'arquivo') throw new Error('No item with the given ID could be found.'); return f.api; },
  getFolderById: id => { const f = drive.itens[id]; if (!f || f.kind !== 'pasta') throw new Error('No item with the given ID could be found.'); return f.api; },
  createFolder: n => mkFolder(n, null).api,
  Access: { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' }
};
const ctx = {
  console, Date, JSON, Number, String, Object, Array,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {},
    create: nome => { const id = 'planilha-' + (++drive.seq);   // planilha nova: arquivo no Drive (raiz) com a aba padrão "Página1"
      drive.itens[id] = { kind: 'arquivo', id, nome, mime: 'application/vnd.google-apps.spreadsheet', bytes: [], pai: null, trashed: false, compartilhado: false };
      mkArqApi(drive.itens[id]); return mkSS(id, nome, { 'Página1': mkSheet('Página1') }); },
    openById: id => { const p = planilhas[id]; if (!p) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.'); return p.api; } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => props[k] = String(v), deleteProperty: k => { delete props[k]; } }) },
  ScriptApp: {
    newTrigger: fn => { const cfg = { fn }; const b = { timeBased: () => b, everyMinutes: n => (cfg.everyMinutes = n, b), everyHours: n => (cfg.everyHours = n, b), everyDays: n => (cfg.everyDays = n, b),
      atHour: h => (cfg.atHour = h, b), nearMinute: m => (cfg.nearMinute = m, b), onMonthDay: d => (cfg.onMonthDay = d, b), inTimezone: z => (cfg.tz = z, b),
      create: () => { const t = { id: 'trig-' + (++trigSeq), ...cfg }; gatilhos.push(t); return apiGatilho(t); } }; return b; },
    getProjectTriggers: () => gatilhos.map(apiGatilho),
    deleteTrigger: tr => { const i = gatilhos.findIndex(g => g.id === tr.getUniqueId()); if (i >= 0) gatilhos.splice(i, 1); }
  },
  MailApp: { sendEmail: m => { if (typeof m !== 'object') throw new Error('use o formato de objeto'); emails.push(JSON.parse(JSON.stringify(m))); } },
  LockService: { getScriptLock: () => ({ waitLock() { if (lockFalha && --lockFalha === 0) throw new Error('Lock timeout: another process was holding the lock for too long.'); }, releaseLock() {} }) },
  Utilities: { formatDate: (d, tz, fmt) => {                           // como no Apps Script: no fuso pedido (ex.: America/Manaus), não em UTC
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(d)).map(x => [x.type, x.value]));
      return String(fmt || 'yyyy-MM-dd').replace(/yyyy|MM|dd|HH|mm|ss/g, k => ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second })[k]);
    }, getUuid: () => require('crypto').randomUUID(),
    base64Decode: s => { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Could not decode string.'); return Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)); },
    newBlob: (bytes, mime, nome) => ({ bytes, getName: () => nome, getContentType: () => mime, getBytes: () => bytes }),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },   // computeDigest devolve bytes com sinal (-128..127), como no Apps Script
    computeDigest: (alg, txt) => Array.from(require('crypto').createHash(alg).update(String(txt), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)) },
  DriveApp,
  Session: { getActiveUser: () => ({ getEmail: () => emailAtual }), getEffectiveUser: () => ({ getEmail: () => emailDono }) },
  HtmlService: { createHtmlOutput: h => ({ kind: 'html', content: h, setTitle() { return this; } }), createHtmlOutputFromFile: n => ({ kind: 'arquivo', name: n, setTitle() { return this; }, addMetaTag() { return this; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ getContent: () => t, setMimeType() { return this; } }) },
  // UrlFetchApp falso: só o tokeninfo do Google (login do Portal do Administrativo). Os testes registram as respostas por token em
  // /__tokeninfo?token=&status=&body= ; token desconhecido = 400 {"error":"invalid_token"}. /__fetches lista as URLs (com o token mascarado).
  UrlFetchApp: { fetch: (url, opts) => {
    const m = /[?&]id_token=([^&]*)/.exec(String(url)), t = m ? decodeURIComponent(m[1]) : '';
    fetches.push(String(url).replace(/id_token=[^&]*/, 'id_token=***'));
    if (!/^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?/.test(String(url))) throw new Error('UrlFetchApp falso: URL não esperada ' + url);
    const r = tokeninfo[t] || { status: 400, body: JSON.stringify({ error: 'invalid_token', error_description: 'Invalid Value' }) };
    return { getResponseCode: () => r.status, getContentText: () => r.body };
  } }
};
const tokeninfo = {}, fetches = [];
vm.createContext(ctx);
// Todos os .gs, como no Apps Script: um escopo global só. Code.gs primeiro (como no workflow de publicação); a ordem
// dos demais não importa (ordem_arquivos_test confere).
for (const arq of require('./lib/arquivos-gs').arquivosGs()) vm.runInContext(fs.readFileSync(arq, 'utf8'), ctx, { filename: arq });
let online = true;
var lockFalha = 0;   // /__lockfalha?n=K: a K-ésima próxima waitLock dá timeout (teste)
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/__lockfalha')) { lockFalha = Number(new URL(req.url, 'http://x').searchParams.get('n')) || 0; return res.end('ok'); }
  if (req.url === '/__gatilhos') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(gatilhos)); }
  if (req.url === '/__emails') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(emails)); }
  if (req.url.startsWith('/__props')) { const q = new URL(req.url, 'http://x').searchParams; if (q.has('set')) { const v = q.get('valor'); if (v === null) delete props[q.get('set')]; else props[q.get('set')] = v; }
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(props)); }
  if (req.url.startsWith('/__cache')) { const q = new URL(req.url, 'http://x').searchParams; if (q.has('del')) cache.delete(q.get('del')); return res.end('ok'); }
  if (req.url.startsWith('/__criarArquivo')) { const q = new URL(req.url, 'http://x').searchParams, pasta = drive.itens[props[q.get('pastaProp')]];   // arquivo numa pasta guardada nas propriedades
    if (!pasta) return res.end('sem pasta'); const a = pasta.api.createFile(ctx.Utilities.newBlob([], 'application/octet-stream', q.get('nome'))); return res.end(a.getId()); }
  if (req.url.startsWith('/__drivefalha')) { driveFalha = new URL(req.url, 'http://x').searchParams.get('v') === '1'; return res.end('ok'); }
  if (req.url.startsWith('/__tokeninfo')) { const q = new URL(req.url, 'http://x').searchParams; tokeninfo[q.get('token')] = { status: Number(q.get('status')) || 200, body: q.get('body') || '{}' }; return res.end('ok'); }
  if (req.url === '/__fetches') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(fetches)); }
  if (req.url === '/__tudo') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([n, sh]) => [n, sh._rows])))); }
  if (req.url === '/__off') { online = false; return res.end('off'); }
  if (req.url === '/__on') { online = true; return res.end('on'); }
  if (req.url.startsWith('/__gerar')) { const n = new URL(req.url, 'http://x').searchParams.get('nome'); res.setHeader('content-type', 'application/json'); try { return res.end(JSON.stringify(ctx.gerarCodigo_(n, new URL(req.url, 'http://x').searchParams.get('perfil') || ''))); } catch (e) { return res.end(JSON.stringify({ erro: e.message })); } }
  if (req.url.startsWith('/__revogar')) { const n = new URL(req.url, 'http://x').searchParams.get('nome'); return res.end(String(ctx.revogar_(n))); }
  if (req.url.startsWith('/__expirar')) { const c = new URL(req.url, 'http://x').searchParams.get('codigo'); sheets.Fiscais._rows.forEach((r, i) => { if (i > 0 && String(r[1]) === c) r[2] = 1; }); return res.end('ok'); }
  if (req.url.startsWith('/__append')) { const q = new URL(req.url, 'http://x').searchParams; (sheets[q.get('aba')] = sheets[q.get('aba')] || mkSheet(q.get('aba')))._rows.push(JSON.parse(q.get('row'))); return res.end('ok'); }
  if (req.url.startsWith('/__editar')) { const q = new URL(req.url, 'http://x').searchParams, sh = sheets[q.get('aba')]; if (!sh) return res.end('sem aba');   // /__editar?aba=&col=&valor=&onde=coluna:valor (todas as linhas que casam)
    const cab = sh._rows[0], c = cab.indexOf(q.get('col')), [oc, ov] = (q.get('onde') || '').split(/:(.*)/); const io = oc ? cab.indexOf(oc) : -1; let n = 0;
    sh._rows.forEach((r, i) => { if (i > 0 && (io < 0 || String(r[io]) === ov)) { r[c] = JSON.parse(q.get('valor')); n++; } }); return res.end(String(n)); }
  if (req.url.startsWith('/__fn')) { const q = new URL(req.url, 'http://x').searchParams; res.setHeader('content-type', 'application/json');
    try { return res.end(JSON.stringify({ r: ctx[q.get('nome')](...JSON.parse(q.get('args') || '[]')) })); } catch (e) { return res.end(JSON.stringify({ erro: e.message })); } }
  if (req.url.startsWith('/__doget')) { const q = new URL(req.url, 'http://x').searchParams; res.setHeader('content-type', 'application/json');
    const o = ctx.doGet({ parameter: { p: q.get('p') } }); return res.end(JSON.stringify(o.kind ? { kind: o.kind, name: o.name } : { json: o.getContent() })); }
  if (req.url === '/__drive') { res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ pastaRaiz: props.PASTA_ARQUIVOS || null, arquivos: Object.values(drive.itens).filter(x => x.kind === 'arquivo').map(a => ({ id: a.id, nome: a.nome, caminho: caminho(drive.itens[a.pai]), mime: a.mime, tamanho: a.bytes.length, lixeira: a.trashed, compartilhado: a.compartilhado })),
      pastas: Object.values(drive.itens).filter(x => x.kind === 'pasta' && !x.trashed).map(caminho) })); }
  if (req.url === '/__planilhas') { res.setHeader('content-type', 'application/json');   // planilhas criadas pelo script (arquivo anual): nome, pasta, abas
    return res.end(JSON.stringify(Object.fromEntries(Object.entries(planilhas).filter(([id]) => id !== 'fake').map(([id, p]) => [id, { nome: p.nome,
      pasta: drive.itens[id] && drive.itens[id].pai ? caminho(drive.itens[drive.itens[id].pai]) : '', lixeira: !!(drive.itens[id] && drive.itens[id].trashed),
      url: p.api.getUrl(), abas: Object.fromEntries(Object.entries(p.sheets).map(([n, sh]) => [n, sh._rows])) }])))); }
  if (req.url === '/__apagarPasta') { const f = drive.itens[props.PASTA_ARQUIVOS]; if (f) f.trashed = true; return res.end('ok'); }
  if (req.url.startsWith('/__aba')) { const n = new URL(req.url, 'http://x').searchParams.get('nome'); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(sheets[n] ? sheets[n]._rows : null)); }
  if (req.url === '/__dump') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ T: sheets.Turnos && sheets.Turnos._rows, V: sheets.Veiculos && sheets.Veiculos._rows, F: sheets.Fiscais && sheets.Fiscais._rows })); }
  if (!online) { req.destroy(); return; }
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(ctx.doPost({ postData: { contents: b } }).getContent()); });
}).listen(PORTA_API);
// servidor estático do web/
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, 'web', p);
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('nf'); } res.setHeader('content-type', types[path.extname(f)] || 'text/plain'); res.end(d); });
}).listen(PORTA_WEB);
console.log('ready');
