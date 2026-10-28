/* ---------- PCE: Termo de Colheita de Amostras (numeração), consulta e arquivos ---------- */

/** Unidade da numeração do Termo de Colheita: sem espaços sobrando e em MAIÚSCULAS (ex.: "MANAUS"). */
function unidadePce_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 64); }

/** "NNN/AAAA/UNIDADE" (3 dígitos). */
function numeroTxtPce_(numero, ano, unidade) { return String(numero).padStart(3, '0') + '/' + ano + '/' + unidade; }

/** Último nº usado por "UNIDADE|ano" (todas as unidades/anos já vistos): base para propor número sem internet. */
function ultimosPce_() {
  const regs = lerLeitura_('Colheitas'), o = {};
  regs.forEach(function (r) {
    if (!r.unidade || !r.ano) return;
    const k = r.unidade + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.numero);
  });
  lerLeitura_('Numeracao').forEach(function (r) {
    if (String(r.id).indexOf(SEQUENCIAS.PCE.prefixo) !== 0 || !r.barreira || !r.ano) return;
    const k = r.barreira + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.ultimo);
  });
  return o;
}

/** "Qual é o próximo número?" – consulta rápida antes de gerar o termo (não reserva nada). */
function pceProximoNumero_(req) {
  const unidade = unidadePce_(req.unidade), ano = Number(req.ano) || new Date().getFullYear();
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_('PCE', unidade, ano);
  return { ok: true, unidade: unidade, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoTermo: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/** Emissão do Termo de Colheita: grava só se o número ainda estiver livre (sob lock), como no TF. */
function pceEmitir_(req, usuario) {
  const c = req.colheita || {};
  if (Number(c.registroAntigo) === 1) exigirAntigo_(usuario);                  // termo digitado do papel: só com a permissão "Digitar do papel"
  c.unidade = unidadePce_(c.unidade);
  const unidade = c.unidade, ano = Number(c.ano) || 0, numero = Number(c.numero) || 0;
  if (!c.id || !unidade || !ano || numero < 1) throw new Error('Dados do Termo de Colheita incompletos.');
  if (!c.numeroTxt) c.numeroTxt = numeroTxtPce_(numero, ano, unidade);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('Colheitas');
    const ocupante = todos.filter(function (r) { return r.unidade === unidade && r.ano === ano && r.numero === numero && r.id !== c.id; })[0];
    if (ocupante) {
      const u = ultimoSeq_('PCE', unidade, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (r) { return r.id === c.id; })[0];
    if (antes && !mesmoDono_(antes.usuario, usuario)) throw new Error(MSG_REGISTRO_ALHEIO_);   // mesmo id de termo de outro login (IDOR)
    c.emitidoEm = (antes && antes.emitidoEm) || agora;                            // reenvio do mesmo termo não muda a data de emissão
    gravar_('Colheitas', [c], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.propriedade) gravar_('Propriedades', [req.propriedade], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: c.numeroTxt, emitidoEm: c.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- PCE: Cadastro de imóvel (por programa; hoje "moniliase") e Termo de Fiscalização do PCE ----------
 * Numeração como no Termo de Colheita: online o app pergunta o próximo (pceDocNumero) e grava com pceDocRegistrar (só se o número estiver
 * livre, sob lock); sem internet o número é provisório e sobe no sync (número repetido = conflito = 1, como no TF). Registro digitado do
 * papel (registroAntigo = 1, só com a permissão "Digitar do papel"): o número é o do papel (numeroOrigem "papel"); a planilha aceita
 * qualquer número livre e recusa número já usado; o próximo sugerido continua sendo "maior número usado + 1" (padrão do Termo de Colheita). */
const PROGRAMAS_PCE = ['moniliase', 'banana', 'citros', 'mandioca', 'soja', 'propriedade'];
const DOCS_PCE = {
  termo: { aba: 'TermosPCE', seq: 'TPCE', nome: 'Termo de Fiscalização' },
  cadastro: { aba: 'CadastrosPCE', seq: 'CPCE', nome: 'Cadastro de imóvel' }
};
function programaPce_(v) { const s = normPub_(v).replace(/ /g, ''); return PROGRAMAS_PCE.indexOf(s) >= 0 ? s : 'moniliase'; }
function tipoDocPce_(v) { if (v !== 'termo' && v !== 'cadastro') throw new Error('Tipo de documento do PCE inválido.'); return v; }
/** Termo "001.2026.AUTAZES"; Cadastro "001-2026-AUTAZES". */
function numeroTxtDocPce_(tipo, numero, ano, unidade) {
  const n = String(numero).padStart(3, '0');
  return tipo === 'termo' ? n + '.' + ano + '.' + unidade : n + '-' + ano + '-' + unidade;
}
function grupoDocPce_(tipo, unidade, programa) { return tipo === 'termo' ? unidade : String(programa || 'moniliase').toUpperCase() + '|' + unidade; }
/** Último nº usado por chave (base para o número provisório sem internet): "T|UNIDADE|ano" (termo) e "C|PROGRAMA|UNIDADE|ano" (cadastro). */
function ultimosDocPce_() {
  const o = {}, num = lerLeitura_('Numeracao');
  [['termo', 'T|'], ['cadastro', 'C|']].forEach(function (x) {
    const D = DOCS_PCE[x[0]], seq = SEQUENCIAS[D.seq];
    lerLeitura_(D.aba).forEach(function (r) {
      if (!r.unidade || !r.ano) return;
      const k = x[1] + grupoSeq_(D.seq, r) + '|' + r.ano;
      o[k] = Math.max(o[k] || 0, r.numero);
    });
    num.forEach(function (r) {
      if (String(r.id).indexOf(seq.prefixo) !== 0 || !r.barreira || !r.ano) return;
      const k = x[1] + r.barreira + '|' + r.ano;
      o[k] = Math.max(o[k] || 0, r.ultimo);
    });
  });
  return o;
}
/** "Qual é o próximo número?" do Termo de Fiscalização (unidade/ano) ou do Cadastro (programa/unidade/ano). Não reserva nada. */
function pceDocNumero_(req) {
  const tipo = tipoDocPce_(req.tipo), unidade = unidadePce_(req.unidade), ano = Number(req.ano) || new Date().getFullYear(), programa = programaPce_(req.programa);
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_(DOCS_PCE[tipo].seq, grupoDocPce_(tipo, unidade, programa), ano);
  return { ok: true, tipo: tipo, unidade: unidade, ano: ano, programa: programa, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoReg: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}
/** Prepara o registro recebido do app: unidade em maiúsculas, programa válido e nº em texto no formato do papel. */
function normalizarDocPce_(tipo, r) {
  r.unidade = unidadePce_(r.unidade);
  if (tipo === 'cadastro') r.programa = programaPce_(r.programa);
  else r.programa = r.programa ? programaPce_(r.programa) : '';
  if (Number(r.numero) > 0 && Number(r.ano) > 0) r.numeroTxt = numeroTxtDocPce_(tipo, Number(r.numero), Number(r.ano), r.unidade);
  return r;
}
/** Grava o Termo/Cadastro só se o número ainda estiver livre (sob lock). Também grava o produtor e a propriedade. */
function pceDocRegistrar_(req, usuario) {
  const tipo = tipoDocPce_(req.tipo), D = DOCS_PCE[tipo], r = normalizarDocPce_(tipo, req.registro || {});
  if (Number(r.registroAntigo) === 1) exigirAntigo_(usuario);                     // digitado do papel: só com a permissão "Digitar do papel"
  const unidade = r.unidade, ano = Number(r.ano) || 0, numero = Number(r.numero) || 0, grupo = grupoDocPce_(tipo, unidade, r.programa);
  if (!r.id || !unidade || !ano || numero < 1) throw new Error('Dados do ' + D.nome + ' incompletos.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_(D.aba);
    const ocupante = todos.filter(function (x) { return grupoSeq_(D.seq, x) === grupo && x.ano === ano && x.numero === numero && x.id !== r.id && x.excluido !== 1; })[0];
    if (ocupante) {
      const u = ultimoSeq_(D.seq, grupo, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario, nome: ocupante.nome },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (x) { return x.id === r.id; })[0];
    if (antes && ABAS_COM_DONO_.indexOf(D.aba) >= 0 && !mesmoDono_(antes.usuario, usuario)) throw new Error(MSG_REGISTRO_ALHEIO_);   // IDOR
    r.emitidoEm = (antes && antes.emitidoEm) || agora;
    gravar_(D.aba, [r], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.propriedade) gravar_('Propriedades', [req.propriedade], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: r.numeroTxt, emitidoEm: r.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/** Cadastro do produtor (pessoa + propriedades) e quantos levantamentos/termos já existem para o CPF/CNPJ. */
function pceConsultar_(req, usuario) {
  const doc = digitos_(req.doc);
  if (doc.length !== 11 && doc.length !== 14) throw new Error('Informe um CPF/CNPJ completo.');
  const pessoa = docValido_(doc) ? lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0] : null;   // documento padrão: sem cadastro
  const propriedades = lerLeitura_('Propriedades').filter(function (p) { return digitos_(p.doc) === doc; })
    .map(function (p) { return { id: p.id, codigo: p.codigo, nome: p.nome, doc: p.doc, municipio: p.municipio, situacaoFundiaria: p.situacaoFundiaria, lat: p.lat, lon: p.lon,
                                 cnpj: p.cnpj, empresa: p.empresa, endereco: p.endereco, uf: p.uf, viaAcesso: p.viaAcesso, comercial: p.comercial, tipoPropriedade: p.tipoPropriedade }; });
  const levantamentos = lerLeitura_('Levantamentos').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1; }).length;
  const colheitas = lerLeitura_('Colheitas').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1 && r.cancelado !== 1; }).length;
  const cadastros = lerLeitura_('CadastrosPCE').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1; })
    .map(function (r) { const o = {}; TABELAS.CadastrosPCE.forEach(function (c) { if (c !== 'srv_ts' && c !== 'usuario') o[c] = r[c]; }); o.pendente = 0; return o; });
  const achou = pessoa || propriedades.length || levantamentos || colheitas || cadastros.length;
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, doc.slice(0, 3) + '***' + doc.slice(-2), '', achou ? 'PCE: encontrado' : 'PCE: novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio,
                       uf: pessoa.uf, telefone: pessoa.telefone, email: pessoa.email } : null,
    propriedades: propriedades, levantamentos: levantamentos, colheitas: colheitas, cadastrosPce: cadastros
  };
}

/* ---------- PCE em campo: dados do(s) município(s) para consultar sem internet ---------- */
const CAMPO_MAX_PROPS = 5000;                   // propriedades por chamada (resposta de ~1,5 MB)
// campos que não vão para o aparelho: técnicos da planilha e nomes que o app usa para controle local
const CAMPO_FORA = ['srv_ts', 'usuario', 'pendente', 'campoMun', 'resumoLev', 'baixadoEm', 'excluido', 'cadastrosPce', 'ultimoTermoPce'];

/**
 * Todas as colunas da aba (as do sistema e as acrescentadas à mão, pelo cabeçalho), sem as técnicas: colunas novas da ficha ou do
 * cadastro de propriedade chegam ao aparelho sem mudar o código. Leitura pura (não cria aba nem coluna).
 */
function lerTodasColunas_(nome) {
  const sh = planilha_().getSheetByName(nome), base = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  const nc = Math.max(base.length, Number(sh.getLastColumn ? sh.getLastColumn() : 0) || 0);
  const cab = sh.getRange(1, 1, 1, nc).getValues()[0].map(function (c) { return String(c === null || c === undefined ? '' : c).trim(); });
  return sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues().map(function (l) {
    const o = {};
    cab.forEach(function (c, i) {
      if (!c || CAMPO_FORA.indexOf(c) >= 0 || Object.prototype.hasOwnProperty.call(o, c)) return;
      let v = l[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Manaus', 'yyyy-MM-dd');
      o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null || v === undefined ? '' : v);
    });
    return o;
  });
}

/** Pragas detectadas/suspeitas de um levantamento (campo "pragas" ou, nos registros anteriores, "culturas"). */
function deteccoesLev_(r) {
  const out = {}, p = lerJSONSeguro_(r.pragas, null);
  if (Array.isArray(p) && p.length) {
    p.forEach(function (g) {
      ((g && g.culturas) || []).forEach(function (c) {
        if (c && (c.resultado === 'detectada' || c.resultado === 'suspeita')) {
          const k = String(g.praga || '').trim() || 'Praga não informada';
          if (out[k] !== 'detectada') out[k] = c.resultado;
        }
      });
    });
  } else {
    const cs = lerJSONSeguro_(r.culturas, []);
    (Array.isArray(cs) ? cs : []).forEach(function (c) {
      const k = c && String(c.praga || '').trim();
      if (k && out[k] !== 'detectada') out[k] = c.resultado === 'suspeita' ? 'suspeita' : 'detectada';
    });
  }
  return Object.keys(out).map(function (k) { return { praga: k, resultado: out[k] }; });
}

/**
 * "Baixar dados para o campo": propriedades do(s) município(s) (comparação sem acento/maiúsculas), os produtores donos delas (por doc)
 * e, por propriedade, um resumo do histórico (nº de levantamentos, data do último e pragas detectadas/suspeitas nele). Só módulo PCE.
 * Cada download fica registrado na aba Consultas (quem, quando, municípios e quantas propriedades).
 */
function pceBaixarMunicipio_(req, usuario) {
  const pedidos = Array.isArray(req.municipios) ? req.municipios : [];
  if (!pedidos.length) throw new Error('Escolha pelo menos um município.');
  if (pedidos.length > 62) throw new Error('Município(s) inválido(s).');
  const alvo = {};                                                  // nome normalizado → nome como pedido
  pedidos.forEach(function (m) { const s = String(m || '').trim().slice(0, 80), k = normPub_(s); if (k) alvo[k] = s; });
  if (!Object.keys(alvo).length) throw new Error('Escolha pelo menos um município.');
  const props = lerTodasColunas_('Propriedades').filter(function (p) { return p.id && alvo[normPub_(p.municipio)]; });
  if (props.length > CAMPO_MAX_PROPS) {
    throw new Error('São ' + props.length + ' propriedades nesse(s) município(s); o limite é ' + CAMPO_MAX_PROPS.toLocaleString('pt-BR') +
      ' por vez. Baixe menos municípios de cada vez.');
  }
  const resumoLev = resumidorLevantamentos_();
  const docs = {}, porMun = {};
  props.forEach(function (p) {
    p.resumoLev = resumoLev(p);
    const k = normPub_(p.municipio);
    p.campoMun = alvo[k];
    const d = digitos_(p.doc);
    if (d) (docs[d] = docs[d] || {})[alvo[k]] = 1;
    porMun[alvo[k]] = porMun[alvo[k]] || { props: 0, docs: {} };
    porMun[alvo[k]].props++; if (d) porMun[alvo[k]].docs[d] = 1;
  });
  const pessoas = lerTodasColunas_('Pessoas').filter(function (x) { return x.id && docValido_(x.id) && docs[digitos_(x.id)]; })
    .map(function (x) { x.campoMun = Object.keys(docs[digitos_(x.id)]); return x; });
  // Cadastros de imóvel do PCE dessas propriedades (para o mapa e para preencher o Termo) e o último Termo de Fiscalização de cada uma
  const porProp = {}; props.forEach(function (p) { porProp[p.id] = p; });
  const excluidos = {}; lerLeitura_('CadastrosPCE').forEach(function (c) { if (c.excluido === 1) excluidos[c.id] = 1; });
  const cadastrosPce = lerTodasColunas_('CadastrosPCE').filter(function (c) { return c.id && !excluidos[c.id] && porProp[c.propriedadeId]; })
    .map(function (c) { c.campoMun = porProp[c.propriedadeId].campoMun; return c; });
  cadastrosPce.forEach(function (c) { const p = porProp[c.propriedadeId]; (p.cadastrosPce = p.cadastrosPce || []).push({ id: c.id, programa: c.programa, numeroTxt: c.numeroTxt, data: c.data }); });
  lerLeitura_('TermosPCE').forEach(function (t) {
    const p = porProp[t.propriedadeId];
    if (!p || t.excluido === 1 || t.cancelado === 1) return;
    if (!p.ultimoTermoPce || String(t.data + ' ' + t.hora) > String(p.ultimoTermoPce.data + ' ' + p.ultimoTermoPce.hora)) {
      p.ultimoTermoPce = { id: t.id, numeroTxt: t.numeroTxt, data: t.data, hora: t.hora, plantasInspecionadas: t.plantasInspecionadas, amostra: t.amostra, sintomas: t.sintomas };
    }
  });
  const municipios = Object.keys(alvo).map(function (k) {
    const m = porMun[alvo[k]] || { props: 0, docs: {} };
    return { municipio: alvo[k], nProps: m.props, nPessoas: Object.keys(m.docs).length };
  });
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, '', '',
    ('PCE campo: ' + municipios.map(function (m) { return m.municipio + ' (' + m.nProps + ')'; }).join(', ')).slice(0, 480)]]);
  return { ok: true, agora: Date.now(), municipios: municipios, propriedades: props, pessoas: pessoas, cadastrosPce: cadastrosPce };
}

/**
 * Resumo do histórico de cada propriedade: levantamentos ligados a ela pelo código ou por produtor (doc) + nome da propriedade.
 * Lê a aba Levantamentos uma vez e devolve a função p → {n, ultimo, ultimoHora, pragas}.
 */
function resumidorLevantamentos_() {
  const chaveCod = function (c) { const s = normPub_(c); return s ? 'C:' + s : ''; };
  const chaveNome = function (doc, nome) { const d = digitos_(doc), n = normPub_(nome); return d && n ? 'N:' + d + '|' + n : ''; };
  const levs = {};
  lerLeitura_('Levantamentos').forEach(function (r) {
    if (!r.id || r.excluido === 1) return;
    [chaveCod(r.codigoPropriedade), chaveNome(r.doc, r.propriedade)].forEach(function (k) { if (k) (levs[k] = levs[k] || []).push(r); });
  });
  return function (p) {
    const vistos = {}, lista = [];
    [chaveCod(p.codigo), chaveNome(p.doc, p.nome)].forEach(function (k) {
      (levs[k] || []).forEach(function (r) { if (!vistos[r.id]) { vistos[r.id] = 1; lista.push(r); } });
    });
    lista.sort(function (a, b) { return String(b.data + ' ' + b.hora).localeCompare(String(a.data + ' ' + a.hora)); });
    const ult = lista[0];
    return { n: lista.length, ultimo: ult ? ult.data : '', ultimoHora: ult ? ult.hora : '', pragas: ult ? deteccoesLev_(ult) : [] };
  };
}

/**
 * Mapa "Perto de mim" com internet: todas as propriedades com coordenadas, para os municípios que o servidor ainda não baixou.
 * Só o que o mapa precisa (id, código, nome, município, lat/lon e o resumo do histórico): sem produtor, CPF/CNPJ ou telefone —
 * esses só vêm no download do município. O app não guarda esta resposta. Só módulo PCE; cada consulta fica na aba Consultas.
 */
function pceMapaGeral_(req, usuario) {
  const num = function (v) { const s = String(v == null ? '' : v).trim().replace(',', '.'), n = Number(s); return s !== '' && isFinite(n) ? n : null; };
  const resumoLev = resumidorLevantamentos_(), out = [];
  lerLeitura_('Propriedades').forEach(function (p) {
    if (!p.id) return;
    const lat = num(p.lat), lon = num(p.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return;
    out.push({ id: p.id, codigo: p.codigo, nome: p.nome, municipio: p.municipio, lat: lat, lon: lon, resumoLev: resumoLev(p) });
  });
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, '', '', 'PCE mapa geral: ' + out.length + ' propriedade(s)']]);
  return { ok: true, agora: Date.now(), propriedades: out };
}

const ARQ_MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
const ARQ_MAX_BYTES = 4 * 1024 * 1024;                 // fotos e assinaturas (o app já reduz as fotos)
const ARQ_MAX_BYTES_PDF = 10 * 1024 * 1024;            // PDF escaneado (registro digitado do papel): ≈ 13,4 MB em base64, bem abaixo do limite do POST
const ARQ_RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subpasta com esse nome dentro de "pai" (cria se não existir). */
function subpasta_(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/** Pasta "GDV - Arquivos" (id guardado em PASTA_ARQUIVOS nas propriedades do script; recriada se sumir). */
function pastaArquivos_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_ARQUIVOS');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder('GDV - Arquivos');
  props.setProperty('PASTA_ARQUIVOS', nova.getId());
  return nova;
}

/**
 * Recebe UMA foto/assinatura/PDF (base64 sem o prefixo "data:") e grava no Drive, em GDV - Arquivos/PCE/<ano>/<dono> (levantamentos,
 * colheitas) ou GDV - Arquivos/TF/<ano> (dono "tfs": fotos e assinaturas do TF de Barreira; sem PDF).
 * tipo "documento" = PDF escaneado (application/pdf, até 10 MB, conteúdo começando por "%PDF-"); foto/assinatura = JPEG/PNG até 4 MB.
 * Idempotente pelo id: reenvio do mesmo arquivo devolve o registro já gravado. Os arquivos NÃO são compartilhados.
 */
function arquivoEnviar_(req, usuario) {
  const a = req.arquivo || {};
  const id = String(a.id || ''), dono = String(a.dono || ''), donoId = String(a.donoId || ''), tipo = String(a.tipo || '');
  const papel = String(a.papel || ''), mime = String(a.mime || '');
  // foto do levantamento por praga: "praga – cultura" a que a foto pertence (texto livre, só informativo: aba Arquivos e nome no Drive)
  const rotulo = tipo === 'foto' ? String(a.rotulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!ARQ_RE_UUID.test(id)) throw new Error('Identificador de arquivo inválido.');
  if (['levantamentos', 'colheitas', 'tfs', 'turnos', 'cadastrosPce', 'termosPce'].indexOf(dono) < 0) throw new Error('Arquivo sem registro de origem válido.');
  if (!donoId || donoId.length > 64) throw new Error('Arquivo sem registro de origem válido.');
  if (tipo !== 'foto' && tipo !== 'assinatura' && tipo !== 'documento') throw new Error('Tipo de arquivo inválido.');
  if (['', 'servidor', 'produtor', 'testemunha1', 'testemunha2', 'fiscalizado'].indexOf(papel) < 0) throw new Error('Papel da assinatura inválido.');
  if (!ARQ_MIMES[mime]) throw new Error('Formato não aceito (somente JPEG, PNG ou PDF).');
  const pdf = mime === 'application/pdf';
  if (pdf !== (tipo === 'documento')) throw new Error(pdf ? 'PDF só pode ser enviado como documento.' : 'Documento só pode ser PDF.');
  if (pdf && papel) throw new Error('Papel inválido para documento.');
  if (tipo === 'documento') exigirAntigo_(usuario);                                // PDF escaneado: só para registro antigo (Digitar do papel)
  const max = pdf ? ARQ_MAX_BYTES_PDF : ARQ_MAX_BYTES, maxTxt = pdf ? '10 MB' : '4 MB';

  const existente = function () { return lerLeitura_('Arquivos').filter(function (r) { return r.id === id; })[0]; };
  const resposta = function (r) { return { ok: true, id: r.id, url: r.url, driveId: r.driveId, existente: true }; };
  const ja = existente();
  if (ja) return resposta(ja);

  const b64 = String(req.base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!b64 || b64.length > Math.ceil(max / 3) * 4 + 4) throw new Error('Arquivo vazio ou maior que ' + maxTxt + '.');
  let bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Arquivo corrompido (base64 inválido).'); }
  if (!bytes.length || bytes.length > max) throw new Error('Arquivo vazio ou maior que ' + maxTxt + '.');
  const b = function (i) { return bytes[i] & 0xff; };
  const jpeg = b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  const png = b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  const ehPdf = bytes.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d;   // "%PDF-"
  if ((mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png) || (pdf && !ehPdf)) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');

  const ano = String(new Date().getFullYear());
  const lock = LockService.getScriptLock();
  let pasta, n;
  lock.waitLock(30000);
  try {                                                                     // pastas e numeração do nome sob lock (sem duplicar pastas)
    pasta = dono === 'tfs' ? subpasta_(subpasta_(pastaArquivos_(), 'TF'), ano)          // TF: GDV - Arquivos/TF/<ano>
      : dono === 'turnos' ? subpasta_(subpasta_(pastaArquivos_(), 'Turnos'), ano)        // Termo do turno do papel: GDV - Arquivos/Turnos/<ano>
      : subpasta_(subpasta_(subpasta_(pastaArquivos_(), 'PCE'), ano), dono);
    n = lerLeitura_('Arquivos').filter(function (r) { return r.dono === dono && r.donoId === donoId && r.tipo === tipo; }).length + 1;
  } finally { lock.releaseLock(); }

  const seguro = function (v) { return String(v).replace(/[^A-Za-z0-9_-]/g, '-'); };
  const rotSeguro = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const nome = seguro(donoId) + '_' + tipo + '_' + (papel || n) + (rotSeguro ? '_' + rotSeguro : '') + '_' + id + '.' + ARQ_MIMES[mime];
  const arq = pasta.createFile(Utilities.newBlob(bytes, mime, nome));      // privado: herda o acesso da pasta (somente o dono da planilha)

  let gravado = false;
  try {
    lock.waitLock(30000);
    try {
      const outro = existente();                                            // envio duplicado simultâneo: fica o primeiro
      if (outro) return resposta(outro);
      const sh = aba_('Arquivos'), cols = TABELAS.Arquivos;
      const reg = { id: id, dono: dono, donoId: donoId, tipo: tipo, papel: papel, nome: nome, mime: mime, tamanho: bytes.length,
                    driveId: arq.getId(), url: arq.getUrl(), usuario: usuario, criadoEm: Date.now(), rotulo: rotulo };
      sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return reg[c]; })]);
      gravado = true;
      return { ok: true, id: id, url: reg.url, driveId: reg.driveId, existente: false };
    } finally { lock.releaseLock(); }
  } finally {
    // sem linha em Arquivos (duplicado, trava ocupada, erro ao gravar): o arquivo vai para a lixeira, sem deixar cópia órfã no Drive
    if (!gravado) { try { arq.setTrashed(true); } catch (e) { /* segue com o erro original */ } }
  }
}

/* ---------- PCE: levantamento por praga/doença ----------
 * Coluna "pragas" (JSON [{praga, culturas:[{cultura, area, espLinha, espPlanta, espUnidade (m | cm; vazio = registro anterior), resultado, coleta, tipoMaterial, codigoAmostra, destinoAmostra, fotos}]}]),
 * resultado = detectada | nao_detectada | suspeita. Registro anterior (sem "pragas"): cada cultura da coluna "culturas" vira um item da praga
 * dela (resultado "detectada") ou da praga '' = "Sem praga informada" (resultado "nao_detectada"). Detectada e suspeita contam como detecção. */
const RESULTADOS_PCE = ['detectada', 'nao_detectada', 'suspeita'];
/* Formulário de cítricos no levantamento (coluna "citros"): códigos das opções iguais aos de CONFIG.PCE.citros (web/js/config.js). */
const CITROS_ = {
  naoComercial: ['sitio', 'residencia', 'vegetacao', 'publica', 'outros'],
  atividades: ['viveiro_mudas', 'viveiro_semorigem', 'viveiro_portaenxerto', 'viveiro_clonal', 'frutos', 'outros'],
  situacoes: ['proprietario', 'arrendatario', 'cooperativa', 'outras'],
  formasEntrega: ['saco', 'caixa', 'granel'], compradores: ['atravessador', 'supermercado', 'feira', 'cooperativa', 'outros'],
  materiais: ['muda', 'borbulha', 'cavalinho', 'semente'], delimitacao: ['pintapreta'], deteccao: ['cancro', 'hlb', 'acaro'],
  maxCulturas: 20, maxTexto: 200
};
/**
 * Dados de citros recebidos do app → texto JSON gravado (ou '' se nada preenchido / inválido). Só as chaves conhecidas; opções fora da
 * lista viram ''; textos com até 200 caracteres (sem quebra de linha nem "=+-@" no início); números ≥ 0 (negativo ou inválido = vazio;
 * idade e plantas inteiros); no máximo 20 linhas na cultura do citros (as demais são descartadas). cnpj/endereco/uf (app da versão anterior,
 * hoje colunas do levantamento) só se vierem preenchidos: CNPJ só com 14 dígitos; UF com 2 letras. deteccao.tem: sim = presença, nao = ausência.
 */
function citrosTexto_(v) {
  const o = v && typeof v === 'object' ? v : lerJSONSeguro_(v, null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return '';
  const X = CITROS_, t = function (x) { return textoCurto_(x, X.maxTexto); };
  const um = function (x, l) { return l.indexOf(x) >= 0 ? x : ''; }, sn = function (x) { return um(x, ['sim', 'nao']); };
  const varios = function (x, l) { return (Array.isArray(x) ? x : []).filter(function (y, i, a) { return l.indexOf(y) >= 0 && a.indexOf(y) === i; }); };
  const num = function (x, inteiro) {
    if (x === '' || x === null || x === undefined) return '';
    const n = Number(String(x).replace(',', '.'));
    if (!isFinite(n) || n < 0) return '';
    return inteiro ? Math.round(n) : Math.round(n * 1000) / 1000;
  };
  const sub = function (x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; };
  const culturas = (Array.isArray(o.culturas) ? o.culturas : []).filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
    return { atividade: um(c.atividade, X.atividades), cultivar: t(c.cultivar), area: num(c.area), idade: num(c.idade, true), plantas: num(c.plantas, true), producao: num(c.producao) };
  }).filter(function (c) { return Object.keys(c).some(function (k) { return c[k] !== ''; }); }).slice(0, X.maxCulturas);
  const delimitacao = {}, deteccao = {}, dl = sub(o.delimitacao), dt = sub(o.deteccao);
  X.delimitacao.forEach(function (k) { const d = sub(dl[k]); delimitacao[k] = { tem: sn(d.tem), tempo: t(d.tempo), controle: sn(d.controle), qual: t(d.qual) }; });
  X.deteccao.forEach(function (k) { const d = sub(dt[k]); deteccao[k] = { tem: sn(d.tem), tempo: t(d.tempo) }; });
  const cnpj = digitos_(o.cnpj), rt = sub(o.rt);
  const r = { v: 1, comercial: sn(o.comercial), naoComercial: um(o.naoComercial, X.naoComercial), naoComercialOutros: t(o.naoComercialOutros),
              cnpj: cnpj.length === 14 ? cnpj : '', endereco: t(o.endereco), uf: String(o.uf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
              atividades: varios(o.atividades, X.atividades), atividadeOutros: t(o.atividadeOutros), situacao: um(o.situacao, X.situacoes), situacaoOutras: t(o.situacaoOutras),
              culturas: culturas, entrega: sn(o.entrega), formasEntrega: varios(o.formasEntrega, X.formasEntrega), compradores: varios(o.compradores, X.compradores),
              compradorOutros: t(o.compradorOutros), beneficia: sn(o.beneficia), beneficiaTipo: t(o.beneficiaTipo), materiais: varios(o.materiais, X.materiais),
              origemMaterial: t(o.origemMaterial), delimitacao: delimitacao, deteccao: deteccao, rt: { nome: t(rt.nome), conselho: t(rt.conselho) } };
  const temAlgo = function (x) {
    if (Array.isArray(x)) return x.some(temAlgo);
    if (x && typeof x === 'object') return Object.keys(x).some(function (k) { return k !== 'v' && temAlgo(x[k]); });
    return String(x === null || x === undefined ? '' : x) !== '';
  };
  ['cnpj', 'endereco', 'uf'].forEach(function (k) { if (r[k] === '') delete r[k]; });   // da versão anterior do app (hoje são colunas do levantamento)
  return temAlgo(r) ? JSON.stringify(r) : '';
}
/**
 * Identificação do produtor/propriedade no levantamento (colunas cnpj, empresa, endereco, uf): CNPJ só com 14 dígitos (senão vazio), UF com 2 letras,
 * empresa até 120 e endereço até 200 caracteres. Campo não enviado (app antigo) continua não enviado.
 */
function identLev_(r) {
  if (!r || typeof r !== 'object') return;
  if ('cnpj' in r) { const d = digitos_(r.cnpj); r.cnpj = d.length === 14 ? d : ''; }
  if ('uf' in r) r.uf = String(r.uf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if ('empresa' in r) r.empresa = textoCurto_(r.empresa, 120);
  if ('endereco' in r) r.endereco = textoCurto_(r.endereco, 200);
}
function culturaPce_(c, resultado) {
  return { cultura: String(c.cultura).trim(), area: numOuNulo_(c.area), espLinha: String(c.espLinha || ''), espPlanta: String(c.espPlanta || ''),
           espUnidade: ['m', 'cm'].indexOf(c.espUnidade) >= 0 ? c.espUnidade : '',
           resultado: resultado, coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', tipoMaterial: String(c.tipoMaterial || ''),
           codigoAmostra: String(c.codigoAmostra || ''), destinoAmostra: String(c.destinoAmostra || ''),
           nFotos: Array.isArray(c.fotos) ? c.fotos.filter(Boolean).length : 0 };
}
const temCultura_ = function (c) { return c && typeof c === 'object' && String(c.cultura || '').trim(); };
/** Pragas avaliadas no levantamento (registro inteiro), no formato novo; registros anteriores são convertidos. */
function pragasLev_(r) {
  const p = lerJSONSeguro_(r.pragas, null);
  if (Array.isArray(p) && p.some(function (g) { return g && typeof g === 'object' && Array.isArray(g.culturas) && g.culturas.some(temCultura_); })) {
    return p.filter(function (g) { return g && typeof g === 'object' && Array.isArray(g.culturas); }).map(function (g) {
      return { praga: String(g.praga || '').trim(), culturas: g.culturas.filter(temCultura_).map(function (c) {
        return culturaPce_(c, RESULTADOS_PCE.indexOf(c.resultado) >= 0 ? c.resultado : 'nao_detectada'); }) };
    }).filter(function (g) { return g.culturas.length; });
  }
  const a = lerJSONSeguro_(r.culturas, []), grupos = {}, ordem = [];
  (Array.isArray(a) ? a : []).filter(temCultura_).forEach(function (c) {
    const praga = String(c.praga || c.pragaAvaliada || '').trim();
    const res = RESULTADOS_PCE.indexOf(c.resultado) >= 0 ? c.resultado : (String(c.praga || '').trim() ? 'detectada' : 'nao_detectada');
    if (!grupos[praga]) { grupos[praga] = { praga: praga, culturas: [] }; ordem.push(praga); }
    grupos[praga].culturas.push(culturaPce_(c, res));
  });
  return ordem.map(function (k) { return grupos[k]; });
}
/** Culturas do levantamento, uma por cultura × praga: praga = nome só se detectada/suspeita ('' = não detectada); avaliada = praga do card. */
function culturasLev_(r) {
  const out = [];
  pragasLev_(r).forEach(function (g) {
    g.culturas.forEach(function (c) {
      out.push({ cultura: c.cultura, area: c.area, espLinha: c.espLinha, espPlanta: c.espPlanta, espUnidade: c.espUnidade, praga: c.resultado === 'nao_detectada' ? '' : g.praga,
                 avaliada: g.praga, resultado: c.resultado, coleta: c.coleta, tipoMaterial: c.tipoMaterial, codigoAmostra: c.codigoAmostra, destinoAmostra: c.destinoAmostra });
    });
  });
  return out;
}
/** Resumo por praga para o painel (sem dados pessoais): [{praga, culturas:[{cultura, area, resultado, coleta}], nFotos}]. */
function pragasPainel_(r) {
  return pragasLev_(r).map(function (g) {
    return { praga: g.praga, nFotos: g.culturas.reduce(function (s, c) { return s + c.nFotos; }, 0),
             culturas: g.culturas.map(function (c) { return { cultura: c.cultura, area: c.area, resultado: c.resultado, coleta: c.coleta }; }) };
  });
}
function pragasDe_(culturas) {
  const vistas = {};
  culturas.forEach(function (c) { if (c.praga) vistas[c.praga] = true; });
  return Object.keys(vistas);
}

/**
 * Resolve o período do painel. Sem datas: últimos 30 dias (até hoje, horário de Manaus). Só "de": até hoje.
 * Só "ate": 30 dias terminando em "ate". Máximo de 366 dias.
 */
function periodoPainel_(filtro) {
  filtro = filtro || {};
  const temDe = String(filtro.de || '') !== '', temAte = String(filtro.ate || '') !== '';
  if ((temDe && !diaValido_(filtro.de)) || (temAte && !diaValido_(filtro.ate))) throw new Error('Período inválido: use datas no formato aaaa-mm-dd.');
  const ate = temAte ? filtro.ate : hojeManaus_();
  const de = temDe ? filtro.de : somarDias_(ate, -29);
  if (de > ate) throw new Error('Período inválido: a data inicial é posterior à data final.');
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
  if (dias > PAINEL_MAX_DIAS) throw new Error('Período longo demais (máximo de ' + PAINEL_MAX_DIAS + ' dias). Escolha um período menor.');
  return { de: de, ate: ate, dias: dias };
}

/** Auditoria de uma sequência a partir de registros já lidos (usada pelo menu e pelo painel). */
function auditarRegs_(tipo, grupo, ano, todos, numeracao) {
  const s = SEQUENCIAS[tipo];
  ano = Number(ano);
  const regs = todos.filter(function (r) { return grupoSeq_(tipo, r) === grupo && r.ano === ano && (tipo === 'TF' || r.numero > 0) && r.excluido !== 1; });
  const usos = {};
  regs.forEach(function (r) { (usos[r.numero] = usos[r.numero] || []).push(r); });
  const nums = Object.keys(usos).map(Number).sort(function (a, b) { return a - b; });
  const base = numeracao.filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  const inicio = base ? base.ultimo + 1 : 1, lacunas = [], duplicados = [];
  const maior = nums.length ? nums[nums.length - 1] : inicio - 1;
  for (let n = inicio; n <= maior; n++) if (!usos[n]) lacunas.push(n);
  nums.forEach(function (n) { if (usos[n].length > 1) duplicados.push({ numero: n, ids: usos[n].map(function (r) { return r.usuario + ' ' + r.data + ' ' + r.hora; }) }); });
  const editados = regs.filter(function (r) { return r.numeroOrigem === 'editado' || r.numeroOrigem === 'provisorio' || r.numeroOrigem === 'papel'; }).map(function (r) { return { numero: r.numero, origem: r.numeroOrigem, sugerido: r.numeroSugerido, usuario: r.usuario }; });
  return { total: regs.length, primeiro: nums[0] || null, ultimo: maior || null, inicioEsperado: inicio, lacunas: lacunas, duplicados: duplicados, editados: editados,
           conflitos: regs.filter(function (r) { return r.conflito === 1; }).length, cancelados: regs.filter(function (r) { return r.cancelado === 1; }).length };
}

/**
 * Dados do período para o painel (o painel calcula indicadores, gráficos e mapa no navegador).
 * filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'}. Turnos em andamento vêm SEMPRE, qualquer que seja o período.
 * Registros excluídos ficam de fora; TFs/termos cancelados vêm com cancelado = 1. Documentos mascarados; sem telefone,
 * e-mail, endereço, RG, matrícula, testemunhas, assinaturas nem ids de fotos (só contagens).
 */
function painelDados(token, filtro) {
  const admin = adminDoToken_(token);
  encerrarTurnosAutomaticoBarato_();                 // turno esquecido aberto há mais de 12 h (antes do gatilho estar ativo, também)
  const r = dadosPainel_(admin, filtro);
  if (!r.aoVivo) {
    r.rotinas = situacaoRotinas_();                  // último backup e último arquivamento (rodapé do painel)
    const av = avisoArquivo_(r.periodo.de);          // período antes do ano anterior: parte dos turnos/veículos está no arquivo anual
    if (av) { r.avisoArquivo = av.texto; r.arquivosAnuais = av.arquivos; }
  }
  return r;
}

/** Corpo do painelDados (sem credencial): usado também pelo relatório mensal. */
function dadosPainel_(admin, filtro) {
  const p = periodoPainel_(filtro), de = p.de, ate = p.ate;
  const noPeriodo = function (r) { return r.data >= de && r.data <= ate; };

  // Barreira (Controle de veículos)
  const aoVivo = filtro && filtro.aoVivo === true, idsVivo = {};
  if (aoVivo) (Array.isArray(filtro.ids) ? filtro.ids : []).slice(0, 500).forEach(function (id) { idsVivo[String(id)] = true; });
  const turnosLidos = lerLeitura_('Turnos').filter(function (t) {
    return t.id && (t.encerrado !== 1 || (aoVivo ? idsVivo[t.id] === true : noPeriodo(t)));
  });
  const porTurno = {};
  turnosLidos.forEach(function (t) { porTurno[t.id] = { n: 0, pessoas: 0, ts: 0, hora: '' }; });
  const veiculos = lerLeitura_('Veiculos').filter(function (v) { return v.id && porTurno[v.turnoId] && v.excluido !== 1; }).map(function (v) {
    const a = porTurno[v.turnoId];
    a.n++; a.pessoas += v.pessoas;
    if (v.srv_ts > a.ts) a.ts = v.srv_ts;
    if (String(v.hora) > a.hora) a.hora = String(v.hora);
    const o = { id: v.id, turnoId: v.turnoId, hora: v.hora, placa: v.placa, tipo: v.tipo, pessoas: v.pessoas, srv_ts: v.srv_ts, usuario: v.usuario };
    if (v.ufOrigem || v.ufDestino) { o.ufOrigem = v.ufOrigem || ''; o.ufDestino = v.ufDestino || ''; }        // origem/destino (opcional)
    if (v.carga === 1) { o.carga = 1; o.produtos = produtosTF_(v.produtos).map(function (p) { return p.texto; }).join('; '); }   // registro antigo
    return o;
  });
  // sinal dos aparelhos: vale para o turno o aparelho do fiscal com este turno aberto (turnoAtual) ou encerrado sem enviar
  // (aparelho de versão antiga, sem sinal próprio, não conta: não se sabe qual turno ele tem aberto)
  const aparelhosPorUsuario = {};
  lerAparelhos_().forEach(function (ap) { (aparelhosPorUsuario[ap.usuario] = aparelhosPorUsuario[ap.usuario] || []).push(ap); });
  const sinalDoTurno = function (t) {
    if (t.encerrado === 1) return null;
    const lst = (aparelhosPorUsuario[t.usuario] || []).filter(function (ap) {
      return !ap.legado && (ap.turnoAtual === t.id || ap.turnosEncerradosPendentes.indexOf(t.id) >= 0);
    });
    if (!lst.length) return null;
    const enc = lst.filter(function (ap) { return ap.turnosEncerradosPendentes.indexOf(t.id) >= 0; });
    const ap = (enc.length ? enc : lst).slice().sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
    const o = resumoAparelho_(ap);
    o.ultimoSinal = Math.max.apply(null, lst.map(function (x) { return x.ultimoSinal || 0; }));
    o.encerradoNoCelular = enc.length ? 1 : 0;
    o.fimNoCelular = enc.length ? String(ap.fimPendentes[t.id] || '') : '';
    o.n = lst.length;
    return o;
  };
  const turnos = turnosLidos.map(function (t) {
    const a = porTurno[t.id], ini = tsManaus_(t.data, t.inicio), sa = sinalDoTurno(t);
    let fim = t.fim ? tsManaus_(t.data, t.fim) : null;
    if (fim !== null && ini !== null && fim < ini) fim += 864e5;                       // turno que passou da meia-noite
    return { id: t.id, numeroTF: t.numeroTF, data: t.data, letra: t.letra, inicio: t.inicio, fim: t.fim, fiscal: t.fiscal, local: t.local,
             unidade: t.unidade, posto: t.posto, encerrado: t.encerrado === 1 ? 1 : 0, emAndamento: t.encerrado !== 1, usuario: t.usuario,
             criadoEm: t.criadoEm, atualizadoEm: t.atualizadoEm, srv_ts: t.srv_ts, encerradoPor: t.encerradoPor, encerradoEm: t.encerradoEm || null,
             latIni: numOuNulo_(t.latIni), lngIni: numOuNulo_(t.lngIni), precIni: numOuNulo_(t.precIni),
             latFim: numOuNulo_(t.latFim), lngFim: numOuNulo_(t.lngFim), precFim: numOuNulo_(t.precFim),
             inicioTs: ini, fimTs: fim, nVeiculos: a.n, nPessoas: a.pessoas + (t.pessoasEducacao || 0), pessoasEducacao: t.pessoasEducacao || 0, soPessoas: t.soPessoas === 1 ? 1 : 0,
             ultimoVeiculoHora: a.hora, ultimoVeiculoTs: a.ts || null, ultimoSinal: Math.max(t.srv_ts, a.ts, sa ? sa.ultimoSinal : 0) || null,
             aparelho: sa, encerradoNoCelular: sa ? sa.encerradoNoCelular : 0, fimNoCelular: sa ? sa.fimNoCelular : '' };
  });

  const agoraMs = Date.now(), tfsAndamento = tfsAndamento_(agoraMs);                 // TF em preenchimento: vem sempre (normal e ao vivo)
  if (aoVivo) return { ok: true, agora: agoraMs, admin: admin, aoVivo: true, periodo: p, turnos: turnos, veiculos: veiculos, tfsAndamento: tfsAndamento };

  // TF de Barreira
  const todosTFs = lerLeitura_('TFs').filter(function (r) { return r.id; });
  const tfsPer = todosTFs.filter(noPeriodo), REINC = reincidenciaTFs_(todosTFs);   // reincidência recalculada (CPF/CNPJ e placa válidos)
  const tfs = tfsPer.map(function (r) {
    return { id: r.id, barreira: r.barreira, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, turnoId: r.turnoId, veiculoId: r.veiculoId,
             data: r.data, hora: r.hora, fiscal: r.fiscal, local: r.local, placa: r.placa, origem: r.origem, destino: r.destino,
             ufOrigem: ufNorm_(r.ufOrigem) || ufDoTexto_(r.origem), ufDestino: ufNorm_(r.ufDestino) || ufDoTexto_(r.destino),
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, municipio: r.municipio, uf: r.uf, relacao: r.relacao,
             inspecao: r.inspecao, coleta: r.coleta, amostras: r.amostras, procedimento: r.procedimento, fiel: r.fiel, auto: r.auto,
             advertencia: r.advertencia, documentos: documentosTF_(r.documentos), produtos: produtosTF_(r.produtos),
             reincidente: REINC[r.id].reincidente ? 1 : 0, tfsAnteriores: REINC[r.id].anteriores, cancelado: r.cancelado, motivoCancel: r.motivoCancel,
             nFotos: contarFotos_(r.fotos), assinado: contarAssinaturas_(r.assinaturas) ? 1 : 0,   // só contagens: nunca os ids/imagens (LGPD)
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  // PCE: levantamentos (período e 365 dias anteriores, para "novo foco" e cobertura) e Termos de Colheita
  const iniHist = somarDias_(de, -365), fimHist = somarDias_(de, -1);
  const levLidos = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1; });
  const historicoPce = [], levantamentos = [];
  levLidos.forEach(function (r) {
    if (r.data >= iniHist && r.data <= fimHist) { historicoPce.push({ municipio: r.municipio, data: r.data, pragas: pragasDe_(culturasLev_(r)) }); return; }
    if (!noPeriodo(r)) return;
    const cult = culturasLev_(r);
    levantamentos.push({ id: r.id, data: r.data, hora: r.hora, servidor: r.servidor, cargo: r.cargo, lotacao: r.lotacao,
                         doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, propriedade: r.propriedade,
                         codigoPropriedade: r.codigoPropriedade, situacaoFundiaria: r.situacaoFundiaria, municipio: r.municipio,
                         lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
                         culturas: cult, pragas: pragasDe_(cult), pragasLev: pragasPainel_(r), nFotos: contarFotos_(r.fotos), nAssinaturas: contarAssinaturas_(r.assinaturas),
                         nDocumentos: contarFotos_(r.documentos), tipoLocal: r.tipoLocal, origemVisita: r.origemVisita,
                         criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario });
  });
  const todasColheitas = lerLeitura_('Colheitas').filter(function (r) { return r.id && r.excluido !== 1; });
  const colPer = todasColheitas.filter(noPeriodo);
  const levPorId = {}; levLidos.forEach(function (r) { levPorId[r.id] = r; });
  const colheitas = colPer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, levantamentoId: r.levantamentoId,
             data: r.data, hora: r.hora, servidor: r.servidor, lotacao: r.lotacao, municipio: r.municipio,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
             cultura: r.cultura, quantidade: r.quantidade, analise: r.analise, partes: r.partes, local: r.local,
             cancelado: r.cancelado, motivoCancel: r.motivoCancel, nFotos: contarFotos_(r.fotos), nDocumentos: contarFotos_(r.documentos),
             laboratorio: labObjeto_(r.laboratorio), pragaTermo: pragaDoTermo_(r, levPorId),
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  // PCE: Termos de Fiscalização e Cadastros de imóvel (monilíase…) do período, sem testemunhas, assinaturas nem ids de arquivos
  const todosTermosPce = lerLeitura_('TermosPCE').filter(function (r) { return r.id && r.excluido !== 1; });
  const termosPcePer = todosTermosPce.filter(noPeriodo);
  const termosPce = termosPcePer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido, numeroOrigem: r.numeroOrigem,
             conflito: r.conflito, emitidoEm: r.emitidoEm, propriedadeId: r.propriedadeId, cadastroId: r.cadastroId, programa: r.programa,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, atividade: r.atividade, empresa: r.empresa, endereco: r.endereco,
             municipio: r.municipio, uf: r.uf, lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), data: r.data, hora: r.hora,
             servidor: r.servidor, cargo: r.cargo, matricula: r.matricula, lotacao: r.lotacao,
             pragas: lerJSONSeguro_(r.pragas, []), tipoLocal: lerJSONSeguro_(r.tipoLocal, []), acoes: lerJSONSeguro_(r.acoes, []),
             constatacao: r.constatacao, enquadramento: r.enquadramento, plantasInspecionadas: r.plantasInspecionadas,
             amostra: r.amostra, sintomas: r.sintomas, hospedeiros: lerJSONSeguro_(r.hospedeiros, []), cancelado: r.cancelado, motivoCancel: r.motivoCancel,
             nDocumentos: contarFotos_(r.documentos), criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });
  const todosCadastrosPce = lerLeitura_('CadastrosPCE').filter(function (r) { return r.id && r.excluido !== 1; });
  const ligados = {}; termosPce.forEach(function (t) { if (t.cadastroId) ligados[t.cadastroId] = true; });
  const cadPer = todosCadastrosPce.filter(function (r) { return noPeriodo(r) || ligados[r.id]; });
  const cadastrosPce = cadPer.map(function (r) {
    return { id: r.id, programa: r.programa, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, propriedadeId: r.propriedadeId, doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             propriedade: r.propriedade, municipio: r.municipio, uf: r.uf, lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), data: r.data, hora: r.hora,
             servidor: r.servidor, cargo: r.cargo, matricula: r.matricula, lotacao: r.lotacao, local: r.local, dados: lerJSONSeguro_(r.dados, {}),
             totalPlantas: r.totalPlantas, noPeriodo: noPeriodo(r) ? 1 : 0, nDocumentos: contarFotos_(r.documentos), criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  const total = turnos.length + veiculos.length + tfs.length + levantamentos.length + colheitas.length + historicoPce.length + termosPce.length + cadastrosPce.length;
  if (total > PAINEL_MAX_REGISTROS) throw new Error('O período escolhido tem registros demais (' + total + '). Escolha um período menor.');

  // Auditoria da numeração: cada barreira/ano (TF) e unidade/ano (Termo de Colheita) presente no período, sobre TODOS os registros do ano
  const numeracao = lerLeitura_('Numeracao');
  const auditar = function (tipo, todos, doPeriodo) {
    const vistos = {}, out = [];
    doPeriodo.forEach(function (r) {
      const g = grupoSeq_(tipo, r), k = g + '|' + r.ano;
      if (!r.unidade && !r.barreira || !r.ano || vistos[k]) return;
      vistos[k] = true;
      const a = auditarRegs_(tipo, g, r.ano, todos, numeracao);
      a.grupo = g; a.ano = r.ano; a.lacunasTotal = a.lacunas.length; a.lacunas = a.lacunas.slice(0, PAINEL_MAX_LACUNAS);
      out.push(a);
    });
    return out;
  };

  return {
    ok: true,
    agora: Date.now(),
    admin: admin,
    periodo: p,
    turnos: turnos,
    veiculos: veiculos,
    tfsAndamento: tfsAndamento,
    tfs: tfs,
    levantamentos: levantamentos,
    colheitas: colheitas,
    historicoPce: historicoPce,
    termosPce: termosPce,
    cadastrosPce: cadastrosPce,
    barreiras: lerLeitura_('Barreiras').filter(function (b) { return b.id; })
      .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local, ativo: b.ativo === 1, bva: bvaDoCadastro_(b) }; }),
    auditoria: { tf: auditar('TF', todosTFs, tfsPer), pce: auditar('PCE', todasColheitas, colPer),
                 termosPce: auditar('TPCE', todosTermosPce, termosPcePer), cadastrosPce: auditar('CPCE', todosCadastrosPce, todosCadastrosPce.filter(noPeriodo)) }
  };
}

/* ---------- PCE: resultado laboratorial do Termo de Colheita ----------
 * Coluna "laboratorio" (JSON) da aba Colheitas, registrada depois da coleta no app (tela do termo → "Resultado do laboratório") ou
 * no painel (aba PCE → termos de colheita → painelPceLaudo). Não muda o número, o PDF nem os demais campos do termo. Cada registro
 * leva atualizadoEm/por: no sync, o resultado mais novo vale (um reenvio do termo pelo celular não apaga o lançado no painel). */
const LAB_RESULTADOS = ['aguardando', 'negativo', 'positivo', 'inconclusivo', 'inviavel'];
/** Resultado laboratorial normalizado (só os campos conhecidos, textos curtos); null = sem resultado. */
function labObjeto_(v) {
  const o = v && typeof v === 'object' ? v : lerJSONSeguro_(v, null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const dia = function (x) { x = String(x || '').slice(0, 10); return diaValido_(x) ? x : ''; };
  const r = { laboratorio: textoCurto_(o.laboratorio, 60), laboratorioOutro: textoCurto_(o.laboratorioOutro, 80), envio: dia(o.envio), laudo: textoCurto_(o.laudo, 60),
              dataResultado: dia(o.dataResultado), resultado: LAB_RESULTADOS.indexOf(o.resultado) >= 0 ? o.resultado : 'aguardando',
              praga: textoCurto_(o.praga, 120), obs: textoCurto_(o.obs, 500), atualizadoEm: Number(o.atualizadoEm) || 0, por: textoCurto_(o.por, 80) };
  if (!r.laboratorio && !r.envio && !r.laudo && !r.dataResultado && r.resultado === 'aguardando' && !r.obs && !r.praga) return null;
  return r;
}
function labTexto_(v) { const o = labObjeto_(v); return o ? JSON.stringify(o) : ''; }
/** Entre o resultado gravado e o recebido, fica o de atualizadoEm maior (empate: o gravado). */
function labMaisNovo_(atual, novo) {
  const a = labObjeto_(atual), b = labObjeto_(novo);
  if (!b) return a ? JSON.stringify(a) : '';
  if (!a) return JSON.stringify(b);
  return b.atualizadoEm > a.atualizadoEm ? JSON.stringify(b) : JSON.stringify(a);
}
/** Praga do termo de colheita: a confirmada no resultado positivo; senão a da amostra do levantamento ligado (mesma cultura); senão o tipo de análise. */
function pragaDoTermo_(c, levPorId) {
  const lab = labObjeto_(c.laboratorio);
  if (lab && lab.resultado === 'positivo' && lab.praga) return lab.praga;
  const lev = levPorId && c.levantamentoId ? levPorId[c.levantamentoId] : null;
  if (lev) {
    const pr = pragasLev_(lev), cu = String(c.cultura || '').trim();
    const g = pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.cultura === cu && y.coleta === 'Sim'; }); })[0]
           || pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.cultura === cu; }); })[0]
           || pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.coleta === 'Sim'; }); })[0];
    if (g) return g.praga;
  }
  return textoCurto_(c.analise, 120);
}

/** Painel → PCE → termos de colheita: o administrador registra o resultado laboratorial (grava SÓ a coluna laboratorio, com quem/quando). */
function painelPceLaudo(token, req) {
  const admin = adminDoToken_(token, true), id = String(req.id || '').slice(0, 64);
  const lab = labObjeto_(req.laboratorio);
  if (!id) throw new Error('Termo de colheita não informado.');
  if (!lab) throw new Error('Informe o resultado laboratorial (laboratório, datas, nº do laudo ou resultado).');
  if (lab.laboratorio === 'Outro' && !lab.laboratorioOutro) throw new Error('Informe o nome do laboratório (opção "Outro").');
  if (lab.envio && lab.dataResultado && lab.dataResultado < lab.envio) throw new Error('A data do resultado é anterior à data de envio.');
  if (lab.resultado === 'positivo' && !lab.praga) throw new Error('Resultado positivo: informe a praga confirmada.');
  if (CONV_RE_CPF.test(lab.obs + ' ' + lab.laudo)) throw new Error('Não informe CPF no resultado (LGPD).');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Colheitas'), il = t.cols.indexOf('laboratorio'), is = t.cols.indexOf('srv_ts');
    for (let i = 0; i < t.valores.length; i++) {
      if (String(t.valores[i][0]) !== id) continue;
      const o = paraObjeto_(t.cols, t.valores[i]);
      if (o.excluido === 1) break;
      const agora = Date.now();
      lab.atualizadoEm = agora; lab.por = admin;
      t.sh.getRange(i + 2, il + 1).setValue(JSON.stringify(lab));
      t.sh.getRange(i + 2, is + 1).setValue(agora);                       // o aparelho do servidor recebe o resultado no próximo sync (atualizadoEm do termo não muda)
      return { ok: true, id: id, numeroTxt: o.numeroTxt, laboratorio: lab };
    }
    throw new Error('Termo de colheita não encontrado.');
  } finally { lock.releaseLock(); }
}
