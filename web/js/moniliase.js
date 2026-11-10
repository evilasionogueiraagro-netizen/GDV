// PCE — Termo de Fiscalização: a visita (nova visita em passos, um Termo por programa), o Termo digitado do papel, o envio do PDF ao produtor e o
// Relatório de atividades (prestação de contas do convênio). Não é o TF de Barreira. A visita é o fluxo de campo: frutos avaliados -> pragas do
// catálogo e hospedeiros -> amostra, sintomas, plantas e fotos -> ações e constatação -> assinaturas; ao concluir sai UM Termo por programa (e o Termo
// de Colheita, quando houve coleta), com número por unidade e ano (sem internet o número é provisório e a planilha confere ao sincronizar).
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM, pegarLocalSilencioso, avisoAtivacao), do pce.js (PCEUI), do
// pce-cadastros.js (PCECads: catálogo, frutos), do docs.js (impressão/PDF) e do documentos/pce-docs.js (agregados do relatório).
const PCEMon = (() => {
  const P = CONFIG.PCE, TC = P.termo || {};
  const digitos = v => String(v || '').replace(/\D/g, '');
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const unid = u => Sync.unidadePce(u);
  const num3 = n => String(n).padStart(3, '0');
  const numTxt = (tipo, n, a, u) => (tipo === 'termo' ? `${num3(n)}.${a}.${unid(u)}` : `${num3(n)}-${a}-${unid(u)}`);
  const NOME = { termo: 'Termo de Fiscalização', cadastro: 'Ficha oficial' };
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
      ${gps ? `<div class="pce-gps"><span id="${pref}gps-st" class="dica"></span><button type="button" class="mini" data-mon="gps" data-pref="${pref}">${icone('local')} Usar GPS</button></div>` : ''}`;
  function mostrarCoord(pref) {
    const st = $('#' + pref + 'coord-st'), la = $('#' + pref + 'lat'), lo = $('#' + pref + 'lon'); if (!st || !la) return null;
    const r = lerPar(la.value, lo.value);
    st.innerHTML = r.vazio ? '<div class="tf-novo">Sem coordenadas: o registro não aparecerá no mapa do painel.</div>' : r.erro ? `<div class="tf-alerta">${icone('alerta')} ${esc(r.erro)}</div>`
      : `<div class="tf-ok">${icone('check')} ${esc(String(r.lat).replace('.', ','))} / ${esc(String(r.lon).replace('.', ','))}${r.oeste ? ' <small>(longitude Oeste)</small>' : ''}<br><small>${esc(U().gms(r.lat, 'N', 'S'))} &nbsp; ${esc(U().gms(r.lon, 'L', 'O'))}</small></div>`;
    return r;
  }
  async function usarGPS(pref) {
    const st = $('#' + pref + 'gps-st'); if (st) st.textContent = 'Obtendo localização…';
    const g = await pegarLocal(); if (!$('#' + pref + 'lat')) return;
    if (!g) { if (st) st.textContent = 'GPS indisponível ou permissão negada.'; return; }
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
    if (i.closest('#pceVisitaForm')) visitaMudou(i, 'click').catch(() => {}); else agendar();
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
  let F = null, tR = null;                                                // Termo do papel aberto
  const RASC = { termo: 'pceTfRascunho' };
  function agendar(atraso = 500) {
    clearTimeout(tR);
    const f = $('#monTfForm'), st = F; if (!f || !st || !st.vivo) return;
    tR = setTimeout(() => {
      if (F !== st || !f.isConnected) return;
      Store.setMeta(RASC.termo, { dados: coletarTf(), id: st.id, novo: st.novo, antigo: 1, docs: st.docs, assNovas: st.assNovas, em: Date.now() });
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
  const topoPapel = (titulo, novo) => `<div class="card mon-topo"><h3>${icone('documento')} ${esc(titulo)}</h3>
      <p class="dica" style="text-align:left">Digite como está no papel, na mesma ordem. Toque de novo num botão marcado para desmarcar.${novo ? ' Depois de salvar, use “Salvar e digitar outro”.' : ''}</p></div>`;

  /* ---------- PDF escaneado (registro do papel) ---------- */
  const MAX_DOCS = P.maxDocumentos || 10, MAX_PDF = 10 * 1024 * 1024;
  const pdfHTML = pref => `<div class="card"><h3>${icone('anexo')} Folha escaneada (PDF)</h3>
      <label class="pce-arquivo">${icone('anexo')} Anexar PDF<input type="file" id="${pref}pdfs" accept="application/pdf,.pdf" multiple></label>
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
      return `<div class="pce-doc"><span>${icone('documento')} ${esc(a.nomeOriginal || 'documento.pdf')} <small>${a.url ? 'no Drive' : ''}</small></span>
        <span class="pce-doc-acoes">${a.url ? `<a class="mini" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}<button type="button" class="mini" data-mon="deldoc" data-id="${esc(id)}" aria-label="Remover PDF ${i + 1}">${icone('fechar')}</button></span></div>`; }).join('')
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
  /** Popup do registro do papel: número do papel e o efeito na sequência (como no Termo de Colheita antigo). */
  function confirmarPapel(o) {
    return new Promise(ok => {
      const ult = o.info ? o.info.ultimo : null;
      const efeito = ult == null ? '<div class="tf-novo">Sem conexão: a planilha confere o número ao sincronizar (número repetido aparece como conflito).</div>'
        : o.n <= ult ? `<div class="tf-ok">${icone('check')} Dentro da sequência já usada (último: ${esc(num3(ult))}): não muda o próximo número.</div>`
        : o.n === ult + 1 ? `<div class="tf-novo">${icone('info')} É o próximo da sequência: o próximo sugerido passa a ser ${esc(num3(o.n + 1))}.</div>`
        : `<div class="tf-alerta">${icone('alerta')} O número é <b>maior</b> que o último usado (${esc(num3(ult))}): os próximos desta unidade em ${o.ano} continuam a partir de <b>${esc(num3(o.n + 1))}</b>. Confira o papel.</div>`;
      const m = modal(`<h3>Gravar ${esc(NOME[o.tipo])} do papel</h3><div class="tf-num"><b id="mon-papel-num">${esc(numTxt(o.tipo, o.n, o.ano, o.unidade))}</b></div>${efeito}
        <div class="duas"><button class="botao sec" id="mon-m-cancel" type="button">Cancelar</button><button class="botao" id="mon-m-ok" type="button">Confirmar e gravar</button></div>`);
      m.querySelector('#mon-m-cancel').onclick = () => { m.remove(); ok(false); };
      m.querySelector('#mon-m-ok').onclick = () => { m.remove(); ok(true); };
    });
  }
  /**
   * Termo digitado do papel: o número é o do papel; a planilha só confere se está livre (pceDocRegistrar). Devolve true se gravou.
   */
  async function numerarEGravar(tipo, rec, pessoa, prop, papel) {
    const u = unid(rec.unidade), prog = rec.programa || 'moniliase', a = papel.ano, n = papel.n;
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
  /**
   * Número do Termo de campo (visita) ou da ficha oficial, sem perguntar: online a planilha dá o próximo e confirma (pceDocRegistrar); sem internet o
   * número é provisório (último que o aparelho conhece + 1) e a planilha confere ao sincronizar (repetido = conflito). rec já montado (sem número).
   * Devolve {rec} (gravado no aparelho) ou {duplicado: {numeroTxt, programaVisita}} quando a planilha já tem Termo desse programa nesta visita.
   */
  async function numerar(tipo, rec, pessoa, prop) {
    const u = unid(rec.unidade), prog = rec.programa || 'moniliase', a = Number(String(rec.data).slice(0, 4)) || new Date().getFullYear();
    let sug = null;
    if (online()) { try { const r = await Sync.pceDocNumero(tipo, u, a, prog); sug = { numero: Math.max(r.proximo, (await ultimoLocal(tipo, u, a, prog)) + 1), origem: 'servidor' }; }
      catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; } }
    if (!sug) sug = { numero: (await ultimoLocal(tipo, u, a, prog)) + 1, origem: 'offline' };
    let n = sug.numero;
    for (let t = 0; t < 8; t++) {
      const locais = (await Store.todos(STORE[tipo])).filter(r => r.id !== rec.id && unid(r.unidade) === u && Number(r.ano) === a && (tipo === 'termo' || (r.programa || 'moniliase') === prog));
      while (locais.some(r => Number(r.numero) === n)) n++;
      Object.assign(rec, { ano: a, numero: n, numeroTxt: numTxt(tipo, n, a, u), numeroSugerido: sug.numero, conflito: 0, numeroOrigem: sug.origem === 'servidor' ? (n === sug.numero ? 'sistema' : 'editado') : 'provisorio' });
      if (sug.origem === 'servidor') {
        let r = null;
        try { r = await Sync.pceDocRegistrar(tipo, rec, pessoa, prop); } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; }
        if (r && r.emitido === false && r.termoDaVisita) return { duplicado: r.termoDaVisita };           // um Termo por programa em cada visita: não cria outro
        if (r && r.emitido === false) { n = Math.max(n + 1, Number(r.proximo) || 0); continue; }          // outro servidor usou este número agora
        if (r) { const gravado = { ...rec, emitidoEm: r.emitidoEm }; await gravarLocal(tipo, gravado, pessoa, prop, 0); return { rec: gravado }; }
      }
      const gravado = { ...rec, provisorio: sug.origem !== 'servidor' ? 1 : 0 };
      await gravarLocal(tipo, gravado, pessoa, prop, 1); return { rec: gravado };
    }
    throw new Error('Não foi possível definir o número do ' + NOME[tipo] + '. Tente de novo.');
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
  async function montarPessoa(doc, campos) { return doc && (doc.length === 11 || doc.length === 14) ? U().montarPessoa(doc, campos) : null; }
  /** CPF/CNPJ: no papel é opcional (avisa se inválido); em campo, obrigatório. false = parar. */
  function docConfere(doc, papel) {
    if (!doc) { if (papel) return true; toast('Informe o CPF/CNPJ.', true); return false; }
    if (doc.length !== 11 && doc.length !== 14) { if (papel) return confirm(`O CPF/CNPJ "${doc}" está incompleto. Salvar mesmo assim?`); toast('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.', true); return false; }
    return U().docOk(doc) || confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Continuar mesmo assim?`);
  }


  /* ================= Termo de Fiscalização digitado do papel ================= */
  const PT = 'mt-';
  function mostrarNumPapel(pref, tipo) {
    const st = $('#' + pref + 'numpapel-st'), el = $('#' + pref + 'numpapel'); if (!st || !el) return null;
    if (!el.value.trim()) { st.replaceChildren(); return null; }
    const r = lerNumeroDoc(el.value, g(pref, 'unidade'), g(pref, 'data'));
    if (!r.erro && r.unidadeDoNumero && !g(pref, 'unidade')) { const s = $('#' + pref + 'unidade'); s.value = r.unidadeDoNumero; }
    st.innerHTML = r.erro ? `<div class="tf-alerta">${icone('alerta')} ${esc(r.erro)}</div>` : !r.ano ? '<div class="tf-novo">Informe a data para conferir o ano do número.</div>'
      : `<div class="tf-ok">${icone('check')} Será gravado como <b>${esc(numTxt(tipo, r.n, r.ano, r.unidade || g(pref, 'unidade')))}</b>.</div>`;
    return r;
  }
  function avisoDoc(pref) {
    const el = $('#' + pref + 'st-doc'), d = digitos(g(pref, 'doc')); if (!el) return;
    el.innerHTML = !d ? '' : d.length !== 11 && d.length !== 14 ? '<div class="tf-alerta">CPF/CNPJ incompleto.</div>'
      : U().docOk(d) ? '' : `<div class="tf-alerta">${icone('alerta')} ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
  }
  const mostrarNegativa = () => { const b = $('#' + PT + 'negativa'); if (b) b.hidden = !cv(PT, 'pragas').includes('Monilíase'); };
  const tfVazio = (s, m = {}) => ({ unidade: m.unidade || (s && s.lotacao) || '', numPapel: '', sNome: m.sNome || '', sCargo: m.sCargo || '', sMatricula: m.sMatricula || '', sLotacao: m.sLotacao || '',
    nome: '', doc: '', atividade: '', empresa: '', cnpj: '', atividadeEmpresa: '', endereco: '', municipio: m.municipio || (s && s.lotacao) || '', uf: 'AM', telefone: '', lat: '', lon: '',
    pragas: ['Monilíase'], tipoLocal: [], data: m.data || '', hora: '', acoes: [], constatacao: '', enquadramento: '', t1nome: '', t1doc: '', t2nome: '', t2doc: '', recebidoEm: '',
    plantas: '', amostra: '', sintomas: '' });
  const tfDeRegistro = r => { const tt = lerJSON(r.testemunhas, []);
    return { ...tfVazio(null), unidade: r.unidade || '', numPapel: r.numeroTxt || '', sNome: r.servidor || '', sCargo: r.cargo || '', sMatricula: r.matricula || '', sLotacao: r.lotacao || '',
      nome: r.nome || '', doc: PCEDocs.fmtDoc(r.doc), atividade: r.atividade || '', empresa: r.empresa || '', cnpj: PCEDocs.fmtDoc(r.cnpj), atividadeEmpresa: r.atividadeEmpresa || '',
      endereco: r.endereco || '', municipio: r.municipio || '', uf: r.uf || '', telefone: r.telefone || '',
      lat: r.lat === '' || r.lat == null ? '' : String(r.lat).replace('.', ','), lon: r.lon === '' || r.lon == null ? '' : String(r.lon).replace('.', ','),
      pragas: lerJSON(r.pragas, []), tipoLocal: lerJSON(r.tipoLocal, []), data: r.data || '', hora: r.hora || '', acoes: lerJSON(r.acoes, []), constatacao: r.constatacao || '',
      enquadramento: r.enquadramento || '', t1nome: (tt[0] || {}).nome || '', t1doc: (tt[0] || {}).doc || '', t2nome: (tt[1] || {}).nome || '', t2doc: (tt[1] || {}).doc || '',
      recebidoEm: r.recebidoEm || '', plantas: r.plantasInspecionadas === '' || r.plantasInspecionadas == null ? '' : String(r.plantasInspecionadas),
      amostra: r.amostra || '', sintomas: r.sintomas || '' }; };
  function coletarTf() {
    const p = PT;
    return { unidade: g(p, 'unidade'), numPapel: g(p, 'numpapel'), sNome: g(p, 'snome'), sCargo: U().cargoValor(p + 'scargo'), sMatricula: g(p, 'smatricula'), sLotacao: g(p, 'slotacao'),
      nome: g(p, 'nome'), doc: g(p, 'doc'), atividade: g(p, 'atividade'), empresa: g(p, 'empresa'), cnpj: g(p, 'cnpj'), atividadeEmpresa: g(p, 'atividadeEmpresa'),
      endereco: g(p, 'endereco'), municipio: g(p, 'municipio'), uf: g(p, 'uf'), telefone: g(p, 'telefone'), lat: g(p, 'lat'), lon: g(p, 'lon'),
      pragas: cv(p, 'pragas'), tipoLocal: cv(p, 'tipoLocal'), data: g(p, 'data'), hora: g(p, 'hora'), acoes: cv(p, 'acoes'), constatacao: g(p, 'constatacao'),
      enquadramento: g(p, 'enquadramento'), t1nome: g(p, 't1nome'), t1doc: g(p, 't1doc'), t2nome: g(p, 't2nome'), t2doc: g(p, 't2doc'), recebidoEm: g(p, 'recebido'),
      plantas: g(p, 'plantas'), amostra: rv(p, 'amostra'), sintomas: rv(p, 'sintomas') };
  }
  const lst = l => l.map(x => [x, x]);
  function formTfHTML(D, st) {
    const p = PT;
    return `<form id="monTfForm" class="pce-antigo" autocomplete="off" novalidate>
      ${topoPapel(st.novo ? 'Termo de Fiscalização (PCE) — digitar do papel' : 'Editar Termo de Fiscalização (do papel)', st.novo)}${U().servAntigoHTML(p, D, st.lembrados)}
      <div class="card"><h3>Nº do termo</h3>
        <label>Unidade (numeração) *<select id="${p}unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
        ${st.novo ? `${inp(p, 'numpapel', 'Nº do termo (como está no papel) *', D.numPapel, 'placeholder="ex.: 001.2026.AUTAZES ou 1" autocomplete="off"')}<div id="${p}numpapel-st" class="tf-status" aria-live="polite"></div>`
          : `<div class="tf-num"><b>${esc(st.rec.numeroTxt)}</b></div>`}</div>
      <div class="card"><h3>1 – Identificação</h3>
        ${inp(p, 'nome', 'Nome *', D.nome, 'autocapitalize="characters"')}
        <div class="duas">${inp(p, 'doc', 'CPF (opcional no papel)', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}${inp(p, 'atividade', 'Atividade', D.atividade)}</div>
        <div id="${p}st-doc" class="tf-status"></div>
        <div class="duas">${inp(p, 'empresa', 'Empresa / Fantasia', D.empresa)}${inp(p, 'cnpj', 'CNPJ', D.cnpj, 'inputmode="numeric"')}</div>
        ${inp(p, 'atividadeEmpresa', 'Atividade (empresa)', D.atividadeEmpresa)}
        ${inp(p, 'endereco', 'Endereço', D.endereco)}
        <div class="duas mon-mun"><label>Município *<select id="${p}municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>${inp(p, 'uf', 'UF', D.uf, 'maxlength="2" autocapitalize="characters"')}</div>
        ${inp(p, 'telefone', 'Telefone', D.telefone, 'type="tel"')}
        <p class="mon-sub">Coordenadas geográficas</p>${coordHTML(p, D, false)}</div>
      <div class="card"><h3>2 – Descrição da ação</h3>
        <p class="mon-sub">Praga(s)</p>${cks(p, 'pragas', lst(TC.pragas || []), D.pragas)}
        ${cks(p, 'tipoLocal', lst(TC.locais || []), D.tipoLocal)}
        <div class="duas">${inp(p, 'data', 'Em (data) *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${inp(p, 'hora', 'às (hora) *', D.hora, 'type="time"')}</div>
        <p class="mon-sub">ao realizar ações de *</p>${cks(p, 'acoes', lst(TC.acoes || []), D.acoes)}
        <label>Situação constatada<textarea id="${p}constatacao" rows="4">${esc(D.constatacao)}</textarea></label>
        <button type="button" class="mini" data-mon="negativa" id="${p}negativa">${icone('assinatura')} “${esc(TC.constatacaoNegativa || '')}”</button></div>
      <div class="card"><h3>3 – Enquadramento legal</h3><label><textarea id="${p}enquadramento" rows="3" aria-label="Enquadramento legal" placeholder="citar leis, decretos, resoluções, portarias, instruções normativas, artigos, incisos e alíneas">${esc(D.enquadramento)}</textarea></label></div>
      <div class="card"><h3>4 – Testemunhas</h3><p class="dica" style="text-align:left">Só quando o autuado se nega a assinar ou está ausente.</p>
        <div class="duas">${inp(p, 't1nome', 'Testemunha 1 – nome', D.t1nome)}${inp(p, 't1doc', 'CPF/RG', D.t1doc)}</div>
        <div class="duas">${inp(p, 't2nome', 'Testemunha 2 – nome', D.t2nome)}${inp(p, 't2doc', 'CPF/RG', D.t2doc)}</div>
        ${inp(p, 'recebido', 'Recebi a 2ª via deste Termo em (data, hora e local)', D.recebidoEm)}</div>
      <div class="card mon-extras"><h3>${icone('resumo')} Para o relatório de atividades</h3><p class="dica" style="text-align:left">Não aparece no papel.</p>
        ${inp(p, 'plantas', 'Plantas inspecionadas', D.plantas, 'inputmode="numeric" autocomplete="off"')}
        ${sn(p, 'amostra', 'Amostra coletada?', D.amostra)}${sn(p, 'sintomas', 'Presença de sintomas?', D.sintomas)}</div>
      ${pdfHTML(p)}
      <button class="botao" type="submit" id="${p}salvar">${icone('salvar')} Salvar termo</button>
      ${st.novo ? `<button class="botao" type="button" data-mon="salvaroutro" id="${p}salvar-outro">${icone('salvar')} Salvar e digitar outro</button>` : ''}
      <button class="botao sec" type="button" data-mon="descartar">Descartar</button></form>`;
  }
  async function termoForm(arg) {
    if (bloqueado()) return view(avisoAtivacao());
    const id = typeof arg === 'string' ? arg : '', o = arg && typeof arg === 'object' ? arg : {};
    const rec0 = id ? await Store.obter('termosPce', id) : null, s0 = await U().servidorAtual();
    const querAntigo = !!(o.antigo || (rec0 && Number(rec0.registroAntigo) === 1) || (!id && U().soDigitador(s0) && U().podeAntigo()));
    if (!querAntigo) { toast('O Termo de Fiscalização de campo nasce da visita, na tela do produtor. Aqui só se digita o Termo do papel.', true); return go('pcetermos'); }
    if (!U().podeAntigo()) { toast(U().SEM_ANTIGO, true); return go('pcetermos'); }
    const s = await U().exigirServidor('pcetf', arg, true); if (!s) return;
    fechar();
    if (id && (!rec0 || rec0.excluido)) { toast('Termo não encontrado.', true); return go('pcetermos'); }
    if (rec0 && rec0.visitaId) { toast('Termo de visita não se edita: cancele e refaça a visita se estiver errado.', true); return go('pcetermos'); }
    const t = await tratarRascunho('termo', id, false); if (!t) return go('pcetermos');
    let st, D;
    if (t.rasc) {
      const r = t.rasc, rec = r.id ? await Store.obter('termosPce', r.id) : null;
      st = { tipo: 'termo', id: r.id, novo: !rec, rec, antigo: true, docs: r.docs || [], ass: {}, assNovas: {} };
      D = { ...tfVazio(s), ...r.dados };
    } else if (rec0) {
      st = { tipo: 'termo', id: rec0.id, novo: false, rec: rec0, antigo: true, docs: lerJSON(rec0.documentos, []), ass: lerJSON(rec0.assinaturas, {}), assNovas: {} };
      D = tfDeRegistro(rec0);
    } else {
      st = { tipo: 'termo', id: Store.novoId(), novo: true, rec: null, antigo: true, docs: [], ass: {}, assNovas: {} };
      D = tfVazio(null, o.manter || {});
    }
    st.vivo = true; st.serv = U().dadosServidor(s); st.lembrados = await U().servidoresLembrados();
    F = st;
    view(formTfHTML(D, st));
    mostrarCoord(PT); mostrarNumPapel(PT, 'termo'); avisoDoc(PT); mostrarNegativa(); await renderDocs(PT);
    const f = $('#monTfForm');
    f.addEventListener('input', e => {
      const tid = e.target.id;
      if (tid === PT + 'lat' || tid === PT + 'lon') mostrarCoord(PT);
      if ([PT + 'numpapel', PT + 'unidade', PT + 'data'].includes(tid)) mostrarNumPapel(PT, 'termo');
      agendar();
    });
    f.addEventListener('change', async e => {
      const el = e.target;
      if (el.id === PT + 'pdfs') return adicionarPDFs(el, PT);
      if (el.name === PT + 'pragas') mostrarNegativa();
      if (el.id === PT + 'snome') await U().completarServidor(PT);
      if (el.id === PT + 'doc' || el.id === PT + 'cnpj') { el.value = PCEDocs.fmtDoc(digitos(el.value)) || el.value; avisoDoc(PT); }
      if ([PT + 'numpapel', PT + 'unidade', PT + 'data'].includes(el.id)) mostrarNumPapel(PT, 'termo');
      agendar();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarTf(false); };
    const p1 = $(D.sNome ? '#mt-numpapel' : '#mt-snome'); if (p1 && st.novo) p1.focus();
  }
  async function salvarTf(outro) {
    const st = F; if (!st || !st.vivo || st.salvando || st.tipo !== 'termo') return;
    const D = coletarTf(), doc = digitos(D.doc);
    const sv = U().servidorDigitado(PT); if (!sv) return;
    if (!D.unidade) return toast('Escolha a unidade da numeração.', true);
    if (!D.nome.trim()) return toast('Informe o nome do interessado.', true);
    if (!docConfere(doc, true)) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    const co = lerPar(D.lat, D.lon); if (co.erro) return toast('Coordenadas: ' + co.erro, true);
    if (!D.pragas.length && !D.constatacao.trim()) return toast('Marque a praga (ex.: Monilíase).', true);
    if (!D.acoes.length) return toast('Marque a ação realizada (ex.: Fiscalização).', true);
    if (!U().dataHoraPassadaOk(D)) return;
    let papel = null;
    if (st.novo) { papel = lerNumeroDoc(D.numPapel, D.unidade, D.data); if (papel.erro) { mostrarNumPapel(PT, 'termo'); return toast(papel.erro, true); } }
    const btns = [$('#mt-salvar'), $('#mt-salvar-outro')].filter(Boolean); btns.forEach(b => { b.disabled = true; }); st.salvando = true;
    try {
      const nome = D.nome.trim().replace(/\s+/g, ' ').toUpperCase();
      const base = { ...(st.rec || {}) }; delete base.pendente; delete base.provisorio;
      const plantas = inteiro(D.plantas), propriedadeId = base.propriedadeId || propIdDe(doc, nome, '', D.endereco);
      const rec = { ...base, id: st.id, unidade: unid(D.unidade), propriedadeId, cadastroId: base.cadastroId || '', programa: base.programa || 'moniliase', doc, nome, atividade: D.atividade.trim(),
        empresa: D.empresa.trim(), cnpj: digitos(D.cnpj), atividadeEmpresa: D.atividadeEmpresa.trim(), endereco: D.endereco.trim(), municipio: D.municipio,
        uf: (D.uf || '').trim().toUpperCase(), telefone: D.telefone.trim(), lat: co.vazio ? '' : co.lat, lon: co.vazio ? '' : co.lon, data: D.data, hora: D.hora.slice(0, 5),
        ...sv, pragas: JSON.stringify(D.pragas), tipoLocal: JSON.stringify(D.tipoLocal), acoes: JSON.stringify(D.acoes), constatacao: D.constatacao.trim(),
        enquadramento: D.enquadramento.trim(), testemunhas: JSON.stringify([{ nome: D.t1nome.trim(), doc: D.t1doc.trim() }, { nome: D.t2nome.trim(), doc: D.t2doc.trim() }].filter(x => x.nome || x.doc)),
        recebidoEm: D.recebidoEm.trim(), plantasInspecionadas: plantas === '' ? 0 : plantas, amostra: D.amostra, sintomas: D.sintomas,
        hospedeiros: base.hospedeiros || '[]', fotos: base.fotos || '[]', assinaturas: '{}', documentos: JSON.stringify(st.docs),
        registroAntigo: 1, cancelado: Number(base.cancelado) || 0, motivoCancel: base.motivoCancel || '', excluido: 0 };
      const pessoa = await montarPessoa(doc, { nome, endereco: rec.endereco, municipio: D.municipio, uf: rec.uf, telefone: rec.telefone });
      if (st.novo) {
        if (!(await numerarEGravar('termo', rec, pessoa, null, papel))) return;
      } else {
        await Store.salvar('termosPce', rec);
        if (pessoa) await Store.salvar('pessoas', pessoa);
      }
      await U().lembrarServidor(sv);
      const antes = Anexos.idsArquivos(st.rec), depois = new Set(st.docs);
      await Anexos.apagarSeNaoEnviado([...antes].filter(x => !depois.has(x)));
      fechar(); await Store.setMeta(RASC.termo, null);
      Sync.sincronizar();
      if (outro) { toast(`Termo ${rec.numeroTxt || ''} salvo. Digite o próximo.`); return go('pcetf', { antigo: true, manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data } }); }
      go('pcetfpronto', rec.id);
    } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
    finally { st.salvando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }
  async function prontoPapel(id) {
    const r = await Store.obter('termosPce', id); if (!r) return go('pcetermos');
    view(`<div class="card" id="mon-pronto"><h3>${icone('ok')} ${esc(NOME.termo)} salvo</h3><div class="tf-num"><b id="mon-pronto-num">${esc(r.numeroTxt || '')}</b></div>
      <p><b>${esc(r.nome)}</b></p><p>${esc(dBR(r.data))} ${esc(r.hora || '')} · ${esc(r.municipio)}</p>
      ${r.pendente ? `<div class="tf-novo">${icone('sincronizar')} Aguardando envio: a planilha confere o número ao sincronizar.</div>` : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}
      <p class="dica">Número do papel.</p></div>
      <button class="botao" data-mon="imprimir" data-tipo="termo" data-id="${esc(r.id)}" id="mon-imprimir">${icone('imprimir')} Imprimir / PDF</button>
      <button class="botao sec" data-mon="novo" data-tipo="termo" data-antigo="1">${icone('documento')} Digitar outro do papel</button>
      <button class="botao sec" data-v="pcetermos">${icone('formulario')} Ver termos</button>`);
  }

  /* ================= impressão, PDF e envio ao produtor ================= */
  /** PDF do Termo de Fiscalização (um modelo só, todos os programas; aceita os já gravados) ou da ficha oficial. modo 'arquivo': devolve o PDF. */
  async function imprimir(tipo, id, modo) {
    if (tipo === 'cadastro') return PCECads.imprimirFicha(id, modo);
    const r = await Store.obter('termosPce', id); if (!r) throw new Error('Termo não encontrado.');
    return Docs.termoPce(r, { arquivos: await Anexos.arquivosPorId(r) }, modo);
  }
  async function enviar(id) {
    const r = await Store.obter('termosPce', id); if (!r) throw new Error('Termo não encontrado.');
    const m = modal(`<h3>${icone('enviar')} Enviar ao produtor</h3><p class="dica">${esc(r.nome)}${r.telefone ? ' · ' + esc(r.telefone) : ''}</p><p><b>Termo de Fiscalização ${esc(r.numeroTxt || '')}</b></p>
      <div id="mon-env-st" class="tf-status"></div><button class="botao" type="button" id="mon-env-gerar">${icone('documento')} Gerar PDF</button><button class="botao sec" type="button" id="mon-env-fechar">Fechar</button>`);
    m.id = 'mon-modal-enviar';
    m.querySelector('#mon-env-fechar').onclick = () => m.remove();
    m.querySelector('#mon-env-gerar').onclick = async ev => {
      const btn = ev.currentTarget, st = m.querySelector('#mon-env-st'); btn.disabled = true; st.innerHTML = '<small>Gerando PDF…</small>';
      let file;
      try { file = await imprimir('termo', id, 'arquivo'); }
      catch (e) { btn.disabled = false; st.innerHTML = `<div class="tf-alerta">${icone('alerta')} Não foi possível gerar o PDF: ${esc(e.message || e)}. Use “Imprimir” → “Salvar como PDF”.</div>`; return; }
      if (!m.isConnected) return;
      st.innerHTML = `<div class="tf-ok">${icone('check')} PDF pronto: ${esc(file.name)} (${Math.max(1, Math.round(file.size / 1024)).toLocaleString('pt-BR')} KB)</div>`; btn.remove();
      const fim = m.querySelector('#mon-env-fechar'), add = html => { fim.insertAdjacentHTML('beforebegin', html); return fim.previousElementSibling; };
      const titulo = 'Termo de Fiscalização — ADAF', texto = `${titulo}: ${r.nome || ''}, ${dBR(r.data)}. Documento gerado pelo e-GDV.`;
      if (PDF.podeCompartilhar([file])) {
        add('<button class="botao" type="button" id="mon-env-share">Compartilhar</button>').onclick = async () => { try { if (await PDF.compartilhar([file], titulo, texto)) toast('Enviado para o compartilhamento.'); } catch (e) { toast(e.message, true); } };
      } else add('<p class="dica">Este aparelho não compartilha arquivos direto do app: toque em “Baixar” e anexe o PDF no WhatsApp (→ Documento).</p>');
      add('<button class="botao sec" type="button" id="mon-env-baixar">Baixar PDF</button>').onclick = () => PDF.baixar(file);
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
    mostrar(`      <form id="monRelForm" class="card" autocomplete="off"><h3>${icone('resumo')} Relatório de atividades</h3>
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
      <label class="chk"><input type="checkbox" id="mr-anexo-c" ${m.anexoC === false ? '' : 'checked'}> Anexar as fichas oficiais ligadas</label>
      <div id="mr-previa" class="card mon-previa" aria-live="polite"></div>
      <button class="botao" type="button" data-mon="relimprimir" id="mr-imprimir">${icone('imprimir')} Imprimir / PDF</button>
      <button class="botao sec" type="button" data-mon="relarquivo" id="mr-arquivo">${icone('documento')} Gerar arquivo PDF (enviar/guardar)</button>
      <button class="botao sec" type="button" data-v="pcetermos">${icone('voltar')} Voltar aos termos</button></form>`);
    const f = $('#monRelForm');
    let auto = {};
    const atualizar = async () => {
      const R = await montarRelatorio(true);
      // textos sugeridos (servidores, responsável, local, objetivo) só preenchem o que o usuário ainda não mudou
      const suger = { 'mr-servs': R.servidores.map(x => [x.nome, x.funcao].filter(Boolean).join(' - ')).join('\n'), 'mr-local': R.local, 'mr-obj': R.objetivo,
        'mr-resp': R.servidores[0] ? [R.servidores[0].nome, R.servidores[0].funcao].filter(Boolean).join(' - ') : '' };
      Object.entries(suger).forEach(([k, v]) => { const el = $('#' + k); if (el && (!el.value.trim() || el.value === auto[k])) { el.value = v; auto[k] = v; } });
      const c = R.calc;
      $('#mr-previa').innerHTML = `<div class="pce-stats-topo">
          <b>${icone('resumo')} Atividades desenvolvidas</b>
          <small>${c.cadastros.length} cadastro(s) ligado(s)</small>
        </div>
        <div class="pce-stats-grid">
          <div class="pce-stat-item"><b class="pce-stat-num" id="mr-ntermos">${esc(c.textos.termos)}</b><span class="pce-stat-rot">Termos emitidos</span></div>
          <div class="pce-stat-item"><b class="pce-stat-num" id="mr-plantas">${esc(c.textos.plantas)}</b><span class="pce-stat-rot">Plantas inspecionadas</span></div>
          <div class="pce-stat-item"><b class="pce-stat-num">${esc(c.textos.coleta)}</b><span class="pce-stat-rot">Coleta de amostra</span></div>
          <div class="pce-stat-item"><b class="pce-stat-num">${esc(c.textos.sintomas)}</b><span class="pce-stat-rot">Sintomas</span></div>
        </div>
        <ul class="mon-rel-lista" style="margin-top:12px">
          <li>Hospedeiros inspecionados: <b>${esc(c.textos.hospedeiros)}</b></li>
          <li>Educação sanitária: <b id="mr-folders">${esc(c.textos.educacao)}</b></li>
        </ul>`;
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

  /* ================= Nova visita ================= */
  // Passos: 1 frutos avaliados · 2 pragas de cada fruto (catálogo e hospedeiros) · 3 plantas, sintomas, amostra e fotos · 4 ações e constatação ·
  // 5 assinaturas. Cada dado é perguntado uma vez (produtor, propriedade e frutos vêm do cadastro). O rascunho é automático (meta "pceVisitaRascunho").
  const RV = 'pceVisitaRascunho', PASSOS = ['Frutos', 'Pragas', 'Plantas, amostra e fotos', 'Ações e constatação', 'Assinaturas'];
  const RES = Object.fromEntries(P.resultados || [['detectada', 'Detectada'], ['nao_detectada', 'Não detectada'], ['suspeita', 'Suspeita']]);
  const COM_DETECCAO = ['detectada', 'suspeita'];
  const OPC = { nao_detectada: 'Não tem', detectada: 'Tem' };      // praga opcional: só tem ou não tem (em branco vale "Não tem")
  const CA = () => PCECads;
  let V = null, tV = null;
  const idCat = s => CA().idCat(s);
  const listaE = l => PCEDocs.listaE(l);
  const novoF = () => ({ pragas: {}, extras: [], coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', qtd: '1', sint: '', plantas: '', fotos: [], dados: {} });
  const fruto = fid => V.F[fid] || (V.F[fid] = novoF());
  const frutoDe = fid => CA().frutosDe(V.p).find(f => f.id === fid) || null;
  const salvarRascunho = (atraso = 400) => {
    clearTimeout(tV); const st = V; if (!st || !st.vivo) return;
    tV = setTimeout(() => { if (V === st && st.vivo) { const { p, pe, serv, vivo, salvando, ...resto } = st; Store.setMeta(RV, { ...resto, em: Date.now() }); } }, atraso);
  };
  /** Pragas que o fruto avalia: as do catálogo para a cultura dele (família e hospedeiros) e as que o fiscal acrescentou. */
  function pragasDoFruto(fid) {
    const f = frutoDe(fid), st = fruto(fid); if (!f) return [];
    const lig = CA().pragasLigadas(f.cultura).map(p => ({ id: p.id, nome: CA().nomeDaPraga(p), ligada: true, opcional: Number(p.opcional) === 1 }));
    const extras = st.extras.map(id => CA().pragasCat().find(p => p.id === id)).filter(Boolean).filter(p => !lig.some(l => l.id === p.id))
      .map(p => ({ id: p.id, nome: CA().nomeDaPraga(p), ligada: false, opcional: Number(p.opcional) === 1 }));
    return [...lig, ...extras];
  }
  /** Resposta da praga no fruto. Opcional em branco (rascunho antigo ou fruto recém-marcado) vale "Não tem" (nao_detectada). */
  const respostaDe = (fid, p) => { const r = fruto(fid).pragas[p.id] || {}; return p.opcional && !r.resultado ? { ...r, resultado: 'nao_detectada' } : r; };
  const respondidas = fid => pragasDoFruto(fid).filter(p => respostaDe(fid, p).resultado);

  /* ---------- leitura da tela do passo para o estado ---------- */
  function coletarPasso() {
    if (!V || !$('#pceVisitaForm')) return;
    const q = (s, r = document) => r.querySelector(s);
    if (V.passo === 1) V.sel = [...document.querySelectorAll('input[name=vi-fruto]:checked')].map(c => c.value);
    else if (V.passo === 2) {
      document.querySelectorAll('.pce-pr[data-fruto]').forEach(e => {
        const r = q('.r-res:checked', e), st = fruto(e.dataset.fruto);
        st.pragas[e.dataset.praga] = { resultado: r ? r.value : '', haQuantoTempo: (q('.r-tempo', e) || {}).value || '', controle: rv('vi-ctl-' + e.dataset.fruto + '-' + e.dataset.praga + '-', 'c'), qualControle: (q('.r-qual', e) || {}).value || '' };
      });
    } else if (V.passo === 3) {
      document.querySelectorAll('.pce-cultura[data-fruto]').forEach(b => {
        const fid = b.dataset.fruto, st = fruto(fid), v = c => (q('.' + c, b) || {}).value;
        st.plantas = (v('v-plantas') || '').trim(); st.sint = rv(`vi-sint-${fid}-`, 's'); const col = rv(`vi-col-${fid}-`, 'c'); st.coleta = col === 'sim' ? 'Sim' : 'Não';
        ['tipoMaterial', 'codigoAmostra', 'destinoAmostra', 'qtd'].forEach(c => { if (q('.v-' + c, b)) st[c] = v('v-' + c).trim(); });
        const d = {};
        detecaoDoFruto(fid).forEach(qq => { const o = CA().lerPergunta(qq, `vq-${fid}-`); Object.entries(o).forEach(([k, x]) => { const t = Array.isArray(x) ? (x.length ? JSON.stringify(x) : '') : String(x == null ? '' : x); if (t) d[k] = t; }); });
        st.dados = d;
      });
    } else if (V.passo === 4) {
      V.acoes = cv('vi-', 'acoes'); V.local = g('vi-', 'local').trim(); V.data = g('vi-', 'data') || V.data; V.hora = g('vi-', 'hora') || V.hora;
      document.querySelectorAll('textarea[data-prog]').forEach(t => { V.const[t.dataset.prog] = t.value; });
    } else if (V.passo === 5) {
      V.naoAssina = !!($('#pce-naoassina') || {}).checked; V.t1nome = g('vi-', 't1nome'); V.t1doc = g('vi-', 't1doc'); V.t2nome = g('vi-', 't2nome'); V.t2doc = g('vi-', 't2doc');
    }
  }
  /** Perguntas de detecção do programa (monilíase): só quando uma praga do programa foi detectada ou suspeita neste fruto. */
  function detecaoDoFruto(fid) {
    const f = frutoDe(fid); if (!f) return [];
    const modelo = CA().modeloDaCultura(f.cultura), cfg = ((P.visita || {}).deteccao || {})[modelo]; if (!cfg) return [];
    const alvo = new Set(cfg.pragas.map(idCat));
    if (!pragasDoFruto(fid).some(p => alvo.has(idCat(p.nome)) && COM_DETECCAO.includes(respostaDe(fid, p).resultado))) return [];
    const defs = CA().perguntasDoModelo(modelo);
    return cfg.perguntas.map(k => defs.find(d => d.k === k)).filter(Boolean);
  }

  /* ---------- programas e Termos ---------- */
  /** Um programa do catálogo por grupo de pragas respondidas: {programa, nome, frutos:[fid], itens:[{fid, cultura, praga, resultado, ...}]}. */
  function programas() {
    const mapa = new Map();
    V.sel.forEach(fid => {
      const f = frutoDe(fid); if (!f) return;
      respondidas(fid).forEach(p => {
        const pg = CA().programaDaPraga(p.nome), r = respostaDe(fid, p);
        if (!mapa.has(pg.programa)) mapa.set(pg.programa, { programa: pg.programa, nome: pg.nome, frutos: [], itens: [] });
        const x = mapa.get(pg.programa); if (!x.frutos.includes(fid)) x.frutos.push(fid);
        x.itens.push({ fid, cultura: f.cultura, praga: p.nome, opcional: p.opcional, ...r });
      });
    });
    return [...mapa.values()];
  }
  const ehProgramaCitros = pg => pg.itens.some(i => PCECitros.ehCitros(i.praga)) && /citro/i.test(pg.nome);
  const enquadramentoDe = pg => {
    const txt = i => { const p = CA().pragaPorNome(i.praga); return (p && p.enquadramentoLegal) || (P.legislacao || {})[i.praga] || ''; };
    const pos = pg.itens.filter(i => COM_DETECCAO.includes(i.resultado) && txt(i)), base = pos.length ? pos : pg.itens.filter(i => txt(i));
    return [...new Set(base.map(txt))].join('\n');
  };
  /** Resultado de cada praga do programa, como sai no Termo (caixas Presença / Ausência / Suspeita): uma linha por praga e resultado, com as culturas juntas. */
  const ROTULO_RES = { detectada: 'Presença', nao_detectada: 'Ausência', suspeita: 'Suspeita' };
  function resultadosDe(pg) {
    const mapa = new Map();
    pg.itens.forEach(i => { const k = i.praga + '|' + i.resultado; if (!mapa.has(k)) mapa.set(k, { praga: i.praga, resultado: i.resultado, culturas: [] }); const c = mapa.get(k).culturas; if (!c.includes(i.cultura)) c.push(i.cultura); });
    return [...mapa.values()];
  }

  /* ---------- telas dos passos ---------- */
  const cabecalho = () => `<div class="card pce-passos"><div class="pce-passos-topo"><b>Nova visita</b><small>Passo ${V.passo} de ${PASSOS.length}: ${esc(PASSOS[V.passo - 1])}</small></div>
      <div class="pce-passos-barra" role="progressbar" aria-valuemin="1" aria-valuemax="${PASSOS.length}" aria-valuenow="${V.passo}">${PASSOS.map((_, i) => `<span class="${i < V.passo ? 'on' : ''}"></span>`).join('')}</div>
      <p class="dica" style="text-align:left"><b>${esc(V.pe ? V.pe.nome : '')}</b> · ${esc(V.p.nome || V.p.codigo || '')} · ${esc(V.p.municipio || '')}<br>Servidor: ${esc(V.serv.servidor)}</p></div>`;
  function passo1() {
    const lista = CA().frutosDe(V.p);
    return `<div class="card"><h3>${icone('broto')} Frutos avaliados nesta visita</h3>
      <p class="dica" style="text-align:left">Marque os frutos que você avaliou. Se faltar algum, acrescente: ele vai para o cadastro da propriedade.</p>
      ${lista.length ? lista.map(f => `<label class="chk vi-fruto"><input type="checkbox" name="vi-fruto" value="${esc(f.id)}" ${V.sel.includes(f.id) ? 'checked' : ''}> ${esc(CA().resumoFruto(f))}</label>`).join('')
        : '<div class="tf-novo" id="vi-semfrutos">Esta propriedade ainda não tem frutos cadastrados. Acrescente abaixo o que será avaliado.</div>'}
      <details class="vi-novo-fruto" ${lista.length ? '' : 'open'}><summary>+ Acrescentar fruto ao cadastro</summary>
        <label>Cultura<select id="vi-nf-cultura">${opts(CA().culturas(), '', 'Selecione')}</select></label>
        <div class="duas"><label>Cultivar<input id="vi-nf-cultivar" maxlength="80" autocomplete="off"></label><label>Área (ha)<input id="vi-nf-area" inputmode="decimal" maxlength="12" autocomplete="off"></label></div>
        <button type="button" class="botao sec" data-mon="addfruto" id="vi-addfruto">${icone('mais')} Acrescentar e marcar</button></details></div>`;
  }
  function blocoPraga(fid, p) {
    const st = respostaDe(fid, p), u = fid + '-' + p.id, det = COM_DETECCAO.includes(st.resultado), ops = !p.opcional ? RES : st.resultado === 'suspeita' ? { ...OPC, suspeita: 'Suspeita' } : OPC;     // rascunho antigo com "suspeita" não perde a resposta
    return `<div class="pce-pr" data-fruto="${esc(fid)}" data-praga="${esc(p.id)}" data-nome="${esc(p.nome)}"${p.opcional ? ' data-opcional="1"' : ''}><div class="pce-pr-topo"><b>${icone('praga')} ${esc(p.nome)}</b>
        <small class="pce-pr-cat">${p.ligada ? 'do catálogo' : 'acrescentada'}</small>
        ${p.ligada ? '' : `<button type="button" class="mini" data-mon="delpraga" data-fruto="${esc(fid)}" data-praga="${esc(p.id)}" aria-label="Remover ${esc(p.nome)}">Remover</button>`}</div>
      <fieldset class="pce-res"><legend>Resultado${p.opcional ? '' : ' *'}</legend><div class="pce-res-op${Object.keys(ops).length === 2 ? ' pce-res-dois' : ''}">${Object.keys(ops).map(v => `<label class="pce-res-${v}"><input type="radio" class="r-res" name="res-${esc(u)}" value="${v}" ${st.resultado === v ? 'checked' : ''}><span>${esc(ops[v])}</span></label>`).join('')}</div></fieldset>
      ${det ? `<div class="vi-det"><label>Há quanto tempo<input class="r-tempo" maxlength="60" value="${esc(st.haQuantoTempo || '')}" autocomplete="off"></label>
        ${sn('vi-ctl-' + u + '-', 'c', 'Utiliza método de controle?', st.controle || '')}
        <label>Qual controle<input class="r-qual" maxlength="120" value="${esc(st.qualControle || '')}" autocomplete="off"></label></div>` : ''}</div>`;
  }
  function passo2() {
    if (!V.sel.length) return '<div class="card tf-alerta">Marque ao menos um fruto no passo 1.</div>';
    return V.sel.map(fid => {
      const f = frutoDe(fid); if (!f) return '';
      const ps = pragasDoFruto(fid), extras = CA().pragasExtras(f.cultura).filter(p => !ps.some(x => x.id === p.id));
      return `<div class="pce-cultura" data-fruto="${esc(fid)}"><div class="pce-cultura-topo"><b>${icone('broto')} ${esc(f.cultura)}${f.cultivar ? ' (' + esc(f.cultivar) + ')' : ''}</b></div>
        <div class="pce-prs"><h4>Pragas e doenças desta cultura</h4>
        ${ps.length ? ps.map(p => blocoPraga(fid, p)).join('') : '<p class="dica" style="text-align:left">Nenhuma praga do catálogo ligada a esta cultura. Acrescente a avaliada abaixo.</p>'}
        ${extras.length ? `<label>Outra praga do catálogo<select class="vi-extra" data-fruto="${esc(fid)}">${opts(extras.map(p => p.nomePopular), '', 'Selecione')}</select></label>
          <button type="button" class="botao sec" data-mon="addpraga" data-fruto="${esc(fid)}">+ Acrescentar praga/doença</button>` : ''}</div></div>`;
    }).join('');
  }
  function passo3() {
    return V.sel.map(fid => {
      const f = frutoDe(fid); if (!f) return '';
      const st = fruto(fid), temDet = respondidas(fid).some(p => COM_DETECCAO.includes(respostaDe(fid, p).resultado));
      const sint = st.sint || (temDet ? 'sim' : 'nao'), qs = detecaoDoFruto(fid), v = st.dados || {};
      const amostra = st.coleta === 'Sim';
      return `<div class="pce-cultura" data-fruto="${esc(fid)}"><div class="pce-cultura-topo"><b>${icone('broto')} ${esc(f.cultura)}${f.cultivar ? ' (' + esc(f.cultivar) + ')' : ''}</b></div>
        <label>Plantas inspecionadas<input class="v-plantas" inputmode="numeric" maxlength="9" autocomplete="off" value="${esc(st.plantas !== '' ? st.plantas : (f.quantidade || ''))}"></label>
        ${sn(`vi-sint-${fid}-`, 's', 'Presença de sintomas?', sint)}
        ${sn(`vi-col-${fid}-`, 'c', 'Coleta de amostra?', st.coleta === 'Sim' ? 'sim' : 'nao', [['sim', 'Sim'], ['nao', 'Não']])}
        <div class="vi-amostra" ${amostra ? '' : 'hidden'}>
          <label>Tipo de material<input class="v-tipoMaterial" maxlength="60" value="${esc(st.tipoMaterial)}" autocomplete="off" placeholder="ex.: folhas, frutos"></label>
          <div class="duas"><label>Código da amostra<input class="v-codigoAmostra" maxlength="60" value="${esc(st.codigoAmostra)}" autocomplete="off"></label>
            <label>Quantidade de amostras<input class="v-qtd" inputmode="numeric" maxlength="4" value="${esc(st.qtd)}" autocomplete="off"></label></div>
          <label>Destino da amostra<input class="v-destinoAmostra" maxlength="120" value="${esc(st.destinoAmostra)}" autocomplete="off"></label></div>
        ${qs.length ? `<div class="vi-deteccao"><p class="mon-sub">Detecção</p>${qs.map(q => CA().perguntaHTML(q, v, `vq-${fid}-`)).join('')}</div>` : ''}
        <label class="pce-arquivo pce-arquivo-cult">${icone('camera')} Fotos deste fruto<input type="file" class="v-fotos" data-fruto="${esc(fid)}" accept="image/*" multiple></label>
        <div id="vi-fotos-${esc(fid)}" class="pce-fotos pce-fotos-cult"></div></div>`;
    }).join('');
  }
  function passo4(pgs) {
    return `<div class="card"><h3>${icone('formulario')} Ação realizada</h3>
        <p class="mon-sub">ao realizar ações de *</p>${cks('vi-', 'acoes', (TC.acoes || []).map(x => [x, x]), V.acoes)}
        <label>Local da fiscalização *<input id="vi-local" maxlength="200" value="${esc(V.local)}" autocomplete="off" placeholder="ex.: Propriedade Sítio Boa Vista, Ramal do Km 3"></label>
        <div class="duas">${inp('vi-', 'data', 'Data', V.data, `type="date" max="${hojeISO()}"`)}${inp('vi-', 'hora', 'Hora', V.hora, 'type="time"')}</div></div>
      ${pgs.map(pg => `<div class="card pce-prog" data-prog="${esc(pg.programa)}"><h3>${icone('praga')} ${esc(pg.nome)}</h3>
        <p class="dica" style="text-align:left">${esc(listaE([...new Set(pg.itens.map(i => i.cultura))]))}</p>
        <div class="mon-sub">Situação constatada (sai nas caixas do Termo)</div>
        <ul class="mon-rel-lista vi-resultados" data-prog="${esc(pg.programa)}">${resultadosDe(pg).map(x => `<li>${esc(x.praga)} (${esc(listaE(x.culturas))}): <b>${ROTULO_RES[x.resultado] || ''}</b></li>`).join('')}</ul>
        <label>Observações sobre a situação constatada (opcional)<textarea data-prog="${esc(pg.programa)}" rows="4">${esc(V.const[pg.programa] || '')}</textarea></label>
        <div class="mon-sub">Enquadramento legal (da planilha da GDV)</div><p class="vi-enq" data-prog="${esc(pg.programa)}">${esc(enquadramentoDe(pg) || 'Sem enquadramento cadastrado para as pragas deste programa.').replace(/\n/g, '<br>')}</p></div>`).join('')}`;
  }
  function passo5(pgs) {
    const col = V.sel.filter(fid => fruto(fid).coleta === 'Sim');
    return `<div class="card"><h3>${icone('assinatura')} Assinaturas</h3>
      ${U().naoAssinaHTML(V)}
      ${CONFIG.assinaturaNaTela ? `<p class="dica" style="text-align:left">Assine com o dedo, se quiser. Os documentos impressos sempre trazem as linhas para assinar no papel.</p>${U().assHTML('servidor', 'Servidor')}${U().assHTML('produtor', 'Produtor')}` : '<p class="dica" style="text-align:left">As assinaturas são feitas no papel, na impressão dos Termos.</p>'}
      <div id="vi-testemunhas" ${V.naoAssina ? '' : 'hidden'}><p class="mon-sub">Testemunhas (quando o produtor não assina)</p>
        <div class="duas">${inp('vi-', 't1nome', 'Testemunha 1 – nome', V.t1nome)}${inp('vi-', 't1doc', 'CPF/RG', V.t1doc)}</div>
        <div class="duas">${inp('vi-', 't2nome', 'Testemunha 2 – nome', V.t2nome)}${inp('vi-', 't2doc', 'CPF/RG', V.t2doc)}</div></div></div>
      <div class="card" id="vi-resumo"><h3>${icone('resumo')} Ao concluir saem</h3><ul class="mon-rel-lista">
        ${pgs.map(pg => `<li><b>${esc(pg.nome)}</b> — Termo de Fiscalização (${esc(listaE([...new Set(pg.itens.map(i => i.cultura))]))})</li>`).join('')}
        ${col.map(fid => `<li>Termo de Colheita de Amostras — ${esc((frutoDe(fid) || {}).cultura || '')}</li>`).join('')}</ul></div>`;
  }
  async function desenhar() {
    if (!V || VIEW !== 'pcevisita') return;
    const pgs = programas();
    const corpo = [passo1, passo2, passo3, () => passo4(pgs), () => passo5(pgs)][V.passo - 1]();
    view(`<form id="pceVisitaForm" autocomplete="off" novalidate>${cabecalho()}${corpo}
      <div class="vi-nav ${V.passo > 1 ? 'duas' : ''}">${V.passo > 1 ? `<button class="botao sec" type="button" data-mon="vi-voltar" id="vi-voltar">${icone('voltar')} Voltar</button>` : ''}
        ${V.passo < PASSOS.length ? `<button class="botao" type="submit" id="vi-continuar">Continuar</button>` : `<button class="botao" type="submit" id="vi-concluir">${icone('ok')} Concluir visita e gerar os Termos</button>`}</div>
      <button class="botao sec" type="button" data-mon="vi-cancelar" id="vi-cancelar">Cancelar visita</button></form>`);
    $('#pceVisitaForm').onsubmit = ev => { ev.preventDefault(); proximo().catch(e => toast(e.message || String(e), true)); };
    if (V.passo === 3) for (const fid of V.sel) await Anexos.miniaturas($('#vi-fotos-' + fid), fruto(fid).fotos, `data-mon="delfoto" data-fruto="${fid}"`);
    if (V.passo === 5 && CONFIG.assinaturaNaTela) { await U().ligarAss(V, 'servidor', salvarRascunho); await U().ligarAss(V, 'produtor', salvarRascunho); if (V.naoAssina && $('#pce-ass-produtor')) { $('#pce-ass-produtor').closest('.pce-ass').hidden = true; } }
    if (V.passo === 5) await U().renderDocProdutor(V);
  }
  /** Valida o passo atual; devolve a mensagem do que falta ou ''. */
  function faltaNoPasso(n) {
    if (n === 1) { if (!V.sel.length) return 'Marque ao menos um fruto avaliado (ou acrescente um).'; return ''; }
    if (n === 2) {
      for (const fid of V.sel) {
        const f = frutoDe(fid);
        for (const p of pragasDoFruto(fid)) {
          const r = respostaDe(fid, p);
          if (!r.resultado) return `Informe o resultado de ${p.nome} em ${f.cultura} (detectada, não detectada ou suspeita).`;
          if (COM_DETECCAO.includes(r.resultado) && r.controle === 'sim' && !String(r.qualControle).trim()) return `Informe qual controle é usado para ${p.nome} em ${f.cultura}.`;
        }
      }
      if (!programas().length) return 'Responda ao menos uma praga ou doença avaliada: o Termo é feito pelo programa dela.';
      return '';
    }
    if (n === 3) {
      for (const fid of V.sel) {
        const f = frutoDe(fid), st = fruto(fid);
        if (st.plantas !== '' && !/^\d+$/.test(st.plantas)) return `${f.cultura}: plantas inspecionadas só aceita número inteiro.`;
        if (st.coleta === 'Sim' && !st.tipoMaterial.trim()) return `${f.cultura}: informe o tipo de material da amostra.`;
        if (st.coleta === 'Sim' && !(Number(st.qtd) > 0)) return `${f.cultura}: informe a quantidade de amostras.`;
        const co = [st.dados.sintomaLat, st.dados.sintomaLon].filter(Boolean);
        if (co.length === 1) return `${f.cultura}: informe latitude e longitude da planta com sintoma.`;
        if (co.length === 2) { const r = PCEMon.lerPar(st.dados.sintomaLat, st.dados.sintomaLon); if (r.erro) return `${f.cultura}: coordenada da planta: ${r.erro}`; }
      }
      return '';
    }
    if (n === 4) {
      if (!V.acoes.length) return 'Marque a ação realizada (ex.: Fiscalização).';
      if (!V.local) return 'Informe o local da fiscalização.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(V.data) || !/^\d{2}:\d{2}/.test(V.hora)) return 'Informe a data e a hora.';
      return '';
    }
    if (n === 5) { if (V.naoAssina && !V.ass.produtorDoc) return 'Produtor não assina: tire a foto dele segurando o documento de identificação (ou desmarque a opção).'; return ''; }
    return '';
  }
  async function proximo() {
    if (!V || V.salvando) return;
    coletarPasso();
    const falta = faltaNoPasso(V.passo); if (falta) return toast(falta, true);
    salvarRascunho(0);
    if (V.passo < PASSOS.length) { V.passo++; await desenhar(); window.scrollTo(0, 0); return; }
    for (let n = 1; n < PASSOS.length; n++) { const f = faltaNoPasso(n); if (f) { V.passo = n; await desenhar(); return toast(f, true); } }
    await concluirVisita();
  }

  /* ---------- fotos e produtor que não assina ---------- */
  const reduzirFoto = file => Anexos.reduzirFoto(file, P.fotoLado, P.fotoQualidade);
  async function adicionarFotos(fid, input) {
    const files = [...(input.files || [])]; input.value = '';
    const st = fruto(fid), f = frutoDe(fid);
    for (const file of files) {
      const total = V.sel.reduce((n, x) => n + fruto(x).fotos.length, 0);
      if (total >= (P.maxFotos || 60)) { toast(`Limite de ${P.maxFotos || 60} fotos por visita.`, true); break; }
      if (!/^image\//.test(file.type || 'image/')) { toast(`"${file.name}" não é uma imagem.`, true); continue; }
      let a; try { a = Anexos.novoArquivo('termosPce', V.id, 'foto', '', 'image/jpeg', await reduzirFoto(file)); } catch (e) { toast(e.message, true); continue; }
      if (!V || !V.vivo) return;
      Object.assign(a, { praga: '', cultura: f.cultura, rotulo: f.cultura });
      await Store.gravar('arquivos', a); st.fotos.push(a.id);
    }
    await Anexos.miniaturas($('#vi-fotos-' + fid), st.fotos, `data-mon="delfoto" data-fruto="${fid}"`);
    salvarRascunho(0);
  }

  /* ---------- abrir, rascunho e cancelar ---------- */
  async function visita(arg) {
    if (bloqueado()) return view(avisoAtivacao());
    const o = arg && typeof arg === 'object' ? arg : {};
    const s = await U().exigirServidor('pcevisita', o, false); if (!s) return;
    if (!U().servidorOk(s)) { toast('Complete cargo e lotação em “Meus dados” para fazer visitas.', true); return go('pce'); }
    await CA().carregarCatalogo();
    const rasc = await Store.meta(RV);
    let retomar = null;
    if (rasc && rasc.id) {
      const mesma = !o.propId || rasc.propId === o.propId;
      if (mesma && confirm(`Há uma visita não concluída (${rasc.nomeProdutor || 'produtor'}), iniciada em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) retomar = rasc;
      else if (!mesma && !confirm(`Há uma visita não concluída de ${rasc.nomeProdutor || 'outro produtor'}, iniciada em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nDescartar essa visita e começar a nova? (Cancelar volta sem perder o rascunho.)`)) return go('pceprodutor', rasc.doc);
      else await descartarVisita(rasc);
    }
    const p = await Store.obter('propriedades', retomar ? retomar.propId : o.propId);
    if (!p || p.excluido) { toast('Propriedade não encontrada neste aparelho.', true); return go('pce'); }
    const pe = await Store.obter('pessoas', digitos(p.doc));
    fechar(); if (V) V.vivo = false;
    const base = retomar ? { ...retomar } : { id: Store.novoId(), doc: digitos(p.doc), propId: p.id, passo: 1, sel: [], F: {}, acoes: ['Fiscalização'],
      local: [p.nome ? 'Propriedade ' + p.nome : '', p.endereco, p.municipio ? `${p.municipio}/${p.uf || 'AM'}` : ''].filter(Boolean).join(', '),
      const: {}, data: hojeISO(), hora: agoraHM(), ass: {}, assNovas: {}, naoAssina: false, t1nome: '', t1doc: '', t2nome: '', t2doc: '', termoIds: {}, colheitaIds: {},
      lat: '', lon: '', prec: '' };
    const nova = Object.assign(base, { p, pe, nomeProdutor: (pe && pe.nome) || p.nome || '', serv: U().dadosServidor(s), vivo: true, salvando: false, dono: 'termosPce' });
    if (retomar && retomar.constAuto) {                               // rascunho de antes: o texto pronto saiu (as caixas do Termo o substituem); só fica o que o fiscal editou
      Object.keys(nova.const || {}).forEach(k => { if (!(nova.constEdit || {})[k]) nova.const[k] = ''; });
      delete nova.constAuto; delete nova.constEdit;
    }
    V = nova;
    const frutos = CA().frutosDe(p);
    if (!retomar && frutos.length === 1) V.sel = [frutos[0].id];
    await desenhar();
    salvarRascunho(0);
    if (!retomar) pegarLocalSilencioso().then(gps => { if (V === nova && gps) { const r = U().validarCoord(gps.lat, gps.lng); if (!r.erro) { V.lat = r.lat; V.lon = r.lon; V.prec = gps.prec; salvarRascunho(); } } }).catch(() => {});
  }
  async function descartarVisita(rasc) {
    const fotos = Object.values((rasc && rasc.F) || {}).flatMap(f => f.fotos || []);
    await Anexos.apagarSeNaoEnviado([...fotos, ...(rasc && rasc.ass && rasc.ass.produtorDoc ? [rasc.ass.produtorDoc] : [])]);
    await Store.setMeta(RV, null);
  }
  async function cancelarVisita() {
    if (!V) return;
    if (!confirm('Cancelar esta visita? Os dados e as fotos desta visita serão perdidos (o cadastro do produtor e dos frutos fica).')) return;
    const d = V.doc; clearTimeout(tV); V.vivo = false; await descartarVisita(V); V = null; go('pceprodutor', d);
  }
  async function acrescentarFruto() {
    const cultura = g('vi-nf-', 'cultura'); if (!cultura) return toast('Escolha a cultura do fruto.', true);
    const area = g('vi-nf-', 'area').trim().replace(',', '.');
    if (area && !/^\d+(\.\d+)?$/.test(area)) return toast('Área só aceita números.', true);
    coletarPasso();
    const p = await Store.obter('propriedades', V.propId), lista = JSON.parse(p.frutos || '[]');
    if (lista.filter(f => !Number(f.excluido)).length >= 60) return toast('Limite de 60 frutos por propriedade.', true);
    const f = { id: Store.novoId(), cultura, cultivar: g('vi-nf-', 'cultivar').trim(), area, espLinha: '', espPlanta: '', espUnidade: '', idade: '', quantidade: '', producao: '', destino: '', excluido: 0 };
    const nova = await Store.salvar('propriedades', { ...p, frutos: JSON.stringify([...lista, f]) });
    delete nova.pendente; V.p = await Store.obter('propriedades', V.propId); V.sel.push(f.id);
    Sync.sincronizar(); toast(`${cultura} acrescentado ao cadastro da propriedade.`);
    salvarRascunho(0); await desenhar();
  }

  /* ---------- concluir: um Termo por programa e o Termo de Colheita ---------- */
  const textoCurto = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
  function culturasDoPrograma(pg) {
    return pg.frutos.map(fid => {
      const f = frutoDe(fid), st = fruto(fid), area = f.area === '' || f.area == null ? '' : Number(f.area);
      const pragas = pg.itens.filter(i => i.fid === fid).map(i => ({ praga: i.praga, resultado: i.resultado, opcional: i.opcional ? 1 : 0, haQuantoTempo: COM_DETECCAO.includes(i.resultado) ? textoCurto(i.haQuantoTempo, 60) : '',
        controle: COM_DETECCAO.includes(i.resultado) && i.controle ? (i.controle === 'sim' ? 'Sim' : 'Não') : '', qualControle: COM_DETECCAO.includes(i.resultado) && i.controle === 'sim' ? textoCurto(i.qualControle, 120) : '' }));
      const coleta = st.coleta === 'Sim';
      const dados = { ...st.dados };
      detecaoDoFruto(fid).filter(q => q.tipo === 'coord').forEach(q => {                      // coordenada da planta vai como número: o servidor tira o "-" de texto
        const r = lerPar(dados[q.k], dados[q.k2]); if (!r.erro && !r.vazio) { dados[q.k] = r.lat; dados[q.k2] = r.lon; }
      });
      if (st.plantas !== '') dados.plantas = st.plantas; if (st.sint) dados.sintomas = st.sint; if (coleta) dados.qtdAmostras = st.qtd;
      return { cultura: f.cultura, area: area === '' || !isFinite(area) ? '' : area, pragas, coleta: coleta ? 'Sim' : 'Não', tipoMaterial: coleta ? st.tipoMaterial : '', codigoAmostra: coleta ? st.codigoAmostra : '',
        destinoAmostra: coleta ? st.destinoAmostra : '', fotos: st.fotos.slice(0, 20), dados };
    });
  }
  function montarTermo(pg, ctx) {
    const cs = culturasDoPrograma(pg), p = V.p, pe = V.pe || {}, culturasTxt = [...new Set(pg.itens.map(i => i.cultura))];
    const quadro = TC.pragas || [], mapa = TC.pragaDoLevantamento || {}, n = x => idCat(x);
    const pragasQuadro = [...new Set(pg.itens.map(i => mapa[i.praga] || (quadro.find(q => n(q) === n(i.praga)) || '')).filter(Boolean))];
    const citros = ehProgramaCitros(pg), plantas = pg.frutos.reduce((s, fid) => s + (Number(fruto(fid).plantas) || 0), 0);
    const nome = textoCurto(pe.nome || '', 120).toUpperCase(), doc = digitos(p.doc), pj = doc.length === 14;
    const temSint = pg.frutos.some(fid => fruto(fid).sint === 'sim' || (fruto(fid).sint === '' && pg.itens.some(i => i.fid === fid && COM_DETECCAO.includes(i.resultado))));
    const ativ = culturasTxtAtividade(culturasTxt);
    const lat = V.lat !== '' ? V.lat : (p.lat == null ? '' : p.lat), lon = V.lon !== '' ? V.lon : (p.lon == null ? '' : p.lon);
    const testemunhas = [{ nome: V.t1nome.trim(), doc: V.t1doc.trim() }, { nome: V.t2nome.trim(), doc: V.t2doc.trim() }].filter(x => x.nome || x.doc);
    return { id: V.termoIds[pg.programa], unidade: unid(V.serv.lotacao || p.municipio), propriedadeId: p.id, cadastroId: '', programa: citros ? 'citros' : CA().modeloDaCultura(culturasTxt[0]),
      doc, nome, atividade: ativ, empresa: p.empresa || '', cnpj: digitos(p.cnpj), atividadeEmpresa: p.empresa || pj ? ativ : '', endereco: p.endereco || '', municipio: p.municipio, uf: p.uf || 'AM',
      telefone: pe.telefone || '', lat, lon, data: V.data, hora: V.hora.slice(0, 5), ...V.serv, pragas: JSON.stringify(citros ? [...new Set([...PCECitros.nomesDeteccao(), ...pragasQuadro])] : pragasQuadro),
      tipoLocal: JSON.stringify([V.local]), acoes: JSON.stringify(V.acoes), constatacao: String(V.const[pg.programa] || '').trim(), enquadramento: enquadramentoDe(pg),
      testemunhas: JSON.stringify(testemunhas), recebidoEm: '', plantasInspecionadas: plantas, amostra: cs.some(c => c.coleta === 'Sim') ? 'sim' : 'nao', sintomas: temSint ? 'sim' : 'nao',
      hospedeiros: JSON.stringify(culturasTxt), fotos: JSON.stringify([...new Set(cs.flatMap(c => c.fotos))]), assinaturas: JSON.stringify(ctx.mapa), documentos: '[]', registroAntigo: 0, cancelado: 0, motivoCancel: '', excluido: 0,
      visitaId: V.id, programaVisita: pg.nome, culturas: JSON.stringify(cs) };
  }
  const culturasTxtAtividade = cult => (cult.length ? 'Cultivo de ' + listaE(cult.map(x => String(x).toLowerCase())) : '');
  function montarColheita(fid, ctx) {
    const f = frutoDe(fid), st = fruto(fid), p = V.p, pe = V.pe || {};
    const partes = U().partesDoMaterial(st.tipoMaterial), nomeServ = V.serv.servidor;
    const D = { data: V.data, hora: V.hora, quantidade: st.qtd, partes, cultura: f.cultura, analise: '' };
    return { id: V.colheitaIds[fid], criadoEm: Date.now(), atualizadoEm: Date.now(), unidade: unid(V.serv.lotacao || p.municipio), levantamentoId: V.id, data: V.data, hora: V.hora.slice(0, 5), ...V.serv,
      municipio: p.municipio, doc: digitos(p.doc), nome: textoCurto(pe.nome || '', 120).toUpperCase(), endereco: [p.nome, p.codigo && 'cód. ' + p.codigo].filter(Boolean).join(' – '),
      lat: V.lat !== '' ? V.lat : (p.lat == null ? '' : p.lat), lon: V.lon !== '' ? V.lon : (p.lon == null ? '' : p.lon), precisao: V.prec === '' ? '' : V.prec,
      cultura: f.cultura, quantidade: Number(st.qtd) || 1, analise: '', partes: partes.join(', '), descricao: U().textoOficial(D, nomeServ), fotos: JSON.stringify(st.fotos),
      testemunha1Nome: V.t1nome.trim(), testemunha1Doc: V.t1doc.trim(), testemunha2Nome: V.t2nome.trim(), testemunha2Doc: V.t2doc.trim(), assinaturas: JSON.stringify(ctx.mapa),
      local: (V.serv.lotacao || p.municipio || '') + '/AM', cancelado: 0, motivoCancel: '', excluido: 0 };
  }
  async function concluirVisita() {
    const st = V; if (!st || st.salvando) return;
    const btn = $('#vi-concluir'); st.salvando = true; if (btn) btn.disabled = true;
    try {
      const pgs = programas();
      const col = st.sel.filter(fid => fruto(fid).coleta === 'Sim');
      pgs.forEach(pg => { st.termoIds[pg.programa] = st.termoIds[pg.programa] || Store.novoId(); });
      col.forEach(fid => { st.colheitaIds[fid] = st.colheitaIds[fid] || Store.novoId(); });
      if (!st.assMapa) { const { mapa, novos } = Anexos.prepararAssinaturas({ ass: st.ass, assNovas: st.assNovas, dono: 'termosPce', id: st.id }); await Store.gravarVarios('arquivos', novos); st.assMapa = mapa; }
      const ctx = { mapa: st.assMapa };
      await Store.setMeta(RV, { ...(({ p, pe, serv, vivo, salvando, ...r }) => r)(st), em: Date.now() });           // ids dos Termos guardados: repetir não cria outro
      const avisos = [];
      for (const pg of pgs) {
        const rec = montarTermo(pg, ctx);
        if (await Store.obter('termosPce', rec.id)) continue;                                                          // já numerado numa tentativa anterior
        const r = await numerar('termo', rec, null, null);
        if (r.duplicado) avisos.push(`${pg.nome}: a planilha já tem o Termo ${r.duplicado.numeroTxt} desta visita; não foi criado outro.`);
      }
      for (const fid of col) {
        const rec = montarColheita(fid, ctx);
        if (await Store.obter('colheitas', rec.id)) continue;
        await U().numerarColheita(rec);
      }
      clearTimeout(tV); st.vivo = false; V = null; await Store.setMeta(RV, null);
      if (avisos.length) toast(avisos.join(' '), true);
      Sync.sincronizar();
      go('pcevisitapronto', st.id);
    } catch (e) { st.salvando = false; if (btn && btn.isConnected) btn.disabled = false; toast('Erro ao concluir: ' + (e.message || e), true); }
  }

  /** Tela depois de concluir: os Termos da visita (um por programa), o Termo de Colheita e os PDFs. */
  async function visitaPronta(id) {
    const termos = (await Store.todos('termosPce')).filter(t => t.visitaId === id && !Number(t.excluido)).sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));
    const cols = (await Store.todos('colheitas')).filter(c => c.levantamentoId === id && !Number(c.excluido));
    if (!termos.length) return go('pce');
    const t0 = termos[0], pendente = termos.some(t => t.pendente) || cols.some(c => c.pendente), doc = digitos(t0.doc);
    view(`<div class="card" id="pce-visita-pronta"><h3>${icone('ok')} Visita concluída</h3>
      <p><b>${esc(t0.nome)}</b> · ${esc(dBR(t0.data))} ${esc(t0.hora)} · ${esc(t0.municipio)}</p>
      ${pendente ? `<div class="tf-novo">${icone('sincronizar')} Aguardando envio / número provisório: a planilha confere os números ao sincronizar.</div>` : '<div class="tf-ok">✓ Números confirmados na planilha.</div>'}</div>
      ${termos.map(t => `<div class="card pce-termo-pronto" data-termo="${esc(t.id)}"><h3>${icone('formulario')} Termo de Fiscalização <span class="tf-num-inline">${esc(t.numeroTxt)}</span></h3>
        <p>${esc(t.programaVisita)} · ${esc(culturasTermo(t))}</p>${PCECads.selo(t)}
        <button class="botao" data-mon="imprimir" data-tipo="termo" data-id="${esc(t.id)}">${icone('imprimir')} Imprimir / PDF</button>
        <button class="botao sec" data-mon="enviar" data-id="${esc(t.id)}">${icone('enviar')} Enviar ao produtor</button></div>`).join('')}
      ${cols.map(c => `<div class="card pce-colheita-pronta" data-colheita="${esc(c.id)}"><h3>${icone('amostra')} Termo de Colheita <span class="tf-num-inline">${esc(c.numeroTxt)}</span></h3>
        <p>${esc(c.cultura)} · ${esc(c.quantidade)} amostra(s)</p>${PCECads.selo(c)}
        <button class="botao" data-pce="imprimirtermo" data-id="${esc(c.id)}">${icone('imprimir')} Imprimir / PDF (${P.vias || 2} vias)</button>
        <button class="botao sec" data-pce="enviartermo" data-id="${esc(c.id)}">${icone('enviar')} Enviar via do produtor</button></div>`).join('')}
      <button class="botao sec" id="vi-voltar-produtor" data-mon="produtor" data-cpf="${esc(doc)}">${icone('pessoa')} Voltar ao produtor</button>
      <button class="botao sec" data-v="pcetermos">${icone('formulario')} Ver todos os termos</button>
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto.</p>`);
  }
  const culturasTermo = t => arr(lerJSON(t.culturas, [])).map(c => c.cultura).join(', ');
  const arr = x => (Array.isArray(x) ? x : []);

  /* ================= eventos da visita ================= */
  /** Mudança num campo da visita: guarda no estado e, se o passo muda de aparência (resultado, coleta, sem assinatura), redesenha. */
  async function visitaMudou(el, tipo) {
    if (!V || !V.vivo || !el.closest || !el.closest('#pceVisitaForm')) return;
    coletarPasso();
    if (el.classList && el.classList.contains('r-res') && tipo !== 'input') {
      const y = window.scrollY; await desenhar(); window.scrollTo(0, y);
    } else if (el.name && /^vi-col-/.test(el.name)) {
      const b = el.closest('.pce-cultura'), sim = rv(el.name.replace(/c$/, ''), 'c') === 'sim', am = b && b.querySelector('.vi-amostra');
      if (am) am.hidden = !sim;
      fruto(b.dataset.fruto).coleta = sim ? 'Sim' : 'Não';
    } else if (el.id === 'pce-naoassina') await U().naoAssina(V, el.checked, salvarRascunho, () => { const t = $('#vi-testemunhas'); if (t) t.hidden = !el.checked; });
    else if (el.id === 'pce-docprod-in') await U().fotoDocProdutor(V, el, salvarRascunho);
    else if (el.classList && el.classList.contains('v-fotos')) await adicionarFotos(el.dataset.fruto, el);
    salvarRascunho();
  }
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#pceVisitaForm')) { if (e.target.classList.contains('r-res')) return; visitaMudou(e.target, 'input').catch(() => {}); } });
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#pceVisitaForm')) visitaMudou(e.target, 'change').catch(err => toast(err.message || String(err), true)); });

  /* ================= ações (cliques) ================= */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-mon]'); if (!el) return;
    const a = el.dataset.mon, id = el.dataset.id, tipo = el.dataset.tipo;
    try {
      if (a === 'novo') go('pcetf', el.dataset.antigo ? { antigo: true } : null);
      else if (a === 'abrir') go('pcetf', id);
      else if (a === 'imprimir') await imprimir(tipo, id);
      else if (a === 'enviar') await enviar(id);
      else if (a === 'produtor') go('pceprodutor', el.dataset.cpf);
      else if (a === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        const t = await Store.obter('termosPce', id); await Store.salvar('termosPce', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); U().termos();
      }
      else if (a === 'relimprimir') await gerarRelatorio();
      else if (a === 'relarquivo') await gerarRelatorio('arquivo');
      else if (a === 'vi-voltar') { coletarPasso(); if (V && V.passo > 1) { V.passo--; salvarRascunho(0); await desenhar(); window.scrollTo(0, 0); } }
      else if (a === 'vi-cancelar') await cancelarVisita();
      else if (a === 'addfruto') await acrescentarFruto();
      else if (a === 'addpraga') {
        const fid = el.dataset.fruto, sel = document.querySelector(`.vi-extra[data-fruto="${fid}"]`), p = sel && CA().pragasCat().find(x => x.nomePopular === sel.value);
        if (!p) return toast('Escolha a praga/doença a acrescentar.', true);
        coletarPasso(); const st = fruto(fid); if (!st.extras.includes(p.id)) st.extras.push(p.id);
        salvarRascunho(0); await desenhar();
      }
      else if (a === 'delpraga') { coletarPasso(); const st = fruto(el.dataset.fruto); st.extras = st.extras.filter(x => x !== el.dataset.praga); delete st.pragas[el.dataset.praga]; salvarRascunho(0); await desenhar(); }
      else if (a === 'delfoto') {
        const fid = el.dataset.fruto, st = fruto(fid); st.fotos = st.fotos.filter(x => x !== id);
        await Anexos.apagarSeNaoEnviado([id]); await Anexos.miniaturas($('#vi-fotos-' + fid), st.fotos, `data-mon="delfoto" data-fruto="${fid}"`); salvarRascunho(0);
      }
      else if (a === 'limparass' && V && V.vivo) U().limparAssinatura(V, el.dataset.papel, salvarRascunho);
      else if (a === 'deldocprod' && V && V.vivo) { await PCEUI.soltarDocProdutor(V); await U().renderDocProdutor(V); salvarRascunho(0); }
      else if (!F) return;
      else if (a === 'gps') await usarGPS(el.dataset.pref);
      else if (a === 'deldoc') { F.docs = F.docs.filter(x => x !== id); if (!Anexos.idsArquivos(F.rec).has(id)) await Anexos.apagarSeNaoEnviado([id]); await renderDocs(PT); agendar(0); }
      else if (a === 'negativa') { const t = $('#' + PT + 'constatacao'); t.value = TC.constatacaoNegativa || ''; agendar(0); }
      else if (a === 'salvaroutro') await salvarTf(true);
      else if (a === 'descartar') {
        if (!confirm('Descartar este formulário? Os dados preenchidos serão perdidos.')) return;
        const salvo = Anexos.idsArquivos(F.rec), docs = F.docs.filter(x => !salvo.has(x));
        fechar(); await Anexos.apagarSeNaoEnviado(docs); await Store.setMeta(RASC.termo, null); go('pcetermos');
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  // peças comuns que o pce-cadastros.js reaproveita (perguntas sim/não, caixas, campos e número da ficha)
  const nucleo = { sn, cks, inp, rv, cv, g, opts };

  return { visita, visitaPronta, termo: termoForm, pronto: prontoPapel, relatorio, gerarRelatorio, lerEixo, lerPar, lerNumeroDoc, numero, propIdDe, imprimir, numerar, nucleo };
})();
