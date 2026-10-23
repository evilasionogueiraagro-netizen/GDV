/* ---------- Relatório GDV (painel → aba Relatórios; só administrador) ----------
 * Relatório técnico parcial (mensal) e consolidado (anual) da Gerência de Defesa Vegetal, no modelo do relatório técnico anual.
 * painelRelGdvApuracao {de, ate, grupos}: SÓ AGREGADOS (por mês, por município, por praga) + a lista do anexo por propriedade com
 * CPF/CNPJ mascarado, produtor só com as iniciais e coordenadas arredondadas a 2 casas (~1 km). Os grupos de pragas (CONFIG.RELGDV) vêm
 * do painel. Textos e lançamentos manuais: abas RelGdvTextos / RelGdvLancamentos (painelRelGdv, painelRelGdvSalvar). */
const RELGDV_RE_CHAVE = /^(pce|vig|mun|hlb)\.[A-Za-z0-9_.|À-ÖØ-öø-ÿ'’ ()\/-]{1,100}$/;
const RELGDV_TABS = { 'tab.cfo': ['produto', 'documentos', 'quantidade', 'unidade'], 'tab.ptv': ['produto', 'documentos', 'quantidade', 'unidade'],
                      'tab.educacao': ['tipo', 'descricao', 'periodo', 'local', 'publico', 'atingido'] };
const RELGDV_NUM_TAB = ['documentos', 'quantidade', 'atingido'];
function mesRelGdv_(v) {
  const m = String(v === null || v === undefined ? '' : v).padStart(2, '0');
  if (!/^(0[1-9]|1[0-2])$/.test(m)) throw new Error('Mês inválido: ' + v + '.');
  return m;
}
function anoRelGdv_(v) { const a = Number(v); if (!(a >= 2000 && a <= 2100) || Math.round(a) !== a) throw new Error('Ano inválido.'); return a; }
/** Mesmo id de propriedade do app (código; sem código, CPF/CNPJ + nome da propriedade normalizado). */
function propIdGdv_(codigo, doc, nome) {
  const cod = String(codigo || '').trim(), d = digitos_(doc), n = String(nome || '').trim();
  return (cod || (d && n ? d + '|' + n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() : '')).slice(0, 64).trim();
}
/** Iniciais do produtor ("Raimundo Nonato da Silva" → "R. N. S."): o anexo nunca leva o nome completo (LGPD). */
function iniciaisRelGdv_(nome) {
  return String(nome || '').trim().split(/\s+/).filter(function (p) { return p && !/^(d[aeo]s?|e)$/i.test(p); })
    .map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join(' ').slice(0, 30);
}

/** Textos e lançamentos do ano (e os textos do ano anterior, para pré-preencher janeiro / o anual seguinte). */
function painelRelGdv(token, req) {
  const admin = adminDoToken_(token), ano = req.ano ? anoRelGdv_(req.ano) : Number(hojeManaus_().slice(0, 4));
  return { ok: true, admin: admin, hoje: hojeManaus_(), ano: ano,
    textos: lerLeitura_('RelGdvTextos').filter(function (r) { return r.id && (r.ano === ano || r.ano === ano - 1); }).map(function (r) {
      return { id: r.id, tipo: r.tipo, ano: r.ano, mes: r.mes, textos: lerJSONSeguro_(r.textos, {}), usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }),
    lancamentos: lerLeitura_('RelGdvLancamentos').filter(function (r) { return r.id && r.ano === ano; }).map(function (r) {
      return { mes: r.mes, chave: r.chave, valor: numOuNulo_(r.valor), lista: r.lista ? lerJSONSeguro_(r.lista, []) : null, usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}

/**
 * Painel: salva os textos de um relatório (tipo|ano|mês). Os NÚMEROS lançados à mão (quadro PCE, colunas por município, tabelas de
 * CFO/CFOC, PTV e educação sanitária, armadilhas do HLB) passaram para o Portal do Administrativo (admRelLancar): com lançamentos,
 * o painel recusa.
 */
function painelRelGdvSalvar(token, req) {
  const admin = adminDoToken_(token, true), ano = anoRelGdv_(req.ano), agora = Date.now();
  if (Array.isArray(req.lancamentos) && req.lancamentos.length) throw new Error(MSG_PORTAL);
  let txt = null;
  if (req.textos) {
    const tipo = ['anual', 'mensal', 'vigifito'].indexOf(req.tipo) >= 0 ? req.tipo : '';
    if (!tipo) throw new Error('Tipo de relatório inválido (mensal, anual ou vigifito).');
    // VIGIFITO: textos por período do relatório — MM (mês), S1/S2 (semestre), P<início> (período de 10 dias) ou vazio (anual)
    if (tipo === 'vigifito' && !/^(|0[1-9]|1[0-2]|S[12]|P\d{4}-\d{2}-\d{2})$/.test(String(req.mes || ''))) throw new Error('Período do relatório VIGIFITO inválido.');
    const mes = tipo === 'mensal' ? mesRelGdv_(req.mes) : tipo === 'vigifito' ? String(req.mes || '') : '', out = {};
    if (typeof req.textos !== 'object' || Array.isArray(req.textos)) throw new Error('Textos inválidos.');
    Object.keys(req.textos).forEach(function (k) {
      if (!/^[A-Za-z0-9_:.-]{1,40}$/.test(k) || Object.keys(out).length >= 60) throw new Error('Campo de texto inválido: ' + k + '.');
      if (k === 'assinaturas') {
        const a = req.textos[k];
        if (!Array.isArray(a) || a.length > 3) throw new Error('Assinaturas: até 3 linhas.');
        out[k] = a.map(function (x, i) { return { nome: convTexto_(x && x.nome, 100, 'Assinatura ' + (i + 1)), cargo: convTexto_(x && x.cargo, 140, 'Cargo ' + (i + 1)) }; });
      } else if (k === 'anexo') out[k] = req.textos[k] ? 1 : 0;
      else out[k] = convTexto_(req.textos[k], 8000, 'Texto ' + k);
    });
    const json = JSON.stringify(out);
    if (json.length > 45000) throw new Error('Textos grandes demais.');
    txt = { id: tipo + '|' + ano + '|' + mes, tipo: tipo, ano: ano, mes: mes, textos: json, usuario: admin, atualizadoEm: agora };
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (txt) convGravar_('RelGdvTextos', txt);
    return { ok: true, ano: ano, gravados: 0, usuario: admin, atualizadoEm: agora,
             textos: txt ? { id: txt.id, tipo: txt.tipo, ano: ano, mes: txt.mes, textos: JSON.parse(txt.textos), usuario: admin, atualizadoEm: agora } : null };
  } finally { lock.releaseLock(); }
}

/** Contagens dos lançamentos do relatório: inteiras (só a área controlada, em ha, e a quantidade das tabelas aceitam decimais). */
function relGdvInteiro_(chave) { return chave !== 'pce.areaControlada'; }

/**
 * Portal do Administrativo → linhas manuais do Relatório GDV: lançamentos por mês e linha ({mes, chave, valor} ou {mes, chave, lista}).
 * Valor vazio = linha sem lançamento. Valida mês, chave, números ≥ 0, contagens inteiras, textos com limite e sem CPF; só regrava linha
 * que mudou (quem/quando e o histórico só mudam quando o valor muda). O VIGIFITO tem lançamento próprio por posto (admVigLancar).
 */
function relGdvLancar_(s, req) {
  const ano = anoRelGdv_(req.ano), agora = Date.now();
  const lancs = Array.isArray(req.lancamentos) ? req.lancamentos : [];
  if (!lancs.length) throw new Error('Nada a gravar.');
  if (lancs.length > 3000) throw new Error('Lançamentos demais numa vez.');
  const linhas = lancs.map(function (l) {
    if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
    const mes = mesRelGdv_(l.mes), chave = String(l.chave || '');
    const o = { id: ano + '|' + mes + '|' + chave, ano: ano, mes: mes, chave: chave, valor: '', lista: '', usuario: s.nome, atualizadoEm: agora, admId: s.admId };
    if (RELGDV_TABS[chave]) {
      const campos = RELGDV_TABS[chave], lista = Array.isArray(l.lista) ? l.lista : [];
      if (lista.length > 200) throw new Error('Tabela com linhas demais (máx. 200 por mês).');
      const ok = lista.map(function (x) {
        const y = {};
        campos.forEach(function (c) {
          if (RELGDV_NUM_TAB.indexOf(c) >= 0) {
            const n = x && x[c] !== '' && x[c] !== null && x[c] !== undefined ? convNumero_(x[c], c) : null;
            if (n !== null && (n < 0 || n > 1e9)) throw new Error(c + ' inválido (use números de 0 em diante).');
            if (n !== null && c !== 'quantidade' && Math.round(n) !== n) throw new Error(c + ': contagem com decimal (use número inteiro).');
            y[c] = n;
          }
          else y[c] = convTexto_(x && x[c], c === 'descricao' ? 1000 : 200, c);
        });
        return y;
      }).filter(function (y) { return campos.some(function (c) { return y[c] !== null && y[c] !== ''; }); });
      o.lista = lista.length || ok.length ? JSON.stringify(ok) : '';
    } else {
      if (!RELGDV_RE_CHAVE.test(chave)) throw new Error('Linha do relatório inválida: ' + chave + '.');
      if (/^vig\./.test(chave)) throw new Error('VIGIFITO: lance os valores por posto (aba VIGIFITO do portal).');
      const v = l.valor === '' || l.valor === null || l.valor === undefined ? '' : convNumero_(l.valor, 'Valor de ' + chave);
      if (v !== '' && (v < 0 || v > 1e9)) throw new Error('Valor de ' + chave + ' inválido (use números de 0 em diante).');
      if (v !== '' && relGdvInteiro_(chave) && Math.round(v) !== v) throw new Error('Valor de ' + chave + ': contagem com decimal (use número inteiro).');
      o.valor = v === '' ? '' : Math.round(v * 1000) / 1000;
    }
    return o;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let gravados = 0;
    const hist = [];
    const t = lerTudo_('RelGdvLancamentos'), cols = t.cols, idx = {}, iV = cols.indexOf('valor'), iL = cols.indexOf('lista'), novas = [];
    t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });
    linhas.forEach(function (o) {
      const i = idx[o.id], linha = cols.map(function (c) { return o[c]; });
      if (i === undefined) { if (o.valor === '' && !o.lista) return; idx[o.id] = -1; novas.push(linha); gravados++; hist.push([o.id, '', o.lista || o.valor]); return; }
      if (i < 0) return;
      if (String(t.valores[i][iV]) === String(o.valor) && String(t.valores[i][iL]) === String(o.lista)) return;   // sem mudança: não troca quem/quando
      hist.push([o.id, t.valores[i][iL] || t.valores[i][iV], o.lista || o.valor]);
      t.sh.getRange(i + 2, 1, 1, cols.length).setValues([linha]); gravados++;
    });
    if (novas.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
    admHistLote_(s, 'gravar', 'RelGdvLancamentos', hist);
    return { ok: true, ano: ano, gravados: gravados, usuario: s.nome, atualizadoEm: agora };
  } finally { lock.releaseLock(); }
}

/** Grupos de pragas pedidos pelo painel (CONFIG.RELGDV.grupos), validados: [{id, colunas:[{rotulo, termos normalizados}]}]. */
function relGdvGrupos_(g) {
  if (!Array.isArray(g) || g.length > 20) throw new Error('Grupos de pragas inválidos.');
  return g.map(function (x) {
    if (!x || !/^[a-z0-9_-]{1,30}$/.test(String(x.id || ''))) throw new Error('Grupo de pragas inválido.');
    if (!Array.isArray(x.colunas) || !x.colunas.length || x.colunas.length > 10) throw new Error('Colunas do grupo ' + x.id + ' inválidas.');
    return { id: x.id, colunas: x.colunas.map(function (c) {
      const t = (Array.isArray(c && c.pragas) ? c.pragas : []).slice(0, 12).map(function (p) { return normPub_(String(p).slice(0, 80)); }).filter(Boolean);
      if (!t.length) throw new Error('Coluna sem praga no grupo ' + x.id + '.');
      return { rotulo: textoCurto_(c.rotulo, 80), termos: t };
    }) };
  });
}
/** Quantidade → toneladas (kg ÷ 1000; t/ton × 1); outra unidade (caixas, sacos…) → null (não se inventa conversão). */
function toneladas_(q, u) {
  const n = normPub_(u).replace(/ /g, '');
  if (['kg', 'kgs', 'quilo', 'quilos', 'quilograma', 'quilogramas'].indexOf(n) >= 0) return q / 1000;
  if (['t', 'ton', 'tons', 'tonelada', 'toneladas'].indexOf(n) >= 0) return q;
  return null;
}

function painelRelGdvApuracao(token, req) {
  adminDoToken_(token);
  const de = String(req.de || ''), ate = String(req.ate || '');
  if (!diaValido_(de) || !diaValido_(ate) || de > ate) throw new Error('Período inválido.');
  if (somarDias_(de, 366) < ate) throw new Error('Período longo demais (até um ano).');
  return relGdvApurar_(de, ate, relGdvGrupos_(req.grupos || []));
}

/**
 * Apuração do Relatório GDV no intervalo [de, ate]: quadro PCE por mês (e o total do intervalo, com propriedades e área por
 * propriedades DISTINTAS), tabelas por grupo de pragas e município, resultados de laboratório por praga, VIGIFITO por mês
 * (BVAs fixas × volantes) e o anexo por propriedade (dados pessoais mascarados). Nada de nome, CPF completo ou coordenada exata.
 */
function relGdvApurar_(de, ate, grupos) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const mesDe = function (d) { return String(d).slice(0, 7); };
  const meses = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7) && meses.length < 14; ) {
    meses.push(m);
    const a = Number(m.slice(0, 4)), b = Number(m.slice(5, 7));
    m = b === 12 ? (a + 1) + '-01' : a + '-' + String(b + 1).padStart(2, '0');
  }
  const diaMs = function (ms) { ms = Number(ms) || 0; return ms > 0 ? new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10) : ''; };
  const nomeMun = {}, munK = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  const mun = function (s) { const k = munK(s); if (!k) return ''; if (!nomeMun[k]) nomeMun[k] = String(s).trim(); return k; };
  const round = function (v, c) { const f = Math.pow(10, c); return Math.round(v * f) / f; };
  // praga → grupo/coluna: casa por "contém"; vale o termo mais longo
  const termos = [], cache = {};
  grupos.forEach(function (g, gi) { g.colunas.forEach(function (c, ci) { c.termos.forEach(function (t) { termos.push({ t: t, gi: gi, ci: ci }); }); }); });
  const classif = function (praga) {
    const n = normPub_(praga); if (!n) return null;
    if (n in cache) return cache[n];
    let best = null; termos.forEach(function (x) { if (n.indexOf(x.t) >= 0 && (!best || x.t.length > best.t.length)) best = x; });
    return (cache[n] = best);
  };
  const RES_TXT = { detectada: 'detectada', suspeita: 'suspeita', nao_detectada: 'não detectada' };

  // propriedades: data de cadastro = a menor entre a criação na aba Propriedades e o primeiro levantamento (todo o histórico)
  const propCriado = {}; lerLeitura_('Propriedades').forEach(function (p) { if (p.id) propCriado[p.id] = diaMs(p.criadoEm); });
  const levTodos = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1; });
  const chaveProp = function (r) { return propIdGdv_(r.codigoPropriedade, r.doc, r.propriedade) || 'lev:' + r.id; };
  const primeiroLev = {}, levPorId = {};
  levTodos.forEach(function (r) { levPorId[r.id] = r; const k = chaveProp(r); if (r.data && (!primeiroLev[k] || r.data < primeiroLev[k])) primeiroLev[k] = r.data; });
  const cadastroDe = function (k) { const a = propCriado[k] || '', b = primeiroLev[k] || ''; return a && b ? (a < b ? a : b) : (a || b); };

  const z = function () { return { props: {}, novas: {}, levs: 0, porCol: {}, outras: 0, area: {}, fisc: 0, educ: 0, upuc: {}, colheitas: 0, amostras: 0 }; };
  const PM = {}, TOT = z();
  meses.forEach(function (m) { PM[m] = z(); });
  const ehUpUc = function (s) { const n = normPub_(s); return n.indexOf('unidade de producao') >= 0 || n.indexOf('unidade de consolidacao') >= 0 || /(^| )(up|uc)( |$)/.test(n); };
  const G = grupos.map(function () { return { mun: {}, anexo: [], levs: 0, props: {}, viveiros: {} }; });
  const munsLev = {}, porTipoLocal = {}, porOrigem = {};
  let nLev = 0, deteccoes = 0, suspeitas = 0;
  levTodos.forEach(function (r) {
    if (!noPer(r.data)) return;
    const m = mesDe(r.data), pm = PM[m]; if (!pm) return;
    nLev++;
    const k = chaveProp(r), mk = mun(r.municipio);
    if (mk) munsLev[mk] = true;
    const pr = pragasLev_(r), porCult = {};
    pr.forEach(function (g) { g.culturas.forEach(function (c) { porCult[c.cultura] = Math.max(porCult[c.cultura] || 0, c.area || 0); }); });
    [pm, TOT].forEach(function (x) {
      x.props[k] = true; x.levs++;
      const a = x.area[k] = x.area[k] || {};
      Object.keys(porCult).forEach(function (cu) { a[cu] = Math.max(a[cu] || 0, porCult[cu]); });
    });
    const cad = cadastroDe(k);
    if (cad && mesDe(cad) === m) pm.novas[k] = true;
    if (cad && cad >= de && cad <= ate) TOT.novas[k] = true;
    const tl = String(r.tipoLocal || '').trim(), ov = String(r.origemVisita || '').trim();
    porTipoLocal[tl || 'Não informado'] = (porTipoLocal[tl || 'Não informado'] || 0) + 1;
    porOrigem[ov || 'Não informada'] = (porOrigem[ov || 'Não informada'] || 0) + 1;
    if (tl && ehUpUc(tl)) [pm, TOT].forEach(function (x) { x.upuc[k + '|' + r.data] = true; });
    const colVistas = {}, porGrupo = {};
    let outras = false;
    pr.forEach(function (g) {
      g.culturas.forEach(function (c) { if (c.resultado !== 'nao_detectada') { deteccoes++; if (c.resultado === 'suspeita') suspeitas++; } });
      const cl = classif(g.praga);
      if (!cl) { if (g.praga) outras = true; return; }
      colVistas[cl.gi + ':' + cl.ci] = true;
      (porGrupo[cl.gi] = porGrupo[cl.gi] || []).push({ ci: cl.ci, g: g });
    });
    Object.keys(colVistas).forEach(function (c) { [pm, TOT].forEach(function (x) { x.porCol[c] = (x.porCol[c] || 0) + 1; }); });
    if (outras) [pm, TOT].forEach(function (x) { x.outras++; });
    Object.keys(porGrupo).forEach(function (gi) {
      const GG = G[gi], nc = grupos[gi].colunas.length;
      const M = GG.mun[mk || '?'] = GG.mun[mk || '?'] || { props: {}, levs: 0, det: grupos[gi].colunas.map(function () { return {}; }), susp: grupos[gi].colunas.map(function () { return {}; }), suspeitas: {}, amostras: 0 };
      M.props[k] = true; M.levs++; GG.levs++; GG.props[k] = true;
      if (normPub_(tl) === 'viveiro') GG.viveiros[k] = true;
      const culturas = [], res = [];
      porGrupo[gi].forEach(function (x) {
        x.g.culturas.forEach(function (c) {
          if (culturas.indexOf(c.cultura) < 0) culturas.push(c.cultura);
          if (c.resultado === 'detectada') M.det[x.ci][k] = true;
          if (c.resultado === 'suspeita') { M.susp[x.ci][k] = true; M.suspeitas[k] = true; }
          if (c.coleta === 'Sim') M.amostras++;
        });
        const pior = x.g.culturas.some(function (c) { return c.resultado === 'detectada'; }) ? 'detectada' : x.g.culturas.some(function (c) { return c.resultado === 'suspeita'; }) ? 'suspeita' : 'nao_detectada';
        res.push(x.g.praga + ': ' + RES_TXT[pior]);
      });
      void nc;
      const la = numOuNulo_(r.lat), lo = numOuNulo_(r.lon);
      GG.anexo.push({ municipio: nomeMun[mk] || String(r.municipio || ''), propriedade: textoCurto_(r.propriedade, 120), produtor: iniciaisRelGdv_(r.nome),
                      doc: mascararDoc_(r.doc), data: r.data, culturas: culturas.join(', '), resultado: res.join('; '), tipoLocal: tl,
                      lat: la === null ? null : round(la, 2), lon: lo === null ? null : round(lo, 2) });
    });
  });

  // Termos de Fiscalização do PCE: termos, educação sanitária e fiscalização de UP/UC (visitas distintas: propriedade + data)
  lerLeitura_('TermosPCE').forEach(function (t) {
    if (!t.id || t.excluido === 1 || t.cancelado === 1 || !noPer(t.data)) return;
    const pm = PM[mesDe(t.data)]; if (!pm) return;
    const acoes = lerJSONSeguro_(t.acoes, []), tl = lerJSONSeguro_(t.tipoLocal, []);
    const k = String(t.propriedadeId || '').trim() || (digitos_(t.doc) ? digitos_(t.doc) + '|' + normPub_(t.nome) : 'termo:' + t.id);
    [pm, TOT].forEach(function (x) {
      x.fisc++;
      if ((Array.isArray(acoes) ? acoes : []).some(function (a) { return normPub_(a) === 'educacao sanitaria'; })) x.educ++;
      if ((Array.isArray(tl) ? tl : []).some(ehUpUc)) x.upuc[k + '|' + t.data] = true;
    });
  });

  // Termos de Colheita: termos (data do termo), amostras enviadas (data de envio) e resultados por praga
  const LAB = {}, positivos = [], hoje = hojeManaus_();
  let semResultado30 = 0, semResultado = 0;
  lerLeitura_('Colheitas').forEach(function (c) {
    if (!c.id || c.excluido === 1 || c.cancelado === 1) return;
    const lab = labObjeto_(c.laboratorio), q = quantidade_(c.quantidade) || 1;
    if (noPer(c.data) && PM[mesDe(c.data)]) {
      [PM[mesDe(c.data)], TOT].forEach(function (x) { x.colheitas++; });
      const praga = pragaDoTermo_(c, levPorId) || 'Não informada';
      const L = LAB[praga] = LAB[praga] || { praga: praga, termos: 0, amostras: 0, enviadas: 0, aguardando: 0, negativo: 0, positivo: 0, inconclusivo: 0, inviavel: 0 };
      const res = lab ? lab.resultado : 'aguardando';
      L.termos++; L.amostras += q; L[res]++;
      if (lab && (lab.envio || lab.laboratorio)) L.enviadas += q;
      if (res === 'positivo') positivos.push({ praga: (lab && lab.praga) || praga, municipio: String(c.municipio || ''), data: (lab && lab.dataResultado) || c.data });
      if (res === 'aguardando') { semResultado++; if (somarDias_((lab && lab.envio) || c.data, 30) < hoje) semResultado30++; }
    }
    const env = lab ? (lab.envio || (lab.laboratorio ? c.data : '')) : '';
    if (env && noPer(env) && PM[mesDe(env)]) [PM[mesDe(env)], TOT].forEach(function (x) { x.amostras += q; });
  });

  const fechar = function (x) {
    const props = Object.keys(x.props), novas = Object.keys(x.novas).filter(function (k) { return x.props[k]; }).length;
    const area = props.reduce(function (s, k) { const a = x.area[k] || {}; return s + Object.keys(a).reduce(function (t, cu) { return t + a[cu]; }, 0); }, 0);
    return { propVisitadas: props.length, propNovas: novas, propAntigas: props.length - novas, inspecoes: x.levs, porCol: x.porCol, outras: x.outras,
             area: round(area, 2), termosFisc: x.fisc, educacao: x.educ, upuc: Object.keys(x.upuc).length, colheitas: x.colheitas, amostras: x.amostras };
  };
  const porMes = {}; meses.forEach(function (m) { porMes[m] = fechar(PM[m]); });

  // VIGIFITO: a soma dos postos do VIGIFITO por tipo (BVAs fixas × volantes), do mesmo motor (vigApurar_ → motorBarreira_): o bloco do
  // Relatório GDV/consolidado nunca diverge do relatório VIGIFITO. Postos não mapeados entram em "outras" do mesmo tipo.
  const V = { fixa: {}, volante: {} };
  meses.forEach(function (m) { V.fixa[m] = vigZero_(); V.volante[m] = vigZero_(); });
  const VA = vigApurar_(vigConfig_(), de, ate), tipoP = {};
  VA.postos.forEach(function (p) { tipoP[p.id] = p.tipo; });
  Object.keys(VA.porMes).forEach(function (pid) {
    Object.keys(VA.porMes[pid]).forEach(function (m) {
      const x = V[tipoP[pid] || 'fixa'][m], y = VA.porMes[pid][m]; if (!x) return;
      Object.keys(y).forEach(function (k) {
        if (k === 'outrasUnidades') Object.keys(y[k]).forEach(function (pr) { const o = x[k][pr] = x[k][pr] || {}; Object.keys(y[k][pr]).forEach(function (u) { o[u] = (o[u] || 0) + y[k][pr][u]; }); });
        else x[k] += y[k];
      });
    });
  });
  ['fixa', 'volante'].forEach(function (b) { meses.forEach(function (m) { const x = V[b][m]; x.liberacaoT = round(x.liberacaoT, 3); x.apreensaoT = round(x.apreensaoT, 3); }); });

  const gruposOut = grupos.map(function (g, gi) {
    const GG = G[gi];
    const municipios = Object.keys(GG.mun).map(function (k) {
      const M = GG.mun[k];
      return { municipio: k === '?' ? 'Não informado' : nomeMun[k], propriedades: Object.keys(M.props).length, levantamentos: M.levs,
               det: M.det.map(function (o) { return Object.keys(o).length; }), susp: M.susp.map(function (o) { return Object.keys(o).length; }),
               suspeitas: Object.keys(M.suspeitas).length, amostras: M.amostras };
    }).sort(function (a, b) { return a.municipio.localeCompare(b.municipio); });
    return { id: g.id, municipios: municipios, levantamentos: GG.levs, propriedades: Object.keys(GG.props).length, viveiros: Object.keys(GG.viveiros).length,
             anexo: GG.anexo.sort(function (a, b) { return a.municipio.localeCompare(b.municipio) || String(a.data).localeCompare(String(b.data)); }) };
  });
  return { ok: true, de: de, ate: ate, apuradoEm: Date.now(), meses: meses,
           resumo: { municipiosLevantados: Object.keys(munsLev).length, municipios: Object.keys(munsLev).map(function (k) { return nomeMun[k]; }).sort(),
                     levantamentos: nLev, deteccoes: deteccoes, suspeitas: suspeitas, porTipoLocal: porTipoLocal, porOrigem: porOrigem },
           quadro: { porMes: porMes, total: fechar(TOT) }, grupos: gruposOut,
           laboratorio: { porPraga: Object.keys(LAB).sort().map(function (k) { return LAB[k]; }), positivos: positivos, semResultado: semResultado, semResultado30: semResultado30 },
           vigifito: V };
}
