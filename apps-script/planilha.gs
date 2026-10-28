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
  return abaDe_(planilha_(), nome);
}

/** Aba "nome" na planilha ss (a principal ou um arquivo anual), criada com o cabeçalho de TABELAS se não existir. */
function abaDe_(ss, nome) {
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

/** Planilhas criadas por versões anteriores ganham as colunas novas (no fim), sem mexer nos dados.
 *  Coluna acrescentada à mão no lugar de uma coluna nova do sistema (ex.: uma anotação na coluna AD de Levantamentos):
 *  ela é empurrada para a direita com os dados dela, e a coluna do sistema entra no lugar (antes isso travava todos os envios). */
function garantirColunas_(sh, nome) {
  const cols = TABELAS[nome];
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  let atual = sh.getRange(1, 1, 1, cols.length).getValues()[0], copias = false;
  cols.forEach(function (c, i) {
    if (atual[i] === c) return;
    if (atual[i] !== '' && atual[i] !== undefined && atual[i] !== null) {
      // As colunas 1..i já conferem (são acertadas em ordem). Uma coluna do sistema repetida aqui é cópia antiga
      // (sobra de ajuste à mão no cabeçalho): ela anda para a direita como qualquer coluna de fora, sem apagar nada,
      // e o que só existir na cópia é levado para a coluna oficial.
      if (cols.slice(0, i).indexOf(String(atual[i])) >= 0) copias = true;
      sh.insertColumnBefore(i + 1);                                   // a coluna de fora (e o que vem depois) anda uma posição
      atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    }
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#dbe6f7');
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  if (copias) {                                                     // cópias antigas (agora à direita): o que só existe nelas vai para a coluna oficial
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    for (let j = cols.length; j < cab.length; j++) { const k = cols.indexOf(String(cab[j])); if (k >= 0) aproveitarCopia_(sh, k + 1, j + 1); }
  }
}

/** Cópia antiga de uma coluna do sistema (coluna `colCopia`): preenche as células vazias da coluna oficial (`colOficial`) com o valor da cópia. */
function aproveitarCopia_(sh, colOficial, colCopia) {
  const n = sh.getLastRow() - 1; if (n < 1) return;
  const of = sh.getRange(2, colOficial, n, 1).getValues(), cp = sh.getRange(2, colCopia, n, 1).getValues();
  let mudou = false;
  for (let r = 0; r < n; r++) {
    const vazio = of[r][0] === '' || of[r][0] === null || of[r][0] === undefined;
    if (vazio && cp[r][0] !== '' && cp[r][0] !== null && cp[r][0] !== undefined) { of[r][0] = cp[r][0]; mudou = true; }
  }
  if (mudou) sh.getRange(2, colOficial, n, 1).setValues(of);
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
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : semApostrofo_(String(v === null || v === undefined ? '' : v));
  });
  return o;
}

/**
 * Texto que vai para a planilha nunca vira fórmula (injeção de fórmula: =IMPORTXML(...) mandaria os dados para fora ao abrir a planilha):
 * começando com = + - @ ganha o apóstrofo do Sheets na frente. Número com sinal ("-3.1" de latitude, "+5592...") fica como está.
 * A leitura (paraObjeto_) tira o apóstrofo: o app e o painel recebem o texto como foi digitado.
 */
function textoPlanilha_(v) {
  if (typeof v !== 'string' || !/^[=+\-@]/.test(v)) return v;
  if (/^[+\-]/.test(v) && v.length > 1 && isFinite(Number(v))) return v;
  return "'" + v;
}
function semApostrofo_(v) { return /^'[=+\-@]/.test(v) ? v.slice(1) : v; }

/** Abas em que o registro tem dono: quem não gravou não altera (IDOR). Pessoas, Placas, Propriedades e CadastrosPCE são cadastros comuns. */
const ABAS_COM_DONO_ = ['TFs', 'Veiculos', 'Levantamentos', 'Colheitas', 'TermosPCE'];
const MSG_REGISTRO_ALHEIO_ = 'Este registro foi gravado por outro servidor e não pode ser alterado por você.';
/** Mesmo autor? (nome do login; sem diferença de maiúscula/espaço). Linha sem autor (antiga) não tem dono. */
function mesmoDono_(dono, usuario) { return !dono || nomeChave_(dono) === nomeChave_(usuario); }

/**
 * Veículos: em que turnos este login pode lançar. Turno de outro login só para quem entrou nele pelo código (pareamento, mesmo que já
 * tenha saído: o que lançou enquanto estava continua chegando). Turno que a planilha não tem (ainda não chegou ou arquivado) não é conferido.
 */
function podeLancarNoTurno_(usuario) {
  const dono = {}, colega = {};
  lerLeitura_('Turnos').forEach(function (t) { if (t.id) dono[t.id] = t.usuario; });
  lerLeitura_('Pareamentos').forEach(function (p) { if (p.id && p.colega && p.entrouEm && nomeChave_(p.colega) === nomeChave_(usuario)) colega[p.turnoId] = true; });
  return function (turnoId) { return !(turnoId in dono) || mesmoDono_(dono[turnoId], usuario) || !!colega[turnoId]; };
}

const CAMPOS_ENCERRAMENTO_ = ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim', 'encerradoPor', 'encerradoEm'];
/**
 * Grava os registros do app (a última edição vence). Devolve os ids NÃO gravados porque o registro é de outro login (ABAS_COM_DONO_;
 * veículo em turno alheio sem pareamento): o sync os devolve em "recusados" e o app os mantém pendentes.
 */
function gravar_(nome, recebidos, ts, usuario) {
  const recusados = [];
  if (!recebidos.length) return recusados;
  const t = lerTudo_(nome), cols = t.cols, idx = {};
  const comDono = ABAS_COM_DONO_.indexOf(nome) >= 0, podeTurno = nome === 'Veiculos' ? podeLancarNoTurno_(usuario) : null;
  t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });

  const porId = {}, brutos = {};             // dedup no lote: vale o mais recente
  recebidos.forEach(function (r) {
    const o = limpar_(cols, r);
    if (!o) return;
    // documento padrão/inválido (000.000.000-00…) não identifica ninguém: não vira cadastro nem liga uma placa a um nome
    if (nome === 'Pessoas' && !docValido_(o.id)) return;
    if (nome === 'Placas' && !docValido_(o.doc)) return;
    if (!porId[o.id] || o.atualizadoEm >= porId[o.id].atualizadoEm) { porId[o.id] = o; brutos[o.id] = r; }
  });

  const novas = [];
  Object.keys(porId).forEach(function (id) {
    const o = porId[id], r = brutos[id];
    o.srv_ts = ts;
    o.usuario = usuario;                       // quem sincronizou (definido pelo servidor, não pelo app)
    // turno novo: quem entrou pelo código (colegas) e o encerramento fora do aparelho só o servidor grava
    if (nome === 'Turnos' && idx[id] === undefined) { o.colegas = ''; o.encerradoPor = ''; o.encerradoEm = 0; }
    const linha = cols.map(function (c) { return o[c]; });
    const atual = idx[id] === undefined ? null : paraObjeto_(cols, t.valores[idx[id]]);
    if (podeTurno) {   // veículo: o próprio (sem mudar de turno) ou num turno em que pode lançar
      const ok = atual && mesmoDono_(atual.usuario, usuario) && (!('turnoId' in r) || o.turnoId === atual.turnoId)
        || (!atual || podeTurno(atual.turnoId)) && podeTurno('turnoId' in r || !atual ? o.turnoId : atual.turnoId);
      if (!ok) { recusados.push(id); return; }
    } else if (comDono && atual && !mesmoDono_(atual.usuario, usuario)) { recusados.push(id); return; }
    if (!atual) {
      novas.push(linha);
    } else {
      // turno de outro login (turno compartilhado: o colega tem o turno do dono no aparelho): só o dono grava o turno
      if (nome === 'Turnos' && atual.usuario && atual.usuario !== usuario) return;
      if (o.atualizadoEm >= atual.atualizadoEm) {   // última edição vence
        // campo que o app NÃO enviou (ex.: TF não conhece o e-mail da pessoa, versão antiga do app) mantém o valor da planilha
        cols.forEach(function (c, i) { if (c !== 'srv_ts' && c !== 'usuario' && !(c in r)) linha[i] = t.valores[idx[id]][i]; });
        if (nome === 'Turnos') { const ic = cols.indexOf('colegas'); linha[ic] = t.valores[idx[id]][ic]; }   // colegas: só o pareamento grava
        // turno já encerrado na planilha não reabre: um envio do aparelho com encerrado = 0 (edição local feita antes de saber do
        // encerramento) mantém o encerramento; encerrado pela gerência, o horário final e quem encerrou também não mudam
        if (nome === 'Turnos' && atual.encerrado === 1 && (o.encerrado !== 1 || atual.encerradoPor)) {
          CAMPOS_ENCERRAMENTO_.forEach(function (c) { const i = cols.indexOf(c); if (i >= 0) linha[i] = t.valores[idx[id]][i]; });
        }
        // Termo de Colheita: o resultado laboratorial lançado no painel (ou noutro aparelho) não é apagado por um reenvio do termo
        // com resultado mais velho (ou sem resultado): vale o de atualizadoEm maior
        if (nome === 'Colheitas') { const il = cols.indexOf('laboratorio'); linha[il] = labMaisNovo_(t.valores[idx[id]][il], linha[il]); }
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([linha]);
      } else if (nome === 'Turnos' && o.encerrado === 1 && atual.encerrado !== 1) {
        // encerramento com atualizadoEm mais velho que a planilha (relógio do aparelho corrigido para trás depois de abrir o turno):
        // o turno não pode ficar aberto para sempre; grava só o encerramento e devolve ao aparelho (srv_ts)
        const l2 = t.valores[idx[id]].slice();
        ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim'].forEach(function (c) { const i = cols.indexOf(c); if (i >= 0 && (c in r)) l2[i] = o[c]; });
        l2[cols.indexOf('srv_ts')] = ts;
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([l2]);
      } else if (nome === 'Colheitas' && ('laboratorio' in r)) {
        // termo mais velho que o da planilha, mas com resultado laboratorial mais novo: grava só o resultado
        const il = cols.indexOf('laboratorio'), atualLab = t.valores[idx[id]][il], novo = labMaisNovo_(atualLab, o.laboratorio);
        if (novo !== String(atualLab || '')) {
          const l3 = t.valores[idx[id]].slice(); l3[il] = novo; l3[cols.indexOf('srv_ts')] = ts;
          t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([l3]);
        }
      }
    }
  });
  if (novas.length) {
    t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
  }
  return recusados;
}

function lerMudancas_(nome, since, usuario) {
  const t = lerTudo_(nome), i = t.cols.indexOf('srv_ts');
  return t.valores.filter(function (l) { return Number(l[i]) > since; })
                  .map(function (l) { return paraObjeto_(t.cols, l); })
                  .filter(function (o) { return o.usuario === usuario; });   // cada usuário recebe só os próprios registros
}

function limpar_(cols, r) {
  if (!r || typeof r !== 'object' || !r.id || typeof r.id === 'object' || String(r.id).length > 64 || /^['=+\-@]/.test(String(r.id))) return null;
  const o = {};
  cols.forEach(function (c) {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : textoPlanilha_(String(v).slice(0, LIMITES_TEXTO[c] || 500));
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
