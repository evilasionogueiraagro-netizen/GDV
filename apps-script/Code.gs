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
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil'],   // perfil: vazio = fiscal, 'admin' = administrador
  // Termos de Fiscalização de Barreira (TF)
  TFs: ['id', 'barreira', 'ano', 'numero', 'numeroTxt', 'turnoId', 'veiculoId', 'data', 'hora', 'fiscal', 'local', 'placa', 'origem', 'destino',
        'doc', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'relacao', 'inspecao', 'coleta', 'amostras',
        'procedimento', 'fiel', 'auto', 'advertencia', 'documentos', 'produtos', 'constatacao', 'enquadramento',
        'reincidente', 'tfsAnteriores', 'cancelado', 'motivoCancel', 'conflito', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Pessoas: ['id', 'tipo', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],   // id = CPF/CNPJ (só dígitos)
  Placas: ['id', 'doc', 'nome', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],                                                    // id = placa
  Barreiras: ['id', 'nome', 'sufixo', 'local', 'ativo'],                                                                            // cadastro feito direto na planilha
  Sequencias: ['id', 'barreira', 'ano', 'ultimo', 'atualizadoEm'],                                                                   // id = barreira|ano
  Reservas: ['em', 'usuario', 'barreira', 'ano', 'de', 'ate'],
  Consultas: ['em', 'usuario', 'doc', 'placa', 'resultado']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito'];
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300 };   // demais colunas: 500
const RESERVA_MAX = 5;                                 // números que um aparelho pode reservar por vez
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_LINHAS_POR_ENVIO = 2000;

function doGet(e) {
  if (e && e.parameter && e.parameter.p === 'painel') return painelHtml_();
  return json_({ ok: true, servico: 'GDV Controle de Veículos' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'ativar') return json_(ativar_(req));
    const usuario = autenticar_(req.key);
    if (req.action === 'ping') return json_({ ok: true, nome: usuario });
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    if (req.action === 'tfConsultar') return json_(consultar_(req, usuario));
    throw new Error('Ação inválida.');
  } catch (err) {
    return json_({ ok: false, erro: String(err.message || err) });
  }
}

function sincronizar_(req, usuario) {
  const turnos = lista_(req.turnos);
  const veiculos = lista_(req.veiculos);
  const tfs = lista_(req.tfs);
  const pessoas = lista_(req.pessoas);
  const placas = lista_(req.placas);
  const since = Number(req.since) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const agora = Date.now();
    gravar_('Turnos', turnos, agora, usuario);
    gravar_('Veiculos', veiculos, agora, usuario);
    gravar_('TFs', tfs, agora, usuario);
    if (tfs.length) marcarConflitosTFs_(tfs, agora);
    gravar_('Pessoas', pessoas, agora, usuario);
    gravar_('Placas', placas, agora, usuario);
    const reserva = req.reservar ? reservarNumeros_(req.reservar, usuario, agora) : null;
    return {
      ok: true,
      agora: agora,
      turnos: lerMudancas_('Turnos', since),
      veiculos: lerMudancas_('Veiculos', since),
      tfs: lerMudancas_('TFs', since, usuario),          // cada fiscal recebe só os próprios TFs
      barreiras: listarBarreiras_(),
      reserva: reserva
    };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Termos de Fiscalização (TF): numeração, conflitos e reincidência ---------- */

function digitos_(v) { return String(v || '').replace(/\D/g, ''); }
function placaNorm_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function listarBarreiras_() {
  const sh = aba_('Barreiras');
  if (sh.getLastRow() < 2) sh.getRange(2, 1, 1, 5).setValues([['BVA-CEASA', 'Barreira Porto da CEASA', 'BVA - CEASA', 'BR-319 PORTO DA CEASA', 1]]);
  return lerLeitura_('Barreiras').filter(function (b) { return b.id && b.ativo === 1; })
    .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local }; });
}

/** Reserva uma faixa de números da sequência única da barreira (sob o lock do sincronizar_). */
function reservarNumeros_(pedido, usuario, agora) {
  const barreira = String(pedido.barreira || '').slice(0, 64);
  const ano = Number(pedido.ano) || new Date().getFullYear();
  const qtd = Math.max(1, Math.min(RESERVA_MAX, Number(pedido.quantidade) || 1));
  if (!barreira) throw new Error('Informe a barreira.');
  if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
  const t = lerTudo_('Sequencias'), id = barreira + '|' + ano;
  let idx = -1, ultimo = 0;
  t.valores.forEach(function (l, i) { if (String(l[0]) === id) { idx = i; ultimo = Number(l[3]) || 0; } });
  if (idx < 0) {                                       // 1ª vez: continua do maior número já gravado
    lerLeitura_('TFs').forEach(function (r) { if (r.barreira === barreira && r.ano === ano && r.numero > ultimo) ultimo = r.numero; });
  }
  const novo = ultimo + qtd, numeros = [];
  for (let n = ultimo + 1; n <= novo; n++) numeros.push(n);
  const linha = [[id, barreira, ano, novo, agora]];
  if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, 5).setValues(linha); else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, 5).setValues(linha);
  const r = aba_('Reservas');
  r.getRange(r.getLastRow() + 1, 1, 1, 6).setValues([[agora, usuario, barreira, ano, ultimo + 1, novo]]);
  return { barreira: barreira, ano: ano, numeros: numeros, ultimo: novo };
}

/** Número duplicado (mesma barreira/ano): o TF mais antigo vale; os demais ficam com conflito = 1. */
function marcarConflitosTFs_(recebidos, agora) {
  const ids = {};
  recebidos.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
  const t = lerTudo_('TFs'), iC = t.cols.indexOf('conflito') + 1, iS = t.cols.indexOf('srv_ts') + 1, grupos = {};
  t.valores.forEach(function (l, i) {
    const o = paraObjeto_(t.cols, l);
    (grupos[o.barreira + '|' + o.ano + '|' + o.numero] = grupos[o.barreira + '|' + o.ano + '|' + o.numero] || []).push({ i: i, o: o });
  });
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k];
    if (!g.some(function (x) { return ids[x.o.id]; })) return;
    g.sort(function (a, b) { return a.o.criadoEm - b.o.criadoEm || String(a.o.id).localeCompare(String(b.o.id)); });
    g.forEach(function (x, n) {
      const quer = g.length > 1 && n > 0 ? 1 : 0;
      if (x.o.conflito !== quer) { t.sh.getRange(x.i + 2, iC).setValue(quer); t.sh.getRange(x.i + 2, iS).setValue(agora); }
    });
  });
}

/** Define o último número usado de uma sequência (ex.: ao começar a usar o sistema no meio do ano). */
function definirSequencia_(barreira, ano, ultimo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
    const t = lerTudo_('Sequencias'), id = barreira + '|' + ano;
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    const linha = [[id, barreira, Number(ano), Number(ultimo), Date.now()]];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, 5).setValues(linha); else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, 5).setValues(linha);
    return Number(ultimo);
  } finally { lock.releaseLock(); }
}

function resumoTFs_(rows) {
  const r = { total: rows.length, liberacoes: 0, apreensoes: 0, rechacos: 0, autos: 0, advertencias: 0, ultimos: [] };
  rows.forEach(function (x) {
    if (x.procedimento === 'liberacao') r.liberacoes++; else if (x.procedimento === 'apreensao') r.apreensoes++; else if (x.procedimento === 'rechaco') r.rechacos++;
    if (x.auto === 1) r.autos++; if (x.advertencia === 1) r.advertencias++;
  });
  r.ultimos = rows.slice().sort(function (a, b) { return String(b.data + b.hora).localeCompare(String(a.data + a.hora)); }).slice(0, 5)
    .map(function (x) { return { numeroTxt: x.numeroTxt, data: x.data, procedimento: x.procedimento, placa: x.placa, produtos: x.produtos }; });
  r.reincidente = r.apreensoes + r.rechacos + r.autos >= 1;      // houve medida anterior (apreensão, rechaço ou auto de infração)
  return r;
}

/** Cadastro + histórico (reincidência) por CPF/CNPJ e por placa. */
function consultar_(req, usuario) {
  const doc = digitos_(req.doc), placa = placaNorm_(req.placa);
  if (doc.length !== 11 && doc.length !== 14 && placa.length < 7) throw new Error('Informe um CPF/CNPJ completo ou uma placa.');
  const pessoa = doc ? lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0] : null;
  const pl = placa ? lerLeitura_('Placas').filter(function (p) { return p.id === placa; })[0] : null;
  const tfs = lerLeitura_('TFs').filter(function (t) { return t.cancelado !== 1; });
  const porDoc = doc ? resumoTFs_(tfs.filter(function (t) { return digitos_(t.doc) === doc; })) : null;
  const porPlaca = placa ? resumoTFs_(tfs.filter(function (t) { return placaNorm_(t.placa) === placa; })) : null;
  const mask = doc ? doc.slice(0, 3) + '***' + doc.slice(-2) : '';
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, mask, placa, (pessoa || (porDoc && porDoc.total)) ? 'encontrado' : 'novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio, uf: pessoa.uf, telefone: pessoa.telefone } : null,
    placa: pl ? { id: pl.id, doc: pl.doc, nome: pl.nome } : null,
    historicoDoc: porDoc, historicoPlaca: porPlaca
  };
}

/* ---------- Painel do administrador (somente leitura) ---------- */

/**
 * O painel abre na MESMA implantação dos aparelhos:  <URL /exec>?p=painel
 * A página em si não contém dados. Os dados só são entregues a quem tem uma credencial de ADMINISTRADOR,
 * obtida com um código de 6 dígitos (uso único) gerado no menu da planilha: GDV → Gerar código de administrador.
 * Credenciais de fiscais não leem o painel, e códigos de administrador não ativam aparelhos de fiscais.
 */
function painelHtml_() {
  return HtmlService.createHtmlOutputFromFile('Painel')
    .setTitle('GDV – Painel do administrador')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Valida a credencial do painel e devolve o nome do administrador. */
function adminDoToken_(token) {
  token = String(token || '');
  if (token) {
    const t = lerLeitura_('Fiscais');
    for (let i = 0; i < t.length; i++) if (t[i].token === token && t[i].ativo === 1 && t[i].perfil === 'admin') return t[i].nome;
  }
  throw new Error('Sessão do painel inválida ou revogada. Entre com um código de administrador.');
}

/** Chamada pela página do painel: troca o código de administrador por uma credencial. */
function painelAtivar(codigo) {
  return ativar_({ codigo: codigo, perfil: 'admin' });
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
}

/** Dados brutos do período (o painel calcula tudo no navegador). filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'} */
function painelDados(token, filtro) {
  adminDoToken_(token);
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
        if (achada < 0 && f.ativo === 1 && !f.token && f.codigo !== '' && f.codigo.padStart(6, '0') === cod && f.expiraEm > agora &&
            (f.perfil === 'admin') === (req.perfil === 'admin')) achada = i;
      });
    }
    if (achada < 0) {
      let motivo = 'Código incorreto ou já usado. Gere um novo código no menu GDV da planilha.';
      if (cod.length !== 6) motivo = 'O código tem 6 dígitos.';
      else t.valores.forEach(function (l) {                        // explica o motivo quando o código existe, mas não pode ser usado aqui
        const f = paraObjeto_(t.cols, l);
        if (f.token || f.codigo === '' || f.codigo.padStart(6, '0') !== cod) return;
        if (f.ativo !== 1) motivo = 'Este código foi revogado. Gere um novo código.';
        else if ((f.perfil === 'admin') !== (req.perfil === 'admin')) {
          motivo = req.perfil === 'admin'
            ? 'Este é um código de FISCAL. Para o painel, gere o código em GDV → Gerar código de administrador (painel).'
            : 'Este é um código de ADMINISTRADOR (painel). Para o app dos fiscais, gere o código em GDV → Gerar código de ativação.';
        } else if (f.expiraEm <= agora) motivo = 'Código expirado. Gere um novo código.';
      });
      cache.put('falhas_ativacao', String(falhas + 1), 900);
      throw new Error(motivo);
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
function gerarCodigo_(nome, perfil) {
  nome = String(nome || '').trim().replace(/\s+/g, ' ');
  if (perfil !== 'admin' && nome.split(' ').length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  if (!nome) throw new Error('Informe o nome.');
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
      .setValues([[nome, codigo, expiraEm, 1, '', 0, perfil === 'admin' ? 'admin' : '']]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome, perfil: perfil === 'admin' ? 'admin' : 'fiscal' };
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
    .addItem('Gerar código de administrador (painel)', 'menuGerarCodigoAdmin')
    .addItem('Definir último nº de TF usado (barreira)', 'menuDefinirSequencia')
    .addItem('Revogar acesso de um fiscal ou administrador', 'menuRevogar')
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

function menuGerarCodigoAdmin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Código de administrador (painel)', 'Nome do administrador:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText(), 'admin');
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código de administrador para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nAbra o painel (URL do app + ?p=painel) e digite o código. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuDefinirSequencia() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de TF JÁ usado nessa barreira/ano (o próximo será este + 1). Use 0 para começar do 0001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try { const n = definirSequencia_(b.getResponseText().trim(), Number(a.getResponseText()), Number(u.getResponseText())); ui.alert('Pronto', 'O próximo TF será o nº ' + (n + 1) + '.', ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
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

function lerMudancas_(nome, since, usuario) {
  const t = lerTudo_(nome), i = t.cols.indexOf('srv_ts');
  return t.valores.filter(function (l) { return Number(l[i]) > since; })
                  .map(function (l) { return paraObjeto_(t.cols, l); })
                  .filter(function (o) { return !usuario || usuario === 'Administrador' || o.usuario === usuario; });
}

function limpar_(cols, r) {
  if (!r || !r.id || String(r.id).length > 64) return null;
  const o = {};
  cols.forEach(function (c) {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v).slice(0, LIMITES_TEXTO[c] || 500);
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
