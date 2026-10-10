// Módulo PCE: Levantamento fitossanitário e Termo de Colheita de Amostras (numeração igual à do TF, por unidade/ano).
// Usa funções do app.js (view, go, toast, $, esc, dBR, hojeISO, agoraHM, pegarLocal, avisoAtivacao) em tempo de execução.
const PCEUI = (() => {
  const P = CONFIG.PCE;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const anoAtual = () => new Date().getFullYear();
  const unid = u => Sync.unidadePce(u);                                   // unidade em MAIÚSCULAS
  const chave = (u, a) => unid(u) + '|' + a;
  const num3 = n => String(n).padStart(3, '0');
  const numTxt = (n, a, u) => `${num3(n)}/${a}/${unid(u)}`;              // formato do rascunho: NNN/AAAA/UNIDADE
  const digitos = v => String(v || '').replace(/\D/g, '');
  const lerJSON = (v, pad) => { try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const numOuVazio = v => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v));
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const bloqueado = () => !Sync.ativado() || localStorage.getItem('gdv.revogado');
  const opts = (lista, atual, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '') +
    lista.map(x => `<option ${x === atual ? 'selected' : ''}>${esc(x)}</option>`).join('') +
    (atual && !lista.includes(atual) ? `<option selected>${esc(atual)}</option>` : '');   // valor antigo fora da lista continua visível

  /* ---------- validação de CPF / CNPJ (a mesma do TF: só alerta; o fiscal decide) ---------- */
  function cpfOk(c) {
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  function cnpjOk(c) {
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +c[12] && dv(13) === +c[13];
  }
  const docOk = d => (d.length === 11 ? cpfOk(d) : d.length === 14 ? cnpjOk(d) : false);
  const fmtDoc = d => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);
  /** Confere o documento: false = parar (mensagem já mostrada). */
  function conferirDoc(doc) {
    if (doc.length !== 11 && doc.length !== 14) { toast('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.', true); return false; }
    return docOk(doc) || confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Continuar mesmo assim?`);
  }

  /** Data (AAAA-MM-DD) e hora (HH:MM) obrigatórias: false = parar (mensagem já mostrada). */
  function dataHoraOk(D) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(D.data || '')) { toast('Informe a data.', true); return false; }
    if (!/^\d{2}:\d{2}/.test(D.hora || '')) { toast('Informe a hora.', true); return false; }
    return true;
  }

  /* ---------- identificação do servidor (guardada no aparelho, copiada para cada registro) ---------- */
  const servidorAtual = async () => (await Store.meta('pceServidor')) || null;
  const servidorOk = s => !!(s && s.nome && s.cargo && s.lotacao);
  async function exigirServidor(voltar, arg) {
    const s = await servidorAtual();
    if (servidorOk(s)) return s;
    go('pceservidor', { voltar, arg });
    return null;
  }
  const dadosServidor = s => ({ servidor: s.nome, cargo: s.cargo, matricula: s.matricula || '', lotacao: s.lotacao });

  async function servidor(o) {
    if (bloqueado()) return view(avisoAtivacao());
    o = o || {};
    const s = (await servidorAtual()) || {}, primeira = !servidorOk(s);
    view(`<form class="card" id="pceServForm" autocomplete="off"><h3>👤 Identificação do servidor</h3>
      <p class="dica" style="text-align:left">${primeira ? 'Antes de começar, informe seus dados. ' : ''}Eles ficam neste aparelho e são copiados para cada levantamento e termo no momento em que é criado.</p>
      <label>Nome do servidor *<input id="pce-s-nome" value="${esc(s.nome || Sync.nome())}" placeholder="Nome completo"></label>
      <label>Cargo *<select id="pce-s-cargo">${opts(P.cargos, s.cargo, 'Selecione')}</select></label>
      <label>Matrícula<input id="pce-s-matricula" value="${esc(s.matricula || '')}" inputmode="numeric"></label>
      <label>Lotação (município) *<select id="pce-s-lotacao">${opts(P.municipios, s.lotacao, 'Selecione')}</select></label>
      <button class="botao" type="submit" id="pce-s-salvar">💾 Salvar</button>
      ${primeira ? '' : '<button class="botao sec" type="button" data-v="pce">Voltar</button>'}</form>`);
    $('#pceServForm').onsubmit = async e => {
      e.preventDefault();
      const d = { nome: $('#pce-s-nome').value.trim().replace(/\s+/g, ' '), cargo: $('#pce-s-cargo').value, matricula: $('#pce-s-matricula').value.trim(), lotacao: $('#pce-s-lotacao').value };
      if (d.nome.split(' ').length < 2) return toast('Informe o nome completo (nome e sobrenome).', true);
      if (!d.cargo) return toast('Escolha o cargo.', true);
      if (!d.lotacao) return toast('Escolha a lotação.', true);
      await Store.setMeta('pceServidor', d);
      toast('Dados do servidor salvos.');
      go(o.voltar || 'pce', o.arg);
    };
  }

  /* ---------- arquivos (fotos e assinaturas) ---------- */
  const idsArquivos = rec => new Set(rec ? [...lerJSON(rec.fotos, []), ...Object.values(lerJSON(rec.assinaturas, {}))].filter(Boolean) : []);
  /** Apaga do aparelho os arquivos ainda não enviados (os já enviados ficam: o Drive guarda para auditoria). */
  async function apagarSeNaoEnviado(ids) {
    const fora = [];
    for (const id of ids) { const a = await Store.obter('arquivos', id); if (a && !a.enviado) fora.push(id); }
    await Store.apagar('arquivos', fora);
  }
  async function arquivosPorId(rec) {
    const m = {};
    for (const id of idsArquivos(rec)) { const a = await Store.obter('arquivos', id); if (a) m[id] = a; }
    return m;
  }
  const tamanhoDataURL = d => Math.round((String(d).length - String(d).indexOf(',') - 1) * 3 / 4);
  const novoArquivo = (dono, donoId, tipo, papel, mime, dados) => ({ id: Store.novoId(), dono, donoId, tipo, papel: papel || '', mime, dados,
    tamanho: tamanhoDataURL(dados), criadoEm: Date.now(), enviado: 0, url: '', driveId: '' });

  /** Reduz a foto no aparelho: lado maior até 1600 px, JPEG ~0,7. */
  async function reduzirFoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Não foi possível ler a imagem ' + (file.name || ''))); i.src = url; });
      const lado = P.fotoLado || 1600, f = Math.min(1, lado / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * f)); cv.height = Math.max(1, Math.round(img.naturalHeight * f));
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', P.fotoQualidade || 0.7);
    } finally { URL.revokeObjectURL(url); }
  }
  const MAX_FOTOS = P.maxFotos || 30, MAX_CULTURAS = P.maxCulturas || 40;
  async function adicionarFotos(F, input, prev) {
    const files = [...(input.files || [])]; input.value = '';
    for (const file of files) {
      if (F.fotos.length >= MAX_FOTOS) { toast(`Limite de ${MAX_FOTOS} fotos por registro.`, true); break; }
      if (!/^image\//.test(file.type || 'image/')) { toast(`"${file.name}" não é uma imagem.`, true); continue; }
      let a; try { a = novoArquivo(F.dono, F.id, 'foto', '', 'image/jpeg', await reduzirFoto(file)); } catch (e) { toast(e.message, true); continue; }
      if (!F.vivo) return;                                               // o formulário foi fechado enquanto a foto era processada
      await Store.gravar('arquivos', a);
      F.fotos.push(a.id);
    }
    await renderFotos(F, prev);
    agendarRascunho(0);                                                  // grava já: os arquivos novos ficam ligados ao rascunho
  }
  async function renderFotos(F, prev) {
    const el = $(prev); if (!el) return;
    const itens = await Promise.all(F.fotos.map(id => Store.obter('arquivos', id)));
    if ($(prev) !== el) return;
    el.innerHTML = F.fotos.length ? F.fotos.map((id, i) => { const a = itens[i];
      return `<div class="pce-foto" data-id="${esc(id)}">${a && a.dados ? `<img src="${esc(a.dados)}" alt="Foto ${i + 1}">` : '<span>☁️ foto arquivada no Drive</span>'}
        <button type="button" class="pce-foto-del" data-pce="delfoto" data-id="${esc(id)}" aria-label="Remover foto ${i + 1}">✕</button></div>`; }).join('')
      : '<div class="dica" style="grid-column:1/-1">Nenhuma foto.</div>';
  }
  async function removerFoto(F, id, prev) {
    F.fotos = F.fotos.filter(x => x !== id);
    if (!idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);     // foto nova deste formulário: some já
    await renderFotos(F, prev);                                          // foto já salva no registro: decide ao salvar
    agendarRascunho(0);
  }

  /* ---------- assinatura na tela (opcional; o PDF sempre traz as linhas para assinar no papel) ---------- */
  const assHTML = (papel, rotulo) => `<div class="pce-ass"><div class="pce-ass-topo"><span>${esc(rotulo)}</span>
    <button type="button" class="mini" data-pce="limparass" data-papel="${papel}">Limpar</button></div>
    <canvas id="pce-ass-${papel}" class="pce-canvas" data-papel="${papel}" aria-label="Assinatura: ${esc(rotulo)}"></canvas></div>`;
  async function ligarAssinatura(F, papel) {
    const cv = $('#pce-ass-' + papel); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 140;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = '#0b1f4a';
    const salva = F.ass[papel] ? await Store.obter('arquivos', F.ass[papel]) : null;
    const src = F.assNovas[papel] || (salva && salva.dados);
    if (src) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = src; }
    let ativo = false, ult = null, idAtivo = null;
    // o bitmap foi criado com w×h (px CSS); se a tela muda de tamanho (girar o celular), converte o toque para essa escala
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * w / (r.width || w), y: (e.clientY - r.top) * h / (r.height || h) }; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); if (ativo) return;                              // segundo dedo/palma durante o traço: ignorado
      ativo = true; idAtivo = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
      ult = pos(e); ctx.beginPath(); ctx.arc(ult.x, ult.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    });
    cv.addEventListener('pointermove', e => {
      if (!ativo || e.pointerId !== idAtivo) return; e.preventDefault();
      const p = pos(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p;
    });
    const fim = e => { if (!ativo || (e && e.pointerId !== idAtivo)) return; ativo = false; idAtivo = null; F.assNovas[papel] = cv.toDataURL('image/png'); agendarRascunho(); };
    cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim); cv.addEventListener('lostpointercapture', fim);
  }
  function limparAssinatura(F, papel) {
    const cv = $('#pce-ass-' + papel); if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    delete F.assNovas[papel]; F.ass[papel] = '';
    agendarRascunho();
  }
  /** Assinaturas desenhadas viram arquivos PNG (só as que foram desenhadas). Devolve o mapa final papel→id e os arquivos a gravar. */
  function prepararAssinaturas(F) {
    const mapa = {}, novos = [];
    Object.keys(F.ass).forEach(p => { if (F.ass[p]) mapa[p] = F.ass[p]; });
    Object.keys(F.assNovas).forEach(p => { const a = novoArquivo(F.dono, F.id, 'assinatura', p, 'image/png', F.assNovas[p]); novos.push(a); mapa[p] = a.id; });
    return { mapa, novos };
  }

  /* ---------- GPS ---------- */
  async function capturarGPS(pref) {
    const st = $('#' + pref + 'gps-st'), form = st && st.closest('form'); if (!st) return;
    st.textContent = '📍 Obtendo localização…';
    const g = await pegarLocal();
    if (!form.isConnected) return;
    if (!g) { st.textContent = '⚠️ GPS indisponível ou permissão negada. Toque em “Atualizar GPS” para tentar de novo.'; return; }
    $('#' + pref + 'lat').value = g.lat; $('#' + pref + 'lon').value = g.lng; $('#' + pref + 'precisao').value = g.prec;
    st.textContent = `✓ Localização obtida (precisão aproximada: ${g.prec} m).`;
    agendarRascunho();
  }
  const gpsHTML = (pref, D) => `<div class="duas"><label>Latitude<input id="${pref}lat" readonly value="${esc(D.lat)}"></label>
      <label>Longitude<input id="${pref}lon" readonly value="${esc(D.lon)}"></label></div><input type="hidden" id="${pref}precisao" value="${esc(D.precisao)}">
      <div class="pce-gps"><span id="${pref}gps-st" class="dica">${D.lat !== '' && D.lat != null ? `Precisão aproximada: ${esc(D.precisao)} m.` : ''}</span>
      <button type="button" class="mini" data-pce="gps" data-pref="${pref}">📍 Atualizar GPS</button></div>`;

  /* ---------- consulta do produtor (servidor quando online; aparelho quando offline) ---------- */
  const qtd = v => (Array.isArray(v) ? v.length : Number(v) || 0);
  async function buscarProdutor(doc) {
    if (navigator.onLine && Sync.ativado()) {
      try {
        const r = await Sync.pceConsultar(doc), t = Date.now();
        if (r.pessoa) { const l = await Store.obter('pessoas', r.pessoa.id || doc); if (!l || !l.pendente) await Store.gravar('pessoas', { ...(l || {}), ...r.pessoa, id: r.pessoa.id || doc, criadoEm: t, atualizadoEm: t, pendente: 0 }); }
        for (const p of r.propriedades || []) { const l = await Store.obter('propriedades', p.id); if (p.id && (!l || !l.pendente)) await Store.gravar('propriedades', { ...p, pendente: 0 }); }
        return { pessoa: r.pessoa || null, propriedades: r.propriedades || [], levantamentos: qtd(r.levantamentos), colheitas: qtd(r.colheitas), parcial: false };
      } catch (e) { if (/revogado|inv[aá]lido/i.test(e.message)) throw e; }          // sem resposta: segue offline
    }
    const doDoc = x => !x.excluido && digitos(x.doc) === doc;
    return { pessoa: (await Store.obter('pessoas', doc)) || null, propriedades: (await Store.todos('propriedades')).filter(doDoc), parcial: true,
      levantamentos: (await Store.todos('levantamentos')).filter(doDoc).length, colheitas: (await Store.todos('colheitas')).filter(doDoc).length };
  }
  async function consultarDoc(pref) {
    const F = pref === 'pce-t-' ? T : L, inp = $('#' + pref + 'doc'), st = $('#' + pref + 'st-doc');
    if (!F || !inp || !st) return;
    const d = digitos(inp.value); if (d.length !== 11 && d.length !== 14) { st.innerHTML = '<div class="tf-alerta">Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.</div>'; return; }
    st.innerHTML = '<small>Consultando cadastro…</small>';
    let r; try { r = await buscarProdutor(d); } catch (e) { st.textContent = e.message; return; }
    if (!st.isConnected || digitos(inp.value) !== d) return;
    F.props = r.propriedades;
    let html = docOk(d) ? '' : `<div class="tf-alerta">⚠️ ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
    const set = (id, v, soVazio) => { const el = $('#' + pref + id); if (el && v && (!soVazio || !el.value.trim())) el.value = v; };
    if (r.pessoa) {
      set('nome', r.pessoa.nome); set('telefone', r.pessoa.telefone); set('email', r.pessoa.email);
      if (pref === 'pce-t-') set('endereco', r.pessoa.endereco, true);
      html += '<div class="tf-ok">✓ Cadastro encontrado — dados preenchidos automaticamente.</div>';
    } else html += '<div class="tf-novo">Novo cadastro — os dados do produtor serão salvos na planilha.</div>';
    if (r.levantamentos || r.colheitas) html += `<div class="tf-ok">ℹ️ ${r.levantamentos} levantamento(s) e ${r.colheitas} termo(s) de colheita anteriores${r.parcial ? ' <small>(sem conexão: só este aparelho)</small>' : ''}.</div>`;
    if (r.propriedades.length) {
      html += `<div class="tf-novo"><b>Propriedade(s) cadastrada(s):</b><ul>${r.propriedades.map((p, i) => `<li>${esc(p.nome || p.codigo || p.id)}${p.codigo ? ' · cód. ' + esc(p.codigo) : ''}${p.municipio ? ' · ' + esc(p.municipio) : ''}
        <button type="button" class="mini" data-pce="usarprop" data-pref="${pref}" data-i="${i}">Usar</button></li>`).join('')}</ul></div>`;
      if (r.propriedades.length === 1 && pref === 'pce-' && !$('#pce-propriedade').value.trim()) usarPropriedade(pref, 0);
    }
    st.innerHTML = html; agendarRascunho();
  }
  function usarPropriedade(pref, i) {
    const F = pref === 'pce-t-' ? T : L, p = F && F.props && F.props[i]; if (!p) return;
    const set = (id, v) => { const el = $('#' + pref + id); if (el && v != null && v !== '') el.value = v; };
    if (pref === 'pce-') { set('propriedade', p.nome); set('codigo', p.codigo); set('situacao', p.situacaoFundiaria); set('municipio', p.municipio); }
    else { set('endereco', p.nome); set('municipio', p.municipio); }
    agendarRascunho();
  }
  const tm = {};
  function aoDigitarDoc(pref, el) {
    const d = digitos(el.value); clearTimeout(tm[pref]);
    if (d.length === 11 || d.length === 14) tm[pref] = setTimeout(() => consultarDoc(pref), 400);
    else { const st = $('#' + pref + 'st-doc'); if (st) st.replaceChildren(); }
  }

  /* ---------- cadastro do produtor e da propriedade (gravados ao salvar) ---------- */
  async function montarPessoa(doc, campos) {
    const l = await Store.obter('pessoas', doc), t = Date.now(), o = { ...(l || {}) };
    delete o.pendente;
    Object.keys(campos).forEach(k => { if (campos[k]) o[k] = campos[k]; });                // campo vazio não apaga o cadastro
    return { ...o, id: doc, tipo: doc.length === 14 ? 'PJ' : 'PF', criadoEm: (l && l.criadoEm) || t, atualizadoEm: t };
  }
  const propId = (codigo, doc, nome) => (String(codigo || '').trim() || (doc && String(nome || '').trim()
    ? doc + '|' + semAcento(nome).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() : '')).slice(0, 64).trim();   // o servidor ignora id > 64
  async function montarPropriedade(o) {
    const id = propId(o.codigo, o.doc, o.nome); if (!id) return null;
    const l = await Store.obter('propriedades', id), t = Date.now(), base = { ...(l || {}) };
    delete base.pendente;
    return { ...base, id, codigo: String(o.codigo || '').trim() || base.codigo || '', nome: String(o.nome || '').trim() || base.nome || '', doc: o.doc,
      municipio: o.municipio || base.municipio || '', situacaoFundiaria: o.situacaoFundiaria || base.situacaoFundiaria || '',
      lat: o.lat !== '' && o.lat != null ? o.lat : (base.lat != null ? base.lat : ''), lon: o.lon !== '' && o.lon != null ? o.lon : (base.lon != null ? base.lon : ''),
      criadoEm: base.criadoEm || t, atualizadoEm: t };
  }

  /* ---------- rascunho automático (mesma proteção de corrida do TF) ---------- */
  let L = null, T = null, tRasc = null;                                  // estado dos formulários abertos
  function agendarRascunho(atraso = 500) {
    clearTimeout(tRasc);
    const f = $('#pceLevForm') || $('#pceTermoForm'), st = f && (f.id === 'pceLevForm' ? L : T);
    if (!f || !st) return;
    tRasc = setTimeout(() => {
      if (f.id === 'pceLevForm' && L === st && $('#pceLevForm') === f)                      // só grava se ainda é o mesmo formulário
        Store.setMeta('pceLevRascunho', { dados: coletarLev(), id: st.id, novo: st.novo, fotos: st.fotos, ass: st.ass, assNovas: st.assNovas, em: Date.now() });
      else if (f.id === 'pceTermoForm' && T === st && $('#pceTermoForm') === f)
        Store.setMeta('pceTermoRascunho', { dados: coletarTermo(), id: st.id, fotos: st.fotos, assNovas: st.assNovas, levantamentoId: st.levantamentoId, tplDesc: st.tplDesc, em: Date.now() });
    }, atraso);
  }
  /** Descarta um rascunho: apaga as fotos que só existiam nele. */
  async function descartarRascunho(qual, rasc) {
    if (rasc) {
      const rec = await Store.obter(qual === 'lev' ? 'levantamentos' : 'colheitas', rasc.id), salvo = idsArquivos(rec);
      await apagarSeNaoEnviado((rasc.fotos || []).filter(id => !salvo.has(id)));
    }
    await Store.setMeta(qual === 'lev' ? 'pceLevRascunho' : 'pceTermoRascunho', null);
  }
  function fechar(F) { if (F) F.vivo = false; clearTimeout(tRasc); }

  /* ================= Levantamento fitossanitário ================= */
  const culturaVazia = () => ({ cultura: '', area: '', espLinha: '', espPlanta: '', praga: '', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' });
  const levVazio = s => ({ doc: '', nome: '', telefone: '', email: '', propriedade: '', codigoPropriedade: '', situacaoFundiaria: '', municipio: s.lotacao || '',
    lat: '', lon: '', precisao: '', data: hojeISO(), hora: agoraHM(), obs: '', culturas: [culturaVazia()] });
  const levDeRegistro = r => ({ doc: fmtDoc(digitos(r.doc)), nome: r.nome || '', telefone: r.telefone || '', email: r.email || '', propriedade: r.propriedade || '',
    codigoPropriedade: r.codigoPropriedade || '', situacaoFundiaria: r.situacaoFundiaria || '', municipio: r.municipio || '', lat: r.lat == null ? '' : r.lat,
    lon: r.lon == null ? '' : r.lon, precisao: r.precisao == null ? '' : r.precisao, data: r.data || '', hora: r.hora || '', obs: r.obs || '',
    culturas: lerJSON(r.culturas, []).length ? lerJSON(r.culturas, []) : [culturaVazia()] });

  function coletarLev() {
    const g = id => { const e = $('#pce-' + id); return e ? e.value : ''; };
    return { doc: g('doc'), nome: g('nome'), telefone: g('telefone'), email: g('email'), propriedade: g('propriedade'), codigoPropriedade: g('codigo'),
      situacaoFundiaria: g('situacao'), municipio: g('municipio'), lat: g('lat'), lon: g('lon'), precisao: g('precisao'), data: g('data'), hora: g('hora'), obs: g('obs'),
      culturas: [...document.querySelectorAll('#pce-culturas .pce-cult')].map(b => {
        const q = c => b.querySelector('.c-' + c).value;
        return { cultura: q('cultura'), area: q('area'), espLinha: q('espLinha'), espPlanta: q('espPlanta'), praga: q('praga'), coleta: q('coleta'),
          tipoMaterial: q('tipoMaterial'), codigoAmostra: q('codigoAmostra'), destinoAmostra: q('destinoAmostra') };
      }) };
  }
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input id="pce-${id}" value="${esc(v)}" ${extra}></label>`;
  function blocoCultura(c, i) {
    const amostra = c.coleta === 'Sim' ? '' : 'disabled';
    const inp = (cls, rot, extra = '') => `<label>${rot}<input class="c-${cls}" value="${esc(c[cls])}" maxlength="60" ${extra}></label>`;
    return `<div class="pce-cult" data-i="${i}"><div class="pce-cult-topo"><b>Cultura ${i + 1}</b>
        <button type="button" class="mini" data-pce="delcult" data-i="${i}" aria-label="Remover cultura ${i + 1}">Remover</button></div>
      <label>Cultura *<select class="c-cultura">${opts(P.culturas, c.cultura, 'Selecione')}</select></label>
      <div class="duas">${inp('area', 'Área (ha)', 'inputmode="decimal"')}<label>Praga<select class="c-praga">${opts(P.pragas, c.praga, 'Nenhuma / selecione')}</select></label></div>
      <div class="duas">${inp('espLinha', 'Espaçamento entre linhas')}${inp('espPlanta', 'Espaçamento entre plantas')}</div>
      <label>Coleta de amostra<select class="c-coleta">${opts(['Não', 'Sim'], c.coleta === 'Sim' ? 'Sim' : 'Não')}</select></label>
      <div class="pce-amostra">${inp('tipoMaterial', 'Tipo de material', amostra)}<div class="duas">${inp('codigoAmostra', 'Código da amostra', amostra)}${inp('destinoAmostra', 'Destino da amostra', amostra)}</div></div></div>`;
  }
  const desenharCulturas = lista => { $('#pce-culturas').innerHTML = lista.map(blocoCultura).join(''); };

  function formLevHTML(D, F) {
    return `<form id="pceLevForm" autocomplete="off">
    <div class="card"><h3>${F.novo ? '🌱 Novo levantamento fitossanitário' : '🌱 Editar levantamento'}</h3>
      <p class="dica" style="text-align:left">Servidor: <b>${esc(F.serv.servidor)}</b> · ${esc(F.serv.cargo)} · ${esc(F.serv.lotacao)}</p></div>
    <div class="card"><h3>Dados do produtor</h3>
      <div class="pce-busca">${campo('doc', 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
        <button type="button" class="mini" data-pce="consultar" data-pref="pce-" aria-label="Consultar cadastro">🔍</button></div>
      <div id="pce-st-doc" class="tf-status" aria-live="polite"></div>
      ${campo('nome', 'Nome completo / Razão social *', D.nome)}
      <div class="duas">${campo('telefone', 'Telefone', D.telefone, 'type="tel"')}${campo('email', 'E-mail', D.email, 'type="email"')}</div>
      ${campo('propriedade', 'Nome da propriedade', D.propriedade)}
      <div class="duas">${campo('codigo', 'Código da propriedade', D.codigoPropriedade, 'maxlength="60"')}
        <label>Situação fundiária<select id="pce-situacao">${opts(P.situacoes, D.situacaoFundiaria, 'Selecione')}</select></label></div></div>
    <div class="card"><h3>Localização</h3>
      <label>Município *<select id="pce-municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>
      ${gpsHTML('pce-', D)}
      <div class="duas">${campo('data', 'Data da vistoria', D.data, 'type="date"')}${campo('hora', 'Hora', D.hora, 'type="time"')}</div></div>
    <div class="card"><h3>Culturas e pragas</h3><div id="pce-culturas"></div>
      <button type="button" class="botao sec" data-pce="addcult" id="pce-addcult">+ Adicionar cultura</button></div>
    <div class="card"><h3>Fotos</h3>
      <label class="pce-arquivo">📷 Adicionar fotos<input type="file" id="pce-fotos" accept="image/*" multiple></label>
      <div id="pce-fotos-prev" class="pce-fotos"></div></div>
    <div class="card"><h3>Assinaturas (opcional)</h3>
      <p class="dica" style="text-align:left">Assine com o dedo, se quiser. A ficha impressa sempre traz as linhas para assinar no papel.</p>
      ${assHTML('servidor', 'Servidor')}${assHTML('produtor', 'Produtor')}</div>
    <div class="card"><h3>Observações</h3><label><textarea id="pce-obs" rows="3" aria-label="Observações">${esc(D.obs)}</textarea></label></div>
    <button class="botao" type="submit" id="pce-salvar">💾 Salvar levantamento</button>
    <button class="botao sec" type="button" data-pce="descartarlev">Descartar alterações</button></form>`;
  }

  async function levantamento(id) {
    if (bloqueado()) return view(avisoAtivacao());
    const s = await exigirServidor('pcelev', id); if (!s) return;
    fechar(L); fechar(T); L = null;
    let F = null, D = null;
    const rasc = await Store.meta('pceLevRascunho');
    if (rasc && rasc.dados && id && rasc.id !== id) {                      // o rascunho é de OUTRO levantamento: não troca o escolhido sem avisar
      if (!confirm(`Há um rascunho não salvo de outro levantamento, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nDescartar esse rascunho e abrir o levantamento selecionado? (Cancelar volta à lista sem perder o rascunho.)`)) return go('pce');
      await descartarRascunho('lev', rasc);
    } else if (rasc && rasc.dados) {
      if (confirm(`Há ${rasc.novo ? 'um levantamento novo' : 'uma edição de levantamento'} não salvo, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
        const rec = await Store.obter('levantamentos', rasc.id);
        F = { id: rasc.id, novo: !rec, rec: rec || null, fotos: rasc.fotos || [], ass: rasc.ass || {}, assNovas: rasc.assNovas || {} };
        D = { ...levVazio(s), ...rasc.dados };
      } else await descartarRascunho('lev', rasc);
    }
    if (!F) {
      const rec = id ? await Store.obter('levantamentos', id) : null;
      if (id && (!rec || rec.excluido)) { toast('Levantamento não encontrado.', true); return go('pce'); }
      F = rec ? { id: rec.id, novo: false, rec, fotos: lerJSON(rec.fotos, []), ass: lerJSON(rec.assinaturas, {}), assNovas: {} }
        : { id: Store.novoId(), novo: true, rec: null, fotos: [], ass: {}, assNovas: {} };
      D = rec ? levDeRegistro(rec) : levVazio(s);
    }
    F.dono = 'levantamentos'; F.vivo = true; F.serv = F.rec ? { servidor: F.rec.servidor, cargo: F.rec.cargo, matricula: F.rec.matricula, lotacao: F.rec.lotacao } : dadosServidor(s);
    L = F;
    view(formLevHTML(D, F));
    desenharCulturas(D.culturas.length ? D.culturas : [culturaVazia()]);
    await renderFotos(F, '#pce-fotos-prev');
    await ligarAssinatura(F, 'servidor'); await ligarAssinatura(F, 'produtor');
    const f = $('#pceLevForm');
    f.addEventListener('input', e => { if (e.target.id === 'pce-doc') aoDigitarDoc('pce-', e.target); agendarRascunho(); });
    f.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pce-fotos') return adicionarFotos(F, t, '#pce-fotos-prev');
      if (t.id === 'pce-doc') t.value = fmtDoc(digitos(t.value));
      if (t.classList.contains('c-coleta')) t.closest('.pce-cult').querySelectorAll('.pce-amostra input').forEach(i => { i.disabled = t.value !== 'Sim'; });
      agendarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarLev(); };
    if (F.novo && (D.lat === '' || D.lat == null)) capturarGPS('pce-');                    // GPS automático ao abrir
  }

  async function salvarLev() {
    const F = L; if (!F || !F.vivo) return;
    const D = coletarLev(), doc = digitos(D.doc);
    if (!conferirDoc(doc)) return;
    if (!D.nome.trim()) return toast('Informe o nome do produtor.', true);
    if (!D.municipio) return toast('Escolha o município.', true);
    if (!D.culturas.some(c => c.cultura)) return toast('Informe pelo menos uma cultura.', true);
    if (!dataHoraOk(D)) return;
    const btn = $('#pce-salvar'); btn.disabled = true;
    try {
      const { mapa, novos } = prepararAssinaturas(F);
      const culturas = D.culturas.filter(c => c.cultura).map(c => (c.coleta === 'Sim' ? c : { ...c, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '' }));
      const antes = idsArquivos(F.rec), depois = new Set([...F.fotos, ...Object.values(mapa)]);
      await Store.gravarVarios('arquivos', novos);
      const base = { ...(F.rec || {}) }; delete base.pendente;
      const rec = { ...base, id: F.id, ...F.serv, data: D.data, hora: D.hora, doc, nome: D.nome.trim().replace(/\s+/g, ' ').toUpperCase(), telefone: D.telefone.trim(),
        email: D.email.trim(), propriedade: D.propriedade.trim(), codigoPropriedade: D.codigoPropriedade.trim(), situacaoFundiaria: D.situacaoFundiaria,
        municipio: D.municipio, lat: numOuVazio(D.lat), lon: numOuVazio(D.lon), precisao: numOuVazio(D.precisao), culturas: JSON.stringify(culturas),
        fotos: JSON.stringify(F.fotos), assinaturas: JSON.stringify(mapa), obs: D.obs.trim(), excluido: 0 };
      await Store.salvar('levantamentos', rec);
      await apagarSeNaoEnviado([...antes].filter(id => !depois.has(id)));               // removidos antes do envio somem do aparelho
      await Store.salvar('pessoas', await montarPessoa(doc, { nome: rec.nome, telefone: rec.telefone, email: rec.email }));
      const prop = await montarPropriedade({ codigo: rec.codigoPropriedade, nome: rec.propriedade, doc, municipio: rec.municipio, situacaoFundiaria: rec.situacaoFundiaria, lat: rec.lat, lon: rec.lon });
      if (prop) await Store.salvar('propriedades', prop);
      fechar(F); L = null; await Store.setMeta('pceLevRascunho', null);
      toast(F.novo ? 'Levantamento salvo.' : 'Levantamento atualizado.');
      Sync.sincronizar(); go('pce');
    } catch (e) { btn.disabled = false; toast('Erro ao salvar: ' + e.message, true); }
  }

  async function lista() {
    if (bloqueado()) return view(avisoAtivacao());
    const s = await exigirServidor('pce'); if (!s) return;
    fechar(L); fechar(T);
    const todos = (await Store.todos('levantamentos')).filter(x => !x.excluido)
      .sort((a, b) => ((b.data || '') + (b.hora || '')).localeCompare((a.data || '') + (a.hora || '')) || b.criadoEm - a.criadoEm);
    const pendArq = new Set(await Store.chaves('arquivos', 'enviado', 0));
    view(`<div class="card pce-serv"><div><b>${esc(s.nome)}</b><small>${esc(s.cargo)} · ${esc(s.lotacao)}${s.matricula ? ' · Mat. ' + esc(s.matricula) : ''}</small></div>
        <button class="mini" data-pce="servidor" id="pce-meusdados">👤 Meus dados</button></div>
      <button class="botao" data-pce="novolev" id="pce-novolev">➕ Novo levantamento</button>
      <div class="card"><label>Pesquisar (produtor, CPF/CNPJ, propriedade, município)<input id="pceQ"></label></div><div id="pceItens"></div>`);
    const desenhar = () => {
      const q = semAcento($('#pceQ').value.trim()).toUpperCase(), qd = digitos(q);
      const v = todos.filter(x => !q || semAcento([x.nome, x.propriedade, x.municipio, x.codigoPropriedade].join(' ')).toUpperCase().includes(q) || (qd && digitos(x.doc).includes(qd)));
      $('#pceItens').innerHTML = v.length ? v.map(x => {
        const cult = lerJSON(x.culturas, []), fotos = lerJSON(x.fotos, []), col = cult.filter(c => c.coleta === 'Sim').length;
        const pend = x.pendente || [...idsArquivos(x)].some(id => pendArq.has(id));
        return `<div class="item pce-lev" data-lev="${esc(x.id)}"><div class="topo"><div><div class="placa pce-nome">${esc(x.nome)}</div>
          <div class="tipo">${esc(x.propriedade || 'Propriedade não informada')} · ${esc(x.municipio)}</div></div><div class="hora">${esc(dBR(x.data))}<br>${esc(x.hora)}</div></div>
          <div class="info">${cult.length} cultura(s)${col ? ` · ${col} com coleta` : ''} · ${fotos.length} foto(s)</div>
          ${pend ? '<div class="info pend">⏳ aguardando envio</div>' : ''}
          <div class="botoes pce-acoes"><button class="editar" data-pce="abrirlev" data-id="${esc(x.id)}">Abrir</button>
          <button class="editar" data-pce="imprimirlev" data-id="${esc(x.id)}">Ficha (PDF)</button>
          <button class="tfbtn" data-pce="termodelev" data-id="${esc(x.id)}">Termo de colheita</button>
          <button class="excluir" data-pce="excluirlev" data-id="${esc(x.id)}">Excluir</button></div></div>`;
      }).join('') : '<div class="vazio">Nenhum levantamento neste aparelho.</div>';
    };
    desenhar(); $('#pceQ').oninput = desenhar;
  }

  async function excluirLev(id) {
    const r = await Store.obter('levantamentos', id); if (!r) return;
    if (!confirm(`Excluir o levantamento de ${r.nome} (${dBR(r.data)})?`)) return;
    await Store.salvar('levantamentos', { ...r, excluido: 1 });
    await apagarSeNaoEnviado([...idsArquivos(r)]);
    Sync.sincronizar(); toast('Levantamento excluído.'); lista();
  }

  /* ================= Termo de Colheita de Amostras ================= */
  const termoVazio = s => ({ unidade: s.lotacao || '', municipio: s.lotacao || '', doc: '', nome: '', endereco: '', lat: '', lon: '', precisao: '',
    data: hojeISO(), hora: agoraHM(), cultura: '', quantidade: '', analise: '', partes: [], descricao: '',
    testemunha1Nome: '', testemunha1Doc: '', testemunha2Nome: '', testemunha2Doc: '', local: s.lotacao ? s.lotacao + '/AM' : '' });

  function coletarTermo() {
    const g = id => { const e = $('#pce-t-' + id); return e ? e.value : ''; };
    return { unidade: g('unidade'), municipio: g('municipio'), doc: g('doc'), nome: g('nome'), endereco: g('endereco'), lat: g('lat'), lon: g('lon'), precisao: g('precisao'),
      data: g('data'), hora: g('hora'), cultura: g('cultura'), quantidade: g('quantidade'), analise: g('analise'),
      partes: [...document.querySelectorAll('input[name=pce-t-parte]:checked')].map(c => c.value), descricao: g('descricao'),
      testemunha1Nome: g('t1nome'), testemunha1Doc: g('t1doc'), testemunha2Nome: g('t2nome'), testemunha2Doc: g('t2doc'), local: g('local') };
  }
  function textoOficial(D, servidorNome) {
    const [a, m, d] = (D.data || '').split('-'), [h, mi] = (D.hora || '').split(':');
    const dataExt = a && m && d ? `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}` : '___', horaTxt = h ? `${h}h${mi || '00'}` : '___';
    return `Em ${dataExt}, às ${horaTxt}, o(a) servidor(a) ${servidorNome || '___'}, da Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF, ` +
      `realizou a coleta de ${String(D.quantidade || '').trim() || '___'} amostra(s) de ${D.partes.join(', ') || '___'} da cultura de ${D.cultura || '___'}, ` +
      `destinadas à análise ${String(D.analise || '').trim() || '___'}.`;
  }
  /** Atualiza o texto oficial sem sobrescrever o que o fiscal editou à mão (forcar = botão "Gerar texto oficial"). */
  function autoTexto(forcar) {
    const el = $('#pce-t-descricao'); if (!el || !T) return;
    const novo = textoOficial(coletarTermo(), T.serv.servidor);
    if (forcar || !el.value.trim() || el.value === T.tplDesc) { el.value = novo; T.tplDesc = novo; }
  }

  function formTermoHTML(D, F) {
    const c = (id, rot, v, extra = '') => `<label>${rot}<input id="pce-t-${id}" value="${esc(v)}" ${extra}></label>`;
    return `<form id="pceTermoForm" autocomplete="off">
    <div class="card"><h3>🧪 Termo de Colheita de Amostras</h3>
      <label>Unidade *<select id="pce-t-unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
      <div class="tf-num" id="pce-t-numero"></div>
      ${F.levantamentoId ? '<p class="dica" style="text-align:left">📎 Ligado a um levantamento fitossanitário.</p>' : ''}
      <p class="dica" style="text-align:left">Servidor: <b>${esc(F.serv.servidor)}</b> · ${esc(F.serv.cargo)}</p></div>
    <div class="card"><h3>1. Identificação</h3>
      <label>Município *<select id="pce-t-municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>
      <div class="pce-busca">${c('doc', 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
        <button type="button" class="mini" data-pce="consultar" data-pref="pce-t-" aria-label="Consultar cadastro">🔍</button></div>
      <div id="pce-t-st-doc" class="tf-status" aria-live="polite"></div>
      ${c('nome', 'Produtor / Razão social *', D.nome)}
      ${c('endereco', 'Endereço da propriedade', D.endereco)}
      ${gpsHTML('pce-t-', D)}</div>
    <div class="card"><h3>2. Descrição da ação</h3>
      <div class="duas">${c('data', 'Data', D.data, 'type="date"')}${c('hora', 'Hora', D.hora, 'type="time"')}</div>
      <label>Cultura *<select id="pce-t-cultura">${opts(P.culturas, D.cultura, 'Selecione')}</select></label>
      <div class="duas">${c('quantidade', 'Quantidade de amostras *', D.quantidade, 'type="number" inputmode="numeric" min="1"')}${c('analise', 'Tipo de análise', D.analise)}</div>
      <fieldset class="pce-partes-grupo"><legend>Partes da planta coletadas</legend>
      <div class="pce-partes">${P.partes.map(p => `<label class="chk"><input type="checkbox" name="pce-t-parte" value="${esc(p)}" ${D.partes.includes(p) ? 'checked' : ''}> ${esc(p[0].toUpperCase() + p.slice(1))}</label>`).join('')}</div></fieldset>
      <label>Texto oficial (pode ser editado)<textarea id="pce-t-descricao" rows="6">${esc(D.descricao)}</textarea></label>
      <button type="button" class="botao sec" data-pce="gerartexto" id="pce-t-gerartexto">📝 Gerar texto oficial</button></div>
    <div class="card"><h3>3. Fotos da amostra</h3>
      <label class="pce-arquivo">📷 Adicionar fotos<input type="file" id="pce-t-fotos" accept="image/*" multiple></label>
      <div id="pce-t-fotos-prev" class="pce-fotos"></div></div>
    <div class="card"><h3>4. Testemunhas</h3>
      <div class="duas">${c('t1nome', 'Testemunha 1 – nome', D.testemunha1Nome)}${c('t1doc', 'Testemunha 1 – CPF/RG', D.testemunha1Doc)}</div>
      <div class="duas">${c('t2nome', 'Testemunha 2 – nome', D.testemunha2Nome)}${c('t2doc', 'Testemunha 2 – CPF/RG', D.testemunha2Doc)}</div></div>
    <div class="card"><h3>Assinaturas (opcional)</h3>
      <p class="dica" style="text-align:left">Assine com o dedo, se quiser. O termo impresso sempre traz as linhas para assinar no papel.</p>
      ${assHTML('testemunha1', 'Testemunha 1')}${assHTML('testemunha2', 'Testemunha 2')}${assHTML('produtor', 'Produtor')}${assHTML('servidor', 'Servidor')}</div>
    <div class="card">${c('local', 'Local', D.local, 'placeholder="ex.: Manaus/AM"')}</div>
    <button class="botao" type="submit" id="pce-t-gerar">📄 Gerar Termo de Colheita</button>
    <button class="botao sec" type="button" data-pce="descartartermo">Descartar este termo</button></form>`;
  }

  async function ultimoConhecido(u, a) {                                  // base para propor número SEM internet
    const uv = ((await Store.meta('ultimoVistoPce')) || {})[chave(u, a)] || 0;
    const locais = (await Store.todos('colheitas')).filter(t => unid(t.unidade) === unid(u) && Number(t.ano) === a).reduce((m, t) => Math.max(m, Number(t.numero) || 0), 0);
    return Math.max(uv, locais);
  }
  async function sugerirNumero(u, a) {
    if (navigator.onLine && Sync.ativado()) {
      try {
        const r = await Sync.pceProximoNumero(u, a);                       // consulta rápida: último nº usado + 1
        await Sync.lembrarUltimosPce({ [chave(u, a)]: r.ultimo });
        return { numero: Math.max(r.proximo, (await ultimoConhecido(u, a)) + 1), origem: 'servidor', ultimo: r.ultimo,
          ultimoReg: r.ultimoTermo || r.ultimoColheita || r.ultimoTF || null };
      } catch (e) { if (/revogado|inv[aá]lido|desconhecida/i.test(e.message)) throw e; }      // sem resposta: segue offline
    }
    const u0 = await ultimoConhecido(u, a);
    return { numero: u0 + 1, origem: 'offline', ultimo: u0, ultimoReg: null };
  }
  async function mostrarInfoNumero() {
    const sel = $('#pce-t-unidade'), el = $('#pce-t-numero'); if (!sel || !el) return;
    if (!sel.value) { el.innerHTML = '<small>Escolha a unidade.</small>'; return; }
    const a = anoAtual(), u = await ultimoConhecido(sel.value, a);
    if ($('#pce-t-numero') !== el) return;
    el.innerHTML = `<small>Nº do Termo</small><b>definido ao gerar</b><small>Ao gerar, o sistema consulta a planilha (último nº usado + 1) e mostra o número para você confirmar ou editar, antes do PDF.${u ? ' Último nº conhecido neste aparelho: ' + esc(numTxt(u, a, sel.value)) + '.' : ''}</small>`;
  }

  async function termo(prefill) {
    if (bloqueado()) return view(avisoAtivacao());
    const s = await exigirServidor('pcetermo', prefill); if (!s) return;
    prefill = prefill || {}; fechar(L); fechar(T); T = null;
    let F = null, D = null;
    const rasc = await Store.meta('pceTermoRascunho');
    if (rasc && rasc.dados && prefill.levantamentoId && rasc.levantamentoId !== prefill.levantamentoId) {   // rascunho de OUTRO produtor/levantamento
      if (!confirm(`Há um Termo de Colheita não gerado${rasc.dados.nome ? ' de ' + rasc.dados.nome : ''}, de outro levantamento, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nDescartar esse rascunho e abrir um termo do levantamento selecionado? (Cancelar volta à lista sem perder o rascunho.)`)) return go('pce');
      await descartarRascunho('termo', rasc);
    } else if (rasc && rasc.dados) {
      if (confirm(`Há um Termo de Colheita não gerado, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
        F = { id: rasc.id, fotos: rasc.fotos || [], ass: {}, assNovas: rasc.assNovas || {}, levantamentoId: rasc.levantamentoId || '', tplDesc: rasc.tplDesc || '' };
        D = { ...termoVazio(s), ...rasc.dados };
      } else await descartarRascunho('termo', rasc);
    }
    if (!F) {
      F = { id: Store.novoId(), fotos: [], ass: {}, assNovas: {}, levantamentoId: '', tplDesc: '' };
      D = termoVazio(s);
      const lev = prefill.levantamentoId ? await Store.obter('levantamentos', prefill.levantamentoId) : null;
      if (lev) {                                                             // termo a partir de um levantamento
        const cult = lerJSON(lev.culturas, []), c = cult.find(x => x.coleta === 'Sim') || cult[0] || {};
        F.levantamentoId = lev.id;
        Object.assign(D, { doc: fmtDoc(digitos(lev.doc)), nome: lev.nome || '', municipio: lev.municipio || D.municipio, lat: lev.lat == null ? '' : lev.lat,
          lon: lev.lon == null ? '' : lev.lon, precisao: lev.precisao == null ? '' : lev.precisao, cultura: c.cultura || '',
          endereco: [lev.propriedade, lev.codigoPropriedade && 'cód. ' + lev.codigoPropriedade].filter(Boolean).join(' – '),
          local: (lev.municipio || s.lotacao) ? (lev.municipio || s.lotacao) + '/AM' : '' });
      }
    }
    F.dono = 'colheitas'; F.vivo = true; F.serv = dadosServidor(s);
    T = F;
    view(formTermoHTML(D, F));
    await mostrarInfoNumero();
    autoTexto(false);
    await renderFotos(F, '#pce-t-fotos-prev');
    for (const p of ['testemunha1', 'testemunha2', 'produtor', 'servidor']) await ligarAssinatura(F, p);
    const f = $('#pceTermoForm');
    const AFETA = ['pce-t-data', 'pce-t-hora', 'pce-t-cultura', 'pce-t-quantidade', 'pce-t-analise'];
    f.addEventListener('input', e => {
      if (e.target.id === 'pce-t-doc') aoDigitarDoc('pce-t-', e.target);
      if (AFETA.includes(e.target.id)) autoTexto(false);
      agendarRascunho();
    });
    f.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'pce-t-fotos') return adicionarFotos(F, t, '#pce-t-fotos-prev');
      if (t.id === 'pce-t-doc') t.value = fmtDoc(digitos(t.value));
      if (t.id === 'pce-t-unidade') await mostrarInfoNumero();
      if (AFETA.includes(t.id) || t.name === 'pce-t-parte') autoTexto(false);
      agendarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); gerarTermo(); };
    if (D.lat === '' || D.lat == null) capturarGPS('pce-t-');
  }

  function pedirNumero(o) {                                                // popup: número vindo da planilha, editável antes do PDF
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal';
      const r = o.ultimoReg;
      const ult = r && r.numeroTxt ? `Último número usado nesta unidade: <b>${esc(r.numeroTxt)}</b>${r.usuario ? ` (${esc(r.usuario)}, ${esc(dBR(r.data))} ${esc(r.hora || '')})` : ''}.`
        : o.ultimo ? `Último número usado nesta unidade: <b>${esc(numTxt(o.ultimo, o.ano, o.unidade))}</b>.` : 'Nenhum Termo de Colheita anterior nesta unidade neste ano.';
      m.innerHTML = `<div class="tf-modal-box"><h3>🧪 Número do Termo de Colheita</h3>
        ${o.aviso ? `<div class="tf-alerta">${esc(o.aviso)}</div>` : ''}
        ${o.offline ? '<div class="tf-novo">⚠️ Sem conexão: número <b>provisório</b>, calculado a partir do último número que este aparelho conhece. Será conferido na planilha ao sincronizar.</div>' : '<div class="tf-ok">✓ Número obtido na planilha agora.</div>'}
        <p class="dica">${ult}</p>
        <input id="pce-num-m" type="number" inputmode="numeric" min="1" value="${o.numero}"><div id="pce-num-prev" class="tf-num"></div><div id="pce-num-edit" class="dica"></div>
        <p class="dica">Confira o número. Se necessário, você pode alterá-lo antes de gerar o PDF.</p>
        <div class="duas"><button class="botao sec" id="pce-m-cancel" type="button">Cancelar</button><button class="botao" id="pce-m-ok" type="button">Confirmar e gerar</button></div></div>`;
      document.body.append(m); const i = m.querySelector('input');
      const prev = () => { const n = +i.value || 0; m.querySelector('#pce-num-prev').innerHTML = `<b>${esc(numTxt(n, o.ano, o.unidade))}</b>`;
        m.querySelector('#pce-num-edit').textContent = n && n !== o.sugerido ? `✏️ Número alterado (o sistema sugeriu ${num3(o.sugerido)}). Isso fica registrado para auditoria.` : ''; };
      i.oninput = prev; prev(); i.focus(); i.select();
      m.querySelector('#pce-m-cancel').onclick = () => { m.remove(); ok(null); };
      m.querySelector('#pce-m-ok').onclick = () => { const n = parseInt(i.value, 10); if (!(n > 0)) { toast('Informe o número do termo.', true); return; } m.remove(); ok(n); };
    });
  }

  async function gerarTermo() {
    const F = T; if (!F || !F.vivo) return;
    const D = coletarTermo(), a = anoAtual(), u = unid(D.unidade), doc = digitos(D.doc);
    if (!u) return toast('Escolha a unidade.', true);
    if (!D.municipio) return toast('Escolha o município.', true);
    if (!D.nome.trim()) return toast('Informe o nome do produtor / razão social.', true);
    if (!conferirDoc(doc)) return;
    if (!D.cultura) return toast('Escolha a cultura.', true);
    if (!(Number(D.quantidade) > 0)) return toast('Informe a quantidade de amostras.', true);
    if (!dataHoraOk(D)) return;
    if (!D.descricao.trim()) { autoTexto(true); D.descricao = $('#pce-t-descricao').value; }

    if (F.gerando) return;                                                 // segundo toque: o primeiro fluxo ainda não terminou
    const btn = $('#pce-t-gerar'), rot = btn.textContent;
    F.gerando = true; btn.disabled = true; btn.textContent = '🔎 Consultando a planilha…';
    try { await gerarTermoNumerado(F, D, a, u, doc, btn); }
    finally { F.gerando = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = rot; } }
  }
  async function gerarTermoNumerado(F, D, a, u, doc, btn) {
    let sug; try { sug = await sugerirNumero(u, a); } catch (e) { return toast(e.message, true); }
    btn.textContent = '⏳ Gerando…';

    const t0 = Date.now(), id = F.id, nome = D.nome.trim().replace(/\s+/g, ' ').toUpperCase();
    const { mapa, novos } = prepararAssinaturas(F);
    const pessoa = await montarPessoa(doc, { nome });
    const lev = F.levantamentoId ? await Store.obter('levantamentos', F.levantamentoId) : null;
    const prop = lev ? await montarPropriedade({ codigo: lev.codigoPropriedade, nome: lev.propriedade, doc, municipio: lev.municipio, situacaoFundiaria: lev.situacaoFundiaria, lat: lev.lat, lon: lev.lon }) : null;

    let numero = sug.numero, aviso = '';
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const n = await pedirNumero({ numero, sugerido: sug.numero, unidade: u, ano: a, ultimo: sug.ultimo, ultimoReg: sug.ultimoReg, offline: sug.origem !== 'servidor', aviso });
      if (n == null || !F.vivo) return;
      if ((await Store.todos('colheitas')).some(t => unid(t.unidade) === u && Number(t.ano) === a && Number(t.numero) === n && t.id !== id)) {
        numero = n; aviso = `Este aparelho já gerou o termo nº ${numTxt(n, a, u)}. Escolha outro número.`; continue;
      }
      const rec = {
        id, criadoEm: t0, atualizadoEm: t0, unidade: u, ano: a, numero: n, numeroTxt: numTxt(n, a, u), numeroSugerido: sug.numero,
        numeroOrigem: sug.origem !== 'servidor' ? 'provisorio' : (n === sug.numero ? 'sistema' : 'editado'), conflito: 0, levantamentoId: F.levantamentoId || '',
        data: D.data, hora: D.hora, ...F.serv, municipio: D.municipio, doc, nome, endereco: D.endereco.trim(),
        lat: numOuVazio(D.lat), lon: numOuVazio(D.lon), precisao: numOuVazio(D.precisao), cultura: D.cultura, quantidade: Number(D.quantidade) || 0,
        analise: D.analise.trim(), partes: D.partes.join(', '), descricao: D.descricao.trim(), fotos: JSON.stringify(F.fotos),
        testemunha1Nome: D.testemunha1Nome.trim(), testemunha1Doc: D.testemunha1Doc.trim(), testemunha2Nome: D.testemunha2Nome.trim(), testemunha2Doc: D.testemunha2Doc.trim(),
        assinaturas: JSON.stringify(mapa), local: D.local.trim(), cancelado: 0, motivoCancel: '', excluido: 0
      };
      let emitido = null;
      if (sug.origem === 'servidor') {                                       // a planilha confirma que o número ainda está livre
        try {
          const r = await Sync.pceEmitir(rec, pessoa, prop);
          if (r.emitido === false) {                                         // outro servidor usou este número nesse intervalo
            const oc = r.ocupadoPor || {};
            sug = { ...sug, numero: r.proximo, ultimo: r.ultimo, ultimoReg: { ...oc } }; numero = r.proximo;
            aviso = `O nº ${numTxt(n, a, u)} acabou de ser usado${oc.usuario ? ` por ${oc.usuario} (${dBR(oc.data)} ${oc.hora || ''})` : ''}. Nova sugestão: ${num3(r.proximo)}.`;
            continue;
          }
          emitido = r;
        } catch (e) { if (/revogado|inv[aá]lido/i.test(e.message)) return toast(e.message, true); }   // sem resposta: guarda e envia ao sincronizar
      }
      const est = emitido ? { pendente: 0, emitidoEm: emitido.emitidoEm } : { pendente: 1, provisorio: sug.origem !== 'servidor' ? 1 : 0 };
      await Store.gravarVarios('arquivos', novos);
      await Store.gravar('colheitas', { ...rec, ...est });
      await Store.gravar('pessoas', { ...pessoa, pendente: est.pendente });
      if (prop) await Store.gravar('propriedades', { ...prop, pendente: est.pendente });
      await Sync.lembrarUltimosPce({ [chave(u, a)]: n });
      fechar(F); T = null; await Store.setMeta('pceTermoRascunho', null);
      Sync.sincronizar(); go('pcepronto', id); return;
    }
    toast('Não foi possível definir o número do termo. Tente novamente.', true);
  }

  async function pronto(id) {
    const t = await Store.obter('colheitas', id); if (!t) return go('pcetermos');
    view(`<div class="card" id="pce-pronto"><h3>✅ Termo de Colheita gerado</h3><div class="tf-num"><b id="pce-pronto-num">${esc(t.numeroTxt)}</b></div>
      <p>${esc(t.nome)} · ${esc(fmtDoc(digitos(t.doc)))}</p><p>${esc(dBR(t.data))} ${esc(t.hora)} · ${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s)</p>
      ${t.pendente ? '<div class="tf-novo">⏳ Número provisório / aguardando envio: será conferido na planilha ao sincronizar. Se houver repetição, a coordenação é avisada.</div>' : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}
      ${t.numeroOrigem === 'editado' ? `<div class="tf-novo">✏️ Número alterado manualmente (o sistema sugeriu ${num3(t.numeroSugerido)}). Registrado para auditoria.</div>` : ''}</div>
      <button class="botao" data-pce="imprimirtermo" data-id="${esc(t.id)}" id="pce-imprimir">🖨️ Imprimir / PDF (${P.vias || 2} vias)</button>
      <button class="botao sec" data-pce="novotermo">➕ Novo termo</button>
      <button class="botao sec" data-v="pcetermos">📋 Ver termos de colheita</button>
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto. As vias saem em páginas separadas.</p>`);
  }

  async function termos() {
    if (bloqueado()) return view(avisoAtivacao());
    const s = await exigirServidor('pcetermos'); if (!s) return;
    fechar(L); fechar(T);
    const todos = (await Store.todos('colheitas')).filter(x => !x.excluido).sort((a, b) => b.criadoEm - a.criadoEm);
    view(`<button class="botao" data-pce="novotermo" id="pce-novotermo">➕ Novo termo de colheita</button>
      <div class="card"><label>Pesquisar (nº, produtor, CPF/CNPJ, cultura)<input id="pceTQ"></label></div><div id="pceTItens"></div>`);
    const desenhar = () => {
      const q = semAcento($('#pceTQ').value.trim()).toUpperCase(), qd = digitos(q);
      const v = todos.filter(t => !q || semAcento([t.numeroTxt, t.nome, t.cultura, t.municipio].join(' ')).toUpperCase().includes(q) || (qd && digitos(t.doc).includes(qd)));
      $('#pceTItens').innerHTML = v.length ? v.map(t => `<div class="item pce-termo" data-termo="${esc(t.id)}"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div>
        <div class="hora">${esc(dBR(t.data))}</div></div>
        <div class="info">${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s) · ${esc(t.municipio)}</div>
        ${t.cancelado ? `<div class="info pend">⛔ CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
        ${t.conflito ? '<div class="info pend">⚠️ Número duplicado na planilha: confira com a coordenação.</div>' : ''}
        ${t.pendente ? `<div class="info pend">⏳ ${t.provisorio ? 'número provisório, será conferido ao sincronizar' : 'aguardando envio'}</div>` : ''}
        <div class="botoes"><button class="editar" data-pce="imprimirtermo" data-id="${esc(t.id)}">Imprimir</button>
        ${t.cancelado ? '' : `<button class="excluir" data-pce="cancelartermo" data-id="${esc(t.id)}">Cancelar termo</button>`}</div></div>`).join('')
        : '<div class="vazio">Nenhum Termo de Colheita neste aparelho.</div>';
    };
    desenhar(); $('#pceTQ').oninput = desenhar;
  }

  /* ---------- impressão (modelos em web/documentos, via docs.js) ---------- */
  async function imprimir(qual, id) {
    const store = qual === 'lev' ? 'levantamentos' : 'colheitas', fn = qual === 'lev' ? 'pceLevantamento' : 'pceColheita';
    const r = await Store.obter(store, id); if (!r) throw new Error('Registro não encontrado.');
    if (typeof Docs[fn] !== 'function') throw new Error('Modelo de impressão indisponível nesta versão do app.');
    await Docs[fn](r, await arquivosPorId(r));
  }

  /** Resumo para o cartão do módulo no hub. */
  async function status() {
    const levs = (await Store.todos('levantamentos')).filter(x => !x.excluido), cols = (await Store.todos('colheitas')).filter(x => !x.excluido);
    const pend = levs.filter(x => x.pendente).length + cols.filter(x => x.pendente).length + (await Sync.arquivosPendentes()).length;
    if (!levs.length && !cols.length) return 'Nenhum registro';
    return `${levs.length} levantamento(s) · ${cols.length} termo(s)${pend ? ` · ⏳ ${pend} aguardando envio` : ''}`;
  }

  /* ---------- ações (cliques) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-pce]'); if (!el) return;
    const a = el.dataset.pce, id = el.dataset.id, noTermo = !!el.closest('#pceTermoForm'), F = noTermo ? T : L;
    const prev = noTermo ? '#pce-t-fotos-prev' : '#pce-fotos-prev';
    try {
      if (a === 'servidor') go('pceservidor', { voltar: 'pce' });
      else if (a === 'novolev') go('pcelev');
      else if (a === 'abrirlev') go('pcelev', id);
      else if (a === 'imprimirlev') await imprimir('lev', id);
      else if (a === 'termodelev') go('pcetermo', { levantamentoId: id });
      else if (a === 'excluirlev') await excluirLev(id);
      else if (a === 'novotermo') go('pcetermo');
      else if (a === 'imprimirtermo') await imprimir('termo', id);
      else if (a === 'cancelartermo') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        const t = await Store.obter('colheitas', id); await Store.salvar('colheitas', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); termos();
      }
      else if (!F) return;
      else if (a === 'addcult') { const c = coletarLev().culturas; if (c.length >= MAX_CULTURAS) return toast(`Limite de ${MAX_CULTURAS} culturas por levantamento.`, true); c.push(culturaVazia()); desenharCulturas(c); agendarRascunho(); }
      else if (a === 'delcult') { const c = coletarLev().culturas; c.splice(+el.dataset.i, 1); if (!c.length) c.push(culturaVazia()); desenharCulturas(c); agendarRascunho(); }
      else if (a === 'delfoto') await removerFoto(F, id, prev);
      else if (a === 'limparass') limparAssinatura(F, el.dataset.papel);
      else if (a === 'gps') await capturarGPS(el.dataset.pref);
      else if (a === 'consultar') await consultarDoc(el.dataset.pref);
      else if (a === 'usarprop') usarPropriedade(el.dataset.pref, +el.dataset.i);
      else if (a === 'gerartexto') { autoTexto(true); agendarRascunho(); }
      else if (a === 'descartarlev') {
        if (!confirm(F.novo ? 'Descartar este levantamento? Os dados preenchidos serão perdidos.' : 'Descartar as alterações deste levantamento?')) return;
        fechar(F); L = null;
        const salvo = idsArquivos(F.rec);
        await apagarSeNaoEnviado(F.fotos.filter(x => !salvo.has(x)));
        await Store.setMeta('pceLevRascunho', null); go('pce');
      } else if (a === 'descartartermo') {
        if (!confirm('Descartar este termo? Os dados preenchidos serão perdidos.')) return;
        fechar(F); T = null;
        await apagarSeNaoEnviado(F.fotos); await Store.setMeta('pceTermoRascunho', null); go('pcetermos');
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { lista, levantamento, termos, termo, pronto, servidor, status, textoOficial };
})();
