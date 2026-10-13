// PCE em campo: dados do(s) município(s) no aparelho (sem internet), mapa "Propriedades perto de mim" e rota das visitas.
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, pad, pegarLocal, pegarLocalSilencioso) e do pce.js em tempo de execução.
//
// Dados baixados (action pceBaixarMunicipio do Code.gs, só com o módulo PCE): ficam nos stores "propriedades" e "pessoas", com
// campoMun (município baixado; nas pessoas, a lista) e resumoLev {n, ultimo, ultimoHora, pragas:[{praga, resultado}]} nas propriedades.
// Meta "pceCampo" = {MUNICÍPIO NORMALIZADO: {municipio, baixadoEm, nProps, nPessoas}}; meta "pceRota" = {ids, manual}.
const Campo = (() => {
  const P = CONFIG.PCE;
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digitos = v => String(v || '').replace(/\D/g, '');
  const INTERVALO_MS = 6 * 3600e3;                                       // atualização automática: no máximo 1x a cada 6 h
  const DIAS_VISITA = 180;                                              // levantamento mais antigo que isso = "precisa de visita" (vermelho)
  const RAIOS = [5, 10, 25, 50];
  const CORES = { nunca: '#d32f2f', antigo: '#d32f2f', deteccao: '#e0a800', ok: '#2e7d32' };
  const ROTULO = { nunca: 'Nunca levantada', antigo: `Último levantamento há mais de ${DIAS_VISITA} dias`, deteccao: 'Última com detecção/suspeita', ok: `Levantada há até ${DIAS_VISITA} dias, sem detecção` };
  const fmtDH = ms => { const d = new Date(Number(ms) || 0); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtKm = km => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 })} km`);
  const fmtDoc = d => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);

  /* ================= dados no aparelho ================= */
  const lerMeta = async () => (await Store.meta('pceCampo')) || {};
  /** Produtores com levantamento/termo ainda não enviado: os dados deles não saem do aparelho ao apagar. */
  async function docsEmUso() {
    const s = new Set();
    [...await Store.todos('levantamentos'), ...await Store.todos('colheitas')].forEach(r => { if (r.pendente && !r.excluido) s.add(digitos(r.doc)); });
    return s;
  }
  /** campoMun das pessoas = municípios baixados das propriedades delas. Sem nenhum: some do aparelho (se não estiver pendente nem em uso). */
  async function ajustarPessoas(uso) {
    const porDoc = {};
    (await Store.todos('propriedades')).forEach(p => { if (p.campoMun) (porDoc[digitos(p.doc)] = porDoc[digitos(p.doc)] || new Set()).add(p.campoMun); });
    const del = [], upd = [];
    (await Store.todos('pessoas')).filter(x => Array.isArray(x.campoMun)).forEach(x => {
      const m = [...(porDoc[digitos(x.id)] || [])];
      if (m.length) { if (m.join('|') !== x.campoMun.join('|')) upd.push({ ...x, campoMun: m }); }
      else if (!x.pendente && !uso.has(digitos(x.id))) del.push(x.id);
      else { const o = { ...x }; delete o.campoMun; upd.push(o); }
    });
    await Store.apagar('pessoas', del);
    await Store.gravarVarios('pessoas', upd);
  }
  /** Grava o que veio do servidor. Registro local ainda não enviado (pendente) nunca é sobrescrito. */
  async function aplicar(r, pedidos) {
    const agora = Date.now(), chaves = new Set(pedidos.map(norm));
    const props = (r.propriedades || []).filter(p => p && p.id), pessoas = (r.pessoas || []).filter(p => p && p.id);
    const novos = new Set(props.map(p => p.id));
    // saiu da planilha (ou mudou de município) desde o último download: some do aparelho (só o que foi baixado e não tem edição local)
    const velhos = (await Store.todos('propriedades')).filter(p => p.campoMun && chaves.has(norm(p.campoMun)) && !novos.has(p.id) && !p.pendente);
    await Store.apagar('propriedades', velhos.map(p => p.id));
    await Store.mesclar('propriedades', props, (local, row) => (local && local.pendente ? { ...local, campoMun: row.campoMun, resumoLev: row.resumoLev }
      : { ...row, pendente: 0, baixadoEm: agora }));
    await Store.mesclar('pessoas', pessoas, (local, row) => {
      const mun = [...new Set([...((local && Array.isArray(local.campoMun) && local.campoMun) || []), ...(row.campoMun || [])])];
      return local && local.pendente ? { ...local, campoMun: mun } : { ...(local || {}), ...row, campoMun: mun, pendente: 0, baixadoEm: agora };
    });
    await ajustarPessoas(await docsEmUso());
    const m = await lerMeta();
    (r.municipios || []).forEach(x => { m[norm(x.municipio)] = { municipio: x.municipio, baixadoEm: agora, nProps: x.nProps, nPessoas: x.nPessoas }; });
    await Store.setMeta('pceCampo', m);
    return r.municipios || [];
  }
  /** Baixa um município de cada vez (progresso e limite de propriedades por chamada). */
  async function baixar(municipios, progresso) {
    const feitos = [];
    for (const [i, mun] of municipios.entries()) {
      if (progresso) progresso(`Baixando ${mun} (${i + 1} de ${municipios.length})…`);
      let r;
      try { r = await Sync.pceBaixarMunicipio([mun]); }
      catch (e) {
        if (/a[cç][aã]o inv[aá]lida/i.test(e.message)) throw new Error('A planilha ainda não tem esta função: a gerência precisa atualizar o Code.gs (nova versão da implantação).');
        if (e.name === 'AbortError' || e.name === 'TypeError') throw new Error('Sem resposta da planilha. Confira a internet e tente de novo.');
        throw e;
      }
      feitos.push(...await aplicar(r, [mun]));
    }
    return feitos;
  }
  /** Apaga do aparelho os dados baixados de um município (o que tem levantamento/termo pendente fica, como dado comum). */
  async function apagar(municipio) {
    const K = norm(municipio), uso = await docsEmUso();
    const props = (await Store.todos('propriedades')).filter(p => p.campoMun && norm(p.campoMun) === K);
    const fora = props.filter(p => !p.pendente && !uso.has(digitos(p.doc))), ficam = props.filter(p => !fora.includes(p));
    await Store.apagar('propriedades', fora.map(p => p.id));
    await Store.gravarVarios('propriedades', ficam.map(p => { const o = { ...p }; delete o.campoMun; return o; }));
    await ajustarPessoas(uso);
    const m = await lerMeta(); delete m[K]; await Store.setMeta('pceCampo', m);
    const r = await lerRota(), sai = new Set(fora.map(p => p.id));
    if (r.ids.some(id => sai.has(id))) await gravarRota({ ...r, ids: r.ids.filter(id => !sai.has(id)) });
    return { apagadas: fora.length, mantidas: ficam.length };
  }
  let tentadoEm = 0, auto = false;
  /** Chamado ao fim de cada sincronização: atualiza os municípios baixados há mais de 6 h (melhor esforço, em silêncio). */
  async function atualizarSozinho() {
    if (auto || !Sync.ativado() || localStorage.getItem('gdv.revogado') || !navigator.onLine || !Sync.pode('pce')) return false;
    const venc = Object.values(await lerMeta()).filter(x => Date.now() - (Number(x.baixadoEm) || 0) >= INTERVALO_MS).map(x => x.municipio);
    if (!venc.length || Date.now() - tentadoEm < 15 * 60e3) return false;
    tentadoEm = Date.now(); auto = true;
    try { await baixar(venc); if (VIEW_CAMPO() === 'pcecampo') telaBaixar(); return true; } finally { auto = false; }
  }
  const VIEW_CAMPO = () => (typeof VIEW !== 'undefined' ? VIEW : '');
  /** LGPD: a gerência tirou o módulo PCE ou revogou o aparelho → os dados baixados saem do aparelho (o que tem registro pendente fica). */
  async function limparSeSemAcesso() {
    if (!(localStorage.getItem('gdv.revogado') || !Sync.pode('pce'))) return false;
    const m = Object.values(await lerMeta()); if (!m.length) return false;
    for (const x of m) await apagar(x.municipio);
    await gravarRota({ ids: [], manual: false });
    return true;
  }
  window.addEventListener('gdv-permissoes', () => { limparSeSemAcesso().catch(() => {}); });
  window.addEventListener('gdv-dados', () => { limparSeSemAcesso().catch(() => {}); });

  /* ================= busca (CPF já existe no pce.js; aqui: nome do produtor, propriedade ou código) ================= */
  async function buscar(q, limite = 20) {
    const t = norm(q), d = digitos(q), pal = t.split(' ').filter(Boolean);
    if (t.length < 2 && d.length < 3) return [];
    const pes = new Map((await Store.todos('pessoas')).map(p => [digitos(p.id), p]));
    const props = (await Store.todos('propriedades')).filter(p => !p.excluido);
    const casa = txt => pal.length && pal.every(w => txt.includes(w));
    const res = [], comProp = new Set();
    props.forEach(p => {
      const pe = pes.get(digitos(p.doc)) || null; comProp.add(digitos(p.doc));
      if (casa(norm([p.nome, p.codigo, pe && pe.nome].join(' '))) || (d.length >= 3 && (digitos(p.doc).includes(d) || digitos(p.codigo).includes(d)))) res.push({ prop: p, pessoa: pe });
    });
    pes.forEach((pe, doc) => { if (!comProp.has(doc) && (casa(norm(pe.nome)) || (d.length >= 3 && doc.includes(d)))) res.push({ prop: null, pessoa: pe }); });
    const nome = x => norm((x.pessoa && x.pessoa.nome) || '') + ' ' + norm((x.prop && x.prop.nome) || '');
    return res.sort((a, b) => nome(a).localeCompare(nome(b))).slice(0, limite);
  }
  /** Texto para a consulta sem internet: de quando são os dados baixados que servem a este CPF/CNPJ. */
  async function textoOffline(doc) {
    const m = await lerMeta(), muns = Object.values(m);
    if (!muns.length) return 'só os dados deste aparelho (nenhum município baixado para o campo)';
    const meus = new Set((await Store.todos('propriedades')).filter(p => p.campoMun && digitos(p.doc) === doc).map(p => norm(p.campoMun)));
    const pe = await Store.obter('pessoas', doc); if (pe && Array.isArray(pe.campoMun)) pe.campoMun.forEach(x => meus.add(norm(x)));
    const lista = (meus.size ? muns.filter(x => meus.has(norm(x.municipio))) : muns);
    const txt = lista.map(x => `${x.municipio} em ${fmtDH(x.baixadoEm)}`).join('; ');
    return meus.size ? `dados baixados (${txt})` : `dados baixados (${txt}) — este CPF/CNPJ não está neles`;
  }

  /* ================= histórico e cores ================= */
  function deteccoesLocal(l) {
    return Docs.pceGrupos(l).pragas.filter(g => g.culturas.some(c => c.resultado !== 'nao_detectada'))
      .map(g => ({ praga: g.praga || 'Praga não informada', resultado: g.culturas.some(c => c.resultado === 'detectada') ? 'detectada' : 'suspeita' }));
  }
  /** Resumo do servidor + levantamentos feitos neste aparelho para a mesma propriedade (código ou produtor + nome). */
  function historico(p, levs) {
    const r = p.resumoLev && typeof p.resumoLev === 'object' ? p.resumoLev : { n: 0, ultimo: '', pragas: [] };
    const cod = norm(p.codigo), doc = digitos(p.doc), nome = norm(p.nome);
    const loc = levs.filter(l => (cod && norm(l.codigoPropriedade) === cod) || (doc && digitos(l.doc) === doc && nome && norm(l.propriedade) === nome))
      .sort((a, b) => ((b.data || '') + (b.hora || '')).localeCompare((a.data || '') + (a.hora || '')));
    let ultimo = r.ultimo || '', pragas = Array.isArray(r.pragas) ? r.pragas : [];
    if (loc[0] && (loc[0].data || '') >= ultimo) { ultimo = loc[0].data || ultimo; pragas = deteccoesLocal(loc[0]); }
    const pend = loc.filter(l => l.pendente).length, n = Math.max(Number(r.n) || 0, loc.length - pend) + pend;   // pendentes ainda não estão no resumo do servidor
    let st = 'ok';
    if (!ultimo) st = 'nunca';
    else if ((Date.now() - new Date(ultimo + 'T12:00:00').getTime()) / 864e5 > DIAS_VISITA) st = 'antigo';
    else if (pragas.length) st = 'deteccao';
    return { n, ultimo, pragas, st };
  }
  const coord = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return String(v == null ? '' : v).trim() !== '' && isFinite(n) ? n : null; };
  function haversine(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** Propriedades do aparelho com produtor, histórico e coordenadas. */
  async function carregar() {
    const pes = new Map((await Store.todos('pessoas')).map(p => [digitos(p.id), p]));
    const levs = (await Store.todos('levantamentos')).filter(l => !l.excluido);
    const itens = (await Store.todos('propriedades')).filter(p => !p.excluido).map(p => {
      const lat = coord(p.lat), lon = coord(p.lon), ok = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
      return { id: p.id, p, pe: pes.get(digitos(p.doc)) || null, h: historico(p, levs), lat: ok ? lat : null, lon: ok ? lon : null, dist: null };
    });
    return { itens, porId: new Map(itens.map(x => [x.id, x])), meta: await lerMeta() };
  }
  const nomeProdutor = x => (x.pe && x.pe.nome) || 'Produtor sem cadastro';
  const seloHist = h => `<span class="campo-selo campo-${h.st}" title="${esc(ROTULO[h.st])}"></span>`;
  const textoHist = h => (h.ultimo ? `Último levantamento: ${esc(dBR(h.ultimo))} (${h.n} no total)` : 'Nenhum levantamento registrado')
    + (h.pragas.length ? ` · <b class="campo-det">${h.pragas.map(g => esc(g.praga) + (g.resultado === 'suspeita' ? ' (suspeita)' : '')).join(', ')}</b>` : '');

  /* ================= rota ================= */
  const lerRota = async () => { const r = (await Store.meta('pceRota')) || {}; return { ids: Array.isArray(r.ids) ? r.ids : [], manual: !!r.manual }; };
  const gravarRota = r => Store.setMeta('pceRota', { ids: r.ids, manual: !!r.manual });
  /** Vizinho mais próximo a partir da posição atual (ou da 1ª parada) + melhoria 2-opt (caminho aberto, início fixo). */
  function ordenar(itens, pos) {
    const com = itens.filter(x => x.lat != null), sem = itens.filter(x => x.lat == null);
    if (com.length < 2) return [...com, ...sem];
    const resto = com.slice(), out = [];
    let atual = pos ? { lat: pos.lat, lon: pos.lng } : null;
    if (!atual) { atual = resto.shift(); out.push(atual); }
    while (resto.length) {
      let mi = 0, md = Infinity;
      resto.forEach((x, i) => { const d = haversine(atual, x); if (d < md) { md = d; mi = i; } });
      atual = resto.splice(mi, 1)[0]; out.push(atual);
    }
    const seq = pos ? [{ lat: pos.lat, lon: pos.lng }, ...out] : out;
    for (let volta = 0, melhorou = true; melhorou && volta < 60; volta++) {
      melhorou = false;
      for (let i = 1; i < seq.length - 1; i++) for (let k = i + 1; k < seq.length; k++) {
        const a = seq[i - 1], b = seq[i], c = seq[k], d = seq[k + 1];
        const antes = haversine(a, b) + (d ? haversine(c, d) : 0), depois = haversine(a, c) + (d ? haversine(b, d) : 0);
        if (depois < antes - 1e-9) { seq.splice(i, k - i + 1, ...seq.slice(i, k + 1).reverse()); melhorou = true; }
      }
    }
    return [...(pos ? seq.slice(1) : seq), ...sem];
  }
  /** Links do Google Maps: até 9 paradas intermediárias por link (limite do Google); acima disso, em trechos. */
  function urlsGoogle(pos, pontos) {
    const c = p => `${Number(p.lat).toFixed(6)},${Number(p.lon).toFixed(6)}`;
    let resto = pontos.slice(), origem = pos ? c({ lat: pos.lat, lon: pos.lng }) : null;
    if (!origem && resto.length > 1) origem = c(resto.shift());
    const urls = [];
    while (resto.length) {
      const trecho = resto.splice(0, 10), dest = trecho.pop(), q = new URLSearchParams({ api: '1' });
      if (origem) q.set('origin', origem);
      q.set('destination', c(dest));
      if (trecho.length) q.set('waypoints', trecho.map(c).join('|'));
      q.set('travelmode', 'driving');
      urls.push('https://www.google.com/maps/dir/?' + q.toString());
      origem = c(dest);
    }
    return urls;
  }
  async function alternarRota(id) {
    const r = await lerRota();
    if (r.ids.includes(id)) r.ids = r.ids.filter(x => x !== id);
    else r.ids.push(id);
    if (!r.manual && r.ids.length > 1) {                                 // ordem sugerida, enquanto o servidor não reordenar à mão
      const D = await carregar(), pos = await posicaoSilenciosa();
      r.ids = ordenar(r.ids.map(x => D.porId.get(x)).filter(Boolean), pos).map(x => x.id);
    }
    await gravarRota(r);
    return r;
  }
  async function posicaoSilenciosa() { try { return await pegarLocalSilencioso(); } catch (e) { return null; } }

  /* ================= tela: baixar dados para o campo ================= */
  async function telaBaixar() {
    const mostrar = tela();
    const m = await lerMeta(), lista = Object.values(m).sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));
    if (!mostrar.viva()) return;
    mostrar(`<div class="card" id="campo-topo"><h3>📥 Dados para o campo</h3>
        <p class="dica" style="text-align:left">Antes de sair, <b>com internet</b>, baixe os produtores e as propriedades do(s) município(s) da viagem. Sem internet, a busca por CPF, nome ou código, a ficha e o mapa usam esses dados. Com internet, eles se atualizam sozinhos (a cada 6 h).</p>
        <p class="dica campo-lgpd" style="text-align:left">🔒 São dados pessoais (LGPD): use só no serviço e <b>apague do aparelho ao voltar</b>.</p></div>
      <div class="card" id="campo-baixados"><h3>Neste aparelho</h3>${lista.length ? lista.map(x => `<div class="campo-mun" data-mun="${esc(x.municipio)}">
          <div><b>${esc(x.municipio)}</b> — ${x.nProps} propriedade(s), ${x.nPessoas} produtor(es) <small>— baixado em ${esc(fmtDH(x.baixadoEm))}</small></div>
          <div class="campo-mun-acoes"><button class="mini" data-campo="atualizar" data-mun="${esc(x.municipio)}">Atualizar</button>
          <button class="mini campo-apagar" data-campo="apagar" data-mun="${esc(x.municipio)}">Apagar do aparelho</button></div></div>`).join('')
        : '<div class="vazio">Nenhum município baixado.</div>'}</div>
      <div class="card"><h3>Baixar municípios</h3>
        <label>Filtrar<input id="campo-filtro" placeholder="Nome do município" autocomplete="off"></label>
        <div class="campo-muns" id="campo-muns">${P.municipios.map(x => `<label class="chk"><input type="checkbox" name="campo-mun" value="${esc(x)}" ${m[norm(x)] ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
        <button class="botao" type="button" data-campo="baixar" id="campo-baixar">📥 Baixar selecionados</button>
        <div id="campo-st" class="tf-status" aria-live="polite"></div></div>
      <button class="botao sec" data-v="pcemapa">🗺️ Propriedades perto de mim</button>
      <button class="botao sec" data-v="pce">📋 Voltar aos levantamentos</button>`);
    $('#campo-filtro').oninput = e => { const q = norm(e.target.value); document.querySelectorAll('#campo-muns label').forEach(l => { l.hidden = !!q && !norm(l.textContent).includes(q); }); };
  }
  async function executarBaixar(muns) {
    const st = $('#campo-st'), btn = $('#campo-baixar');
    if (!muns.length) return toast('Marque pelo menos um município.', true);
    if (!navigator.onLine) return toast('Sem internet: baixe os dados antes de sair, com conexão.', true);
    if (!Sync.ativado()) return toast('Aparelho não ativado.', true);
    if (btn) btn.disabled = true;
    const msg = t => { const s = $('#campo-st'); if (s) s.innerHTML = `<small>${esc(t)}</small>`; };
    try {
      const r = await baixar(muns, msg);
      toast(`Dados baixados: ${r.map(x => `${x.municipio} (${x.nProps})`).join(', ')}.`);
      if (VIEW_CAMPO() === 'pcecampo') await telaBaixar();
    } catch (e) {
      if (st && st.isConnected) st.innerHTML = `<div class="tf-alerta">⚠️ ${esc(e.message)}</div>`;
      toast(e.message, true);
    } finally { if (btn && btn.isConnected) btn.disabled = false; }
  }

  /* ================= tela: mapa "perto de mim" ================= */
  let leafletP = null, GEO = null, MAPA = null;
  function carregarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (!leafletP) leafletP = new Promise((ok, no) => {
      if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'painel/vendor/leaflet/leaflet.css'; l.dataset.leaflet = '1'; document.head.append(l); }
      const s = document.createElement('script'); s.src = 'painel/vendor/leaflet/leaflet.js';
      s.onload = () => ok(); s.onerror = () => { leafletP = null; s.remove(); no(new Error('Mapa indisponível neste aparelho. Abra o app com internet uma vez para guardar o mapa.')); };
      document.head.append(s);
    });
    return leafletP;
  }
  async function contornos() {
    if (!GEO) { try { GEO = await (await fetch('painel/dados/am-municipios.json')).json(); } catch (e) { GEO = null; } }
    return GEO;
  }
  const S = { D: null, pos: null, raio: '', q: '', sel: '', rota: { ids: [], manual: false } };
  const lsGetC = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSetC = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* preferência só deste aparelho */ } };

  async function telaMapa() {
    const mostrar = tela();
    const D = await carregar(), rota = await lerRota();
    if (!mostrar.viva()) return;
    if (MAPA) { try { MAPA.map.remove(); } catch (e) { /* tela anterior */ } MAPA = null; }
    Object.assign(S, { D, rota, sel: '', q: '', raio: lsGetC('gdv.campoRaio') || '' });
    const nMun = Object.keys(D.meta).length;
    mostrar(`<div class="card campo-mapa-card"><h3>🗺️ Propriedades perto de mim</h3>
        ${nMun ? '' : `<div class="tf-novo" id="campo-semdados">Nenhum município baixado: o mapa mostra só as propriedades já usadas neste aparelho. <button class="mini" data-v="pcecampo">📥 Baixar dados</button></div>`}
        <div id="campo-mapa" class="campo-mapa" role="region" aria-label="Mapa das propriedades"></div>
        <div class="campo-legenda"><span><i class="campo-selo campo-nunca"></i> Nunca levantada ou há mais de ${DIAS_VISITA} dias</span>
          <span><i class="campo-selo campo-deteccao"></i> Última com detecção/suspeita</span><span><i class="campo-selo campo-ok"></i> Levantada há até ${DIAS_VISITA} dias, sem detecção</span>
          <span><i class="campo-selo campo-eu"></i> Você</span></div>
        <div class="campo-pos"><span id="campo-pos-st" class="dica"></span><button class="mini" data-campo="pos" id="campo-pos">📍 Minha posição</button></div></div>
      <div id="campo-cartao"></div>
      <button class="botao sec" data-v="pcerota" id="campo-rota-btn">🧭 Rota (${rota.ids.length})</button>
      <div class="card"><div class="duas"><label>Raio<select id="campo-raio"><option value="">Todas</option>${RAIOS.map(r => `<option value="${r}" ${String(r) === S.raio ? 'selected' : ''}>até ${r} km</option>`).join('')}</select></label>
        <label>Buscar<input id="campo-q" placeholder="Produtor, propriedade ou código" autocomplete="off"></label></div></div>
      <div id="campo-lista"></div>`);
    $('#campo-raio').onchange = e => { S.raio = e.target.value; lsSetC('gdv.campoRaio', S.raio); desenhar(); };
    $('#campo-q').oninput = e => { S.q = e.target.value; desenhar(); };
    S.pos = null;
    try { await iniciarMapa(); } catch (e) { const el = $('#campo-mapa'); if (el) el.innerHTML = `<div class="vazio">${esc(e.message)}</div>`; }
    if (!mostrar.viva()) return;
    desenhar();
    const g = await posicaoSilenciosa();
    if (g && mostrar.viva()) { S.pos = g; desenhar(true); }
    else if (mostrar.viva()) $('#campo-pos-st').textContent = 'Toque em “Minha posição” para ver as distâncias.';
  }
  async function iniciarMapa() {
    await carregarLeaflet();
    const el = $('#campo-mapa'); if (!el) return;
    const map = L.map(el, { zoomSnap: 0.5, minZoom: 4, maxZoom: 18, attributionControl: true });
    map.attributionControl.setPrefix(false);
    MAPA = { map, el, tiles: null, pontos: L.layerGroup().addTo(map), eu: null, linha: null };
    const geo = await contornos();
    if (geo && MAPA && MAPA.map === map) MAPA.geo = L.geoJSON(geo, { interactive: false, style: { color: '#5b5a56', weight: 1, opacity: 0.8, fillColor: '#e8efe3', fillOpacity: navigator.onLine ? 0.08 : 1 } }).addTo(map);
    tiles();
    map.fitBounds([[-9.9, -73.9], [2.3, -56.1]]);
  }
  /** Fundo de ruas (OpenStreetMap) só com internet; sem internet ficam os contornos e os pontos. */
  function tiles() {
    if (!MAPA) return;
    const on = navigator.onLine;
    if (on && !MAPA.tiles) {
      MAPA.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(MAPA.map);
      MAPA.el.classList.remove('campo-sem-tiles');
    } else if (!on && MAPA.tiles) { MAPA.map.removeLayer(MAPA.tiles); MAPA.tiles = null; }
    if (!on) MAPA.el.classList.add('campo-sem-tiles');
    if (MAPA.geo) MAPA.geo.setStyle({ fillOpacity: on ? 0.08 : 1 });               // sem ruas: municípios preenchidos (contornos legíveis)
  }
  window.addEventListener('online', tiles); window.addEventListener('offline', tiles);

  /** Itens da lista: filtro de busca e raio; ordem por distância (sem posição: por nome); sem coordenadas no fim. */
  function filtrados() {
    const pal = norm(S.q).split(' ').filter(Boolean), qd = digitos(S.q), raio = Number(S.raio) || 0;
    const pos = S.pos ? { lat: S.pos.lat, lon: S.pos.lng } : null;
    const v = S.D.itens.filter(x => {
      x.dist = pos && x.lat != null ? haversine(pos, x) : null;
      if (pal.length) { const t = norm([nomeProdutor(x), x.p.nome, x.p.codigo, x.p.municipio].join(' ')); if (!(pal.every(w => t.includes(w)) || (qd.length >= 3 && digitos(x.p.doc).includes(qd)))) return false; }
      if (raio && pos) return x.dist == null ? false : x.dist <= raio;
      return true;
    });
    const nome = x => norm(nomeProdutor(x) + ' ' + x.p.nome);
    return v.sort((a, b) => (a.lat == null) - (b.lat == null) || (a.dist != null && b.dist != null ? a.dist - b.dist : 0) || nome(a).localeCompare(nome(b)));
  }
  function desenhar(centrar) {
    if (!S.D || !$('#campo-lista')) return;
    const v = filtrados(), com = v.filter(x => x.lat != null), sem = v.filter(x => x.lat == null), MAX = 150;
    const st = $('#campo-pos-st');
    if (st) st.textContent = S.pos ? `📍 Sua posição: ${S.pos.lat.toFixed(5)}, ${S.pos.lng.toFixed(5)} (± ${S.pos.prec} m)` : 'Sem a sua posição: lista por nome.';
    if (MAPA) {
      MAPA.pontos.clearLayers();
      const rend = com.length > 800 ? L.canvas() : undefined;              // muitos pontos: desenho em canvas (mais leve)
      com.forEach(x => {
        L.circleMarker([x.lat, x.lon], { renderer: rend, radius: x.id === S.sel ? 10 : 7, color: '#fff', weight: 2, fillColor: CORES[x.h.st], fillOpacity: 0.95,
          className: `campo-ponto campo-ponto-${x.h.st}` }).on('click', () => selecionar(x.id)).bindTooltip(`${esc(nomeProdutor(x))} — ${esc(x.p.nome || x.p.codigo || '')}`).addTo(MAPA.pontos);
      });
      if (S.pos) {
        if (MAPA.eu) MAPA.map.removeLayer(MAPA.eu);
        MAPA.eu = L.circleMarker([S.pos.lat, S.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#0B5ED7', fillOpacity: 1, className: 'campo-eu' }).bindTooltip('Você').addTo(MAPA.map);
      }
      const ids = S.rota.ids.map(id => S.D.porId.get(id)).filter(x => x && x.lat != null);
      if (MAPA.linha) { MAPA.map.removeLayer(MAPA.linha); MAPA.linha = null; }
      if (ids.length) MAPA.linha = L.polyline([...(S.pos ? [[S.pos.lat, S.pos.lng]] : []), ...ids.map(x => [x.lat, x.lon])], { color: '#0B5ED7', weight: 3, dashArray: '6 6', opacity: 0.8, className: 'campo-rota-linha' }).addTo(MAPA.map);
      if (centrar) {
        const perto = com.slice(0, 15).map(x => [x.lat, x.lon]);
        if (S.pos) MAPA.map.fitBounds(L.latLngBounds([[S.pos.lat, S.pos.lng], ...perto]).pad(0.15), { maxZoom: 13 });
      } else if (!S.pos && com.length) MAPA.map.fitBounds(L.latLngBounds(com.map(x => [x.lat, x.lon])).pad(0.15), { maxZoom: 12 });
    }
    const item = x => `<button type="button" class="item campo-item${x.id === S.sel ? ' sel' : ''}" data-campo="ver" data-id="${esc(x.id)}">
        <span class="campo-item-topo">${seloHist(x.h)}<b>${esc(nomeProdutor(x))}</b><span class="campo-dist">${x.dist != null ? 'a ' + esc(fmtKm(x.dist)) : x.lat == null ? 'sem localização' : ''}</span></span>
        <span class="campo-item-sub">${esc([x.p.nome || 'Propriedade sem nome', x.p.codigo && 'cód. ' + x.p.codigo, x.p.municipio].filter(Boolean).join(' · '))}</span>
        <span class="campo-item-hist">${textoHist(x.h)}${S.rota.ids.includes(x.id) ? ' · <b class="campo-narota">🧭 na rota</b>' : ''}</span></button>`;
    const mostra = [...com, ...sem].slice(0, MAX);
    $('#campo-lista').innerHTML = (v.length ? mostra.map(item).join('')
      : `<div class="vazio">${S.D.itens.length ? 'Nenhuma propriedade com esse filtro.' : 'Nenhuma propriedade neste aparelho. Baixe os dados do município em “📥 Dados para o campo”.'}</div>`)
      + (v.length > MAX ? `<div class="dica">Mostrando ${MAX} de ${v.length}. Use a busca ou o raio.</div>` : '');
    const ix = mostra.findIndex(x => x.lat == null);
    if (ix > 0) { const el = document.querySelectorAll('#campo-lista .campo-item')[ix]; if (el) el.insertAdjacentHTML('beforebegin', '<div class="campo-sep">Sem localização</div>'); }
    else if (ix === 0) $('#campo-lista').insertAdjacentHTML('afterbegin', '<div class="campo-sep">Sem localização</div>');
    const rb = $('#campo-rota-btn'); if (rb) rb.textContent = `🧭 Rota (${S.rota.ids.length})`;
    if (S.sel) cartao();
  }
  function selecionar(id) {
    S.sel = id; desenhar();
    const c = $('#campo-cartao'); if (c && c.firstElementChild) c.firstElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function cartao() {
    const el = $('#campo-cartao'), x = S.D && S.D.porId.get(S.sel); if (!el) return;
    if (!x) { el.replaceChildren(); return; }
    const naRota = S.rota.ids.includes(x.id), doc = digitos(x.p.doc);
    el.innerHTML = `<div class="card campo-cartao" id="campo-cartao-box"><div class="campo-cartao-topo">${seloHist(x.h)}<b>${esc(nomeProdutor(x))}</b>
        <button class="mini" data-campo="fechar" aria-label="Fechar">✕</button></div>
      <p>${esc(x.p.nome || 'Propriedade sem nome')}${x.p.codigo ? ' · cód. <b>' + esc(x.p.codigo) + '</b>' : ''}${x.p.municipio ? ' · ' + esc(x.p.municipio) : ''}</p>
      <p><small>${esc(doc ? fmtDoc(doc) : '')}${x.pe && x.pe.telefone ? ' · ☎ ' + esc(x.pe.telefone) : ''}${x.p.situacaoFundiaria ? ' · ' + esc(x.p.situacaoFundiaria) : ''}</small></p>
      <p class="campo-hist">${textoHist(x.h)}</p>
      <p><small>${esc(ROTULO[x.h.st])}${x.dist != null ? ' · a ' + esc(fmtKm(x.dist)) + ' em linha reta' : x.lat == null ? ' · sem localização' : ''}</small></p>
      <button class="botao" data-campo="levantar" data-id="${esc(x.id)}" id="campo-levantar">🌱 Fazer levantamento aqui</button>
      ${x.lat == null ? '<p class="dica">Sem coordenadas: não entra na rota. Ao fazer o levantamento, o GPS da visita fica registrado.</p>'
        : `<button class="botao sec" data-campo="rota" data-id="${esc(x.id)}" id="campo-incluir">${naRota ? '✓ Na rota — remover' : '➕ Incluir na rota'}</button>`}</div>`;
  }

  /* ================= tela: rota ================= */
  async function telaRota() {
    const mostrar = tela();
    const D = await carregar(), r = await lerRota(), pos = await posicaoSilenciosa();
    if (!mostrar.viva()) return;
    let itens = r.ids.map(id => D.porId.get(id)).filter(x => x && x.lat != null);
    if (itens.length !== r.ids.length) { r.ids = itens.map(x => x.id); await gravarRota(r); }
    if (!r.manual && itens.length > 1) { itens = ordenar(itens, pos); r.ids = itens.map(x => x.id); await gravarRota(r); }
    let total = 0, ant = pos ? { lat: pos.lat, lon: pos.lng } : null;
    const trechos = itens.map(x => { const d = ant ? haversine(ant, x) : null; if (d != null) total += d; ant = x; return d; });
    const urls = urlsGoogle(pos, itens);
    mostrar(`<div class="card" id="campo-rota"><h3>🧭 Rota (${itens.length})</h3>
        ${itens.length ? `<p class="dica" style="text-align:left">${r.manual ? 'Ordem escolhida por você.' : 'Ordem sugerida: a mais próxima primeiro, a partir da sua posição.'} ${pos ? '' : 'Sem a sua posição, a rota começa na 1ª propriedade.'}</p>
        <ol class="campo-rota-lista">${itens.map((x, i) => `<li data-id="${esc(x.id)}"><div><b>${esc(nomeProdutor(x))}</b><br><small>${esc([x.p.nome, x.p.codigo && 'cód. ' + x.p.codigo, x.p.municipio].filter(Boolean).join(' · '))}${trechos[i] != null ? ` · ${esc(fmtKm(trechos[i]))} ${i ? 'da anterior' : 'de você'}` : ''}</small></div>
          <div class="campo-rota-acoes"><button class="mini" data-campo="subir" data-i="${i}" aria-label="Subir" ${i ? '' : 'disabled'}>↑</button><button class="mini" data-campo="descer" data-i="${i}" aria-label="Descer" ${i < itens.length - 1 ? '' : 'disabled'}>↓</button><button class="mini" data-campo="tirar" data-i="${i}" aria-label="Remover da rota">✕</button></div></li>`).join('')}</ol>
        <p id="campo-rota-total"><b>Total em linha reta: ${esc(fmtKm(total))}</b> <small>(a distância pela estrada é maior)</small></p>` : '<div class="vazio">Nenhuma propriedade na rota. No mapa, toque numa propriedade e em “Incluir na rota”.</div>'}</div>
      ${urls.map((u, i) => `<a class="botao campo-gmaps" href="${esc(u)}" target="_blank" rel="noopener">🗺️ Abrir no Google Maps${urls.length > 1 ? ` — Trecho ${i + 1}/${urls.length}` : ''}</a>`).join('')}
      ${urls.length ? `<p class="dica" style="text-align:left">💡 O Google Maps funciona sem internet se você baixar o mapa da região nele antes (Google Maps → foto do perfil → <b>Mapas off-line</b>).${urls.length > 1 ? ' O Google Maps aceita até 9 paradas por vez: a rota foi dividida em trechos.' : ''}</p>` : ''}
      ${itens.length > 1 ? '<button class="botao sec" data-campo="sugerir">🔀 Sugerir ordem (a mais próxima primeiro)</button>' : ''}
      ${itens.length ? '<button class="botao sec" data-campo="limparrota">🗑️ Limpar rota</button>' : ''}
      <button class="botao sec" data-v="pcemapa">🗺️ Voltar ao mapa</button>`);
  }
  async function mexerRota(acao, i) {
    const r = await lerRota();
    if (acao === 'tirar') r.ids.splice(i, 1);
    else { const j = acao === 'subir' ? i - 1 : i + 1; if (j < 0 || j >= r.ids.length) return; [r.ids[i], r.ids[j]] = [r.ids[j], r.ids[i]]; r.manual = true; }
    await gravarRota(r); telaRota();
  }

  /* ================= cliques ================= */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-campo]'); if (!el) return;
    const a = el.dataset.campo, id = el.dataset.id;
    try {
      if (a === 'baixar') await executarBaixar([...document.querySelectorAll('input[name=campo-mun]:checked')].map(c => c.value));
      else if (a === 'atualizar') await executarBaixar([el.dataset.mun]);
      else if (a === 'apagar') {
        const mun = el.dataset.mun;
        if (!confirm(`Apagar deste aparelho os produtores e propriedades baixados de ${mun}?\n\nO que tiver levantamento ou termo ainda não enviado fica guardado até o envio.`)) return;
        const r = await apagar(mun);
        toast(`${mun}: dados apagados do aparelho${r.mantidas ? ` (${r.mantidas} propriedade(s) com registro pendente ficaram)` : ''}.`);
        telaBaixar();
      } else if (a === 'pos') {
        $('#campo-pos-st').textContent = '📍 Obtendo localização…';
        const g = await pegarLocal();
        if (!g) { $('#campo-pos-st').textContent = '⚠️ GPS indisponível ou permissão negada.'; return; }
        S.pos = g; desenhar(true);
      } else if (a === 'ver') selecionar(id);
      else if (a === 'fechar') { S.sel = ''; desenhar(); }
      else if (a === 'rota') { S.rota = await alternarRota(id); desenhar(); toast(S.rota.ids.includes(id) ? 'Incluída na rota.' : 'Retirada da rota.'); }
      else if (a === 'levantar') go('pcelev', { propId: id });
      else if (a === 'subir' || a === 'descer' || a === 'tirar') await mexerRota(a, Number(el.dataset.i));
      else if (a === 'sugerir') { const r = await lerRota(); r.manual = false; await gravarRota(r); telaRota(); }
      else if (a === 'limparrota') { if (!confirm('Limpar a rota?')) return; await gravarRota({ ids: [], manual: false }); telaRota(); }
    } catch (err) { toast(err.message || String(err), true); }
  });

  /** Dados de uma propriedade para preencher o levantamento ("Fazer levantamento aqui" / busca por nome). */
  async function dadosPara(propId) {
    const p = await Store.obter('propriedades', propId); if (!p) return null;
    return { prop: p, pessoa: (await Store.obter('pessoas', digitos(p.doc))) || null };
  }
  /** Resumo para a lista de levantamentos: municípios baixados. */
  async function resumo() {
    const m = Object.values(await lerMeta());
    return m.length ? m.map(x => `${x.municipio} (${x.nProps}) — ${fmtDH(x.baixadoEm)}`).join(' · ') : '';
  }

  return { telaBaixar, telaMapa, telaRota, baixar, apagar, atualizarSozinho, buscar, textoOffline, dadosPara, resumo, haversine, ordenar, urlsGoogle, historico, norm };
})();
