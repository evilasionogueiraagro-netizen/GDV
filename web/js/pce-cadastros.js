// PCE — cadastro do produtor, da propriedade e dos frutos; tela do produtor; fichas oficiais; catálogo de culturas e pragas.
//
// O cadastro é UM formulário (produtor + propriedade + frutos): cada dado é perguntado uma vez. Os frutos (cultura, cultivar, área, espaçamento,
// idade, quantidade, produção e destino) ficam na propriedade e alimentam a tabela de cultura de todas as fichas oficiais. A ficha oficial é gerada
// a partir do cadastro (CONFIG.PCE.fichas), nunca bloqueia o Termo e só pergunta o que é próprio do modelo e ainda não foi respondido.
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM, pegarLocal), do pce.js (PCEUI), do moniliase.js (PCEMon.nucleo) e do docs.js.
const PCECads = (() => {
  const P = CONFIG.PCE, FI = P.fichas, CI = P.citros || {};
  const N = () => PCEMon.nucleo, U = () => PCEUI;
  const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nk = s => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const idCat = s => nk(s).replace(/ /g, '-').slice(0, 60);
  const digitos = v => String(v || '').replace(/\D/g, '');
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const arr = x => (Array.isArray(x) ? x : []);
  const MAX_FRUTOS = 60;

  /* ================= catálogo de culturas e pragas (recebido no sync) ================= */
  let CAT = null;                                                        // null: aparelho que ainda não recebeu o catálogo (só as listas do config.js)
  async function carregarCatalogo() { const c = await Store.meta('catalogoPce'); CAT = c && Array.isArray(c.culturas) && Array.isArray(c.pragas) ? c : null; return CAT; }
  const culturas = () => (CAT ? CAT.culturas.filter(c => Number(c.ativo) !== 0).map(c => c.nome) : P.culturas);
  const pragasCat = () => (CAT ? CAT.pragas.filter(p => Number(p.ativo) !== 0) : P.pragas.map(n => ({ id: idCat(n), nomePopular: n })));
  /** levantamento = 0: praga ausente no Brasil (só educação sanitária), fora da avaliação. */
  const temLevantamento = p => Number(p.levantamento) !== 0;
  /** Nome gravado: o da lista antiga (config.js) quando é a mesma praga, porque o Termo e a legislação reconhecem por ele; senão o nome popular. */
  const nomeDaPraga = p => P.pragas.find(n => idCat(n) === p.id) || p.nomePopular;
  const pragaPorNome = nome => { const k = idCat(nome); return k ? pragasCat().find(p => p.id === k || idCat(p.nomePopular) === k) || null : null; };
  /** Praga opcional (Moko, Pinta Preta...): resposta não obrigatória e sem Termo próprio (entra no Termo do programa dela). */
  const opcional = nome => { const p = pragaPorNome(nome); return !!(p && Number(p.opcional) === 1); };
  /** Programa da praga (um Termo por programa): o que ela divide com outras (Citros) ou ela mesma. */
  const programaDaPraga = nome => {
    const p = pragaPorNome(nome);
    if (p && p.programa) return { programa: idCat(p.programa), nome: p.programa };
    if (!CAT && PCECitros.ehCitros(nome)) return { programa: 'pragas-dos-citros', nome: 'Pragas dos Citros' };
    return p ? { programa: p.id, nome: p.nomeNoTF || p.nomePopular } : { programa: idCat(nome), nome: String(nome) };
  };
  const culturaDe = nome => (CAT ? CAT.culturas.find(x => x.id === idCat(nome) || idCat(x.nome) === idCat(nome)) : null) || null;
  /** Pragas da cultura no catálogo: as ligadas à família dela e as ligadas só a ela. */
  function pragasLigadas(nomeCultura) {
    const c = CAT && nomeCultura ? culturaDe(nomeCultura) : null; if (!c) return [];
    const ids = new Set([...(CAT.pragasDasFamilias || []).filter(l => c.familiaId && l.familiaId === c.familiaId).map(l => l.pragaId),
      ...(CAT.pragasDasCulturas || []).filter(l => l.culturaId === c.id).map(l => l.pragaId)]);
    return pragasCat().filter(p => ids.has(p.id) && temLevantamento(p));
  }
  /** Restrição praga x cultura (CONFIG.PCE.hospedeiros): praga listada só é oferecida nas culturas e famílias dela e nas ligadas a ela no catálogo. */
  function pragaServeCultura(p, nomeCultura) {
    const H = P.hospedeiros || {}, k = Object.keys(H).find(n => idCat(n) === p.id), c = CAT && nomeCultura ? culturaDe(nomeCultura) : null;
    if (!k || !c) return true;
    const fam = CAT.familias.find(f => f.id === c.familiaId), h = H[k];
    return (h.culturas || []).some(n => idCat(n) === c.id) || (!!fam && (h.familias || []).some(n => idCat(n) === fam.id)) || pragasLigadas(c.nome).some(x => x.id === p.id);
  }
  /** Pragas que ainda se pode acrescentar a uma cultura (catálogo e hospedeiros), fora as que já vêm sozinhas. */
  const pragasExtras = nomeCultura => { const lig = new Set(pragasLigadas(nomeCultura).map(p => p.id)); return pragasCat().filter(p => !lig.has(p.id) && temLevantamento(p) && pragaServeCultura(p, nomeCultura)); };
  /** Modelo de ficha de uma cultura: o da família dela no catálogo; sem catálogo, a lista do config; sem família, a ficha da propriedade. */
  function modeloDaCultura(nome) {
    const c = culturaDe(nome);
    if (c) { const f = c.familiaId && CAT.familias.find(x => x.id === c.familiaId); return (f && f.modeloCadastro) || 'propriedade'; }
    return PCEDocs.modeloDaCultura(nome);
  }
  const rotulo = m => ((P.cadastros || {}).rotulos || {})[m] || (FI.modelos[m] || {}).nome || m;

  /* ================= frutos ================= */
  const frutosDe = p => arr(lerJSON(p && p.frutos, [])).filter(f => f && typeof f === 'object' && !Number(f.excluido));
  const frutoVazio = () => ({ id: Store.novoId(), cultura: '', cultivar: '', area: '', espLinha: '', espPlanta: '', espUnidade: 'm', idade: '', quantidade: '', producao: '', destino: '', excluido: 0 });
  const numTxt = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
  const NUM = /^\d+([.,]\d+)?$/;
  const espTxt = f => (f.espLinha === '' && f.espPlanta === '' ? '' : `${numTxt(f.espLinha)} x ${numTxt(f.espPlanta)} ${f.espUnidade || 'm'}`);
  /** Resumo de uma linha de fruto (tela do produtor). */
  const resumoFruto = f => [f.cultura + (f.cultivar ? ' (' + f.cultivar + ')' : ''), f.area !== '' && f.area != null ? numTxt(f.area) + ' ha' : '', f.quantidade !== '' && f.quantidade != null ? numTxt(f.quantidade) + ' plantas' : ''].filter(Boolean).join(' · ');
  function cultivaresDe(cultura) {
    const c = culturaDe(cultura), l = c && c.cultivares ? String(c.cultivares).split(/[;,]/).map(x => x.trim()).filter(Boolean) : [];
    return l.length ? l : modeloDaCultura(cultura) === 'citros' ? CI.cultivares || [] : [];
  }
  function frutoHTML(f, i) {
    const u = esc(f.id), inp = (cls, rot, extra = '') => `<label>${rot}<input class="f-${cls}" value="${esc(f[cls])}" maxlength="80" autocomplete="off" ${extra}></label>`;
    const cult = cultivaresDe(f.cultura);
    return `<div class="pce-cultura pc-fruto" data-i="${i}" data-id="${u}"><div class="pce-cultura-topo"><b>${icone('broto')} Fruto ${i + 1}${f.sugerido ? ' <small>(sugestão do histórico)</small>' : ''}</b>
        <button type="button" class="mini" data-cad="delfruto" data-i="${i}" aria-label="Remover fruto ${i + 1}">Remover</button></div>
      <label>Cultura *<select class="f-cultura">${U().opts(culturas(), f.cultura, 'Selecione')}</select></label>
      <div class="duas">${inp('cultivar', 'Cultivar', `list="pp-cultivares-${i}"`)}${inp('area', 'Área (ha)', 'inputmode="decimal"')}</div>
      <datalist id="pp-cultivares-${i}">${cult.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <fieldset class="pce-esp"><legend>Espaçamento</legend><div class="pce-esp-un" role="radiogroup" aria-label="Unidade do espaçamento">${['m', 'cm'].map(x =>
        `<label><input type="radio" class="f-espUnidade" name="esp-${u}" value="${x}" ${f.espUnidade === x ? 'checked' : ''}><span>${x === 'm' ? 'Metros' : 'Centímetros'}</span></label>`).join('')}</div>
        <div class="duas">${inp('espLinha', 'Entre linhas', 'inputmode="decimal"')}${inp('espPlanta', 'Entre plantas', 'inputmode="decimal"')}</div></fieldset>
      <div class="duas">${inp('idade', 'Idade (anos)', 'inputmode="decimal"')}${inp('quantidade', 'Quantidade (plantas)', 'inputmode="numeric"')}</div>
      <div class="duas">${inp('producao', 'Produção (t/ano ou sacas/ha/ano)', 'inputmode="decimal"')}${inp('destino', 'Destino da produção')}</div></div>`;
  }

  /* ================= formulário único: produtor, propriedade e frutos ================= */
  let S = null;                                                           // formulário aberto: {doc, propId, frutos, salvos, rec}
  const propIdDe = (codigo, doc, nome) => (String(codigo || '').trim() || (doc && String(nome || '').trim()
    ? doc + '|' + semAcento(nome).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() : '')).slice(0, 64).trim();
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input id="pp-${id}" value="${esc(v == null ? '' : v)}" ${extra}></label>`;
  const coordTxt = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
  const viaOps = FI.vias.map(([c, t]) => [c, t[0] + t.slice(1).toLowerCase()]);
  const comercialOps = [['', 'Não informado'], ['sim', 'Sim'], ['nao', 'Não']];
  function formHTML(D, F) {
    const novoDoc = !F.docFixo;
    return `<form id="pceProdForm" autocomplete="off" novalidate>
    <div class="card"><h3>${icone('pessoa')} Produtor</h3>
      <div class="pce-busca">${campo('doc', 'CPF / CNPJ *', D.doc, `inputmode="numeric" placeholder="000.000.000-00" ${novoDoc ? '' : 'readonly'}`)}
        ${novoDoc ? `<button type="button" class="mini" data-cad="consultar" aria-label="Consultar cadastro">${icone('busca')}</button>` : ''}</div>
      <div id="pp-st-doc" class="tf-status" aria-live="polite"></div>
      ${campo('nome', 'Nome completo / Razão social *', D.nome)}
      <div class="duas">${campo('telefone', 'Telefone', D.telefone, 'type="tel"')}${campo('email', 'E-mail', D.email, 'type="email"')}</div></div>
    <div class="card"><h3>${icone('propriedade')} Propriedade</h3>
      ${campo('prop', 'Nome da propriedade', D.propriedade)}
      <div class="duas">${campo('codigo', 'Código (IN 33/2016)', D.codigo, 'maxlength="60"')}<label>Situação fundiária<select id="pp-situacao">${U().opts(P.situacoes, D.situacao, 'Selecione')}</select></label></div>
      <div class="duas pce-mun-uf"><label>Município *<select id="pp-municipio">${U().opts(P.municipios, D.municipio, 'Selecione')}</select></label>${campo('uf', 'UF', D.uf, 'maxlength="2" autocapitalize="characters"')}</div>
      ${campo('endereco', 'Endereço', D.endereco, 'maxlength="200" placeholder="ex.: Ramal do Km 3, s/n — Comunidade"')}
      <div class="duas"><label>Via de acesso<select id="pp-via">${[['', 'Não informada'], ...viaOps].map(([v, t]) => `<option value="${v}" ${D.via === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Propriedade comercial?<select id="pp-comercial">${comercialOps.map(([v, t]) => `<option value="${v}" ${D.comercial === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      <label id="pp-tipo-l" ${D.comercial === 'nao' ? '' : 'hidden'}>Tipo (propriedade não comercial)<select id="pp-tipo">${U().opts(FI.naoComercial.map(x => x[1]), D.tipo, 'Selecione')}</select></label>
      <div class="duas">${campo('cnpj', 'CNPJ da propriedade/empresa', D.cnpj, 'inputmode="numeric" placeholder="00.000.000/0000-00"')}${campo('empresa', 'Empresa / nome fantasia', D.empresa, 'maxlength="120"')}</div>
      <div id="pp-st-cnpj" class="tf-status" aria-live="polite"></div>
      <div class="duas">${campo('lat', 'Latitude', D.lat, 'inputmode="text" placeholder="-3,60033"')}${campo('lon', 'Longitude', D.lon, 'inputmode="text" placeholder="-59,15044"')}</div>
      <div id="pp-coord-st" class="tf-status" aria-live="polite"></div>
      <div class="pce-gps"><span id="pp-gps-st" class="dica"></span><button type="button" class="mini" data-cad="gps">${icone('local')} Usar GPS</button></div></div>
    <div class="card"><h3>${icone('broto')} Frutos da propriedade</h3>
      <p class="dica" style="text-align:left">Cultura, cultivar, área e o resto são perguntados só aqui; a visita e as fichas oficiais usam estes dados.</p>
      ${F.sugerido ? `<div class="tf-novo" id="pp-sugestao">${icone('sugerir')} Sugestão feita com os levantamentos antigos desta propriedade. Confira, ajuste e salve: só vira cadastro ao salvar.</div>` : ''}
      <div id="pp-frutos"></div>
      <button type="button" class="botao sec" data-cad="addfruto" id="pp-addfruto">+ Adicionar fruto</button></div>
    <button class="botao" type="submit" id="pp-salvar">${icone('salvar')} Salvar</button>
    <button class="botao sec" type="button" data-cad="cancelarform">Cancelar</button></form>`;
  }
  function desenharFrutos() {
    const el = $('#pp-frutos'); if (!el || !S) return;
    el.innerHTML = S.frutos.length ? S.frutos.map(frutoHTML).join('') : '<p class="dica" style="text-align:left" id="pp-semfrutos">Nenhum fruto cadastrado. Toque em “Adicionar fruto”.</p>';
  }
  /** Frutos do formulário como estão na tela (a lista em memória acompanha, para redesenhar sem perder o que foi digitado). */
  function coletarFrutos() {
    return [...document.querySelectorAll('#pp-frutos .pc-fruto')].map((b, i) => {
      const q = c => (b.querySelector('.f-' + c) || { value: '' }).value.trim(), base = S.frutos[i] || {};
      return { ...base, id: b.dataset.id, cultura: q('cultura'), cultivar: q('cultivar'), area: q('area').replace(',', '.'), espLinha: q('espLinha').replace(',', '.'), espPlanta: q('espPlanta').replace(',', '.'),
        espUnidade: (b.querySelector('.f-espUnidade:checked') || {}).value || '', idade: q('idade').replace(',', '.'), quantidade: q('quantidade').replace(',', '.'), producao: q('producao').replace(',', '.'),
        destino: q('destino'), excluido: 0 };
    });
  }
  const valorPropriedade = id => ($('#pp-' + id) || { value: '' }).value;
  function mostrarCoord() {
    const st = $('#pp-coord-st'); if (!st) return null;
    const r = PCEMon.lerPar(valorPropriedade('lat'), valorPropriedade('lon'));
    st.innerHTML = r.vazio ? '' : r.erro ? `<div class="tf-alerta">${icone('alerta')} ${esc(r.erro)}</div>` : `<div class="tf-ok">${icone('check')} ${esc(String(r.lat).replace('.', ','))} / ${esc(String(r.lon).replace('.', ','))}</div>`;
    return r;
  }
  async function usarGPS() {
    const st = $('#pp-gps-st'); if (st) st.textContent = 'Obtendo localização…';
    const g = await pegarLocal(); if (!$('#pp-lat')) return;
    if (!g) { if (st) st.textContent = 'GPS indisponível ou permissão negada.'; return; }
    $('#pp-lat').value = String(g.lat).replace('.', ','); $('#pp-lon').value = String(g.lng).replace('.', ',');
    if (st) st.textContent = `Localização obtida (precisão aproximada: ${g.prec} m).`; mostrarCoord();
  }
  function avisoCnpj() {
    const t = $('#pp-cnpj'), st = $('#pp-st-cnpj'), d = digitos(t.value); if (d.length === 14) t.value = U().fmtDoc(d);
    if (st) st.innerHTML = !d ? '' : d.length !== 14 ? '<div class="tf-alerta">CNPJ incompleto (14 dígitos).</div>' : U().cnpjOk(d) ? '' : '<div class="tf-alerta">CNPJ com dígitos inválidos: confira a digitação.</div>';
  }
  /** Produtor + propriedade que o formulário abre: o que o aparelho tem (e a sugestão de frutos, se a propriedade ainda não tem nenhum). */
  async function dadosDoForm(doc, propId) {
    const pe = doc ? await Store.obter('pessoas', doc) : null, p = propId ? await Store.obter('propriedades', propId) : null;
    const D = { doc: doc ? U().fmtDoc(doc) : '', nome: (pe && pe.nome) || '', telefone: (pe && pe.telefone) || '', email: (pe && pe.email) || '', propriedade: (p && p.nome) || '', codigo: (p && p.codigo) || '',
      situacao: (p && p.situacaoFundiaria) || '', municipio: (p && p.municipio) || (pe && pe.municipio) || (await U().servidorAtual() || {}).lotacao || '', uf: (p && p.uf) || (pe && pe.uf) || 'AM',
      endereco: (p && p.endereco) || (pe && pe.endereco) || '', via: (p && p.viaAcesso) || '', comercial: (p && p.comercial) || '', tipo: (p && p.tipoPropriedade) || '',
      cnpj: p && digitos(p.cnpj).length === 14 ? U().fmtDoc(digitos(p.cnpj)) : '', empresa: (p && p.empresa) || '', lat: coordTxt(p && p.lat), lon: coordTxt(p && p.lon) };
    let frutos = frutosDe(p).map(f => ({ ...f, espUnidade: f.espUnidade || (f.espLinha !== '' || f.espPlanta !== '' ? 'm' : 'm') })), sugerido = false;
    if (p && !arr(lerJSON(p.frutos, [])).length && arr(p.frutosSugeridos).length) { frutos = arr(p.frutosSugeridos).map(f => ({ ...frutoVazio(), ...f, excluido: 0 })); sugerido = true; }
    return { D, frutos, sugerido, p, pe };
  }
  async function produtorForm(arg) {
    if (U().bloqueado()) return view(avisoAtivacao());
    const o = arg && typeof arg === 'object' ? arg : {}, doc = digitos(o.doc), mostrar = tela();
    const s = await U().exigirServidor('pceprodform', o, true); if (!s) return;
    await carregarCatalogo();
    let propId = o.propId || '';
    if (doc && !propId && !o.nova) { const ps = (await Store.todos('propriedades')).filter(x => !x.excluido && digitos(x.doc) === doc); if (ps.length === 1) propId = ps[0].id; }
    const { D, frutos, sugerido, p } = await dadosDoForm(doc, propId);
    if (!mostrar.viva()) return;
    S = { doc, propId: p ? p.id : '', frutos, sugerido, salvos: arr(lerJSON(p && p.frutos, [])), rec: p || null, docFixo: !!(doc && (o.docFixo || propId || (await Store.obter('pessoas', doc)))) };
    mostrar(formHTML(D, S));
    desenharFrutos();
    if (S.docFixo) await ligarProdutor();
    const f = $('#pceProdForm');
    f.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'pp-doc' && !S.docFixo) { const d = digitos(t.value); clearTimeout(S.tc); if (d.length === 11 || d.length === 14) S.tc = setTimeout(() => consultarDoc().catch(() => {}), 400); else $('#pp-st-doc').replaceChildren(); }
      if (t.id === 'pp-lat' || t.id === 'pp-lon') mostrarCoord();
      if (t.matches && t.matches('.f-espLinha, .f-espPlanta, .f-area, .f-idade, .f-quantidade, .f-producao')) {   // só número: tira letras e deixa um separador decimal
        const v = t.value; let n = v.replace(/[^\d.,]/g, ''); const i = n.search(/[.,]/);
        if (i >= 0) n = n.slice(0, i + 1) + n.slice(i + 1).replace(/[.,]/g, '');
        if (n !== v) t.value = n;
      }
    });
    f.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pp-doc') t.value = U().fmtDoc(digitos(t.value)) || t.value;
      if (t.id === 'pp-cnpj') avisoCnpj();
      if (t.id === 'pp-uf') t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      if (t.id === 'pp-comercial') $('#pp-tipo-l').hidden = t.value !== 'nao';
      if (t.classList.contains('f-cultura')) { S.frutos = coletarFrutos(); const i = +t.closest('.pc-fruto').dataset.i; const dl = $(`#pp-cultivares-${i}`); if (dl) dl.innerHTML = cultivaresDe(t.value).map(x => `<option value="${esc(x)}">`).join(''); }
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarForm().catch(err => toast('Erro ao salvar: ' + err.message, true)); };
    mostrarCoord();
    const alvo = $(S.docFixo ? '#pp-nome' : '#pp-doc'); if (alvo && !alvo.value) alvo.focus();
    if (D.doc && !S.docFixo) consultarDoc().catch(() => {});
  }
  /** Produtor já cadastrado (documento fixo): mostra o aviso e as outras propriedades dele. */
  async function ligarProdutor() {
    const st = $('#pp-st-doc'); if (!st || !S.doc) return;
    const outras = (await Store.todos('propriedades')).filter(x => !x.excluido && digitos(x.doc) === S.doc && x.id !== S.propId);
    st.innerHTML = outras.length ? `<div class="tf-novo">Este produtor tem outra(s) propriedade(s): ${outras.map(x => esc(x.nome || x.codigo || x.id)).join(', ')}.</div>` : '';
  }
  /** CPF/CNPJ digitado: busca no aparelho e no servidor. Produtor que já existe abre a tela dele; senão os campos seguem para preencher. */
  async function consultarDoc() {
    const inp = $('#pp-doc'), st = $('#pp-st-doc'); if (!inp || !st) return;
    const d = digitos(inp.value);
    if (d.length !== 11 && d.length !== 14) { st.innerHTML = '<div class="tf-alerta">Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.</div>'; return; }
    st.innerHTML = '<small>Consultando cadastro…</small>';
    let r; try { r = await Campo.consultar(d); } catch (e) { st.textContent = e.message; return; }
    if (!st.isConnected || digitos(inp.value) !== d) return;
    let html = U().docOk(d) ? '' : `<div class="tf-alerta">${icone('alerta')} ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
    const pe = await Store.obter('pessoas', d), props = (await Store.todos('propriedades')).filter(x => !x.excluido && digitos(x.doc) === d);
    if (pe || props.length) {
      const set = (id, v) => { const el = $('#pp-' + id); if (el && v && !el.value.trim()) el.value = v; };
      if (pe) { set('nome', pe.nome); set('telefone', pe.telefone); set('email', pe.email); set('endereco', pe.endereco); }
      html += `<div class="tf-ok">${icone('check')} Produtor já cadastrado${pe ? ': ' + esc(pe.nome) : ''}. <button type="button" class="mini" data-cad="abrirprodutor" data-cpf="${esc(d)}">Abrir o produtor</button></div>`;
    } else html += '<div class="tf-novo">Produtor novo: preencha os dados abaixo.</div>';
    if (r.parcial) html += `<div class="tf-novo pce-offline">${icone('offline')} Sem conexão: ${esc(r.offline || 'só os dados deste aparelho')}.</div>`;
    st.innerHTML = html;
  }
  async function salvarForm() {
    if (!S || S.salvando) return;
    const doc = digitos(valorPropriedade('doc')), nome = valorPropriedade('nome').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!U().conferirDoc(doc)) return;
    if (!nome) return toast('Informe o nome do produtor.', true);
    const municipio = valorPropriedade('municipio'), nomeProp = valorPropriedade('prop').trim().replace(/\s+/g, ' '), codigo = valorPropriedade('codigo').trim();
    if (!municipio) return toast('Escolha o município.', true);
    if (!nomeProp && !codigo) return toast('Informe o nome ou o código da propriedade.', true);
    const cnpj = digitos(valorPropriedade('cnpj'));
    if (cnpj && cnpj.length !== 14) { $('#pp-cnpj').focus(); return toast('O CNPJ da propriedade/empresa deve ter 14 dígitos (ou deixe em branco).', true); }
    if (cnpj && !U().cnpjOk(cnpj) && !confirm('O CNPJ da propriedade/empresa tem dígitos inválidos. Continuar mesmo assim?')) return;
    const co = mostrarCoord(); if (co.erro) return toast('Coordenadas: ' + co.erro, true);   // só dentro do Amazonas
    const frutos = coletarFrutos();
    for (const [i, f] of frutos.entries()) {
      if (!f.cultura) return toast(`Fruto ${i + 1}: escolha a cultura (ou remova o fruto).`, true);
      if (['area', 'espLinha', 'espPlanta', 'idade', 'quantidade', 'producao'].some(k => f[k] !== '' && !NUM.test(f[k]))) return toast(`${f.cultura}: área, espaçamento, idade, quantidade e produção só aceitam números.`, true);
      if ((f.espLinha !== '' || f.espPlanta !== '') && !['m', 'cm'].includes(f.espUnidade)) return toast(`${f.cultura}: escolha a unidade do espaçamento (metros ou centímetros).`, true);
      if (f.espLinha === '' && f.espPlanta === '') f.espUnidade = '';
    }
    if (frutos.length > MAX_FRUTOS) return toast(`Limite de ${MAX_FRUTOS} frutos por propriedade.`, true);
    const id = S.propId || propIdDe(codigo, doc, nomeProp);
    if (!id) return toast('Informe o nome ou o código da propriedade.', true);
    const ja = await Store.obter('propriedades', id);
    if (ja && !ja.excluido && digitos(ja.doc) && digitos(ja.doc) !== doc) return toast('Já existe uma propriedade com este código para outro produtor. Confira o código.', true);
    S.salvando = true;
    const btn = $('#pp-salvar'); btn.disabled = true;
    try {
      const t = Date.now(), base = { ...(ja || {}) }; delete base.pendente; delete base.frutosSugeridos; delete base.recusadoEm;
      const removidos = arr(S.salvos).filter(f => f && !frutos.some(x => x.id === f.id)).map(f => ({ ...f, excluido: 1 }));   // fruto salvo que saiu da lista: exclusão lógica
      const comercial = valorPropriedade('comercial'), via = valorPropriedade('via');
      const prop = { ...base, id, codigo, nome: nomeProp, doc, municipio, situacaoFundiaria: valorPropriedade('situacao'), lat: co.vazio ? '' : co.lat, lon: co.vazio ? '' : co.lon,
        cnpj, empresa: valorPropriedade('empresa').trim().replace(/\s+/g, ' ').slice(0, 120), endereco: valorPropriedade('endereco').trim().replace(/\s+/g, ' ').slice(0, 200),
        uf: valorPropriedade('uf').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2), viaAcesso: via, comercial, tipoPropriedade: comercial === 'nao' ? valorPropriedade('tipo') : '',
        frutos: JSON.stringify([...frutos, ...removidos]), criadoEm: base.criadoEm || t };
      await Store.salvar('pessoas', await U().montarPessoa(doc, { nome, telefone: valorPropriedade('telefone').trim(), email: valorPropriedade('email').trim(), endereco: prop.endereco, uf: prop.uf, municipio }));
      await Store.salvar('propriedades', prop);
      S = null;
      toast('Produtor, propriedade e frutos salvos.');
      Sync.sincronizar();
      go('pceprodutor', doc);
    } catch (e) { S.salvando = false; btn.disabled = false; throw e; }
  }

  /* ================= tela do produtor ================= */
  const selo = r => (Number(r.cancelado) === 1 ? `<div class="info pend">${icone('proibido')} CANCELADO${r.motivoCancel ? ': ' + esc(r.motivoCancel) : ''}</div>` : '')
    + (Number(r.conflito) === 1 ? '<div class="info pend">Número repetido na planilha: confira com a coordenação.</div>' : '')
    + (r.pendente ? `<div class="info pend">${icone('sincronizar')} ${r.provisorio ? 'número provisório, conferido ao sincronizar' : 'aguardando envio'}</div>` : '');
  /** Programas e culturas de um Termo da visita, em texto. */
  const culturasDoTermo = t => arr(lerJSON(t.culturas, [])).map(c => c.cultura).filter(Boolean).join(', ');
  function visitasDoProdutor(doc, termos, levs, colheitas) {
    const itens = [], porVisita = new Map();
    termos.forEach(t => {
      if (t.visitaId) { if (!porVisita.has(t.visitaId)) { const v = { tipo: 'visita', id: t.visitaId, data: t.data, hora: t.hora || '', termos: [], colheitas: colheitas.filter(c => c.levantamentoId === t.visitaId) }; porVisita.set(t.visitaId, v); itens.push(v); }
        porVisita.get(t.visitaId).termos.push(t); }
      else itens.push({ tipo: 'papel', id: t.id, data: t.data, hora: t.hora || '', termos: [t], colheitas: [] });
    });
    levs.forEach(l => itens.push({ tipo: 'antigo', id: l.id, data: l.data, hora: l.hora || '', lev: l }));
    return itens.sort((a, b) => ((b.data || '') + (b.hora || '')).localeCompare((a.data || '') + (a.hora || '')));
  }
  function visitaHTML(v, pendArq) {
    if (v.tipo === 'antigo') {
      const G = Docs.pceGrupos(v.lev), pend = v.lev.pendente || [...Anexos.idsArquivos(v.lev)].some(id => pendArq.has(id));
      return `<div class="item pce-visita-item" data-visita="${esc(v.id)}"><div class="topo"><div><div class="placa pce-nome">Levantamento antigo</div><div class="tipo">${esc(v.lev.propriedade || 'Propriedade não informada')} · ${esc(v.lev.municipio || '')}</div></div>
        <div class="hora">${esc(dBR(v.data))}<br>${esc(v.hora)}</div></div>
        <div class="info">${G.pragas.length} praga(s)/doença(s) avaliada(s) · somente leitura</div>
        ${pend ? `<div class="info pend">${icone('sincronizar')} aguardando envio</div>` : ''}
        <div class="botoes pce-acoes"><button class="editar" data-pce="verlev" data-id="${esc(v.id)}">Ver</button></div></div>`;
    }
    const linhas = v.termos.map(t => `<div class="pce-visita-termo"><div><b>${icone('formulario')} Termo de Fiscalização ${esc(t.numeroTxt || '(sem nº)')}</b>
        <small>${esc(t.programaVisita || (t.visitaId ? '' : 'do papel'))}${culturasDoTermo(t) ? ' · ' + esc(culturasDoTermo(t)) : ''}</small>${selo(t)}</div>
        <div class="pce-doc-acoes"><button class="mini" data-cad="pdftermo" data-id="${esc(t.id)}">PDF</button></div></div>`).join('');
    const col = v.colheitas.map(c => `<div class="pce-visita-termo"><div><b>${icone('amostra')} Termo de Colheita ${esc(c.numeroTxt || '(sem nº)')}</b><small>${esc(c.cultura || '')} · ${esc(c.quantidade || '')} amostra(s)</small>${selo(c)}</div>
        <div class="pce-doc-acoes"><button class="mini" data-cad="pdfcolheita" data-id="${esc(c.id)}">PDF</button></div></div>`).join('');
    return `<div class="item pce-visita-item" data-visita="${esc(v.id)}"><div class="topo"><div><div class="placa pce-nome">${v.tipo === 'papel' ? 'Termo do papel' : 'Visita'}</div></div>
      <div class="hora">${esc(dBR(v.data))}<br>${esc(v.hora)}</div></div>${linhas}${col}</div>`;
  }
  /** Fichas oficiais de uma propriedade: um botão por modelo (os dos frutos dela) e o estado de cada uma. */
  function fichasHTML(p, cads) {
    const modelos = [...new Set(frutosDe(p).map(f => modeloDaCultura(f.cultura)))];
    cads.filter(c => c.propriedadeId === p.id).forEach(c => { const m = c.programa || 'moniliase'; if (!modelos.includes(m)) modelos.push(m); });
    if (!modelos.length) modelos.push('propriedade');
    return modelos.filter(m => FI.modelos[m]).map(m => {
      const c = cads.filter(x => x.propriedadeId === p.id && (x.programa || 'moniliase') === m).sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))[0];
      return `<div class="pce-visita-termo" data-modelo="${m}"><div><b>${icone('formulario')} Ficha de ${esc(rotulo(m))}</b><small>${c ? 'Gerada: nº ' + esc(c.numeroTxt || '') : 'Ainda não gerada'}</small>${c ? selo(c) : ''}</div>
        <div class="pce-doc-acoes"><button class="mini" data-cad="ficha" data-prop="${esc(p.id)}" data-modelo="${m}">${c ? 'Abrir' : 'Gerar'}</button>${c ? `<button class="mini" data-cad="pdfficha" data-id="${esc(c.id)}">PDF</button>` : ''}</div></div>`;
    }).join('');
  }
  async function produtor(doc0) {
    if (U().bloqueado()) return view(avisoAtivacao());
    const doc = digitos(doc0), mostrar = tela();
    const s = await U().exigirServidor('pceprodutor', doc, true); if (!s || !mostrar.viva()) return;
    await carregarCatalogo();
    const pe = await Store.obter('pessoas', doc), props = (await Store.todos('propriedades')).filter(p => !p.excluido && digitos(p.doc) === doc);
    if (!pe && !props.length) { toast('Produtor não encontrado neste aparelho.', true); return go('pce'); }
    const mesmo = r => !r.excluido && digitos(r.doc) === doc;
    const termos = (await Store.todos('termosPce')).filter(mesmo), levs = (await Store.todos('levantamentos')).filter(mesmo), cols = (await Store.todos('colheitas')).filter(mesmo);
    const cads = (await Store.todos('cadastrosPce')).filter(c => mesmo(c) && !Number(c.excluido));
    const pendArq = new Set(await Store.chaves('arquivos', 'enviado', 0)), visitas = visitasDoProdutor(doc, termos, levs, cols);
    if (!mostrar.viva()) return;
    const podeVisita = Sync.pode('pce') && !PCEUI.soDigitador(s);
    mostrar(`<div class="card" id="pce-produtor"><h3>${icone('pessoa')} ${esc((pe && pe.nome) || (props[0] && props[0].nome) || 'Produtor')}</h3>
        <p>${esc(U().fmtDoc(doc))}${pe && pe.telefone ? ' · ' + esc(pe.telefone) : ''}</p>
        ${pe && pe.pendente ? `<div class="info pend">${icone('sincronizar')} aguardando envio</div>` : ''}
        <div class="botoes"><button class="botao sec" data-cad="editar" data-cpf="${esc(doc)}" id="pp-editar">${icone('editar')} Editar produtor</button>
          <button class="botao sec" data-cad="nova" data-cpf="${esc(doc)}" id="pp-nova">${icone('mais')} Nova propriedade</button></div></div>
      ${props.map(p => {
        const fr = frutosDe(p), sug = !fr.length && arr(p.frutosSugeridos).length;
        return `<div class="card pce-prop" data-prop="${esc(p.id)}"><h3>${icone('propriedade')} ${esc(p.nome || p.codigo || 'Propriedade')}</h3>
          <p class="dica" style="text-align:left">${esc([p.codigo && 'cód. ' + p.codigo, p.municipio && p.municipio + '/' + (p.uf || 'AM')].filter(Boolean).join(' · '))}</p>
          ${p.recusadoEm && p.pendente ? `<div class="tf-alerta">${icone('alerta')} O servidor não aceitou esta propriedade (sem autorização do módulo PCE). Fale com a gerência.</div>` : p.pendente ? `<div class="info pend">${icone('sincronizar')} aguardando envio</div>` : ''}
          <h4 class="pce-sub">Frutos</h4>
          ${fr.length ? `<ul class="pce-frutos">${fr.map(f => `<li>${esc(resumoFruto(f))}</li>`).join('')}</ul>`
            : sug ? `<div class="tf-novo">${icone('sugerir')} Sem frutos cadastrados. Há sugestão do histórico: ${esc(p.frutosSugeridos.map(f => f.cultura).join(', '))}. Abra “Editar” para conferir e salvar.</div>`
            : '<p class="dica" style="text-align:left">Nenhum fruto cadastrado. Abra “Editar” para acrescentar.</p>'}
          <div class="botoes"><button class="botao sec" data-cad="editar" data-cpf="${esc(doc)}" data-prop="${esc(p.id)}">${icone('editar')} Editar</button></div>
          ${podeVisita ? `<button class="botao" data-cad="visita" data-cpf="${esc(doc)}" data-prop="${esc(p.id)}" id="pce-novavisita">${icone('mais')} Nova visita</button>` : ''}
          <h4 class="pce-sub">Fichas oficiais</h4>${fichasHTML(p, cads)}</div>`; }).join('')}
      ${!props.length ? `<div class="card"><p>Este produtor ainda não tem propriedade cadastrada.</p><button class="botao" data-cad="nova" data-cpf="${esc(doc)}">${icone('mais')} Cadastrar propriedade</button></div>` : ''}
      <div class="card"><h3>${icone('historico')} Visitas</h3><div id="pce-visitas">${visitas.length ? visitas.map(v => visitaHTML(v, pendArq)).join('') : '<div class="vazio">Nenhuma visita registrada para este produtor.</div>'}</div></div>
      <button class="botao sec" data-v="pce">${icone('voltar')} Voltar aos produtores</button>`);
  }

  /* ================= fichas oficiais ================= */
  const vazioV = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  /** Perguntas do modelo que o app faz: as próprias do modelo, sem as só de registro antigo, as que a visita responde e as tiradas dos frutos. */
  function perguntasDoModelo(modelo) {
    const M = FI.modelos[modelo], LV = M.levantamento || {};
    return [...arr(M.propriedade), ...arr(M.perguntas), ...arr(LV.perguntas)].filter(p => !p.legado && !p.deVisita && !p.fonte && !p.deFrutos);
  }
  const chavesDa = p => [p.k, p.k2, p.compl && p.compl.k, p.outro].filter(Boolean);
  const defDe = (modelo, k) => perguntasDoModelo(modelo).find(p => p.k === k) || null;
  const mesmaPergunta = (a, b) => !!a && !!b && a.tipo === b.tipo && JSON.stringify(a.ops || null) === JSON.stringify(b.ops || null) && JSON.stringify((a.compl || {}).ops || null) === JSON.stringify((b.compl || {}).ops || null);
  /** Respostas que a propriedade já tem em outras fichas (mesma pergunta, mesmas opções) e o que a visita mais recente respondeu. */
  function jaRespondido(modelo, p, cads, extras) {
    const r = { ...extras };
    cads.filter(c => c.propriedadeId === p.id && (c.programa || 'moniliase') !== modelo).sort((a, b) => (Number(a.criadoEm) || 0) - (Number(b.criadoEm) || 0)).forEach(c => {
      const d = lerJSON(c.dados, {}); if (!d.fichaNova) return;
      perguntasDoModelo(c.programa).forEach(q => { if (mesmaPergunta(q, defDe(modelo, q.k))) chavesDa(q).forEach(k => { if (!vazioV(d[k])) r[k] = d[k]; }); });
    });
    return r;
  }
  const PF0 = 'fi-';
  function perguntaHTML(p, v, PF) {
    const k = p.k, rot = p.rot, N_ = N();
    const compl = c => !c ? '' : c.tipo === 'varios' ? `<div class="mon-sub">${esc(c.rot)}</div>${N_.cks(PF, c.k, c.ops, arr(lerJSON(v[c.k], [])))}`
      : N_.inp(PF, c.k, esc(c.rot), v[c.k], 'maxlength="200"');
    const outro = p.outro ? N_.inp(PF, p.outro, 'Qual?', v[p.outro], 'maxlength="200"') : '';
    if (p.tipo === 'sn') return N_.sn(PF, k, rot, v[k] || '') + compl(p.compl);
    if (p.tipo === 'opcao') return N_.sn(PF, k, rot, v[k] || '', p.ops.map(([c, t]) => [c, t])) + outro + compl(p.compl);
    if (p.tipo === 'varios') return `<div class="mon-sub">${esc(rot)}</div>${N_.cks(PF, k, p.ops.map(([c, t, g]) => [c, (g ? g + ' – ' : '') + t]), arr(lerJSON(v[k], [])))}${outro}${compl(p.compl)}`;
    if (p.tipo === 'coord') return `<div class="mon-sub">${esc(rot)}</div><div class="duas">${N_.inp(PF, k, 'Latitude', v[k], 'inputmode="text"')}${N_.inp(PF, p.k2, 'Longitude', v[p.k2], 'inputmode="text"')}</div>`;
    return N_.inp(PF, k, esc(rot), v[k], `maxlength="200" ${p.tipo === 'num' ? 'inputmode="decimal"' : ''}`) + compl(p.compl);
  }
  function lerPergunta(p, PF) {
    const N_ = N(), o = {};
    const um = q => { if (q.tipo === 'sn' || q.tipo === 'opcao') o[q.k] = N_.rv(PF, q.k); else if (q.tipo === 'varios') o[q.k] = N_.cv(PF, q.k); else o[q.k] = N_.g(PF, q.k).trim(); };
    um(p);
    if (p.k2) o[p.k2] = N_.g(PF, p.k2).trim();
    if (p.outro) o[p.outro] = N_.g(PF, p.outro).trim();
    if (p.compl) um(p.compl);
    return o;
  }
  /** Visita mais recente da propriedade (junta os Termos de uma mesma visita) no formato que a ficha lê: {data, culturas:[{..., extras}], dados:{}}. */
  async function visitaMaisRecente(p) {
    const ts = (await Store.todos('termosPce')).filter(t => !Number(t.excluido) && !Number(t.cancelado) && t.visitaId && t.propriedadeId === p.id)
      .sort((a, b) => (String(b.data) + String(b.hora)).localeCompare(String(a.data) + String(a.hora)));
    if (!ts.length) return null;
    const vid = ts[0].visitaId, mesma = ts.filter(t => t.visitaId === vid);
    return { data: ts[0].data, culturas: mesma.flatMap(t => arr(lerJSON(t.culturas, [])).map(c => ({ ...c, extras: c.dados || {} }))), dados: {}, extras: {} };
  }
  async function entradaDaFicha(modelo, p, pe, dados, ficha) {
    return { produtor: { nome: pe ? pe.nome : '', doc: p.doc, telefone: pe ? pe.telefone : '' },
      propriedade: { nome: p.nome, cnpj: p.cnpj, codigo: p.codigo, municipio: p.municipio, uf: p.uf, lat: p.lat, lon: p.lon, endereco: p.endereco, viaAcesso: p.viaAcesso,
        situacaoFundiaria: p.situacaoFundiaria, comercial: p.comercial, tipoPropriedade: p.tipoPropriedade, frutos: p.frutos || '' },
      dados, visita: await visitaMaisRecente(p), ficha };
  }
  /** PDF de uma ficha já gravada: a nova pelo cadastro atual; a antiga (CadastrosPCE de antes) como foi gravada. */
  async function imprimirFicha(id, modo) {
    const c = await Store.obter('cadastrosPce', id); if (!c) throw new Error('Ficha não encontrada.');
    const arquivos = await Anexos.arquivosPorId(c), d = lerJSON(c.dados, {});
    if (!d.fichaNova) {
      if (c.programa !== 'citros') return Docs.pceMon(PCEDocs.tipoDoRegistro('cadastro', c), c, { arquivos }, modo);
      return Docs.pceMon('cadastroCitros', c, { arquivos }, modo);
    }
    const p = await Store.obter('propriedades', c.propriedadeId); if (!p) throw new Error('Propriedade não encontrada neste aparelho.');
    const pe = await Store.obter('pessoas', digitos(p.doc));
    const entrada = await entradaDaFicha(c.programa, p, pe, d, { numeroTxt: c.numeroTxt, data: c.data, local: c.local, servidor: c.servidor, cargo: c.cargo, matricula: c.matricula, lotacao: c.lotacao,
      assinaturas: c.assinaturas, rt: d.rt || {} });
    return Docs.fichaPce(c.programa, entrada, { arquivos }, modo);
  }
  let FIC = null;
  async function ficha(arg) {
    if (U().bloqueado()) return view(avisoAtivacao());
    const o = arg && typeof arg === 'object' ? arg : {}, mostrar = tela();
    const p = o.propId ? await Store.obter('propriedades', o.propId) : null, modelo = o.modelo;
    if (!p || !FI.modelos[modelo]) { toast('Ficha não encontrada.', true); return go('pce'); }
    const s = await U().exigirServidor('pceficha', o, false); if (!s) return;
    await carregarCatalogo();
    const doc = digitos(p.doc), pe = await Store.obter('pessoas', doc);
    const cads = (await Store.todos('cadastrosPce')).filter(c => !Number(c.excluido) && c.propriedadeId === p.id);
    const atual = o.id ? cads.find(c => c.id === o.id) : null;
    const vis = await visitaMaisRecente(p), extras = {};
    arr(vis && vis.culturas).forEach(c => Object.assign(extras, c.extras));
    const salvo = atual ? lerJSON(atual.dados, {}) : {};
    const reaproveitado = atual ? {} : jaRespondido(modelo, p, cads, extras);
    // novo: pergunta o que ainda não foi respondido (em outra ficha ou na visita); editando: tudo, com as respostas dela
    const perguntas = perguntasDoModelo(modelo).filter(q => atual || !chavesDa(q).some(k => !vazioV(reaproveitado[k])));
    const rtJa = atual ? salvo.rt : (cads.map(c => lerJSON(c.dados, {}).rt).reverse().find(r => r && (r.nome || r.conselho)) || null);
    FIC = { p, pe, modelo, atual, perguntas, reaproveitado, rt: atual ? salvo.rt || {} : rtJa || {}, id: atual ? atual.id : Store.novoId(), s };
    const v = { ...reaproveitado, ...salvo };
    if (!mostrar.viva()) return;
    const M = FI.modelos[modelo], respondidas = perguntasDoModelo(modelo).length - perguntas.length;
    mostrar(`<form id="pceFichaForm" autocomplete="off" novalidate><div class="card"><h3>${icone('formulario')} Ficha de ${esc(rotulo(modelo))}${atual ? ' — ' + esc(atual.numeroTxt || '') : ''}</h3>
        <p class="dica" style="text-align:left">${esc(M.titulo)}</p>
        <p><b>${esc((pe && pe.nome) || '')}</b> · ${esc(p.nome || p.codigo || '')}</p>
        <p class="dica" style="text-align:left">Produtor, propriedade e frutos vêm do cadastro. A ficha não impede o Termo.${respondidas && !atual ? ` ${respondidas} pergunta(s) já respondida(s) em outra ficha ou na visita não aparecem aqui.` : ''}</p></div>
      ${perguntas.length ? `<div class="card" id="fi-perguntas"><h3>Perguntas do modelo</h3>${perguntas.map(q => perguntaHTML(q, v, PF0)).join('')}</div>` : '<div class="card tf-ok" id="fi-semperguntas">Nada mais a perguntar para este modelo.</div>'}
      <div class="card"><h3>Responsável técnico (se houver)</h3><div class="duas">${N().inp(PF0, 'rtnome', 'Nome', FIC.rt.nome, 'maxlength="120"')}${N().inp(PF0, 'rtconselho', 'Nº do conselho', FIC.rt.conselho, 'maxlength="60"')}</div></div>
      <button class="botao" type="submit" id="fi-salvar">${icone('salvar')} ${atual ? 'Salvar ficha' : 'Gerar ficha'}</button>
      <button class="botao sec" type="button" data-cad="voltarficha" data-cpf="${esc(doc)}">Cancelar</button></form>`);
    $('#pceFichaForm').onsubmit = ev => { ev.preventDefault(); salvarFicha().catch(err => toast('Erro ao salvar: ' + err.message, true)); };
  }
  async function salvarFicha() {
    const F = FIC; if (!F || F.salvando) return;
    F.salvando = true; const btn = $('#fi-salvar'); btn.disabled = true;
    try {
      const { p, pe, modelo, atual, s } = F, doc = digitos(p.doc);
      const dados = { ...(atual ? lerJSON(atual.dados, {}) : {}), ...F.reaproveitado, fichaNova: 1 };
      F.perguntas.forEach(q => Object.assign(dados, lerPergunta(q, PF0)));
      const rt = { nome: N().g(PF0, 'rtnome').trim(), conselho: N().g(PF0, 'rtconselho').trim() }; dados.rt = rt;
      const t0 = Date.now(), frutos = frutosDe(p).filter(f => modeloDaCultura(f.cultura) === modelo);
      let rec = { ...(atual || {}), id: F.id, programa: modelo, propriedadeId: p.id, doc, nome: (pe && pe.nome) || '', propriedade: p.nome || '', cnpj: digitos(p.cnpj), municipio: p.municipio || '', uf: p.uf || '',
        lat: p.lat == null ? '' : p.lat, lon: p.lon == null ? '' : p.lon, dados: JSON.stringify(dados), totalPlantas: frutos.reduce((n, f) => n + (Number(f.quantidade) || 0), 0), fotos: '[]',
        assinaturas: (atual && atual.assinaturas) || '{}', documentos: '[]', registroAntigo: 0, excluido: 0 };
      if (atual) {
        await Store.salvar('cadastrosPce', rec);
      } else {
        const d = new Date();
        rec = { ...rec, ...U().dadosServidor(s), data: hojeISO(), hora: agoraHM(), local: (s.lotacao || p.municipio || '') + '/AM', unidade: Sync.unidadePce(s.lotacao || p.municipio), criadoEm: t0 };
        const r = await PCEMon.numerar('cadastro', rec, null, null);
        if (!r) { F.salvando = false; btn.disabled = false; return; }
      }
      FIC = null;
      Sync.sincronizar();
      toast(atual ? 'Ficha salva.' : 'Ficha gerada.');
      go('pceprodutor', doc);
    } catch (e) { F.salvando = false; btn.disabled = false; throw e; }
  }

  /* ================= ações (cliques) ================= */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-cad]'); if (!el) return;
    const a = el.dataset.cad, doc = el.dataset.cpf, prop = el.dataset.prop;
    try {
      if (a === 'editar') go('pceprodform', { doc, propId: prop || '', docFixo: true });
      else if (a === 'nova') go('pceprodform', { doc, nova: true, docFixo: true });
      else if (a === 'visita') go('pcevisita', { doc, propId: prop });
      else if (a === 'ficha') go('pceficha', { propId: prop, modelo: el.dataset.modelo, id: ((await Store.todos('cadastrosPce')).find(c => !Number(c.excluido) && c.propriedadeId === prop && (c.programa || 'moniliase') === el.dataset.modelo && lerJSON(c.dados, {}).fichaNova) || {}).id });
      else if (a === 'pdfficha') await imprimirFicha(el.dataset.id);
      else if (a === 'pdftermo') await PCEMon.imprimir('termo', el.dataset.id);
      else if (a === 'pdfcolheita') await PCEUI.imprimirColheita(el.dataset.id);
      else if (a === 'abrirprodutor') go('pceprodutor', doc);
      else if (a === 'voltarficha') go('pceprodutor', doc);
      else if (a === 'cancelarform') { const d = S && S.doc; S = null; go(d ? 'pceprodutor' : 'pce', d || null); }
      else if (a === 'consultar') await consultarDoc();
      else if (a === 'gps') await usarGPS();
      else if (a === 'addfruto') {
        if (!S) return;
        S.frutos = coletarFrutos();
        if (S.frutos.length >= MAX_FRUTOS) return toast(`Limite de ${MAX_FRUTOS} frutos por propriedade.`, true);
        S.frutos.push(frutoVazio()); desenharFrutos();
        const b = document.querySelectorAll('#pp-frutos .pc-fruto'), ult = b[b.length - 1]; if (ult) { ult.scrollIntoView({ block: 'start' }); ult.querySelector('.f-cultura').focus(); }
      } else if (a === 'delfruto') {
        if (!S) return;
        S.frutos = coletarFrutos(); const i = +el.dataset.i, f = S.frutos[i];
        if (f && f.cultura && !confirm(`Remover o fruto ${f.cultura}?`)) return;
        S.frutos.splice(i, 1); desenharFrutos();
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { produtorForm, produtor, ficha, imprimirFicha, perguntaHTML, lerPergunta, chavesDa, perguntasDoModelo, carregarCatalogo, culturas, pragasLigadas, pragasExtras, pragasCat, pragaPorNome, nomeDaPraga, opcional, programaDaPraga, modeloDaCultura,
    temLevantamento, idCat, frutosDe, rotulo, resumoFruto, espTxt, visitaMaisRecente, selo, catalogo: () => CAT };
})();
