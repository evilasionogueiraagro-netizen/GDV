// PCE — cadastro de cítricos no levantamento ("CADASTRO DE IMÓVEIS DE PRODUÇÃO COMERCIAL DE CÍTRICOS — Levantamento fitossanitário de pragas
// quarentenárias de citros"; IN 21/2018 cancro cítrico, Portaria 317/2021 HLB). No levantamento por praga (pce.js), o bloco "🍊 Cultura do citros"
// aparece UMA vez, dentro do card "Pragas e doenças", quando há card de praga de citros (vale para todas as pragas de citros do levantamento).
// A identificação do produtor/propriedade (nome, CPF, CNPJ, propriedade, código, endereço, município, UF, coordenadas) fica nos cards
// "Dados do produtor" e "Localização" do levantamento; aqui só as particularidades do cadastro. Detecção de HLB, Ácaro Hindustânico e Cancro
// Cítrico (ausência/presença) é obrigatória: gera as frases da "Descrição da ação" do Termo de Fiscalização e o item 5 do cadastro.
// Gravado na coluna "citros" (JSON) do levantamento:
// {v, comercial, naoComercial, naoComercialOutros, atividades[], atividadeOutros, situacao, situacaoOutras,
//  culturas:[{atividade, cultivar, area, idade, plantas, producao}], entrega, formasEntrega[], compradores[], compradorOutros, beneficia, beneficiaTipo,
//  materiais[], origemMaterial, delimitacao:{pintapreta:{tem, tempo, controle, qual}}, deteccao:{hlb|acaro|cancro:{tem: sim (presença) | nao (ausência), tempo}},
//  rt:{nome, conselho}}. Registros da versão anterior podem trazer também cnpj/endereco/uf (hoje colunas do levantamento: ver legado()).
// Usa funções do app.js (esc, $, toast) e do moniliase.js (PCEMon.numero) em tempo de execução. Também usado pelo moniliase.js (Cadastro de citros e Termo).
const PCECitros = (() => {
  const C = (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.citros) || {};
  const PR = 'pce-ci-', SN = [['sim', 'Sim'], ['nao', 'Não']], AP = [['nao', 'Ausência'], ['sim', 'Presença']], MAX = C.maxCulturas || 20, MAXTXT = 200;
  const NAOCOM = (CONFIG.PCE.moniliase && CONFIG.PCE.moniliase.tiposNaoComercial) || [['outros', 'Outros']];
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const NOMES = new Set((C.pragas || []).map(norm)), TERMOS = (C.termos || []).map(norm);
  const lista = k => C[k] || [];
  const rotulo = (k, v) => ((lista(k).find(x => x[0] === v) || [])[1]) || v;
  const listaE = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || '');

  /** A praga/doença é de citros? (nome da lista CONFIG.PCE.citros.pragas ou texto com um dos termos: citr, cancro, hlb…) */
  const ehCitros = nome => { const n = norm(nome); return !!n && (NOMES.has(n) || TERMOS.some(t => n.includes(t))); };
  /** Praga do card → item do levantamento de detecção/delimitação que ela pré-marca (cancro, hlb, acaro, pintapreta) ou ''. */
  function chaveDaPraga(nome) {
    const n = norm(nome); if (!n || (C.naoMarcar || []).some(t => n.includes(norm(t)))) return '';
    const k = Object.keys(C.marcarPor || {}).find(x => C.marcarPor[x].some(t => n.includes(norm(t))));
    return k || '';
  }

  /* ---------- dados ---------- */
  const linhaVazia = () => ({ atividade: '', cultivar: '', area: '', idade: '', plantas: '', producao: '' });
  const vazio = () => ({ v: 1, comercial: '', naoComercial: '', naoComercialOutros: '', atividades: [], atividadeOutros: '',
    situacao: '', situacaoOutras: '', culturas: [], entrega: '', formasEntrega: [], compradores: [], compradorOutros: '', beneficia: '', beneficiaTipo: '',
    materiais: [], origemMaterial: '', delimitacao: {}, deteccao: {}, rt: { nome: '', conselho: '' } });
  const objeto = v => { let o = v; if (typeof v === 'string') { try { o = v ? JSON.parse(v) : null; } catch (x) { o = null; } } return o && typeof o === 'object' && !Array.isArray(o) ? o : null; };
  /** Registro (texto JSON da coluna) ou rascunho → objeto completo (campos que faltam = vazios). Registro antigo sem a coluna: tudo vazio. */
  function deValor(v) {
    const o = objeto(v), D = vazio(); if (!o) return D;
    Object.keys(D).forEach(k => { if (o[k] != null) D[k] = o[k]; });
    ['atividades', 'formasEntrega', 'compradores', 'materiais', 'culturas'].forEach(k => { if (!Array.isArray(D[k])) D[k] = []; });
    ['delimitacao', 'deteccao', 'rt'].forEach(k => { if (!D[k] || typeof D[k] !== 'object' || Array.isArray(D[k])) D[k] = k === 'rt' ? { nome: '', conselho: '' } : {}; });
    D.culturas = D.culturas.filter(c => c && typeof c === 'object').map(c => ({ ...linhaVazia(), ...c }));
    return D;
  }
  /** CNPJ, endereço e UF que a versão anterior guardava no JSON de citros (hoje ficam nas colunas do levantamento). */
  const legado = v => { const o = objeto(v) || {}; return { cnpj: String(o.cnpj || ''), endereco: String(o.endereco || ''), uf: String(o.uf || '') }; };
  /** Há algo preenchido? (strings não vazias e listas com itens, em qualquer nível; "v" não conta) */
  const temAlgo = o => Array.isArray(o) ? o.some(temAlgo) : o && typeof o === 'object' ? Object.keys(o).some(k => k !== 'v' && temAlgo(o[k])) : String(o == null ? '' : o).trim() !== '';

  /* ---------- formulário ---------- */
  const numTela = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
  const sn = (k, rot, v, ops = SN) => `<fieldset class="mon-sn" data-k="${k}"><legend>${rot}</legend><div class="mon-op" style="--n:${ops.length}">${ops.map(([x, t]) =>
    `<label><input type="radio" name="${PR}${k}" value="${e(x)}" ${v === x ? 'checked data-on="1"' : ''}><span>${e(t)}</span></label>`).join('')}</div></fieldset>`;
  const cks = (k, ops, sel) => `<div class="mon-cks" id="${PR}${k}">${ops.map(([x, t]) => `<label class="chk"><input type="checkbox" name="${PR}${k}" value="${e(x)}" ${(sel || []).includes(x) ? 'checked' : ''}> ${e(t)}</label>`).join('')}</div>`;
  const inp = (id, rot, v, extra = '') => `<label>${rot}<input id="${PR}${id}" value="${e(v == null ? '' : v)}" maxlength="${MAXTXT}" autocomplete="off" ${extra}></label>`;
  const outro = (id, rot, v, mostrar) => `<div id="${PR}${id}-l" ${mostrar ? '' : 'hidden'}>${inp(id, rot, v)}</div>`;
  function linhaHTML(c, i) {
    const n = (k, rot, modo) => `<label>${rot}<input class="ci-${k}" value="${e(numTela(c[k]))}" inputmode="${modo}" maxlength="12" autocomplete="off"></label>`;
    return `<div class="pce-ci-cult"><div class="pce-cult-topo"><b>Linha ${i + 1}</b>
        <button type="button" class="mini" data-pce="ci-delcult" data-i="${i}" aria-label="Remover linha ${i + 1} da cultura do citros">Remover</button></div>
      <label>Tipo de atividade<select class="ci-atividade"><option value="">Selecione</option>${lista('atividades').map(([x, t]) => `<option value="${e(x)}" ${c.atividade === x ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>
      <label>Cultivar<input class="ci-cultivar" list="${PR}cultivares" value="${e(c.cultivar)}" maxlength="${MAXTXT}" autocomplete="off" placeholder="ex.: Laranja Pera"></label>
      <div class="duas">${n('area', 'Área (ha)', 'decimal')}${n('idade', 'Idade (anos)', 'numeric')}</div>
      <div class="duas">${n('plantas', 'Qtd. de plantas', 'numeric')}${n('producao', 'Produção (t/ano)', 'decimal')}</div></div>`;
  }
  const linhasHTML = l => (l.length ? l.map(linhaHTML).join('') : '<p class="dica" style="text-align:left">Nenhuma linha. Toque em “+ Adicionar linha”.</p>');
  /** Bloco do formulário (dentro do card "Pragas e doenças"; escondido até haver praga de citros). */
  function html(v) {
    const D = deValor(v), nao = D.comercial === 'nao';
    const det = ([k, t]) => { const x = D.deteccao[k] || {};
      return `<div class="pce-ci-det" data-k="${k}">${sn('det-' + k + '-tem', `${e(t)} <span class="obrig">*</span>`, x.tem || '', AP)}
        <div id="${PR}det-${k}-tempo-l" ${x.tem === 'sim' ? '' : 'hidden'}>${inp('det-' + k + '-tempo', 'Há quanto tempo (presença)', x.tempo)}</div></div>`; };
    const del = ([k, t]) => { const x = D.delimitacao[k] || {};
      return `<div class="mon-fito"><b>${e(t)}</b>${sn('del-' + k + '-tem', 'Presença', x.tem || '')}${inp('del-' + k + '-tempo', 'Há quanto tempo', x.tempo)}
        ${sn('del-' + k + '-controle', 'Utiliza método de controle?', x.controle || '')}${inp('del-' + k + '-qual', 'Qual', x.qual)}</div>`; };
    return `<div class="pce-citros" id="pce-citros" hidden><h4>🍊 Cultura do citros <small>cadastro de cítricos (IN 21/2018 e Portaria 317/2021)</small></h4>
      <p class="dica" style="text-align:left">Um bloco só para todas as pragas de citros deste levantamento. Os dados do produtor e da propriedade são os de cima. Gera o Cadastro de citros e o Termo de Fiscalização da visita.</p>
      <p class="mon-sub">Levantamento de detecção — sintomas nos frutos e folhas <span class="obrig">(obrigatório)</span></p>
      <div id="${PR}det">${lista('deteccao').map(det).join('')}</div>
      <p class="mon-sub">Propriedade</p>
      ${sn('comercial', 'Propriedade comercial?', D.comercial)}
      <div id="${PR}naocom" ${nao ? '' : 'hidden'}>${sn('naoComercial', 'Tipo (não comercial)', D.naoComercial, NAOCOM)}
        ${outro('naoComercialOutros', 'Outros (qual)', D.naoComercialOutros, D.naoComercial === 'outros')}
        <p class="dica" style="text-align:left">Marcada a opção NÃO, o cadastro traz só os dados do produtor, a delimitação e a detecção (itens 1, 4 e 5).</p></div>
      <div id="${PR}comercial-blocos" ${nao ? 'hidden' : ''}>
        <p class="mon-sub">Tipo de atividade</p>${cks('atividades', lista('atividades'), D.atividades)}
        ${outro('atividadeOutros', 'Outros (especificar)', D.atividadeOutros, D.atividades.includes('outros'))}
        ${sn('situacao', 'Situação fundiária (cadastro de citros)', D.situacao, lista('situacoes'))}
        ${outro('situacaoOutras', 'Outras (especificar)', D.situacaoOutras, D.situacao === 'outras')}
        <p class="mon-sub">Cultura do citros (tabela do cadastro)</p>
        <div id="${PR}culturas">${linhasHTML(D.culturas)}</div>
        <datalist id="${PR}cultivares">${(C.cultivares || []).map(x => `<option value="${e(x)}">`).join('')}</datalist>
        <button type="button" class="botao sec" data-pce="ci-addcult" id="${PR}addcult">+ Adicionar linha</button>
        <p class="mon-sub">Comercialização</p>
        ${sn('entrega', 'Entrega na propriedade?', D.entrega)}
        <p class="mon-sub">De que forma</p>${cks('formasEntrega', lista('formasEntrega'), D.formasEntrega)}
        <p class="mon-sub">Com quem comercializa</p>${cks('compradores', lista('compradores'), D.compradores)}
        ${outro('compradorOutros', 'Outros (quem)', D.compradorOutros, D.compradores.includes('outros'))}
        ${sn('beneficia', 'Beneficia o fruto?', D.beneficia)}
        ${outro('beneficiaTipo', 'Tipo de beneficiamento', D.beneficiaTipo, D.beneficia === 'sim')}
        <p class="mon-sub">Material de propagação</p>${cks('materiais', lista('materiais'), D.materiais)}
        ${inp('origemMaterial', 'Origem do material genético', D.origemMaterial)}</div>
      <p class="mon-sub">Levantamento de delimitação</p>${lista('delimitacao').map(del).join('')}
      <p class="mon-sub">Responsável técnico</p>
      <div class="duas">${inp('rt-nome', 'Nome', D.rt.nome)}${inp('rt-conselho', 'Nº do conselho', D.rt.conselho)}</div></div>`;
  }
  const q = s => document.querySelector(s);
  const g = id => { const x = q('#' + PR + id); return x ? x.value : ''; };
  const rv = k => { const x = q(`input[name="${PR}${k}"]:checked`); return x ? x.value : ''; };
  const cv = k => [...document.querySelectorAll(`input[name="${PR}${k}"]:checked`)].map(x => x.value);
  /** Estado do bloco como está na tela (textos como digitados): vai para o rascunho. Sem o bloco: null. */
  function coletar() {
    if (!q('#pce-citros')) return null;
    const delimitacao = {}, deteccao = {};
    lista('delimitacao').forEach(([k]) => { delimitacao[k] = { tem: rv('del-' + k + '-tem'), tempo: g('del-' + k + '-tempo'), controle: rv('del-' + k + '-controle'), qual: g('del-' + k + '-qual') }; });
    lista('deteccao').forEach(([k]) => { deteccao[k] = { tem: rv('det-' + k + '-tem'), tempo: g('det-' + k + '-tempo') }; });
    return { v: 1, comercial: rv('comercial'), naoComercial: rv('naoComercial'), naoComercialOutros: g('naoComercialOutros'),
      atividades: cv('atividades'), atividadeOutros: g('atividadeOutros'), situacao: rv('situacao'), situacaoOutras: g('situacaoOutras'),
      culturas: [...document.querySelectorAll('#' + PR + 'culturas .pce-ci-cult')].map(b => { const c = k => b.querySelector('.ci-' + k).value;
        return { atividade: c('atividade'), cultivar: c('cultivar'), area: c('area'), idade: c('idade'), plantas: c('plantas'), producao: c('producao') }; }),
      entrega: rv('entrega'), formasEntrega: cv('formasEntrega'), compradores: cv('compradores'), compradorOutros: g('compradorOutros'),
      beneficia: rv('beneficia'), beneficiaTipo: g('beneficiaTipo'), materiais: cv('materiais'), origemMaterial: g('origemMaterial'),
      delimitacao, deteccao, rt: { nome: g('rt-nome'), conselho: g('rt-conselho') } };
  }
  /** Mostra/esconde as partes que dependem de outra resposta (não comercial, "outros", beneficiamento, tempo da presença). */
  function ligar() {
    const vis = (id, c) => { const x = q('#' + PR + id); if (x) x.hidden = !c; };
    const nao = rv('comercial') === 'nao';
    vis('naocom', nao); vis('comercial-blocos', !nao); vis('naoComercialOutros-l', rv('naoComercial') === 'outros');
    vis('atividadeOutros-l', cv('atividades').includes('outros')); vis('situacaoOutras-l', rv('situacao') === 'outras');
    vis('compradorOutros-l', cv('compradores').includes('outros')); vis('beneficiaTipo-l', rv('beneficia') === 'sim');
    lista('deteccao').forEach(([k]) => vis('det-' + k + '-tempo-l', rv('det-' + k + '-tem') === 'sim'));
  }
  /** Tabela "Cultura do citros": acrescenta ou remove linha (redesenha com o que está digitado). false = limite. */
  function addLinha() {
    const D = coletar(); if (!D) return false;
    if (D.culturas.length >= MAX) { toast(`Limite de ${MAX} linhas na cultura do citros.`, true); return false; }
    D.culturas.push(linhaVazia()); q('#' + PR + 'culturas').innerHTML = linhasHTML(D.culturas);
    const l = document.querySelectorAll('#' + PR + 'culturas .ci-atividade'); if (l.length) l[l.length - 1].focus();
    return true;
  }
  function delLinha(i) {
    const D = coletar(); if (!D) return;
    D.culturas.splice(i, 1); q('#' + PR + 'culturas').innerHTML = linhasHTML(D.culturas);
  }
  /**
   * Mostra o bloco se algum card de praga é de citros e pré-marca "Presença" na detecção/delimitação da praga detectada (só se ainda não marcado).
   * pragas = [{praga, detectada}]. Devolve true se o bloco está visível.
   */
  function atualizar(pragas) {
    const bloco = q('#pce-citros'); if (!bloco) return false;
    const tem = pragas.some(p => ehCitros(p.praga));
    bloco.hidden = !tem;
    if (tem) pragas.filter(p => p.detectada).forEach(p => {
      const k = chaveDaPraga(p.praga); if (!k) return;
      const nome = PR + (lista('deteccao').some(x => x[0] === k) ? 'det-' : 'del-') + k + '-tem';
      if (q(`input[name="${nome}"]:checked`)) return;                      // o fiscal já marcou (ou já foi pré-marcado): não muda
      const sim = q(`input[name="${nome}"][value="sim"]`); if (sim) { sim.checked = true; sim.dataset.on = '1'; }
    });
    ligar();
    return tem;
  }

  /* ---------- validação ao salvar ---------- */
  const numero = v => (typeof PCEMon !== 'undefined' ? PCEMon.numero(v) : (String(v).trim() === '' ? '' : Number(String(v).replace(',', '.'))));
  const txt = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, MAXTXT);
  /** Doenças da detecção ainda sem ausência/presença (nomes). */
  const faltaDeteccao = D0 => { const D = deValor(D0); return lista('deteccao').filter(([k]) => !['sim', 'nao'].includes((D.deteccao[k] || {}).tem)).map(x => x[1]); };
  /**
   * Estado da tela → JSON a gravar. {valor: texto JSON} ou {erro, faltam}. A detecção de HLB, Ácaro Hindustânico e Cancro Cítrico é obrigatória.
   * comercial = "não": atividade, cultura, comercialização e propagação não são gravadas (o papel manda preencher só os itens 1, 4 e 5).
   * Textos "outros" só com a opção marcada; "há quanto tempo" da detecção só com presença.
   */
  function paraGravar(D0) {
    const D = deValor(D0), nao = D.comercial === 'nao';
    const faltam = faltaDeteccao(D);
    if (faltam.length) return { erro: `Cultura do citros: marque Ausência ou Presença de sintomas de ${listaE(faltam)} (obrigatório nas pragas de citros).`, faltam };
    const culturas = [];
    for (const [i, c] of (nao ? [] : D.culturas).entries()) {
      const o = { atividade: lista('atividades').some(x => x[0] === c.atividade) ? c.atividade : '', cultivar: txt(c.cultivar) };
      for (const [k, rot, int] of [['area', 'área', 0], ['idade', 'idade', 1], ['plantas', 'quantidade de plantas', 1], ['producao', 'produção', 0]]) {
        const s = String(c[k] == null ? '' : c[k]).trim(), n = numero(s);
        if (s && n === '') return { erro: `Cultura do citros, linha ${i + 1}: ${rot} inválida ("${s}").` };
        if (n !== '' && n < 0) return { erro: `Cultura do citros, linha ${i + 1}: ${rot} não pode ser negativa.` };
        o[k] = n === '' ? '' : int ? Math.round(n) : n;
      }
      if (temAlgo(o)) culturas.push(o);
    }
    if (culturas.length > MAX) return { erro: `Cultura do citros: no máximo ${MAX} linhas.` };
    const so = (v, k) => (lista(k).some(x => x[0] === v) ? v : '');
    const sim = v => (v === 'sim' || v === 'nao' ? v : '');
    const varios = (l, k) => l.filter(x => lista(k).some(y => y[0] === x));
    const delimitacao = {}, deteccao = {};
    lista('delimitacao').forEach(([k]) => { const x = D.delimitacao[k] || {}; delimitacao[k] = { tem: sim(x.tem), tempo: txt(x.tempo), controle: sim(x.controle), qual: x.controle === 'nao' ? '' : txt(x.qual) }; });
    lista('deteccao').forEach(([k]) => { const x = D.deteccao[k] || {}; deteccao[k] = { tem: sim(x.tem), tempo: x.tem === 'sim' ? txt(x.tempo) : '' }; });
    const atividades = nao ? [] : varios(D.atividades, 'atividades'), compradores = nao ? [] : varios(D.compradores, 'compradores');
    const naoCom = nao && NAOCOM.some(x => x[0] === D.naoComercial) ? D.naoComercial : '', situacao = nao ? '' : so(D.situacao, 'situacoes'), beneficia = nao ? '' : sim(D.beneficia);
    const o = { v: 1, comercial: sim(D.comercial), naoComercial: naoCom, naoComercialOutros: naoCom === 'outros' ? txt(D.naoComercialOutros) : '',
      atividades, atividadeOutros: atividades.includes('outros') ? txt(D.atividadeOutros) : '', situacao, situacaoOutras: situacao === 'outras' ? txt(D.situacaoOutras) : '',
      culturas, entrega: nao ? '' : sim(D.entrega), formasEntrega: nao ? [] : varios(D.formasEntrega, 'formasEntrega'), compradores,
      compradorOutros: compradores.includes('outros') ? txt(D.compradorOutros) : '', beneficia, beneficiaTipo: beneficia === 'sim' ? txt(D.beneficiaTipo) : '',
      materiais: nao ? [] : varios(D.materiais, 'materiais'), origemMaterial: nao ? '' : txt(D.origemMaterial),
      delimitacao, deteccao, rt: { nome: txt(D.rt.nome), conselho: txt(D.rt.conselho) } };
    return { valor: JSON.stringify(o) };
  }

  /* ---------- Termo de Fiscalização: frases da descrição da ação ---------- */
  /**
   * Uma frase por doença da detecção (ordem de CONFIG.PCE.citros.deteccao), ex.: "Ausência de sintomas de HLB nos frutos e folhas da cultura Laranja."
   * culturas = nomes das culturas de citros avaliadas no levantamento (vazio = só "da cultura"). Doença sem resposta fica de fora.
   */
  function frases(v, culturas) {
    const D = deValor(v), F = C.frases || {}, cs = [...new Set((culturas || []).map(x => String(x || '').trim()).filter(Boolean))];
    return lista('deteccao').map(([k, t]) => { const x = D.deteccao[k] || {}; return F[x.tem] ? F[x.tem].replace('{praga}', t).replace('{culturas}', cs.length ? ' ' + listaE(cs) : '') : ''; }).filter(Boolean);
  }
  /** Houve presença de sintomas em alguma das doenças da detecção? */
  const temPresenca = v => { const D = deValor(v); return lista('deteccao').some(([k]) => (D.deteccao[k] || {}).tem === 'sim'); };
  /** Tipo(s) de atividade em texto (campo "Atividade" do Termo). */
  const atividadesTexto = v => { const D = deValor(v); return D.atividades.map(x => (x === 'outros' && D.atividadeOutros ? D.atividadeOutros : rotulo('atividades', x))).join('; '); };
  const totalPlantas = v => deValor(v).culturas.reduce((s, c) => s + (Number(c.plantas) || 0), 0);

  /* ---------- resumo (tela do Cadastro de citros): só o que foi preenchido ---------- */
  const fmtNum = v => (v === '' || v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const SIMNAO = { sim: 'Sim', nao: 'Não' }, AUSPRES = { sim: 'Presença', nao: 'Ausência' };
  /** Campos preenchidos como [rótulo, texto] e as linhas da cultura do citros. null = nada preenchido. */
  function resumo(v) {
    const D = deValor(v); if (!temAlgo(D)) return null;
    const L = [], add = (r, t) => { if (String(t == null ? '' : t).trim()) L.push([r, String(t)]); };
    const comOutro = (vals, k, outroTxt, cod) => vals.map(x => (x === cod && outroTxt ? `${rotulo(k, x)}: ${outroTxt}` : rotulo(k, x))).join('; ');
    lista('deteccao').forEach(([k, t]) => { const x = D.deteccao[k] || {}; add(`Detecção – ${t}`, [x.tem && AUSPRES[x.tem], x.tempo && 'há ' + x.tempo].filter(Boolean).join(' · ')); });
    add('Propriedade comercial', SIMNAO[D.comercial]);
    if (D.naoComercial) add('Tipo (não comercial)', ((NAOCOM.find(x => x[0] === D.naoComercial) || [])[1] || D.naoComercial) + (D.naoComercialOutros ? ': ' + D.naoComercialOutros : ''));
    add('Tipo de atividade', comOutro(D.atividades, 'atividades', D.atividadeOutros, 'outros'));
    add('Situação fundiária', D.situacao ? comOutro([D.situacao], 'situacoes', D.situacaoOutras, 'outras') : '');
    add('Entrega na propriedade', SIMNAO[D.entrega]);
    add('Forma de entrega', D.formasEntrega.map(x => rotulo('formasEntrega', x)).join('; '));
    add('Com quem comercializa', comOutro(D.compradores, 'compradores', D.compradorOutros, 'outros'));
    add('Beneficia o fruto', D.beneficia ? SIMNAO[D.beneficia] + (D.beneficiaTipo ? ': ' + D.beneficiaTipo : '') : '');
    add('Material de propagação', D.materiais.map(x => rotulo('materiais', x)).join('; '));
    add('Origem do material genético', D.origemMaterial);
    lista('delimitacao').forEach(([k, t]) => { const x = D.delimitacao[k] || {};
      add(`Delimitação – ${t}`, [x.tem && SIMNAO[x.tem], x.tempo && 'há ' + x.tempo, x.controle && 'controle: ' + SIMNAO[x.controle] + (x.qual ? ` (${x.qual})` : '')].filter(Boolean).join(' · ')); });
    add('Responsável técnico', [D.rt.nome, D.rt.conselho && 'conselho nº ' + D.rt.conselho].filter(Boolean).join(' · '));
    const culturas = D.culturas.filter(temAlgo).map(c => ({ atividade: c.atividade ? rotulo('atividades', c.atividade) : '', cultivar: c.cultivar || '',
      area: fmtNum(c.area), idade: fmtNum(c.idade), plantas: fmtNum(c.plantas), producao: fmtNum(c.producao) }));
    return L.length || culturas.length ? { campos: L, culturas } : null;
  }

  return { ehCitros, chaveDaPraga, html, coletar, ligar, addLinha, delLinha, atualizar, paraGravar, faltaDeteccao, frases, temPresenca, atividadesTexto,
    totalPlantas, resumo, deValor, legado, listaE, MAX };
})();
