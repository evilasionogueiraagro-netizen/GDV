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

  /** Registro antigo (digitado do papel): data e hora obrigatórias e nunca no futuro. */
  function dataHoraPassadaOk(D) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(D.data || '')) { toast('Informe a data que está no papel.', true); return false; }
    if (!/^\d{2}:\d{2}/.test(D.hora || '')) { toast('Informe a hora que está no papel.', true); return false; }
    if (D.data < '2000-01-01') { toast('Data inválida: confira o ano.', true); return false; }
    if (D.data > hojeISO() || (D.data === hojeISO() && D.hora.slice(0, 5) > agoraHM())) { toast('A data/hora não pode estar no futuro. Confira o papel.', true); return false; }
    return true;
  }

  /* ---------- coordenadas digitadas (registro antigo): graus decimais ou graus/minutos/segundos ---------- */
  const AM = { latMin: -10, latMax: 3, lonMin: -74, lonMax: -56 };          // retângulo aproximado do Amazonas
  /**
   * Lê "-3.1190, -60.0217", "-3,1190 -60,0217", "3°07'08,4\"S 60°01'18,1\"W", "S 3 07 08.4 W 60 01 18.1", "3°07,14'S 60°01,3'O"…
   * S/W/O = negativo; N/E/L = positivo. Devolve {lat, lon} (6 casas), {vazio: true} ou {erro}.
   */
  function lerCoordenadas(txt) {
    let s = String(txt || '').trim();
    if (!s) return { vazio: true };
    s = semAcento(s).toUpperCase().replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/[º˚°]/g, '°').replace(/[′’‘´`]/g, "'").replace(/''/g, '"').replace(/[″“”]/g, '"')
      .replace(/\b(LAT(ITUDE)?|LONG?(ITUDE)?)\b\.?:?/g, ' ').replace(/\bGRAUS?\b/g, '°')
      .replace(/\bSUL\b/g, 'S').replace(/\bNORTE\b/g, 'N').replace(/\bOESTE\b/g, 'O').replace(/\bLESTE\b/g, 'L');
    const re = /([NSEWLO])(?![A-Z])|([-+]?\d+(?:[.,]\d+)?)\s*(°|'|")?|([\s,;/]+)|(.)/g;
    const toks = []; let m;
    while ((m = re.exec(s))) {
      if (m[5]) return { erro: `Caractere não reconhecido: "${m[5]}". Use, por exemplo, -3.1190, -60.0217 ou 3°07'08,4"S 60°01'18,1"W.` };
      if (m[1]) toks.push({ l: m[1] });
      else if (m[2]) toks.push({ n: Number(m[2].replace(',', '.')), neg: /^-/.test(m[2]), u: m[3] || '' });
    }
    const nums = toks.filter(t => t.n != null), temLetra = toks.some(t => t.l), temUnid = nums.some(t => t.u);
    if (!temLetra && !temUnid) {                                           // graus decimais: exatamente dois números
      if (nums.length !== 2) return { erro: 'Informe latitude e longitude (dois números), ex.: -3.1190, -60.0217.' };
      return validarCoord(nums[0].n, nums[1].n);
    }
    const cs = []; let cur = null;
    const novo = () => { cur = { v: [], ult: -1, hem: '', neg: false, fim: false }; cs.push(cur); };
    for (const t of toks) {
      if (t.l) {
        if (cur && cur.v.length && !cur.hem) { cur.hem = t.l; cur.fim = true; }   // letra depois dos números (3°07'S)
        else { novo(); cur.hem = t.l; }                                          // letra antes dos números (S 3°07')
        continue;
      }
      let pos = t.u === '°' ? 0 : t.u === "'" ? 1 : t.u === '"' ? 2 : (cur && !cur.fim ? cur.ult + 1 : 0);
      if (!cur || cur.fim || pos <= cur.ult || pos > 2) { if (!t.u && pos > 2) pos = 0; novo(); }
      if (pos > 0 && t.neg) return { erro: 'Minutos e segundos não podem ser negativos.' };
      if (pos === 0 && t.neg) cur.neg = true;
      cur.v[pos] = Math.abs(t.n); cur.ult = pos;
    }
    if (cs.length !== 2) return { erro: cs.length < 2 ? 'Informe latitude e longitude.' : 'Há números demais: informe só latitude e longitude.' };
    const val = [];
    for (const c of cs) {
      const [g, mi, se] = c.v;
      if (g == null) return { erro: 'Faltam os graus em uma das coordenadas.' };
      if ((mi != null && !Number.isInteger(g)) || (se != null && (mi == null || !Number.isInteger(mi)))) return { erro: 'Graus/minutos com decimais só podem vir na última parte (ex.: 3°07,14\'S).' };
      if ((mi != null && mi >= 60) || (se != null && se >= 60)) return { erro: 'Minutos e segundos vão de 0 a 59.' };
      if (c.neg && /[NEL]/.test(c.hem)) return { erro: 'Sinal negativo junto com hemisfério N/E/L: confira.' };
      const v = g + (mi || 0) / 60 + (se || 0) / 3600, tipo = /[NS]/.test(c.hem) ? 'lat' : /[EWLO]/.test(c.hem) ? 'lon' : '';
      val.push({ v: (c.neg || /[SWO]/.test(c.hem)) ? -v : v, tipo });
    }
    if (val[0].tipo && val[0].tipo === val[1].tipo) return { erro: val[0].tipo === 'lat' ? 'As duas coordenadas são latitude (N/S): falta a longitude (W/O).' : 'As duas coordenadas são longitude (W/O): falta a latitude (N/S).' };
    const [la, lo] = val[0].tipo === 'lon' || val[1].tipo === 'lat' ? [val[1].v, val[0].v] : [val[0].v, val[1].v];
    return validarCoord(la, lo);
  }
  function validarCoord(lat, lon) {
    const r6 = v => Math.round(v * 1e6) / 1e6;
    lat = r6(lat); lon = r6(lon);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erro: 'Coordenada impossível (latitude até 90°, longitude até 180°).', lat, lon };
    if (lat >= AM.latMin && lat <= AM.latMax && lon >= AM.lonMin && lon <= AM.lonMax) return { lat, lon };
    let dica = 'Confira os números e os hemisférios.';
    if (lon >= AM.latMin && lon <= AM.latMax && lat >= AM.lonMin && lat <= AM.lonMax) dica = 'Parece que latitude e longitude estão trocadas.';
    else if (-lon >= AM.lonMin && -lon <= AM.lonMax) dica = 'No Amazonas a longitude é Oeste (W/O, negativa).';
    else if (-lat >= AM.latMin && -lat <= AM.latMax && lat > AM.latMax) dica = 'Confira o hemisfério da latitude (S/N): quase todo o Amazonas fica ao Sul (negativa).';
    return { erro: `A coordenada ${lat}, ${lon} fica fora do Amazonas. ${dica}`, lat, lon, fora: true };
  }
  /** Graus decimais → GMS (mesmo formato da ficha impressa). */
  function gms(v, pos, neg) {
    const a = Math.abs(v); let g = Math.floor(a), m = Math.floor((a - g) * 60), s = Math.round(((a - g) * 60 - m) * 600) / 10;
    if (s >= 60) { s = 0; m++; } if (m >= 60) { m = 0; g++; }
    return `${g}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0').replace('.', ',')}" ${v < 0 ? neg : pos}`;
  }
  /** Mostra a conversão da coordenada digitada e copia lat/lon para os campos ocultos. */
  function mostrarCoord(pref) {
    const inp = $('#' + pref + 'coord'), st = $('#' + pref + 'coord-st'); if (!inp || !st) return;
    const r = lerCoordenadas(inp.value), ok = r.lat != null && !r.erro;
    $('#' + pref + 'lat').value = ok ? r.lat : ''; $('#' + pref + 'lon').value = ok ? r.lon : '';
    st.innerHTML = r.vazio ? '<div class="tf-novo">⚠️ Sem coordenadas: o registro não aparecerá no mapa. Se o papel tiver, digite-as.</div>'
      : r.erro ? `<div class="tf-alerta">⚠️ ${esc(r.erro)}</div>`
      : `<div class="tf-ok">✓ Latitude <b>${esc(r.lat)}</b> · Longitude <b>${esc(r.lon)}</b><br><small>${esc(gms(r.lat, 'N', 'S'))} &nbsp; ${esc(gms(r.lon, 'L', 'O'))}</small></div>`;
  }
  /** Antes de salvar: coordenada inválida bloqueia; sem coordenada pede confirmação. false = parar. */
  function coordOk(txt) {
    const r = lerCoordenadas(txt);
    if (r.erro) { toast('Coordenadas: ' + r.erro, true); return false; }
    return !r.vazio || confirm('Sem coordenadas: o registro não aparecerá no mapa do painel.\n\nSalvar mesmo assim?');
  }

  /* ---------- identificação do servidor (guardada no aparelho, copiada para cada registro) ---------- */
  const servidorAtual = async () => (await Store.meta('pceServidor')) || null;
  const servidorOk = s => !!(s && s.nome && s.cargo && s.lotacao);
  const soDigitador = s => !!(s && s.soDigitacao && s.nome && !servidorOk(s));   // só digita registros antigos (ex.: estagiário)
  /* Registro antigo (digitar do papel): só com a permissão "antigo" dada pela gerência (painel → Servidores → Papel).
     Padrão: desligado. Sem internet vale a última permissão conhecida. Os registros já guardados nunca são apagados. */
  const SEM_ANTIGO = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';
  const podeAntigo = () => Sync.pode('antigo');
  const avisoSemAntigoHTML = () => `<div class="card aviso" id="pce-sem-antigo">⚠️ ${esc(SEM_ANTIGO)} Para registrar vistorias, complete seus dados (cargo e lotação) em “Meus dados”.</div>`;
  /** Rascunho de registro antigo sem a permissão: pergunta se descarta (Cancelar volta sem perder). true = pode seguir. */
  async function rascunhoAntigoSemPermissao(qual, rasc, voltar) {
    if (!rasc || !rasc.dados || !rasc.antigo || podeAntigo()) return true;
    if (!confirm(`Há um registro antigo (do papel) não salvo, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}, mas você está sem autorização para digitar registros do papel.\n\nDescartar esse rascunho? (Cancelar volta sem perder o rascunho.)`)) { go(voltar); return false; }
    await descartarRascunho(qual, rasc);
    return true;
  }
  async function exigirServidor(voltar, arg, aceitaDigitador) {
    const s = await servidorAtual();
    if (servidorOk(s) || (aceitaDigitador && soDigitador(s))) return s;
    go('pceservidor', { voltar, arg });
    return null;
  }

  /* Cargo: lista do CONFIG + "Outro (digitar)" — cargo fora da lista aparece já como "Outro" com o texto preenchido */
  const OUTRO_CARGO = '__outro__';
  const cargoHTML = (id, atual) => {
    const naLista = !atual || P.cargos.includes(atual);
    return `<select id="${id}" data-cargo>${opts(P.cargos, naLista ? atual : '', 'Selecione')}<option value="${OUTRO_CARGO}" ${naLista ? '' : 'selected'}>Outro (digitar)</option></select>
      <input id="${id}-outro" class="cargo-outro" placeholder="Digite o cargo" autocomplete="off" value="${naLista ? '' : esc(atual)}" ${naLista ? 'hidden' : ''}>`;
  };
  const cargoValor = id => { const s = $('#' + id); if (!s) return ''; return s.value === OUTRO_CARGO ? ($('#' + id + '-outro').value || '').trim().replace(/\s+/g, ' ') : s.value; };
  function cargoDefinir(id, v) {
    const s = $('#' + id), t = $('#' + id + '-outro'); if (!s || !v) return;
    if (P.cargos.includes(v)) { s.value = v; t.hidden = true; } else { s.value = OUTRO_CARGO; t.value = v; t.hidden = false; }
  }
  // mostra/esconde o campo de texto ao escolher "Outro (digitar)" (vale para todas as telas do PCE)
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('select[data-cargo]')) return;
    const t = $('#' + e.target.id + '-outro'); if (!t) return;
    t.hidden = e.target.value !== OUTRO_CARGO; if (!t.hidden) t.focus();
  });

  /* ---------- servidor que fez a vistoria (registro antigo): digitado do papel; os últimos nomes ficam lembrados ---------- */
  const servidoresLembrados = async () => (await Store.meta('pceServidoresDigitados')) || [];
  async function lembrarServidor(sv) {
    const l = (await servidoresLembrados()).filter(x => x.nome.toLowerCase() !== sv.servidor.toLowerCase());
    l.unshift({ nome: sv.servidor, cargo: sv.cargo, matricula: sv.matricula, lotacao: sv.lotacao });
    await Store.setMeta('pceServidoresDigitados', l.slice(0, 40));
  }
  const servAntigoHTML = (pref, D, lembrados) => `<div class="card"><h3>👤 Servidor que fez a vistoria</h3>
      <p class="dica" style="text-align:left">Como está no papel (não são os seus dados).</p>
      <label>Nome do servidor *<input id="${pref}snome" list="${pref}servs" value="${esc(D.sNome)}" placeholder="Nome completo" autocomplete="off"></label>
      <datalist id="${pref}servs">${lembrados.map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
      <div class="duas"><label>Cargo *${cargoHTML(pref + 'scargo', D.sCargo)}</label>
        <label>Matrícula<input id="${pref}smatricula" value="${esc(D.sMatricula)}" inputmode="numeric"></label></div>
      <label>Lotação *<select id="${pref}slotacao">${opts(P.municipios, D.sLotacao, 'Selecione')}</select></label></div>`;
  /** Nome escolhido da lista dos já digitados: completa cargo, matrícula e lotação. */
  async function completarServidor(pref) {
    const n = ($('#' + pref + 'snome') || {}).value || '', x = (await servidoresLembrados()).find(y => y.nome.toLowerCase() === n.trim().toLowerCase());
    if (!x) return;
    const set = (id, v) => { const el = $('#' + pref + id); if (el && v) { if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v)) el.add(new Option(v, v)); el.value = v; } };
    cargoDefinir(pref + 'scargo', x.cargo); set('smatricula', x.matricula); set('slotacao', x.lotacao);
  }
  /** Servidor digitado, validado. null = parar (mensagem já mostrada). */
  function servidorDigitado(pref) {
    const g = id => ($('#' + pref + id) || {}).value || '';
    const sv = { servidor: g('snome').trim().replace(/\s+/g, ' '), cargo: cargoValor(pref + 'scargo'), matricula: g('smatricula').trim(), lotacao: g('slotacao') };
    if (sv.servidor.split(' ').length < 2) { toast('Informe o nome completo do servidor que fez a vistoria (como no papel).', true); return null; }
    if (!sv.cargo) { toast('Escolha o cargo do servidor que fez a vistoria (ou "Outro" e digite).', true); return null; }
    if (!sv.lotacao) { toast('Escolha a lotação do servidor que fez a vistoria.', true); return null; }
    return sv;
  }
  const coordAntigaHTML = (pref, D) => `<label>Coordenadas (como estão no papel)<input id="${pref}coord" value="${esc(D.coordTxt)}" autocomplete="off" spellcheck="false"
        placeholder="${esc('-3.1190, -60.0217  ou  3°07\'08,4"S 60°01\'18,1"W')}"></label>
      <div id="${pref}coord-st" class="tf-status" aria-live="polite"></div>
      <input type="hidden" id="${pref}lat" value="${esc(D.lat)}"><input type="hidden" id="${pref}lon" value="${esc(D.lon)}"><input type="hidden" id="${pref}precisao" value="">`;
  const coordTxtDe = r => (r.lat !== '' && r.lat != null && r.lon !== '' && r.lon != null ? `${r.lat}, ${r.lon}` : '');
  const dadosServidor = s => ({ servidor: s.nome, cargo: s.cargo, matricula: s.matricula || '', lotacao: s.lotacao });

  async function servidor(o) {
    if (bloqueado()) return view(avisoAtivacao());
    o = o || {};
    const s = (await servidorAtual()) || {}, primeira = !servidorOk(s);
    view(`<form class="card" id="pceServForm" autocomplete="off"><h3>👤 Identificação do servidor</h3>
      <p class="dica" style="text-align:left">${primeira ? 'Antes de começar, informe seus dados. ' : ''}Eles ficam neste aparelho e são copiados para cada levantamento e termo no momento em que é criado.</p>
      <label>Nome do servidor *<input id="pce-s-nome" value="${esc(s.nome || Sync.nome())}" placeholder="Nome completo"></label>
      <label>Cargo *${cargoHTML('pce-s-cargo', s.cargo)}</label>
      <label>Matrícula<input id="pce-s-matricula" value="${esc(s.matricula || '')}" inputmode="numeric"></label>
      <label>Lotação (município) *<select id="pce-s-lotacao">${opts(P.municipios, s.lotacao, 'Selecione')}</select></label>
      ${podeAntigo() ? `<label class="chk"><input type="checkbox" id="pce-s-digitacao" ${s.soDigitacao ? 'checked' : ''}> Só vou digitar registros antigos do papel (não faço vistorias)</label>
      <p class="dica" style="text-align:left">Marque se você apenas digita fichas e termos já feitos (ex.: estagiário). Cargo e lotação deixam de ser obrigatórios; em cada registro você informa o servidor que fez a vistoria.</p>` : ''}
      <button class="botao" type="submit" id="pce-s-salvar">💾 Salvar</button>
      ${primeira ? '' : '<button class="botao sec" type="button" data-v="pce">Voltar</button>'}</form>`);
    $('#pceServForm').onsubmit = async e => {
      e.preventDefault();
      const d = { nome: $('#pce-s-nome').value.trim().replace(/\s+/g, ' '), cargo: cargoValor('pce-s-cargo'), matricula: $('#pce-s-matricula').value.trim(), lotacao: $('#pce-s-lotacao').value };
      if ($('#pce-s-digitacao') && $('#pce-s-digitacao').checked) d.soDigitacao = 1;   // a opção só aparece com a permissão "antigo"
      if (d.nome.split(' ').length < 2) return toast('Informe o nome completo (nome e sobrenome).', true);
      if (!d.cargo && !d.soDigitacao) return toast('Escolha o cargo (ou "Outro" e digite).', true);
      if (!d.lotacao && !d.soDigitacao) return toast('Escolha a lotação.', true);
      await Store.setMeta('pceServidor', d);
      toast('Dados do servidor salvos.');
      go(o.voltar || 'pce', o.arg);
    };
  }

  /* ---------- arquivos (fotos e assinaturas): núcleo comum em anexos.js (o TF usa o mesmo) ---------- */
  const { idsArquivos, apagarSeNaoEnviado, arquivosPorId, novoArquivo } = Anexos;
  /** Reduz a foto no aparelho: lado maior até 1600 px, JPEG ~0,7. */
  const reduzirFoto = file => Anexos.reduzirFoto(file, P.fotoLado, P.fotoQualidade);
  const MAX_FOTOS = P.maxFotos || 60, MAX_CULTURAS = P.maxCulturas || 40, MAX_PRAGAS = P.maxPragas || 20;
  /* Listas de fotos: no Termo, F.fotos; no levantamento, uma lista por cultura (chave = uid da cultura no formulário) e "gerais"
     (fotos de registro anterior, do levantamento inteiro). No levantamento F.fotos é calculado (todas as fotos do formulário). */
  const listaFotos = (F, chave) => (chave == null ? F.fotos : chave === 'gerais' ? F.gerais : (F.fotosC[chave] = F.fotosC[chave] || []));
  function setListaFotos(F, chave, l) { if (chave == null) F.fotos = l; else if (chave === 'gerais') F.gerais = l; else F.fotosC[chave] = l; }
  /** Rótulo "praga – cultura" da foto (aba Arquivos e nome no Drive), lido do card da cultura no formulário. */
  function rotuloFoto(chave) {
    const c = chave && chave !== 'gerais' ? document.querySelector(`.pce-cult[data-uid="${chave}"]`) : null; if (!c) return null;
    const praga = nomePragaCard(c.closest('.pce-praga')), cultura = c.querySelector('.c-cultura').value;
    return { praga, cultura, rotulo: [praga || SEM_PRAGA, cultura].filter(Boolean).join(' – ') };
  }
  async function adicionarFotos(F, input, prev, chave) {
    const files = [...(input.files || [])]; input.value = '';
    for (const file of files) {
      if (F.fotos.length >= MAX_FOTOS) { toast(`Limite de ${MAX_FOTOS} fotos por registro.`, true); break; }
      if (!/^image\//.test(file.type || 'image/')) { toast(`"${file.name}" não é uma imagem.`, true); continue; }
      let a; try { a = novoArquivo(F.dono, F.id, 'foto', '', 'image/jpeg', await reduzirFoto(file)); } catch (e) { toast(e.message, true); continue; }
      if (!F.vivo) return;                                               // o formulário foi fechado enquanto a foto era processada
      const rot = rotuloFoto(chave); if (rot) Object.assign(a, rot);       // foto do levantamento: praga e cultura a que pertence
      await Store.gravar('arquivos', a);
      listaFotos(F, chave).push(a.id);
    }
    await renderFotos(F, prev, chave);
    agendarRascunho(0);                                                  // grava já: os arquivos novos ficam ligados ao rascunho
  }
  async function renderFotos(F, prev, chave) {
    const ch = chave == null ? '' : ` data-chave="${esc(chave)}"`;
    await Anexos.miniaturas($(prev), listaFotos(F, chave), 'data-pce="delfoto"' + ch);
  }
  async function removerFoto(F, id, prev, chave) {
    setListaFotos(F, chave, listaFotos(F, chave).filter(x => x !== id));
    if (!idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);     // foto nova deste formulário: some já
    await renderFotos(F, prev, chave);                                   // foto já salva no registro: decide ao salvar
    agendarRascunho(0);
  }

  /* ---------- PDF escaneado (registro antigo): vai ao Drive como as fotos, sem redimensionar ---------- */
  const MAX_DOCS = P.maxDocumentos || 10, MAX_PDF = 10 * 1024 * 1024;
  const mb = n => (n / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  const lerDataURL = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Não foi possível ler ' + file.name)); r.readAsDataURL(file); });
  async function adicionarPDFs(F, input, alvo) {
    const files = [...(input.files || [])]; input.value = '';
    for (const file of files) {
      if (F.docs.length >= MAX_DOCS) { toast(`Limite de ${MAX_DOCS} PDFs por registro.`, true); break; }
      if (file.size > MAX_PDF) { toast(`"${file.name}" passa do limite de 10 MB (${(file.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB). Digitalize com resolução menor ou divida o arquivo.`, true); continue; }
      let dados;
      try {
        const ini = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...ini) !== '%PDF-') { toast(`"${file.name}" não é um PDF válido.`, true); continue; }
        dados = 'data:application/pdf;base64,' + String(await lerDataURL(file)).replace(/^data:[^,]*,/, '');
      } catch (e) { toast(e.message, true); continue; }
      if (!F.vivo) return;
      const a = { ...novoArquivo(F.dono, F.id, 'documento', '', 'application/pdf', dados), nomeOriginal: String(file.name || 'documento.pdf').slice(0, 120) };
      await Store.gravar('arquivos', a);
      F.docs.push(a.id);
    }
    await renderDocs(F, alvo);
    agendarRascunho(0);
  }
  async function renderDocs(F, alvo) {
    const el = $(alvo); if (!el) return;
    const itens = await Promise.all(F.docs.map(id => Store.obter('arquivos', id)));
    if ($(alvo) !== el) return;
    el.innerHTML = F.docs.length ? F.docs.map((id, i) => { const a = itens[i] || {};
      const abrir = a.dados ? `<button type="button" class="mini" data-pce="verdoc" data-id="${esc(id)}">Abrir</button>`
        : a.url ? `<a class="mini" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir no Drive</a>` : '';
      return `<div class="pce-doc" data-id="${esc(id)}"><span>📄 ${esc(a.nomeOriginal || 'documento.pdf')} <small>${a.tamanho ? esc(mb(a.tamanho)) : '☁️ no Drive'}</small></span>
        <span class="pce-doc-acoes">${abrir}<button type="button" class="mini" data-pce="deldoc" data-id="${esc(id)}" aria-label="Remover PDF ${i + 1}">✕</button></span></div>`; }).join('')
      : '<div class="dica">Nenhum PDF anexado.</div>';
  }
  async function removerDoc(F, id, alvo) {
    F.docs = F.docs.filter(x => x !== id);
    if (!idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);
    await renderDocs(F, alvo);
    agendarRascunho(0);
  }
  async function verDoc(id) {
    const a = await Store.obter('arquivos', id); if (!a || !a.dados) return;
    const url = URL.createObjectURL(await (await fetch(a.dados)).blob());
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const pdfHTML = pref => `<div class="card"><h3>📎 Ficha escaneada (PDF)</h3>
      <label class="pce-arquivo">📎 Anexar PDF<input type="file" id="${pref}pdfs" accept="application/pdf,.pdf" multiple></label>
      <p class="dica" style="text-align:left">Até ${MAX_DOCS} arquivos de no máximo 10 MB cada. Vão para o Drive junto com as fotos.</p>
      <div id="${pref}pdfs-lista" class="pce-docs"></div></div>`;

  /* ---------- assinatura na tela (opcional; o PDF sempre traz as linhas para assinar no papel) ---------- */
  const assHTML = (papel, rotulo) => `<div class="pce-ass"><div class="pce-ass-topo"><span>${esc(rotulo)}</span>
    <button type="button" class="mini" data-pce="limparass" data-papel="${papel}">Limpar</button></div>
    <canvas id="pce-ass-${papel}" class="pce-canvas" data-papel="${papel}" aria-label="Assinatura: ${esc(rotulo)}"></canvas></div>`;
  async function ligarAssinatura(F, papel) {
    const cv = $('#pce-ass-' + papel); if (!cv) return;
    const salva = F.ass[papel] ? await Store.obter('arquivos', F.ass[papel]) : null;
    Anexos.ligarCanvas(cv, F.assNovas[papel] || (salva && salva.dados), d => { F.assNovas[papel] = d; agendarRascunho(); });
  }
  function limparAssinatura(F, papel) {
    Anexos.limparCanvas($('#pce-ass-' + papel));
    delete F.assNovas[papel]; F.ass[papel] = '';
    agendarRascunho();
  }
  /* Produtor que não assina (não sabe ou não pode): no lugar da assinatura, foto dele segurando um documento de identificação oficial.
     A foto fica em assinaturas.produtorDoc (id na aba Arquivos, tipo "foto", papel "produtor"); a ficha imprime a foto no lugar da linha. */
  const ROT_DOC_PROD = 'Produtor com documento de identificação (não assina)';
  const naoAssinaHTML = F => `<label class="chk pce-naoassina"><input type="checkbox" id="pce-naoassina" ${F.naoAssina ? 'checked' : ''}> Produtor não assina (não sabe ou não pode assinar)</label>
      <div id="pce-docprod" class="pce-docprod" ${F.naoAssina ? '' : 'hidden'}>
        <p class="dica" style="text-align:left">Tire uma foto do produtor segurando um documento de identificação oficial com foto (RG, CNH, carteira de trabalho…), com o rosto e o documento visíveis. A foto vai na ficha no lugar da assinatura.</p>
        <div id="pce-docprod-prev" class="pce-fotos"></div>
        <label class="pce-arquivo" id="pce-docprod-btn">📷 Foto do produtor com o documento<input type="file" id="pce-docprod-in" accept="image/*" capture="environment"></label></div>`;
  async function renderDocProdutor(F) {
    const el = $('#pce-docprod-prev'); if (!el) return;
    await Anexos.miniaturas(el, F.ass.produtorDoc ? [F.ass.produtorDoc] : [], 'data-pce="deldocprod"');
    if (!F.ass.produtorDoc && el.isConnected) el.innerHTML = '';
    const b = $('#pce-docprod-btn'); if (b) b.firstChild.textContent = F.ass.produtorDoc ? '📷 Trocar a foto' : '📷 Foto do produtor com o documento';
  }
  async function soltarDocProdutor(F) {                                  // foto nova deste formulário some já; a já salva no registro, ao salvar
    const id = F.ass.produtorDoc; delete F.ass.produtorDoc;
    if (id && !idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);
  }
  async function fotoDocProdutor(F, input) {
    const file = (input.files || [])[0]; input.value = ''; if (!file) return;
    if (!/^image\//.test(file.type || 'image/')) return toast(`"${file.name}" não é uma imagem.`, true);
    let a; try { a = { ...novoArquivo(F.dono, F.id, 'foto', 'produtor', 'image/jpeg', await reduzirFoto(file)), rotulo: ROT_DOC_PROD }; } catch (e) { return toast(e.message, true); }
    if (!F.vivo) return;
    await Store.gravar('arquivos', a);
    await soltarDocProdutor(F); F.ass.produtorDoc = a.id;
    await renderDocProdutor(F); agendarRascunho(0);
  }
  async function naoAssina(F, sim) {
    F.naoAssina = sim;
    $('#pce-docprod').hidden = !sim;
    const ass = $('#pce-ass-produtor').closest('.pce-ass');
    if (sim) { limparAssinatura(F, 'produtor'); ass.hidden = true; await renderDocProdutor(F); }
    else {                                                               // volta a assinatura na tela (canvas novo: o escondido não tinha tamanho)
      await soltarDocProdutor(F); await renderDocProdutor(F);
      ass.outerHTML = assHTML('produtor', 'Produtor'); await ligarAssinatura(F, 'produtor');
    }
    agendarRascunho(0);
  }
  /** Assinaturas desenhadas viram arquivos PNG (só as que foram desenhadas). Devolve o mapa final papel→id e os arquivos a gravar. */
  const prepararAssinaturas = F => Anexos.prepararAssinaturas(F);

  /* ---------- GPS ---------- */
  async function capturarGPS(pref, automatico) {
    const st = $('#' + pref + 'gps-st'), form = st && st.closest('form'); if (!st) return;
    st.textContent = '📍 Obtendo localização…';
    const g = automatico ? await pegarLocalSilencioso() : await pegarLocal();   // ao abrir o formulário, sem pedir permissão
    if (!form.isConnected) return;
    if (!g) { st.textContent = automatico ? 'Toque em “Atualizar GPS” para registrar a localização.' : '⚠️ GPS indisponível ou permissão negada. Toque em “Atualizar GPS” para tentar de novo.'; return; }
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
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; }          // sem resposta: segue offline
    }
    // sem internet: dados deste aparelho, inclusive os baixados para o campo (📥 Dados para o campo); o histórico do servidor vem no resumo de cada propriedade
    const doDoc = x => !x.excluido && digitos(x.doc) === doc, props = (await Store.todos('propriedades')).filter(doDoc);
    const doServidor = props.reduce((n, p) => n + (Number(p.resumoLev && p.resumoLev.n) || 0), 0);
    return { pessoa: (await Store.obter('pessoas', doc)) || null, propriedades: props, parcial: true, offline: await Campo.textoOffline(doc),
      levantamentos: Math.max(doServidor, (await Store.todos('levantamentos')).filter(doDoc).length), colheitas: (await Store.todos('colheitas')).filter(doDoc).length };
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
    if (r.parcial) html += `<div class="tf-novo pce-offline">📴 Sem conexão: ${esc(r.offline || 'só os dados deste aparelho')}.</div>`;
    if (r.levantamentos || r.colheitas) html += `<div class="tf-ok">ℹ️ ${r.levantamentos} levantamento(s) e ${r.colheitas} termo(s) de colheita anteriores${r.parcial ? ' <small>(sem conexão)</small>' : ''}.</div>`;
    if (r.propriedades.length) {
      html += `<div class="tf-novo"><b>Propriedade(s) cadastrada(s):</b><ul>${r.propriedades.map((p, i) => `<li>${esc(p.nome || p.codigo || p.id)}${p.codigo ? ' · cód. ' + esc(p.codigo) : ''}${p.municipio ? ' · ' + esc(p.municipio) : ''}
        <button type="button" class="mini" data-pce="usarprop" data-pref="${pref}" data-i="${i}">Usar</button></li>`).join('')}</ul></div>`;
      if (r.propriedades.length === 1 && pref === 'pce-' && !$('#pce-propriedade').value.trim()) usarPropriedade(pref, 0);
    }
    st.innerHTML = html; agendarRascunho();
  }
  function usarPropriedade(pref, i) {
    const F = pref === 'pce-t-' ? T : L, p = F && F.props && F.props[i]; if (!p) return;
    const set = (id, v) => { const el = $('#' + pref + id); if (el && v != null && v !== '') el.value = valorSelect(el, v); };
    if (pref === 'pce-') { set('propriedade', p.nome); set('codigo', p.codigo); set('situacao', p.situacaoFundiaria); set('municipio', p.municipio); }
    else { set('endereco', p.nome); set('municipio', p.municipio); }
    agendarRascunho();
  }
  /** Valor para um campo: num select, a opção equivalente (sem acento/maiúsculas) ou uma opção nova (cadastro fora da lista). */
  function valorSelect(el, v) {
    if (el.tagName !== 'SELECT') return v;
    const k = semAcento(v).toUpperCase().trim(), o = [...el.options].find(x => semAcento(x.value).toUpperCase().trim() === k);
    if (o) return o.value;
    el.add(new Option(v, v)); return v;
  }

  /* ---------- escolher produtor/propriedade pelo nome ou código (dados do aparelho, inclusive os baixados para o campo; sem internet) ---------- */
  async function buscarPropForm() {
    const inp = $('#pce-busca-prop'), out = $('#pce-busca-res'); if (!inp || !out || !L) return;
    const q = inp.value.trim();
    if (q.length < 2) { out.replaceChildren(); return; }
    const r = await Campo.buscar(q, 15);
    if ($('#pce-busca-prop') !== inp || inp.value.trim() !== q || !L) return;
    L.busca = r;
    out.innerHTML = r.length ? `<ul class="campo-res">${r.map((x, i) => { const p = x.prop, doc = digitos(p ? p.doc : x.pessoa.id);
      return `<li><button type="button" class="campo-res-item" data-pce="escolherprop" data-i="${i}"><b>${esc((x.pessoa && x.pessoa.nome) || 'Produtor sem cadastro')}</b>
        <small>${esc([p ? p.nome || 'Propriedade sem nome' : 'sem propriedade cadastrada', p && p.codigo && 'cód. ' + p.codigo, p && p.municipio, fmtDoc(doc)].filter(Boolean).join(' · '))}</small></button></li>`; }).join('')}</ul>`
      : '<div class="tf-novo">Nada encontrado neste aparelho. Baixe os dados do município em “📥 Dados para o campo” ou consulte pelo CPF/CNPJ com internet.</div>';
  }
  /** Preenche produtor e propriedade no formulário do levantamento. */
  function preencherProdutor(x, origem) {
    const p = x.prop, pe = x.pessoa, doc = digitos(p ? p.doc : pe && pe.id);
    const set = (id, v) => { const el = $('#pce-' + id); if (el && v != null && v !== '') el.value = valorSelect(el, String(v)); };
    if (doc) set('doc', fmtDoc(doc));
    if (pe) { set('nome', pe.nome); set('telefone', pe.telefone); set('email', pe.email); }
    if (p) { set('propriedade', p.nome); set('codigo', p.codigo); set('situacao', p.situacaoFundiaria); set('municipio', p.municipio); L.props = [p]; }
    const st = $('#pce-st-doc');
    if (st) st.innerHTML = `<div class="tf-ok">✓ ${esc(origem)}: ${esc((pe && pe.nome) || 'produtor')}${p ? ' · ' + esc(p.nome || p.codigo || '') : ''}. Confira os dados.</div>`
      + (doc && !docOk(doc) ? `<div class="tf-alerta">⚠️ ${doc.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira.</div>` : '');
    const b = $('#pce-busca-prop'), r = $('#pce-busca-res'); if (b) b.value = ''; if (r) r.replaceChildren();
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
        Store.setMeta('pceLevRascunho', { dados: coletarLev(), id: st.id, novo: st.novo, fotos: st.fotos, gerais: st.gerais, docs: st.docs, antigo: st.antigo ? 1 : 0, ass: st.ass, assNovas: st.assNovas, naoAssina: !!st.naoAssina, em: Date.now() });
      else if (f.id === 'pceTermoForm' && T === st && $('#pceTermoForm') === f)
        Store.setMeta('pceTermoRascunho', { dados: coletarTermo(), id: st.id, fotos: st.fotos, docs: st.docs, antigo: st.antigo ? 1 : 0, assNovas: st.assNovas, levantamentoId: st.levantamentoId, tplDesc: st.tplDesc, em: Date.now() });
    }, atraso);
  }
  /** Descarta um rascunho: apaga as fotos que só existiam nele. */
  async function descartarRascunho(qual, rasc) {
    if (rasc) {
      const rec = await Store.obter(qual === 'lev' ? 'levantamentos' : 'colheitas', rasc.id), salvo = idsArquivos(rec);
      const docProd = rasc.ass && rasc.ass.produtorDoc ? [rasc.ass.produtorDoc] : [];   // foto do produtor com documento (não assina)
      await apagarSeNaoEnviado([...(rasc.fotos || []), ...(rasc.docs || []), ...docProd].filter(id => !salvo.has(id)));
    }
    await Store.setMeta(qual === 'lev' ? 'pceLevRascunho' : 'pceTermoRascunho', null);
  }
  function fechar(F) { if (F) F.vivo = false; clearTimeout(tRasc); }

  /* ================= Levantamento fitossanitário (por praga/doença) ================= */
  // Dados gerais (servidor, produtor, propriedade, localização, data/hora, assinaturas) uma vez por visita; depois um card por praga/doença
  // avaliada, com uma ou mais culturas (resultado, coleta de amostra e fotos de cada cultura). A mesma cultura pode estar em várias pragas.
  // Gravado em "pragas" (JSON); "culturas" (uma por cultura × praga) e "fotos" (todas) continuam preenchidos para o painel e os relatórios.
  const SEM_PRAGA = 'Sem praga informada', OUTRA = '__outra';
  const RES = Object.fromEntries(P.resultados || [['detectada', 'Detectada'], ['nao_detectada', 'Não detectada'], ['suspeita', 'Suspeita']]);
  const novoUid = () => 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const culturaVazia = () => ({ uid: novoUid(), cultura: '', area: '', espLinha: '', espPlanta: '', resultado: '', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] });
  const pragaVazia = () => ({ praga: '', legado: false, outra: false, culturas: [culturaVazia()] });
  const levVazio = s => ({ doc: '', nome: '', telefone: '', email: '', propriedade: '', codigoPropriedade: '', situacaoFundiaria: '', municipio: s.lotacao || '',
    lat: '', lon: '', precisao: '', data: hojeISO(), hora: agoraHM(), obs: '', pragas: [pragaVazia()] });
  /** Registro antigo: nada pré-preenchido com "agora" nem com o perfil de quem digita ("Salvar e digitar outro" mantém servidor/município/data). */
  const levVazioAntigo = (s, m = {}) => ({ ...levVazio(s), municipio: m.municipio || '', data: m.data || '', hora: '', coordTxt: '',
    sNome: m.sNome || '', sCargo: m.sCargo || '', sMatricula: m.sMatricula || '', sLotacao: m.sLotacao || '' });
  const levDeRegistro = r => ({ doc: fmtDoc(digitos(r.doc)), nome: r.nome || '', telefone: r.telefone || '', email: r.email || '', propriedade: r.propriedade || '',
    codigoPropriedade: r.codigoPropriedade || '', situacaoFundiaria: r.situacaoFundiaria || '', municipio: r.municipio || '', lat: r.lat == null ? '' : r.lat,
    lon: r.lon == null ? '' : r.lon, precisao: r.precisao == null ? '' : r.precisao, data: r.data || '', hora: r.hora || '', obs: r.obs || '',
    coordTxt: coordTxtDe(r), sNome: r.servidor || '', sCargo: r.cargo || '', sMatricula: r.matricula || '', sLotacao: r.lotacao || '' });
  const nomePraga = p => String(p || '').trim() || SEM_PRAGA;

  /**
   * Prepara o estado de fotos do formulário (F.fotosC: uid da cultura → ids; F.gerais) e devolve os cards para desenhar.
   * deRegistro: card sem praga vindo de registro/rascunho antigo = "Sem praga informada (registro anterior)".
   */
  function pragasParaForm(F, pragas, gerais, deRegistro) {
    F.fotosC = {}; F.gerais = (gerais || []).slice();
    const cards = (pragas || []).map(g => ({ praga: String(g.praga || ''), outra: !!g.outra, legado: !!g.legado || (deRegistro && !String(g.praga || '').trim()),
      culturas: (g.culturas || []).map(c => { const uid = novoUid(); F.fotosC[uid] = (Array.isArray(c.fotos) ? c.fotos : []).filter(Boolean);
        return { ...culturaVazia(), ...c, uid, coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', resultado: RES[c.resultado] ? c.resultado : '', fotos: F.fotosC[uid] }; }) }));
    cards.forEach(g => { if (!g.culturas.length) g.culturas.push(culturaVazia()); });
    return cards.length ? cards : [pragaVazia()];
  }
  /** No levantamento, F.fotos = todas as fotos do formulário (gerais + de cada cultura): rascunho, descarte e limite contam todas. */
  function ligarFotosLev(F) {
    Object.defineProperty(F, 'fotos', { configurable: true, enumerable: true, get: () => [...F.gerais, ...Object.values(F.fotosC).flat()] });
  }
  function nomePragaCard(card) {
    if (!card) return '';
    const sel = card.querySelector('.p-praga');
    return sel.value === OUTRA ? card.querySelector('.p-outra').value.trim().replace(/\s+/g, ' ') : sel.value;
  }

  function coletarLev() {
    const g = id => { const e = $('#pce-' + id); return e ? e.value : ''; };
    return { doc: g('doc'), nome: g('nome'), telefone: g('telefone'), email: g('email'), propriedade: g('propriedade'), codigoPropriedade: g('codigo'),
      situacaoFundiaria: g('situacao'), municipio: g('municipio'), lat: g('lat'), lon: g('lon'), precisao: g('precisao'), data: g('data'), hora: g('hora'), obs: g('obs'),
      coordTxt: g('coord'), sNome: g('snome'), sCargo: cargoValor('pce-scargo'), sMatricula: g('smatricula'), sLotacao: g('slotacao'),
      pragas: [...document.querySelectorAll('#pce-pragas .pce-praga')].map(card => ({ praga: nomePragaCard(card), outra: card.querySelector('.p-praga').value === OUTRA,
        legado: card.dataset.legado === '1',
        culturas: [...card.querySelectorAll('.pce-cult')].map(b => {
          const q = c => b.querySelector('.c-' + c).value, uid = b.dataset.uid, r = b.querySelector('.c-res:checked');
          return { uid, cultura: q('cultura'), area: q('area'), espLinha: q('espLinha'), espPlanta: q('espPlanta'), resultado: r ? r.value : '', coleta: q('coleta'),
            tipoMaterial: q('tipoMaterial'), codigoAmostra: q('codigoAmostra'), destinoAmostra: q('destinoAmostra'), fotos: ((L && L.fotosC[uid]) || []).slice() };
        }) })) };
  }
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input id="pce-${id}" value="${esc(v)}" ${extra}></label>`;
  function blocoCultura(c, k) {
    const amostra = c.coleta === 'Sim' ? '' : 'disabled', u = esc(c.uid);
    const inp = (cls, rot, extra = '') => `<label>${rot}<input class="c-${cls}" value="${esc(c[cls])}" maxlength="60" ${extra}></label>`;
    return `<div class="pce-cult" data-uid="${u}"><div class="pce-cult-topo"><b>Cultura ${k + 1}</b>
        <button type="button" class="mini" data-pce="delcult" data-uid="${u}" aria-label="Remover cultura ${k + 1}">Remover</button></div>
      <label>Cultura *<select class="c-cultura">${opts(P.culturas, c.cultura, 'Selecione')}</select></label>
      <fieldset class="pce-res"><legend>Resultado *</legend><div class="pce-res-op">${Object.keys(RES).map(v => `<label class="pce-res-${v}"><input type="radio" class="c-res"
        name="res-${u}" value="${v}" ${c.resultado === v ? 'checked' : ''}><span>${esc(RES[v])}</span></label>`).join('')}</div></fieldset>
      <div class="duas">${inp('area', 'Área (ha)', 'inputmode="decimal"')}<label>Coleta de amostra<select class="c-coleta">${opts(['Não', 'Sim'], c.coleta === 'Sim' ? 'Sim' : 'Não')}</select></label></div>
      <div class="duas">${inp('espLinha', 'Espaçamento entre linhas')}${inp('espPlanta', 'Espaçamento entre plantas')}</div>
      <div class="pce-amostra">${inp('tipoMaterial', 'Tipo de material', amostra)}<div class="duas">${inp('codigoAmostra', 'Código da amostra', amostra)}${inp('destinoAmostra', 'Destino da amostra', amostra)}</div></div>
      <label class="pce-arquivo pce-arquivo-cult">📷 Fotos desta cultura<input type="file" class="c-fotos" data-uid="${u}" accept="image/*" multiple></label>
      <div id="pce-fotos-${u}" class="pce-fotos pce-fotos-cult"></div></div>`;
  }
  function blocoPraga(g, i) {
    const outra = g.outra || (!!g.praga && !P.pragas.includes(g.praga));
    return `<div class="pce-praga" data-p="${i}" data-legado="${g.legado ? 1 : ''}"><div class="pce-praga-topo"><b>🐛 Praga/doença ${i + 1}</b>
        <button type="button" class="mini" data-pce="delpraga" data-p="${i}" aria-label="Remover praga/doença ${i + 1}">Remover</button></div>
      <label>Praga/doença avaliada *<select class="p-praga"><option value="">${esc(g.legado ? SEM_PRAGA + ' (registro anterior)' : 'Selecione')}</option>
        ${P.pragas.map(x => `<option ${!outra && x === g.praga ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        <option value="${OUTRA}" ${outra ? 'selected' : ''}>Outra (digitar o nome)</option></select></label>
      <label class="p-outra-l" ${outra ? '' : 'hidden'}>Nome da praga/doença *<input class="p-outra" maxlength="80" value="${esc(outra ? g.praga : '')}" autocomplete="off"></label>
      <div class="pce-cults">${g.culturas.map(blocoCultura).join('')}</div>
      <button type="button" class="botao sec pce-addcult" data-pce="addcult" data-p="${i}">+ Adicionar cultura nesta praga</button></div>`;
  }
  async function desenharPragas(lista) {
    const el = $('#pce-pragas'); if (!el || !L) return;
    el.innerHTML = lista.map(blocoPraga).join('');
    const F = L;
    for (const c of lista.flatMap(g => g.culturas)) await renderFotos(F, '#pce-fotos-' + c.uid, c.uid);
  }
  const fotosGeraisHTML = () => `<div class="card" id="pce-gerais-card"><h3>📷 Fotos gerais (registro anterior)</h3>
      <p class="dica" style="text-align:left">Fotos do levantamento inteiro, de antes da separação por praga. Saem em todos os PDFs. As fotos novas vão em cada cultura.</p>
      <div id="pce-fotos-gerais" class="pce-fotos"></div></div>`;

  const topoAntigo = (titulo, F) => `<div class="card"><h3>📄 ${titulo}</h3>
      <p class="dica" style="text-align:left">Digite os dados como estão no papel: data, hora, coordenadas e servidor são os da vistoria.${F.novo !== false ? ' Depois de salvar, use “Salvar e digitar outro” para seguir com a próxima ficha.' : ''}</p></div>`;
  function formLevHTML(D, F) {
    const A = F.antigo;
    return `<form id="pceLevForm" autocomplete="off" class="${A ? 'pce-antigo' : ''}" ${A ? 'novalidate' : ''}>
    ${A ? topoAntigo(F.novo ? 'Registro antigo — levantamento (digitar do papel)' : 'Editar levantamento (registro do papel)', F) + servAntigoHTML('pce-', D, F.lembrados)
      : `<div class="card"><h3>${F.novo ? '🌱 Novo levantamento fitossanitário' : '🌱 Editar levantamento'}</h3>
      <p class="dica" style="text-align:left">Servidor: <b>${esc(F.serv.servidor)}</b> · ${esc(F.serv.cargo)} · ${esc(F.serv.lotacao)}</p></div>`}
    <div class="card"><h3>Dados do produtor</h3>
      <div class="campo-busca"><label>Buscar produtor ou propriedade (nome, propriedade ou código)<input id="pce-busca-prop" type="search" autocomplete="off" placeholder="ex.: Sítio Boa Vista ou PRP-001"></label>
        <div id="pce-busca-res" aria-live="polite"></div></div>
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
      ${A ? `<div class="duas">${campo('data', 'Data da vistoria *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${campo('hora', 'Hora *', D.hora, 'type="time"')}</div>
      ${coordAntigaHTML('pce-', D)}`
      : `${gpsHTML('pce-', D)}
      <div class="duas">${campo('data', 'Data da vistoria', D.data, 'type="date"')}${campo('hora', 'Hora', D.hora, 'type="time"')}</div>`}</div>
    <div class="card pce-pragas-card"><h3>Pragas/doenças avaliadas</h3>
      <p class="dica" style="text-align:left">Um card para cada praga/doença avaliada na visita; dentro dele, as culturas avaliadas, com o resultado e as fotos de cada uma. A mesma cultura pode aparecer em pragas diferentes. Cada praga sai num PDF próprio.</p>
      <div id="pce-pragas"></div>
      <button type="button" class="botao sec" data-pce="addpraga" id="pce-addpraga">+ Adicionar praga/doença</button></div>
    ${F.gerais.length ? fotosGeraisHTML() : ''}
    ${A ? pdfHTML('pce-') : ''}
    ${A ? '' : `<div class="card"><h3>Assinaturas (opcional)</h3>
      <p class="dica" style="text-align:left">Assine com o dedo, se quiser. As fichas impressas sempre trazem as linhas para assinar no papel.</p>
      ${assHTML('servidor', 'Servidor')}${assHTML('produtor', 'Produtor')}${naoAssinaHTML(F)}</div>`}
    <div class="card"><h3>Observações</h3><label><textarea id="pce-obs" rows="3" aria-label="Observações">${esc(D.obs)}</textarea></label></div>
    <button class="botao" type="submit" id="pce-salvar">💾 Salvar levantamento</button>
    ${A && F.novo ? '<button class="botao" type="button" data-pce="salvaroutro" id="pce-salvar-outro">💾 Salvar e digitar outro</button>' : ''}
    <button class="botao sec" type="button" data-pce="descartarlev">Descartar alterações</button></form>`;
  }

  async function levantamento(arg) {
    if (bloqueado()) return view(avisoAtivacao());
    const id = typeof arg === 'string' ? arg : '', o = arg && typeof arg === 'object' ? arg : {};
    const rec0 = id ? await Store.obter('levantamentos', id) : null, s0 = await servidorAtual();
    const querAntigo = !!(o.antigo || (rec0 && Number(rec0.registroAntigo) === 1) || (!id && soDigitador(s0) && podeAntigo()));   // quem só digita: sempre do papel (sem a permissão: pede cargo/lotação)
    if (querAntigo && !podeAntigo()) { toast(SEM_ANTIGO, true); return go('pce'); }   // registro do papel: só com a permissão "antigo"
    const s = await exigirServidor('pcelev', arg, querAntigo); if (!s) return;
    fechar(L); fechar(T); L = null;
    let F = null, D = null, cards = null, prefill = null;
    let rasc = await Store.meta('pceLevRascunho');
    if (!(await rascunhoAntigoSemPermissao('lev', rasc, 'pce'))) return;
    if (rasc && rasc.antigo && !podeAntigo()) rasc = null;                 // rascunho do papel sem permissão: já descartado acima
    if (rasc && rasc.dados && id && rasc.id !== id) {                      // o rascunho é de OUTRO levantamento: não troca o escolhido sem avisar
      if (!confirm(`Há um rascunho não salvo de outro levantamento, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nDescartar esse rascunho e abrir o levantamento selecionado? (Cancelar volta à lista sem perder o rascunho.)`)) return go('pce');
      await descartarRascunho('lev', rasc);
    } else if (rasc && rasc.dados) {
      if (confirm(`Há ${rasc.novo ? 'um levantamento novo' : 'uma edição de levantamento'} não salvo, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
        const rec = await Store.obter('levantamentos', rasc.id);
        F = { id: rasc.id, novo: !rec, rec: rec || null, docs: rasc.docs || [], antigo: !!rasc.antigo, ass: rasc.ass || {}, assNovas: rasc.assNovas || {}, naoAssina: !!rasc.naoAssina };
        D = { ...(F.antigo ? levVazioAntigo(s) : levVazio(s)), ...rasc.dados };
        if (Array.isArray(rasc.dados.pragas)) cards = pragasParaForm(F, rasc.dados.pragas, rasc.gerais, false);
        else {                                                             // rascunho da versão anterior (culturas + fotos do levantamento inteiro)
          const G = Docs.pceGrupos({ culturas: rasc.dados.culturas || [], fotos: rasc.fotos || [] });
          cards = pragasParaForm(F, G.pragas, G.gerais, true);
        }
      } else await descartarRascunho('lev', rasc);
    }
    const retomou = !!F;
    if (!F) {
      const rec = id ? await Store.obter('levantamentos', id) : null;
      if (id && (!rec || rec.excluido)) { toast('Levantamento não encontrado.', true); return go('pce'); }
      F = rec ? { id: rec.id, novo: false, rec, docs: lerJSON(rec.documentos, []), antigo: Number(rec.registroAntigo) === 1, ass: lerJSON(rec.assinaturas, {}), assNovas: {} }
        : { id: Store.novoId(), novo: true, rec: null, docs: [], antigo: querAntigo, ass: {}, assNovas: {} };
      D = rec ? levDeRegistro(rec) : F.antigo ? levVazioAntigo(s, o.manter) : levVazio(s);
      if (!rec && o.propId) prefill = await Campo.dadosPara(o.propId);      // "Fazer levantamento aqui" (mapa): produtor e propriedade já preenchidos
      if (rec) { const G = Docs.pceGrupos(rec); cards = pragasParaForm(F, G.pragas, G.gerais, true); }   // registro anterior: convertido para cards
      else cards = pragasParaForm(F, [], [], false);
    }
    ligarFotosLev(F);
    if (F.naoAssina == null) F.naoAssina = !!F.ass.produtorDoc;
    F.dono = 'levantamentos'; F.vivo = true; F.serv = F.rec ? { servidor: F.rec.servidor, cargo: F.rec.cargo, matricula: F.rec.matricula, lotacao: F.rec.lotacao } : dadosServidor(s);
    if (F.antigo) F.lembrados = await servidoresLembrados();
    L = F;
    view(formLevHTML(D, F));
    await desenharPragas(cards);
    if (F.gerais.length) await renderFotos(F, '#pce-fotos-gerais', 'gerais');
    if (F.antigo) { mostrarCoord('pce-'); await renderDocs(F, '#pce-pdfs-lista'); }
    else {
      await ligarAssinatura(F, 'servidor'); await ligarAssinatura(F, 'produtor');
      if (F.naoAssina) { $('#pce-ass-produtor').closest('.pce-ass').hidden = true; await renderDocProdutor(F); }
    }
    const f = $('#pceLevForm');
    f.addEventListener('input', e => {
      if (e.target.id === 'pce-busca-prop') { clearTimeout(tm.busca); tm.busca = setTimeout(() => buscarPropForm().catch(() => {}), 250); return; }
      if (e.target.id === 'pce-doc') aoDigitarDoc('pce-', e.target); if (e.target.id === 'pce-coord') mostrarCoord('pce-'); agendarRascunho(); });
    f.addEventListener('change', async e => {
      const t = e.target;
      if (t.classList.contains('c-fotos')) return adicionarFotos(F, t, '#pce-fotos-' + t.dataset.uid, t.dataset.uid);
      if (t.id === 'pce-pdfs') return adicionarPDFs(F, t, '#pce-pdfs-lista');
      if (t.id === 'pce-naoassina') return naoAssina(F, t.checked);
      if (t.id === 'pce-docprod-in') return fotoDocProdutor(F, t);
      if (t.id === 'pce-snome') await completarServidor('pce-');
      if (t.id === 'pce-doc') t.value = fmtDoc(digitos(t.value));
      if (t.classList.contains('c-coleta')) t.closest('.pce-cult').querySelectorAll('.pce-amostra input').forEach(i => { i.disabled = t.value !== 'Sim'; });
      if (t.classList.contains('p-praga')) {                               // "Outra": mostra o campo do nome
        const l = t.closest('.pce-praga').querySelector('.p-outra-l'); l.hidden = t.value !== OUTRA;
        if (t.value === OUTRA) l.querySelector('input').focus();
      }
      agendarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); salvarLev(); };
    if (F.antigo) { const p1 = $(D.sNome ? (D.data ? '#pce-hora' : '#pce-data') : '#pce-snome'); if (p1 && F.novo) p1.focus(); }
    else if (F.novo && (D.lat === '' || D.lat == null)) capturarGPS('pce-', true);         // GPS automático ao abrir (sem pedir permissão)
    if (prefill) preencherProdutor(prefill, 'Propriedade escolhida no mapa');
    else if (o.propId && retomou) toast('Rascunho retomado: a propriedade escolhida no mapa não foi aplicada.', true);
  }

  /** Cards de praga do formulário → pragas a gravar (só culturas preenchidas). null = parar (mensagem já mostrada). */
  function pragasValidadas(D) {
    const out = [], vistas = new Map();
    for (const [i, g] of D.pragas.entries()) {
      const nome = g.praga || (g.legado ? SEM_PRAGA : `card ${i + 1}`);
      if (g.culturas.some(c => !c.cultura && c.fotos.length)) { toast(`${nome}: escolha a cultura das fotos (há fotos numa cultura sem nome).`, true); return null; }
      const cults = g.culturas.filter(c => c.cultura);
      if (!cults.length) {
        if (g.praga || g.outra) { toast(`Informe ao menos uma cultura avaliada para ${g.praga || 'a praga/doença ' + (i + 1)}.`, true); return null; }
        continue;                                                          // card vazio: ignorado
      }
      if (g.outra && !g.praga) { toast(`Digite o nome da praga/doença ${i + 1} (opção “Outra”).`, true); return null; }
      if (!g.praga && !g.legado) { toast(`Escolha a praga/doença avaliada no card ${i + 1}.`, true); return null; }
      if (!g.praga && cults.some(c => c.resultado && c.resultado !== 'nao_detectada')) { toast(`Card ${i + 1}: escolha a praga/doença detectada ou suspeita.`, true); return null; }
      const semRes = cults.find(c => !c.resultado);
      if (semRes) { toast(`Informe o resultado de ${semRes.cultura} em ${nomePraga(g.praga)} (detectada, não detectada ou suspeita).`, true); return null; }
      const nomes = cults.map(c => c.cultura), dup = nomes.find((c, k) => nomes.indexOf(c) !== k);
      if (dup) { toast(`${dup} aparece duas vezes em ${nomePraga(g.praga)}. Junte numa só cultura (área e fotos).`, true); return null; }
      const k = semAcento(g.praga).toUpperCase();
      if (vistas.has(k)) { toast(`${nomePraga(g.praga)} está em dois cards. Junte as culturas num só card.`, true); return null; }
      vistas.set(k, 1);
      out.push({ praga: g.praga, culturas: cults.map(c => ({ cultura: c.cultura, area: c.area.trim(), espLinha: c.espLinha.trim(), espPlanta: c.espPlanta.trim(),
        resultado: c.resultado, coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', tipoMaterial: c.coleta === 'Sim' ? c.tipoMaterial.trim() : '',
        codigoAmostra: c.coleta === 'Sim' ? c.codigoAmostra.trim() : '', destinoAmostra: c.coleta === 'Sim' ? c.destinoAmostra.trim() : '', fotos: c.fotos.slice() })) });
    }
    if (!out.length) { toast('Informe pelo menos uma praga/doença com uma cultura avaliada.', true); return null; }
    if (out.reduce((s, g) => s + g.culturas.length, 0) > MAX_CULTURAS) { toast(`Limite de ${MAX_CULTURAS} culturas por levantamento (somando as pragas).`, true); return null; }
    return out;
  }
  /** Compatibilidade: uma cultura por cultura × praga (praga = nome só se detectada/suspeita), para o painel, relatórios e versões anteriores. */
  const culturasDerivadas = pragas => pragas.flatMap(g => g.culturas.map(c => ({ cultura: c.cultura, area: c.area, espLinha: c.espLinha, espPlanta: c.espPlanta,
    praga: c.resultado === 'nao_detectada' ? '' : g.praga, pragaAvaliada: g.praga, resultado: c.resultado, coleta: c.coleta, tipoMaterial: c.tipoMaterial,
    codigoAmostra: c.codigoAmostra, destinoAmostra: c.destinoAmostra })));

  async function salvarLev(outro) {
    const F = L; if (!F || !F.vivo || F.salvando) return;
    const D = coletarLev(), doc = digitos(D.doc);
    let sv = null;
    if (F.antigo && !(sv = servidorDigitado('pce-'))) return;
    if (!conferirDoc(doc)) return;
    if (!D.nome.trim()) return toast('Informe o nome do produtor.', true);
    if (!D.municipio) return toast('Escolha o município.', true);
    const pragas = pragasValidadas(D); if (!pragas) return;
    if (F.antigo ? !dataHoraPassadaOk(D) : !dataHoraOk(D)) return;
    if (!F.antigo && F.naoAssina && !F.ass.produtorDoc) { toast('Produtor não assina: tire a foto dele segurando o documento de identificação (ou desmarque a opção).', true); return $('#pce-docprod-btn').scrollIntoView({ block: 'center' }); }
    if (F.antigo) { if (!coordOk(D.coordTxt)) return; mostrarCoord('pce-'); Object.assign(D, { lat: $('#pce-lat').value, lon: $('#pce-lon').value, precisao: '' }); }
    const btn = $('#pce-salvar'), btn2 = $('#pce-salvar-outro'); btn.disabled = true; if (btn2) btn2.disabled = true; F.salvando = true;
    try {
      const { mapa, novos } = prepararAssinaturas(F);
      const fotos = [...F.gerais, ...pragas.flatMap(g => g.culturas.flatMap(c => c.fotos))];
      const antes = idsArquivos(F.rec), depois = new Set([...fotos, ...F.docs, ...Object.values(mapa)]);
      await Store.gravarVarios('arquivos', novos);
      // fotos ainda não enviadas: praga/cultura atuais (o fiscal pode ter trocado a praga ou a cultura depois de fotografar)
      const rotulos = new Map(pragas.flatMap(g => g.culturas.flatMap(c => c.fotos.map(id => [id, { praga: g.praga, cultura: c.cultura, rotulo: `${nomePraga(g.praga)} – ${c.cultura}` }]))));
      await Store.mesclar('arquivos', [...rotulos.keys()].map(id => ({ id })), (a, row) => (a && !a.enviado ? { ...a, ...rotulos.get(row.id) } : null));
      const base = { ...(F.rec || {}) }; delete base.pendente;
      const rec = { ...base, id: F.id, ...(sv || F.serv), data: D.data, hora: D.hora, doc, nome: D.nome.trim().replace(/\s+/g, ' ').toUpperCase(), telefone: D.telefone.trim(),
        email: D.email.trim(), propriedade: D.propriedade.trim(), codigoPropriedade: D.codigoPropriedade.trim(), situacaoFundiaria: D.situacaoFundiaria,
        municipio: D.municipio, lat: numOuVazio(D.lat), lon: numOuVazio(D.lon), precisao: numOuVazio(D.precisao), culturas: JSON.stringify(culturasDerivadas(pragas)),
        pragas: JSON.stringify(pragas), fotos: JSON.stringify(fotos), assinaturas: JSON.stringify(mapa), obs: D.obs.trim(), excluido: 0 };
      if (F.antigo || F.docs.length) Object.assign(rec, { registroAntigo: F.antigo ? 1 : 0, documentos: JSON.stringify(F.docs) });   // campos técnicos (não aparecem no painel nem na ficha)
      await Store.salvar('levantamentos', rec);
      if (sv) await lembrarServidor(sv);
      await apagarSeNaoEnviado([...antes].filter(id => !depois.has(id)));               // removidos antes do envio somem do aparelho
      await Store.salvar('pessoas', await montarPessoa(doc, { nome: rec.nome, telefone: rec.telefone, email: rec.email }));
      const prop = await montarPropriedade({ codigo: rec.codigoPropriedade, nome: rec.propriedade, doc, municipio: rec.municipio, situacaoFundiaria: rec.situacaoFundiaria, lat: rec.lat, lon: rec.lon });
      if (prop) await Store.salvar('propriedades', prop);
      fechar(F); L = null; await Store.setMeta('pceLevRascunho', null);
      toast(F.novo ? (outro ? 'Levantamento salvo. Digite o próximo.' : 'Levantamento salvo.') : 'Levantamento atualizado.');
      Sync.sincronizar();
      if (outro) go('pcelev', { antigo: true, manter: { sNome: D.sNome.trim(), sCargo: D.sCargo, sMatricula: D.sMatricula.trim(), sLotacao: D.sLotacao, municipio: D.municipio, data: D.data } });
      else go('pcelevpronto', F.id);
    } catch (e) { F.salvando = false; btn.disabled = false; if (btn2) btn2.disabled = false; toast('Erro ao salvar: ' + e.message, true); }
  }

  /* ---------- PDFs do levantamento: um por praga/doença ---------- */
  const ORDEM_RES = { detectada: 0, suspeita: 1, nao_detectada: 2 };
  /** Pior resultado da praga (detectada > suspeita > não detectada). */
  const resultadoPraga = g => g.culturas.map(c => c.resultado).sort((a, b) => ORDEM_RES[a] - ORDEM_RES[b])[0] || 'nao_detectada';
  const seloRes = r => `<span class="pce-selo-res ${esc(r)}">${esc(RES[r] || '')}</span>`;
  /** Botões "PDF: <praga>" (um por praga) e "Imprimir todos". grande = tela depois de salvar. */
  function botoesPdf(id, G, grande) {
    const cls = grande ? 'botao' : 'editar';
    return G.pragas.map((g, i) => `<button class="${cls} pce-pdf" data-pce="imprimirlev" data-id="${esc(id)}" data-g="${i}">${grande ? '🖨️ ' : ''}PDF: ${esc(nomePraga(g.praga))}</button>`).join('')
      + (G.pragas.length > 1 ? `<button class="${grande ? 'botao sec' : 'editar'} pce-pdf-todos" data-pce="imprimirtodos" data-id="${esc(id)}">🖨️ Imprimir todos (${G.pragas.length} PDFs)</button>` : '')
      + (!G.pragas.length ? `<button class="${cls} pce-pdf" data-pce="imprimirlev" data-id="${esc(id)}" data-g="0">Ficha (PDF)</button>` : '');
  }
  const amostrasDe = G => G.pragas.flatMap(g => g.culturas.filter(c => c.coleta === 'Sim').map(c => ({ praga: g.praga, cultura: c.cultura, tipoMaterial: c.tipoMaterial || '', codigoAmostra: c.codigoAmostra || '' })));

  /** Documentos da visita: cadastro da propriedade (1x) e Termo de Fiscalização do mesmo dia na mesma propriedade. */
  async function docsDaVisita(r, cads, tfs) {
    const pid = propId(r.codigoPropriedade, r.doc, r.propriedade);
    cads = cads || (await Store.todos('cadastrosPce')).filter(c => !Number(c.excluido));
    tfs = tfs || (await Store.todos('termosPce')).filter(t => !Number(t.excluido));
    const doc = digitos(r.doc), nomeP = semAcento(r.propriedade || '').toUpperCase().trim();
    const daProp = x => (pid && x.propriedadeId === pid) || (doc && digitos(x.doc) === doc && (!nomeP || semAcento(x.propriedade || '').toUpperCase().trim() === nomeP));
    return { pid, cadastro: cads.find(daProp) || null, termo: tfs.find(t => daProp(t) && t.data === r.data) || null };
  }
  function botoesVisita(r, v, grande) {
    if (!Sync.pode('pce') || (Number(r.registroAntigo) === 1 && !podeAntigo())) return '';
    const id = x => (grande ? `id="${x}"` : '');
    const cad = v.cadastro ? '' : `<button class="${grande ? 'botao' : 'editar'}" data-pce="cadvisita" data-id="${esc(r.id)}" ${id('pce-pronto-cad')}>🏡 Cadastrar a propriedade${grande ? ' e fazer o Termo' : ''}</button>`;
    const tf = v.termo ? `<button class="${grande ? 'botao sec' : 'editar'}" data-pce="abrirtfvisita" data-id="${esc(v.termo.id)}" ${id('pce-pronto-tf')}>📋 Termo de Fiscalização ${esc(v.termo.numeroTxt || '')}</button>`
      : `<button class="${grande ? (cad ? 'botao sec' : 'botao') : 'tfbtn'}" data-pce="tfvisita" data-id="${esc(r.id)}" ${id('pce-pronto-tf')}>📋 ${grande ? (cad ? 'Só o Termo de Fiscalização (sem cadastro)' : 'Fazer o Termo de Fiscalização da visita') : 'Termo de Fiscalização'}</button>`;
    return cad + tf;
  }
  /** Tela depois de salvar: resumo por praga e os PDFs (um por praga). */
  async function levPronto(id) {
    const r = id ? await Store.obter('levantamentos', id) : null; if (!r || r.excluido) return go('pce');
    const G = Docs.pceGrupos(r), amostras = amostrasDe(G), visita = await docsDaVisita(r);
    view(`<div class="card" id="pce-lev-pronto"><h3>✅ Levantamento salvo</h3>
      <p><b>${esc(r.nome)}</b> · ${esc(r.propriedade || 'Propriedade não informada')}</p><p>${esc(dBR(r.data))} ${esc(r.hora)} · ${esc(r.municipio)}</p>
      <ul class="pce-res-lista">${G.pragas.map(g => `<li><b>${esc(nomePraga(g.praga))}</b> ${seloRes(resultadoPraga(g))}<br><small>${g.culturas.map(c => `${esc(c.cultura)} (${esc(RES[c.resultado])}${c.fotos.length ? `, ${c.fotos.length} foto(s)` : ''})`).join(' · ')}</small></li>`).join('')}</ul>
      ${G.gerais.length ? `<p class="dica" style="text-align:left">${G.gerais.length} foto(s) gerais (registro anterior) saem em todos os PDFs.</p>` : ''}</div>
      ${botoesVisita(r, visita, true) ? `<div class="card pce-visita"><h3>Próximo passo da visita</h3>
        <p class="dica" style="text-align:left">${visita.cadastro ? 'Propriedade já cadastrada' + (visita.cadastro.numeroTxt ? ` (cadastro ${esc(visita.cadastro.numeroTxt)})` : '') + '.' : 'Propriedade nova: cadastre a propriedade e, ao salvar, o Termo de Fiscalização da visita abre já preenchido.'}</p>
        ${botoesVisita(r, visita, true)}</div>` : ''}
      <div class="pce-pdfs">${botoesPdf(r.id, G, true)}</div>
      <button class="botao sec" data-pce="enviarlev" data-id="${esc(r.id)}" id="pce-enviar">📤 Enviar ao produtor (WhatsApp, e-mail…)</button>
      <p class="dica">Um PDF por praga/doença: cada um traz os dados da visita, só as culturas e as fotos daquela praga e as assinaturas. Na janela de impressão, escolha “Salvar como PDF”.${G.pragas.length > 1 ? ' “Imprimir todos” gera um PDF de cada vez (no celular, cada um abre a sua janela de impressão).' : ''}</p>
      ${amostras.length && Sync.pode('pce') && !(Number(r.registroAntigo) === 1 && !podeAntigo()) ? `<button class="botao sec" data-pce="termodelev" data-id="${esc(r.id)}" id="pce-pronto-termo">🧪 Termo de colheita (${amostras.length} amostra(s))</button>` : ''}
      <button class="botao sec" data-v="pce" id="pce-pronto-lista">📋 Ver levantamentos</button>`);
  }

  async function lista() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await exigirServidor('pce', null, true); if (!s || !mostrar.viva()) return;
    fechar(L); fechar(T);
    const podeAnt = podeAntigo(), dig = soDigitador(s) && podeAnt, digSemAut = soDigitador(s) && !podeAnt;
    const todos = (await Store.todos('levantamentos')).filter(x => !x.excluido)
      .sort((a, b) => ((b.data || '') + (b.hora || '')).localeCompare((a.data || '') + (a.hora || '')) || b.criadoEm - a.criadoEm);
    const pendArq = new Set(await Store.chaves('arquivos', 'enviado', 0)), campoRes = await Campo.resumo();
    if (!mostrar.viva()) return;
    view(`<div class="card pce-serv"><div><b>${esc(s.nome)}</b><small>${dig ? 'Digitação de registros do papel' : esc(s.cargo) + ' · ' + esc(s.lotacao)}${s.matricula ? ' · Mat. ' + esc(s.matricula) : ''}</small></div>
        <button class="mini" data-pce="servidor" id="pce-meusdados">👤 Meus dados</button></div>
      ${digSemAut ? avisoSemAntigoHTML() : ''}
      ${dig ? '' : `<button class="botao" data-pce="novolev" id="pce-novolev">➕ Novo levantamento</button>
      <div class="duas campo-atalhos"><button class="botao sec" data-v="pcecampo" id="pce-campo">📥 Dados para o campo</button><button class="botao sec" data-v="pcemapa" id="pce-mapa">🗺️ Perto de mim</button></div>
      ${campoRes ? `<p class="dica" id="pce-campo-res">No aparelho: ${esc(campoRes)}</p>` : ''}`}
      ${podeAnt ? `<button class="botao ${dig ? '' : 'sec'}" data-pce="novolevantigo" id="pce-novolevantigo">📄 Registro antigo (digitar do papel)</button>` : ''}
      ${digSemAut ? '' : `<div class="pce-docs-atalhos" aria-label="Outros documentos do PCE">
        <button class="mini" data-v="pcecads" id="pce-cads">🏡 Cadastros de propriedades</button>
        <button class="mini" data-v="pcetfs" id="pce-tfs">📋 Termos de Fiscalização</button>
        <button class="mini" data-v="pcerel" id="pce-rel">📊 Relatório de atividades</button></div>`}
      <div class="card"><label>Pesquisar (produtor, CPF/CNPJ, propriedade, município, praga)<input id="pceQ"></label></div><div id="pceItens"></div>`);
    const G = new Map(todos.map(x => [x.id, Docs.pceGrupos(x)]));
    const cads = (await Store.todos('cadastrosPce')).filter(c => !Number(c.excluido)), tfsPce = (await Store.todos('termosPce')).filter(t => !Number(t.excluido));
    const V = new Map(await Promise.all(todos.map(async x => [x.id, await docsDaVisita(x, cads, tfsPce)])));
    if (!mostrar.viva()) return;
    const desenhar = () => {
      const q = semAcento($('#pceQ').value.trim()).toUpperCase(), qd = digitos(q);
      const v = todos.filter(x => !q || semAcento([x.nome, x.propriedade, x.municipio, x.codigoPropriedade, ...G.get(x.id).pragas.map(g => g.praga)].join(' ')).toUpperCase().includes(q) || (qd && digitos(x.doc).includes(qd)));
      $('#pceItens').innerHTML = v.length ? v.map(x => {
        const g = G.get(x.id), cult = g.pragas.flatMap(p => p.culturas), fotos = lerJSON(x.fotos, []), col = cult.filter(c => c.coleta === 'Sim').length;
        const pend = x.pendente || [...idsArquivos(x)].some(id => pendArq.has(id)), papelSemAut = Number(x.registroAntigo) === 1 && !podeAnt;
        return `<div class="item pce-lev" data-lev="${esc(x.id)}"><div class="topo"><div><div class="placa pce-nome">${esc(x.nome)}</div>
          <div class="tipo">${esc(x.propriedade || 'Propriedade não informada')} · ${esc(x.municipio)}</div></div><div class="hora">${esc(dBR(x.data))}<br>${esc(x.hora)}</div></div>
          <div class="info">${g.pragas.length} praga(s)/doença(s) · ${cult.length} cultura(s) avaliada(s)${col ? ` · ${col} com coleta` : ''} · ${fotos.length} foto(s)</div>
          ${g.pragas.length ? `<div class="info pce-res-resumo">${g.pragas.map(p => `<span>${esc(nomePraga(p.praga))} ${seloRes(resultadoPraga(p))}</span>`).join(' ')}</div>` : ''}
          ${pend ? `<div class="info pend">⏳ aguardando envio${papelSemAut ? ' — registro do papel: sem autorização, fica guardado neste aparelho' : ''}</div>` : ''}
          <div class="botoes pce-acoes">${papelSemAut ? '' : `<button class="editar" data-pce="abrirlev" data-id="${esc(x.id)}">Abrir</button>`}
          ${botoesPdf(x.id, g, false)}
          ${botoesVisita(x, V.get(x.id), false)}
          ${Sync.pode('pce') && !papelSemAut ? `<button class="tfbtn" data-pce="termodelev" data-id="${esc(x.id)}">Termo de colheita</button>` : ''}
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
  const termoVazioAntigo = (s, m = {}) => ({ ...termoVazio(s), unidade: m.unidade || '', municipio: m.municipio || '', data: m.data || '', hora: '',
    local: m.local || '', numPapel: '', coordTxt: '', sNome: m.sNome || '', sCargo: m.sCargo || '', sMatricula: m.sMatricula || '', sLotacao: m.sLotacao || '' });

  function coletarTermo() {
    const g = id => { const e = $('#pce-t-' + id); return e ? e.value : ''; };
    return { unidade: g('unidade'), municipio: g('municipio'), doc: g('doc'), nome: g('nome'), endereco: g('endereco'), lat: g('lat'), lon: g('lon'), precisao: g('precisao'),
      data: g('data'), hora: g('hora'), cultura: g('cultura'), quantidade: g('quantidade'), analise: g('analise'),
      partes: [...document.querySelectorAll('input[name=pce-t-parte]:checked')].map(c => c.value), descricao: g('descricao'),
      testemunha1Nome: g('t1nome'), testemunha1Doc: g('t1doc'), testemunha2Nome: g('t2nome'), testemunha2Doc: g('t2doc'), local: g('local'),
      numPapel: g('numpapel'), coordTxt: g('coord'), sNome: g('snome'), sCargo: cargoValor('pce-t-scargo'), sMatricula: g('smatricula'), sLotacao: g('slotacao') };
  }
  /**
   * Nº do termo como está no papel: "7", "007", "007/2026", "007/2026/MANAUS", "Nº 7/2026/Manaus". O ano deve ser o da data do termo
   * e a unidade, a escolhida. Devolve {n, ano, unidade} ou {erro}.
   */
  function lerNumeroPapel(txt, unidade, data) {
    const m = /^\s*(?:N\s*[º°O.]?\s*)?(\d{1,5})\s*(?:\/\s*(\d{4})\s*)?(?:\/\s*([^/]+?)\s*)?$/i.exec(String(txt || ''));
    if (!String(txt || '').trim()) return { erro: 'Informe o número do termo que está no papel.' };
    if (!m || !(Number(m[1]) > 0)) return { erro: 'Número do termo inválido. Use, por exemplo, 007/2026/MANAUS ou só 7.' };
    const ano = Number(String(data || '').slice(0, 4)) || 0, u = unid(unidade);
    if (m[2] && ano && Number(m[2]) !== ano) return { erro: `O ano do número (${m[2]}) é diferente do ano da data do termo (${ano}). Confira a data e o número.` };
    if (m[3] && u && semAcento(unid(m[3])) !== semAcento(u)) return { erro: `A unidade do número (${unid(m[3])}) é diferente da unidade escolhida (${u}).` };
    return { n: Number(m[1]), ano, unidade: u };
  }
  function mostrarNumeroPapel() {
    const st = $('#pce-t-numpapel-st'); if (!st || !T || !T.antigo) return;
    const D = coletarTermo(); if (!D.numPapel.trim()) { st.replaceChildren(); return; }
    const r = lerNumeroPapel(D.numPapel, D.unidade, D.data);
    st.innerHTML = r.erro ? `<div class="tf-alerta">⚠️ ${esc(r.erro)}</div>`
      : !r.unidade || !r.ano ? '<div class="tf-novo">Escolha a unidade e a data para conferir o número.</div>'
      : `<div class="tf-ok">✓ Será gravado como <b>${esc(numTxt(r.n, r.ano, r.unidade))}</b>. Ao gravar, a planilha confere se o número está livre.</div>`;
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
    const novo = textoOficial(coletarTermo(), T.antigo ? ($('#pce-t-snome').value.trim().replace(/\s+/g, ' ')) : T.serv.servidor);
    if (forcar || !el.value.trim() || el.value === T.tplDesc) { el.value = novo; T.tplDesc = novo; }
  }

  /** Tipo de material da amostra (texto livre do levantamento) → partes da planta do termo (folha → folhas, fruto → frutos…). */
  const partesDoMaterial = t => { const m = semAcento(t).toLowerCase(); return m ? P.partes.filter(p => p !== 'outros' && m.includes(semAcento(p).toLowerCase().slice(0, 4))) : []; };
  /** Amostra(s) do levantamento: uma só = informativo; várias = o fiscal escolhe a do termo (cultura e partes acompanham). */
  function amostraLevHTML(F, D) {
    const am = F.amostras || []; if (!am.length) return '';
    const txt = a => `${a.cultura} — ${nomePraga(a.praga)}${a.codigoAmostra ? ' · cód. ' + a.codigoAmostra : ''}`;
    if (am.length === 1) return `<p class="dica" style="text-align:left" id="pce-t-amostra-info">🧪 Amostra do levantamento: <b>${esc(txt(am[0]))}</b></p>`;
    const sel = Math.max(0, am.findIndex(a => a.cultura === D.cultura));
    return `<label>Amostra do levantamento (${am.length} com coleta)<select id="pce-t-amostra">${am.map((a, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(txt(a))}</option>`).join('')}</select></label>
      <p class="dica" style="text-align:left">Há mais de uma cultura/praga com coleta de amostra neste levantamento: escolha a deste termo (faça um termo para cada amostra).</p>`;
  }
  function usarAmostra(i) {
    const a = T && (T.amostras || [])[i]; if (!a) return;
    const sel = $('#pce-t-cultura');
    if (sel) { if (a.cultura && ![...sel.options].some(o => o.value === a.cultura)) sel.add(new Option(a.cultura, a.cultura)); sel.value = a.cultura; }
    const partes = partesDoMaterial(a.tipoMaterial);
    if (partes.length) document.querySelectorAll('input[name=pce-t-parte]').forEach(c => { c.checked = partes.includes(c.value); });
    autoTexto(false); agendarRascunho();
  }

  function formTermoHTML(D, F) {
    const c = (id, rot, v, extra = '') => `<label>${rot}<input id="pce-t-${id}" value="${esc(v)}" ${extra}></label>`;
    const A = F.antigo;
    return `<form id="pceTermoForm" autocomplete="off" class="${A ? 'pce-antigo' : ''}" ${A ? 'novalidate' : ''}>
    ${A ? topoAntigo('Registro antigo — Termo de Colheita (digitar do papel)', F) : ''}
    <div class="card"><h3>🧪 Termo de Colheita de Amostras</h3>
      <label>Unidade *<select id="pce-t-unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
      ${A ? `${c('numpapel', 'Nº do termo (como está no papel) *', D.numPapel, 'placeholder="ex.: 007/2026/MANAUS" autocomplete="off"')}
      <div id="pce-t-numpapel-st" class="tf-status" aria-live="polite"></div>` : '<div class="tf-num" id="pce-t-numero"></div>'}
      ${F.levantamentoId ? '<p class="dica" style="text-align:left">📎 Ligado a um levantamento fitossanitário.</p>' : ''}
      ${amostraLevHTML(F, D)}
      ${A ? '' : `<p class="dica" style="text-align:left">Servidor: <b>${esc(F.serv.servidor)}</b> · ${esc(F.serv.cargo)}</p>`}</div>
    ${A ? servAntigoHTML('pce-t-', D, F.lembrados) : ''}
    <div class="card"><h3>1. Identificação</h3>
      <label>Município *<select id="pce-t-municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>
      <div class="pce-busca">${c('doc', 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
        <button type="button" class="mini" data-pce="consultar" data-pref="pce-t-" aria-label="Consultar cadastro">🔍</button></div>
      <div id="pce-t-st-doc" class="tf-status" aria-live="polite"></div>
      ${c('nome', 'Produtor / Razão social *', D.nome)}
      ${c('endereco', 'Endereço da propriedade', D.endereco)}
      ${A ? coordAntigaHTML('pce-t-', D) : gpsHTML('pce-t-', D)}</div>
    <div class="card"><h3>2. Descrição da ação</h3>
      <div class="duas">${A ? c('data', 'Data *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`) + c('hora', 'Hora *', D.hora, 'type="time"')
        : c('data', 'Data', D.data, 'type="date"') + c('hora', 'Hora', D.hora, 'type="time"')}</div>
      <label>Cultura *<select id="pce-t-cultura">${opts(P.culturas, D.cultura, 'Selecione')}</select></label>
      <div class="duas">${c('quantidade', 'Quantidade de amostras *', D.quantidade, 'type="number" inputmode="numeric" min="1"')}${c('analise', 'Tipo de análise', D.analise)}</div>
      <fieldset class="pce-partes-grupo"><legend>Partes da planta coletadas</legend>
      <div class="pce-partes">${P.partes.map(p => `<label class="chk"><input type="checkbox" name="pce-t-parte" value="${esc(p)}" ${D.partes.includes(p) ? 'checked' : ''}> ${esc(p[0].toUpperCase() + p.slice(1))}</label>`).join('')}</div></fieldset>
      <label>Texto oficial (pode ser editado)<textarea id="pce-t-descricao" rows="6">${esc(D.descricao)}</textarea></label>
      <button type="button" class="botao sec" data-pce="gerartexto" id="pce-t-gerartexto">📝 Gerar texto oficial</button></div>
    ${A ? pdfHTML('pce-t-') : ''}
    <div class="card"><h3>3. Fotos da amostra</h3>
      <label class="pce-arquivo">📷 Adicionar fotos<input type="file" id="pce-t-fotos" accept="image/*" multiple></label>
      <div id="pce-t-fotos-prev" class="pce-fotos"></div></div>
    <div class="card"><h3>4. Testemunhas</h3>
      <div class="duas">${c('t1nome', 'Testemunha 1 – nome', D.testemunha1Nome)}${c('t1doc', 'Testemunha 1 – CPF/RG', D.testemunha1Doc)}</div>
      <div class="duas">${c('t2nome', 'Testemunha 2 – nome', D.testemunha2Nome)}${c('t2doc', 'Testemunha 2 – CPF/RG', D.testemunha2Doc)}</div></div>
    ${A ? '' : `<div class="card"><h3>Assinaturas (opcional)</h3>
      <p class="dica" style="text-align:left">Assine com o dedo, se quiser. O termo impresso sempre traz as linhas para assinar no papel.</p>
      ${assHTML('testemunha1', 'Testemunha 1')}${assHTML('testemunha2', 'Testemunha 2')}${assHTML('produtor', 'Produtor')}${assHTML('servidor', 'Servidor')}</div>`}
    <div class="card">${c('local', 'Local', D.local, 'placeholder="ex.: Manaus/AM"')}</div>
    <button class="botao" type="submit" id="pce-t-gerar">${A ? '💾 Gravar Termo de Colheita' : '📄 Gerar Termo de Colheita'}</button>
    ${A ? '<button class="botao" type="button" data-pce="gravaroutro" id="pce-t-gravar-outro">💾 Gravar e digitar outro</button>' : ''}
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
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido|desconhecida/i.test(e.message)) throw e; }      // sem resposta: segue offline
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
    const p0 = prefill || {}, s0 = await servidorAtual(), lev0 = p0.levantamentoId ? await Store.obter('levantamentos', p0.levantamentoId) : null;
    const querAntigo = !!(p0.antigo || (lev0 && Number(lev0.registroAntigo) === 1) || (soDigitador(s0) && podeAntigo()));
    if (querAntigo && !podeAntigo()) { toast(SEM_ANTIGO, true); return go(lev0 ? 'pce' : 'pcetermos'); }   // termo do papel: só com a permissão "antigo"
    const s = await exigirServidor('pcetermo', prefill, querAntigo); if (!s) return;
    prefill = p0; fechar(L); fechar(T); T = null;
    let F = null, D = null;
    let rasc = await Store.meta('pceTermoRascunho');
    if (!(await rascunhoAntigoSemPermissao('termo', rasc, 'pcetermos'))) return;
    if (rasc && rasc.antigo && !podeAntigo()) rasc = null;                 // rascunho do papel sem permissão: já descartado acima
    if (rasc && rasc.dados && prefill.levantamentoId && rasc.levantamentoId !== prefill.levantamentoId) {   // rascunho de OUTRO produtor/levantamento
      if (!confirm(`Há um Termo de Colheita não gerado${rasc.dados.nome ? ' de ' + rasc.dados.nome : ''}, de outro levantamento, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nDescartar esse rascunho e abrir um termo do levantamento selecionado? (Cancelar volta à lista sem perder o rascunho.)`)) return go('pce');
      await descartarRascunho('termo', rasc);
    } else if (rasc && rasc.dados) {
      if (confirm(`Há um Termo de Colheita não gerado, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
        F = { id: rasc.id, fotos: rasc.fotos || [], docs: rasc.docs || [], antigo: !!rasc.antigo, ass: {}, assNovas: rasc.assNovas || {}, levantamentoId: rasc.levantamentoId || '', tplDesc: rasc.tplDesc || '' };
        D = { ...(F.antigo ? termoVazioAntigo(s) : termoVazio(s)), ...rasc.dados };
      } else await descartarRascunho('termo', rasc);
    }
    if (!F) {
      F = { id: Store.novoId(), fotos: [], docs: [], antigo: querAntigo, ass: {}, assNovas: {}, levantamentoId: '', tplDesc: '' };
      D = F.antigo ? termoVazioAntigo(s, prefill.manter) : termoVazio(s);
      const lev = prefill.levantamentoId ? await Store.obter('levantamentos', prefill.levantamentoId) : null;
      if (lev) {                                                             // termo a partir de um levantamento
        // pré-seleciona a cultura/praga com coleta de amostra (se houver várias, o formulário deixa escolher)
        const G = Docs.pceGrupos(lev), am = amostrasDe(G), c = am[0] || G.pragas.flatMap(g => g.culturas)[0] || {};
        F.levantamentoId = lev.id;
        Object.assign(D, { doc: fmtDoc(digitos(lev.doc)), nome: lev.nome || '', municipio: lev.municipio || D.municipio, lat: lev.lat == null ? '' : lev.lat,
          lon: lev.lon == null ? '' : lev.lon, precisao: lev.precisao == null ? '' : lev.precisao, cultura: c.cultura || '', partes: partesDoMaterial(c.tipoMaterial),
          endereco: [lev.propriedade, lev.codigoPropriedade && 'cód. ' + lev.codigoPropriedade].filter(Boolean).join(' – '),
          local: (lev.municipio || s.lotacao) ? (lev.municipio || s.lotacao) + '/AM' : '' });
        if (F.antigo) Object.assign(D, { unidade: lev.municipio || '', data: lev.data || '', hora: lev.hora || '', coordTxt: coordTxtDe(lev),   // termo do papel ligado a um levantamento do papel
          sNome: lev.servidor || '', sCargo: lev.cargo || '', sMatricula: lev.matricula || '', sLotacao: lev.lotacao || '', local: lev.municipio ? lev.municipio + '/AM' : '' });
      }
    }
    F.dono = 'colheitas'; F.vivo = true; F.serv = dadosServidor(s);
    const levA = F.levantamentoId ? await Store.obter('levantamentos', F.levantamentoId) : null;
    F.amostras = levA ? amostrasDe(Docs.pceGrupos(levA)) : [];
    if (F.antigo) F.lembrados = await servidoresLembrados();
    T = F;
    view(formTermoHTML(D, F));
    if (F.antigo) { mostrarCoord('pce-t-'); mostrarNumeroPapel(); await renderDocs(F, '#pce-t-pdfs-lista'); }
    else await mostrarInfoNumero();
    autoTexto(false);
    await renderFotos(F, '#pce-t-fotos-prev');
    if (!F.antigo) for (const p of ['testemunha1', 'testemunha2', 'produtor', 'servidor']) await ligarAssinatura(F, p);
    const f = $('#pceTermoForm');
    const AFETA = ['pce-t-data', 'pce-t-hora', 'pce-t-cultura', 'pce-t-quantidade', 'pce-t-analise', 'pce-t-snome'];
    const NUM = ['pce-t-numpapel', 'pce-t-unidade', 'pce-t-data'];
    f.addEventListener('input', e => {
      if (e.target.id === 'pce-t-doc') aoDigitarDoc('pce-t-', e.target);
      if (e.target.id === 'pce-t-coord') mostrarCoord('pce-t-');
      if (NUM.includes(e.target.id)) mostrarNumeroPapel();
      if (AFETA.includes(e.target.id)) autoTexto(false);
      agendarRascunho();
    });
    f.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'pce-t-fotos') return adicionarFotos(F, t, '#pce-t-fotos-prev');
      if (t.id === 'pce-t-pdfs') return adicionarPDFs(F, t, '#pce-t-pdfs-lista');
      if (t.id === 'pce-t-amostra') return usarAmostra(+t.value);
      if (t.id === 'pce-t-snome') await completarServidor('pce-t-');
      if (t.id === 'pce-t-doc') t.value = fmtDoc(digitos(t.value));
      if (NUM.includes(t.id)) mostrarNumeroPapel();
      if (t.id === 'pce-t-unidade' && !F.antigo) await mostrarInfoNumero();
      if (AFETA.includes(t.id) || t.name === 'pce-t-parte') autoTexto(false);
      agendarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); gerarTermo(); };
    if (F.antigo) { const p1 = $(D.unidade ? '#pce-t-numpapel' : '#pce-t-unidade'); if (p1) p1.focus(); }
    else if (D.lat === '' || D.lat == null) capturarGPS('pce-t-', true);
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

  async function gerarTermo(outro) {
    const F = T; if (!F || !F.vivo) return;
    const D = coletarTermo(), a = anoAtual(), u = unid(D.unidade), doc = digitos(D.doc);
    if (!u) return toast('Escolha a unidade.', true);
    if (F.antigo) return gravarTermoAntigo(F, D, u, doc, outro);
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
        } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) return toast(e.message, true); }   // sem resposta: guarda e envia ao sincronizar
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

  /* ---------- Termo de Colheita antigo (digitado do papel): o número é o do papel; a planilha só confere se está livre ---------- */
  function confirmarNumeroAntigo(o) {                                     // popup: número do papel + efeito na sequência
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal';
      const r = o.info.ultimoTermo, ult = o.info.ultimo;
      const ultTxt = r && r.numeroTxt ? `Último número usado nesta unidade em ${o.ano}: <b>${esc(r.numeroTxt)}</b>${r.usuario ? ` (${esc(r.usuario)}, ${esc(dBR(r.data))} ${esc(r.hora || '')})` : ''}.`
        : ult ? `Último número usado nesta unidade em ${o.ano}: <b>${esc(numTxt(ult, o.ano, o.unidade))}</b>.` : `Nenhum Termo de Colheita registrado nesta unidade em ${o.ano}.`;
      const efeito = o.n <= ult ? `<div class="tf-ok">✓ Número dentro da sequência já usada: não muda o próximo número (${esc(num3(ult + 1))}).</div>`
        : o.n === ult + 1 ? `<div class="tf-novo">ℹ️ É o próximo da sequência: depois de gravar, o próximo número sugerido nesta unidade passa a ser <b>${esc(num3(o.n + 1))}</b>.</div>`
        : `<div class="tf-alerta">⚠️ O número digitado é <b>maior</b> que o último usado (${esc(num3(ult))}). Depois de gravar, os próximos termos desta unidade em ${o.ano} — inclusive os dos fiscais em campo — continuam a partir de <b>${esc(num3(o.n + 1))}</b>. Confira se o número do papel está certo.</div>`;
      m.innerHTML = `<div class="tf-modal-box"><h3>🧪 Gravar Termo de Colheita</h3>
        <div class="tf-num"><b id="pce-antigo-num">${esc(numTxt(o.n, o.ano, o.unidade))}</b></div>
        <p class="dica">${ultTxt}</p>${efeito}
        <div class="duas"><button class="botao sec" id="pce-m-cancel" type="button">Cancelar</button><button class="botao" id="pce-m-ok" type="button">Confirmar e gravar</button></div></div>`;
      document.body.append(m);
      m.querySelector('#pce-m-cancel').onclick = () => { m.remove(); ok(false); };
      m.querySelector('#pce-m-ok').onclick = () => { m.remove(); ok(true); };
      m.querySelector('#pce-m-ok').focus();
    });
  }
  function avisoNumero(html) { const st = $('#pce-t-numpapel-st'); if (st) st.innerHTML = html; const el = $('#pce-t-numpapel'); if (el) el.focus(); }
  async function gravarTermoAntigo(F, D, u, doc, outro) {
    const sv = servidorDigitado('pce-t-'); if (!sv) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    if (!D.nome.trim()) return toast('Informe o nome do produtor / razão social.', true);
    if (!conferirDoc(doc)) return;
    if (!D.cultura) return toast('Escolha a cultura.', true);
    if (!(Number(D.quantidade) > 0)) return toast('Informe a quantidade de amostras.', true);
    if (!dataHoraPassadaOk(D)) return;
    const num = lerNumeroPapel(D.numPapel, u, D.data);
    if (num.erro) { avisoNumero(`<div class="tf-alerta">⚠️ ${esc(num.erro)}</div>`); return toast(num.erro, true); }
    if (!coordOk(D.coordTxt)) return;
    mostrarCoord('pce-t-'); D.lat = $('#pce-t-lat').value; D.lon = $('#pce-t-lon').value; D.precisao = '';
    if (!D.descricao.trim()) { autoTexto(true); D.descricao = $('#pce-t-descricao').value; }
    if (!navigator.onLine || !Sync.ativado()) return toast('Sem conexão. O termo antigo precisa de internet: a planilha confere se o número do papel está livre.', true);
    if (!podeAntigo()) return toast(SEM_ANTIGO, true);                       // gerência tirou a permissão: o rascunho continua guardado
    if (F.gerando) return;
    const btns = ['#pce-t-gerar', '#pce-t-gravar-outro'].map(x => $(x)).filter(Boolean);
    F.gerando = true; btns.forEach(b => { b.disabled = true; });
    try {
      const n = num.n, a = num.ano, id = F.id, t0 = Date.now(), nome = D.nome.trim().replace(/\s+/g, ' ').toUpperCase();
      const local = (await Store.todos('colheitas')).find(t => unid(t.unidade) === u && Number(t.ano) === a && Number(t.numero) === n && t.id !== id);
      if (local) return avisoNumero(`<div class="tf-alerta">⚠️ O nº ${esc(numTxt(n, a, u))} já está registrado neste aparelho (${esc(local.nome)}, ${esc(dBR(local.data))}). Confira o número no papel.</div>`);
      let info;
      try { info = await Sync.pceProximoNumero(u, a); }
      catch (e) { return toast(e.semPermissao || /revogado|inv[aá]lido/i.test(e.message) ? e.message : 'Sem resposta da planilha. Tente de novo (o termo antigo precisa de internet).', true); }
      if (!F.vivo || !(await confirmarNumeroAntigo({ n, ano: a, unidade: u, info })) || !F.vivo) return;
      const pessoa = await montarPessoa(doc, { nome });
      const lev = F.levantamentoId ? await Store.obter('levantamentos', F.levantamentoId) : null;
      const prop = lev ? await montarPropriedade({ codigo: lev.codigoPropriedade, nome: lev.propriedade, doc, municipio: lev.municipio, situacaoFundiaria: lev.situacaoFundiaria, lat: lev.lat, lon: lev.lon }) : null;
      const rec = {
        id, criadoEm: t0, atualizadoEm: t0, unidade: u, ano: a, numero: n, numeroTxt: numTxt(n, a, u), numeroSugerido: info.proximo,
        numeroOrigem: n === info.proximo ? 'sistema' : 'editado', conflito: 0, levantamentoId: F.levantamentoId || '',
        data: D.data, hora: D.hora, ...sv, municipio: D.municipio, doc, nome, endereco: D.endereco.trim(),
        lat: numOuVazio(D.lat), lon: numOuVazio(D.lon), precisao: '', cultura: D.cultura, quantidade: Number(D.quantidade) || 0,
        analise: D.analise.trim(), partes: D.partes.join(', '), descricao: D.descricao.trim(), fotos: JSON.stringify(F.fotos),
        testemunha1Nome: D.testemunha1Nome.trim(), testemunha1Doc: D.testemunha1Doc.trim(), testemunha2Nome: D.testemunha2Nome.trim(), testemunha2Doc: D.testemunha2Doc.trim(),
        assinaturas: '{}', local: D.local.trim(), cancelado: 0, motivoCancel: '', excluido: 0, registroAntigo: 1, documentos: JSON.stringify(F.docs)
      };
      let r;
      try { r = await Sync.pceEmitir(rec, pessoa, prop); }
      catch (e) { return toast(e.semPermissao || /revogado|inv[aá]lido/i.test(e.message) ? e.message : 'Sem resposta da planilha: o termo NÃO foi gravado. Tente de novo.', true); }
      if (r.emitido === false) {
        const oc = r.ocupadoPor || {};
        const msg = `O nº ${numTxt(n, a, u)} já está registrado na planilha${oc.usuario ? ` — usado por ${oc.usuario} (${dBR(oc.data)} ${oc.hora || ''})` : ''}. Confira o número no papel.`;
        avisoNumero(`<div class="tf-alerta">⛔ ${esc(msg)}</div>`); return toast(msg, true);
      }
      await Store.gravar('colheitas', { ...rec, pendente: 0, emitidoEm: r.emitidoEm });
      await Store.gravar('pessoas', { ...pessoa, pendente: 0 });
      if (prop) await Store.gravar('propriedades', { ...prop, pendente: 0 });
      await Sync.lembrarUltimosPce({ [chave(u, a)]: n });
      await lembrarServidor(sv);
      fechar(F); T = null; await Store.setMeta('pceTermoRascunho', null);
      Sync.sincronizar();                                                    // PDFs e fotos sobem ao Drive
      if (outro) {
        toast(`Termo ${numTxt(n, a, u)} gravado. Digite o próximo.`);
        go('pcetermo', { antigo: true, manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data, local: D.local.trim() } });
      } else go('pcepronto', id);
    } finally { F.gerando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }

  async function pronto(id) {
    const t = await Store.obter('colheitas', id); if (!t) return go('pcetermos');
    view(`<div class="card" id="pce-pronto"><h3>✅ Termo de Colheita gerado</h3><div class="tf-num"><b id="pce-pronto-num">${esc(t.numeroTxt)}</b></div>
      <p>${esc(t.nome)} · ${esc(fmtDoc(digitos(t.doc)))}</p><p>${esc(dBR(t.data))} ${esc(t.hora)} · ${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s)</p>
      ${t.pendente ? '<div class="tf-novo">⏳ Número provisório / aguardando envio: será conferido na planilha ao sincronizar. Se houver repetição, a coordenação é avisada.</div>' : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}
      ${t.numeroOrigem === 'editado' && Number(t.registroAntigo) !== 1 ? `<div class="tf-novo">✏️ Número alterado manualmente (o sistema sugeriu ${num3(t.numeroSugerido)}). Registrado para auditoria.</div>` : ''}</div>
      <button class="botao" data-pce="imprimirtermo" data-id="${esc(t.id)}" id="pce-imprimir">🖨️ Imprimir / PDF (${P.vias || 2} vias)</button>
      <button class="botao sec" data-pce="enviartermo" data-id="${esc(t.id)}" id="pce-t-enviar">📤 Enviar via do produtor (WhatsApp, e-mail…)</button>
      ${Number(t.registroAntigo) === 1 && podeAntigo() ? '<button class="botao sec" data-pce="novotermoantigo">📄 Digitar outro termo do papel</button>' : '<button class="botao sec" data-pce="novotermo">➕ Novo termo</button>'}
      <button class="botao sec" data-v="pcetermos">📋 Ver termos de colheita</button>
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto. As vias saem em páginas separadas.</p>`);
  }

  async function termos() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await exigirServidor('pcetermos', null, true); if (!s || !mostrar.viva()) return;
    fechar(L); fechar(T);
    const podeAnt = podeAntigo(), dig = soDigitador(s) && podeAnt, digSemAut = soDigitador(s) && !podeAnt;
    const todos = (await Store.todos('colheitas')).filter(x => !x.excluido).sort((a, b) => b.criadoEm - a.criadoEm);
    if (!mostrar.viva()) return;
    view(`${digSemAut ? avisoSemAntigoHTML() : ''}
      ${dig ? '' : '<button class="botao" data-pce="novotermo" id="pce-novotermo">➕ Novo termo de colheita</button>'}
      ${podeAnt ? `<button class="botao ${dig ? '' : 'sec'}" data-pce="novotermoantigo" id="pce-novotermoantigo">📄 Termo antigo (digitar do papel)</button>` : ''}
      <div class="card"><label>Pesquisar (nº, produtor, CPF/CNPJ, cultura)<input id="pceTQ"></label></div><div id="pceTItens"></div>`);
    const desenhar = () => {
      const q = semAcento($('#pceTQ').value.trim()).toUpperCase(), qd = digitos(q);
      const v = todos.filter(t => !q || semAcento([t.numeroTxt, t.nome, t.cultura, t.municipio].join(' ')).toUpperCase().includes(q) || (qd && digitos(t.doc).includes(qd)));
      $('#pceTItens').innerHTML = v.length ? v.map(t => `<div class="item pce-termo" data-termo="${esc(t.id)}"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div>
        <div class="hora">${esc(dBR(t.data))}</div></div>
        <div class="info">${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s) · ${esc(t.municipio)}</div>
        ${t.cancelado ? `<div class="info pend">⛔ CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
        ${t.conflito ? '<div class="info pend">⚠️ Número duplicado na planilha: confira com a coordenação.</div>' : ''}
        ${t.pendente ? `<div class="info pend">⏳ ${t.provisorio ? 'número provisório, será conferido ao sincronizar' : 'aguardando envio'}${Number(t.registroAntigo) === 1 && !podeAnt ? ' — termo do papel: sem autorização, fica guardado neste aparelho' : ''}</div>` : ''}
        <div class="botoes"><button class="editar" data-pce="imprimirtermo" data-id="${esc(t.id)}">Imprimir</button>
        ${t.cancelado ? '' : `<button class="excluir" data-pce="cancelartermo" data-id="${esc(t.id)}">Cancelar termo</button>`}</div></div>`).join('')
        : '<div class="vazio">Nenhum Termo de Colheita neste aparelho.</div>';
    };
    desenhar(); $('#pceTQ').oninput = desenhar;
  }

  /* ---------- impressão (modelos em web/documentos, via docs.js) ---------- */
  async function imprimir(qual, id, g) {
    const store = qual === 'lev' ? 'levantamentos' : 'colheitas', fn = qual === 'lev' ? 'pceLevantamento' : 'pceColheita';
    const r = await Store.obter(store, id); if (!r) throw new Error('Registro não encontrado.');
    if (typeof Docs[fn] !== 'function') throw new Error('Modelo de impressão indisponível nesta versão do app.');
    await Docs[fn](r, await arquivosPorId(r), qual === 'lev' ? Number(g) || 0 : undefined);
  }
  /**
   * "Imprimir todos": gera os PDFs das pragas um de cada vez. O 1º sai já; para cada um dos seguintes o fiscal toca em "Gerar PDF n de N"
   * (no celular cada PDF abre a sua janela de impressão, e o navegador só abre a impressão com um toque do usuário).
   */
  async function imprimirTodos(id) {
    const r = await Store.obter('levantamentos', id); if (!r) throw new Error('Registro não encontrado.');
    const G = Docs.pceGrupos(r), n = G.pragas.length, arqs = await arquivosPorId(r);
    const fechar = () => { const m = $('#pce-modal-todos'); if (m) m.remove(); };
    const passo = async i => {
      await Docs.pceLevantamento(r, arqs, i);
      fechar();
      const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal-todos';
      const prox = G.pragas[i + 1];
      m.innerHTML = `<div class="tf-modal-box"><h3>🖨️ Imprimir todos</h3>
        <div class="tf-ok">✓ PDF ${i + 1} de ${n} gerado: <b>${esc(nomePraga(G.pragas[i].praga))}</b></div>
        ${prox ? `<p class="dica">Toque para gerar o próximo. No celular, cada PDF abre a sua própria janela de impressão (escolha “Salvar como PDF”).</p>
        <button class="botao" type="button" id="pce-todos-prox">Gerar PDF ${i + 2} de ${n}: ${esc(nomePraga(prox.praga))}</button>
        <button class="botao sec" type="button" id="pce-todos-fechar">Parar</button>`
        : `<p class="dica">Todos os ${n} PDFs foram gerados.</p><button class="botao" type="button" id="pce-todos-fechar">Fechar</button>`}</div>`;
      document.body.append(m);
      if (prox) m.querySelector('#pce-todos-prox').onclick = () => passo(i + 1).catch(e => toast(e.message || String(e), true));
      m.querySelector('#pce-todos-fechar').onclick = fechar;
    };
    await passo(0);
  }

  /**
   * Via do produtor sem impressora: gera o(s) PDF(s) no aparelho (pdf.js, sem internet) e abre o compartilhamento do celular
   * (WhatsApp, e-mail…) com os arquivos. Em dois toques: gerar leva alguns segundos e o navegador só abre o compartilhamento a partir
   * de um toque recente. Sem compartilhamento de arquivos (computador, navegador antigo): baixa o PDF e explica como enviar.
   */
  async function enviarProdutor(qual, id) {
    const lev = qual === 'lev', r = await Store.obter(lev ? 'levantamentos' : 'colheitas', id); if (!r) throw new Error('Registro não encontrado.');
    const G = lev ? Docs.pceGrupos(r) : null, itens = lev ? (G.pragas.length ? G.pragas.map((g, i) => ({ i, rot: nomePraga(g.praga) })) : [{ i: 0, rot: 'Ficha' }])
      : [{ i: 0, rot: 'Termo de Colheita ' + (r.numeroTxt || '') + ' — via do produtor' }];
    const fecharM = () => { const m = $('#pce-modal-enviar'); if (m) m.remove(); };
    fecharM();
    const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal-enviar';
    m.innerHTML = `<div class="tf-modal-box pce-enviar"><h3>📤 Enviar ao produtor</h3>
      <p class="dica">${esc(r.nome || '')}${r.telefone ? ' · ☎ ' + esc(r.telefone) : ''}</p>
      ${itens.length > 1 ? `<div class="pce-enviar-lista">${itens.map(x => `<label class="chk"><input type="checkbox" name="pce-env" value="${x.i}" checked> PDF: ${esc(x.rot)}</label>`).join('')}</div>`
        : `<p><b>${esc(lev ? 'PDF: ' + itens[0].rot : itens[0].rot)}</b></p>`}
      <div id="pce-env-st" class="tf-status" aria-live="polite"></div>
      <button class="botao" type="button" id="pce-env-gerar">📄 Gerar PDF${itens.length > 1 ? '(s)' : ''}</button>
      <button class="botao sec" type="button" id="pce-env-fechar">Fechar</button></div>`;
    document.body.append(m);
    const st = m.querySelector('#pce-env-st');
    m.querySelector('#pce-env-fechar').onclick = fecharM;
    m.querySelector('#pce-env-gerar').onclick = async ev => {
      const btn = ev.currentTarget, marcados = [...m.querySelectorAll('input[name=pce-env]:checked')].map(c => Number(c.value));
      const sel = itens.length > 1 ? itens.filter(x => marcados.includes(x.i)) : itens;
      if (!sel.length) return toast('Marque pelo menos um PDF.', true);
      btn.disabled = true;
      const files = [];
      try {
        const arqs = await arquivosPorId(r);
        for (const [k, x] of sel.entries()) {
          st.innerHTML = `<small>Gerando PDF ${k + 1} de ${sel.length}: ${esc(x.rot)}…</small>`;
          files.push(lev ? await Docs.pceLevantamento(r, arqs, x.i, 'arquivo') : await Docs.pceColheita(r, arqs, 'arquivo'));
        }
      } catch (e) { btn.disabled = false; st.innerHTML = `<div class="tf-alerta">⚠️ Não foi possível gerar o PDF: ${esc(e.message || e)}. Use “Imprimir” → “Salvar como PDF” e envie o arquivo salvo.</div>`; return; }
      if (!m.isConnected) return;
      const kb = f => Math.max(1, Math.round(f.size / 1024)).toLocaleString('pt-BR') + ' KB';
      const juntos = PDF.podeCompartilhar(files), umAUm = !juntos && files.length > 1 && PDF.podeCompartilhar(files.slice(0, 1));
      const titulo = lev ? 'Levantamento fitossanitário — ADAF' : 'Termo de Colheita de Amostras — ADAF';
      const texto = `${titulo}: ${r.nome || ''}, ${dBR(r.data)}. Documento gerado pelo e-GDV.`;
      st.innerHTML = `<div class="tf-ok">✓ ${files.length} PDF(s) prontos: ${files.map(f => `${esc(f.name)} (${kb(f)})`).join(', ')}</div>`;
      btn.remove();
      const box = m.querySelector('.tf-modal-box'), fim = m.querySelector('#pce-env-fechar');
      const add = html => { fim.insertAdjacentHTML('beforebegin', html); return fim.previousElementSibling; };
      if (juntos || umAUm) {
        (juntos ? [files] : files.map(f => [f])).forEach((fs, k) => {
          const b = add(`<button class="botao" type="button" id="pce-env-share${juntos ? '' : '-' + k}">📤 Compartilhar${juntos ? (files.length > 1 ? ` (${files.length} PDFs)` : '') : ': ' + esc(sel[k].rot)}</button>`);
          b.onclick = async () => { try { if (await PDF.compartilhar(fs, titulo, texto)) toast('Enviado para o compartilhamento.'); } catch (e) { toast(e.message, true); } };
        });
        add('<p class="dica">Escolha o WhatsApp (ou o e-mail) e o contato do produtor.</p>');
      } else add('<p class="dica pce-env-semshare">Este aparelho não compartilha arquivos direto do app. Toque em “Baixar”: o PDF vai para a pasta <b>Downloads</b>. Depois, no WhatsApp, anexe (📎) → <b>Documento</b> e escolha o arquivo.</p>');
      const bx = add(`<button class="botao ${juntos || umAUm ? 'sec' : ''}" type="button" id="pce-env-baixar">⬇️ Baixar PDF${files.length > 1 ? 's' : ''}</button>`);
      bx.onclick = () => files.forEach((f, k) => setTimeout(() => PDF.baixar(f), k * 400));
      box.scrollTop = 0;
    };
  }

  /** Resumo para o cartão do módulo no hub. */
  async function status() {
    const levs = (await Store.todos('levantamentos')).filter(x => !x.excluido), cols = (await Store.todos('colheitas')).filter(x => !x.excluido);
    const pend = levs.filter(x => x.pendente).length + cols.filter(x => x.pendente).length + (await Sync.arquivosPendentes(null, null, [])).length;   // só os do PCE
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
      else if (a === 'novolevantigo') go('pcelev', { antigo: true });
      else if (a === 'novotermoantigo') go('pcetermo', { antigo: true });
      else if (a === 'abrirlev') go('pcelev', id);
      else if (a === 'imprimirlev') await imprimir('lev', id, el.dataset.g);
      else if (a === 'imprimirtodos') await imprimirTodos(id);
      else if (a === 'enviarlev') await enviarProdutor('lev', id);
      else if (a === 'enviartermo') await enviarProdutor('termo', id);
      else if (a === 'termodelev') go('pcetermo', { levantamentoId: id });
      else if (a === 'abrirtfvisita') go('pcetf', id);
      else if (a === 'tfvisita' || a === 'cadvisita') {                    // Termo de Fiscalização / cadastro da propriedade a partir do levantamento
        const r = await Store.obter('levantamentos', id); if (!r) return;
        const v = await docsDaVisita(r), antigo = Number(r.registroAntigo) === 1;
        if (a === 'cadvisita') go('pcecad', { propId: v.pid, levId: r.id, antigo });
        else go('pcetf', v.cadastro ? { cadastroId: v.cadastro.id, levId: r.id, antigo } : { propId: v.pid, levId: r.id, antigo });
      }
      else if (a === 'excluirlev') await excluirLev(id);
      else if (a === 'novotermo') go('pcetermo');
      else if (a === 'imprimirtermo') await imprimir('termo', id);
      else if (a === 'cancelartermo') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        const t = await Store.obter('colheitas', id); await Store.salvar('colheitas', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); termos();
      }
      else if (!F) return;
      else if (a === 'addpraga') {
        const lst = coletarLev().pragas; if (lst.length >= MAX_PRAGAS) return toast(`Limite de ${MAX_PRAGAS} pragas/doenças por levantamento.`, true);
        if (lst.reduce((s, g) => s + g.culturas.length, 0) >= MAX_CULTURAS) return toast(`Limite de ${MAX_CULTURAS} culturas por levantamento (somando as pragas).`, true);
        lst.push(pragaVazia()); await desenharPragas(lst); agendarRascunho();
        const novo = document.querySelectorAll('#pce-pragas .pce-praga'), ult = novo[novo.length - 1];
        if (ult) { ult.scrollIntoView({ block: 'start' }); ult.querySelector('.p-praga').focus(); }
      } else if (a === 'addcult') {
        const lst = coletarLev().pragas, g = lst[+el.dataset.p]; if (!g) return;
        if (lst.reduce((s, x) => s + x.culturas.length, 0) >= MAX_CULTURAS) return toast(`Limite de ${MAX_CULTURAS} culturas por levantamento (somando as pragas).`, true);
        g.culturas.push(culturaVazia()); await desenharPragas(lst); agendarRascunho();
      } else if (a === 'delcult' || a === 'delpraga') {
        const lst = coletarLev().pragas, salvo = idsArquivos(F.rec);
        let fora = [];
        if (a === 'delcult') {
          const g = lst.find(x => x.culturas.some(c => c.uid === el.dataset.uid)); if (!g) return;
          const c = g.culturas.find(x => x.uid === el.dataset.uid);
          if (c.fotos.length && !confirm(`Remover a cultura${c.cultura ? ' ' + c.cultura : ''} e ${c.fotos.length === 1 ? 'a foto dela' : `as ${c.fotos.length} fotos dela`}?`)) return;
          g.culturas = g.culturas.filter(x => x !== c); if (!g.culturas.length) g.culturas.push(culturaVazia());
          fora = [c];
        } else {
          const i = +el.dataset.p, g = lst[i]; if (!g) return;
          const nF = g.culturas.reduce((s, c) => s + c.fotos.length, 0), nC = g.culturas.filter(c => c.cultura).length;
          if ((nF || nC || g.praga) && !confirm(`Remover ${g.praga ? 'a praga/doença ' + g.praga : 'este card'}${nC ? ` com ${nC} cultura(s)` : ''}${nF ? ` e ${nF} foto(s)` : ''}?`)) return;
          lst.splice(i, 1); if (!lst.length) lst.push(pragaVazia());
          fora = g.culturas;
        }
        for (const c of fora) { await apagarSeNaoEnviado(c.fotos.filter(x => !salvo.has(x))); delete F.fotosC[c.uid]; }
        await desenharPragas(lst); agendarRascunho();
      }
      else if (a === 'delfoto') {
        const ch = el.dataset.chave;                                         // levantamento: foto de uma cultura (uid) ou "gerais"
        await removerFoto(F, id, ch ? (ch === 'gerais' ? '#pce-fotos-gerais' : '#pce-fotos-' + ch) : prev, ch || undefined);
      }
      else if (a === 'deldoc') await removerDoc(F, id, noTermo ? '#pce-t-pdfs-lista' : '#pce-pdfs-lista');
      else if (a === 'verdoc') await verDoc(id);
      else if (a === 'salvaroutro') await salvarLev(true);
      else if (a === 'gravaroutro') await gerarTermo(true);
      else if (a === 'limparass') limparAssinatura(F, el.dataset.papel);
      else if (a === 'deldocprod') { await soltarDocProdutor(F); await renderDocProdutor(F); agendarRascunho(0); }
      else if (a === 'gps') await capturarGPS(el.dataset.pref);
      else if (a === 'consultar') await consultarDoc(el.dataset.pref);
      else if (a === 'usarprop') usarPropriedade(el.dataset.pref, +el.dataset.i);
      else if (a === 'escolherprop') { const x = F.busca && F.busca[+el.dataset.i]; if (x) preencherProdutor(x, 'Escolhido na busca'); }
      else if (a === 'gerartexto') { autoTexto(true); agendarRascunho(); }
      else if (a === 'descartarlev') {
        if (!confirm(F.novo ? 'Descartar este levantamento? Os dados preenchidos serão perdidos.' : 'Descartar as alterações deste levantamento?')) return;
        fechar(F); L = null;
        const salvo = idsArquivos(F.rec);
        await apagarSeNaoEnviado([...F.fotos, ...F.docs].filter(x => !salvo.has(x)));
        await Store.setMeta('pceLevRascunho', null); go('pce');
      } else if (a === 'descartartermo') {
        if (!confirm('Descartar este termo? Os dados preenchidos serão perdidos.')) return;
        fechar(F); T = null;
        await apagarSeNaoEnviado([...F.fotos, ...F.docs]); await Store.setMeta('pceTermoRascunho', null); go('pcetermos');
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { lista, levantamento, levPronto, termos, termo, pronto, servidor, status, textoOficial, lerCoordenadas, lerNumeroPapel,
    // usados pelo moniliase.js (Cadastro de imóvel e Termo de Fiscalização do PCE)
    docOk, fmtDoc, validarCoord, gms, servidorAtual, servidorOk, soDigitador, podeAntigo, exigirServidor, dadosServidor, servAntigoHTML, servidorDigitado, cargoValor,
    lembrarServidor, completarServidor, servidoresLembrados, dataHoraPassadaOk, montarPessoa, opts, SEM_ANTIGO };
})();
