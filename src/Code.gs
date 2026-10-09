/**
 * GDV - Gestão de Dados da Fazenda
 * Web App em Google Apps Script. Banco de dados: Google Sheets (planilha vinculada).
 */

const TZ = 'America/Sao_Paulo';

// Definição das tabelas. A interface (formulários/listas) é gerada a partir daqui:
// para adicionar um campo ou tabela basta editar este objeto.
const SCHEMA = {
  Animais: {
    label: 'Animais',
    fields: [
      { key: 'brinco', label: 'Brinco', type: 'text', required: true, unique: true },
      { key: 'nome', label: 'Nome', type: 'text' },
      { key: 'raca', label: 'Raça', type: 'text' },
      { key: 'sexo', label: 'Sexo', type: 'select', options: ['Macho', 'Fêmea'], required: true },
      { key: 'nascimento', label: 'Nascimento', type: 'date' },
      { key: 'lote', label: 'Lote / Pasto', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Vendido', 'Morto', 'Descartado'], required: true },
      { key: 'obs', label: 'Observações', type: 'textarea' }
    ]
  },
  Pesagens: {
    label: 'Pesagens',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'brinco', label: 'Animal (brinco)', type: 'select', ref: 'Animais.brinco', required: true },
      { key: 'peso', label: 'Peso (kg)', type: 'number', required: true, min: 0 }
    ]
  },
  Financeiro: {
    label: 'Financeiro',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Receita', 'Despesa'], required: true },
      { key: 'categoria', label: 'Categoria', type: 'select', required: true,
        options: ['Venda de animais', 'Compra de animais', 'Ração/Sal mineral', 'Sanidade/Vacinas',
                  'Mão de obra', 'Combustível', 'Manutenção', 'Arrendamento', 'Outros'] },
      { key: 'descricao', label: 'Descrição', type: 'text' },
      { key: 'valor', label: 'Valor (R$)', type: 'number', required: true, min: 0 }
    ]
  }
};

const META_COLS = ['id', 'criado_em', 'usuario'];

/* ---------- Entrada do Web App ---------- */

function doGet() {
  checkAccess_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('GDV - Gestão da Fazenda')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Rode uma vez no editor (ou será executada automaticamente no 1º acesso). */
function setup() {
  Object.keys(SCHEMA).forEach(function (name) { getSheet_(name); });
}

/* ---------- API chamada pelo front-end (google.script.run) ---------- */

function api_init() {
  checkAccess_();
  setup();
  return { schema: SCHEMA, user: userEmail_() };
}

function api_list(entity) {
  checkAccess_();
  const rows = readAll_(entity);
  return rows.sort(function (a, b) {
    return String(b.data || b.criado_em).localeCompare(String(a.data || a.criado_em));
  });
}

function api_refValues(ref) {
  checkAccess_();
  const p = ref.split('.');
  return readAll_(p[0]).map(function (r) { return r[p[1]]; }).filter(String).sort();
}

function api_save(entity, record) {
  checkAccess_();
  const def = schema_(entity);
  const clean = validate_(def, record, entity);
  return withLock_(function () {
    const sheet = getSheet_(entity);
    const headers = headers_(def);
    if (record.id) {
      const rowIdx = findRow_(sheet, record.id);
      if (!rowIdx) throw new Error('Registro não encontrado.');
      const old = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
      const row = headers.map(function (h, i) {
        if (h === 'id' || h === 'criado_em') return old[i];
        if (h === 'usuario') return userEmail_();
        return clean[h];
      });
      sheet.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
      return record.id;
    }
    const id = Utilities.getUuid();
    const row = headers.map(function (h) {
      if (h === 'id') return id;
      if (h === 'criado_em') return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
      if (h === 'usuario') return userEmail_();
      return clean[h];
    });
    sheet.appendRow(row);
    return id;
  });
}

function api_delete(entity, id) {
  checkAccess_();
  schema_(entity);
  return withLock_(function () {
    if (entity === 'Animais') {
      const rec = readAll_('Animais').filter(function (r) { return r.id === id; })[0];
      if (rec && readAll_('Pesagens').some(function (p) { return p.brinco === rec.brinco; })) {
        throw new Error('Este animal possui pesagens. Exclua as pesagens antes, ou altere o status.');
      }
    }
    const sheet = getSheet_(entity);
    const rowIdx = findRow_(sheet, id);
    if (!rowIdx) throw new Error('Registro não encontrado.');
    sheet.deleteRow(rowIdx);
    return true;
  });
}

/** Dados do dashboard. filtro: {de:'yyyy-mm-dd', ate:'yyyy-mm-dd'} (opcional). */
function api_dashboard(filtro) {
  checkAccess_();
  filtro = filtro || {};
  const animais = readAll_('Animais');
  const pesagens = readAll_('Pesagens');
  const fin = readAll_('Financeiro').filter(function (r) { return inRange_(r.data, filtro); });

  const porStatus = countBy_(animais, 'status');
  const porLote = countBy_(animais.filter(function (a) { return a.status === 'Ativo'; }), 'lote');
  const gmd = gmdPorAnimal_(pesagens, filtro);

  let receita = 0, despesa = 0;
  const meses = {};
  const despCat = {};
  fin.forEach(function (r) {
    const v = Number(r.valor) || 0;
    const m = String(r.data).slice(0, 7);
    meses[m] = meses[m] || { receita: 0, despesa: 0 };
    if (r.tipo === 'Receita') { receita += v; meses[m].receita += v; }
    else { despesa += v; meses[m].despesa += v; despCat[r.categoria] = (despCat[r.categoria] || 0) + v; }
  });

  const gmdVals = gmd.map(function (g) { return g.gmd; });
  const pesoAtual = ultimoPesoPorAnimal_(pesagens);
  const ativos = animais.filter(function (a) { return a.status === 'Ativo'; });
  const pesosAtivos = ativos.map(function (a) { return pesoAtual[a.brinco]; }).filter(function (p) { return p > 0; });

  return {
    kpis: {
      totalAnimais: animais.length,
      ativos: ativos.length,
      pesoMedio: avg_(pesosAtivos),
      gmdMedio: avg_(gmdVals),
      receita: receita, despesa: despesa, saldo: receita - despesa
    },
    porStatus: porStatus,
    porLote: porLote,
    fluxoMensal: Object.keys(meses).sort().map(function (m) {
      return { mes: m, receita: meses[m].receita, despesa: meses[m].despesa };
    }),
    despesaPorCategoria: despCat
  };
}

/** Relatórios. tipo: 'animais' | 'gmd' | 'financeiro'. Retorna {titulo, colunas, linhas, totais}. */
function api_report(tipo, filtro) {
  checkAccess_();
  filtro = filtro || {};
  if (tipo === 'animais') {
    let rows = readAll_('Animais');
    if (filtro.status) rows = rows.filter(function (r) { return r.status === filtro.status; });
    const peso = ultimoPesoPorAnimal_(readAll_('Pesagens'));
    return {
      titulo: 'Relatório de animais',
      colunas: ['Brinco', 'Nome', 'Raça', 'Sexo', 'Nascimento', 'Lote', 'Status', 'Último peso (kg)'],
      linhas: rows.map(function (r) {
        return [r.brinco, r.nome, r.raca, r.sexo, r.nascimento, r.lote, r.status, peso[r.brinco] || ''];
      }),
      totais: 'Total: ' + rows.length + ' animais'
    };
  }
  if (tipo === 'gmd') {
    const g = gmdPorAnimal_(readAll_('Pesagens'), filtro);
    return {
      titulo: 'Ganho médio diário (GMD)',
      colunas: ['Brinco', 'Peso inicial (kg)', 'Peso final (kg)', 'Dias', 'GMD (kg/dia)'],
      linhas: g.map(function (x) { return [x.brinco, x.pesoIni, x.pesoFim, x.dias, round_(x.gmd, 3)]; }),
      totais: 'GMD médio: ' + round_(avg_(g.map(function (x) { return x.gmd; })), 3) + ' kg/dia'
    };
  }
  if (tipo === 'financeiro') {
    let rows = readAll_('Financeiro').filter(function (r) { return inRange_(r.data, filtro); });
    if (filtro.tipo) rows = rows.filter(function (r) { return r.tipo === filtro.tipo; });
    rows.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
    let rec = 0, desp = 0;
    rows.forEach(function (r) { if (r.tipo === 'Receita') rec += Number(r.valor); else desp += Number(r.valor); });
    return {
      titulo: 'Relatório financeiro',
      colunas: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor (R$)'],
      linhas: rows.map(function (r) { return [r.data, r.tipo, r.categoria, r.descricao, Number(r.valor)]; }),
      totais: 'Receitas: R$ ' + rec.toFixed(2) + ' | Despesas: R$ ' + desp.toFixed(2) + ' | Saldo: R$ ' + (rec - desp).toFixed(2)
    };
  }
  throw new Error('Tipo de relatório inválido.');
}

/* ---------- Regras de negócio ---------- */

function gmdPorAnimal_(pesagens, filtro) {
  const by = {};
  pesagens.filter(function (p) { return inRange_(p.data, filtro); }).forEach(function (p) {
    (by[p.brinco] = by[p.brinco] || []).push({ d: String(p.data), p: Number(p.peso) });
  });
  const out = [];
  Object.keys(by).forEach(function (b) {
    const l = by[b].sort(function (x, y) { return x.d.localeCompare(y.d); });
    if (l.length < 2) return;
    const ini = l[0], fim = l[l.length - 1];
    const dias = Math.round((new Date(fim.d) - new Date(ini.d)) / 86400000);
    if (dias <= 0) return;
    out.push({ brinco: b, pesoIni: ini.p, pesoFim: fim.p, dias: dias, gmd: (fim.p - ini.p) / dias });
  });
  return out.sort(function (a, b) { return b.gmd - a.gmd; });
}

function ultimoPesoPorAnimal_(pesagens) {
  const last = {};
  pesagens.forEach(function (p) {
    if (!last[p.brinco] || String(p.data) >= last[p.brinco].d) last[p.brinco] = { d: String(p.data), p: Number(p.peso) };
  });
  const out = {};
  Object.keys(last).forEach(function (b) { out[b] = last[b].p; });
  return out;
}

/* ---------- Acesso e segurança ---------- */

/**
 * Lista opcional de e-mails autorizados: Configurações do projeto > Propriedades do script >
 * ALLOWED_EMAILS = "a@gmail.com,b@gmail.com". Vazia = qualquer conta Google com acesso ao link.
 * Obs.: em contas Gmail pessoais o Google pode não informar o e-mail do visitante; nesse caso,
 * com a lista preenchida o acesso é negado por segurança.
 */
function checkAccess_() {
  const list = (PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  if (!list.length) return;
  const email = userEmail_().toLowerCase();
  if (!email || list.indexOf(email) === -1) throw new Error('Acesso não autorizado.');
}

function userEmail_() {
  return Session.getActiveUser().getEmail() || '';
}

/* ---------- Camada de dados (Sheets) ---------- */

function headers_(def) {
  return ['id'].concat(def.fields.map(function (f) { return f.key; }), ['criado_em', 'usuario']);
}

function schema_(entity) {
  if (!SCHEMA.hasOwnProperty(entity)) throw new Error('Tabela inválida.');
  return SCHEMA[entity];
}

function spreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // Projeto vinculado a uma planilha? Usa essa. Senão cria uma nova.
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create('GDV - Banco de dados');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function getSheet_(entity) {
  const def = schema_(entity);
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(entity);
  if (!sheet) {
    sheet = ss.insertSheet(entity);
    const h = headers_(def);
    sheet.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8f0e4');
    sheet.setFrozenRows(1);
    // Datas e IDs como texto puro, para evitar conversões automáticas do Sheets.
    h.forEach(function (name, i) {
      const f = def.fields.filter(function (x) { return x.key === name; })[0];
      if (name === 'id' || name === 'criado_em' || (f && (f.type === 'date' || f.type === 'text'))) {
        sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
  }
  return sheet;
}

function readAll_(entity) {
  const def = schema_(entity);
  const sheet = getSheet_(entity);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const h = headers_(def);
  return sheet.getRange(2, 1, last - 1, h.length).getValues().map(function (row) {
    const o = {};
    h.forEach(function (k, i) {
      let v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      o[k] = v;
    });
    return o;
  }).filter(function (o) { return o.id; });
}

function findRow_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function validate_(def, rec, entity) {
  const out = {};
  def.fields.forEach(function (f) {
    let v = rec[f.key];
    if (v === undefined || v === null) v = '';
    if (typeof v === 'string') v = v.trim();
    if (f.required && v === '') throw new Error('Preencha o campo: ' + f.label);
    if (v !== '') {
      if (f.type === 'number') {
        v = Number(String(v).replace(',', '.'));
        if (isNaN(v)) throw new Error('Valor numérico inválido: ' + f.label);
        if (f.min !== undefined && v < f.min) throw new Error(f.label + ' deve ser ≥ ' + f.min);
      }
      if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data inválida: ' + f.label);
      if (f.type === 'select' && f.options && f.options.indexOf(v) === -1) throw new Error('Opção inválida: ' + f.label);
      if (f.type === 'select' && f.ref) {
        const p = f.ref.split('.');
        if (!readAll_(p[0]).some(function (r) { return r[p[1]] === v; })) throw new Error('Registro de referência não existe: ' + f.label);
      }
    }
    if (f.unique && v !== '') {
      const dup = readAll_(entity).some(function (r) { return String(r[f.key]) === String(v) && r.id !== rec.id; });
      if (dup) throw new Error(f.label + ' já cadastrado: ' + v);
    }
    out[f.key] = v;
  });
  return out;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Utilitários ---------- */

function inRange_(d, f) {
  d = String(d || '');
  if (f.de && d < f.de) return false;
  if (f.ate && d > f.ate) return false;
  return true;
}
function countBy_(rows, key) {
  const o = {};
  rows.forEach(function (r) { const k = r[key] || '(sem informação)'; o[k] = (o[k] || 0) + 1; });
  return o;
}
function avg_(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
function round_(n, d) { const m = Math.pow(10, d); return Math.round(n * m) / m; }
