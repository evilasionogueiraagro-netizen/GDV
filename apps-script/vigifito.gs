/* ---------- VIGIFITO (relatório por posto; postos e escala configuráveis; valores manuais lançados no portal) ---------- */
const VIG_IND = {   // indicador → [unidade, fonte] (rótulos e ordem no navegador: documentos/indicadores.js)
  veiculos: ['nº', 'auto'], documentos: ['nº', 'auto'], partidas: ['nº', 'auto'], inspecaoFito: ['nº', 'auto'], cargasEstados: ['nº', 'auto'],
  internN: ['nº', 'auto'], internT: ['t', 'auto'], coleta: ['nº', 'auto'], amostras: ['nº', 'auto'], educacao: ['nº', 'auto'], medidaFito: ['nº', 'auto'],
  abordagem: ['nº', 'auto'], capacitacao: ['nº', 'manual'], exportT: ['t', 'auto'], madeira: ['m3', 'manual'], importT: ['t', 'auto'],
  tfs: ['nº', 'auto'], inspecao: ['nº', 'auto'], advertencia: ['nº', 'auto'], rechaco: ['nº', 'auto'], fiel: ['nº', 'auto'], liberacao: ['nº', 'auto'],
  liberacaoT: ['t', 'auto'], infracao: ['nº', 'auto'], apreensao: ['nº', 'auto'], apreensaoT: ['t', 'auto'], autoDestN: ['nº', 'auto'], autoDestT: ['t', 'auto']
};
const VIG_OUTRAS = { fixa: { id: '_outras-fixas', nome: 'OUTRAS BVA FIXAS (não mapeadas)', municipio: '', tipo: 'fixa' },
                     volante: { id: '_outras-volantes', nome: 'OUTRAS AÇÕES VOLANTES (não mapeadas)', municipio: '', tipo: 'volante' } };
const VIG_RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/, VIG_RE_PER = /^P\d{4}-\d{2}-\d{2}$/;
/** Semente: os 11 postos da planilha de controle VIGIFITO 2025 + a BVA - CEASA e a escala de 10 dias do Jundiá (05/01/2025, ciclo de 9 dias). */
function vigSemente_() {
  const P = function (id, nome, municipio, tipo, locais) { return { id: id, nome: nome, municipio: municipio, tipo: tipo, locais: locais || [] }; };
  return { ancora: '2025-01-05', ciclo: 9, versao: 0, atualizadoEm: 0, atualizadoPor: '', postos: [
    P('pf-jundia', 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ', 'Presidente Figueiredo', 'fixa', ['BVA - JUNDIÁ']),
    P('pf-volante', 'PRESIDENTE FIGUEIREDO - VOLANTE', 'Presidente Figueiredo', 'volante'),
    P('manaus-aeroporto', 'MANAUS - BVA AEROPORTO', 'Manaus', 'fixa', ['BVA - AEROPORTO']),
    VIG_CEASA_(),
    P('manaus-volante', 'MANAUS - VOLANTE', 'Manaus', 'volante'),
    P('parintins-porto', 'PARINTINS - BVA PORTO', 'Parintins', 'fixa', ['BVA - PARINTINS', 'BVA - PORTO DE PARINTINS']),
    P('parintins-volante', 'PARINTINS - BVA VOLANTE', 'Parintins', 'volante'),
    P('humaita-fixa', 'HUMAITÁ - BVA FIXA', 'Humaitá', 'fixa', ['BVA - HUMAITÁ']),
    P('iranduba-volante', 'IRANDUBA - BVA VOLANTE', 'Iranduba', 'volante'),
    P('guajara-volante', 'GUAJARÁ - BVA VOLANTE', 'Guajará', 'volante'),
    P('tabatinga-volante', 'TABATINGA - BVA VOLANTE (PORTO)', 'Tabatinga', 'volante'),
    P('benjamin-volante', 'BENJAMIN CONSTANT - BVA VOLANTE (PORTO)', 'Benjamin Constant', 'volante')] };
}
function vigConfig_() {
  const r = lerLeitura_('VigConfig').filter(function (x) { return x.id === 'vigifito'; })[0];
  const c = r ? lerJSONSeguro_(r.config, null) : null;
  if (!(c && Array.isArray(c.postos) && c.postos.length)) return vigSemente_();
  // lista salva antes de existir o posto da BVA - CEASA: entra depois do último posto de Manaus; se a CEASA estava dentro de outro posto
  // (ex.: no do Aeroporto), sai dele para a coluna própria. Salvar a lista no painel grava a escolha (ceasa: 1).
  const ceasa = normPub_('BVA - CEASA'), eCeasa = function (l) { return normPub_(localCanon_(l)) === ceasa; };
  if (!c.ceasa && !c.postos.some(function (p) { return /ceasa/.test(normPub_(p.nome)) && (p.locais || []).some(eCeasa); })) {
    c.postos.forEach(function (p) { if (p.tipo === 'fixa') p.locais = (p.locais || []).filter(function (l) { return !eCeasa(l); }); });
    let i = -1; c.postos.forEach(function (p, j) { if (normPub_(p.municipio) === 'manaus') i = j; });
    c.postos.splice(i < 0 ? c.postos.length : i + 1, 0, VIG_CEASA_());
  }
  return c;
}
function VIG_CEASA_() { return { id: 'manaus-ceasa', nome: 'MANAUS - BVA CEASA', municipio: 'Manaus', tipo: 'fixa', locais: ['BVA - CEASA'] }; }
/** Início (AAAA-MM-DD) do período de 10 dias da escala que contém o dia: âncora + k × ciclo (o dia da troca abre o período seguinte). */
function vigPeriodo_(cfg, dia) {
  const d0 = Date.UTC(+cfg.ancora.slice(0, 4), +cfg.ancora.slice(5, 7) - 1, +cfg.ancora.slice(8, 10)), d = Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
  const k = Math.floor(Math.round((d - d0) / 864e5) / cfg.ciclo);
  return somarDias_(cfg.ancora, k * cfg.ciclo);
}
const vigZero_ = function () {
  return { turnos: 0, abordagem: 0, veiculos: 0, pessoas: 0, tfs: 0, documentos: 0, inspecao: 0, advertencia: 0, rechaco: 0, fiel: 0, liberacao: 0, liberacaoT: 0,
           apreensao: 0, apreensaoT: 0, infracao: 0, coleta: 0, amostras: 0, outrasUnidades: {},
           educacao: 0, medidaFito: 0, partidas: 0, inspecaoFito: 0, cargasEstados: 0, internN: 0, internT: 0, importT: 0, exportT: 0, autoDestN: 0, autoDestT: 0 };
};
/**
 * Apuração automática do VIGIFITO por posto, por mês (AAAA-MM) e por período de 10 dias (início AAAA-MM-DD), no intervalo [de, ate].
 * Turno → posto: fixa = local (ou unidade) do turno igual a um dos "locais" do posto (nomes de BVA de CONFIG.bvas/Barreiras); volante =
 * município do turno (unidade, ou o nome do município no local) igual ao do posto. Sem posto: "OUTRAS BVA FIXAS/AÇÕES VOLANTES (não
 * mapeadas)", listadas em naoMapeados (aviso no relatório). TF sem turno: pelo local do TF entre os locais das BVAs fixas.
 */
function vigApurar_(cfg, de, ate) {
  const M = motorBarreira_(de, ate);
  const munN = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  const fixas = cfg.postos.filter(function (p) { return p.tipo === 'fixa'; }), vols = cfg.postos.filter(function (p) { return p.tipo === 'volante'; });
  const fixaDe = function (local, unidade) {
    // apelidos da mesma BVA (localCanon_) valem dos dois lados: posto configurado com "Barreira Porto da CEASA" pega os turnos "BVA - CEASA"
    const alvos = [normPub_(local), normPub_(localCanon_(local)), normPub_(unidade)].filter(Boolean);
    for (let i = 0; i < fixas.length; i++) if ((fixas[i].locais || []).some(function (l) { return [normPub_(l), normPub_(localCanon_(l))].some(function (n) { return n && alvos.indexOf(n) >= 0; }); })) return fixas[i].id;
    return null;
  };
  const volanteDe = function (t) {
    const u = munN(t.unidade), l = ' ' + normPub_(t.local) + ' ';
    for (let i = 0; i < vols.length; i++) { const m = munN(vols[i].municipio); if (m && (u === m || l.indexOf(' ' + m + ' ') >= 0)) return vols[i].id; }
    return null;
  };
  const porMes = {}, porPeriodo = {}, postoTurno = {}, nao = {};
  const celulas = function (pid, data) {
    const mes = data.slice(0, 7), per = vigPeriodo_(cfg, data);
    const a = porMes[pid] = porMes[pid] || {}, b = porPeriodo[pid] = porPeriodo[pid] || {};
    return [a[mes] = a[mes] || vigZero_(), b[per] = b[per] || vigZero_()];
  };
  M.turnos.forEach(function (t) {
    let pid = t.tipo === 'fixa' ? fixaDe(t.local, t.unidade) : volanteDe(t);
    if (!pid) {
      pid = VIG_OUTRAS[t.tipo].id;
      const k = t.tipo + '|' + String(t.local || '').trim() + '|' + String(t.unidade || '').trim();
      const n = nao[k] = nao[k] || { tipo: t.tipo, local: String(t.local || '').trim(), unidade: String(t.unidade || '').trim(), turnos: 0, veiculos: 0 };
      n.turnos++; n.veiculos += t.veiculos;
    }
    postoTurno[t.id] = pid;
    celulas(pid, t.data).forEach(function (x) {
      x.turnos++; if (t.tipo === 'volante') x.abordagem++; x.veiculos += t.veiculos; x.pessoas += t.pessoas;
      x.educacao += t.educacao; x.internN += t.internN; x.cargasEstados += t.cargasEstados;   // veículos sem TF ligado (motorBarreira_)
      const p = t.papel; if (!p) return;                                      // partidas do relatório de plantão do papel
      x.partidas += p.partidas; x.medidaFito += p.partidas; x.tfs += p.tfs; x.documentos += p.documentos;
      x.liberacao += p.liberacao; x.liberacaoT += p.liberacaoT; x.apreensao += p.apreensao; x.apreensaoT += p.apreensaoT;
      x.autoDestN += p.apreensao; x.autoDestT += p.apreensaoT; x.internT += p.internT; x.importT += p.internT; x.exportT += p.exportT;
      Object.keys(p.outras).forEach(function (g) { const o = x.outrasUnidades[g] = x.outrasUnidades[g] || {}; Object.keys(p.outras[g]).forEach(function (u) { o[u] = (o[u] || 0) + p.outras[g][u]; }); });
    });
  });
  const cadB = {}; lerLeitura_('Barreiras').forEach(function (b) { if (b.id) cadB[b.id] = b; });
  M.tfs.forEach(function (f) {
    let pid = f.turnoId ? postoTurno[f.turnoId] : null;
    if (!pid && !f.turnoId) { const c = cadB[f.barreira] || {}; pid = fixaDe(f.local, '') || fixaDe(c.nome, c.local) || VIG_OUTRAS.fixa.id; }
    if (!pid) pid = VIG_OUTRAS[f.tipo].id;
    celulas(pid, f.data).forEach(function (x) {
      x.tfs++; x.medidaFito++; x.partidas++;                                  // cada TF de barreira = medida fitossanitária e partida fiscalizada
      if (f.documentos) x.documentos++;                                       // exame de documentos: TF com NF/PTV/GTA/… preenchido
      if (f.inspecao) x.inspecaoFito++;                                       // inspeção fitossanitária = "Inspeção" do TF (16.1)
      if (f.sentido === 'intern') { x.internN++; x.internT += f.cargaT; x.importT += f.cargaT; }
      else if (f.sentido === 'estados') { x.cargasEstados++; x.exportT += f.cargaT; }
      if (f.sentido) Object.keys(f.outrasCarga).forEach(function (u) { const o = x.outrasUnidades.carga = x.outrasUnidades.carga || {}; o[u] = (o[u] || 0) + f.outrasCarga[u]; });
      if (f.inspecao) x.inspecao++; if (f.advertencia) x.advertencia++; if (f.fiel) x.fiel++; if (f.auto) x.infracao++;
      if (f.procedimento === 'apreensao') { x.autoDestN++; x.autoDestT += f.apreensaoT; }      // no e-GDV a apreensão é a apreensão para destruição
      if (f.coleta) { x.coleta++; x.amostras += f.amostras; }
      if (f.procedimento === 'rechaco') x.rechaco++;
      if (f.procedimento === 'liberacao' || f.procedimento === 'apreensao') {
        x[f.procedimento]++; x[f.procedimento + 'T'] += f[f.procedimento + 'T'];
        Object.keys(f.outras).forEach(function (u) { const o = x.outrasUnidades[f.procedimento] = x.outrasUnidades[f.procedimento] || {}; o[u] = (o[u] || 0) + f.outras[u]; });
      }
    });
  });
  const arred = function (G) { Object.keys(G).forEach(function (p) { Object.keys(G[p]).forEach(function (k) { const x = G[p][k];
    ['liberacaoT', 'apreensaoT', 'internT', 'importT', 'exportT', 'autoDestT'].forEach(function (c) { x[c] = Math.round(x[c] * 1000) / 1000; }); }); }); };
  arred(porMes); arred(porPeriodo);
  const postos = cfg.postos.map(function (p) { return { id: p.id, nome: p.nome, municipio: p.municipio, tipo: p.tipo }; });
  ['fixa', 'volante'].forEach(function (t) { if (porMes[VIG_OUTRAS[t].id]) postos.push(VIG_OUTRAS[t]); });
  return { ok: true, de: de, ate: ate, apuradoEm: Date.now(), ancora: cfg.ancora, ciclo: cfg.ciclo, postos: postos, porMes: porMes, porPeriodo: porPeriodo,
           naoMapeados: Object.keys(nao).map(function (k) { return nao[k]; }) };
}
/** Intervalo de apuração do ano: 1º/jan até 31/dez ou até o fim do último período de 10 dias que começa no ano. */
function vigIntervaloAno_(cfg, ano) {
  const ult = vigPeriodo_(cfg, ano + '-12-31'), fimUlt = somarDias_(ult, cfg.ciclo - 1);
  return { de: ano + '-01-01', ate: fimUlt > ano + '-12-31' ? fimUlt : ano + '-12-31' };
}
function vigLancOut_(r) {
  return { periodo: r.periodo, posto: r.posto, indicador: r.indicador, valor: numOuNulo_(r.valor), substitui: r.substitui === 1 ? 1 : 0, justificativa: r.justificativa,
           origem: r.origem || 'manual', arquivo: r.arquivo || '', usuario: r.usuario, atualizadoEm: r.atualizadoEm };
}
/** Configuração, lançamentos e apuração do ano (o painel e o portal usam a mesma resposta). */
function vigDados_(ano) {
  ano = anoRelGdv_(ano);
  const cfg = vigConfig_(), iv = vigIntervaloAno_(cfg, ano), a1 = String(ano);
  const lanc = lerLeitura_('VigLancamentos').filter(function (r) {
    if (!r.id || r.excluido === 1) return false;
    return String(r.periodo).slice(0, 4) === a1 || String(r.periodo).slice(1, 5) === a1;
  }).map(vigLancOut_);
  return { ok: true, ano: ano, hoje: hojeManaus_(), cfg: cfg, indicadores: VIG_IND, lancamentos: lanc, apuracao: vigApurar_(cfg, iv.de, iv.ate) };
}
function painelVigDados(token, req) { adminDoToken_(token); return vigDados_(req.ano || hojeManaus_().slice(0, 4)); }
function admVigDados_(s, req) { return vigDados_(req.ano || hojeManaus_().slice(0, 4)); }

/** Valor de um indicador: número ≥ 0; contagens (nº) inteiras; t e m³ com até 3 casas (kg não: converta para t). */
function vigValor_(ind, v, rot) {
  const n = typeof v === 'number' ? v : numOuNulo_(v);
  if (n === null || !isFinite(n)) throw new Error(rot + ': valor não numérico.');
  if (n < 0) throw new Error(rot + ': valor negativo (use números de 0 em diante).');
  if (n > 1e8) throw new Error(rot + ': valor grande demais.');
  if (VIG_IND[ind][0] === 'nº' && Math.round(n) !== n) throw new Error(rot + ': contagem com decimal (use número inteiro).');
  if (VIG_IND[ind][0] !== 'nº' && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) throw new Error(rot + ': no máximo 3 casas decimais (' + VIG_IND[ind][0] + ').');
  return n;
}
/**
 * Grava valores do VIGIFITO (portal): [{periodo: 'AAAA-MM' | 'P<AAAA-MM-DD>', posto, indicador, valor ('' = apagar), substitui, justificativa}].
 * Linha manual: o valor do posto no período. Linha automática: só como SUBSTITUIÇÃO do apurado pelo e-GDV (substitui = 1) com
 * justificativa (meses anteriores ao e-GDV ou correção). Uma linha por célula (id = periodo|posto|indicador); só regrava o que mudou.
 * origem = 'manual' ou 'planilha' (importação da planilha de controle).
 */
function vigGravar_(s, itens, origem, arquivo) {
  const cfg = vigConfig_(), ids = {};
  cfg.postos.forEach(function (p) { ids[p.id] = p; });
  const agora = Date.now(), vistos = {};
  const linhas = itens.map(function (l, i) {
    const rot = 'Linha ' + (i + 1);
    if (!l || typeof l !== 'object') throw new Error(rot + ': lançamento inválido.');
    const per = String(l.periodo || ''), posto = String(l.posto || ''), ind = String(l.indicador || '');
    if (VIG_RE_MES.test(per)) { /* mês */ }
    else if (VIG_RE_PER.test(per)) { if (!diaValido_(per.slice(1)) || vigPeriodo_(cfg, per.slice(1)) !== per.slice(1)) throw new Error(rot + ': o período ' + per.slice(1) + ' não começa na escala de 10 dias (âncora ' + cfg.ancora + ', ciclo de ' + cfg.ciclo + ' dias).'); }
    else throw new Error(rot + ': período inválido (AAAA-MM ou P<data de início>).');
    if (!ids[posto]) throw new Error(rot + ': posto do VIGIFITO inexistente: ' + posto + '.');
    if (!VIG_IND[ind]) throw new Error(rot + ': indicador inexistente: ' + ind + '.');
    const id = per + '|' + posto + '|' + ind;
    if (vistos[id]) throw new Error(rot + ': lançamento repetido no envio (' + id + ').');
    vistos[id] = 1;
    const ano = Number(per.charAt(0) === 'P' ? per.slice(1, 5) : per.slice(0, 4));
    const o = { id: id, ano: ano, periodo: per, posto: posto, indicador: ind, valor: '', substitui: 0, justificativa: '', origem: origem, arquivo: arquivo || '',
                usuario: s.nome, admId: s.admId, atualizadoEm: agora, excluido: 0 };
    const rotI = rot + ' (' + ids[posto].nome + ', ' + ind + ')';
    if (l.valor === '' || l.valor === null || l.valor === undefined) { o.excluido = 1; return o; }
    o.valor = vigValor_(ind, l.valor, rotI);
    if (VIG_IND[ind][1] === 'auto') {
      o.substitui = 1;
      o.justificativa = convTexto_(l.justificativa || (origem === 'planilha' ? 'Importado da planilha de controle VIGIFITO (' + (arquivo || 'arquivo') + ')' : ''), 300, rotI + ': justificativa');
      if (o.justificativa.length < 5) throw new Error(rotI + ': linha apurada pelo e-GDV — o valor manual SUBSTITUI o automático e exige justificativa.');
    } else o.justificativa = convTexto_(l.justificativa, 300, rotI + ': observação');
    return o;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('VigLancamentos'), cols = t.cols, idx = {}, novas = [], hist = [];
    t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });
    const res = { ok: true, novos: 0, atualizados: 0, iguais: 0, excluidos: 0 };
    linhas.forEach(function (o) {
      const i = idx[o.id], ant = i === undefined ? null : paraObjeto_(cols, t.valores[i]), vivo = ant && ant.excluido !== 1;
      if (o.excluido) {
        if (!vivo) return;
        ant.excluido = 1; ant.usuario = o.usuario; ant.admId = o.admId; ant.atualizadoEm = agora;
        t.sh.getRange(i + 2, 1, 1, cols.length).setValues([cols.map(function (c) { return ant[c]; })]);
        hist.push([o.id, ant.valor, '']); res.excluidos++; return;
      }
      if (vivo && numOuNulo_(ant.valor) === o.valor && ant.substitui === o.substitui && ant.justificativa === o.justificativa) { res.iguais++; return; }
      const linha = cols.map(function (c) { return o[c]; });
      if (i === undefined) { novas.push(linha); idx[o.id] = -1; res.novos++; }
      else if (i < 0) return;
      else { t.sh.getRange(i + 2, 1, 1, cols.length).setValues([linha]); res.atualizados++; }
      hist.push([o.id, vivo ? ant.valor : '', o.valor + (o.substitui ? ' (substitui o e-GDV: ' + o.justificativa + ')' : '')]);
    });
    if (novas.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
    admHistLote_(s, origem === 'planilha' ? 'importar' : 'gravar', 'VigLancamentos', origem === 'planilha'
      ? [['arquivo: ' + arquivo, '', { novos: res.novos, atualizados: res.atualizados, iguais: res.iguais }]] : hist);
    return res;
  } finally { lock.releaseLock(); }
}
function admVigLancar_(s, req) {
  const l = Array.isArray(req.lancamentos) ? req.lancamentos : [];
  if (!l.length) throw new Error('Nada a gravar.');
  if (l.length > 2000) throw new Error('No máximo 2.000 valores por envio.');
  return vigGravar_(s, l, 'manual', '');
}
/** Importação da planilha de controle VIGIFITO (lida no navegador; até 1.500 valores por chamada; idempotente pelo id da célula). */
function admVigImportar_(s, req) {
  const l = Array.isArray(req.itens) ? req.itens : [];
  if (!l.length) throw new Error('Nada a importar.');
  if (l.length > 1500) throw new Error('No máximo 1.500 valores por envio.');
  return vigGravar_(s, l, 'planilha', convTexto_(req.arquivo, 200, 'Arquivo'));
}
/** Painel: edita a lista de postos do VIGIFITO (correspondência posto → BVA/município do e-GDV, tipo) e a escala dos períodos de 10 dias. */
function painelVigConfigSalvar(token, req) {
  const admin = adminDoToken_(token, true), c = req && req.config;
  if (!c || typeof c !== 'object') throw new Error('Configuração inválida.');
  const ancora = String(c.ancora || ''), ciclo = Number(c.ciclo);
  if (!diaValido_(ancora)) throw new Error('Data-âncora da escala inválida (aaaa-mm-dd).');
  if (!(ciclo >= 1 && ciclo <= 31) || Math.round(ciclo) !== ciclo) throw new Error('Ciclo da escala: de 1 a 31 dias.');
  if (!Array.isArray(c.postos) || !c.postos.length || c.postos.length > 40) throw new Error('Postos: de 1 a 40.');
  const vistos = {};
  const postos = c.postos.map(function (p, i) {
    const id = String((p && p.id) || '').trim();
    if (!/^[a-z0-9-]{1,40}$/.test(id) || vistos[id]) throw new Error('Posto ' + (i + 1) + ': id inválido ou repetido (letras minúsculas, números e hífen).');
    vistos[id] = 1;
    const nome = convTexto_(p.nome, 80, 'Nome do posto'); if (!nome) throw new Error('Posto ' + id + ' sem nome.');
    if (p.tipo !== 'fixa' && p.tipo !== 'volante') throw new Error('Posto ' + id + ': tipo fixa ou volante.');
    const locais = (Array.isArray(p.locais) ? p.locais : String(p.locais || '').split(/[\n;]/)).map(function (x) { return convTexto_(x, 80, 'Local'); }).filter(Boolean).slice(0, 10);
    return { id: id, nome: nome, municipio: convTexto_(p.municipio, 60, 'Município'), tipo: p.tipo, locais: locais };
  });
  const atual = vigConfig_(), o = { ancora: ancora, ciclo: ciclo, postos: postos, ceasa: 1, versao: (Number(atual.versao) || 0) + 1, atualizadoEm: Date.now(), atualizadoPor: admin };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { convGravar_('VigConfig', { id: 'vigifito', config: JSON.stringify(o), atualizadoEm: o.atualizadoEm, atualizadoPor: admin }); }
  finally { lock.releaseLock(); }
  return { ok: true, config: o };
}

/* ---------- Relatório de plantão do papel (portal → VIGIFITO → "Importar relatório de plantão") ----------
 * O portal lê no navegador o "Relatório Diário de Trânsito Interestadual" da BVA (.xls; web/administrativo/js/plantao-planilha.js) e manda
 * os dias do plantão (veículos por tipo e educação sanitária do quadro 1/2) e a lista de cargas. O servidor grava como se o plantão
 * tivesse sido feito no app, na BVA do posto VIGIFITO escolhido: um turno por dia (início na troca do plantão, encerrado) e os veículos —
 * as cargas da lista (placa, tipo, hora, município/UF de origem e destino, transportador, carga, medida, nº do TF, documento) e, para
 * fechar a contagem por tipo do quadro 1, veículos sem placa. Educação sanitária do dia = pessoas (1 por veículo, das cargas para os
 * demais). Os números saem do motor (motorBarreira_): toda carga conta em veículos e na internalização; só a com nº do TF conta como
 * partida, medida fitossanitária e liberação/apreensão (ver o motor).
 * Carga com hora antes da troca pertence ao plantão do dia anterior (o turno atravessa a meia-noite, como no app).
 * id da importação = posto|1º dia: reimportar o mesmo plantão é recusado (jaImportado), a não ser com substituir = 1 — os veículos da
 * importação anterior ficam excluídos (excluido = 1) e entram os novos; os turnos (mesmos ids) são atualizados.
 */
const PLANTAO_TIPOS_ = ['PA', 'UT', 'CC', 'CB', 'ON', 'MT'];
const PLANTAO_MAX_CARGAS_ = 3000, PLANTAO_MAX_VEICULOS_ = 20000;
/** Texto do papel: espaços normalizados, limite de tamanho e sem virar fórmula na planilha. */
function plantaoTexto_(v, max) {
  const t = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
function plantaoInt_(v, max, rot) {
  const n = v === '' || v === null || v === undefined ? 0 : Number(v);
  if (!isFinite(n) || n < 0 || Math.round(n) !== n || n > max) throw new Error(rot + ': número inteiro de 0 a ' + max + '.');
  return n;
}
/** Valida o envio e monta turnos e veículos (sem gravar nada). */
function plantaoMontar_(cfg, req, s) {
  const posto = cfg.postos.filter(function (p) { return p.id === String(req.posto || '') && p.tipo === 'fixa'; })[0];
  if (!posto) throw new Error('Escolha um posto fixo (BVA) do VIGIFITO.');
  const local = String((posto.locais || [])[0] || '').trim();
  if (!local) throw new Error('O posto ' + posto.nome + ' não tem BVA ligada (painel → Relatórios → VIGIFITO → postos).');
  const troca = String(req.troca || '');
  if (!RE_HM_.test(troca)) throw new Error('Horário da troca do plantão inválido (HH:MM, ex.: 07:00).');
  const fiscal = plantaoTexto_(req.fiscal, 120) || 'Relatório de plantão (papel)', hoje = hojeManaus_();
  const dias = Array.isArray(req.dias) ? req.dias : [];
  if (!dias.length || dias.length > 31) throw new Error('O plantão precisa ter de 1 a 31 dias.');
  const D = {}, ordem = [];
  dias.forEach(function (d, i) {
    const data = String((d && d.data) || ''), rot = 'Dia ' + (i + 1);
    if (!diaValido_(data)) throw new Error(rot + ': data inválida.');
    if (data > hoje) throw new Error(rot + ': data no futuro (' + data + ').');
    if (D[data]) throw new Error(rot + ': dia repetido (' + data + ').');
    const tipos = {};
    PLANTAO_TIPOS_.forEach(function (k) { tipos[k] = plantaoInt_(d.tipos && d.tipos[k], 5000, rot + ', ' + k); });
    D[data] = { data: data, tipos: tipos, educacao: plantaoInt_(d.educacao, 20000, rot + ', educação sanitária'), cargas: [] };
    ordem.push(data);
  });
  ordem.sort();
  const cargas = Array.isArray(req.cargas) ? req.cargas : [];
  if (cargas.length > PLANTAO_MAX_CARGAS_) throw new Error('No máximo ' + PLANTAO_MAX_CARGAS_ + ' cargas por plantão.');
  cargas.forEach(function (c, i) {
    const rot = 'Carga ' + (i + 1);
    if (!c || typeof c !== 'object') throw new Error(rot + ': inválida.');
    const data = String(c.data || ''), hora = String(c.hora || '');
    if (!diaValido_(data)) throw new Error(rot + ': data inválida.');
    if (!RE_HM_.test(hora)) throw new Error(rot + ': hora inválida (HH:MM).');
    const dia = hora < troca ? somarDias_(data, -1) : data;        // antes da troca = plantão do dia anterior
    if (!D[dia]) throw new Error(rot + ' (' + data.split('-').reverse().join('/') + ' ' + hora + '): fora dos dias do plantão.');
    let tipo = String(c.tipo || '').trim().toUpperCase(); if (tipo === 'MO') tipo = 'MT';
    if (PLANTAO_TIPOS_.indexOf(tipo) < 0) throw new Error(rot + ': tipo de veículo inválido (' + (c.tipo || 'vazio') + ').');
    const medida = String(c.medida || '');
    if (medida !== 'liberacao' && medida !== 'apreensao') throw new Error(rot + ': medida liberacao ou apreensao.');
    let q = '';
    if (c.quantidade !== '' && c.quantidade !== null && c.quantidade !== undefined) {
      const n = Number(c.quantidade);
      if (!isFinite(n) || n < 0 || n > 1e6) throw new Error(rot + ': quantidade inválida.');
      q = String(Math.round(n * 1e6) / 1e6).replace('.', ',');     // vírgula decimal: "1,5" t nunca vira mil e quinhentos
    }
    const produto = plantaoTexto_(c.produto, 120), u = plantaoTexto_(c.unidade, 10);
    D[dia].cargas.push({ hora: hora, tipo: tipo, placa: plantaoTexto_(c.placa, 10).toUpperCase().replace(/[\s-]/g, ''),
      origemMun: plantaoTexto_(c.origemMun, 80), ufOrigem: ufNorm_(c.ufOrigem), destinoMun: plantaoTexto_(c.destinoMun, 80), ufDestino: ufNorm_(c.ufDestino),
      transportador: plantaoTexto_(c.transportador, 120), cargaPapel: produto || q ? JSON.stringify([{ p: produto || 'NÃO INFORMADO', q: q, u: u }]) : '',
      medidaPapel: medida, tfPapel: plantaoTexto_(c.tf, 30), docPapel: plantaoTexto_(c.documento, 120) });
  });
  const agora = Date.now(), base = 'pl' + agora.toString(36) + '-', imp = 'pl|' + posto.id + '|' + ordem[0];
  const turnos = [], veiculos = [], avisos = [], vazios = [];
  let seq = 0;
  const fimTurno = (Number(troca.slice(0, 2)) * 60 + Number(troca.slice(3)) + 1439) % 1440;
  const fim = ('0' + Math.floor(fimTurno / 60)).slice(-2) + ':' + ('0' + fimTurno % 60).slice(-2);   // 1 minuto antes da troca seguinte
  ordem.forEach(function (data) {
    const d = D[data], tid = 'pl-' + posto.id + '-' + data.replace(/-/g, '');
    // dia todo zerado (ex.: o dia da troca, que no papel fecha a coluna do 10º dia): não vira turno (seria uma ação vazia)
    if (!d.cargas.length && !d.educacao && PLANTAO_TIPOS_.every(function (k) { return !d.tipos[k]; })) { vazios.push(data); return; }
    turnos.push({ id: tid, numeroTF: '', data: data, letra: Number(troca.slice(0, 2)) >= 4 && Number(troca.slice(0, 2)) < 12 ? 'A' : 'B',
      inicio: troca, fim: fim, fiscal: fiscal, local: local, unidade: local, posto: 'Fixa', encerrado: 1, criadoEm: agora, atualizadoEm: agora,
      srv_ts: agora, usuario: 'Portal: ' + s.nome, semPlaca: 1, encerradoPor: 'Relatório de plantão (papel)', encerradoEm: agora, importacao: imp });
    const vs = [];
    d.cargas.sort(function (a, b) { return a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0; });
    d.cargas.forEach(function (c) { vs.push(c); });
    PLANTAO_TIPOS_.forEach(function (k) {
      const nC = d.cargas.filter(function (c) { return c.tipo === k; }).length, falta = d.tipos[k] - nC;
      if (falta < 0) avisos.push(data.split('-').reverse().join('/') + ': ' + nC + ' carga(s) ' + k + ' na lista e ' + d.tipos[k] + ' no quadro de veículos — vale a lista.');
      for (let i = 0; i < falta; i++) vs.push({ hora: '', tipo: k });
    });
    let edu = d.educacao;
    vs.forEach(function (c, i) {
      const pessoas = i === vs.length - 1 ? edu : Math.min(1, edu); edu -= pessoas;
      seq++;
      veiculos.push({ id: base + seq, turnoId: tid, hora: c.hora, placa: c.placa || '', tipo: c.tipo, pessoas: pessoas,
        obs: c.medidaPapel ? 'Relatório de plantão (papel)' : 'Relatório de plantão (papel): veículo do quadro, sem placa', excluido: 0,
        criadoEm: agora, atualizadoEm: agora, srv_ts: agora, usuario: 'Portal: ' + s.nome,
        ufOrigem: c.ufOrigem || '', ufDestino: c.ufDestino || '', origemMun: c.origemMun || '', destinoMun: c.destinoMun || '',
        transportador: c.transportador || '', cargaPapel: c.cargaPapel || '', medidaPapel: c.medidaPapel || '', tfPapel: c.tfPapel || '',
        docPapel: c.docPapel || '', importacao: imp });
    });
    if (edu > 0) avisos.push(data.split('-').reverse().join('/') + ': educação sanitária sem veículo no dia (' + edu + ').');
  });
  if (veiculos.length > PLANTAO_MAX_VEICULOS_) throw new Error('Veículos demais num plantão (' + veiculos.length + ').');
  const nCargas = veiculos.filter(function (v) { return v.medidaPapel; });
  if (!turnos.length) throw new Error('O plantão não tem nenhum veículo nem educação sanitária.');
  if (vazios.length) avisos.push('Dia(s) sem nenhum registro, sem turno: ' + vazios.map(function (x) { return x.split('-').reverse().join('/'); }).join(', ') + '.');
  const resumo = { posto: posto.nome, local: local, de: ordem[0], ate: ordem[ordem.length - 1], dias: ordem.length, turnos: turnos.length, diasVazios: vazios,
    veiculos: veiculos.length, cargas: nCargas.length, semPlaca: veiculos.length - nCargas.length,
    educacao: ordem.reduce(function (a, k) { return a + D[k].educacao; }, 0),
    liberacao: nCargas.filter(function (v) { return v.tfPapel && v.medidaPapel === 'liberacao'; }).length,      // como no motor: só com nº do TF
    apreensao: nCargas.filter(function (v) { return v.tfPapel && v.medidaPapel === 'apreensao'; }).length,
    tfs: nCargas.filter(function (v) { return v.tfPapel; }).length, avisos: avisos };
  return { id: imp, turnos: turnos, veiculos: veiculos, resumo: resumo };
}
function admPlantaoImportar_(s, req) {
  const m = plantaoMontar_(vigConfig_(), req || {}, s), arquivo = plantaoTexto_(req.arquivo, 200);
  return comLock_(function () {
    const turnosPl = lerLinhas_('Turnos'), ant = turnosPl.filter(function (t) { return t.importacao === m.id; });
    if (ant.length && Number(req.substituir) !== 1) {
      return { ok: false, jaImportado: true, importadoEm: ant[0].criadoEm, por: String(ant[0].usuario || '').replace(/^Portal: /, ''), resumo: m.resumo };
    }
    // turnos do app no mesmo local e dias (não deveria haver: o plantão é do papel) — avisa, não mistura
    const dias = {}; m.turnos.forEach(function (t) { dias[t.data] = 1; });
    const doApp = turnosPl.filter(function (t) { return !t.importacao && dias[String(t.data).slice(0, 10)] && localCanon_(t.local) === localCanon_(m.resumo.local); }).length;
    let excluidos = 0;
    if (ant.length) {
      const vAnt = lerLinhas_('Veiculos').filter(function (v) { return v.importacao === m.id && v.excluido !== 1; });
      atualizarColuna_('Veiculos', 'excluido', vAnt.map(function (v) { return v._linha; }), 1);
      atualizarColuna_('Veiculos', 'atualizadoEm', vAnt.map(function (v) { return v._linha; }), Date.now());
      excluidos = vAnt.length;
    }
    const linhaDe = {}; turnosPl.forEach(function (t) { linhaDe[t.id] = t._linha; });
    const novos = [];
    m.turnos.forEach(function (t) {
      if (!linhaDe[t.id]) { novos.push(t); return; }
      atualizar_('Turnos', linhaDe[t.id], { fiscal: t.fiscal, inicio: t.inicio, fim: t.fim, letra: t.letra, atualizadoEm: t.atualizadoEm, srv_ts: t.srv_ts,
        usuario: t.usuario, encerrado: 1, encerradoPor: t.encerradoPor, encerradoEm: t.encerradoEm, importacao: m.id });
    });
    inserir_('Turnos', novos);
    inserir_('Veiculos', m.veiculos);
    const r = Object.assign({ ok: true, id: m.id, substituidos: excluidos, turnosDoApp: doApp }, m.resumo);
    admHistLote_(s, ant.length ? 'substituir' : 'importar', 'Turnos', [['plantão ' + m.id + (arquivo ? ' · arquivo: ' + arquivo : ''), '',
      { dias: r.dias, veiculos: r.veiculos, cargas: r.cargas, liberacao: r.liberacao, apreensao: r.apreensao, tfs: r.tfs, educacao: r.educacao, substituidos: excluidos }]]);
    return r;
  });
}
