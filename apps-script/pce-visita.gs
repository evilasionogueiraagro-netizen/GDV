/* ---------- PCE: Termo por programa da visita e visitas contáveis dos relatórios ----------
 * A visita é identificada por `visitaId` (criado pelo app). Ela gera UM Termo de Fiscalização por programa do catálogo: chave única
 * (visitaId, programaVisita); as culturas avaliadas ficam em `culturas` (JSON, normalizado aqui). Termo antigo (sem visitaId) segue como está.
 * O levantamento deixou de ser criado, mas o servidor continua aceitando os que o aparelho tinha pendentes (Levantamentos intacta).
 *
 * visitasPce_() é a regra do que conta como "visita" nos números do PCE (Relatório GDV, dashboard público, painel, TV e relatório de rotina):
 * levantamentos antigos + Termos do fluxo novo; sem data de corte. A etapa 1.4 do convênio (convenios.gs) é à parte: sempre somou levantamentos e
 * Termos, inclusive os antigos, e o número já apurado não pode mudar.
 */
const MAX_CULTURAS_TERMO_PCE_ = 40;
const MAX_PRAGAS_CULTURA_PCE_ = 25;
const MAX_FOTOS_CULTURA_PCE_ = 20;
const MAX_DADOS_PCE_ = 30;

/** Número ≥ 0 com até 3 casas; vazio ou inválido = ''. */
function numPceTermo_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (!s) return '';
  const n = Number(s);
  return isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : '';
}

/** Perguntas próprias do programa (detecção específica): objeto {chave: texto curto}; chaves simples, até 30. */
function dadosPceTermo_(o) {
  const r = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return r;
  Object.keys(o).filter(function (k) { return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k); }).slice(0, MAX_DADOS_PCE_).forEach(function (k) {
    const v = o[k];
    r[k] = typeof v === 'number' && isFinite(v) ? v : textoCurto_(v, 200);
  });
  return r;
}

/**
 * Culturas avaliadas do Termo: texto JSON do app → lista normalizada (só as chaves conhecidas, textos curtos, resultado da lista RESULTADOS_PCE
 * ou '' = sem resposta: só de aparelho com versão antiga, em praga opcional; o app novo já marca "não tem"). Cultura sem nome é descartada. Devolve [] se inválido.
 */
function culturasTermoPce_(v) {
  const a = Array.isArray(v) ? v : lerJSONSeguro_(v, []);
  if (!Array.isArray(a)) return [];
  const sn = function (x) { const s = String(x || '').trim().toLowerCase(); return s === 'sim' ? 'Sim' : (s === 'nao' || s === 'não') ? 'Não' : ''; };
  return a.filter(function (c) { return c && typeof c === 'object' && textoCurto_(c.cultura, 60); }).slice(0, MAX_CULTURAS_TERMO_PCE_).map(function (c) {
    const pragas = (Array.isArray(c.pragas) ? c.pragas : []).filter(function (p) { return p && typeof p === 'object' && textoCurto_(p.praga, 80); })
      .slice(0, MAX_PRAGAS_CULTURA_PCE_).map(function (p) {
        const o = { praga: textoCurto_(p.praga, 80), resultado: RESULTADOS_PCE.indexOf(p.resultado) >= 0 ? p.resultado : '',
                    haQuantoTempo: textoCurto_(p.haQuantoTempo, 60), controle: textoCurto_(p.controle, 40), qualControle: textoCurto_(p.qualControle, 120) };
        if (Number(p.opcional) === 1 || p.opcional === true) o.opcional = 1;   // praga de registro (tem/não tem): o Termo impresso não mostra a caixa Suspeita
        if (p.dados) o.dados = dadosPceTermo_(p.dados);
        return o;
      });
    const o = { cultura: textoCurto_(c.cultura, 60), area: numPceTermo_(c.area), pragas: pragas, coleta: sn(c.coleta), tipoMaterial: textoCurto_(c.tipoMaterial, 60),
                codigoAmostra: textoCurto_(c.codigoAmostra, 60), destinoAmostra: textoCurto_(c.destinoAmostra, 120),
                fotos: (Array.isArray(c.fotos) ? c.fotos : []).map(function (f) { return String(f || '').slice(0, 64); }).filter(Boolean).slice(0, MAX_FOTOS_CULTURA_PCE_) };
    if (c.dados) o.dados = dadosPceTermo_(c.dados);
    return o;
  });
}

/**
 * Termo do PCE recebido (sync ou pceDocRegistrar): campos da visita normalizados. Sem `visitaId` o Termo é o antigo (visita, programa e
 * culturas ficam vazios); campo `visitaId` não enviado (app antigo reenviando um Termo novo) deixa tudo como está na planilha.
 * amostra (sim/nao) e sintomas (sim/nao) saem das culturas quando o app não os mandou. Devolve false se as culturas não cabem na célula.
 */
function normalizarTermoPceVisita_(r) {
  if (!('visitaId' in r)) { delete r.programaVisita; delete r.culturas; return true; }
  r.visitaId = textoCurto_(r.visitaId, 64);
  if (!r.visitaId) { r.visitaId = ''; r.programaVisita = ''; r.culturas = ''; return true; }
  r.programaVisita = textoCurto_(r.programaVisita || r.programa, 60);
  const cs = culturasTermoPce_(r.culturas);
  r.culturas = JSON.stringify(cs);
  if (r.culturas.length > LIMITES_TEXTO.culturas) return false;
  const temPraga = function (res) { return cs.some(function (c) { return c.pragas.some(function (p) { return res.indexOf(p.resultado) >= 0; }); }); };
  if (r.amostra !== 'sim' && r.amostra !== 'nao') r.amostra = cs.some(function (c) { return c.coleta === 'Sim'; }) ? 'sim' : 'nao';
  if (r.sintomas !== 'sim' && r.sintomas !== 'nao') r.sintomas = temPraga(['detectada', 'suspeita']) ? 'sim' : 'nao';
  return true;
}

/** Chave única do Termo da visita: "visitaId|programaVisita" ('' = Termo antigo). */
function chaveTermoVisita_(t) { return t && t.visitaId && t.programaVisita ? t.visitaId + '|' + t.programaVisita : ''; }

/** Termo ativo (nem excluído nem cancelado) que já ocupa a chave do registro, de outro id; mapa dono[chave] = id. */
function donosTermosVisita_(todos) {
  const dono = {};
  todos.forEach(function (t) { const k = chaveTermoVisita_(t); if (k && Number(t.excluido) !== 1 && Number(t.cancelado) !== 1) dono[k] = String(t.id); });
  return dono;
}

/**
 * Antes de gravar o lote de Termos: um Termo por programa da visita. O segundo (outro id, mesma chave, ativo) e o que não cabe na
 * célula voltam recusados (o aparelho os mantém pendentes). Termo excluído ou cancelado não ocupa a chave.
 */
function filtrarTermosPceUnicos_(regs, usuario, alheios) {
  const dono = donosTermosVisita_(lerLeitura_('TermosPCE'));
  const recusar = [];
  const fica = regs.filter(function (r) {
    if (!r) return false;
    if (r.visitaId && String(r.culturas || '').length > LIMITES_TEXTO.culturas) { recusar.push(r.id); return false; }
    const k = chaveTermoVisita_(r);
    if (!k || Number(r.excluido) === 1 || Number(r.cancelado) === 1) return true;
    if (dono[k] && dono[k] !== String(r.id)) { recusar.push(r.id); return false; }
    dono[k] = String(r.id); return true;
  });
  alheios('termosPce', recusar);
  return fica;
}

/* ---------- Visitas contáveis ---------- */

/** Itens do `culturas` do Termo → grupos por praga no formato do levantamento (pragasLev_): [{praga, culturas:[...]}]. */
function gruposDoTermo_(culturas) {
  const grupos = {}, ordem = [];
  const poe = function (praga, c, resultado, p) {
    if (!grupos[praga]) { grupos[praga] = { praga: praga, culturas: [] }; ordem.push(praga); }
    grupos[praga].culturas.push({ cultura: c.cultura, area: c.area === '' ? null : c.area, espLinha: '', espPlanta: '', resultado: resultado,
                                  coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', tipoMaterial: c.tipoMaterial || '', codigoAmostra: c.codigoAmostra || '',
                                  destinoAmostra: c.destinoAmostra || '', fotos: c.fotos || [] });
  };
  culturas.forEach(function (c) {
    const respondidas = (c.pragas || []).filter(function (p) { return RESULTADOS_PCE.indexOf(p.resultado) >= 0; });
    if (!respondidas.length) poe('', c, 'nao_detectada');                 // cultura avaliada sem praga respondida: conta como visita negativa (a área entra)
    respondidas.forEach(function (p) { poe(p.praga, c, p.resultado); });
  });
  return ordem.map(function (k) { return grupos[k]; });
}

/** Une grupos de várias partes (mesma praga = um grupo só). */
function unirGrupos_(listas) {
  const grupos = {}, ordem = [];
  listas.forEach(function (gs) {
    gs.forEach(function (g) {
      if (!grupos[g.praga]) { grupos[g.praga] = { praga: g.praga, culturas: [] }; ordem.push(g.praga); }
      grupos[g.praga].culturas = grupos[g.praga].culturas.concat(g.culturas);
    });
  });
  return ordem.map(function (k) { return grupos[k]; });
}

/** Termo do fluxo novo que conta como visita: tem visitaId e culturas, não está cancelado nem excluído. */
function termoDeVisita_(t) {
  if (!t.id || Number(t.excluido) === 1 || Number(t.cancelado) === 1 || !String(t.visitaId || '').trim()) return null;
  const cs = lerJSONSeguro_(t.culturas, []);
  return Array.isArray(cs) && cs.length ? cs : null;
}

/**
 * Visitas contáveis do PCE (sem data de corte):
 *  - cada Levantamento não excluído (a tabela segue intacta; aparelho com pendência ainda os envia);
 *  - cada visitaId distinto com ao menos um Termo contável (visitaId e culturas preenchidos, nem cancelado nem excluído).
 *    Termo antigo (sem visitaId) NUNCA entra: não há dupla contagem. Visita nova sem praga detectada é negativa (conta).
 * Cada item tem o formato de uma linha de Levantamentos (id, data, hora, doc, nome, propriedade, codigoPropriedade, municipio, lat, lon, tipoLocal,
 * origemVisita, pragas = JSON no formato do levantamento…), de modo que pragasLev_/culturasLev_ servem aos dois, mais:
 *   origem  'levantamento' | 'termo'
 *   partes  lista de itens no mesmo formato, um por "unidade de programa": o próprio levantamento, ou um por Termo da visita
 *           (contagem por programa conta partes; o total geral conta visitas)
 *   termos  ids dos Termos da visita (vazio no levantamento antigo); programas = programaVisita de cada um
 */
function visitasPce_() {
  const out = [];
  lerLeitura_('Levantamentos').forEach(function (r) {
    if (!r.id || r.excluido === 1) return;
    const v = Object.assign({}, r, { origem: 'levantamento', termos: [], programas: [] });
    v.partes = [r];
    out.push(v);
  });
  const props = {};
  lerLeitura_('Propriedades').forEach(function (p) { if (p.id) props[p.id] = p; });
  const porVisita = {}, ordem = [];
  lerLeitura_('TermosPCE').forEach(function (t) {
    const cs = termoDeVisita_(t);
    if (!cs) return;
    const k = String(t.visitaId).trim();
    if (!porVisita[k]) { porVisita[k] = []; ordem.push(k); }
    porVisita[k].push({ t: t, cs: cs });
  });
  ordem.forEach(function (k) {
    const lista = porVisita[k].sort(function (a, b) {
      return String(a.t.data + ' ' + a.t.hora).localeCompare(String(b.t.data + ' ' + b.t.hora)) || String(a.t.id).localeCompare(String(b.t.id));
    });
    const t0 = lista[0].t, prop = props[t0.propriedadeId] || {};
    const tl = lerJSONSeguro_(t0.tipoLocal, []);
    const grupos = lista.map(function (x) { return gruposDoTermo_(culturasTermoPce_(x.cs)); });
    const juntar = function (campo) {
      const ids = [];
      lista.forEach(function (x) { const a = lerJSONSeguro_(x.t[campo], []); if (Array.isArray(a)) a.forEach(function (f) { if (f && ids.indexOf(f) < 0) ids.push(f); }); });
      return JSON.stringify(ids);
    };
    const v = {
      id: k, origem: 'termo', visitaId: k, data: t0.data, hora: t0.hora, servidor: t0.servidor, cargo: t0.cargo, matricula: t0.matricula, lotacao: t0.lotacao,
      doc: t0.doc, nome: t0.nome, telefone: t0.telefone, email: '', propriedade: prop.nome || t0.empresa || '', codigoPropriedade: prop.codigo || '',
      situacaoFundiaria: prop.situacaoFundiaria || '', municipio: t0.municipio, lat: t0.lat, lon: t0.lon, precisao: '',
      culturas: '', pragas: '', fotos: juntar('fotos'), assinaturas: t0.assinaturas, documentos: juntar('documentos'), obs: '',
      excluido: 0, criadoEm: Math.min.apply(null, lista.map(function (x) { return Number(x.t.criadoEm) || 0; })),
      atualizadoEm: Math.max.apply(null, lista.map(function (x) { return Number(x.t.atualizadoEm) || 0; })),
      srv_ts: Math.max.apply(null, lista.map(function (x) { return Number(x.t.srv_ts) || 0; })), usuario: t0.usuario, registroAntigo: 0,
      tipoLocal: Array.isArray(tl) && typeof tl[0] === 'string' ? tl[0] : '', origemVisita: '', citros: '',
      cnpj: t0.cnpj, empresa: t0.empresa, endereco: t0.endereco, uf: t0.uf, comercial: prop.comercial || '',
      termos: lista.map(function (x) { return x.t.id; }), programas: lista.map(function (x) { return x.t.programaVisita; })
    };
    v.pragas = JSON.stringify(unirGrupos_(grupos));
    v.partes = lista.map(function (x, i) {
      return Object.assign({}, v, { id: x.t.id, programa: x.t.programaVisita, pragas: JSON.stringify(grupos[i]), termos: [x.t.id], programas: [x.t.programaVisita] });
    });
    out.push(v);
  });
  return out;
}
