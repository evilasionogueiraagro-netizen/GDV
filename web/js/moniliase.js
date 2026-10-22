// PCE — monilíase: Cadastro de imóvel com hospedeiros (1x por propriedade), Termo de Fiscalização do PCE (1 por visita; não é o TF de
// Barreira) e Relatório de atividades (prestação de contas do convênio). Formulários na mesma ordem do papel, com o modo "digitar do papel"
// (número, data e PDF escaneado do papel; sem assinaturas) para a estagiária e o modo de campo (GPS, assinaturas, número do sistema).
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM, pegarLocal, avisoAtivacao), do pce.js (PCEUI), do campo.js,
// do docs.js (impressão/PDF) e do documentos/pce-docs.js (agregados do relatório).
const PCEMon = (() => {
  const P = CONFIG.PCE, MO = P.moniliase || {}, TC = P.termo || {};
  const HOSP = MO.hospedeiros || PCEDocs.HOSP;
  const digitos = v => String(v || '').replace(/\D/g, '');
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const unid = u => Sync.unidadePce(u);
  const num3 = n => String(n).padStart(3, '0');
  const numTxt = (tipo, n, a, u) => (tipo === 'termo' ? `${num3(n)}.${a}.${unid(u)}` : `${num3(n)}-${a}-${unid(u)}`);
  const NOME = { termo: 'Termo de Fiscalização', cadastro: 'Cadastro de propriedade' };
  const STORE = { termo: 'termosPce', cadastro: 'cadastrosPce' };
  const bloqueado = () => !Sync.ativado() || localStorage.getItem('gdv.revogado');
  const U = () => PCEUI;
  const SN = [['sim', 'Sim'], ['nao', 'Não']];
  /** Número em texto digitado ("08 anos", "1.234", "2,5") → número; vazio = ''. */
  function numero(v) {
    const s = String(v == null ? '' : v).trim(); if (!s) return '';
    const m = /-?\d+(?:[.,]\d{3})*(?:[.,]\d+)?/.exec(s); if (!m) return '';
    let t = m[0];
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');          // 1.234 = mil duzentos e trinta e quatro
    else t = t.replace(/\.(?=\d{3}\b)(?=.*,)/g, '').replace(',', '.');
    const n = Number(t); return isFinite(n) ? n : '';
  }
  const inteiro = v => { const n = numero(v); return n === '' ? '' : Math.round(n); };
  const area = v => { const n = numero(v); return n === '' ? '' : String(n).replace('.', ','); };

  /* ---------- coordenadas: latitude e longitude em campos separados (como no papel) ---------- */
  /** "-3,60033", "-3.60033", "3,60033S", "-59,15044W", "3°36'01,2\"S", "S 3 36 1.2"… → {v} | {vazio} | {erro}. Longitude sem sinal nem letra = Oeste. */
  function lerEixo(txt, eixo) {
    let s = semAcento(String(txt == null ? '' : txt)).toUpperCase().replace(/[−–—]/g, '-').trim();
    if (!s) return { vazio: true };
    s = s.replace(/\b(LAT(ITUDE)?|LONG?(ITUDE)?)\b\.?:?/g, ' ').replace(/\bSUL\b/g, 'S').replace(/\bNORTE\b/g, 'N').replace(/\bOESTE\b/g, 'O').replace(/\bLESTE\b/g, 'L').trim();
    let hem = '', m = /([NSEWLO])\.?\s*$/.exec(s);
    if (m) { hem = m[1]; s = s.slice(0, m.index).trim(); }
    else if ((m = /^([NSEWLO])(?=[\s\d-])/.exec(s))) { hem = m[1]; s = s.slice(1).trim(); }
    if (/[^0-9.,°º˚'′’"″\s-]/.test(s)) return { erro: `Coordenada não reconhecida: "${txt}".` };
    const neg = /^-/.test(s), nums = (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
    if (!nums.length) return { erro: `Coordenada sem número: "${txt}".` };
    if (nums.length > 3) return { erro: `Coordenada com números demais: "${txt}".` };
    let v;
    if (nums.length === 1) v = nums[0];
    else {
      const [g, mi, se] = nums;
      if ((mi != null && !Number.isInteger(g)) || mi >= 60 || (se || 0) >= 60) return { erro: 'Graus, minutos e segundos: minutos e segundos vão de 0 a 59.' };
      v = g + mi / 60 + (se || 0) / 3600;
    }
    let oeste = false;
    if (hem) {
      if ((eixo === 'lat' && /[EWLO]/.test(hem)) || (eixo === 'lon' && /[NS]/.test(hem))) return { erro: eixo === 'lat' ? 'Na latitude use S ou N.' : 'Na longitude use W/O ou L.' };
      if (/[SWO]/.test(hem)) v = -Math.abs(v); else if (neg) return { erro: 'Sinal negativo com hemisfério N/L: confira.' };
    } else if (neg) v = -v;
    else if (eixo === 'lon' && v > 0) { v = -v; oeste = true; }                 // no Amazonas a longitude é sempre Oeste
    return { v: Math.round(v * 1e6) / 1e6, oeste };
  }
  /** Par lat/lon → {lat, lon} | {vazio} | {erro}; confere se fica no Amazonas (mesma regra do registro antigo). */
  function lerPar(la, lo) {
    const a = lerEixo(la, 'lat'), b = lerEixo(lo, 'lon');
    if (a.vazio && b.vazio) return { vazio: true };
    if (a.erro || b.erro) return { erro: a.erro || b.erro };
    if (a.vazio || b.vazio) return { erro: 'Informe latitude e longitude.' };
    const r = U().validarCoord(a.v, b.v);
    return r.erro ? r : { lat: r.lat, lon: r.lon, oeste: b.oeste };
  }
  const coordHTML = (pref, D, gps) => `<div class="duas"><label>Latitude<input id="${pref}lat" value="${esc(D.lat)}" autocomplete="off" inputmode="text" placeholder="-3,60033"></label>
      <label>Longitude<input id="${pref}lon" value="${esc(D.lon)}" autocomplete="off" inputmode="text" placeholder="-59,15044W"></label></div>
      <div id="${pref}coord-st" class="tf-status" aria-live="polite"></div>
      ${gps ? `<div class="pce-gps"><span id="${pref}gps-st" class="dica"></span><button type="button" class="mini" data-mon="gps" data-pref="${pref}">📍 Usar GPS</button></div>` : ''}`;
  function mostrarCoord(pref) {
    const st = $('#' + pref + 'coord-st'), la = $('#' + pref + 'lat'), lo = $('#' + pref + 'lon'); if (!st || !la) return null;
    const r = lerPar(la.value, lo.value);
    st.innerHTML = r.vazio ? '<div class="tf-novo">Sem coordenadas: não aparecerá no mapa.</div>' : r.erro ? `<div class="tf-alerta">⚠️ ${esc(r.erro)}</div>`
      : `<div class="tf-ok">✓ ${esc(String(r.lat).replace('.', ','))} / ${esc(String(r.lon).replace('.', ','))}${r.oeste ? ' <small>(longitude Oeste)</small>' : ''}<br><small>${esc(U().gms(r.lat, 'N', 'S'))} &nbsp; ${esc(U().gms(r.lon, 'L', 'O'))}</small></div>`;
    return r;
  }
  async function usarGPS(pref) {
    const st = $('#' + pref + 'gps-st'); if (st) st.textContent = '📍 Obtendo localização…';
    const g = await pegarLocal(); if (!$('#' + pref + 'lat')) return;
    if (!g) { if (st) st.textContent = '⚠️ GPS indisponível ou permissão negada.'; return; }
    $('#' + pref + 'lat').value = String(g.lat).replace('.', ','); $('#' + pref + 'lon').value = String(g.lng).replace('.', ',');
    if (st) st.textContent = `✓ GPS (precisão ~${g.prec} m)`; mostrarCoord(pref); agendar();
  }

  /* ---------- peças do formulário (botões grandes sim/não, caixas, números) ---------- */
  const sn = (pref, k, rot, v, ops = SN) => `<fieldset class="mon-sn" data-k="${k}"><legend>${esc(rot)}</legend><div class="mon-op" style="--n:${ops.length}">${ops.map(([x, t]) =>
    `<label><input type="radio" name="${pref}${k}" value="${esc(x)}" ${v === x ? 'checked data-on="1"' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>`;
  const cks = (pref, k, ops, sel) => `<div class="mon-cks">${ops.map(([x, t]) => `<label class="chk"><input type="checkbox" name="${pref}${k}" value="${esc(x)}" ${(sel || []).includes(x) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
  const inp = (pref, id, rot, v, extra = '') => `<label>${rot}<input id="${pref}${id}" value="${esc(v == null ? '' : v)}" ${extra}></label>`;
  const rv = (pref, k) => { const e = document.querySelector(`input[name="${pref}${k}"]:checked`); return e ? e.value : ''; };
  const cv = (pref, k) => [...document.querySelectorAll(`input[name="${pref}${k}"]:checked`)].map(e => e.value);
  const g = (pref, id) => { const e = $('#' + pref + id); return e ? e.value : ''; };
  const opts = (l, a, vazio) => U().opts(l, a, vazio);
  /** Botão sim/não marcado tocado de novo = desmarca (campo em branco no papel). */
  document.addEventListener('click', e => {
    const i = e.target; if (!(i instanceof HTMLInputElement) || i.type !== 'radio' || !i.closest('.mon-op')) return;
    if (i.dataset.on === '1') { i.checked = false; i.dataset.on = ''; } else { document.querySelectorAll(`input[name="${i.name}"]`).forEach(x => { x.dataset.on = ''; }); i.dataset.on = '1'; }
    if (i.closest('#monCadForm')) ligarVisibilidade(PC);
    agendar();
  });

  /* ---------- número do papel: "001.2026.AUTAZES", "001-2026-AUTAZES", "001/2026/Autazes", "Nº 1", "1" ---------- */
  function lerNumeroDoc(txt, unidade, data) {
    const s = String(txt || '').trim();
    if (!s) return { erro: 'Informe o número que está no papel.' };
    const m = /^(?:N\s*[º°O.]?\s*)?(\d{1,5})\s*(?:[./\-–]\s*(\d{4})\s*)?(?:[./\-–]\s*([^./\-–]+?)\s*)?$/i.exec(s);
    if (!m || !(Number(m[1]) > 0)) return { erro: 'Número inválido. Use, por exemplo, 001.2026.AUTAZES, 001-2026-AUTAZES ou só 1.' };
    const anoData = Number(String(data || '').slice(0, 4)) || 0, ano = m[2] ? Number(m[2]) : anoData;
    if (m[2] && anoData && Number(m[2]) !== anoData) return { erro: `O ano do número (${m[2]}) é diferente do ano da data (${anoData}). Confira a data e o número.` };
    const u = m[3] ? unid(m[3]) : unid(unidade);
    if (m[3] && unidade && norm(m[3]) !== norm(unidade)) return { erro: `A unidade do número (${unid(m[3])}) é diferente da unidade escolhida (${unid(unidade)}).` };
    return { n: Number(m[1]), ano, unidade: u, unidadeDoNumero: m[3] ? unidadeDaLista(m[3]) : '' };
  }
  const unidadeDaLista = t => P.municipios.find(x => norm(x) === norm(t)) || '';

  /* ---------- servidor, rascunho e estado ---------- */
  let F = null, tR = null;                                                // formulário aberto (cadastro ou termo)
  const RASC = { cadastro: 'pceCadRascunho', termo: 'pceTfRascunho' };
  function agendar(atraso = 500) {
    clearTimeout(tR);
    const f = $('#monCadForm') || $('#monTfForm'), st = F; if (!f || !st || !st.vivo) return;
    tR = setTimeout(() => {
      if (F !== st || !f.isConnected) return;
      Store.setMeta(RASC[st.tipo], { dados: st.tipo === 'cadastro' ? (st.programa === 'citros' ? coletarCadCi() : coletarCad()) : coletarTf(), id: st.id, novo: st.novo, antigo: st.antigo ? 1 : 0, docs: st.docs,
        assNovas: st.assNovas, cadastroId: st.cadastroId || '', propriedadeId: st.propriedadeId || '', hospedeiros: st.hospedeiros || [], deTermo: st.deTermo ? 1 : 0, levId: st.levId || '',
        programa: st.programa || '', em: Date.now() });
    }, atraso);
  }
  function fechar() { if (F) F.vivo = false; clearTimeout(tR); F = null; }
  async function descartarRascunho(tipo, rasc) {
    if (rasc) {
      const rec = rasc.id ? await Store.obter(STORE[tipo], rasc.id) : null, salvo = Anexos.idsArquivos(rec);
      await Anexos.apagarSeNaoEnviado((rasc.docs || []).filter(id => !salvo.has(id)));
    }
    await Store.setMeta(RASC[tipo], null);
  }
  /** Rascunho do mesmo tipo: retomar (silencioso quando volta do "Criar cadastro"), descartar ou cancelar. null = parar. */
  async function tratarRascunho(tipo, id, retomar) {
    const r = await Store.meta(RASC[tipo]);
    if (!r || !r.dados) return { rasc: null };
    if (r.antigo && !U().podeAntigo()) { await descartarRascunho(tipo, r); return { rasc: null }; }
    if (retomar) return { rasc: r };
    if (id && r.id !== id) {
      if (!confirm(`Há um ${NOME[tipo]} não salvo, iniciado em ${new Date(r.em).toLocaleString('pt-BR')}.\n\nDescartar esse rascunho e abrir o registro escolhido? (Cancelar volta sem perder o rascunho.)`)) return null;
      await descartarRascunho(tipo, r); return { rasc: null };
    }
    if (confirm(`Há um ${NOME[tipo]} não salvo, iniciado em ${new Date(r.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) return { rasc: r };
    await descartarRascunho(tipo, r); return { rasc: null };
  }
  const topoPapel = (titulo, novo) => `<div class="card mon-topo"><h3>📄 ${esc(titulo)}</h3>
      <p class="dica" style="text-align:left">Digite como está no papel, na mesma ordem. Toque de novo num botão marcado para desmarcar.${novo ? ' Depois de salvar, use “Salvar e digitar outro”.' : ''}</p></div>`;

  /* ---------- PDF escaneado (registro do papel) ---------- */
  const MAX_DOCS = P.maxDocumentos || 10, MAX_PDF = 10 * 1024 * 1024;
  const pdfHTML = pref => `<div class="card"><h3>📎 Folha escaneada (PDF)</h3>
      <label class="pce-arquivo">📎 Anexar PDF<input type="file" id="${pref}pdfs" accept="application/pdf,.pdf" multiple></label>
      <p class="dica" style="text-align:left">Até ${MAX_DOCS} arquivos de no máximo 10 MB cada. Vão para o Drive.</p><div id="${pref}pdfs-lista" class="pce-docs"></div></div>`;
  async function adicionarPDFs(input, pref) {
    const st = F, files = [...(input.files || [])]; input.value = '';
    for (const file of files) {
      if (st.docs.length >= MAX_DOCS) { toast(`Limite de ${MAX_DOCS} PDFs.`, true); break; }
      if (file.size > MAX_PDF) { toast(`"${file.name}" passa de 10 MB.`, true); continue; }
      const ini = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...ini) !== '%PDF-') { toast(`"${file.name}" não é um PDF válido.`, true); continue; }
      const dados = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(file); });
      if (!st.vivo) return;
      const a = { ...Anexos.novoArquivo(STORE[st.tipo], st.id, 'documento', '', 'application/pdf', 'data:application/pdf;base64,' + String(dados).replace(/^data:[^,]*,/, '')), nomeOriginal: String(file.name || 'documento.pdf').slice(0, 120) };
      await Store.gravar('arquivos', a); st.docs.push(a.id);
    }
    await renderDocs(pref); agendar(0);
  }
  async function renderDocs(pref) {
    const el = $('#' + pref + 'pdfs-lista'); if (!el || !F) return;
    const itens = await Promise.all(F.docs.map(id => Store.obter('arquivos', id)));
    el.innerHTML = F.docs.length ? F.docs.map((id, i) => { const a = itens[i] || {};
      return `<div class="pce-doc"><span>📄 ${esc(a.nomeOriginal || 'documento.pdf')} <small>${a.url ? '☁️ no Drive' : ''}</small></span>
        <span class="pce-doc-acoes">${a.url ? `<a class="mini" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}<button type="button" class="mini" data-mon="deldoc" data-id="${esc(id)}" aria-label="Remover PDF ${i + 1}">✕</button></span></div>`; }).join('')
      : '<div class="dica">Nenhum PDF anexado.</div>';
  }

  /* ---------- assinaturas na tela (modo de campo) ---------- */
  const assHTML = (papel, rot) => `<div class="pce-ass"><div class="pce-ass-topo"><span>${esc(rot)}</span><button type="button" class="mini" data-mon="limparass" data-papel="${papel}">Limpar</button></div>
      <canvas id="mon-ass-${papel}" class="pce-canvas" aria-label="Assinatura: ${esc(rot)}"></canvas></div>`;
  async function ligarAss(papel) {
    const cvs = $('#mon-ass-' + papel), st = F; if (!cvs) return;
    const salva = st.ass[papel] ? await Store.obter('arquivos', st.ass[papel]) : null;
    Anexos.ligarCanvas(cvs, st.assNovas[papel] || (salva && salva.dados), d => { st.assNovas[papel] = d; agendar(); });
  }

  /* ---------- numeração (online: planilha; sem internet: provisório; papel: o número do papel) ---------- */
  const chaveUlt = (tipo, u, a, prog) => (tipo === 'termo' ? `T|${unid(u)}|${a}` : `C|${String(prog || 'moniliase').toUpperCase()}|${unid(u)}|${a}`).toUpperCase();
  async function ultimoLocal(tipo, u, a, prog) {
    const uv = ((await Store.meta('ultimoVistoDocPce')) || {})[chaveUlt(tipo, u, a, prog)] || 0;
    const loc = (await Store.todos(STORE[tipo])).filter(r => unid(r.unidade) === unid(u) && Number(r.ano) === a && (tipo === 'termo' || (r.programa || 'moniliase') === (prog || 'moniliase')))
      .reduce((m, r) => Math.max(m, Number(r.numero) || 0), 0);
    return Math.max(uv, loc);
  }
  const online = () => navigator.onLine && Sync.ativado();
  function modal(html) {
    const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'mon-modal'; m.innerHTML = `<div class="tf-modal-box">${html}</div>`;
    document.body.append(m); return m;
  }
  /** Popup do número (modo de campo): número sugerido, editável. */
  function pedirNumero(o) {
    return new Promise(ok => {
      const ult = o.ultimoReg && o.ultimoReg.numeroTxt ? `Último número usado: <b>${esc(o.ultimoReg.numeroTxt)}</b>${o.ultimoReg.usuario ? ` (${esc(o.ultimoReg.usuario)}, ${esc(dBR(o.ultimoReg.data))})` : ''}.`
        : o.ultimo ? `Último número usado: <b>${esc(numTxt(o.tipo, o.ultimo, o.ano, o.unidade))}</b>.` : `Nenhum ${NOME[o.tipo]} anterior nesta unidade em ${o.ano}.`;
      const m = modal(`<h3>Número do ${esc(NOME[o.tipo])}</h3>${o.aviso ? `<div class="tf-alerta">${esc(o.aviso)}</div>` : ''}
        ${o.offline ? '<div class="tf-novo">⚠️ Sem conexão: número <b>provisório</b>, conferido na planilha ao sincronizar.</div>' : '<div class="tf-ok">✓ Número obtido na planilha agora.</div>'}
        <p class="dica">${ult}</p><input id="mon-num-m" type="number" inputmode="numeric" min="1" value="${o.numero}"><div id="mon-num-prev" class="tf-num"></div>
        <div class="duas"><button class="botao sec" id="mon-m-cancel" type="button">Cancelar</button><button class="botao" id="mon-m-ok" type="button">Confirmar e salvar</button></div>`);
      const i = m.querySelector('input'), prev = () => { m.querySelector('#mon-num-prev').innerHTML = `<b>${esc(numTxt(o.tipo, +i.value || 0, o.ano, o.unidade))}</b>`; };
      i.oninput = prev; prev(); i.focus();
      m.querySelector('#mon-m-cancel').onclick = () => { m.remove(); ok(null); };
      m.querySelector('#mon-m-ok').onclick = () => { const n = parseInt(i.value, 10); if (!(n > 0)) return toast('Informe o número.', true); m.remove(); ok(n); };
    });
  }
  /** Popup do registro do papel: número do papel e o efeito na sequência (como no Termo de Colheita antigo). */
  function confirmarPapel(o) {
    return new Promise(ok => {
      const ult = o.info ? o.info.ultimo : null;
      const efeito = ult == null ? '<div class="tf-novo">📴 Sem conexão: a planilha confere o número ao sincronizar (número repetido aparece como conflito).</div>'
        : o.n <= ult ? `<div class="tf-ok">✓ Dentro da sequência já usada (último: ${esc(num3(ult))}): não muda o próximo número.</div>`
        : o.n === ult + 1 ? `<div class="tf-novo">ℹ️ É o próximo da sequência: o próximo sugerido passa a ser ${esc(num3(o.n + 1))}.</div>`
        : `<div class="tf-alerta">⚠️ O número é <b>maior</b> que o último usado (${esc(num3(ult))}): os próximos desta unidade em ${o.ano} continuam a partir de <b>${esc(num3(o.n + 1))}</b>. Confira o papel.</div>`;
      const m = modal(`<h3>Gravar ${esc(NOME[o.tipo])} do papel</h3><div class="tf-num"><b id="mon-papel-num">${esc(numTxt(o.tipo, o.n, o.ano, o.unidade))}</b></div>${efeito}
        <div class="duas"><button class="botao sec" id="mon-m-cancel" type="button">Cancelar</button><button class="botao" id="mon-m-ok" type="button">Confirmar e gravar</button></div>`);
      m.querySelector('#mon-m-cancel').onclick = () => { m.remove(); ok(false); };
      m.querySelector('#mon-m-ok').onclick = () => { m.remove(); ok(true); };
    });
  }
  /**
   * Define o número e grava o registro (novo). rec já montado (sem número). Devolve true se gravou.
   * Online: a planilha confirma (pceDocRegistrar); sem internet: provisório/papel pendente, conferido no sync.
   */
  async function numerarEGravar(tipo, rec, pessoa, prop, papel) {
    const u = unid(rec.unidade), prog = rec.programa || 'moniliase';
    if (papel) {
      const a = papel.ano, n = papel.n;
      const dup = (await Store.todos(STORE[tipo])).find(r => r.id !== rec.id && !Number(r.excluido) && unid(r.unidade) === u && Number(r.ano) === a && Number(r.numero) === n && (tipo === 'termo' || (r.programa || 'moniliase') === prog));
      if (dup) { toast(`O nº ${numTxt(tipo, n, a, u)} já está neste aparelho (${dup.nome || ''}, ${dBR(dup.data)}). Confira o papel.`, true); return false; }
      let info = null;
      if (online()) { try { info = await Sync.pceDocNumero(tipo, u, a, prog); } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) { toast(e.message, true); return false; } } }
      if (!F || !(await confirmarPapel({ tipo, n, ano: a, unidade: u, info }))) return false;
      Object.assign(rec, { ano: a, numero: n, numeroTxt: numTxt(tipo, n, a, u), numeroSugerido: info ? info.proximo : '', numeroOrigem: 'papel', conflito: 0 });
      if (info) {
        let r;
        try { r = await Sync.pceDocRegistrar(tipo, rec, pessoa, prop); }
        catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) { toast(e.message, true); return false; } r = null; }
        if (r && r.emitido === false) { const oc = r.ocupadoPor || {}; toast(`O nº ${numTxt(tipo, n, a, u)} já está registrado na planilha${oc.usuario ? ` (${oc.usuario}, ${dBR(oc.data)}${oc.nome ? ', ' + oc.nome : ''})` : ''}. Confira o papel.`, true); return false; }
        if (r) { await gravarLocal(tipo, { ...rec, emitidoEm: r.emitidoEm }, pessoa, prop, 0); return true; }
      }
      await gravarLocal(tipo, rec, pessoa, prop, 1); return true;                // sem conexão: sobe no sync
    }
    const a = Number(String(rec.data).slice(0, 4)) || new Date().getFullYear();
    let sug = null;
    if (online()) { try { const r = await Sync.pceDocNumero(tipo, u, a, prog); sug = { numero: Math.max(r.proximo, (await ultimoLocal(tipo, u, a, prog)) + 1), ultimo: r.ultimo, ultimoReg: r.ultimoReg, origem: 'servidor' }; }
      catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) { toast(e.message, true); return false; } } }
    if (!sug) { const u0 = await ultimoLocal(tipo, u, a, prog); sug = { numero: u0 + 1, ultimo: u0, ultimoReg: null, origem: 'offline' }; }
    let n0 = sug.numero, aviso = '';
    for (let t = 0; t < 6; t++) {
      const n = await pedirNumero({ tipo, numero: n0, ano: a, unidade: u, ultimo: sug.ultimo, ultimoReg: sug.ultimoReg, offline: sug.origem !== 'servidor', aviso });
      if (n == null || !F) return false;
      if ((await Store.todos(STORE[tipo])).some(r => r.id !== rec.id && unid(r.unidade) === u && Number(r.ano) === a && Number(r.numero) === n && (tipo === 'termo' || (r.programa || 'moniliase') === prog))) {
        n0 = n; aviso = `Este aparelho já tem o nº ${numTxt(tipo, n, a, u)}. Escolha outro.`; continue;
      }
      Object.assign(rec, { ano: a, numero: n, numeroTxt: numTxt(tipo, n, a, u), numeroSugerido: sug.numero, conflito: 0,
        numeroOrigem: sug.origem !== 'servidor' ? 'provisorio' : (n === sug.numero ? 'sistema' : 'editado') });
      if (sug.origem === 'servidor') {
        let r = null;
        try { r = await Sync.pceDocRegistrar(tipo, rec, pessoa, prop); } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) { toast(e.message, true); return false; } }
        if (r && r.emitido === false) { const oc = r.ocupadoPor || {}; sug = { ...sug, numero: r.proximo, ultimo: r.ultimo, ultimoReg: oc }; n0 = r.proximo;
          aviso = `O nº ${numTxt(tipo, n, a, u)} acabou de ser usado${oc.usuario ? ' por ' + oc.usuario : ''}. Nova sugestão: ${num3(r.proximo)}.`; continue; }
        if (r) { await gravarLocal(tipo, { ...rec, emitidoEm: r.emitidoEm }, pessoa, prop, 0); return true; }
      }
      await gravarLocal(tipo, { ...rec, provisorio: sug.origem !== 'servidor' ? 1 : 0 }, pessoa, prop, 1); return true;
    }
    toast('Não foi possível definir o número. Tente de novo.', true); return false;
  }
  async function gravarLocal(tipo, rec, pessoa, prop, pendente) {
    const t = Date.now();
    await Store.gravar(STORE[tipo], { ...rec, criadoEm: rec.criadoEm || t, atualizadoEm: Math.max(t, (Number(rec.atualizadoEm) || 0) + 1), pendente });
    if (pessoa) await Store.gravar('pessoas', { ...pessoa, pendente });
    if (prop) await Store.gravar('propriedades', { ...prop, pendente });
    if (rec.numero) await Sync.lembrarUltimosDocPce({ [chaveUlt(tipo, rec.unidade, rec.ano, rec.programa)]: rec.numero });
    if (pendente && Store.quandoPendente) Sync.agendarEnvio();
  }

  /* ---------- produtor e propriedade (comuns ao cadastro e ao termo) ---------- */
  /** Id da propriedade: o mesmo do levantamento (CPF/CNPJ + nome da propriedade); sem nome, o endereço; sem documento, o nome do produtor. */
  function propIdDe(doc, nomeProd, prop, endereco) {
    const n = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const base = n(prop) || n(endereco) || 'PROPRIEDADE';
    return ((doc ? doc : 'SEMDOC ' + n(nomeProd)) + '|' + base).slice(0, 64).trim();
  }
  async function montarProp(id, o) {
    const l = await Store.obter('propriedades', id), t = Date.now(), b = { ...(l || {}) }; delete b.pendente;
    const set = {}; Object.keys(o).forEach(k => { if (o[k] !== '' && o[k] != null) set[k] = o[k]; });
    return { ...b, ...set, id, codigo: b.codigo || '', nome: o.nome || b.nome || '', criadoEm: b.criadoEm || t, atualizadoEm: t };
  }
  async function montarPessoa(doc, campos) { return doc && (doc.length === 11 || doc.length === 14) ? U().montarPessoa(doc, campos) : null; }
  /** CPF/CNPJ: no papel é opcional (avisa se inválido); em campo, obrigatório. false = parar. */
  function docConfere(doc, papel) {
    if (!doc) { if (papel) return true; toast('Informe o CPF/CNPJ.', true); return false; }
    if (doc.length !== 11 && doc.length !== 14) { if (papel) return confirm(`O CPF/CNPJ "${doc}" está incompleto. Salvar mesmo assim?`); toast('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.', true); return false; }
    return U().docOk(doc) || confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Continuar mesmo assim?`);
  }

  /* ================= Cadastro de imóvel (monilíase) ================= */
  const PC = 'mc-';
  const cadVazio = (s, m = {}) => ({ unidade: m.unidade || (s && s.lotacao) || '', numPapel: '', data: m.data || '', local: m.local || '', sNome: m.sNome || '', sCargo: m.sCargo || '',
    sMatricula: m.sMatricula || '', sLotacao: m.sLotacao || '', comercial: '', tipoNaoComercial: '', tipoOutros: '', nome: '', doc: '', propriedade: '', cnpj: '',
    lat: '', lon: '', viaAcesso: '', viaOutra: '', endereco: '', municipio: m.municipio || '', uf: 'AM', plantas: {}, areaAbandonada: '', areaTotal: '', idadePlantio: '',
    areaProducao: '', idadeProducao: '', mumificados: '', origem: '', origemFonte: '', producao: '', producaoUnidade: '', destino: '', sacaria: '', controlePraga: '',
    assistencia: '', assistenciaOrgao: '', frutosSaem: '', frutosDestino: '', fito: {}, sintomas: '', sintomaLat: '', sintomaLon: '', camaraUmida: '', camaraMr: '',
    suspeitos: [], amostra: '', diagnostico: '' });
  const cadDeRegistro = r => { const d = lerJSON(r.dados, {});
    return { ...cadVazio(null), ...d, unidade: r.unidade || '', numPapel: r.numeroTxt || '', data: r.data || '', local: r.local || '', sNome: r.servidor || '', sCargo: r.cargo || '',
      sMatricula: r.matricula || '', sLotacao: r.lotacao || '', nome: r.nome || '', doc: PCEDocs.fmtDoc(r.doc), propriedade: r.propriedade || '', cnpj: r.cnpj || '',
      lat: r.lat === '' || r.lat == null ? '' : String(r.lat).replace('.', ','), lon: r.lon === '' || r.lon == null ? '' : String(r.lon).replace('.', ','),
      municipio: r.municipio || '', uf: r.uf || 'AM', plantas: d.plantas || {}, fito: d.fito || {}, suspeitos: d.suspeitos || [] }; };
  function coletarCad() {
    const p = PC, fito = {};
    (MO.doencas || []).forEach(([k]) => { fito[k] = { tem: rv(p, 'f-' + k + '-tem'), tempo: g(p, 'f-' + k + '-tempo'), controle: rv(p, 'f-' + k + '-controle'), qual: g(p, 'f-' + k + '-qual') }; });
    const plantas = {}; HOSP.forEach(([k]) => { plantas[k] = g(p, 'pl-' + k); });
    return { unidade: g(p, 'unidade'), numPapel: g(p, 'numpapel'), data: g(p, 'data'), local: g(p, 'local'), sNome: g(p, 'snome'), sCargo: U().cargoValor(p + 'scargo'), sMatricula: g(p, 'smatricula'),
      sLotacao: g(p, 'slotacao'), comercial: rv(p, 'comercial'), tipoNaoComercial: rv(p, 'tipoNaoComercial'), tipoOutros: g(p, 'tipoOutros'), nome: g(p, 'nome'), doc: g(p, 'doc'),
      propriedade: g(p, 'propriedade'), cnpj: g(p, 'cnpj'), lat: g(p, 'lat'), lon: g(p, 'lon'), viaAcesso: rv(p, 'viaAcesso'), viaOutra: g(p, 'viaOutra'), endereco: g(p, 'endereco'),
      municipio: g(p, 'municipio'), uf: g(p, 'uf'), plantas, areaAbandonada: rv(p, 'areaAbandonada'), areaTotal: g(p, 'areaTotal'), idadePlantio: g(p, 'idadePlantio'),
      areaProducao: g(p, 'areaProducao'), idadeProducao: g(p, 'idadeProducao'), mumificados: rv(p, 'mumificados'), origem: rv(p, 'origem'), origemFonte: g(p, 'origemFonte'),
      producao: g(p, 'producao'), producaoUnidade: rv(p, 'producaoUnidade'), destino: g(p, 'destino'), sacaria: rv(p, 'sacaria'), controlePraga: rv(p, 'controlePraga'),
      assistencia: rv(p, 'assistencia'), assistenciaOrgao: g(p, 'assistenciaOrgao'), frutosSaem: rv(p, 'frutosSaem'), frutosDestino: g(p, 'frutosDestino'), fito,
      sintomas: rv(p, 'sintomas'), sintomaLat: g(p, 'sintomaLat'), sintomaLon: g(p, 'sintomaLon'), camaraUmida: rv(p, 'camaraUmida'), camaraMr: rv(p, 'camaraMr'),
      suspeitos: cv(p, 'suspeitos'), amostra: rv(p, 'amostra'), diagnostico: rv(p, 'diagnostico') };
  }
  const totalDe = pl => HOSP.reduce((s, [k]) => s + (Number(inteiro(pl[k])) || 0), 0);
  function formCadHTML(D, st) {
    const p = PC, A = st.antigo, num = 'inputmode="numeric" autocomplete="off"';
    const fito = k => { const f = D.fito[k] || {}; const nm = (MO.doencas.find(x => x[0] === k) || [k, k])[1];
      return `<div class="mon-fito"><b>${esc(nm)}</b>${sn(p, 'f-' + k + '-tem', 'Presença', f.tem || '')}${inp(p, 'f-' + k + '-tempo', 'Há quanto tempo', f.tempo || '')}
        ${sn(p, 'f-' + k + '-controle', 'Utiliza método de controle', f.controle || '')}${inp(p, 'f-' + k + '-qual', 'Qual', f.qual || '')}</div>`; };
    return `<form id="monCadForm" class="${A ? 'pce-antigo' : ''}" autocomplete="off" novalidate>
      ${A ? topoPapel(st.novo ? 'Cadastro de propriedade — digitar do papel' : 'Editar cadastro (do papel)', st.novo) + U().servAntigoHTML(p, D, st.lembrados)
        : `<div class="card mon-topo"><h3>🏡 ${st.novo ? 'Cadastro de propriedade (imóvel com hospedeiros)' : 'Editar cadastro da propriedade'}</h3>
          <p class="dica" style="text-align:left">Servidor: <b>${esc(st.serv.servidor)}</b> · ${esc(st.serv.cargo)} · ${esc(st.serv.lotacao)}</p></div>`}
      <div class="card"><h3>Nº do cadastro</h3>
        <label>Unidade (numeração) *<select id="${p}unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
        ${A ? `${st.novo || !st.rec ? inp(p, 'numpapel', 'Nº do cadastro (como está no papel) *', D.numPapel, 'placeholder="ex.: 001-2025-AUTAZES ou 1" autocomplete="off"') : `<div class="tf-num"><b>${esc(st.rec.numeroTxt)}</b></div>`}
          <div id="${p}numpapel-st" class="tf-status" aria-live="polite"></div>
          <div class="duas">${inp(p, 'data', 'Data (do papel) *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${inp(p, 'local', 'Local', D.local, 'placeholder="ex.: Autazes"')}</div>`
          : `<div class="tf-num">${st.rec ? `<b>${esc(st.rec.numeroTxt)}</b>` : '<small>Nº definido ao salvar (consulta a planilha; sem internet, provisório).</small>'}</div>`}
        ${st.deTermo ? '<p class="dica" style="text-align:left">↩️ Ao salvar, volta para o Termo de Fiscalização com este cadastro ligado.</p>' : ''}</div>
      <div class="card">${sn(p, 'comercial', 'Propriedade comercial?', D.comercial)}
        <div id="${p}naocom" ${D.comercial === 'sim' ? 'hidden' : ''}>${sn(p, 'tipoNaoComercial', 'Propriedade não comercial', D.tipoNaoComercial, MO.tiposNaoComercial)}
        ${inp(p, 'tipoOutros', 'Outros (qual)', D.tipoOutros)}</div></div>
      <div class="card"><h3>1. Dados do produtor/proprietário</h3>
        <div class="campo-busca"><label>Buscar produtor/propriedade já cadastrados (nome, CPF ou código)<input id="${p}busca" type="search" autocomplete="off"></label><div id="${p}busca-res"></div></div>
        ${inp(p, 'nome', 'Nome do produtor *', D.nome, 'autocapitalize="characters"')}
        <div class="duas">${inp(p, 'doc', A ? 'CPF (opcional no papel)' : 'CPF *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}${inp(p, 'cnpj', 'CNPJ', D.cnpj, 'inputmode="numeric"')}</div>
        <div id="${p}st-doc" class="tf-status"></div>
        ${inp(p, 'propriedade', 'Nome da propriedade', D.propriedade)}
        <p class="mon-sub">Georreferenciamento</p>${coordHTML(p, D, !A)}
        ${sn(p, 'viaAcesso', 'Principal via de acesso à propriedade', D.viaAcesso, [['fluvial', 'Fluvial'], ['terrestre', 'Terrestre'], ['outra', 'Outra']])}
        <div id="${p}via-outra" ${D.viaAcesso === 'outra' ? '' : 'hidden'}>${inp(p, 'viaOutra', 'Outra via (qual)', D.viaOutra)}</div>
        ${inp(p, 'endereco', 'Endereço', D.endereco)}
        <div class="duas mon-mun"><label>Município *<select id="${p}municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>${inp(p, 'uf', 'UF', D.uf, 'maxlength="2" autocapitalize="characters"')}</div></div>
      <div class="card"><h3>2. Tipo de atividade</h3>
        <p class="mon-sub">Cultura (nº de plantas)</p>
        <div class="mon-cult">${HOSP.map(([k, t]) => inp(p, 'pl-' + k, t, (D.plantas || {})[k], num)).join('')}<label>Total<output id="${p}total" class="mon-total">${totalDe(D.plantas || {})}</output></label></div>
        ${sn(p, 'areaAbandonada', 'Existe área abandonada com as culturas?', D.areaAbandonada)}
        <div class="duas">${inp(p, 'areaTotal', 'Área total plantada (ha)', D.areaTotal, 'inputmode="decimal"')}${inp(p, 'idadePlantio', 'Idade do plantio (anos)', D.idadePlantio, num)}</div>
        <div class="duas">${inp(p, 'areaProducao', 'Área em produção (ha)', D.areaProducao, 'inputmode="decimal"')}${inp(p, 'idadeProducao', 'Idade do plantio em produção (anos)', D.idadeProducao, num)}</div>
        ${sn(p, 'mumificados', 'Retirada de frutos mumificados?', D.mumificados)}
        ${sn(p, 'origem', 'Origem das sementes/mudas', D.origem, [['proprias', 'Próprias'], ['terceiros', 'Terceiros']])}
        <div id="${p}fonte" ${D.origem === 'terceiros' ? '' : 'hidden'}>${inp(p, 'origemFonte', 'Fonte (terceiros)', D.origemFonte)}</div>
        <div class="duas">${inp(p, 'producao', 'Produção', D.producao, 'inputmode="decimal"')}<div>${sn(p, 'producaoUnidade', 'Unidade', D.producaoUnidade, [['sacas', 'Sacas'], ['kg', 'Kg']])}</div></div>
        ${inp(p, 'destino', 'Destino da produção', D.destino)}
        ${sn(p, 'sacaria', 'Sacaria utilizada', D.sacaria, [['nova', 'Nova'], ['reutilizada', 'Reutilizada']])}
        ${sn(p, 'controlePraga', 'Utiliza algum controle de praga?', D.controlePraga)}
        ${sn(p, 'assistencia', 'Assistência técnica', D.assistencia, [['nao', 'Não possui'], ['privada', 'Privada'], ['publica', 'Pública']])}
        <div id="${p}orgao" ${D.assistencia === 'publica' || D.assistencia === 'privada' ? '' : 'hidden'}>${inp(p, 'assistenciaOrgao', 'Órgão / empresa', D.assistenciaOrgao)}</div>
        ${sn(p, 'frutosSaem', 'Frutos inteiros saem da propriedade?', D.frutosSaem, [['nao', 'Não'], ['sim', 'Sim']])}
        <div id="${p}fdest" ${D.frutosSaem === 'sim' ? '' : 'hidden'}>${inp(p, 'frutosDestino', 'Qual o destino?', D.frutosDestino)}</div></div>
      <div class="card"><h3>3. Informações fitossanitárias</h3>${(MO.doencas || []).map(([k]) => fito(k)).join('')}</div>
      <div class="card"><h3>4. Levantamento de detecção</h3>
        ${sn(p, 'sintomas', 'Fruto com sintomas visuais de Moniliophthora roreri?', D.sintomas)}
        <div id="${p}sint" ${D.sintomas === 'sim' ? '' : 'hidden'}><p class="mon-sub">Coordenada da planta com sintoma</p>
          <div class="duas">${inp(p, 'sintomaLat', 'Latitude', D.sintomaLat, 'autocomplete="off"')}${inp(p, 'sintomaLon', 'Longitude', D.sintomaLon, 'autocomplete="off"')}</div></div>
        ${sn(p, 'camaraUmida', 'Realizada câmara úmida?', D.camaraUmida)}
        ${sn(p, 'camaraMr', 'Câmara úmida apresenta comportamento de M. roreri?', D.camaraMr)}
        <p class="mon-sub">Hospedeiro suspeito</p>${cks(p, 'suspeitos', HOSP, D.suspeitos)}
        ${sn(p, 'amostra', 'Colheita de amostra?', D.amostra)}
        ${sn(p, 'diagnostico', 'Diagnóstico', D.diagnostico, [['positivo', 'Positivo p/ M. roreri'], ['negativo', 'Negativo p/ M. roreri']])}</div>
      ${A ? pdfHTML(p) : `<div class="card"><h3>Assinaturas (opcional)</h3>${assHTML('servidor', 'Servidor da ADAF')}${assHTML('produtor', 'Produtor/proprietário')}</div>`}
      <button class="botao" type="submit" id="${p}salvar">💾 Salvar cadastro</button>
      ${A && st.novo ? `<button class="botao" type="button" data-mon="salvaroutro" id="${p}salvar-outro">💾 Salvar e digitar outro</button>` : ''}
      <button class="botao sec" type="button" data-mon="descartar">Descartar</button></form>`;
  }
  function mostrarNumPapel(pref, tipo) {
    const st = $('#' + pref + 'numpapel-st'), el = $('#' + pref + 'numpapel'); if (!st || !el) return null;
    if (!el.value.trim()) { st.replaceChildren(); return null; }
    const r = lerNumeroDoc(el.value, g(pref, 'unidade'), g(pref, 'data'));
    if (!r.erro && r.unidadeDoNumero && !g(pref, 'unidade')) { const s = $('#' + pref + 'unidade'); s.value = r.unidadeDoNumero; }
    st.innerHTML = r.erro ? `<div class="tf-alerta">⚠️ ${esc(r.erro)}</div>` : !r.ano ? '<div class="tf-novo">Informe a data para conferir o ano do número.</div>'
      : `<div class="tf-ok">✓ Será gravado como <b>${esc(numTxt(tipo, r.n, r.ano, r.unidade || g(pref, 'unidade')))}</b>.</div>`;
    return r;
  }
  function ligarVisibilidade(p) {
    const vis = (id, cond) => { const e = $('#' + p + id); if (e) e.hidden = !cond; };
    vis('naocom', rv(p, 'comercial') !== 'sim'); vis('via-outra', rv(p, 'viaAcesso') === 'outra'); vis('fonte', rv(p, 'origem') === 'terceiros');
    vis('orgao', ['publica', 'privada'].includes(rv(p, 'assistencia'))); vis('fdest', rv(p, 'frutosSaem') === 'sim'); vis('sint', rv(p, 'sintomas') === 'sim');
    const t = $('#' + p + 'total'); if (t) t.textContent = totalDe(coletarCad().plantas);
  }

  async function cadastro(arg) {
    if (bloqueado()) return view(avisoAtivacao());
    const id = typeof arg === 'string' ? arg : '', o = arg && typeof arg === 'object' ? arg : {};
    const rec0 = id ? await Store.obter('cadastrosPce', id) : null, s0 = await U().servidorAtual();
    const querAntigo = !!(o.antigo || (rec0 && Number(rec0.registroAntigo) === 1) || (!id && U().soDigitador(s0) && U().podeAntigo()));
    if (querAntigo && !U().podeAntigo()) { toast(U().SEM_ANTIGO, true); return go('pcecads'); }
    const s = await U().exigirServidor('pcecad', arg, querAntigo); if (!s) return;
    fechar();
    if (id && (!rec0 || rec0.excluido)) { toast('Cadastro não encontrado.', true); return go('pcecads'); }
    const t = await tratarRascunho('cadastro', id, false); if (!t) return go('pcecads');
    // Cadastro de citros: sai do levantamento (rascunho retomado vale o programa dele)
    if ((t.rasc ? t.rasc.programa : rec0 ? rec0.programa : o.programa) === 'citros') return cadastroCitros(o, rec0, t.rasc, s);
    let st, D;
    if (t.rasc) {
      const r = t.rasc, rec = r.id ? await Store.obter('cadastrosPce', r.id) : null;
      st = { tipo: 'cadastro', id: r.id, novo: !rec, rec, antigo: !!r.antigo, docs: r.docs || [], ass: rec ? lerJSON(rec.assinaturas, {}) : {}, assNovas: r.assNovas || {}, deTermo: !!r.deTermo, propriedadeId: r.propriedadeId || '', levId: r.levId || '' };
      D = { ...cadVazio(s), ...r.dados };
    } else if (rec0) {
      st = { tipo: 'cadastro', id: rec0.id, novo: false, rec: rec0, antigo: Number(rec0.registroAntigo) === 1, docs: lerJSON(rec0.documentos, []), ass: lerJSON(rec0.assinaturas, {}), assNovas: {} };
      D = cadDeRegistro(rec0);
    } else {
      st = { tipo: 'cadastro', id: Store.novoId(), novo: true, rec: null, antigo: querAntigo, docs: [], ass: {}, assNovas: {}, deTermo: !!o.deTermo, propriedadeId: o.propId || o.propIdLig || '', levId: o.levId || '' };
      D = cadVazio(querAntigo ? null : s, o.manter || {});
      if (!querAntigo) Object.assign(D, { data: hojeISO(), municipio: s.lotacao || '', local: s.lotacao || '' });
      if (o.prefill) Object.assign(D, Object.fromEntries(Object.entries(o.prefill).filter(([, v]) => v !== '' && v != null)));
      if (o.propId) { const pd = await dadosDaPropriedade(o.propId); delete pd.propriedadeId; delete pd.telefone; Object.assign(D, pd); }
    }
    st.vivo = true; st.serv = st.rec && !st.antigo ? { servidor: st.rec.servidor, cargo: st.rec.cargo, matricula: st.rec.matricula, lotacao: st.rec.lotacao } : U().dadosServidor(s);
    if (st.antigo) st.lembrados = await U().servidoresLembrados();
    F = st;
    view(formCadHTML(D, st));
    mostrarCoord(PC); mostrarNumPapel(PC, 'cadastro');
    if (st.antigo) await renderDocs(PC); else { await ligarAss('servidor'); await ligarAss('produtor'); }
    const f = $('#monCadForm');
    f.addEventListener('input', e => {
      const tid = e.target.id;
      if (tid === PC + 'busca') { clearTimeout(tR); return buscarProdutor(PC); }
      if (tid === PC + 'lat' || tid === PC + 'lon') mostrarCoord(PC);
      if ([PC + 'numpapel', PC + 'unidade', PC + 'data'].includes(tid)) mostrarNumPapel(PC, 'cadastro');
      if (/^mc-pl-/.test(tid)) ligarVisibilidade(PC);
      agendar();
    });
    f.addEventListener('change', async e => {
      const el = e.target;
      if (el.id === PC + 'pdfs') return adicionarPDFs(el, PC);
      if (el.id === PC + 'snome') await U().completarServidor(PC);
      if (el.id === PC + 'doc' || el.id === PC + 'cnpj') { el.value = PCEDocs.fmtDoc(digitos(el.value)) || el.value; avisoDoc(PC); }
      if (el.id === PC + 'municipio' && !g(PC, 'local') && st.antigo) $('#' + PC + 'local').value = el.value;
      if ([PC + 'numpapel', PC + 'unidade', PC + 'data'].includes(el.id)) mostrarNumPapel(PC, 'cadastro');
      ligarVisibilidade(PC); agendar();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarCad(false); };
    const p1 = $(st.antigo ? (D.sNome ? '#mc-numpapel' : '#mc-snome') : '#mc-nome'); if (p1 && st.novo) p1.focus();
  }
  function avisoDoc(pref) {
    const el = $('#' + pref + 'st-doc'), d = digitos(g(pref, 'doc')); if (!el) return;
    el.innerHTML = !d ? '' : d.length !== 11 && d.length !== 14 ? '<div class="tf-alerta">⚠️ CPF/CNPJ incompleto.</div>'
      : U().docOk(d) ? '' : `<div class="tf-alerta">⚠️ ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
  }
  /** Produtor/propriedade já no aparelho (inclusive dados do município baixados): preenche o cadastro. */
  async function buscarProdutor(pref) {
    const q = g(pref, 'busca').trim(), out = $('#' + pref + 'busca-res'); if (!out) return;
    if (q.length < 2) { out.replaceChildren(); return; }
    const r = await Campo.buscar(q, 10); if (g(pref, 'busca').trim() !== q || !F) return;
    F.busca = r;
    out.innerHTML = r.length ? `<ul class="campo-res">${r.map((x, i) => `<li><button type="button" class="campo-res-item" data-mon="usarbusca" data-i="${i}"><b>${esc((x.pessoa && x.pessoa.nome) || 'Produtor')}</b>
      <small>${esc([x.prop ? x.prop.nome || 'propriedade sem nome' : 'sem propriedade', x.prop && x.prop.municipio, PCEDocs.fmtDoc((x.prop && x.prop.doc) || (x.pessoa && x.pessoa.id))].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>`
      : '<div class="tf-novo">Nada encontrado neste aparelho.</div>';
  }
  async function dadosDaPropriedade(propId) {
    const x = await Campo.dadosPara(propId); if (!x) return {};
    const p = x.prop, pe = x.pessoa || {};
    return { nome: pe.nome || '', doc: PCEDocs.fmtDoc(p.doc), propriedade: p.nome || '', cnpj: p.cnpj || '', municipio: p.municipio || '', uf: p.uf || 'AM',
      endereco: p.endereco || pe.endereco || '', lat: p.lat === '' || p.lat == null ? '' : String(p.lat).replace('.', ','), lon: p.lon === '' || p.lon == null ? '' : String(p.lon).replace('.', ','),
      viaAcesso: p.viaAcesso || '', comercial: p.comercial || '', tipoNaoComercial: p.tipoPropriedade || '', telefone: pe.telefone || '', propriedadeId: p.id };
  }
  function aplicarBusca(pref, x) {
    const set = (id, v) => { const el = $('#' + pref + id); if (el && v != null && v !== '') el.value = el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v) ? (el.add(new Option(v, v)), v) : v; };
    const p = x.prop || {}, pe = x.pessoa || {};
    set('nome', pe.nome); set('doc', PCEDocs.fmtDoc(p.doc || pe.id)); set('propriedade', p.nome); set('municipio', p.municipio); set('endereco', p.endereco || pe.endereco);
    set('cnpj', p.cnpj); if (p.lat !== '' && p.lat != null) { set('lat', String(p.lat).replace('.', ',')); set('lon', String(p.lon).replace('.', ',')); }
    set('telefone', pe.telefone);
    if (x.prop && x.prop.id && F) F.propriedadeId = x.prop.id;                // mesma propriedade do levantamento/mapa
    const r = $('#' + pref + 'busca-res'), b = $('#' + pref + 'busca'); if (r) r.replaceChildren(); if (b) b.value = '';
    mostrarCoord(pref); avisoDoc(pref); agendar(0);
  }

  async function salvarCad(outro) {
    const st = F; if (!st || !st.vivo || st.salvando || st.tipo !== 'cadastro') return;
    const D = coletarCad(), A = st.antigo, doc = digitos(D.doc), cnpj = digitos(D.cnpj);
    let sv = null, papel = null;
    if (A && !(sv = U().servidorDigitado(PC))) return;
    if (!D.unidade) return toast('Escolha a unidade da numeração.', true);
    if (!D.nome.trim()) return toast('Informe o nome do produtor.', true);
    if (!docConfere(doc, A)) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    const co = lerPar(D.lat, D.lon); if (co.erro) return toast('Coordenadas: ' + co.erro, true);
    const sc = lerPar(D.sintomaLat, D.sintomaLon); if (sc.erro) return toast('Coordenada da planta com sintoma: ' + sc.erro, true);
    if (A) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(D.data)) return toast('Informe a data que está no papel.', true);
      if (D.data > hojeISO()) return toast('A data não pode estar no futuro. Confira o papel.', true);
      if (st.novo) { papel = lerNumeroDoc(D.numPapel, D.unidade, D.data); if (papel.erro) { mostrarNumPapel(PC, 'cadastro'); return toast(papel.erro, true); } }
    }
    const btns = [$('#mc-salvar'), $('#mc-salvar-outro')].filter(Boolean); btns.forEach(b => { b.disabled = true; }); st.salvando = true;
    try {
      const nome = D.nome.trim().replace(/\s+/g, ' ').toUpperCase(), plantas = {};
      HOSP.forEach(([k]) => { const n = inteiro(D.plantas[k]); plantas[k] = n === '' ? '' : n; });
      const dados = { comercial: D.comercial, tipoNaoComercial: D.comercial === 'sim' ? '' : D.tipoNaoComercial, tipoOutros: D.tipoOutros.trim(), viaAcesso: D.viaAcesso,
        viaOutra: D.viaAcesso === 'outra' ? D.viaOutra.trim() : '', endereco: D.endereco.trim(), plantas, areaAbandonada: D.areaAbandonada, areaTotal: area(D.areaTotal),
        idadePlantio: inteiro(D.idadePlantio), areaProducao: area(D.areaProducao), idadeProducao: inteiro(D.idadeProducao), mumificados: D.mumificados, origem: D.origem,
        origemFonte: D.origem === 'terceiros' ? D.origemFonte.trim() : '', producao: area(D.producao), producaoUnidade: D.producaoUnidade, destino: D.destino.trim(),
        sacaria: D.sacaria, controlePraga: D.controlePraga, assistencia: D.assistencia, assistenciaOrgao: D.assistencia === 'nao' ? '' : D.assistenciaOrgao.trim(),
        frutosSaem: D.frutosSaem, frutosDestino: D.frutosSaem === 'sim' ? D.frutosDestino.trim() : '', fito: D.fito, sintomas: D.sintomas,
        sintomaLat: sc.vazio ? '' : sc.lat, sintomaLon: sc.vazio ? '' : sc.lon, camaraUmida: D.camaraUmida, camaraMr: D.camaraMr, suspeitos: D.suspeitos, amostra: D.amostra, diagnostico: D.diagnostico };
      const { mapa, novos } = Anexos.prepararAssinaturas({ ...st, dono: 'cadastrosPce' });
      await Store.gravarVarios('arquivos', novos);
      const propriedadeId = (st.rec && st.rec.propriedadeId) || st.propriedadeId || propIdDe(doc, nome, D.propriedade, D.endereco);
      const base = { ...(st.rec || {}) }; delete base.pendente; delete base.provisorio;
      const rec = { ...base, id: st.id, programa: 'moniliase', unidade: unid(D.unidade), propriedadeId, doc, nome, propriedade: D.propriedade.trim(), cnpj,
        data: A ? D.data : (base.data || hojeISO()), hora: A ? '' : (base.hora || agoraHM()), municipio: D.municipio, uf: (D.uf || 'AM').trim().toUpperCase(),
        lat: co.vazio ? '' : co.lat, lon: co.vazio ? '' : co.lon, ...(sv || st.serv), local: (A ? D.local : (base.local || D.municipio)).trim(), dados: JSON.stringify(dados),
        totalPlantas: totalDe(plantas), fotos: base.fotos || '[]', assinaturas: JSON.stringify(mapa), documentos: JSON.stringify(st.docs),
        registroAntigo: A ? 1 : 0, excluido: 0 };
      const pessoa = await montarPessoa(doc, { nome, endereco: dados.endereco, municipio: D.municipio, uf: rec.uf });
      const prop = await montarProp(propriedadeId, { nome: rec.propriedade, doc, municipio: D.municipio, lat: rec.lat, lon: rec.lon, cnpj, viaAcesso: D.viaAcesso,
        comercial: D.comercial, tipoPropriedade: dados.tipoNaoComercial, endereco: dados.endereco, uf: rec.uf });
      if (st.novo) {
        if (!(await numerarEGravar('cadastro', rec, pessoa, prop, papel))) return;
      } else {
        await Store.salvar('cadastrosPce', rec);
        if (pessoa) await Store.salvar('pessoas', pessoa);
        await Store.salvar('propriedades', prop);
      }
      if (sv) await U().lembrarServidor(sv);
      const antes = Anexos.idsArquivos(st.rec), depois = new Set([...st.docs, ...Object.values(mapa)]);
      await Anexos.apagarSeNaoEnviado([...antes].filter(x => !depois.has(x)));
      const deTermo = st.deTermo, levId = st.levId; fechar(); await Store.setMeta(RASC.cadastro, null);
      Sync.sincronizar();
      if (deTermo) { toast('Cadastro salvo. Voltando ao Termo de Fiscalização.'); return go('pcetf', { retomar: true, cadastroId: rec.id }); }
      if (levId) { toast('Cadastro salvo. Agora o Termo de Fiscalização da visita.'); return go('pcetf', { cadastroId: rec.id, levId, antigo: st.antigo }); }
      if (outro) { toast(`Cadastro ${rec.numeroTxt || ''} salvo. Digite o próximo.`); return go('pcecad', { antigo: true, manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data, local: D.local.trim() } }); }
      go('pcecadpronto', rec.id);
    } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
    finally { st.salvando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }

  /* ================= Cadastro de citros (programa "citros"): sai do levantamento ================= */
  // Os dados (produtor, propriedade, localização e o bloco "Cultura do citros") são os do levantamento da visita, copiados para "dados" ao salvar:
  // aqui só a unidade/número (papel: o número do papel), as assinaturas (ou o PDF escaneado) e a conferência. Para corrigir, edita-se o levantamento.
  const CI = (P.citros || {});
  /** Culturas avaliadas nos cards de praga de citros do levantamento (nomes, sem repetir). */
  const culturasCitrosDoLev = lev => [...new Set(Docs.pceGrupos(lev).pragas.filter(g => PCECitros.ehCitros(g.praga)).flatMap(g => g.culturas.map(c => c.cultura)).filter(Boolean))];
  const levEhCitros = lev => !!lev && Docs.pceGrupos(lev).pragas.some(g => PCECitros.ehCitros(g.praga));
  /** "Propriedade comercial Sítio X, Ramal Y, Manaus/AM": o local da fiscalização (Termo de citros), a partir do levantamento. */
  function localDoLev(lev) {
    const tl = String(lev.tipoLocal || '').trim(), base = tl && !/^outro$/i.test(tl) ? tl : 'Propriedade';
    return [base + (lev.propriedade ? ' ' + String(lev.propriedade).trim() : ''), String(lev.endereco || '').trim(), lev.municipio ? `${lev.municipio}/${lev.uf || 'AM'}` : ''].filter(Boolean).join(', ');
  }
  /** "dados" do Cadastro de citros: o bloco "Cultura do citros" do levantamento + o que o modelo de papel pede além das colunas do cadastro. */
  function dadosCitrosDoLev(lev) {
    const ci = PCECitros.deValor(lev.citros), G = Docs.pceGrupos(lev).pragas.filter(g => PCECitros.ehCitros(g.praga));
    return { ...ci, v: 1, levantamentoId: lev.id, codigoPropriedade: lev.codigoPropriedade || '', endereco: lev.endereco || '', telefone: lev.telefone || '', email: lev.email || '',
      empresa: lev.empresa || '', culturasAvaliadas: culturasCitrosDoLev(lev), amostra: G.some(g => g.culturas.some(c => c.coleta === 'Sim')) ? 'sim' : 'nao' };
  }
  const coletarCadCi = () => ({ unidade: g(PC, 'unidade'), numPapel: g(PC, 'numpapel') });
  /** Conferência na tela: [rótulo, texto] da identificação + resumo do bloco de citros e a tabela da cultura do citros. */
  function resumoCadCiHTML(base, d) {
    const R = PCECitros.resumo(d) || { campos: [], culturas: [] }, li = ([r, v]) => (String(v || '').trim() ? `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>` : '');
    const coord = base.lat !== '' && base.lat != null ? `${String(base.lat).replace('.', ',')} / ${String(base.lon).replace('.', ',')}` : '';
    const ident = [['Produtor', base.nome], ['CPF/CNPJ', PCEDocs.fmtDoc(base.doc)], ['Propriedade', base.propriedade], ['CNPJ', PCEDocs.fmtDoc(base.cnpj)],
      ['Código da propriedade (IN 33/2016)', d.codigoPropriedade], ['Coordenadas', coord], ['Endereço', d.endereco], ['Município/UF', [base.municipio, base.uf].filter(Boolean).join(' / ')],
      ['Data da visita', [dBR(base.data), base.hora].filter(Boolean).join(' ')]];
    return `<div class="card"><h3>1. Dados do produtor/proprietário</h3><dl class="pce-ci-resumo">${ident.map(li).join('')}</dl></div>
      <div class="card"><h3>🍊 Cultura do citros (do levantamento)</h3><dl class="pce-ci-resumo" id="mc-ci-resumo">${R.campos.map(li).join('') || '<div><dd>Nada preenchido além da detecção.</dd></div>'}</dl>
        ${R.culturas.length ? `<table class="pce-ci-tab"><thead><tr><th>Cultivar</th><th>Área (ha)</th><th>Idade</th><th>Plantas</th><th>t/ano</th></tr></thead><tbody>${R.culturas.map(c =>
          `<tr><td>${esc(c.cultivar || c.atividade)}</td><td>${esc(c.area)}</td><td>${esc(c.idade)}</td><td>${esc(c.plantas)}</td><td>${esc(c.producao)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  }
  function formCadCiHTML(D, st) {
    const p = PC, A = st.antigo, b = st.base;
    return `<form id="monCadForm" class="mon-cadci ${A ? 'pce-antigo' : ''}" data-programa="citros" autocomplete="off" novalidate>
      <div class="card mon-topo"><h3>🍊 ${st.novo ? 'Cadastro de citros' : 'Cadastro de citros ' + esc(st.rec.numeroTxt || '')}</h3>
        <p class="dica" style="text-align:left">Cadastro de imóveis de produção comercial de cítricos (IN 21/2018 e Portaria 317/2021). Os dados vêm do levantamento da visita
          (${esc(dBR(b.data))}${b.servidor ? ', ' + esc(b.servidor) : ''}); para corrigir, edite o levantamento.${st.levId ? ' Ao salvar, abre o Termo de Fiscalização da visita.' : ''}</p></div>
      <div class="card"><h3>Nº do cadastro</h3>
        <label>Unidade (numeração) *<select id="${p}unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
        <input type="hidden" id="${p}data" value="${esc(b.data || '')}">
        ${A && st.novo ? `${inp(p, 'numpapel', 'Nº do cadastro (como está no papel) *', D.numPapel, 'placeholder="ex.: 001-2026-AUTAZES ou 1" autocomplete="off"')}<div id="${p}numpapel-st" class="tf-status" aria-live="polite"></div>`
          : `<div class="tf-num">${st.rec ? `<b>${esc(st.rec.numeroTxt)}</b>` : '<small>Nº definido ao salvar (sequência dos cadastros de citros da unidade; sem internet, provisório).</small>'}</div>`}</div>
      ${resumoCadCiHTML(b, st.dados)}
      ${A ? pdfHTML(p) : `<div class="card"><h3>Assinaturas (opcional)</h3><p class="dica" style="text-align:left">O PDF sempre traz as linhas para assinar no papel.</p>${assHTML('servidor', 'Servidor da ADAF')}${assHTML('produtor', 'Produtor/proprietário')}</div>`}
      <button class="botao" type="submit" id="${p}salvar">💾 Salvar cadastro de citros</button>
      <button class="botao sec" type="button" data-mon="descartar">Descartar</button></form>`;
  }
  async function cadastroCitros(o, rec0, rasc, s) {
    let st;
    if (rasc) {
      const rec = rasc.id ? await Store.obter('cadastrosPce', rasc.id) : null;
      st = { tipo: 'cadastro', programa: 'citros', id: rasc.id, novo: !rec, rec, antigo: !!rasc.antigo, docs: rasc.docs || [], ass: rec ? lerJSON(rec.assinaturas, {}) : {}, assNovas: rasc.assNovas || {},
        propriedadeId: rasc.propriedadeId || '', levId: rasc.levId || '', deTermo: !!rasc.deTermo };
    } else if (rec0) st = { tipo: 'cadastro', programa: 'citros', id: rec0.id, novo: false, rec: rec0, antigo: Number(rec0.registroAntigo) === 1, docs: lerJSON(rec0.documentos, []), ass: lerJSON(rec0.assinaturas, {}), assNovas: {}, levId: '' };
    else st = { tipo: 'cadastro', programa: 'citros', id: Store.novoId(), novo: true, rec: null, antigo: !!o.antigo, docs: [], ass: {}, assNovas: {}, propriedadeId: o.propId || '', levId: o.levId || '', deTermo: !!o.deTermo };
    const lev = st.novo && st.levId ? await Store.obter('levantamentos', st.levId) : null;
    if (st.novo && (!lev || lev.excluido || !levEhCitros(lev))) { await Store.setMeta(RASC.cadastro, null); toast('O Cadastro de citros sai do levantamento com praga de citros: abra o levantamento e use “🍊 Cadastro de citros”.', true); return go('pce'); }
    if (st.novo) {
      const f = PCECitros.faltaDeteccao(lev.citros);
      if (f.length) { toast(`Abra o levantamento e marque Ausência ou Presença de sintomas de ${PCECitros.listaE(f)}.`, true); return go('pcelev', lev.id); }
      st.base = { doc: digitos(lev.doc), nome: lev.nome || '', propriedade: lev.propriedade || '', cnpj: digitos(lev.cnpj), data: lev.data || '', hora: lev.hora || '', municipio: lev.municipio || '',
        uf: lev.uf || 'AM', lat: lev.lat, lon: lev.lon, servidor: lev.servidor || '', cargo: lev.cargo || '', matricula: lev.matricula || '', lotacao: lev.lotacao || '' };
      st.dados = dadosCitrosDoLev(lev);
      st.propriedadeId = st.propriedadeId || propIdDe(st.base.doc, st.base.nome, st.base.propriedade, lev.endereco);
    } else {
      const r = st.rec; st.base = { doc: r.doc, nome: r.nome, propriedade: r.propriedade, cnpj: r.cnpj, data: r.data, hora: r.hora, municipio: r.municipio, uf: r.uf, lat: r.lat, lon: r.lon,
        servidor: r.servidor, cargo: r.cargo, matricula: r.matricula, lotacao: r.lotacao }; st.dados = lerJSON(r.dados, {});
    }
    const D = { unidade: (rasc && rasc.dados && rasc.dados.unidade) || (st.rec && st.rec.unidade) || st.base.lotacao || (s && s.lotacao) || '', numPapel: (rasc && rasc.dados && rasc.dados.numPapel) || '' };
    st.vivo = true; F = st;
    view(formCadCiHTML(D, st));
    mostrarNumPapel(PC, 'cadastro');
    if (st.antigo) await renderDocs(PC); else { await ligarAss('servidor'); await ligarAss('produtor'); }
    const f = $('#monCadForm');
    f.addEventListener('input', e => { if ([PC + 'numpapel', PC + 'unidade'].includes(e.target.id)) mostrarNumPapel(PC, 'cadastro'); agendar(); });
    f.addEventListener('change', e => { if (e.target.id === PC + 'pdfs') return adicionarPDFs(e.target, PC); if (e.target.id === PC + 'unidade') mostrarNumPapel(PC, 'cadastro'); agendar(); });
    f.onsubmit = ev => { ev.preventDefault(); salvarCadCitros(); };
  }
  async function salvarCadCitros() {
    const st = F; if (!st || !st.vivo || st.salvando || st.programa !== 'citros') return;
    const D = coletarCadCi(), A = st.antigo, b = st.base;
    let papel = null;
    if (!D.unidade) return toast('Escolha a unidade da numeração.', true);
    if (A && st.novo) { papel = lerNumeroDoc(D.numPapel, D.unidade, b.data); if (papel.erro) { mostrarNumPapel(PC, 'cadastro'); return toast(papel.erro, true); } }
    const btn = $('#mc-salvar'); btn.disabled = true; st.salvando = true;
    try {
      const { mapa, novos } = Anexos.prepararAssinaturas({ ...st, dono: 'cadastrosPce' });
      await Store.gravarVarios('arquivos', novos);
      const base = { ...(st.rec || {}) }; delete base.pendente; delete base.provisorio;
      const rec = { ...base, id: st.id, programa: 'citros', unidade: unid(D.unidade), propriedadeId: (st.rec && st.rec.propriedadeId) || st.propriedadeId, doc: b.doc, nome: b.nome,
        propriedade: b.propriedade, cnpj: b.cnpj, data: b.data, hora: b.hora, municipio: b.municipio, uf: b.uf || 'AM', lat: b.lat === '' || b.lat == null ? '' : b.lat,
        lon: b.lon === '' || b.lon == null ? '' : b.lon, servidor: b.servidor, cargo: b.cargo, matricula: b.matricula, lotacao: b.lotacao, local: base.local || b.municipio,
        dados: JSON.stringify(st.dados), totalPlantas: PCECitros.totalPlantas(st.dados), fotos: base.fotos || '[]', assinaturas: JSON.stringify(mapa), documentos: JSON.stringify(st.docs),
        registroAntigo: A ? 1 : 0, excluido: 0 };
      if (st.novo) { if (!(await numerarEGravar('cadastro', rec, null, null, papel))) return; }
      else await Store.salvar('cadastrosPce', rec);
      const antes = Anexos.idsArquivos(st.rec), depois = new Set([...st.docs, ...Object.values(mapa)]);
      await Anexos.apagarSeNaoEnviado([...antes].filter(x => !depois.has(x)));
      const levId = st.levId, deTermo = st.deTermo; fechar(); await Store.setMeta(RASC.cadastro, null);
      Sync.sincronizar();
      if (deTermo) { toast('Cadastro de citros salvo. Voltando ao Termo de Fiscalização.'); return go('pcetf', { retomar: true, cadastroId: rec.id }); }
      if (levId) { toast(`Cadastro de citros ${rec.numeroTxt || ''} salvo. Agora o Termo de Fiscalização da visita.`); return go('pcetf', { cadastroId: rec.id, levId, antigo: A }); }
      go('pcecadpronto', rec.id);
    } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
    finally { st.salvando = false; if (btn.isConnected) btn.disabled = false; }
  }

  /* ================= Termo de Fiscalização do PCE ================= */
  const PT = 'mt-';
  const tfVazio = (s, m = {}) => ({ unidade: m.unidade || (s && s.lotacao) || '', numPapel: '', sNome: m.sNome || '', sCargo: m.sCargo || '', sMatricula: m.sMatricula || '', sLotacao: m.sLotacao || '',
    nome: '', doc: '', atividade: '', empresa: '', cnpj: '', atividadeEmpresa: '', endereco: '', municipio: m.municipio || (s && s.lotacao) || '', uf: 'AM', telefone: '', lat: '', lon: '',
    pragas: ['Monilíase'], tipoLocal: [], data: m.data || '', hora: '', acoes: [], constatacao: '', enquadramento: '', t1nome: '', t1doc: '', t2nome: '', t2doc: '', recebidoEm: '',
    plantas: '', amostra: '', sintomas: '', localAcao: '' });
  const tfDeRegistro = r => { const tt = lerJSON(r.testemunhas, []);
    return { ...tfVazio(null), unidade: r.unidade || '', numPapel: r.numeroTxt || '', sNome: r.servidor || '', sCargo: r.cargo || '', sMatricula: r.matricula || '', sLotacao: r.lotacao || '',
      nome: r.nome || '', doc: PCEDocs.fmtDoc(r.doc), atividade: r.atividade || '', empresa: r.empresa || '', cnpj: PCEDocs.fmtDoc(r.cnpj), atividadeEmpresa: r.atividadeEmpresa || '',
      endereco: r.endereco || '', municipio: r.municipio || '', uf: r.uf || '', telefone: r.telefone || '',
      lat: r.lat === '' || r.lat == null ? '' : String(r.lat).replace('.', ','), lon: r.lon === '' || r.lon == null ? '' : String(r.lon).replace('.', ','),
      pragas: lerJSON(r.pragas, []), tipoLocal: lerJSON(r.tipoLocal, []), data: r.data || '', hora: r.hora || '', acoes: lerJSON(r.acoes, []), constatacao: r.constatacao || '',
      enquadramento: r.enquadramento || '', t1nome: (tt[0] || {}).nome || '', t1doc: (tt[0] || {}).doc || '', t2nome: (tt[1] || {}).nome || '', t2doc: (tt[1] || {}).doc || '',
      recebidoEm: r.recebidoEm || '', plantas: r.plantasInspecionadas === '' || r.plantasInspecionadas == null ? '' : String(r.plantasInspecionadas),
      amostra: r.amostra || '', sintomas: r.sintomas || '', localAcao: r.programa === 'citros' ? String(lerJSON(r.tipoLocal, [])[0] || '') : '' }; };
  function coletarTf() {
    const p = PT;
    return { unidade: g(p, 'unidade'), numPapel: g(p, 'numpapel'), sNome: g(p, 'snome'), sCargo: U().cargoValor(p + 'scargo'), sMatricula: g(p, 'smatricula'), sLotacao: g(p, 'slotacao'),
      nome: g(p, 'nome'), doc: g(p, 'doc'), atividade: g(p, 'atividade'), empresa: g(p, 'empresa'), cnpj: g(p, 'cnpj'), atividadeEmpresa: g(p, 'atividadeEmpresa'),
      endereco: g(p, 'endereco'), municipio: g(p, 'municipio'), uf: g(p, 'uf'), telefone: g(p, 'telefone'), lat: g(p, 'lat'), lon: g(p, 'lon'),
      pragas: cv(p, 'pragas'), tipoLocal: cv(p, 'tipoLocal'), data: g(p, 'data'), hora: g(p, 'hora'), acoes: cv(p, 'acoes'), constatacao: g(p, 'constatacao'),
      enquadramento: g(p, 'enquadramento'), t1nome: g(p, 't1nome'), t1doc: g(p, 't1doc'), t2nome: g(p, 't2nome'), t2doc: g(p, 't2doc'), recebidoEm: g(p, 'recebido'),
      plantas: g(p, 'plantas'), amostra: rv(p, 'amostra'), sintomas: rv(p, 'sintomas'), localAcao: g(p, 'localAcao') };
  }
  const lst = l => l.map(x => [x, x]);
  function cadLigadoHTML(st) {
    const c = st.cad;
    if (!c) return `<div class="tf-novo" id="mt-semcad">${st.propriedadeId ? 'Esta propriedade ainda não tem cadastro.' : 'Nenhum cadastro ligado.'}
      <button type="button" class="mini" data-mon="criarcad" id="mt-criarcad">${st.programa === 'citros' ? '🍊 Criar o cadastro de citros' : '➕ Criar cadastro desta propriedade'}</button></div>`;
    return `<div class="tf-ok" id="mt-cadinfo">📎 Cadastro <b>${esc(c.numeroTxt || '(sem nº)')}</b> — ${esc(c.nome || '')}${c.propriedade ? ' · ' + esc(c.propriedade) : ''} · ${esc(c.totalPlantas || 0)} planta(s)
      <button type="button" class="mini" data-mon="desligarcad">Trocar</button></div>`;
  }
  function formTfHTML(D, st) {
    const p = PT, A = st.antigo, CIT = st.programa === 'citros';
    return `<form id="monTfForm" class="${A ? 'pce-antigo' : ''}" autocomplete="off" novalidate>
      ${A ? topoPapel(st.novo ? 'Termo de Fiscalização (PCE) — digitar do papel' : 'Editar Termo de Fiscalização (do papel)', st.novo) + U().servAntigoHTML(p, D, st.lembrados)
        : `<div class="card mon-topo"><h3>📋 ${st.novo ? 'Termo de Fiscalização (PCE)' : 'Editar Termo de Fiscalização'}${CIT ? ' — 🍊 citros' : ''}</h3>
          <p class="dica" style="text-align:left">Não é o TF de Barreira. Servidor: <b>${esc(st.serv.servidor)}</b> · ${esc(st.serv.cargo)}</p></div>`}
      <div class="card"><h3>Nº do termo</h3>
        <label>Unidade (numeração) *<select id="${p}unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
        ${A && st.novo ? `${inp(p, 'numpapel', 'Nº do termo (como está no papel) *', D.numPapel, 'placeholder="ex.: 001.2026.AUTAZES ou 1" autocomplete="off"')}<div id="${p}numpapel-st" class="tf-status" aria-live="polite"></div>`
          : `<div class="tf-num">${st.rec ? `<b>${esc(st.rec.numeroTxt)}</b>` : '<small>Nº definido ao salvar (consulta a planilha; sem internet, provisório).</small>'}</div>`}</div>
      <div class="card"><h3>Cadastro da propriedade</h3>
        <div class="campo-busca"><label>Buscar cadastro (CPF, nome, propriedade ou nº do cadastro)<input id="${p}busca" type="search" autocomplete="off" placeholder="ex.: CPF, nome do produtor ou nº do cadastro"></label><div id="${p}busca-res"></div></div>
        <div id="${p}cad">${cadLigadoHTML(st)}</div></div>
      <div class="card"><h3>1 – Identificação</h3>
        ${inp(p, 'nome', 'Nome *', D.nome, 'autocapitalize="characters"')}
        <div class="duas">${inp(p, 'doc', A ? 'CPF (opcional no papel)' : 'CPF/CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}${inp(p, 'atividade', 'Atividade', D.atividade)}</div>
        <div id="${p}st-doc" class="tf-status"></div>
        <div class="duas">${inp(p, 'empresa', 'Empresa / Fantasia', D.empresa)}${inp(p, 'cnpj', 'CNPJ', D.cnpj, 'inputmode="numeric"')}</div>
        ${inp(p, 'atividadeEmpresa', 'Atividade (empresa)', D.atividadeEmpresa)}
        ${inp(p, 'endereco', 'Endereço', D.endereco)}
        <div class="duas mon-mun"><label>Município *<select id="${p}municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>${inp(p, 'uf', 'UF', D.uf, 'maxlength="2" autocapitalize="characters"')}</div>
        ${inp(p, 'telefone', 'Telefone', D.telefone, 'type="tel"')}
        <p class="mon-sub">Coordenadas geográficas</p>${coordHTML(p, D, !A)}</div>
      ${CIT ? `<div class="card" id="mt-desc-citros"><h3>2 – Descrição da ação</h3>
        <div hidden>${cks(p, 'pragas', lst(TC.pragas || []), D.pragas)}${cks(p, 'acoes', lst(TC.acoes || []), D.acoes)}</div>
        <div class="duas">${inp(p, 'data', 'Em (data) *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${inp(p, 'hora', 'às (hora) *', D.hora, 'type="time"')}</div>
        <label>ao realizar fiscalização no(a) * <small>(especificar o local)</small><input id="${p}localAcao" value="${esc(D.localAcao)}" maxlength="200" autocomplete="off"></label>
        <label>constatei <small>(descrever a situação constatada)</small><textarea id="${p}constatacao" rows="5">${esc(D.constatacao)}</textarea></label>
        <p class="dica" style="text-align:left">As frases de ausência/presença vêm do bloco “Cultura do citros” do levantamento. Pode acrescentar texto.</p>
        <button type="button" class="mini" data-mon="frasescitros" id="${p}frases">🍊 Refazer as frases de ausência/presença</button></div>`
      : `<div class="card"><h3>2 – Descrição da ação</h3>
        <p class="mon-sub">Praga(s)</p>${cks(p, 'pragas', lst(TC.pragas || []), D.pragas)}
        ${cks(p, 'tipoLocal', lst(TC.locais || []), D.tipoLocal)}
        <div class="duas">${inp(p, 'data', 'Em (data) *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${inp(p, 'hora', 'às (hora) *', D.hora, 'type="time"')}</div>
        <p class="mon-sub">ao realizar ações de *</p>${cks(p, 'acoes', lst(TC.acoes || []), D.acoes)}
        <label>Situação constatada<textarea id="${p}constatacao" rows="4">${esc(D.constatacao)}</textarea></label>
        <button type="button" class="mini" data-mon="negativa" id="${p}negativa">✍️ “${esc(TC.constatacaoNegativa || '')}”</button></div>`}
      <div class="card"><h3>3 – Enquadramento legal</h3><label><textarea id="${p}enquadramento" rows="3" aria-label="Enquadramento legal" placeholder="citar leis, decretos, resoluções, portarias, instruções normativas, artigos, incisos e alíneas">${esc(D.enquadramento)}</textarea></label></div>
      <div class="card"><h3>4 – Testemunhas</h3><p class="dica" style="text-align:left">Só quando o autuado se nega a assinar ou está ausente.</p>
        <div class="duas">${inp(p, 't1nome', 'Testemunha 1 – nome', D.t1nome)}${inp(p, 't1doc', 'CPF/RG', D.t1doc)}</div>
        <div class="duas">${inp(p, 't2nome', 'Testemunha 2 – nome', D.t2nome)}${inp(p, 't2doc', 'CPF/RG', D.t2doc)}</div>
        ${inp(p, 'recebido', 'Recebi a 2ª via deste Termo em (data, hora e local)', D.recebidoEm)}</div>
      <div class="card mon-extras"><h3>📊 Para o relatório de atividades</h3><p class="dica" style="text-align:left">Não aparece no papel. Plantas: total do cadastro (pode editar).</p>
        ${inp(p, 'plantas', 'Plantas inspecionadas', D.plantas, 'inputmode="numeric" autocomplete="off"')}
        ${sn(p, 'amostra', 'Amostra coletada?', D.amostra)}${sn(p, 'sintomas', 'Presença de sintomas?', D.sintomas)}</div>
      ${A ? pdfHTML(p) : `<div class="card"><h3>Assinaturas (opcional)</h3>${assHTML('produtor', 'Interessado (recebi a 2ª via)')}${assHTML('servidor', 'Servidor da ADAF')}
        ${assHTML('testemunha1', 'Testemunha 1')}${assHTML('testemunha2', 'Testemunha 2')}</div>`}
      <button class="botao" type="submit" id="${p}salvar">💾 Salvar termo</button>
      ${A && st.novo ? `<button class="botao" type="button" data-mon="salvaroutro" id="${p}salvar-outro">💾 Salvar e digitar outro</button>` : ''}
      <button class="botao sec" type="button" data-mon="descartar">Descartar</button></form>`;
  }
  async function cadastrosLocais() { return (await Store.todos('cadastrosPce')).filter(c => !Number(c.excluido)); }
  async function buscarCadastro() {
    const q = g(PT, 'busca').trim(), out = $('#' + PT + 'busca-res'); if (!out) return;
    if (q.length < 2) { out.replaceChildren(); return; }
    const t = norm(q), d = digitos(q), pal = t.split(' ').filter(Boolean);
    const r = (await cadastrosLocais()).filter(c => { const txt = norm([c.nome, c.propriedade, c.numeroTxt, c.municipio].join(' '));
      return pal.every(w => txt.includes(w)) || (d.length >= 3 && (digitos(c.doc).includes(d) || digitos(c.numeroTxt).includes(d))); }).slice(0, 12);
    if (g(PT, 'busca').trim() !== q || !F) return;
    F.buscaCad = r;
    out.innerHTML = r.length ? `<ul class="campo-res">${r.map((c, i) => `<li><button type="button" class="campo-res-item" data-mon="usarcad" data-i="${i}"><b>${esc(c.nome)}</b>
      <small>${esc(['Cadastro ' + (c.numeroTxt || ''), c.propriedade, c.municipio, PCEDocs.fmtDoc(c.doc), (c.totalPlantas || 0) + ' planta(s)'].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>`
      : '<div class="tf-novo">Nenhum cadastro encontrado neste aparelho. Use “Criar cadastro desta propriedade”.</div>';
  }
  const hospDe = c => { const pl = lerJSON(c && c.dados, {}).plantas || {}; return HOSP.filter(([k]) => Number(pl[k]) > 0).map(h => h[1]); };
  /** Liga o cadastro ao termo e preenche produtor, endereço, município, coordenadas e plantas (só o que está vazio, exceto as plantas). */
  function ligarCadastro(c, sobrescrever) {
    if (!F || !c) return;
    F.cad = c; F.cadastroId = c.id; F.propriedadeId = c.propriedadeId || F.propriedadeId; F.hospedeiros = hospDe(c);
    const d = lerJSON(c.dados, {}), set = (id, v, forca) => { const el = $('#' + PT + id); if (el && v != null && v !== '' && (forca || sobrescrever || !el.value.trim())) el.value = v; };
    set('nome', c.nome); set('doc', PCEDocs.fmtDoc(c.doc)); set('endereco', d.endereco); set('uf', c.uf); set('cnpj', PCEDocs.fmtDoc(c.cnpj));
    const mun = $('#' + PT + 'municipio'); if (mun && c.municipio && (sobrescrever || !mun.value)) { if (![...mun.options].some(o => o.value === c.municipio)) mun.add(new Option(c.municipio, c.municipio)); mun.value = c.municipio; }
    if (c.lat !== '' && c.lat != null) { set('lat', String(c.lat).replace('.', ',')); set('lon', String(c.lon).replace('.', ',')); }
    set('plantas', String(c.totalPlantas || PCEDocs.totalPlantas(d) || ''), true);
    $('#' + PT + 'cad').innerHTML = cadLigadoHTML(F);
    const r = $('#' + PT + 'busca-res'), b = $('#' + PT + 'busca'); if (r) r.replaceChildren(); if (b) b.value = '';
    mostrarCoord(PT); avisoDoc(PT); agendar(0);
  }

  /** Pragas do levantamento (nomes da lista do levantamento) → nomes do quadro do Termo (config PCE.termo.pragaDoLevantamento). */
  function pragasDoLevantamento(lev) {
    const mapa = TC.pragaDoLevantamento || {}, quadro = TC.pragas || [], n = x => semAcento(String(x || '')).toLowerCase();
    const out = [];
    Docs.pceGrupos(lev).pragas.forEach(g => {
      const nome = String(g.praga || '').trim(); if (!nome) return;
      const alvo = mapa[nome] || quadro.find(q => n(q) === n(nome)) || '';
      if (alvo && !out.includes(alvo)) out.push(alvo);
    });
    return out;
  }
  /** De onde vêm os dados do Termo de citros: o levantamento da visita (se está no aparelho) ou a cópia guardada no Cadastro de citros. */
  async function fonteCitros(st, lev, cad) {
    cad = cad || (st.cadastroId ? await Store.obter('cadastrosPce', st.cadastroId) : null);
    const dc = cad && cad.programa === 'citros' ? lerJSON(cad.dados, {}) : null;
    lev = lev || (st.levId ? await Store.obter('levantamentos', st.levId) : null) || (dc && dc.levantamentoId ? await Store.obter('levantamentos', dc.levantamentoId) : null);
    if (lev && !lev.excluido && levEhCitros(lev)) return { citros: lev.citros, culturas: culturasCitrosDoLev(lev), lev, cad };
    return dc ? { citros: dc, culturas: dc.culturasAvaliadas || [], lev: null, cad } : null;
  }
  /** Termo de citros novo: identificação, data e hora da visita, local, frases de ausência/presença, enquadramento padrão e números do relatório. */
  function preencherTfCitros(D, fo) {
    const L0 = fo.lev || {}, c = fo.cad || {}, dc = fo.cad ? lerJSON(fo.cad.dados, {}) : {};
    const v = (a, b) => (a !== '' && a != null ? a : b), coord = x => (x === '' || x == null ? '' : String(x).replace('.', ','));
    const G = fo.lev ? Docs.pceGrupos(fo.lev).pragas.filter(x => PCECitros.ehCitros(x.praga)) : [];
    Object.assign(D, { nome: v(L0.nome, c.nome) || '', doc: PCEDocs.fmtDoc(v(L0.doc, c.doc)), empresa: v(L0.empresa, dc.empresa) || '', cnpj: PCEDocs.fmtDoc(v(L0.cnpj, c.cnpj)),
      endereco: v(L0.endereco, dc.endereco) || '', municipio: v(L0.municipio, c.municipio) || D.municipio, uf: v(L0.uf, c.uf) || 'AM', telefone: v(L0.telefone, dc.telefone) || '',
      lat: coord(v(L0.lat, c.lat)), lon: coord(v(L0.lon, c.lon)), data: v(L0.data, c.data) || D.data, hora: String(v(L0.hora, c.hora) || D.hora || '').slice(0, 5),
      atividade: PCECitros.atividadesTexto(fo.citros),
      localAcao: fo.lev ? localDoLev(fo.lev) : [c.propriedade ? 'Propriedade ' + c.propriedade : '', dc.endereco, c.municipio ? `${c.municipio}/${c.uf || 'AM'}` : ''].filter(Boolean).join(', '),
      constatacao: PCECitros.frases(fo.citros, fo.culturas).join('\n'), enquadramento: CI.enquadramento || '',
      pragas: [...new Set([...(CI.deteccao || []).map(x => x[1]), ...(fo.lev ? pragasDoLevantamento(fo.lev) : [])])], acoes: ['Fiscalização'],
      plantas: String(PCECitros.totalPlantas(fo.citros) || ''), sintomas: PCECitros.temPresenca(fo.citros) ? 'sim' : 'nao',
      amostra: fo.lev ? (G.some(x => x.culturas.some(k => k.coleta === 'Sim')) ? 'sim' : 'nao') : (dc.amostra || '') });
  }
  /**
   * Identificação do Termo a partir do levantamento da visita (monilíase; o de citros usa preencherTfCitros): nome, CPF, empresa, CNPJ,
   * endereço, município, UF, telefone e coordenadas; atividade = culturas avaliadas (ex.: "Cultivo de cacau e cupuaçu"), também para a
   * empresa quando há CNPJ/empresa. Só preenche o que veio do levantamento; o cadastro ligado depois completa o resto.
   */
  function identDoLev(lev, D) {
    const coord = x => (x === '' || x == null ? '' : String(x).replace('.', ','));
    const cult = [...new Set(Docs.pceGrupos(lev).pragas.flatMap(g => g.culturas.map(c => String(c.cultura || '').trim().toLowerCase())).filter(Boolean))];
    const ativ = cult.length ? 'Cultivo de ' + PCEDocs.listaE(cult) : '';
    const temEmpresa = !!(lev.empresa || digitos(lev.cnpj).length === 14 || digitos(lev.doc).length === 14);
    const o = { nome: lev.nome || '', doc: PCEDocs.fmtDoc(lev.doc || ''), empresa: lev.empresa || '', cnpj: PCEDocs.fmtDoc(lev.cnpj || ''), endereco: lev.endereco || '',
      municipio: lev.municipio || D.municipio, uf: lev.uf || 'AM', telefone: lev.telefone || '', lat: coord(lev.lat), lon: coord(lev.lon),
      atividade: ativ, atividadeEmpresa: temEmpresa ? ativ : '' };
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
  }
  /** Botão "Refazer as frases": troca as linhas de ausência/presença da descrição (o texto acrescentado pelo fiscal continua). */
  async function refazerFrases() {
    const fo = await fonteCitros(F); if (!fo) return toast('Levantamento/cadastro de citros não encontrado neste aparelho.', true);
    const el = $('#' + PT + 'constatacao'), resto = el.value.split('\n').filter(l => !/^\s*(Ausência|Presença) de sintomas de /i.test(l)).join('\n').trim();
    el.value = [...PCECitros.frases(fo.citros, fo.culturas), resto].filter(Boolean).join('\n'); agendar(0);
  }
  async function termoForm(arg) {
    if (bloqueado()) return view(avisoAtivacao());
    const id = typeof arg === 'string' ? arg : '', o = arg && typeof arg === 'object' ? arg : {};
    const rec0 = id ? await Store.obter('termosPce', id) : null, s0 = await U().servidorAtual();
    const querAntigo = !!(o.antigo || (rec0 && Number(rec0.registroAntigo) === 1) || (!id && !o.retomar && U().soDigitador(s0) && U().podeAntigo()));
    if (querAntigo && !U().podeAntigo()) { toast(U().SEM_ANTIGO, true); return go('pcetfs'); }
    const s = await U().exigirServidor('pcetf', arg, querAntigo || (o.retomar && U().soDigitador(s0))); if (!s) return;
    fechar();
    if (id && (!rec0 || rec0.excluido)) { toast('Termo não encontrado.', true); return go('pcetfs'); }
    const t = await tratarRascunho('termo', id, !!o.retomar); if (!t) return go('pcetfs');
    let st, D;
    if (t.rasc) {
      const r = t.rasc, rec = r.id ? await Store.obter('termosPce', r.id) : null;
      st = { tipo: 'termo', id: r.id, novo: !rec, rec, antigo: !!r.antigo, docs: r.docs || [], ass: rec ? lerJSON(rec.assinaturas, {}) : {}, assNovas: r.assNovas || {},
        cadastroId: r.cadastroId || '', propriedadeId: r.propriedadeId || '', hospedeiros: r.hospedeiros || [], levId: r.levId || '', programa: r.programa || (rec && rec.programa) || '' };
      D = { ...tfVazio(s), ...r.dados };
    } else if (rec0) {
      st = { tipo: 'termo', id: rec0.id, novo: false, rec: rec0, antigo: Number(rec0.registroAntigo) === 1, docs: lerJSON(rec0.documentos, []), ass: lerJSON(rec0.assinaturas, {}), assNovas: {},
        cadastroId: rec0.cadastroId || '', propriedadeId: rec0.propriedadeId || '', hospedeiros: lerJSON(rec0.hospedeiros, []), programa: rec0.programa || '' };
      D = tfDeRegistro(rec0);
    } else {
      st = { tipo: 'termo', id: Store.novoId(), novo: true, rec: null, antigo: querAntigo, docs: [], ass: {}, assNovas: {}, cadastroId: '', propriedadeId: o.propId || '', hospedeiros: [], levId: '' };
      D = tfVazio(querAntigo ? null : s, o.manter || {});
      if (!querAntigo) Object.assign(D, { data: hojeISO(), hora: agoraHM(), acoes: ['Fiscalização'] });
      const lev = o.levId ? await Store.obter('levantamentos', o.levId) : null;   // Termo da visita: pragas do levantamento já marcadas
      if (lev) {
        st.levId = lev.id; D.pragas = pragasDoLevantamento(lev);
        if (querAntigo) Object.assign(D, { data: lev.data || D.data, hora: lev.hora || D.hora });
        Object.assign(D, identDoLev(lev, D));                                     // identificação do produtor já digitada no levantamento
      }
      // Termo de citros (levantamento com praga de citros ou cadastro de citros): identificação, data/hora, local, frases e enquadramento já preenchidos
      const cad0 = o.cadastroId ? await Store.obter('cadastrosPce', o.cadastroId) : null;
      if ((cad0 && cad0.programa === 'citros') || levEhCitros(lev)) {
        st.programa = 'citros';
        const fo = await fonteCitros(st, lev, cad0);
        if (fo) { if (!st.levId && fo.lev) st.levId = fo.lev.id; preencherTfCitros(D, fo); }
      }
    }
    st.cad = st.cadastroId ? await Store.obter('cadastrosPce', st.cadastroId) : null;
    st.vivo = true; st.serv = st.rec && !st.antigo ? { servidor: st.rec.servidor, cargo: st.rec.cargo, matricula: st.rec.matricula, lotacao: st.rec.lotacao } : U().dadosServidor(s);
    if (st.antigo) st.lembrados = await U().servidoresLembrados();
    F = st;
    view(formTfHTML(D, st));
    // vindo do cadastro recém-criado, do mapa ("Termo aqui") ou de um cadastro da lista
    const cadId = o.cadastroId || '';
    if (cadId) { const c = await Store.obter('cadastrosPce', cadId); if (c) ligarCadastro(c, true); }
    else if (o.propId && st.novo && !t.rasc && st.programa === 'citros') {          // Termo de citros sem cadastro: liga o cadastro de citros da propriedade, se houver
      st.propriedadeId = o.propId;
      const c = (await cadastrosLocais()).find(x => x.propriedadeId === o.propId && x.programa === 'citros');
      if (c) ligarCadastro(c, true); else $('#' + PT + 'cad').innerHTML = cadLigadoHTML(st);
    }
    else if (o.propId && st.novo && !t.rasc) {
      const pd = await dadosDaPropriedade(o.propId), c = (await cadastrosLocais()).find(x => x.propriedadeId === o.propId && (x.programa || 'moniliase') === 'moniliase');
      st.propriedadeId = o.propId;
      const set = (k, v) => { const el = $('#' + PT + k); if (el && v) el.value = v; };
      set('nome', pd.nome); set('doc', pd.doc); set('endereco', pd.endereco); set('telefone', pd.telefone); set('lat', pd.lat); set('lon', pd.lon);
      if (pd.municipio) { const m = $('#' + PT + 'municipio'); if (![...m.options].some(x => x.value === pd.municipio)) m.add(new Option(pd.municipio, pd.municipio)); m.value = pd.municipio; }
      if (c) ligarCadastro(c, true); else $('#' + PT + 'cad').innerHTML = cadLigadoHTML(st);
    }
    mostrarCoord(PT); mostrarNumPapel(PT, 'termo'); avisoDoc(PT);
    if (st.antigo) await renderDocs(PT); else for (const pp of ['produtor', 'servidor', 'testemunha1', 'testemunha2']) await ligarAss(pp);
    const f = $('#monTfForm');
    f.addEventListener('input', e => {
      const tid = e.target.id;
      if (tid === PT + 'busca') { clearTimeout(tR); return buscarCadastro(); }
      if (tid === PT + 'lat' || tid === PT + 'lon') mostrarCoord(PT);
      if ([PT + 'numpapel', PT + 'unidade', PT + 'data'].includes(tid)) mostrarNumPapel(PT, 'termo');
      agendar();
    });
    f.addEventListener('change', async e => {
      const el = e.target;
      if (el.id === PT + 'pdfs') return adicionarPDFs(el, PT);
      if (el.id === PT + 'snome') await U().completarServidor(PT);
      if (el.id === PT + 'doc' || el.id === PT + 'cnpj') { el.value = PCEDocs.fmtDoc(digitos(el.value)) || el.value; avisoDoc(PT); }
      if ([PT + 'numpapel', PT + 'unidade', PT + 'data'].includes(el.id)) mostrarNumPapel(PT, 'termo');
      agendar();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarTf(false); };
    const p1 = $(st.antigo ? (D.sNome ? '#mt-numpapel' : '#mt-snome') : '#mt-busca'); if (p1 && st.novo && !cadId) p1.focus();
  }

  async function salvarTf(outro) {
    const st = F; if (!st || !st.vivo || st.salvando || st.tipo !== 'termo') return;
    const D = coletarTf(), A = st.antigo, doc = digitos(D.doc);
    let sv = null, papel = null;
    if (A && !(sv = U().servidorDigitado(PT))) return;
    if (!D.unidade) return toast('Escolha a unidade da numeração.', true);
    if (!D.nome.trim()) return toast('Informe o nome do interessado.', true);
    if (!docConfere(doc, A)) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    const co = lerPar(D.lat, D.lon); if (co.erro) return toast('Coordenadas: ' + co.erro, true);
    const CIT = st.programa === 'citros';
    if (!D.pragas.length) return toast('Marque a praga (ex.: Monilíase).', true);
    if (CIT && !D.localAcao.trim()) { toast('Informe o local da fiscalização (“ao realizar fiscalização no(a)…”).', true); return $('#' + PT + 'localAcao').focus(); }
    if (CIT && !D.constatacao.trim()) { toast('Descreva a situação constatada (frases de ausência/presença de HLB, Ácaro Hindustânico e Cancro Cítrico).', true); return $('#' + PT + 'constatacao').focus(); }
    if (!D.acoes.length) return toast('Marque a ação realizada (ex.: Fiscalização).', true);
    if (A ? !U().dataHoraPassadaOk(D) : !/^\d{4}-\d{2}-\d{2}$/.test(D.data) || !/^\d{2}:\d{2}/.test(D.hora)) { if (!A) toast('Informe a data e a hora.', true); return; }
    if (A && st.novo) { papel = lerNumeroDoc(D.numPapel, D.unidade, D.data); if (papel.erro) { mostrarNumPapel(PT, 'termo'); return toast(papel.erro, true); } }
    const btns = [$('#mt-salvar'), $('#mt-salvar-outro')].filter(Boolean); btns.forEach(b => { b.disabled = true; }); st.salvando = true;
    try {
      const nome = D.nome.trim().replace(/\s+/g, ' ').toUpperCase();
      const { mapa, novos } = Anexos.prepararAssinaturas({ ...st, dono: 'termosPce' });
      await Store.gravarVarios('arquivos', novos);
      const c = st.cad, propriedadeId = (c && c.propriedadeId) || st.propriedadeId || propIdDe(doc, nome, '', D.endereco);
      const base = { ...(st.rec || {}) }; delete base.pendente; delete base.provisorio;
      const plantas = inteiro(D.plantas);
      const rec = { ...base, id: st.id, unidade: unid(D.unidade), propriedadeId, cadastroId: (c && c.id) || '', programa: CIT ? 'citros' : 'moniliase', doc, nome, atividade: D.atividade.trim(),
        empresa: D.empresa.trim(), cnpj: digitos(D.cnpj), atividadeEmpresa: D.atividadeEmpresa.trim(), endereco: D.endereco.trim(), municipio: D.municipio,
        uf: (D.uf || '').trim().toUpperCase(), telefone: D.telefone.trim(), lat: co.vazio ? '' : co.lat, lon: co.vazio ? '' : co.lon, data: D.data, hora: D.hora.slice(0, 5),
        ...(sv || st.serv), pragas: JSON.stringify(D.pragas), tipoLocal: JSON.stringify(CIT ? [D.localAcao.trim().replace(/\s+/g, ' ').slice(0, 200)] : D.tipoLocal),   // citros: o local especificado
        acoes: JSON.stringify(D.acoes), constatacao: D.constatacao.trim(),
        enquadramento: D.enquadramento.trim(), testemunhas: JSON.stringify([{ nome: D.t1nome.trim(), doc: D.t1doc.trim() }, { nome: D.t2nome.trim(), doc: D.t2doc.trim() }].filter(x => x.nome || x.doc)),
        recebidoEm: D.recebidoEm.trim(), plantasInspecionadas: plantas === '' ? 0 : plantas, amostra: D.amostra, sintomas: D.sintomas,
        hospedeiros: JSON.stringify(st.hospedeiros || []), fotos: base.fotos || '[]', assinaturas: JSON.stringify(mapa), documentos: JSON.stringify(st.docs),
        registroAntigo: A ? 1 : 0, cancelado: Number(base.cancelado) || 0, motivoCancel: base.motivoCancel || '', excluido: 0 };
      const pessoa = await montarPessoa(doc, { nome, endereco: rec.endereco, municipio: D.municipio, uf: rec.uf, telefone: rec.telefone });
      const prop = c ? null : await montarProp(propriedadeId, { doc, municipio: D.municipio, lat: rec.lat, lon: rec.lon, endereco: rec.endereco, uf: rec.uf, cnpj: rec.cnpj, empresa: rec.empresa });
      if (st.novo) {
        if (!(await numerarEGravar('termo', rec, pessoa, prop, papel))) return;
      } else {
        await Store.salvar('termosPce', rec);
        if (pessoa) await Store.salvar('pessoas', pessoa);
        if (prop) await Store.salvar('propriedades', prop);
      }
      if (sv) await U().lembrarServidor(sv);
      const antes = Anexos.idsArquivos(st.rec), depois = new Set([...st.docs, ...Object.values(mapa)]);
      await Anexos.apagarSeNaoEnviado([...antes].filter(x => !depois.has(x)));
      fechar(); await Store.setMeta(RASC.termo, null);
      Sync.sincronizar();
      if (outro) { toast(`Termo ${rec.numeroTxt || ''} salvo. Digite o próximo.`); return go('pcetf', { antigo: true, manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data } }); }
      go('pcetfpronto', rec.id);
    } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
    finally { st.salvando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }

  /* ================= telas de "salvo" e listas ================= */
  const situacao = r => [Number(r.cancelado) === 1 ? `<div class="info pend">⛔ CANCELADO${r.motivoCancel ? ': ' + esc(r.motivoCancel) : ''}</div>` : '',
    Number(r.conflito) === 1 ? '<div class="info pend">⚠️ Número repetido na planilha: confira com a coordenação.</div>' : '',
    r.pendente ? `<div class="info pend">⏳ ${r.provisorio ? 'número provisório, conferido ao sincronizar' : 'aguardando envio'}</div>` : ''].join('');
  async function pronto(tipo, id) {
    const r = await Store.obter(STORE[tipo], id); if (!r) return go(tipo === 'termo' ? 'pcetfs' : 'pcecads');
    const papel = Number(r.registroAntigo) === 1 && U().podeAntigo();
    view(`<div class="card" id="mon-pronto"><h3>✅ ${esc(NOME[tipo])} salvo</h3><div class="tf-num"><b id="mon-pronto-num">${esc(r.numeroTxt || '')}</b></div>
      <p><b>${esc(r.nome)}</b>${r.propriedade ? ' · ' + esc(r.propriedade) : ''}</p><p>${esc(dBR(r.data))} ${esc(r.hora || '')} · ${esc(r.municipio)}</p>
      ${r.pendente ? '<div class="tf-novo">⏳ Aguardando envio / número provisório: conferido na planilha ao sincronizar.</div>' : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}
      ${r.numeroOrigem === 'papel' ? '<p class="dica">Número do papel.</p>' : ''}${situacao({ ...r, pendente: 0 })}</div>
      <button class="botao" data-mon="imprimir" data-tipo="${tipo}" data-id="${esc(r.id)}" id="mon-imprimir">🖨️ Imprimir / PDF</button>
      ${tipo === 'termo' ? `<button class="botao sec" data-mon="enviar" data-id="${esc(r.id)}" id="mon-enviar">📤 Enviar ao produtor (WhatsApp, e-mail…)</button>`
        : `<button class="botao sec" data-mon="termodocad" data-id="${esc(r.id)}" id="mon-termodocad">📋 Termo de Fiscalização desta propriedade</button>`}
      ${papel ? `<button class="botao sec" data-mon="novo" data-tipo="${tipo}" data-antigo="1">📄 Digitar outro do papel</button>` : `<button class="botao sec" data-mon="novo" data-tipo="${tipo}">➕ Novo</button>`}
      <button class="botao sec" data-v="${tipo === 'termo' ? 'pcetfs' : 'pcecads'}">📋 Ver lista</button>`);
  }
  async function lista(tipo) {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await U().exigirServidor(tipo === 'termo' ? 'pcetfs' : 'pcecads', null, true); if (!s || !mostrar.viva()) return;
    fechar();
    const podeAnt = U().podeAntigo(), dig = U().soDigitador(s) && podeAnt;
    const todos = (await Store.todos(STORE[tipo])).filter(x => !Number(x.excluido))
      .sort((a, b) => (Number(b.ano) - Number(a.ano)) || (Number(b.numero) - Number(a.numero)) || (b.criadoEm || 0) - (a.criadoEm || 0));
    if (!mostrar.viva()) return;
    const T = tipo === 'termo';
    mostrar(`<div class="card"><h3>${T ? '📋 Termos de Fiscalização (PCE)' : '🏡 Cadastros de propriedades'}</h3>
        <p class="dica" style="text-align:left">${T ? 'Um termo por visita; ligado ao cadastro da propriedade. Não é o TF de Barreira.' : 'Um cadastro por propriedade e programa: monilíase (cacau, cupuaçu…) aqui; citros (🍊) a partir do levantamento com praga de citros.'}</p></div>
      ${dig ? '' : `<button class="botao" data-mon="novo" data-tipo="${tipo}" id="mon-novo">➕ ${T ? 'Novo termo' : 'Novo cadastro'}</button>`}
      ${podeAnt ? `<button class="botao ${dig ? '' : 'sec'}" data-mon="novo" data-tipo="${tipo}" data-antigo="1" id="mon-novo-papel">📄 Digitar do papel</button>` : ''}
      ${T ? '<button class="botao sec" data-v="pcerel" id="mon-ir-rel">📊 Relatório de atividades</button>' : ''}
      <div class="card"><label>Pesquisar (nº, nome, CPF, propriedade, município)<input id="monQ"></label></div><div id="monItens"></div>`);
    const desenhar = () => {
      const q = norm($('#monQ').value), qd = digitos($('#monQ').value);
      const v = todos.filter(x => !q || norm([x.numeroTxt, x.nome, x.propriedade, x.municipio].join(' ')).includes(q) || (qd.length >= 3 && digitos(x.doc).includes(qd)));
      $('#monItens').innerHTML = v.length ? v.map(x => `<div class="item mon-item" data-reg="${esc(x.id)}"><div class="topo"><div><div class="placa">${esc(x.numeroTxt || '(sem nº)')}</div>
          <div class="tipo">${x.programa === 'citros' ? '<span class="mon-prog">🍊 Citros</span> ' : ''}${esc(x.nome)}${x.propriedade ? ' · ' + esc(x.propriedade) : ''}</div></div><div class="hora">${esc(dBR(x.data))}<br>${esc(x.hora || '')}</div></div>
        <div class="info">${esc(x.municipio)} · ${T ? `${esc(x.plantasInspecionadas || 0)} planta(s)${x.cadastroId ? ' · 📎 cadastro' : ''}` : `${esc(x.totalPlantas || 0)} planta(s)`}</div>
        ${situacao(x)}
        <div class="botoes">${Number(x.registroAntigo) === 1 && !podeAnt ? '' : `<button class="editar" data-mon="abrir" data-tipo="${tipo}" data-id="${esc(x.id)}">Abrir</button>`}
          <button class="editar" data-mon="imprimir" data-tipo="${tipo}" data-id="${esc(x.id)}">PDF</button>
          ${T ? `<button class="tfbtn" data-mon="enviar" data-id="${esc(x.id)}">Enviar</button>${Number(x.cancelado) === 1 ? '' : `<button class="excluir" data-mon="cancelar" data-id="${esc(x.id)}">Cancelar</button>`}`
            : `<button class="tfbtn" data-mon="termodocad" data-id="${esc(x.id)}">Termo</button><button class="excluir" data-mon="excluircad" data-id="${esc(x.id)}">Excluir</button>`}</div></div>`).join('')
        : `<div class="vazio">Nenhum ${T ? 'termo' : 'cadastro'} neste aparelho.</div>`;
    };
    desenhar(); $('#monQ').oninput = desenhar;
  }

  /* ================= impressão, PDF e envio ao produtor ================= */
  /**
   * Citros: o PDF sai como os modelos de papel — Cadastro de citros + o Termo de Fiscalização da visita (imprimindo o termo, o cadastro ligado vem
   * antes; imprimindo o cadastro, os termos ligados do mesmo dia vêm depois). modo 'arquivo' (enviar ao produtor): só o documento escolhido.
   */
  async function imprimir(tipo, id, modo) {
    const r = await Store.obter(STORE[tipo], id); if (!r) throw new Error('Registro não encontrado.');
    const arquivos = await Anexos.arquivosPorId(r);
    if (r.programa !== 'citros') return Docs.pceMon(tipo, r, { arquivos }, modo);
    const extras = [];
    if (modo !== 'arquivo') {
      const outros = tipo === 'termo' ? [r.cadastroId ? await Store.obter('cadastrosPce', r.cadastroId) : null].filter(c => c && !Number(c.excluido) && c.programa === 'citros')
        : (await Store.todos('termosPce')).filter(t => t.cadastroId === r.id && !Number(t.excluido) && !Number(t.cancelado) && t.data === r.data)
          .sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.numero) - Number(b.numero)));
      for (const x of outros) extras.push({ tipo: tipo === 'termo' ? 'cadastroCitros' : 'termoCitros', dados: x, arquivos: await Anexos.arquivosPorId(x), antes: tipo === 'termo' });
    }
    return Docs.pceMon(tipo === 'termo' ? 'termoCitros' : 'cadastroCitros', r, { arquivos, extras }, modo);
  }
  async function enviar(id) {
    const r = await Store.obter('termosPce', id); if (!r) throw new Error('Termo não encontrado.');
    const m = modal(`<h3>📤 Enviar ao produtor</h3><p class="dica">${esc(r.nome)}${r.telefone ? ' · ☎ ' + esc(r.telefone) : ''}</p><p><b>Termo de Fiscalização ${esc(r.numeroTxt || '')}</b></p>
      <div id="mon-env-st" class="tf-status"></div><button class="botao" type="button" id="mon-env-gerar">📄 Gerar PDF</button><button class="botao sec" type="button" id="mon-env-fechar">Fechar</button>`);
    m.id = 'mon-modal-enviar';
    m.querySelector('#mon-env-fechar').onclick = () => m.remove();
    m.querySelector('#mon-env-gerar').onclick = async ev => {
      const btn = ev.currentTarget, st = m.querySelector('#mon-env-st'); btn.disabled = true; st.innerHTML = '<small>Gerando PDF…</small>';
      let file;
      try { file = await imprimir('termo', id, 'arquivo'); }
      catch (e) { btn.disabled = false; st.innerHTML = `<div class="tf-alerta">⚠️ Não foi possível gerar o PDF: ${esc(e.message || e)}. Use “Imprimir” → “Salvar como PDF”.</div>`; return; }
      if (!m.isConnected) return;
      st.innerHTML = `<div class="tf-ok">✓ PDF pronto: ${esc(file.name)} (${Math.max(1, Math.round(file.size / 1024)).toLocaleString('pt-BR')} KB)</div>`; btn.remove();
      const fim = m.querySelector('#mon-env-fechar'), add = html => { fim.insertAdjacentHTML('beforebegin', html); return fim.previousElementSibling; };
      const titulo = 'Termo de Fiscalização — ADAF', texto = `${titulo}: ${r.nome || ''}, ${dBR(r.data)}. Documento gerado pelo e-GDV.`;
      if (PDF.podeCompartilhar([file])) {
        add('<button class="botao" type="button" id="mon-env-share">📤 Compartilhar</button>').onclick = async () => { try { if (await PDF.compartilhar([file], titulo, texto)) toast('Enviado para o compartilhamento.'); } catch (e) { toast(e.message, true); } };
      } else add('<p class="dica">Este aparelho não compartilha arquivos direto do app: toque em “Baixar” e anexe o PDF no WhatsApp (📎 → Documento).</p>');
      add('<button class="botao sec" type="button" id="mon-env-baixar">⬇️ Baixar PDF</button>').onclick = () => PDF.baixar(file);
    };
  }

  /* ================= Relatório de atividades ================= */
  const REL_META = 'pceRelatorio';
  function filtroPadrao() { const h = hojeISO(); return { de: h.slice(0, 8) + '01', ate: h }; }
  async function relatorio() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await U().exigirServidor('pcerel', null, true); if (!s || !mostrar.viva()) return;
    fechar();
    const m = (await Store.meta(REL_META)) || {}, termos = (await Store.todos('termosPce')).filter(t => !Number(t.excluido));
    const servs = [...new Set(termos.map(t => String(t.servidor || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const fp = filtroPadrao(), pr = TC.pragas || [];
    if (!mostrar.viva()) return;
    mostrar(`<form id="monRelForm" class="card" autocomplete="off"><h3>📊 Relatório de atividades</h3>
      <p class="dica" style="text-align:left">Prestação de contas do convênio, a partir dos Termos de Fiscalização (PCE) deste aparelho. Os números são calculados; os textos podem ser editados.</p>
      <div class="duas"><label>De<input id="mr-de" type="date" value="${esc(m.de || fp.de)}"></label><label>Até<input id="mr-ate" type="date" value="${esc(m.ate || fp.ate)}"></label></div>
      <div class="duas"><label>Município<select id="mr-mun">${opts(P.municipios, m.municipio || '', 'Todos')}</select></label>
        <label>Praga/programa<select id="mr-praga">${opts(pr, m.praga || 'Monilíase', 'Todas')}</select></label></div>
      <fieldset class="pce-partes-grupo"><legend>Servidor(es) dos termos</legend><div class="mon-cks">${servs.length ? servs.map(n => `<label class="chk"><input type="checkbox" name="mr-serv" value="${esc(n)}" ${!m.servidores || !m.servidores.length || m.servidores.includes(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('') : '<span class="dica">Nenhum termo neste aparelho.</span>'}</div></fieldset>
      <div class="duas"><label>Convênio nº<input id="mr-conv" value="${esc(m.convenio || '')}" placeholder="00991272/2025"></label><label>Etapa<input id="mr-etapa" value="${esc(m.etapa || '')}" placeholder="1.4"></label></div>
      <label>Nome dos servidores (um por linha: Nome - Cargo/Função; inclua o motorista)<textarea id="mr-servs" rows="3"></textarea></label>
      <label>Responsável pela equipe<input id="mr-resp" value="${esc(m.responsavel || '')}"></label>
      <label>Local<input id="mr-local" value=""></label>
      <label>Objetivo<textarea id="mr-obj" rows="3"></textarea></label>
      <label>Deslocamento<input id="mr-desl" value="${esc(m.deslocamento || '')}" placeholder="Manaus/AM x Autazes/AM x Manaus/AM"></label>
      <label>Educação Sanitária: nº de folders e flyers distribuídos no período<input id="mr-folders-n" inputmode="numeric" autocomplete="off" placeholder="ex.: 72"></label>
      <label>OBS<textarea id="mr-obs" rows="2">${esc(m.obs != null ? m.obs : 'Anexo Termo de Fiscalização e Cadastro de imóveis')}</textarea></label>
      <label class="chk"><input type="checkbox" id="mr-anexo-t" ${m.anexoT === false ? '' : 'checked'}> Anexar os Termos de Fiscalização do período</label>
      <label class="chk"><input type="checkbox" id="mr-anexo-c" ${m.anexoC === false ? '' : 'checked'}> Anexar os Cadastros de imóvel ligados</label>
      <div id="mr-previa" class="card mon-previa" aria-live="polite"></div>
      <button class="botao" type="button" data-mon="relimprimir" id="mr-imprimir">🖨️ Imprimir / PDF</button>
      <button class="botao sec" type="button" data-mon="relarquivo" id="mr-arquivo">📄 Gerar arquivo PDF (enviar/guardar)</button></form>`);
    const f = $('#monRelForm');
    let auto = {};
    const atualizar = async () => {
      const R = await montarRelatorio(true);
      // textos sugeridos (servidores, responsável, local, objetivo) só preenchem o que o usuário ainda não mudou
      const suger = { 'mr-servs': R.servidores.map(x => [x.nome, x.funcao].filter(Boolean).join(' - ')).join('\n'), 'mr-local': R.local, 'mr-obj': R.objetivo,
        'mr-resp': R.servidores[0] ? [R.servidores[0].nome, R.servidores[0].funcao].filter(Boolean).join(' - ') : '' };
      Object.entries(suger).forEach(([k, v]) => { const el = $('#' + k); if (el && (!el.value.trim() || el.value === auto[k])) { el.value = v; auto[k] = v; } });
      const c = R.calc;
      $('#mr-previa').innerHTML = `<b>Atividades desenvolvidas</b><ul class="mon-rel-lista"><li>Hospedeiros inspecionados: <b>${esc(c.textos.hospedeiros)}</b></li>
        <li>Plantas inspecionadas: <b id="mr-plantas">${esc(c.textos.plantas)}</b></li><li>Presença de sintomas: <b>${esc(c.textos.sintomas)}</b></li>
        <li>Coleta de amostra: <b>${esc(c.textos.coleta)}</b></li><li>Educação sanitária: <b id="mr-folders">${esc(c.textos.educacao)}</b></li>
        <li>Termos de Fiscalização emitidos: <b id="mr-ntermos">${esc(c.textos.termos)}</b></li></ul><small>${c.cadastros.length} cadastro(s) ligado(s).</small>`;
    };
    f.addEventListener('change', () => atualizar().catch(e => toast(e.message, true)));
    f.addEventListener('input', e => { if (['mr-de', 'mr-ate', 'mr-folders-n'].includes(e.target.id)) atualizar().catch(() => {}); });
    if (m.servidoresTxt) { $('#mr-servs').value = m.servidoresTxt; auto['mr-servs'] = '__'; }
    if (m.objetivo) { $('#mr-obj').value = m.objetivo; auto['mr-obj'] = '__'; }
    await atualizar();
  }
  /** Lê a tela do relatório, calcula e (salvar) lembra convênio/etapa/textos para a próxima vez. */
  async function montarRelatorio(soCalc) {
    const v = id => ($('#' + id) || {}).value || '';
    const f = { de: v('mr-de'), ate: v('mr-ate'), municipio: v('mr-mun'), praga: v('mr-praga'), servidores: [...document.querySelectorAll('input[name=mr-serv]:checked')].map(x => x.value),
      folders: inteiro(v('mr-folders-n')) || 0 };
    const todosServ = document.querySelectorAll('input[name=mr-serv]').length;
    if (f.servidores.length === todosServ) f.servidores = [];
    const termos = await Store.todos('termosPce'), cads = await Store.todos('cadastrosPce');
    const calc = PCEDocs.calcularRelatorio(termos, cads, f);
    const praga = f.praga || 'Monilíase';
    const local = f.municipio ? `${f.municipio}/AM` : calc.municipios.map(x => x + '/AM').join(', ');
    const R = { ...f, calc, praga, servidores: calc.servidores, local, objetivo: (TC.objetivos || {})[praga] || `Executar Ações de Levantamento Fitossanitário de detecção da praga ${praga}, visando a prevenção e ação imediata de contingência.` };
    if (soCalc) return R;
    const servidores = v('mr-servs').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [nome, ...resto] = l.split(/\s+-\s+/); return { nome, funcao: resto.join(' - ') }; });
    const rel = { convenio: v('mr-conv').trim(), etapa: v('mr-etapa').trim(), servidores, responsavel: v('mr-resp').trim(), de: f.de, ate: f.ate, local: v('mr-local').trim() || local,
      localArq: f.municipio || calc.municipios.join('_'), objetivo: v('mr-obj').trim() || R.objetivo, deslocamento: v('mr-desl').trim(), praga, calc, obs: v('mr-obs').trim() };
    await Store.setMeta(REL_META, { de: f.de, ate: f.ate, municipio: f.municipio, praga: f.praga, servidores: f.servidores, convenio: rel.convenio, etapa: rel.etapa,
      responsavel: rel.responsavel, deslocamento: rel.deslocamento, obs: rel.obs, servidoresTxt: v('mr-servs'), objetivo: rel.objetivo !== R.objetivo ? rel.objetivo : '',
      anexoT: $('#mr-anexo-t').checked, anexoC: $('#mr-anexo-c').checked });
    const anexos = { termos: $('#mr-anexo-t').checked ? calc.termos : [], cadastros: $('#mr-anexo-c').checked ? calc.cadastros : [] };
    const arquivosPorReg = {};
    for (const r of [...anexos.termos, ...anexos.cadastros]) arquivosPorReg[r.id] = await Anexos.arquivosPorId(r);
    return { rel, anexos, arquivosPorReg };
  }
  async function gerarRelatorio(modo) {
    const { rel, anexos, arquivosPorReg } = await montarRelatorio(false);
    if (!rel.calc.nTermos && !confirm('Nenhum Termo de Fiscalização no período/filtros escolhidos. Gerar o relatório assim mesmo?')) return;
    const r = await Docs.pceMon('relatorio', rel, { anexos, arquivosPorReg }, modo);
    if (modo === 'arquivo') {
      if (PDF.podeCompartilhar([r])) { try { await PDF.compartilhar([r], 'Relatório de atividades — ADAF', 'Relatório de atividades gerado pelo e-GDV.'); } catch (e) { PDF.baixar(r); } }
      else PDF.baixar(r);
      toast(`PDF gerado: ${r.name}`);
    }
    return r;
  }

  /* ================= ações (cliques) ================= */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-mon]'); if (!el) return;
    const a = el.dataset.mon, id = el.dataset.id, tipo = el.dataset.tipo;
    try {
      if (a === 'novo') go(tipo === 'termo' ? 'pcetf' : 'pcecad', el.dataset.antigo ? { antigo: true } : null);
      else if (a === 'abrir') go(tipo === 'termo' ? 'pcetf' : 'pcecad', id);
      else if (a === 'imprimir') await imprimir(tipo, id);
      else if (a === 'enviar') await enviar(id);
      else if (a === 'termodocad') { const c = await Store.obter('cadastrosPce', id); go('pcetf', { cadastroId: id, antigo: !!(c && Number(c.registroAntigo) === 1 && U().podeAntigo()) }); }
      else if (a === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        const t = await Store.obter('termosPce', id); await Store.salvar('termosPce', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); lista('termo');
      } else if (a === 'excluircad') {
        const c = await Store.obter('cadastrosPce', id); if (!c || !confirm(`Excluir o cadastro ${c.numeroTxt || ''} de ${c.nome}?`)) return;
        await Store.salvar('cadastrosPce', { ...c, excluido: 1 }); await Anexos.apagarSeNaoEnviado([...Anexos.idsArquivos(c)]);
        Sync.sincronizar(); toast('Cadastro excluído.'); lista('cadastro');
      } else if (a === 'relimprimir') await gerarRelatorio();
      else if (a === 'relarquivo') await gerarRelatorio('arquivo');
      else if (!F) return;
      else if (a === 'gps') await usarGPS(el.dataset.pref);
      else if (a === 'deldoc') { F.docs = F.docs.filter(x => x !== id); if (!Anexos.idsArquivos(F.rec).has(id)) await Anexos.apagarSeNaoEnviado([id]); await renderDocs(F.tipo === 'termo' ? PT : PC); agendar(0); }
      else if (a === 'limparass') { Anexos.limparCanvas($('#mon-ass-' + el.dataset.papel)); delete F.assNovas[el.dataset.papel]; F.ass[el.dataset.papel] = ''; agendar(); }
      else if (a === 'usarbusca') { const x = F.busca && F.busca[+el.dataset.i]; if (x) aplicarBusca(PC, x); }
      else if (a === 'usarcad') { const c = F.buscaCad && F.buscaCad[+el.dataset.i]; if (c) ligarCadastro(c, true); }
      else if (a === 'desligarcad') { F.cad = null; F.cadastroId = ''; F.hospedeiros = []; $('#' + PT + 'cad').innerHTML = cadLigadoHTML(F); agendar(0); const b = $('#' + PT + 'busca'); if (b) b.focus(); }
      else if (a === 'negativa') { const t = $('#' + PT + 'constatacao'); t.value = TC.constatacaoNegativa || ''; agendar(0); }
      else if (a === 'frasescitros') await refazerFrases();
      else if (a === 'criarcad' && F.programa === 'citros') {                      // Termo de citros: o cadastro sai do levantamento da visita
        if (!F.levId) return toast('O Cadastro de citros sai do levantamento: abra o levantamento da visita e use “🍊 Cadastro de citros”.', true);
        await Store.setMeta(RASC.termo, { dados: coletarTf(), id: F.id, novo: F.novo, antigo: F.antigo ? 1 : 0, docs: F.docs, assNovas: F.assNovas, cadastroId: '', propriedadeId: F.propriedadeId || '',
          hospedeiros: [], levId: F.levId, programa: 'citros', em: Date.now() });
        const o2 = { programa: 'citros', levId: F.levId, propId: F.propriedadeId || '', deTermo: true, antigo: F.antigo }; fechar(); go('pcecad', o2);
      }
      else if (a === 'criarcad') {
        const D = coletarTf(), co = lerPar(D.lat, D.lon);
        await Store.setMeta(RASC.termo, { dados: D, id: F.id, novo: F.novo, antigo: F.antigo ? 1 : 0, docs: F.docs, assNovas: F.assNovas, cadastroId: '', propriedadeId: F.propriedadeId || '', hospedeiros: [], em: Date.now() });
        const antigo = F.antigo, pre = { nome: D.nome, doc: D.doc, municipio: D.municipio, endereco: D.endereco, uf: D.uf, lat: co.lat == null ? D.lat : String(co.lat).replace('.', ','),
          lon: co.lon == null ? D.lon : String(co.lon).replace('.', ','), unidade: D.unidade };
        if (antigo) Object.assign(pre, { sNome: D.sNome, sCargo: D.sCargo, sMatricula: D.sMatricula, sLotacao: D.sLotacao, local: D.municipio });
        const propIdLig = F.propriedadeId || '';
        fechar(); go('pcecad', { antigo, deTermo: true, prefill: pre, propIdLig, manter: antigo ? { sNome: D.sNome, sCargo: D.sCargo, sMatricula: D.sMatricula, sLotacao: D.sLotacao, unidade: D.unidade, municipio: D.municipio } : {} });
      }
      else if (a === 'salvaroutro') { if (F.tipo === 'termo') await salvarTf(true); else await salvarCad(true); }
      else if (a === 'descartar') {
        if (!confirm('Descartar este formulário? Os dados preenchidos serão perdidos.')) return;
        const tp = F.tipo, salvo = Anexos.idsArquivos(F.rec), docs = F.docs.filter(x => !salvo.has(x)), deTermo = F.deTermo;
        fechar(); await Anexos.apagarSeNaoEnviado(docs); await Store.setMeta(RASC[tp], null);
        go(deTermo ? 'pcetf' : tp === 'termo' ? 'pcetfs' : 'pcecads', deTermo ? { retomar: true } : null);
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { cadastro, termo: termoForm, pronto, lista, relatorio, gerarRelatorio, lerEixo, lerPar, lerNumeroDoc, numero, propIdDe, imprimir };
})();
