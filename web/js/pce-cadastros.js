// PCE — cadastros por programa: um formulário e um PDF por modelo de papel (banana, mandioca, soja e cadastro geral da propriedade), guiados por
// CONFIG.PCE.cadastros (lê o comentário acima dele). Citros e monilíase continuam com o código e o modelo próprios (citros.js / moniliase.js).
//
// Regras: a família da cultura (catálogo) define o modelo; cultura sem família cai no cadastro geral ("propriedade"). Uma visita pode precisar de
// mais de um cadastro (um por modelo; o que já existe na propriedade não pede de novo). Cada informação é perguntada uma vez: o que o levantamento
// já tem (produtor, propriedade, coordenadas, situação fundiária, comercial, culturas com área e espaçamento, resultado das pragas, coleta de
// amostra) vem de lá; o que a propriedade já respondeu em outro cadastro (CONFIG.PCE.cadastros.reaproveita) é copiado ao abrir um cadastro novo.
// "tem" (sim/não) das pragas de detecção = resultado no levantamento (Detectada ou Suspeita = sim); sem levantamento (ou sem a praga nele) pergunta-se.
// O que é comum com o cadastro de monilíase (número, servidor, produtor, GPS, assinaturas, PDF do papel, rascunho) usa PCEMon.nucleo.
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM), do pce.js (PCEUI), do moniliase.js (PCEMon.nucleo) e do docs.js.
const PCECads = (() => {
  const P = CONFIG.PCE, CAD = P.cadastros || {}, CI = P.citros || {}, MO = P.moniliase || {};
  const GEN = ['banana', 'mandioca', 'soja', 'propriedade'];
  const N = () => PCEMon.nucleo, U = () => PCEUI, PC = 'mc-';
  const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nk = s => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const idCat = s => nk(s).replace(/ /g, '-').slice(0, 60);
  const digitos = v => String(v || '').replace(/\D/g, '');
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const coord = x => (x === '' || x == null ? '' : String(x).replace('.', ','));
  const MAX_LINHAS = 20;

  /* ---------- modelos ---------- */
  const ehGenerico = p => GEN.includes(p);
  /** Nome curto do programa do cadastro (lista, painel, botões). */
  const rotulo = p => (CAD.rotulos || {})[p || 'moniliase'] || String(p || 'moniliase');
  /** Nome inteiro do modelo (título do formulário, escolha do novo cadastro). */
  const nomeModelo = p => (p === 'moniliase' ? 'Cacau e cupuaçu (monilíase)' : p === 'citros' ? 'Citros' : (CAD[p] && CAD[p].nome) || rotulo(p));
  /** Modelos que se criam sem levantamento (citros sai do levantamento com praga de citros). */
  const modelosAvulsos = () => ['moniliase', ...GEN];
  async function catalogo() { const c = await Store.meta('catalogoPce'); return c && Array.isArray(c.culturas) && Array.isArray(c.familias) ? c : null; }
  /** Modelo de cadastro de uma cultura: o da família dela no catálogo; sem catálogo, a lista do config; sem família, o cadastro geral. */
  function modeloDaCultura(nome, cat) {
    const k = idCat(nome);
    if (cat) {
      const c = cat.culturas.find(x => x.id === k || idCat(x.nome) === k);
      if (c) { const f = c.familiaId && cat.familias.find(x => x.id === c.familiaId); return (f && f.modeloCadastro) || 'propriedade'; }
    }
    const m = Object.keys(CAD.culturaModelo || {}).find(x => idCat(x) === k);
    return (m && CAD.culturaModelo[m]) || 'propriedade';
  }
  /** Modelos de cadastro de uma visita, na ordem: citros (se há praga de citros no levantamento) e o de cada cultura avaliada. */
  function modelosDaVisita(lev, cat) {
    const G = Docs.pceGrupos(lev).pragas, citros = G.some(g => PCECitros.ehCitros(g.praga)), out = [];
    const add = m => { if (m && !out.includes(m)) out.push(m); };
    if (citros) add('citros');
    G.forEach(g => g.culturas.forEach(c => {
      const nome = String(c.cultura || '').trim(); if (!nome) return;
      const m = modeloDaCultura(nome, cat); add(m === 'citros' && !citros ? 'propriedade' : m);
    }));
    if (!out.length) add('propriedade');
    return out;
  }
  /** Culturas do levantamento que pertencem ao modelo (uma linha por cultura, com área, espaçamento, coleta e resultados). */
  function culturasDoModelo(lev, modelo, cat) {
    const mapa = new Map();
    Docs.pceGrupos(lev).pragas.forEach(g => g.culturas.forEach(c => {
      const nome = String(c.cultura || '').trim(); if (!nome || modeloDaCultura(nome, cat) !== modelo) return;
      const x = mapa.get(idCat(nome)) || { cultura: nome, area: '', esp: '', coleta: false, tipoMaterial: [], pragas: [] };
      if (!x.area && c.area) x.area = String(c.area);
      if (!x.esp) x.esp = espacamentoTxt(c);
      if (c.coleta === 'Sim') { x.coleta = true; if (c.tipoMaterial && !x.tipoMaterial.includes(c.tipoMaterial)) x.tipoMaterial.push(c.tipoMaterial); }
      x.pragas.push({ praga: g.praga, resultado: c.resultado });
      mapa.set(idCat(nome), x);
    }));
    return [...mapa.values()];
  }
  function espacamentoTxt(c) {
    const l = String(c.espLinha || '').trim(), p = String(c.espPlanta || '').trim(), u = c.espUnidade == null ? 'm' : c.espUnidade;
    return !l && !p ? '' : `${[l, p].filter(Boolean).join(' x ')}${u ? ' ' + u : ''}`;
  }
  /** Resultado da praga no levantamento: 'sim' (Detectada ou Suspeita), 'nao' (só Não detectada) ou null (praga não avaliada). */
  function resultadoDaPraga(lev, nome) {
    const rs = Docs.pceGrupos(lev).pragas.filter(g => nk(g.praga) === nk(nome)).flatMap(g => g.culturas.map(c => c.resultado));
    return !rs.length ? null : rs.some(r => r === 'detectada' || r === 'suspeita') ? 'sim' : 'nao';
  }
  /** Situação fundiária do levantamento (lista longa) → as 4 opções da ficha de papel. */
  function situacaoDoLev(txt) {
    const t = nk(txt); if (!t) return null;
    if (/propriet|titulad/.test(t)) return { situacao: 'proprietario' };
    if (/arrend/.test(t)) return { situacao: 'arrendatario' };
    if (/cooperativ/.test(t)) return { situacao: 'cooperativa' };
    return { situacao: 'outras', situacaoOutras: String(txt).trim() };
  }
  /** "Propriedade não comercial": tipo de local do levantamento → opção da ficha. */
  function tipoNaoComercialDoLev(tipoLocal) {
    const t = nk(tipoLocal); if (!t) return null;
    const m = (MO.tiposNaoComercial || []).find(([c, rot]) => nk(rot) === t || (c !== 'outros' && t.startsWith(nk(rot))));
    return m ? { tipoNaoComercial: m[0] } : { tipoNaoComercial: 'outros', tipoOutros: String(tipoLocal).trim() };
  }
  const opcoes = ops => (Array.isArray(ops) ? ops : CI[ops] || []);

  /* ---------- dados do formulário ---------- */
  const campoVazio = c => (c.tipo === 'varios' || c.tipo === 'tabela' ? [] : '');
  const vazio = M => ({ unidade: '', numPapel: '', data: '', local: '', sNome: '', sCargo: '', sMatricula: '', sLotacao: '', nome: '', doc: '', cnpj: '', propriedade: '', telefone: '',
    codigo: '', lat: '', lon: '', endereco: '', municipio: '', uf: 'AM', comercial: '', tipoNaoComercial: '', tipoOutros: '',
    f: Object.fromEntries(M.campos.map(c => [c.k, campoVazio(c)])), det: {}, amostra: { tem: '', tipo: '' }, rt: { nome: '', conselho: '' } });
  const completar = (M, D) => ({ ...vazio(M), ...D, f: { ...vazio(M).f, ...(D.f || {}) }, det: D.det || {}, amostra: { tem: '', tipo: '', ...(D.amostra || {}) }, rt: { nome: '', conselho: '', ...(D.rt || {}) } });
  function deRegistro(r, M) {
    const d = lerJSON(r.dados, {}), f = {};
    M.campos.forEach(c => { f[c.k] = d[c.k] == null ? campoVazio(c) : d[c.k]; });
    return completar(M, { unidade: r.unidade || '', numPapel: r.numeroTxt || '', data: r.data || '', local: r.local || '', sNome: r.servidor || '', sCargo: r.cargo || '',
      sMatricula: r.matricula || '', sLotacao: r.lotacao || '', nome: r.nome || '', doc: PCEDocs.fmtDoc(r.doc), cnpj: PCEDocs.fmtDoc(r.cnpj), propriedade: r.propriedade || '',
      telefone: d.telefone || '', codigo: d.codigoPropriedade || '', lat: coord(r.lat), lon: coord(r.lon), endereco: d.endereco || '', municipio: r.municipio || '', uf: r.uf || 'AM',
      comercial: d.comercial || '', tipoNaoComercial: d.tipoNaoComercial || '', tipoOutros: d.tipoOutros || '', f, det: d.deteccao || {}, amostra: d.amostra || {}, rt: d.rt || {} });
  }

  /* ---------- de onde vem o que já foi respondido ---------- */
  /** Identificação e tudo o que o levantamento da visita já tem (não se pergunta de novo). */
  function doLevantamento(lev, M, modelo, cat) {
    const D = { nome: lev.nome || '', doc: PCEDocs.fmtDoc(lev.doc), cnpj: PCEDocs.fmtDoc(lev.cnpj), propriedade: lev.propriedade || '', telefone: lev.telefone || '',
      codigo: lev.codigoPropriedade || '', lat: coord(lev.lat), lon: coord(lev.lon), endereco: lev.endereco || '', municipio: lev.municipio || '', uf: lev.uf || 'AM',
      data: lev.data || '', comercial: lev.comercial || '', f: {} };
    const tem = k => M.campos.some(c => c.k === k), cult = culturasDoModelo(lev, modelo, cat);
    if (D.comercial === 'nao') Object.assign(D, tipoNaoComercialDoLev(lev.tipoLocal) || {});
    const sit = tem('situacao') ? situacaoDoLev(lev.situacaoFundiaria) : null;
    if (sit) { D.f.situacao = sit.situacao; if (sit.situacaoOutras) D.f.situacaoOutras = sit.situacaoOutras; }
    const tb = M.campos.find(c => c.tipo === 'tabela');
    if (tb) {
      const cols = tb.colunas.map(x => x[0]);
      D.f[tb.k] = cult.map(c => { const l = {}; cols.forEach(k => { l[k] = k === 'cultura' ? c.cultura : k === 'area' ? c.area : k === 'espacamento' ? c.esp : ''; }); return l; });
    }
    if (tem('ocorrencia')) {                                                    // cadastro geral: pragas detectadas ou suspeitas nas culturas dele
      const quais = [...new Set(cult.flatMap(c => c.pragas.filter(x => x.resultado === 'detectada' || x.resultado === 'suspeita').map(x => String(x.praga || '').trim())).filter(Boolean))];
      if (quais.length) { D.f.ocorrencia = 'sim'; D.f.ocorrenciaQuais = quais.join(', '); }
    }
    const tipos = M.campos.find(c => c.k === 'tipos');
    if (tipos) {                                                                // tipo de cultura: as do levantamento que têm caixa na ficha; as outras vão em "Outros"
      const ops = opcoes(tipos.ops), marcados = [], outros = [];
      cult.forEach(c => { const o = ops.find(([k, t]) => k !== 'outros' && (nk(t) === nk(c.cultura) || nk(c.cultura).startsWith(nk(t)))); if (o) { if (!marcados.includes(o[0])) marcados.push(o[0]); } else outros.push(c.cultura); });
      if (outros.length) { marcados.push('outros'); D.f.tiposOutros = outros.join(', '); }
      if (marcados.length) D.f.tipos = marcados;
    }
    return D;
  }
  /** Resultado das pragas de detecção e da coleta de amostra no levantamento (o que não se pergunta de novo). */
  function fixosDoLevantamento(lev, M, modelo, cat) {
    const fx = { det: {}, amostra: null };
    if (!lev) return fx;
    (M.deteccao || []).forEach(it => { const r = resultadoDaPraga(lev, it.praga); if (r) fx.det[it.k] = r; });
    if (M.amostra) { const cult = culturasDoModelo(lev, modelo, cat); fx.amostra = { tem: cult.some(c => c.coleta) ? 'sim' : 'nao', tipo: cult.flatMap(c => c.tipoMaterial).join(', ') }; }
    return fx;
  }
  /** Campos do cadastro mais recente da propriedade (de qualquer programa) que a ficha repete: situação, responsável técnico, via de acesso, origem, destino. */
  async function reaproveitar(propId, M) {
    const out = { f: {}, rt: null, de: {}, campos: [] };
    if (!propId) return out;
    const cads = (await Store.todos('cadastrosPce')).filter(c => !Number(c.excluido) && c.propriedadeId === propId)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.atualizadoEm || b.emitidoEm || 0) - (a.atualizadoEm || a.emitidoEm || 0));
    (CAD.reaproveita || []).forEach(k => {
      for (const c of cads) {
        const v = lerJSON(c.dados, {})[k];
        if (k === 'rt') { if (M.rt && v && (v.nome || v.conselho)) { out.rt = { nome: v.nome || '', conselho: v.conselho || '' }; out.de[k] = c; break; } continue; }
        if (!M.campos.some(x => x.k === k)) return;
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
        out.f[k] = v; out.de[k] = c; break;
      }
    });
    out.campos = Object.keys(out.de);
    return out;
  }

  /* ---------- formulário ---------- */
  const valorCampo = c => {
    const n = N(), id = 'f-' + c.k;
    if (c.tipo === 'texto' || c.tipo === 'num') return n.g(PC, id);
    if (c.tipo === 'sn' || c.tipo === 'opcao') return n.rv(PC, id);
    if (c.tipo === 'varios') return n.cv(PC, id);
    return [...document.querySelectorAll(`#${PC}${id} .pc-lin`)].map(l => Object.fromEntries([...l.querySelectorAll('[data-col]')].map(i => [i.dataset.col, i.value.trim()]))).filter(l => Object.values(l).some(Boolean));
  };
  function linhaTabelaHTML(c, l, i) {
    const num = k => (['area', 'idade', 'plantas'].includes(k) ? 'inputmode="decimal"' : '');
    return `<div class="pc-lin" data-i="${i}">${c.colunas.map(([k, rot]) => `<label>${esc(rot)}<input data-col="${k}" value="${esc(l[k] == null ? '' : l[k])}" autocomplete="off" ${num(k)}></label>`).join('')}
      <button type="button" class="mini" data-pc="dellinha" aria-label="Remover linha">${icone('fechar')}</button></div>`;
  }
  function campoHTML(c, v, st) {
    const n = N(), id = 'f-' + c.k, se = c.se ? `data-sek="${c.se.k}" data-sev="${esc(c.se.v)}"` : '';
    let h;
    if (c.tipo === 'texto') h = n.inp(PC, id, esc(c.rot), v);
    else if (c.tipo === 'num') h = n.inp(PC, id, esc(c.rot), v, 'inputmode="decimal"');
    else if (c.tipo === 'sn') h = n.sn(PC, id, c.rot, v);
    else if (c.tipo === 'varios') h = `<p class="mon-sub">${esc(c.rot)}</p>${n.cks(PC, id, opcoes(c.ops), v)}`;
    else if (c.tipo === 'opcao') {
      const ops = opcoes(c.ops);
      h = ops.length > 4 || ops.some(o => o[1].length > 26)
        ? `<p class="mon-sub">${esc(c.rot)}</p><div class="mon-cks pc-lista">${ops.map(([x, t]) => `<label class="chk"><input type="radio" name="${PC}${id}" value="${esc(x)}" ${v === x ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>`
        : n.sn(PC, id, c.rot, v, ops);
    } else {
      const ls = Array.isArray(v) && v.length ? v : [{}];
      h = `<p class="mon-sub">${esc(c.rot)}</p><div id="${PC}${id}" class="pc-linhas">${ls.map((l, i) => linhaTabelaHTML(c, l, i)).join('')}</div>
        <button type="button" class="mini" data-pc="addlinha" data-k="${c.k}">${icone('mais')} Adicionar linha</button>`;
    }
    return `<div class="pc-campo" data-k="${c.k}" ${se}>${h}</div>`;
  }
  function deteccaoHTML(M, D, st) {
    const n = N();
    return (M.deteccao || []).map(it => {
      const d = D.det[it.k] || {}, fixo = st.fixos.det[it.k], tem = fixo || d.tem || '', id = x => `d-${it.k}-${x}`;
      const ex = it.extra || [];
      return `<div class="mon-fito pc-det" data-det="${it.k}"><b>${esc(it.rot)}</b>
        ${fixo ? `<p class="dica" style="text-align:left" id="mc-d-${it.k}-lev">${icone('check')} Do levantamento: ${fixo === 'sim' ? 'detectada ou suspeita' : 'não detectada'}.</p>` : n.sn(PC, id('tem'), 'Presença', tem)}
        ${ex.includes('tempo') ? `<div data-detse="tem">${n.inp(PC, id('tempo'), 'Há quanto tempo', d.tempo || '')}</div>` : ''}
        ${ex.includes('controle') ? n.sn(PC, id('controle'), 'Utiliza método de controle', d.controle || '') : ''}
        ${ex.includes('qual') ? `<div ${ex.includes('controle') ? 'data-detse="controle"' : ''}>${n.inp(PC, id('qual'), 'Qual', d.qual || '')}</div>` : ''}</div>`;
    }).join('');
  }
  function identHTML(D, st) {
    const n = N(), A = st.antigo, M = CAD[st.programa], campos = `
        <div class="campo-busca"><label>Buscar produtor/propriedade já cadastrados (nome, CPF ou código)<input id="${PC}busca" type="search" autocomplete="off"></label><div id="${PC}busca-res"></div></div>
        ${n.inp(PC, 'nome', 'Nome do produtor *', D.nome, 'autocapitalize="characters"')}
        <div class="duas">${n.inp(PC, 'doc', A ? 'CPF (opcional no papel)' : 'CPF *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}${n.inp(PC, 'cnpj', 'CNPJ', D.cnpj, 'inputmode="numeric"')}</div>
        <div id="${PC}st-doc" class="tf-status"></div>
        ${n.inp(PC, 'propriedade', 'Nome da propriedade', D.propriedade)}
        ${M.telefone ? n.inp(PC, 'telefone', 'Telefone', D.telefone, 'inputmode="tel" placeholder="(92) 90000-0000"') : ''}
        ${n.inp(PC, 'codigo', 'Código da propriedade (conforme IN nº 33/2016)', D.codigo)}
        <p class="mon-sub">Georreferenciamento</p>${n.coordHTML(PC, D, !A)}
        ${n.inp(PC, 'endereco', 'Endereço', D.endereco)}
        <div class="duas mon-mun"><label>Município *<select id="${PC}municipio">${n.opts(P.municipios, D.municipio, 'Selecione')}</select></label>${n.inp(PC, 'uf', 'UF', D.uf, 'maxlength="2" autocapitalize="characters"')}</div>`;
    if (!st.lev) return `<div class="card"><h3>1. Dados do produtor/proprietário</h3>${campos}</div>`;
    const li = ([r, v]) => (String(v || '').trim() ? `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>` : '');
    const resumo = [['Produtor', D.nome], ['CPF', D.doc], ['Propriedade', D.propriedade], ['CNPJ', D.cnpj], ['Telefone', M.telefone ? D.telefone : ''], ['Código da propriedade', D.codigo],
      ['Coordenadas', D.lat ? `${D.lat} / ${D.lon}` : ''], ['Endereço', D.endereco], ['Município/UF', [D.municipio, D.uf].filter(Boolean).join(' / ')]];
    return `<div class="card"><h3>1. Dados do produtor/proprietário</h3>
      <p class="dica" style="text-align:left">Vêm do levantamento da visita (${esc(dBR(st.lev.data))}); para corrigir, edite o levantamento.</p>
      <dl class="pce-ci-resumo" id="${PC}resumo">${resumo.map(li).join('')}</dl><div hidden>${campos}</div></div>`;
  }
  function formHTML(D, st) {
    const n = N(), U_ = U(), A = st.antigo, M = CAD[st.programa], tit = esc(M.nome), cx = M.campos;
    const numeroCard = `<div class="card"><h3>Nº do cadastro</h3>
        <label>Unidade (numeração) *<select id="${PC}unidade">${n.opts(P.municipios, D.unidade, 'Selecione')}</select></label>
        ${A ? `${st.novo || !st.rec ? n.inp(PC, 'numpapel', 'Nº do cadastro (como está no papel) *', D.numPapel, 'placeholder="ex.: 001-2026-AUTAZES ou 1" autocomplete="off"') : `<div class="tf-num"><b>${esc(st.rec.numeroTxt)}</b></div>`}
          <div id="${PC}numpapel-st" class="tf-status" aria-live="polite"></div>
          <div class="duas">${n.inp(PC, 'data', 'Data (do papel) *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${n.inp(PC, 'local', 'Local', D.local, 'placeholder="ex.: Autazes"')}</div>`
          : `<div class="tf-num">${st.rec ? `<b>${esc(st.rec.numeroTxt)}</b>` : '<small>Nº definido ao salvar (consulta a planilha; sem internet, provisório). A numeração é própria deste programa.</small>'}</div>`}
        ${st.deTermo ? '<p class="dica" style="text-align:left">Ao salvar, volta para o Termo de Fiscalização com este cadastro ligado.</p>' : ''}
        ${st.levId && st.lev ? '<p class="dica" style="text-align:left">Ao salvar, volta para o levantamento da visita.</p>' : ''}</div>`;
    return `<form id="monCadForm" class="mon-cadgen ${A ? 'pce-antigo' : ''}" data-programa="${st.programa}" autocomplete="off" novalidate>
      ${A ? n.topoPapel(st.novo ? `${M.nome} — digitar do papel` : `Editar ${M.nome.toLowerCase()} (do papel)`, st.novo) + U_.servAntigoHTML(PC, D, st.lembrados)
        : `<div class="card mon-topo"><h3>${icone('propriedade')} ${st.novo ? tit : 'Editar ' + tit}</h3>
          <p class="dica" style="text-align:left">Servidor: <b>${esc(st.serv.servidor)}</b> · ${esc(st.serv.cargo)} · ${esc(st.serv.lotacao)}</p></div>`}
      ${numeroCard}
      ${M.comercial ? `<div class="card" id="${PC}g-comercial">${n.sn(PC, 'comercial', 'Propriedade comercial?', D.comercial)}
        <div id="${PC}g-naocom" ${D.comercial === 'sim' ? 'hidden' : ''}>${n.sn(PC, 'tipoNaoComercial', 'Propriedade não comercial', D.tipoNaoComercial, MO.tiposNaoComercial || [['outros', 'Outros']])}
        ${n.inp(PC, 'tipoOutros', 'Outros (qual)', D.tipoOutros)}</div></div>` : ''}
      ${identHTML(D, st)}
      <div class="card"><h3>${M.deteccao ? '2. Dados da cultura e da propriedade' : '2. Dados da propriedade'}</h3>
        ${st.reaproveitados.length ? `<p class="dica" style="text-align:left" id="${PC}reaproveitados">${icone('info')} Copiado do cadastro anterior desta propriedade: ${esc(st.reaproveitados.join(', '))}. Confira.</p>` : ''}
        ${cx.map(c => campoHTML(c, D.f[c.k], st)).join('')}</div>
      ${M.deteccao ? `<div class="card"><h3>3. Levantamento de detecção</h3>${deteccaoHTML(M, D, st)}${M.amostra ? amostraHTML(D, st) : ''}</div>` : ''}
      ${M.rt ? `<div class="card"><h3>Responsável técnico${st.programa === 'propriedade' ? ' (se houver)' : ''}</h3><div class="duas">${n.inp(PC, 'rt-nome', 'Nome', D.rt.nome)}${n.inp(PC, 'rt-conselho', 'Nº do conselho', D.rt.conselho)}</div></div>` : ''}
      ${A ? n.pdfHTML(PC) : !CONFIG.assinaturaNaTela ? '' : `<div class="card"><h3>Assinaturas (opcional)</h3><p class="dica" style="text-align:left">O PDF sempre traz as linhas para assinar no papel.</p>${n.assHTML('servidor', 'Servidor da ADAF')}${n.assHTML('produtor', 'Produtor/proprietário')}</div>`}
      <button class="botao" type="submit" id="${PC}salvar">${icone('salvar')} Salvar cadastro</button>
      ${A && st.novo && !st.levId ? `<button class="botao" type="button" data-mon="salvaroutro" id="${PC}salvar-outro">${icone('salvar')} Salvar e digitar outro</button>` : ''}
      <button class="botao sec" type="button" data-mon="descartar">Descartar</button></form>`;
  }
  function amostraHTML(D, st) {
    const n = N(), fx = st.fixos.amostra, a = fx || D.amostra;
    return `<div class="mon-fito" id="${PC}a-bloco"><b>Colheita de amostras</b>
      ${fx ? `<p class="dica" style="text-align:left" id="${PC}a-lev">${icone('check')} Do levantamento: ${fx.tem === 'sim' ? 'houve colheita' + (fx.tipo ? ' (' + esc(fx.tipo) + ')' : '') : 'sem colheita'}.</p>`
        : `${n.sn(PC, 'a-tem', 'Colheita de amostras', a.tem || '')}<div data-detse="a-tem">${n.inp(PC, 'a-tipo', 'Tipo de material coletado', a.tipo || '')}</div>`}</div>`;
  }

  /** Mostra/esconde o que depende de outra resposta (ficha: "se ... sim"). */
  function atualizar() {
    const f = $('#monCadForm'); if (!f || !f.classList.contains('mon-cadgen')) return;
    const n = N(), st = n.estado(), M = CAD[st.programa], campo = k => M.campos.find(c => c.k === k);
    f.querySelectorAll('.pc-campo[data-sek]').forEach(w => {
      const ctl = f.querySelector(`.pc-campo[data-k="${w.dataset.sek}"]`), c = campo(w.dataset.sek);
      const v = ctl && c ? valorCampo(c) : '';
      w.hidden = !(ctl && !ctl.hidden && (Array.isArray(v) ? v.includes(w.dataset.sev) : v === w.dataset.sev));
    });
    f.querySelectorAll('[data-detse]').forEach(w => {
      const ctl = w.dataset.detse, det = w.closest('.pc-det');
      if (ctl === 'a-tem') { w.hidden = (st.fixos.amostra ? st.fixos.amostra.tem : n.rv(PC, 'a-tem')) !== 'sim'; return; }
      const k = det.dataset.det; w.hidden = (ctl === 'tem' ? (st.fixos.det[k] || n.rv(PC, `d-${k}-tem`)) : n.rv(PC, `d-${k}-${ctl}`)) !== 'sim';
    });
    const nc = $('#' + PC + 'g-naocom'); if (nc) nc.hidden = n.rv(PC, 'comercial') === 'sim';
  }
  function coletar() {
    const n = N(), st = n.estado(), M = CAD[st.programa], g = x => n.g(PC, x);
    const D = { unidade: g('unidade'), numPapel: g('numpapel'), data: g('data'), local: g('local'), sNome: g('snome'), sCargo: U().cargoValor(PC + 'scargo'), sMatricula: g('smatricula'),
      sLotacao: g('slotacao'), nome: g('nome'), doc: g('doc'), cnpj: g('cnpj'), propriedade: g('propriedade'), telefone: g('telefone'), codigo: g('codigo'), lat: g('lat'), lon: g('lon'),
      endereco: g('endereco'), municipio: g('municipio'), uf: g('uf'), comercial: n.rv(PC, 'comercial'), tipoNaoComercial: n.rv(PC, 'tipoNaoComercial'), tipoOutros: g('tipoOutros'),
      f: {}, det: {}, amostra: { tem: st.fixos.amostra ? st.fixos.amostra.tem : n.rv(PC, 'a-tem'), tipo: st.fixos.amostra ? st.fixos.amostra.tipo : g('a-tipo') }, rt: { nome: g('rt-nome'), conselho: g('rt-conselho') } };
    M.campos.forEach(c => { D.f[c.k] = valorCampo(c); });
    (M.deteccao || []).forEach(it => { D.det[it.k] = { tem: st.fixos.det[it.k] || n.rv(PC, `d-${it.k}-tem`), tempo: g(`d-${it.k}-tempo`), controle: n.rv(PC, `d-${it.k}-controle`), qual: g(`d-${it.k}-qual`) }; });
    return D;
  }

  /* ---------- abrir ---------- */
  async function abrir(o, rec0, rasc, s) {
    const n = N(), modelo = rasc ? rasc.programa : rec0 ? rec0.programa : o.programa;
    let st;
    if (rasc) {
      const rec = rasc.id ? await Store.obter('cadastrosPce', rasc.id) : null;
      st = { tipo: 'cadastro', programa: modelo, id: rasc.id, novo: !rec, rec, antigo: !!rasc.antigo, docs: rasc.docs || [], ass: rec ? lerJSON(rec.assinaturas, {}) : {}, assNovas: rasc.assNovas || {},
        deTermo: !!rasc.deTermo, propriedadeId: rasc.propriedadeId || '', levId: rasc.levId || '' };
    } else if (rec0) {
      st = { tipo: 'cadastro', programa: modelo, id: rec0.id, novo: false, rec: rec0, antigo: Number(rec0.registroAntigo) === 1, docs: lerJSON(rec0.documentos, []), ass: lerJSON(rec0.assinaturas, {}),
        assNovas: {}, propriedadeId: rec0.propriedadeId || '', levId: '' };
    } else {
      st = { tipo: 'cadastro', programa: modelo, id: Store.novoId(), novo: true, rec: null, antigo: !!o.antigo, docs: [], ass: {}, assNovas: {},
        deTermo: !!o.deTermo, propriedadeId: o.propId || o.propIdLig || '', levId: o.levId || '' };
    }
    const cat = await catalogo();
    const lev0 = st.levId ? await Store.obter('levantamentos', st.levId) : null;
    st.lev = lev0 && !lev0.excluido ? lev0 : null;
    st.fixos = fixosDoLevantamento(st.lev, CAD[modelo], modelo, cat);
    st.reaproveitados = [];
    let D;
    if (rasc) D = completar(CAD[modelo], rasc.dados);
    else if (rec0) D = deRegistro(rec0, CAD[modelo]);
    else {
      D = vazio(CAD[modelo]);
      if (!st.antigo) Object.assign(D, { unidade: s.lotacao || '', data: hojeISO(), municipio: s.lotacao || '', local: s.lotacao || '' });
      else Object.assign(D, o.manter || {});
      if (o.prefill) Object.assign(D, Object.fromEntries(Object.entries(o.prefill).filter(([, v]) => v !== '' && v != null)));
      const dados = st.lev ? doLevantamento(st.lev, CAD[modelo], modelo, cat) : {}, cat0 = CAD[modelo];
      if (st.propriedadeId && !st.lev) {                                         // propriedade já cadastrada (mapa, lista): produtor, endereço, coordenadas
        const pd = await n.dadosDaPropriedade(st.propriedadeId); delete pd.propriedadeId;
        Object.assign(D, Object.fromEntries(Object.entries({ nome: pd.nome, doc: pd.doc, propriedade: pd.propriedade, cnpj: pd.cnpj, municipio: pd.municipio, uf: pd.uf, endereco: pd.endereco,
          lat: pd.lat, lon: pd.lon, telefone: pd.telefone, comercial: pd.comercial, tipoNaoComercial: pd.tipoNaoComercial }).filter(([, v]) => v)));
        if (pd.viaAcesso && cat0.campos.some(c => c.k === 'viaAcesso')) D.f.viaAcesso = pd.viaAcesso;
      }
      const f = dados.f || {}; delete dados.f;
      Object.assign(D, Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== '' && v != null)));
      if (st.lev && st.antigo) Object.assign(D, { sNome: st.lev.servidor || D.sNome, sCargo: st.lev.cargo || D.sCargo, sMatricula: st.lev.matricula || D.sMatricula, sLotacao: st.lev.lotacao || D.sLotacao });
      const re = await reaproveitar(st.propriedadeId || (st.lev ? n.propIdDe(digitos(st.lev.doc), st.lev.nome, st.lev.propriedade, st.lev.endereco) : ''), cat0);
      Object.keys(re.f).forEach(k => { if (!(f[k] != null && f[k] !== '' && !(Array.isArray(f[k]) && !f[k].length))) f[k] = re.f[k]; });
      if (re.rt && !D.rt.nome && !D.rt.conselho) D.rt = re.rt;
      Object.assign(D.f, f);
      st.reaproveitados = re.campos.map(k => (k === 'rt' ? 'responsável técnico' : (cat0.campos.find(c => c.k === k) || {}).rot || k).toLowerCase());
      if (st.lev && !st.propriedadeId) st.propriedadeId = n.propIdDe(digitos(st.lev.doc), st.lev.nome, st.lev.propriedade, st.lev.endereco);
      if (st.lev && st.lev.data && !st.antigo) D.data = st.lev.data;
    }
    st.vivo = true; st.serv = st.rec && !st.antigo ? { servidor: st.rec.servidor, cargo: st.rec.cargo, matricula: st.rec.matricula, lotacao: st.rec.lotacao } : U().dadosServidor(s);
    if (st.antigo) st.lembrados = await U().servidoresLembrados();
    st.coletar = coletar; st.salvar = salvar;
    n.definir(st);
    view(formHTML(D, st));
    n.mostrarCoord(PC); n.mostrarNumPapel(PC, 'cadastro'); n.avisoDoc(PC);
    if (st.antigo) await n.renderDocs(PC); else { await n.ligarAss('servidor'); await n.ligarAss('produtor'); }
    atualizar();
    const f = $('#monCadForm');
    f.addEventListener('input', e => {
      const tid = e.target.id;
      if (tid === PC + 'busca') return n.buscarProdutor(PC);
      if (tid === PC + 'lat' || tid === PC + 'lon') n.mostrarCoord(PC);
      if ([PC + 'numpapel', PC + 'unidade', PC + 'data'].includes(tid)) n.mostrarNumPapel(PC, 'cadastro');
      atualizar(); n.agendar();
    });
    f.addEventListener('change', async e => {
      const el = e.target;
      if (el.id === PC + 'pdfs') return n.adicionarPDFs(el, PC);
      if (el.id === PC + 'snome') await U().completarServidor(PC);
      if (el.id === PC + 'doc' || el.id === PC + 'cnpj') { el.value = PCEDocs.fmtDoc(digitos(el.value)) || el.value; n.avisoDoc(PC); }
      if (el.id === PC + 'municipio' && !n.g(PC, 'local') && st.antigo) $('#' + PC + 'local').value = el.value;
      if ([PC + 'numpapel', PC + 'unidade', PC + 'data'].includes(el.id)) n.mostrarNumPapel(PC, 'cadastro');
      atualizar(); n.agendar();
    });
    f.addEventListener('click', e => {
      const b = e.target.closest('[data-pc]');
      if (!b) { setTimeout(atualizar); return; }                               // botão sim/não que desmarca (moniliase.js) não dispara "change"
      const c = CAD[st.programa].campos.find(x => x.k === (b.dataset.k || (b.closest('.pc-campo') || {}).dataset?.k));
      if (b.dataset.pc === 'addlinha') {
        const box = $(`#${PC}f-${c.k}`);
        if (box.children.length >= MAX_LINHAS) return toast(`Limite de ${MAX_LINHAS} linhas.`, true);
        box.insertAdjacentHTML('beforeend', linhaTabelaHTML(c, {}, box.children.length)); box.lastElementChild.querySelector('input').focus();
      } else if (b.dataset.pc === 'dellinha') {
        const box = b.closest('.pc-linhas'); b.closest('.pc-lin').remove();
        if (!box.children.length) box.insertAdjacentHTML('beforeend', linhaTabelaHTML(c, {}, 0));
      }
      n.agendar();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvar(false); };
    const p1 = $(st.antigo ? (D.sNome ? '#mc-numpapel' : '#mc-snome') : (st.lev ? '#mc-unidade' : '#mc-nome')); if (p1 && st.novo) p1.focus();
  }

  /* ---------- salvar ---------- */
  const texto = (v, max = 200) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
  /** Campos da ficha no formato gravado: texto limpo, números como "2,5", lista só com o que a ficha conhece; o que ficou escondido (depende de outra resposta) não vai. */
  function dadosDosCampos(M, D) {
    const n = N(), f = $('#monCadForm'), out = {};
    M.campos.forEach(c => {
      const w = f.querySelector(`.pc-campo[data-k="${c.k}"]`); let v = D.f[c.k];
      if (w && w.hidden) v = campoVazio(c);
      if (c.tipo === 'num') v = n.area(v);
      else if (c.tipo === 'texto') v = texto(v);
      else if (c.tipo === 'varios') { const ops = opcoes(c.ops).map(x => x[0]); v = (v || []).filter(x => ops.includes(x)); }
      else if (c.tipo === 'opcao') { const ops = opcoes(c.ops).map(x => x[0]); v = ops.includes(v) ? v : ''; }
      else if (c.tipo === 'sn') v = v === 'sim' || v === 'nao' ? v : '';
      else v = (v || []).slice(0, MAX_LINHAS).map(l => Object.fromEntries(c.colunas.map(([k]) => [k, texto(l[k], 120)])));
      out[c.k] = v;
    });
    return out;
  }
  async function salvar(outro) {
    const n = N(), st = n.estado(); if (!st || !st.vivo || st.salvando || st.tipo !== 'cadastro' || !ehGenerico(st.programa)) return;
    const M = CAD[st.programa], D = coletar(), A = st.antigo, doc = digitos(D.doc), cnpj = digitos(D.cnpj);
    let sv = null, papel = null;
    if (A && !(sv = U().servidorDigitado(PC))) return;
    if (!D.unidade) return toast('Escolha a unidade da numeração.', true);
    if (!D.nome.trim()) return toast('Informe o nome do produtor.', true);
    if (!n.docConfere(doc, A)) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    const co = n.lerPar(D.lat, D.lon); if (co.erro) return toast('Coordenadas: ' + co.erro, true);
    if (A) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(D.data)) return toast('Informe a data que está no papel.', true);
      if (D.data > hojeISO()) return toast('A data não pode estar no futuro. Confira o papel.', true);
      if (st.novo) { papel = n.lerNumeroDoc(D.numPapel, D.unidade, D.data); if (papel.erro) { n.mostrarNumPapel(PC, 'cadastro'); return toast(papel.erro, true); } }
    }
    const btns = [$('#mc-salvar'), $('#mc-salvar-outro')].filter(Boolean); btns.forEach(b => { b.disabled = true; }); st.salvando = true;
    try {
      const nome = texto(D.nome, 120).toUpperCase(), campos = dadosDosCampos(M, D), tb = M.campos.find(c => c.tipo === 'tabela');
      const nao = D.comercial === 'nao', tipoNao = (MO.tiposNaoComercial || []).some(x => x[0] === D.tipoNaoComercial) ? D.tipoNaoComercial : '';
      const dados = { v: 1, modelo: st.programa, levantamentoId: st.lev ? st.lev.id : '', codigoPropriedade: texto(D.codigo, 60), endereco: texto(D.endereco), ...campos };
      if (M.telefone) dados.telefone = texto(D.telefone, 40);
      if (M.comercial) Object.assign(dados, { comercial: D.comercial === 'sim' || nao ? D.comercial : '', tipoNaoComercial: nao ? tipoNao : '', tipoOutros: nao && tipoNao === 'outros' ? texto(D.tipoOutros) : '' });
      if (M.rt) dados.rt = { nome: texto(D.rt.nome, 120), conselho: texto(D.rt.conselho, 40) };
      if (M.deteccao) {
        dados.deteccao = {};
        M.deteccao.forEach(it => {
          const d = D.det[it.k] || {}, ex = it.extra || [], tem = d.tem === 'sim' || d.tem === 'nao' ? d.tem : '', ctl = d.controle === 'sim' || d.controle === 'nao' ? d.controle : '';
          dados.deteccao[it.k] = { tem, origem: st.fixos.det[it.k] ? 'levantamento' : 'campo', tempo: ex.includes('tempo') && tem === 'sim' ? texto(d.tempo, 60) : '', controle: ex.includes('controle') ? ctl : '',
            qual: ex.includes('qual') && (!ex.includes('controle') || ctl === 'sim') ? texto(d.qual) : '' };
        });
      }
      if (M.amostra) { const a = D.amostra; dados.amostra = { tem: a.tem === 'sim' || a.tem === 'nao' ? a.tem : '', tipo: a.tem === 'sim' ? texto(a.tipo) : '', origem: st.fixos.amostra ? 'levantamento' : 'campo' }; }
      const totalPlantas = tb && tb.colunas.some(c => c[0] === 'plantas') ? (campos[tb.k] || []).reduce((t, l) => t + (Number(n.inteiro(l.plantas)) || 0), 0) : 0;
      const { mapa, novos } = Anexos.prepararAssinaturas({ ...st, dono: 'cadastrosPce' });
      await Store.gravarVarios('arquivos', novos);
      const propriedadeId = (st.rec && st.rec.propriedadeId) || st.propriedadeId || n.propIdDe(doc, nome, D.propriedade, D.endereco);
      const base = { ...(st.rec || {}) }; delete base.pendente; delete base.provisorio;
      const rec = { ...base, id: st.id, programa: st.programa, unidade: n.unid(D.unidade), propriedadeId, doc, nome, propriedade: texto(D.propriedade, 120), cnpj,
        data: A ? D.data : (base.data || D.data || hojeISO()), hora: A ? '' : (base.hora || (st.lev && st.lev.hora) || agoraHM()), municipio: D.municipio, uf: (D.uf || 'AM').trim().toUpperCase(),
        lat: co.vazio ? '' : co.lat, lon: co.vazio ? '' : co.lon, ...(sv || st.serv), local: (A ? D.local : (base.local || D.municipio)).trim(), dados: JSON.stringify(dados),
        totalPlantas, fotos: base.fotos || '[]', assinaturas: JSON.stringify(mapa), documentos: JSON.stringify(st.docs), registroAntigo: A ? 1 : 0, excluido: 0 };
      const pessoa = await n.montarPessoa(doc, { nome, endereco: dados.endereco, municipio: D.municipio, uf: rec.uf, telefone: dados.telefone || '' });
      const prop = await n.montarProp(propriedadeId, { nome: rec.propriedade, doc, municipio: D.municipio, lat: rec.lat, lon: rec.lon, cnpj, viaAcesso: campos.viaAcesso || '',
        comercial: dados.comercial || '', tipoPropriedade: dados.tipoNaoComercial || '', endereco: dados.endereco, uf: rec.uf });
      if (st.novo) { if (!(await n.numerarEGravar('cadastro', rec, pessoa, prop, papel))) return; }
      else {
        await Store.salvar('cadastrosPce', rec);
        if (pessoa) await Store.salvar('pessoas', pessoa);
        await Store.salvar('propriedades', prop);
      }
      if (sv) await U().lembrarServidor(sv);
      const antes = Anexos.idsArquivos(st.rec), depois = new Set([...st.docs, ...Object.values(mapa)]);
      await Anexos.apagarSeNaoEnviado([...antes].filter(x => !depois.has(x)));
      const deTermo = st.deTermo, levId = st.levId; n.fechar(); await Store.setMeta(n.RASC.cadastro, null);
      Sync.sincronizar();
      if (deTermo) { toast('Cadastro salvo. Voltando ao Termo de Fiscalização.'); return go('pcetf', { retomar: true, cadastroId: rec.id }); }
      if (levId) { toast(`Cadastro de ${rotulo(st.programa).toLowerCase()} ${rec.numeroTxt || ''} salvo. Voltando ao levantamento da visita.`); return go('pcelevpronto', levId); }
      if (outro) { toast(`Cadastro ${rec.numeroTxt || ''} salvo. Digite o próximo.`); return go('pcecad', { antigo: true, programa: st.programa, manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data, local: D.local.trim() } }); }
      go('pcecadpronto', rec.id);
    } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
    finally { st.salvando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }

  return { ehGenerico, rotulo, nomeModelo, modelosAvulsos, catalogo, modeloDaCultura, modelosDaVisita, culturasDoModelo, resultadoDaPraga, situacaoDoLev, abrir, GEN };
})();
