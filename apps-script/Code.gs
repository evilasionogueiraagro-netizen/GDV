/**
 * GDV – Controle de Veículos (Barreira Fitossanitária)
 * API de sincronização: recebe registros do app (offline-first), grava na planilha
 * e devolve o que mudou desde a última sincronização.
 *
 * Acesso dos aparelhos (por fiscal):
 *   1. No menu "GDV" da planilha: "Gerar código de ativação" → informe o NOME COMPLETO do fiscal.
 *   2. O fiscal digita o código de 6 dígitos no app (uma vez). O servidor devolve uma credencial
 *      própria daquele aparelho, vinculada ao nome. Revogue em "GDV → Revogar acesso".
 *
 * Opcional (compatibilidade): Propriedades do script → ACCESS_KEY = chave mestra (administrador).
 */

const TABELAS = {
  Turnos: ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto',
           'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts',
           'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario'],   // colunas novas ficam sempre no fim
  Veiculos: ['id', 'turnoId', 'hora', 'placa', 'tipo', 'pessoas', 'obs',
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm'];
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_LINHAS_POR_ENVIO = 2000;

function doGet(e) {
  if (e && e.parameter && e.parameter.p === 'painel') return painel_();
  return json_({ ok: true, servico: 'GDV Controle de Veículos' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'ativar') return json_(ativar_(req));
    const usuario = autenticar_(req.key);
    if (req.action === 'ping') return json_({ ok: true, nome: usuario });
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    throw new Error('Ação inválida.');
  } catch (err) {
    return json_({ ok: false, erro: String(err.message || err) });
  }
}

function sincronizar_(req, usuario) {
  const turnos = lista_(req.turnos);
  const veiculos = lista_(req.veiculos);
  const since = Number(req.since) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const agora = Date.now();
    gravar_('Turnos', turnos, agora, usuario);
    gravar_('Veiculos', veiculos, agora, usuario);
    return {
      ok: true,
      agora: agora,
      turnos: lerMudancas_('Turnos', since),
      veiculos: lerMudancas_('Veiculos', since)
    };
  } finally {
    lock.releaseLock();
  }
}


/* ---------- Painel do administrador (somente leitura) ---------- */

/**
 * O painel é servido por uma SEGUNDA implantação do mesmo projeto, aberta em
 *   <URL da implantação do painel>?p=painel
 * Configuração (README): executar como "Usuário que acessa o app da Web", acesso "Qualquer pessoa com
 * conta Google", e Propriedades do script → ADMIN_EMAILS = "admin1@gmail.com,admin2@gmail.com".
 * Camadas de proteção: (1) lista ADMIN_EMAILS; (2) o servidor lê a planilha com a permissão de quem acessa.
 * Na implantação pública dos aparelhos (acesso anônimo) o e-mail vem vazio, então o painel nunca abre.
 */
function ehAdmin_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const lista = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
  return !!email && lista.indexOf(email) >= 0;
}

function exigirAdmin_() {
  if (!ehAdmin_()) throw new Error('Acesso restrito ao administrador.');
}

function painel_() {
  if (!ehAdmin_()) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font:16px system-ui;padding:24px;max-width:520px;margin:auto"><h2>Acesso restrito</h2>' +
      '<p>Este painel é exclusivo do administrador. Entre com a conta Google autorizada e abra o endereço do painel novamente.</p></body>')
      .setTitle('GDV – Acesso restrito');
  }
  return HtmlService.createHtmlOutputFromFile('Painel')
    .setTitle('GDV – Painel do administrador')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
}

/** Dados brutos do período (o painel calcula tudo no navegador). filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'} */
function painelDados(filtro) {
  exigirAdmin_();
  filtro = filtro || {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const de = re.test(filtro.de) ? filtro.de : '0000-00-00', ate = re.test(filtro.ate) ? filtro.ate : '9999-99-99';
  const turnos = lerLeitura_('Turnos').filter(function (t) { return t.data >= de && t.data <= ate; });
  const ids = {};
  turnos.forEach(function (t) { ids[t.id] = true; });
  const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
  return {
    geradoEm: Date.now(),
    turnos: turnos.map(function (t) {
      return { id: t.id, tf: t.numeroTF, d: t.data, ini: t.inicio, fim: t.fim, l: t.letra, po: t.posto, lo: t.local,
               un: t.unidade, f: t.fiscal, e: t.encerrado, u: t.usuario,
               la1: num(t.latIni), ln1: num(t.lngIni), la2: num(t.latFim), ln2: num(t.lngFim) };
    }),
    veiculos: lerLeitura_('Veiculos').filter(function (v) { return ids[v.turnoId] && !v.excluido; })
      .map(function (v) { return { t: v.turnoId, h: v.hora, p: v.placa, k: v.tipo, n: v.pessoas }; })
  };
}

/* ---------- Segurança ---------- */

/** Valida a credencial e devolve o nome do usuário (fiscal ou "Administrador"). */
function autenticar_(key) {
  key = String(key || '');
  if (!key) throw new Error('Aparelho não ativado.');
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (mestra && key === mestra) return 'Administrador';
  const t = lerTudo_('Fiscais');
  for (let i = 0; i < t.valores.length; i++) {
    const f = paraObjeto_(t.cols, t.valores[i]);
    if (f.token && f.token === key && f.ativo === 1) return f.nome;
  }
  throw new Error('Acesso revogado ou inválido. Ative o aparelho novamente com um novo código.');
}

/** O aparelho troca o código de 6 dígitos por uma credencial própria (uso único). */
function ativar_(req) {
  const cache = CacheService.getScriptCache();
  const falhas = Number(cache.get('falhas_ativacao') || 0);
  if (falhas >= MAX_FALHAS_ATIVACAO) throw new Error('Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.');
  const cod = String(req.codigo || '').replace(/\D/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now();
    let achada = -1;
    if (cod.length === 6) {
      t.valores.forEach(function (l, i) {
        const f = paraObjeto_(t.cols, l);
        if (achada < 0 && f.ativo === 1 && !f.token && f.codigo.padStart(6, '0') === cod && f.expiraEm > agora) achada = i;
      });
    }
    if (achada < 0) {
      cache.put('falhas_ativacao', String(falhas + 1), 900);
      throw new Error('Código inválido, já usado ou expirado.');
    }
    const f = paraObjeto_(t.cols, t.valores[achada]);
    f.token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    f.ativadoEm = agora;
    f.codigo = '';                                            // código de uso único
    t.sh.getRange(achada + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
    return { ok: true, nome: f.nome, token: f.token };
  } finally {
    lock.releaseLock();
  }
}

/** Cria uma autorização (linha em "Fiscais") e devolve o código de 6 dígitos. */
function gerarCodigo_(nome) {
  nome = String(nome || '').trim().replace(/\s+/g, ' ');
  if (nome.split(' ').length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now();
    const emUso = {};
    t.valores.forEach(function (l) {
      const f = paraObjeto_(t.cols, l);
      if (f.ativo === 1 && !f.token && f.codigo) emUso[f.codigo.padStart(6, '0')] = true;
    });
    let codigo;
    do {
      codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');
    } while (emUso[codigo]);
    const expiraEm = agora + VALIDADE_CODIGO_MS;
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length)
      .setValues([[nome, codigo, expiraEm, 1, '', 0]]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome };
  } finally {
    lock.releaseLock();
  }
}

/** Revoga todos os aparelhos/códigos de um fiscal (pelo nome). Devolve quantos foram revogados. */
function revogar_(nome) {
  nome = String(nome || '').trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (f.nome.trim().toLowerCase() === nome && f.ativo === 1) {
        f.ativo = 0;
        t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
        n++;
      }
    });
    return n;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Menu da planilha (administrador) ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GDV')
    .addItem('Gerar código de ativação', 'menuGerarCodigo')
    .addItem('Revogar acesso de um fiscal', 'menuRevogar')
    .addToUi();
}

function menuGerarCodigo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Gerar código de ativação', 'Nome COMPLETO do fiscal (como deve aparecer nos documentos):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText());
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nEnvie ao fiscal. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuRevogar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Revogar acesso', 'Nome COMPLETO do fiscal (igual ao cadastrado na aba Fiscais):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const n = revogar_(r.getResponseText());
  ui.alert(n ? 'Acesso revogado em ' + n + ' aparelho(s)/código(s).' : 'Nenhum acesso ativo encontrado com esse nome.');
}

/* ---------- Planilha ---------- */

function planilha_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  let ss = SpreadsheetApp.getActiveSpreadsheet();   // projeto criado a partir da planilha
  if (!ss) ss = SpreadsheetApp.create('GDV - Controle de Veículos (banco de dados)');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function aba_(nome) {
  const ss = planilha_();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    const cols = TABELAS[nome];
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#dbe6f7');
    sh.setFrozenRows(1);
    // Texto puro: impede o Sheets de converter datas/placas ou interpretar fórmulas.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  } else {
    garantirColunas_(sh, nome);
  }
  return sh;
}

/** Planilhas criadas por versões anteriores ganham as colunas novas (no fim), sem mexer nos dados. */
function garantirColunas_(sh, nome) {
  const cols = TABELAS[nome];
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  const atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  cols.forEach(function (c, i) {
    if (atual[i] === c) return;
    if (atual[i] !== '' && atual[i] !== undefined && atual[i] !== null) {
      throw new Error('Cabeçalho da aba ' + nome + ' diferente do esperado na coluna ' + (i + 1) + '.');
    }
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#dbe6f7');
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function lerTudo_(nome) {
  const sh = aba_(nome), cols = TABELAS[nome], n = sh.getLastRow() - 1;
  const valores = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  return { sh: sh, cols: cols, valores: valores };
}

function paraObjeto_(cols, linha) {
  const o = {};
  cols.forEach(function (c, i) {
    let v = linha[i];
    if (v instanceof Date) v = Utilities.formatDate(v, 'America/Manaus', 'yyyy-MM-dd');
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null ? '' : v);
  });
  return o;
}

function gravar_(nome, recebidos, ts, usuario) {
  if (!recebidos.length) return;
  const t = lerTudo_(nome), cols = t.cols, idx = {};
  t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });

  const porId = {};                         // dedup no lote: vale o mais recente
  recebidos.forEach(function (r) {
    const o = limpar_(cols, r);
    if (!o) return;
    if (!porId[o.id] || o.atualizadoEm >= porId[o.id].atualizadoEm) porId[o.id] = o;
  });

  const novas = [];
  Object.keys(porId).forEach(function (id) {
    const o = porId[id];
    o.srv_ts = ts;
    o.usuario = usuario;                       // quem sincronizou (definido pelo servidor, não pelo app)
    const linha = cols.map(function (c) { return o[c]; });
    if (idx[id] === undefined) {
      novas.push(linha);
    } else {
      const atual = paraObjeto_(cols, t.valores[idx[id]]);
      if (o.atualizadoEm >= atual.atualizadoEm) {   // última edição vence
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([linha]);
      }
    }
  });
  if (novas.length) {
    t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
  }
}

function lerMudancas_(nome, since) {
  const t = lerTudo_(nome), i = t.cols.indexOf('srv_ts');
  return t.valores.filter(function (l) { return Number(l[i]) > since; })
                  .map(function (l) { return paraObjeto_(t.cols, l); });
}

function limpar_(cols, r) {
  if (!r || !r.id || String(r.id).length > 64) return null;
  const o = {};
  cols.forEach(function (c) {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v).slice(0, 500);
  });
  return o;
}

function lista_(a) {
  if (!Array.isArray(a)) return [];
  if (a.length > MAX_LINHAS_POR_ENVIO) throw new Error('Lote grande demais.');
  return a;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
