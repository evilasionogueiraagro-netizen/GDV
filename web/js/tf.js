// Termo de Fiscalização de Barreira (TF): lista, formulário, numeração, cadastro/reincidência e impressão em 2 vias.
// Usa funções do app.js (view, go, toast, $, esc, dBR, hojeISO, agoraHM, turnoAtual, veiculosDe, avisoAtivacao) em tempo de execução.
const TFUI = (() => {
  const T = CONFIG.TF;
  const anoAtual = () => new Date().getFullYear();
  const chave = (b, a) => b + '|' + a;
  const num4 = n => String(n).padStart(4, '0');
  const digitos = v => String(v || '').replace(/\D/g, '');
  const placaNorm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const PROC = { liberacao: 'Liberação', apreensao: 'Apreensão', rechaco: 'Rechaço' };
  const lerJSON = (v, pad) => { try { return JSON.parse(v); } catch (e) { return pad; } };

  /* ---------- validação de CPF / CNPJ (só alerta; o fiscal decide) ---------- */
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

  /* ---------- numeração: reserva na planilha (offline) ---------- */
  const barreiras = async () => (await Store.meta('barreiras')) || [];
  async function numeroProposto(b, a) {
    const r = (((await Store.meta('reservas')) || {})[chave(b, a)] || []);
    if (r.length) return { numero: r[0], origem: 'reserva' };
    const uv = (((await Store.meta('ultimoVisto')) || {})[chave(b, a)] || 0);
    const locais = (await Store.todos('tfs')).filter(t => t.barreira === b && t.ano === a).reduce((m, t) => Math.max(m, t.numero), 0);
    return { numero: Math.max(uv, locais) + 1, origem: 'provisorio' };          // sem reserva e sem internet: confere no envio
  }
  async function consumir(b, a, n) {
    const k = chave(b, a), todas = (await Store.meta('reservas')) || {}, uv = (await Store.meta('ultimoVisto')) || {};
    todas[k] = (todas[k] || []).filter(x => x !== n); uv[k] = Math.max(uv[k] || 0, n);
    await Store.setMeta('reservas', todas); await Store.setMeta('ultimoVisto', uv);
  }
  async function garantirReserva(b, a) {                                          // com internet, busca números na planilha
    if ((((await Store.meta('reservas')) || {})[chave(b, a)] || []).length || !navigator.onLine || !Sync.ativado()) return;
    localStorage.setItem('gdv.barreira', b);
    const tem = async () => (((await Store.meta('reservas')) || {})[chave(b, a)] || []).length > 0;
    await Promise.race([Sync.sincronizar(), new Promise(r => setTimeout(r, 6000))]);
    for (let i = 0; i < 15 && !(await tem()) && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 400));   // sincronização já em andamento
  }

  /* ---------- estado do formulário ---------- */
  let S = null;                                                                   // { numero, hist:{doc,placa}, tpl, turnoId, veiculoId }
  const vazio = () => ({ barreira: '', data: hojeISO(), hora: agoraHM(), doc: '', nome: '', rg: '', endereco: '', municipio: '', uf: '', telefone: '', relacao: T.relacoes[0],
    inspecao: false, coleta: false, amostras: '', procedimento: '', fiel: false, auto: false, advertencia: false, local: '', placa: '', origem: '', destino: '',
    docs: { nf: '', ptv: '', gta: '', sif: '', sie: '', sim: '', lacre: '', outros: '' }, produtos: [{ p: '', q: '', u: T.unidades[0] }], constatacao: '', enquadramento: '' });

  function coletar() {
    const g = id => { const e = $('#tf-' + id); return e ? e.value : ''; }, c = id => !!($('#tf-' + id) && $('#tf-' + id).checked);
    const proc = document.querySelector('input[name=tf-proc]:checked');
    return { barreira: g('barreira'), data: g('data'), hora: g('hora'), doc: g('doc'), nome: g('nome'), rg: g('rg'), endereco: g('endereco'), municipio: g('municipio'),
      uf: g('uf'), telefone: g('telefone'), relacao: g('relacao'), inspecao: c('inspecao'), coleta: c('coleta'), amostras: g('amostras'),
      procedimento: proc ? proc.value : '', fiel: c('fiel'), auto: c('auto'), advertencia: c('advertencia'), local: g('local'), placa: placaNorm(g('placa')), origem: g('origem'), destino: g('destino'),
      docs: Object.fromEntries(['nf', 'ptv', 'gta', 'sif', 'sie', 'sim', 'lacre', 'outros'].map(k => [k, g('d-' + k)])),
      produtos: [...document.querySelectorAll('#tf-produtos .prod')].map(r => ({ p: r.querySelector('select').value, q: r.querySelector('input').value, u: r.querySelectorAll('select')[1].value })),
      constatacao: g('constatacao'), enquadramento: g('enquadramento') };
  }
  let tRasc = null;
  const salvarRascunho = () => { clearTimeout(tRasc); tRasc = setTimeout(() => { if (S && $('#tfForm')) Store.setMeta('tfRascunho', { dados: coletar(), turnoId: S.turnoId, veiculoId: S.veiculoId, em: Date.now() }); }, 500); };

  /* ---------- tela: formulário ---------- */
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input id="tf-${id}" value="${esc(v)}" ${extra}></label>`;
  const opts = (lista, atual) => lista.map(x => `<option ${x === atual ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const linhaProd = (p, i) => `<div class="prod" data-i="${i}"><select><option value=""></option>${opts(T.produtos, p.p)}</select>
    <input type="number" inputmode="decimal" min="0" step="any" placeholder="Qtd." value="${esc(p.q)}"><select>${opts(T.unidades, p.u)}</select>
    <button type="button" class="mini" data-tf="delprod" data-i="${i}" aria-label="Remover produto">✕</button></div>`;

  function formHTML(D, bars) {
    const d = D.docs;
    return `<form class="tf" id="tfForm" autocomplete="off">
    <div class="card"><h3>Termo de Fiscalização de Barreira</h3>
      <label>Barreira<select id="tf-barreira">${bars.map(b => `<option value="${esc(b.id)}" ${b.id === D.barreira ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
      <div class="tf-num" id="tf-numero"></div>
      <div class="duas">${campo('data', 'Data', D.data, 'type="date" required')}${campo('hora', 'Hora', D.hora, 'type="time" required')}</div></div>

    <div class="card"><h3>Identificação do fiscalizado</h3>
      ${campo('doc', 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
      <div id="tf-st-doc" class="tf-status" aria-live="polite"></div>
      ${campo('nome', 'Nome / Razão social *', D.nome)}
      <div class="duas">${campo('rg', 'RG', D.rg)}${campo('telefone', 'Telefone', D.telefone, 'type="tel"')}</div>
      ${campo('endereco', 'Endereço', D.endereco)}
      <div class="duas">${campo('municipio', 'Município', D.municipio)}${campo('uf', 'UF', D.uf, 'maxlength="2"')}</div>
      <label>Relação com o produto<select id="tf-relacao">${opts(T.relacoes, D.relacao)}</select></label></div>

    <div class="card"><h3>Durante a fiscalização foi realizado</h3>
      <label class="chk"><input type="checkbox" id="tf-inspecao" ${D.inspecao ? 'checked' : ''}> Inspeção</label>
      <label class="chk"><input type="checkbox" id="tf-coleta" ${D.coleta ? 'checked' : ''}> Coleta de amostra</label>
      ${campo('amostras', 'Quantidade de amostras', D.amostras, 'type="number" inputmode="numeric" min="0"')}</div>

    <div class="card"><h3>Após a fiscalização foi realizado</h3>
      ${Object.entries(PROC).map(([k, t]) => `<label class="chk"><input type="radio" name="tf-proc" value="${k}" ${D.procedimento === k ? 'checked' : ''}> ${t}</label>`).join('')}
      <hr><label class="chk"><input type="checkbox" id="tf-fiel" ${D.fiel ? 'checked' : ''}> Apreensão com fiel depositário</label>
      <label class="chk"><input type="checkbox" id="tf-auto" ${D.auto ? 'checked' : ''}> Auto de infração</label>
      <label class="chk"><input type="checkbox" id="tf-advertencia" ${D.advertencia ? 'checked' : ''}> Advertência</label></div>

    <div class="card"><h3>Descrição da ação</h3>
      ${campo('local', 'Local *', D.local)}
      ${campo('placa', 'Veículo fiscalizado – placa', D.placa, 'maxlength="8" autocapitalize="characters" placeholder="ABC1D23"')}
      <div id="tf-st-placa" class="tf-status" aria-live="polite"></div>
      <div class="duas">${campo('origem', 'Origem', D.origem)}${campo('destino', 'Destino', D.destino)}</div></div>

    <div class="card"><h3>Documentação apresentada</h3><div class="duas">
      ${campo('d-nf', 'NF Nº', d.nf)}${campo('d-ptv', 'PTV Nº', d.ptv)}${campo('d-gta', 'GTA Nº', d.gta)}${campo('d-sif', 'SIF Nº', d.sif)}
      ${campo('d-sie', 'SIE Nº', d.sie)}${campo('d-sim', 'SIM Nº', d.sim)}${campo('d-lacre', 'Lacre', d.lacre)}${campo('d-outros', 'Outros', d.outros)}</div></div>

    <div class="card"><h3>Produtos fiscalizados</h3><div id="tf-produtos">${D.produtos.map(linhaProd).join('')}</div>
      <button type="button" class="botao sec" data-tf="addprod">+ Adicionar produto</button></div>

    <div class="card"><h3>Constatação</h3><label><textarea id="tf-constatacao" rows="5">${esc(D.constatacao)}</textarea></label>
      <h3>Enquadramento legal</h3><label><textarea id="tf-enquadramento" rows="5" placeholder="Leis, decretos, portarias, artigos, incisos e alíneas">${esc(D.enquadramento)}</textarea></label></div>

    <button class="botao" type="submit">📄 Gerar TF</button>
    <button class="botao sec" type="button" data-tf="descartar">Descartar este TF</button></form>`;
  }

  async function mostrarNumero() {
    if (!$('#tf-barreira')) return;
    const b = $('#tf-barreira').value, a = anoAtual(), bar = (await barreiras()).find(x => x.id === b);
    if (!bar) return;
    await garantirReserva(b, a);
    if (!S || !$('#tf-numero')) return;                                              // o fiscal saiu da tela enquanto buscava o número
    S.numero = await numeroProposto(b, a);
    const txt = `${num4(S.numero.numero)}/${a} - ${bar.sufixo}`;
    $('#tf-numero').innerHTML = `<small>Nº do TF</small><b>${esc(txt)}</b>` + (S.numero.origem === 'reserva'
      ? '<small>Número reservado para este aparelho (sequência única da barreira).</small>'
      : '<small class="aviso-txt">⚠️ Sem número reservado (sem internet): número provisório; será conferido ao enviar.</small>');
  }

  async function novo(prefill) {
    if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());
    prefill = prefill || {};
    const bars = await barreiras();
    if (!bars.length) { view('<div class="card aviso">⚠️ A lista de barreiras ainda não foi carregada. Conecte-se à internet e aguarde a sincronização.</div>'); Sync.sincronizar(); return; }
    let D = vazio(); S = { numero: null, hist: { doc: null, placa: null }, tpl: { constatacao: '', enquadramento: '' }, turnoId: '', veiculoId: '' };
    const rasc = await Store.meta('tfRascunho');
    if (rasc && rasc.dados && confirm(`Há um TF não gerado, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
      D = { ...D, ...rasc.dados }; S.turnoId = rasc.turnoId || ''; S.veiculoId = rasc.veiculoId || '';
    } else {
      await Store.setMeta('tfRascunho', null);
      const turno = await turnoAtual(); let veic = null;
      if (prefill.veiculoId) { veic = await Store.obter('veiculos', prefill.veiculoId); S.veiculoId = prefill.veiculoId; }
      const tid = (veic && veic.turnoId) || (turno && turno.id) || ''; S.turnoId = tid;                  // TF fica ligado ao turno aberto
      const tr = tid ? await Store.obter('turnos', tid) : null;
      const bPad = localStorage.getItem('gdv.barreira');
      D.barreira = bars.some(b => b.id === bPad) ? bPad : bars[0].id;
      D.local = (tr && tr.local) || (bars.find(b => b.id === D.barreira) || {}).local || '';
      if (veic) D.placa = veic.placa;
    }
    if (!bars.some(b => b.id === D.barreira)) D.barreira = bars[0].id;
    view(formHTML(D, bars));
    $('#tf-uf').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    await mostrarNumero();
    if (digitos(D.doc).length >= 11) consultarDoc();
    if (placaNorm(D.placa).length >= 7) consultarPlaca();
    ligarForm();
  }

  function ligarForm() {
    const f = $('#tfForm');
    f.addEventListener('input', e => {
      if (e.target.id === 'tf-placa') { e.target.value = placaNorm(e.target.value); if (e.target.value.length === 7) agendar('placa'); }
      if (e.target.id === 'tf-doc') { const d = digitos(e.target.value); if (d.length === 11 || d.length === 14) agendar('doc'); else $('#tf-st-doc').replaceChildren(); }
      salvarRascunho();
    });
    f.addEventListener('change', async e => {
      if (e.target.id === 'tf-barreira') { localStorage.setItem('gdv.barreira', e.target.value); await mostrarNumero(); }
      if (e.target.name === 'tf-proc') aplicarModelo(e.target.value);
      if (e.target.id === 'tf-doc') { e.target.value = fmtDoc(digitos(e.target.value)); }
      salvarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); gerar(); };
  }
  const tm = {};
  const agendar = qual => { clearTimeout(tm[qual]); tm[qual] = setTimeout(qual === 'doc' ? consultarDoc : consultarPlaca, 350); };

  function aplicarModelo(proc) {                                                     // sugere textos; não sobrescreve o que o fiscal editou
    [['constatacao', T.constatacao[proc]], ['enquadramento', proc === 'liberacao' ? '' : T.textoLegal]].forEach(([id, novo]) => {
      const el = $('#tf-' + id);
      if (!el.value.trim() || el.value === S.tpl[id]) { el.value = novo; S.tpl[id] = novo; }
    });
  }

  /* ---------- consulta: cadastro e reincidência ---------- */
  function resumoLocal(tfs) {
    const r = { total: tfs.length, liberacoes: 0, apreensoes: 0, rechacos: 0, autos: 0, advertencias: 0, ultimos: [] };
    tfs.forEach(x => { if (x.procedimento === 'liberacao') r.liberacoes++; else if (x.procedimento === 'apreensao') r.apreensoes++; else if (x.procedimento === 'rechaco') r.rechacos++; if (x.auto) r.autos++; if (x.advertencia) r.advertencias++; });
    r.ultimos = tfs.slice().sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora)).slice(0, 5).map(x => ({ numeroTxt: x.numeroTxt, data: x.data, procedimento: x.procedimento, placa: x.placa }));
    r.reincidente = r.apreensoes + r.rechacos + r.autos >= 1;
    return r;
  }
  async function buscar(doc, placa) {
    if (navigator.onLine && Sync.ativado()) {
      try {
        const r = await Sync.consultar(doc, placa);                                    // histórico completo (todas as barreiras)
        if (r.pessoa) await Store.gravar('pessoas', { ...r.pessoa, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 0 });
        if (r.placa) await Store.gravar('placas', { ...r.placa, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 0 });
        return { ...r, parcial: false };
      } catch (e) { if (/revogado|inv[aá]lido/i.test(e.message)) throw e; }
    }
    const meus = (await Store.todos('tfs')).filter(t => !t.cancelado);                // sem conexão: só o que este aparelho conhece
    return { pessoa: doc ? await Store.obter('pessoas', doc) || null : null, placa: placa ? await Store.obter('placas', placa) || null : null, parcial: true,
      historicoDoc: doc ? resumoLocal(meus.filter(t => digitos(t.doc) === doc)) : null, historicoPlaca: placa ? resumoLocal(meus.filter(t => placaNorm(t.placa) === placa)) : null };
  }
  function histHTML(h, rotulo, parcial) {
    if (!h) return '';
    if (!h.total) return `<div class="tf-ok">✓ Sem TF anterior ${rotulo}.${parcial ? ' <small>(sem conexão: só este aparelho)</small>' : ''}</div>`;
    const partes = [h.apreensoes && `${h.apreensoes} apreensão(ões)`, h.rechacos && `${h.rechacos} rechaço(s)`, h.autos && `${h.autos} auto(s) de infração`, h.liberacoes && `${h.liberacoes} liberação(ões)`].filter(Boolean).join(', ');
    return `<div class="${h.reincidente ? 'tf-alerta' : 'tf-ok'}"><b>${h.reincidente ? '⚠️ REINCIDENTE' : 'ℹ️ Já fiscalizado'} ${rotulo}:</b> ${h.total} TF(s) anterior(es) — ${esc(partes)}.
      <ul>${h.ultimos.slice(0, 3).map(u => `<li>${esc(u.numeroTxt)} · ${dBR(u.data)} · ${esc(PROC[u.procedimento] || '—')}${u.placa ? ' · ' + esc(u.placa) : ''}</li>`).join('')}</ul>
      ${parcial ? '<small>(sem conexão: histórico parcial, só deste aparelho)</small>' : ''}</div>`;
  }
  async function consultarDoc() {
    if (!S || !$('#tf-doc')) return;
    const d = digitos($('#tf-doc').value); if (d.length !== 11 && d.length !== 14) return;
    const st = $('#tf-st-doc'); st.innerHTML = '<small>Consultando cadastro e histórico…</small>';
    let r; try { r = await buscar(d, ''); } catch (e) { st.textContent = ''; return; }
    if (!S || !$('#tf-doc')) return;
    S.hist.doc = r.historicoDoc;
    let html = docOk(d) ? '' : `<div class="tf-alerta">⚠️ ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
    if (r.pessoa) {
      ['nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone'].forEach(k => { const el = $('#tf-' + k); if (el) el.value = r.pessoa[k] || ''; });
      html += '<div class="tf-ok">✓ Cadastro encontrado — dados preenchidos automaticamente.</div>';
    } else html += '<div class="tf-novo">Novo cadastro — os dados serão salvos na planilha ao gerar o TF.</div>';
    st.innerHTML = html + histHTML(r.historicoDoc, 'para este documento', r.parcial); salvarRascunho();
  }
  async function consultarPlaca() {
    if (!S || !$('#tf-placa')) return;
    const p = placaNorm($('#tf-placa').value); if (p.length < 7) return;
    const st = $('#tf-st-placa'); let r; try { r = await buscar('', p); } catch (e) { return; }
    if (!S || !$('#tf-placa')) return;
    S.hist.placa = r.historicoPlaca;
    let html = histHTML(r.historicoPlaca, 'para esta placa', r.parcial);
    if (r.placa && r.placa.doc && !digitos($('#tf-doc').value)) html += `<div class="tf-novo">Último fiscalizado com esta placa: <b>${esc(r.placa.nome)}</b> (${esc(fmtDoc(r.placa.doc))}) <button type="button" class="mini" data-tf="usardoc" data-doc="${esc(r.placa.doc)}">Usar</button></div>`;
    st.innerHTML = html;
  }

  /* ---------- geração do TF ---------- */
  function pedirNumero(num, sufixo, ano) {                                            // confirmação do número (editável, como no rascunho)
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal';
      m.innerHTML = `<div class="tf-modal-box"><h3>📄 Confirmar geração do TF</h3><p>Termo de Fiscalização nº</p>
        <input id="tf-num-m" type="number" inputmode="numeric" min="1" value="${num}"><div id="tf-num-prev" class="tf-num"></div>
        <p class="dica">Confira o número. Se necessário, altere antes de gerar (números repetidos são sinalizados na planilha).</p>
        <div class="duas"><button class="botao sec" id="tf-m-cancel" type="button">Cancelar</button><button class="botao" id="tf-m-ok" type="button">Confirmar e gerar</button></div></div>`;
      document.body.append(m); const i = m.querySelector('input');
      const prev = () => { m.querySelector('#tf-num-prev').innerHTML = `<b>${esc(num4(+i.value || 0))}/${ano} - ${esc(sufixo)}</b>`; };
      i.oninput = prev; prev(); i.focus(); i.select();
      m.querySelector('#tf-m-cancel').onclick = () => { m.remove(); ok(null); };
      m.querySelector('#tf-m-ok').onclick = () => { const n = parseInt(i.value, 10); if (!(n > 0)) { toast('Informe o número do TF.', true); return; } m.remove(); ok(n); };
    });
  }

  async function gerar() {
    const D = coletar(), a = anoAtual(), bar = (await barreiras()).find(x => x.id === D.barreira), doc = digitos(D.doc);
    if (!bar || !S || !S.numero) return toast('Escolha a barreira.', true);
    if (!D.nome.trim()) return toast('Informe o nome / razão social do fiscalizado.', true);
    if (doc.length !== 11 && doc.length !== 14) return toast('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.', true);
    if (!D.local.trim()) return toast('Informe o local.', true);
    if (!docOk(doc) && !confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Gerar o TF mesmo assim?`)) return;
    if (!D.procedimento && !confirm('Nenhum procedimento (liberação, apreensão ou rechaço) foi marcado. Gerar o TF mesmo assim?')) return;
    const n = await pedirNumero(S.numero.numero, bar.sufixo, a); if (n == null) return;
    const jaTem = (await Store.todos('tfs')).some(t => t.barreira === bar.id && t.ano === a && t.numero === n);
    if (jaTem) return toast(`Este aparelho já gerou o TF nº ${num4(n)}/${a}. Use outro número.`, true);
    const turno = S.turnoId ? await Store.obter('turnos', S.turnoId) : null;
    const prods = D.produtos.filter(p => p.p && p.q).map(p => `${p.p} - ${p.q} ${p.u}`);
    const hist = S.hist.doc;
    const rec = await Store.salvar('tfs', {
      barreira: bar.id, ano: a, numero: n, numeroTxt: `${num4(n)}/${a} - ${bar.sufixo}`, turnoId: S.turnoId || '', veiculoId: S.veiculoId || '',
      data: D.data, hora: D.hora, fiscal: (turno && turno.fiscal) || Sync.nome(), local: D.local.trim(), placa: D.placa, origem: D.origem.trim(), destino: D.destino.trim(),
      doc, nome: D.nome.trim().toUpperCase(), rg: D.rg.trim(), endereco: D.endereco.trim(), municipio: D.municipio.trim(), uf: D.uf.trim().toUpperCase(), telefone: D.telefone.trim(), relacao: D.relacao,
      inspecao: D.inspecao ? 1 : 0, coleta: D.coleta ? 1 : 0, amostras: Number(D.amostras) || 0, procedimento: D.procedimento, fiel: D.fiel ? 1 : 0, auto: D.auto ? 1 : 0, advertencia: D.advertencia ? 1 : 0,
      documentos: JSON.stringify(D.docs), produtos: JSON.stringify(prods), constatacao: D.constatacao, enquadramento: D.enquadramento,
      reincidente: hist && hist.reincidente ? 1 : 0, tfsAnteriores: hist ? hist.total : 0, cancelado: 0, motivoCancel: '', conflito: 0,
      provisorio: S.numero.origem === 'provisorio' && n === S.numero.numero ? 1 : 0
    });
    await Store.salvar('pessoas', { id: doc, tipo: doc.length === 14 ? 'PJ' : 'PF', nome: D.nome.trim().toUpperCase(), rg: D.rg.trim(), endereco: D.endereco.trim(), municipio: D.municipio.trim(), uf: D.uf.trim().toUpperCase(), telefone: D.telefone.trim() });
    if (D.placa.length >= 7) await Store.salvar('placas', { id: D.placa, doc, nome: D.nome.trim().toUpperCase() });
    await consumir(bar.id, a, n); await Store.setMeta('tfRascunho', null); localStorage.setItem('gdv.barreira', bar.id);
    S = null; Sync.sincronizar(); go('tfpronto', rec.id);
  }

  /* ---------- telas: pronto e lista ---------- */
  async function pronto(id) {
    const t = await Store.obter('tfs', id); if (!t) return go('tf');
    view(`<div class="card"><h3>✅ TF gerado</h3><div class="tf-num"><b>${esc(t.numeroTxt)}</b></div>
      <p>${esc(t.nome)} · ${esc(fmtDoc(t.doc))}</p><p>${dBR(t.data)} ${esc(t.hora)}${t.placa ? ' · ' + esc(t.placa) : ''}</p>
      ${t.reincidente ? `<div class="tf-alerta">⚠️ Fiscalizado reincidente: ${t.tfsAnteriores} TF(s) anterior(es).</div>` : ''}</div>
      <button class="botao" data-tf="imprimir" data-id="${esc(t.id)}">🖨️ Imprimir / PDF (2 vias)</button>
      <button class="botao sec" data-tf="novo">➕ Novo TF</button>
      <button class="botao sec" data-go="tf">📋 Ver lista de TFs</button>
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto. As 2 vias saem em páginas separadas.</p>`);
  }
  async function lista() {
    if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());
    const todos = (await Store.todos('tfs')).sort((a, b) => b.criadoEm - a.criadoEm);
    view(`<button class="botao" data-tf="novo">➕ Novo TF</button><div class="card"><label>Pesquisar (nº, nome, CPF/CNPJ, placa)<input id="tfQ"></label></div><div id="tfItens"></div>`);
    const desenhar = () => {
      const q = $('#tfQ').value.trim().toUpperCase(), qd = digitos(q);
      const v = todos.filter(t => !q || t.numeroTxt.toUpperCase().includes(q) || t.nome.toUpperCase().includes(q) || (qd && digitos(t.doc).includes(qd)) || placaNorm(t.placa).includes(placaNorm(q)));
      $('#tfItens').innerHTML = v.length ? v.map(t => `<div class="item"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div>
        <div class="hora">${dBR(t.data)}</div></div>
        <div class="info">${esc(PROC[t.procedimento] || 'Sem procedimento')}${t.placa ? ' · ' + esc(t.placa) : ''}${t.reincidente ? ' · ⚠️ reincidente' : ''}</div>
        ${t.cancelado ? `<div class="info pend">⛔ CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
        ${t.conflito ? '<div class="info pend">⚠️ Número duplicado na planilha: confira com a coordenação.</div>' : ''}
        ${t.pendente ? '<div class="info pend">⏳ aguardando envio</div>' : ''}
        <div class="botoes"><button class="editar" data-tf="imprimir" data-id="${esc(t.id)}">Imprimir</button>
        ${t.cancelado ? '' : `<button class="excluir" data-tf="cancelar" data-id="${esc(t.id)}">Cancelar TF</button>`}</div></div>`).join('') : '<div class="vazio">Nenhum TF neste aparelho.</div>';
    };
    desenhar(); $('#tfQ').oninput = desenhar;
  }

  /* ---------- ações (cliques) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-tf]'); if (!el) return;
    const a = el.dataset.tf, id = el.dataset.id;
    try {
      if (a === 'novo') go('tfnovo');
      else if (a === 'imprimir') await Docs.tf(id);
      else if (a === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (o número do TF continua usado):'); if (motivo == null) return;
        const t = await Store.obter('tfs', id); await Store.salvar('tfs', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('TF cancelado.'); lista();
      } else if (a === 'addprod') { const c = coletar(); c.produtos.push({ p: '', q: '', u: T.unidades[0] }); $('#tf-produtos').innerHTML = c.produtos.map(linhaProd).join(''); salvarRascunho(); }
      else if (a === 'delprod') { const c = coletar(); c.produtos.splice(+el.dataset.i, 1); if (!c.produtos.length) c.produtos.push({ p: '', q: '', u: T.unidades[0] }); $('#tf-produtos').innerHTML = c.produtos.map(linhaProd).join(''); salvarRascunho(); }
      else if (a === 'descartar') { if (confirm('Descartar este TF? Os dados preenchidos serão perdidos.')) { S = null; await Store.setMeta('tfRascunho', null); go('tf'); } }
      else if (a === 'usardoc') { $('#tf-doc').value = fmtDoc(el.dataset.doc); consultarDoc(); }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { lista, novo, pronto };
})();
