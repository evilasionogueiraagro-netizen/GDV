// Módulo PCE — parte comum: identificação do servidor, coordenadas e registros do papel, fotos, PDFs e assinaturas, Termo de Colheita de Amostras
// (nasce na visita, quando há coleta; o do papel se digita aqui), lista de Termos (Fiscalização e Colheita) e levantamentos antigos (só leitura).
// A visita, o Termo de Fiscalização e o relatório estão em moniliase.js; produtor, frutos e fichas em pce-cadastros.js; produtores e dados offline em campo.js.
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM, avisoAtivacao) em tempo de execução.
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
    st.innerHTML = r.vazio ? '<div class="tf-novo">Sem coordenadas: o registro não aparecerá no mapa. Se o papel tiver, digite-as.</div>'
      : r.erro ? `<div class="tf-alerta">${icone('alerta')} ${esc(r.erro)}</div>`
      : `<div class="tf-ok">${icone('check')} Latitude <b>${esc(r.lat)}</b> · Longitude <b>${esc(r.lon)}</b><br><small>${esc(gms(r.lat, 'N', 'S'))} &nbsp; ${esc(gms(r.lon, 'L', 'O'))}</small></div>`;
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
  /* Registro do papel (digitar): só com a permissão "antigo" dada pela gerência (painel → Servidores → Papel). Padrão: desligado. Os registros já guardados nunca são apagados. */
  const SEM_ANTIGO = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';
  const podeAntigo = () => Sync.pode('antigo');
  const avisoSemAntigoHTML = () => `<div class="card aviso" id="pce-sem-antigo">${icone('alerta')} ${esc(SEM_ANTIGO)} Para registrar vistorias, complete seus dados (cargo e lotação) em “Meus dados”.</div>`;
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
  const servAntigoHTML = (pref, D, lembrados) => `<div class="card"><h3>${icone('pessoa')} Servidor que fez a vistoria</h3>
      <p class="dica" style="text-align:left">Como está no papel (não são os seus dados).</p>
      <label>Nome do servidor *<input id="${pref}snome" list="${pref}servs" value="${esc(D.sNome)}" placeholder="Nome completo" autocomplete="off"></label>
      <datalist id="${pref}servs">${lembrados.map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
      <div class="duas"><label>Cargo *${cargoHTML(pref + 'scargo', D.sCargo)}</label>
        <label>Matrícula<input id="${pref}smatricula" value="${esc(D.sMatricula)}" autocapitalize="characters" autocomplete="off" maxlength="30"></label></div>
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
  const dadosServidor = s => ({ servidor: s.nome, cargo: s.cargo, matricula: s.matricula || '', lotacao: s.lotacao });

  async function servidor(o) {
    if (bloqueado()) return view(avisoAtivacao());
    o = o || {};
    const s = (await servidorAtual()) || {}, primeira = !servidorOk(s);
    view(`<form class="card" id="pceServForm" autocomplete="off"><h3>${icone('pessoa')} Identificação do servidor</h3>
      <p class="dica" style="text-align:left">${primeira ? 'Antes de começar, informe seus dados. ' : ''}Eles ficam neste aparelho e são copiados para cada levantamento e termo no momento em que é criado.</p>
      <label>Nome do servidor *<input id="pce-s-nome" value="${esc(s.nome || Sync.nome())}" placeholder="Nome completo"></label>
      <label>Cargo *${cargoHTML('pce-s-cargo', s.cargo)}</label>
      <label>Matrícula<input id="pce-s-matricula" value="${esc(s.matricula || '')}" autocapitalize="characters" autocomplete="off" maxlength="30"></label>
      <label>Lotação (município) *<select id="pce-s-lotacao">${opts(P.municipios, s.lotacao, 'Selecione')}</select></label>
      ${podeAntigo() ? `<label class="chk"><input type="checkbox" id="pce-s-digitacao" ${s.soDigitacao ? 'checked' : ''}> Só vou digitar registros antigos do papel (não faço vistorias)</label>
      <p class="dica" style="text-align:left">Marque se você apenas digita fichas e termos já feitos (ex.: estagiário). Cargo e lotação deixam de ser obrigatórios; em cada registro você informa o servidor que fez a vistoria.</p>` : ''}
      <button class="botao" type="submit" id="pce-s-salvar">${icone('salvar')} Salvar</button>
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

  /* ---------- arquivos (fotos, PDFs e assinaturas): núcleo comum em anexos.js (o TF usa o mesmo) ---------- */
  const { idsArquivos, apagarSeNaoEnviado, arquivosPorId, novoArquivo } = Anexos;
  /** Reduz a foto no aparelho: lado maior até 1600 px, JPEG ~0,7. */
  const reduzirFoto = file => Anexos.reduzirFoto(file, P.fotoLado, P.fotoQualidade);
  const MAX_FOTOS = P.maxFotos || 60;
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
  const renderFotos = (F, prev) => Anexos.miniaturas($(prev), F.fotos, 'data-pce="delfoto"');
  async function removerFoto(F, id, prev) {
    F.fotos = F.fotos.filter(x => x !== id);
    if (!idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);     // foto nova deste formulário: some já
    await renderFotos(F, prev);                                          // foto já salva no registro: decide ao salvar
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
      return `<div class="pce-doc" data-id="${esc(id)}"><span>${icone('documento')} ${esc(a.nomeOriginal || 'documento.pdf')} <small>${a.tamanho ? esc(mb(a.tamanho)) : 'no Drive'}</small></span>
        <span class="pce-doc-acoes">${abrir}<button type="button" class="mini" data-pce="deldoc" data-id="${esc(id)}" aria-label="Remover PDF ${i + 1}">${icone('fechar')}</button></span></div>`; }).join('')
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
  const pdfHTML = pref => `<div class="card"><h3>${icone('anexo')} Ficha escaneada (PDF)</h3>
      <label class="pce-arquivo">${icone('anexo')} Anexar PDF<input type="file" id="${pref}pdfs" accept="application/pdf,.pdf" multiple></label>
      <p class="dica" style="text-align:left">Até ${MAX_DOCS} arquivos de no máximo 10 MB cada. Vão para o Drive junto com as fotos.</p>
      <div id="${pref}pdfs-lista" class="pce-docs"></div></div>`;

  /* ---------- assinatura na tela (opcional; o PDF sempre traz as linhas para assinar no papel) ----------
     F = formulário aberto (colheita do papel ou visita): {dono, id, vivo, ass, assNovas, naoAssina, rec}; aoMudar = grava o rascunho. */
  const assHTML = (papel, rotulo) => `<div class="pce-ass"><div class="pce-ass-topo"><span>${esc(rotulo)}</span>
    <button type="button" class="mini" data-mon="limparass" data-papel="${papel}">Limpar</button></div>
    <canvas id="pce-ass-${papel}" class="pce-canvas" data-papel="${papel}" aria-label="Assinatura: ${esc(rotulo)}"></canvas></div>`;
  async function ligarAss(F, papel, aoMudar) {
    const cv = $('#pce-ass-' + papel); if (!cv) return;
    const salva = F.ass[papel] ? await Store.obter('arquivos', F.ass[papel]) : null;
    Anexos.ligarCanvas(cv, F.assNovas[papel] || (salva && salva.dados), d => { F.assNovas[papel] = d; aoMudar(); });
  }
  function limparAssinatura(F, papel, aoMudar) {
    Anexos.limparCanvas($('#pce-ass-' + papel));
    delete F.assNovas[papel]; F.ass[papel] = '';
    aoMudar();
  }
  /* Produtor que não assina (não sabe ou não pode): no lugar da assinatura, foto dele segurando um documento de identificação oficial com foto.
     A foto fica em assinaturas.produtorDoc (id na aba Arquivos, tipo "foto", papel "produtor"); o Termo imprime a foto no lugar da linha. */
  const ROT_DOC_PROD = 'Produtor com documento de identificação (não assina)';
  const naoAssinaHTML = F => `<label class="chk pce-naoassina"><input type="checkbox" id="pce-naoassina" ${F.naoAssina ? 'checked' : ''}> Produtor não assina (não sabe ou não pode assinar)</label>
      <div id="pce-docprod" class="pce-docprod" ${F.naoAssina ? '' : 'hidden'}>
        <p class="dica" style="text-align:left">Tire uma foto do produtor segurando um documento de identificação oficial com foto (RG, CNH, carteira de trabalho…), com o rosto e o documento visíveis. A foto vai no Termo no lugar da assinatura.</p>
        <div id="pce-docprod-prev" class="pce-fotos"></div>
        <label class="pce-arquivo" id="pce-docprod-btn">${icone('camera')} Foto do produtor com o documento<input type="file" id="pce-docprod-in" accept="image/*" capture="environment"></label></div>`;
  async function renderDocProdutor(F) {
    const el = $('#pce-docprod-prev'); if (!el) return;
    await Anexos.miniaturas(el, F.ass.produtorDoc ? [F.ass.produtorDoc] : [], 'data-mon="deldocprod"');
    if (!F.ass.produtorDoc && el.isConnected) el.innerHTML = '';
    const b = $('#pce-docprod-btn'); if (b) b.firstChild.textContent = F.ass.produtorDoc ? 'Trocar a foto' : 'Foto do produtor com o documento';
  }
  async function soltarDocProdutor(F) {                                  // foto nova deste formulário some já; a já salva no registro, ao salvar
    const id = F.ass.produtorDoc; delete F.ass.produtorDoc;
    if (id && !idsArquivos(F.rec).has(id)) await apagarSeNaoEnviado([id]);
  }
  async function fotoDocProdutor(F, input, aoMudar) {
    const file = (input.files || [])[0]; input.value = ''; if (!file) return;
    if (!/^image\//.test(file.type || 'image/')) return toast(`"${file.name}" não é uma imagem.`, true);
    let a; try { a = { ...novoArquivo(F.dono, F.id, 'foto', 'produtor', 'image/jpeg', await reduzirFoto(file)), rotulo: ROT_DOC_PROD }; } catch (e) { return toast(e.message, true); }
    if (!F.vivo) return;
    await Store.gravar('arquivos', a);
    await soltarDocProdutor(F); F.ass.produtorDoc = a.id;
    await renderDocProdutor(F); aoMudar(0);
  }
  async function naoAssina(F, sim, aoMudar, depois) {
    F.naoAssina = sim;
    $('#pce-docprod').hidden = !sim;
    const cv = $('#pce-ass-produtor'), ass = cv && cv.closest('.pce-ass');
    if (sim) { if (ass) { limparAssinatura(F, 'produtor', aoMudar); ass.hidden = true; } await renderDocProdutor(F); }
    else {                                                               // volta a assinatura na tela (canvas novo: o escondido não tinha tamanho)
      await soltarDocProdutor(F); await renderDocProdutor(F);
      if (ass) { ass.outerHTML = assHTML('produtor', 'Produtor'); await ligarAss(F, 'produtor', aoMudar); }
    }
    if (depois) depois();
    aoMudar(0);
  }

  /* ---------- consulta do produtor no Termo de Colheita do papel (servidor quando online; aparelho quando offline) ---------- */
  let T = null, tRasc = null;                                            // Termo de Colheita do papel aberto
  const tm = {};
  function aoDigitarDoc(el) {
    const d = digitos(el.value); clearTimeout(tm.doc);
    if (d.length === 11 || d.length === 14) tm.doc = setTimeout(() => consultarDoc(), 400);
    else { const st = $('#pce-t-st-doc'); if (st) st.replaceChildren(); }
  }
  async function consultarDoc() {
    const inp = $('#pce-t-doc'), st = $('#pce-t-st-doc'); if (!T || !inp || !st) return;
    const d = digitos(inp.value); if (d.length !== 11 && d.length !== 14) { st.innerHTML = '<div class="tf-alerta">Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.</div>'; return; }
    st.innerHTML = '<small>Consultando cadastro…</small>';
    let r; try { r = await Campo.consultar(d); } catch (e) { st.textContent = e.message; return; }
    if (!st.isConnected || digitos(inp.value) !== d) return;
    let html = docOk(d) ? '' : `<div class="tf-alerta">${icone('alerta')} ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
    const pe = await Store.obter('pessoas', d);
    if (pe && pe.nome && !$('#pce-t-nome').value.trim()) $('#pce-t-nome').value = pe.nome;
    html += pe ? `<div class="tf-ok">${icone('check')} Cadastro encontrado: dados do produtor preenchidos. Confira.</div>` : '<div class="tf-novo">Produtor sem cadastro: preencha os dados.</div>';
    if (r.parcial) html += `<div class="tf-novo pce-offline">${icone('offline')} Sem conexão: ${esc(r.offline || 'só os dados deste aparelho')}.</div>`;
    st.innerHTML = html; agendarRascunho();
  }
  async function montarPessoa(doc, campos) {
    const l = await Store.obter('pessoas', doc), t = Date.now(), o = { ...(l || {}) };
    delete o.pendente;
    Object.keys(campos).forEach(k => { if (campos[k]) o[k] = campos[k]; });                // campo vazio não apaga o cadastro
    return { ...o, id: doc, tipo: doc.length === 14 ? 'PJ' : 'PF', criadoEm: (l && l.criadoEm) || t, atualizadoEm: t };
  }

  /* ---------- rascunho automático do Termo de Colheita do papel (mesma proteção de corrida do TF) ---------- */
  function agendarRascunho(atraso = 500) {
    clearTimeout(tRasc);
    const f = $('#pceTermoForm'), st = T; if (!f || !st) return;
    tRasc = setTimeout(() => {
      if (T === st && $('#pceTermoForm') === f)                                             // só grava se ainda é o mesmo formulário
        Store.setMeta('pceTermoRascunho', { dados: coletarTermo(), id: st.id, fotos: st.fotos, docs: st.docs, antigo: 1, em: Date.now() });
    }, atraso);
  }
  /** Descarta um rascunho: apaga as fotos que só existiam nele. */
  async function descartarRascunho(qual, rasc) {
    if (rasc) {
      const rec = await Store.obter('colheitas', rasc.id), salvo = idsArquivos(rec);
      await apagarSeNaoEnviado([...(rasc.fotos || []), ...(rasc.docs || [])].filter(id => !salvo.has(id)));
    }
    await Store.setMeta('pceTermoRascunho', null);
  }
  function fechar(F) { if (F) F.vivo = false; clearTimeout(tRasc); }

  /* ================= Termo de Colheita de Amostras ================= */
  // Nasce na visita (quando há coleta de amostra): numerarColheita. Aqui se digita o do papel (permissão "Digitar do papel").
  const termoVazioAntigo = (s, m = {}) => ({ unidade: m.unidade || '', municipio: m.municipio || '', doc: '', nome: '', endereco: '', lat: '', lon: '', precisao: '',
    data: m.data || '', hora: '', cultura: '', quantidade: '', analise: '', partes: [], descricao: '', testemunha1Nome: '', testemunha1Doc: '', testemunha2Nome: '', testemunha2Doc: '',
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
    const st = $('#pce-t-numpapel-st'); if (!st || !T) return;
    const D = coletarTermo(); if (!D.numPapel.trim()) { st.replaceChildren(); return; }
    const r = lerNumeroPapel(D.numPapel, D.unidade, D.data);
    st.innerHTML = r.erro ? `<div class="tf-alerta">${icone('alerta')} ${esc(r.erro)}</div>`
      : !r.unidade || !r.ano ? '<div class="tf-novo">Escolha a unidade e a data para conferir o número.</div>'
      : `<div class="tf-ok">${icone('check')} Será gravado como <b>${esc(numTxt(r.n, r.ano, r.unidade))}</b>. Ao gravar, a planilha confere se o número está livre.</div>`;
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
    const novo = textoOficial(coletarTermo(), $('#pce-t-snome').value.trim().replace(/\s+/g, ' '));
    if (forcar || !el.value.trim() || el.value === T.tplDesc) { el.value = novo; T.tplDesc = novo; }
  }
  /** Tipo de material da amostra (texto livre da visita) → partes da planta do termo (folha → folhas, fruto → frutos…). */
  const partesDoMaterial = t => { const m = semAcento(t).toLowerCase(); return m ? P.partes.filter(p => p !== 'outros' && m.includes(semAcento(p).toLowerCase().slice(0, 4))) : []; };

  function formTermoHTML(D, F) {
    const c = (id, rot, v, extra = '') => `<label>${rot}<input id="pce-t-${id}" value="${esc(v)}" ${extra}></label>`;
    return `<form id="pceTermoForm" autocomplete="off" class="pce-antigo" novalidate>
    <div class="card"><h3>${icone('documento')} Termo de Colheita de Amostras — digitar do papel</h3>
      <p class="dica" style="text-align:left">Digite os dados como estão no papel: data, hora, coordenadas e servidor são os da colheita. Depois de gravar, use “Gravar e digitar outro” para seguir com o próximo.</p></div>
    <div class="card"><h3>${icone('amostra')} Termo de Colheita de Amostras</h3>
      <label>Unidade *<select id="pce-t-unidade">${opts(P.municipios, D.unidade, 'Selecione')}</select></label>
      ${c('numpapel', 'Nº do termo (como está no papel) *', D.numPapel, 'placeholder="ex.: 007/2026/MANAUS" autocomplete="off"')}
      <div id="pce-t-numpapel-st" class="tf-status" aria-live="polite"></div></div>
    ${servAntigoHTML('pce-t-', D, F.lembrados)}
    <div class="card"><h3>1. Identificação</h3>
      <label>Município *<select id="pce-t-municipio">${opts(P.municipios, D.municipio, 'Selecione')}</select></label>
      <div class="pce-busca">${c('doc', 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
        <button type="button" class="mini" data-pce="consultar" aria-label="Consultar cadastro">${icone('busca')}</button></div>
      <div id="pce-t-st-doc" class="tf-status" aria-live="polite"></div>
      ${c('nome', 'Produtor / Razão social *', D.nome)}
      ${c('endereco', 'Endereço da propriedade', D.endereco)}
      ${coordAntigaHTML('pce-t-', D)}</div>
    <div class="card"><h3>2. Descrição da ação</h3>
      <div class="duas">${c('data', 'Data *', D.data, `type="date" min="2000-01-01" max="${hojeISO()}"`)}${c('hora', 'Hora *', D.hora, 'type="time"')}</div>
      <label>Cultura *<select id="pce-t-cultura">${opts(P.culturas, D.cultura, 'Selecione')}</select></label>
      <div class="duas">${c('quantidade', 'Quantidade de amostras *', D.quantidade, 'type="number" inputmode="numeric" min="1"')}${c('analise', 'Tipo de análise', D.analise)}</div>
      <fieldset class="pce-partes-grupo"><legend>Partes da planta coletadas</legend>
      <div class="pce-partes">${P.partes.map(p => `<label class="chk"><input type="checkbox" name="pce-t-parte" value="${esc(p)}" ${D.partes.includes(p) ? 'checked' : ''}> ${esc(p[0].toUpperCase() + p.slice(1))}</label>`).join('')}</div></fieldset>
      <label>Texto oficial (pode ser editado)<textarea id="pce-t-descricao" rows="6">${esc(D.descricao)}</textarea></label>
      <button type="button" class="botao sec" data-pce="gerartexto" id="pce-t-gerartexto">${icone('formulario')} Gerar texto oficial</button></div>
    ${pdfHTML('pce-t-')}
    <div class="card"><h3>3. Fotos da amostra</h3>
      <label class="pce-arquivo">${icone('camera')} Adicionar fotos<input type="file" id="pce-t-fotos" accept="image/*" multiple></label>
      <div id="pce-t-fotos-prev" class="pce-fotos"></div></div>
    <div class="card"><h3>4. Testemunhas</h3>
      <div class="duas">${c('t1nome', 'Testemunha 1 – nome', D.testemunha1Nome)}${c('t1doc', 'Testemunha 1 – CPF/RG', D.testemunha1Doc)}</div>
      <div class="duas">${c('t2nome', 'Testemunha 2 – nome', D.testemunha2Nome)}${c('t2doc', 'Testemunha 2 – CPF/RG', D.testemunha2Doc)}</div></div>
    <div class="card">${c('local', 'Local', D.local, 'placeholder="ex.: Manaus/AM"')}</div>
    <button class="botao" type="submit" id="pce-t-gerar">Gravar Termo de Colheita</button>
    <button class="botao" type="button" data-pce="gravaroutro" id="pce-t-gravar-outro">Gravar e digitar outro</button>
    <button class="botao sec" type="button" data-pce="descartartermo">Descartar este termo</button></form>`;
  }

  async function termo(prefill) {
    if (bloqueado()) return view(avisoAtivacao());
    const p0 = prefill || {}, s = await exigirServidor('pcetermo', prefill, true); if (!s) return;
    if (!podeAntigo()) { toast(SEM_ANTIGO + ' O Termo de Colheita de campo nasce da visita, na tela do produtor.', true); return go('pcetermos'); }
    fechar(T); T = null;
    let F = null, D = null;
    const rasc = await Store.meta('pceTermoRascunho');
    if (rasc && rasc.dados) {
      if (confirm(`Há um Termo de Colheita não gerado, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
        F = { id: rasc.id, fotos: rasc.fotos || [], docs: rasc.docs || [], tplDesc: rasc.tplDesc || '' };
        D = { ...termoVazioAntigo(s), ...rasc.dados };
      } else await descartarRascunho('termo', rasc);
    }
    if (!F) { F = { id: Store.novoId(), fotos: [], docs: [], tplDesc: '' }; D = termoVazioAntigo(s, p0.manter); }
    F.dono = 'colheitas'; F.vivo = true; F.rec = null;
    F.lembrados = await servidoresLembrados();
    T = F;
    view(formTermoHTML(D, F));
    mostrarCoord('pce-t-'); mostrarNumeroPapel(); await renderDocs(F, '#pce-t-pdfs-lista');
    autoTexto(false);
    await renderFotos(F, '#pce-t-fotos-prev');
    const f = $('#pceTermoForm');
    const AFETA = ['pce-t-data', 'pce-t-hora', 'pce-t-cultura', 'pce-t-quantidade', 'pce-t-analise', 'pce-t-snome'];
    const NUM = ['pce-t-numpapel', 'pce-t-unidade', 'pce-t-data'];
    f.addEventListener('input', e => {
      if (e.target.id === 'pce-t-doc') aoDigitarDoc(e.target);
      if (e.target.id === 'pce-t-coord') mostrarCoord('pce-t-');
      if (NUM.includes(e.target.id)) mostrarNumeroPapel();
      if (AFETA.includes(e.target.id)) autoTexto(false);
      agendarRascunho();
    });
    f.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'pce-t-fotos') return adicionarFotos(F, t, '#pce-t-fotos-prev');
      if (t.id === 'pce-t-pdfs') return adicionarPDFs(F, t, '#pce-t-pdfs-lista');
      if (t.id === 'pce-t-snome') await completarServidor('pce-t-');
      if (t.id === 'pce-t-doc') t.value = fmtDoc(digitos(t.value));
      if (NUM.includes(t.id)) mostrarNumeroPapel();
      if (AFETA.includes(t.id) || t.name === 'pce-t-parte') autoTexto(false);
      agendarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); gravarTermo(false); };
    const p1 = $(D.unidade ? '#pce-t-numpapel' : '#pce-t-unidade'); if (p1) p1.focus();
  }

  /** Sugestão de número: online, o último da planilha + 1; sem internet, o último que o aparelho conhece + 1. */
  async function ultimoConhecido(u, a) {
    const uv = ((await Store.meta('ultimoVistoPce')) || {})[chave(u, a)] || 0;
    const locais = (await Store.todos('colheitas')).filter(t => unid(t.unidade) === unid(u) && Number(t.ano) === a).reduce((m, t) => Math.max(m, Number(t.numero) || 0), 0);
    return Math.max(uv, locais);
  }
  async function sugerirNumero(u, a) {
    if (navigator.onLine && Sync.ativado()) {
      try {
        const r = await Sync.pceProximoNumero(u, a);                       // consulta rápida: último nº usado + 1
        await Sync.lembrarUltimosPce({ [chave(u, a)]: r.ultimo });
        return { numero: Math.max(r.proximo, (await ultimoConhecido(u, a)) + 1), origem: 'servidor', ultimo: r.ultimo };
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido|desconhecida/i.test(e.message)) throw e; }      // sem resposta: segue offline
    }
    const u0 = await ultimoConhecido(u, a);
    return { numero: u0 + 1, origem: 'offline', ultimo: u0 };
  }
  /**
   * Número do Termo de Colheita da visita, sem perguntar: online a planilha confirma que o número está livre (pceEmitir); sem internet o número é
   * provisório e a planilha confere ao sincronizar (repetido = conflito). rec já montado (sem número); grava no aparelho e devolve o registro.
   */
  async function numerarColheita(rec, pessoa, prop) {
    const u = unid(rec.unidade), a = Number(String(rec.data).slice(0, 4)) || anoAtual();
    const sug = await sugerirNumero(u, a);
    let n = sug.numero;
    for (let t = 0; t < 8; t++) {
      while ((await Store.todos('colheitas')).some(x => x.id !== rec.id && unid(x.unidade) === u && Number(x.ano) === a && Number(x.numero) === n)) n++;
      Object.assign(rec, { unidade: u, ano: a, numero: n, numeroTxt: numTxt(n, a, u), numeroSugerido: sug.numero, conflito: 0,
        numeroOrigem: sug.origem !== 'servidor' ? 'provisorio' : (n === sug.numero ? 'sistema' : 'editado') });
      let emitido = null;
      if (sug.origem === 'servidor') {
        try {
          const r = await Sync.pceEmitir(rec, pessoa, prop);
          if (r.emitido === false) { n = Math.max(n + 1, Number(r.proximo) || 0); continue; }   // outro servidor usou este número agora
          emitido = r;
        } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; }   // sem resposta: guarda e envia ao sincronizar
      }
      const est = emitido ? { pendente: 0, emitidoEm: emitido.emitidoEm } : { pendente: 1, provisorio: sug.origem !== 'servidor' ? 1 : 0 };
      const gravado = { ...rec, ...est };
      await Store.gravar('colheitas', gravado);
      await Sync.lembrarUltimosPce({ [chave(u, a)]: n });
      return gravado;
    }
    throw new Error('Não foi possível definir o número do Termo de Colheita. Tente novamente.');
  }

  /* ---------- Termo de Colheita digitado do papel: o número é o do papel; a planilha só confere se está livre ---------- */
  function confirmarNumeroAntigo(o) {                                     // popup: número do papel + efeito na sequência
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal';
      const r = o.info.ultimoTermo, ult = o.info.ultimo;
      const ultTxt = r && r.numeroTxt ? `Último número usado nesta unidade em ${o.ano}: <b>${esc(r.numeroTxt)}</b>${r.usuario ? ` (${esc(r.usuario)}, ${esc(dBR(r.data))} ${esc(r.hora || '')})` : ''}.`
        : ult ? `Último número usado nesta unidade em ${o.ano}: <b>${esc(numTxt(ult, o.ano, o.unidade))}</b>.` : `Nenhum Termo de Colheita registrado nesta unidade em ${o.ano}.`;
      const efeito = o.n <= ult ? `<div class="tf-ok">${icone('check')} Número dentro da sequência já usada: não muda o próximo número (${esc(num3(ult + 1))}).</div>`
        : o.n === ult + 1 ? `<div class="tf-novo">${icone('info')} É o próximo da sequência: depois de gravar, o próximo número sugerido nesta unidade passa a ser <b>${esc(num3(o.n + 1))}</b>.</div>`
        : `<div class="tf-alerta">${icone('alerta')} O número digitado é <b>maior</b> que o último usado (${esc(num3(ult))}). Depois de gravar, os próximos termos desta unidade em ${o.ano} — inclusive os dos fiscais em campo — continuam a partir de <b>${esc(num3(o.n + 1))}</b>. Confira se o número do papel está certo.</div>`;
      m.innerHTML = `<div class="tf-modal-box"><h3>${icone('amostra')} Gravar Termo de Colheita</h3>
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
  async function gravarTermo(outro) {
    const F = T; if (!F || !F.vivo) return;
    const D = coletarTermo(), u = unid(D.unidade), doc = digitos(D.doc);
    if (!u) return toast('Escolha a unidade.', true);
    const sv = servidorDigitado('pce-t-'); if (!sv) return;
    if (!D.municipio) return toast('Escolha o município.', true);
    if (!D.nome.trim()) return toast('Informe o nome do produtor / razão social.', true);
    if (!conferirDoc(doc)) return;
    if (!D.cultura) return toast('Escolha a cultura.', true);
    if (!(Number(D.quantidade) > 0)) return toast('Informe a quantidade de amostras.', true);
    if (!dataHoraPassadaOk(D)) return;
    const num = lerNumeroPapel(D.numPapel, u, D.data);
    if (num.erro) { avisoNumero(`<div class="tf-alerta">${icone('alerta')} ${esc(num.erro)}</div>`); return toast(num.erro, true); }
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
      if (local) return avisoNumero(`<div class="tf-alerta">${icone('alerta')} O nº ${esc(numTxt(n, a, u))} já está registrado neste aparelho (${esc(local.nome)}, ${esc(dBR(local.data))}). Confira o número no papel.</div>`);
      let info;
      try { info = await Sync.pceProximoNumero(u, a); }
      catch (e) { return toast(e.semPermissao || /revogado|inv[aá]lido/i.test(e.message) ? e.message : 'Sem resposta da planilha. Tente de novo (o termo antigo precisa de internet).', true); }
      if (!F.vivo || !(await confirmarNumeroAntigo({ n, ano: a, unidade: u, info })) || !F.vivo) return;
      const pessoa = await montarPessoa(doc, { nome });
      const rec = {
        id, criadoEm: t0, atualizadoEm: t0, unidade: u, ano: a, numero: n, numeroTxt: numTxt(n, a, u), numeroSugerido: info.proximo,
        numeroOrigem: n === info.proximo ? 'sistema' : 'editado', conflito: 0, levantamentoId: '',
        data: D.data, hora: D.hora, ...sv, municipio: D.municipio, doc, nome, endereco: D.endereco.trim(),
        lat: numOuVazio(D.lat), lon: numOuVazio(D.lon), precisao: '', cultura: D.cultura, quantidade: Number(D.quantidade) || 0,
        analise: D.analise.trim(), partes: D.partes.join(', '), descricao: D.descricao.trim(), fotos: JSON.stringify(F.fotos),
        testemunha1Nome: D.testemunha1Nome.trim(), testemunha1Doc: D.testemunha1Doc.trim(), testemunha2Nome: D.testemunha2Nome.trim(), testemunha2Doc: D.testemunha2Doc.trim(),
        assinaturas: '{}', local: D.local.trim(), cancelado: 0, motivoCancel: '', excluido: 0, registroAntigo: 1, documentos: JSON.stringify(F.docs)
      };
      let r;
      try { r = await Sync.pceEmitir(rec, pessoa, null); }
      catch (e) { return toast(e.semPermissao || /revogado|inv[aá]lido/i.test(e.message) ? e.message : 'Sem resposta da planilha: o termo NÃO foi gravado. Tente de novo.', true); }
      if (r.emitido === false) {
        const oc = r.ocupadoPor || {};
        const msg = `O nº ${numTxt(n, a, u)} já está registrado na planilha${oc.usuario ? ` — usado por ${oc.usuario} (${dBR(oc.data)} ${oc.hora || ''})` : ''}. Confira o número no papel.`;
        avisoNumero(`<div class="tf-alerta">${icone('proibido')} ${esc(msg)}</div>`); return toast(msg, true);
      }
      await Store.gravar('colheitas', { ...rec, pendente: 0, emitidoEm: r.emitidoEm });
      await Store.gravar('pessoas', { ...pessoa, pendente: 0 });
      await Sync.lembrarUltimosPce({ [chave(u, a)]: n });
      await lembrarServidor(sv);
      fechar(F); T = null; await Store.setMeta('pceTermoRascunho', null);
      Sync.sincronizar();                                                    // PDFs e fotos sobem ao Drive
      if (outro) {
        toast(`Termo ${numTxt(n, a, u)} gravado. Digite o próximo.`);
        go('pcetermo', { manter: { sNome: sv.servidor, sCargo: sv.cargo, sMatricula: sv.matricula, sLotacao: sv.lotacao, unidade: D.unidade, municipio: D.municipio, data: D.data, local: D.local.trim() } });
      } else go('pcepronto', id);
    } finally { F.gerando = false; btns.forEach(b => { if (b.isConnected) b.disabled = false; }); }
  }

  async function pronto(id) {
    const t = await Store.obter('colheitas', id); if (!t) return go('pcetermos');
    view(`<div class="card" id="pce-pronto"><h3>${icone('ok')} Termo de Colheita gravado</h3><div class="tf-num"><b id="pce-pronto-num">${esc(t.numeroTxt)}</b></div>
      <p>${esc(t.nome)} · ${esc(fmtDoc(digitos(t.doc)))}</p><p>${esc(dBR(t.data))} ${esc(t.hora)} · ${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s)</p>
      ${t.pendente ? `<div class="tf-novo">${icone('sincronizar')} Aguardando envio: será conferido na planilha ao sincronizar.</div>` : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}</div>
      <button class="botao" data-pce="imprimirtermo" data-id="${esc(t.id)}" id="pce-imprimir">${icone('imprimir')} Imprimir / PDF (${P.vias || 2} vias)</button>
      <button class="botao sec" data-pce="enviartermo" data-id="${esc(t.id)}" id="pce-t-enviar">${icone('enviar')} Enviar via do produtor (WhatsApp, e-mail…)</button>
      ${Number(t.registroAntigo) === 1 && podeAntigo() ? '<button class="botao sec" data-pce="novotermoantigo">Digitar outro termo do papel</button>' : ''}
      <button class="botao sec" data-v="pcetermos">${icone('formulario')} Ver termos</button>
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto. As vias saem em páginas separadas.</p>`);
  }

  /* ================= Termos: Fiscalização e Colheita numa lista só ================= */
  async function termos() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await exigirServidor('pcetermos', null, true); if (!s || !mostrar.viva()) return;
    fechar(T);
    const podeAnt = podeAntigo(), dig = soDigitador(s) && podeAnt, digSemAut = soDigitador(s) && !podeAnt;
    const fis = (await Sync.visiveis('termosPce', await Store.todos('termosPce'))).filter(x => !Number(x.excluido)).map(t => ({ k: 'f', t })), col = (await Sync.visiveis('colheitas', await Store.todos('colheitas'))).filter(x => !x.excluido).map(t => ({ k: 'c', t }));   // só os do login atual
    const todos = [...fis, ...col].sort((a, b) => (b.t.criadoEm || 0) - (a.t.criadoEm || 0));
    if (!mostrar.viva()) return;
    mostrar(`${digSemAut ? avisoSemAntigoHTML() : ''}
      ${podeAnt ? `<div class="card pce-papel"><h3>${icone('documento')} Digitar do papel</h3><div class="duas">
        <button class="botao ${dig ? '' : 'sec'}" data-mon="novo" data-tipo="termo" data-antigo="1" id="mon-novo-papel">Termo de Fiscalização</button>
        <button class="botao ${dig ? '' : 'sec'}" data-pce="novotermoantigo" id="pce-novotermoantigo">Termo de Colheita</button></div></div>` : ''}
      <button class="botao sec" data-v="pcerel" id="mon-ir-rel">${icone('resumo')} Relatório de atividades</button>
      <div class="card"><label>Pesquisar (nº, produtor, CPF/CNPJ, município, cultura ou programa)<input id="pceTQ" autocomplete="off"></label>
        <label>Mostrar<select id="pceTTipo"><option value="">Todos os termos</option><option value="f">Termos de Fiscalização</option><option value="c">Termos de Colheita</option></select></label></div>
      <div id="pceTItens"></div>`);
    const desenhar = () => {
      const q = semAcento($('#pceTQ').value.trim()).toUpperCase(), qd = digitos(q), tipo = $('#pceTTipo').value;
      const v = todos.filter(({ k, t }) => (!tipo || tipo === k) && (!q || semAcento([t.numeroTxt, t.nome, t.municipio, t.cultura, t.programaVisita, t.propriedade].join(' ')).toUpperCase().includes(q) || (qd && digitos(t.doc).includes(qd))));
      $('#pceTItens').innerHTML = v.length ? v.map(({ k, t }) => k === 'f' ? termoFiscItem(t, podeAnt) : termoColItem(t, podeAnt)).join('') : '<div class="vazio">Nenhum termo neste aparelho.</div>';
    };
    desenhar(); $('#pceTQ').oninput = desenhar; $('#pceTTipo').onchange = desenhar;
  }
  const situacaoTermo = (t, podeAnt) => `${t.cancelado ? `<div class="info pend">${icone('proibido')} CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
    ${Number(t.conflito) === 1 ? '<div class="info pend">Número duplicado na planilha: confira com a coordenação.</div>' : ''}
    ${t.pendente ? `<div class="info pend">${icone('sincronizar')} ${t.provisorio ? 'número provisório, será conferido ao sincronizar' : 'aguardando envio'}${Number(t.registroAntigo) === 1 && !podeAnt ? ' — termo do papel: sem autorização, fica guardado neste aparelho' : ''}</div>` : ''}`;
  function termoFiscItem(t, podeAnt) {
    const papel = Number(t.registroAntigo) === 1, culturas = (lerJSON(t.culturas, []) || []).map(c => c.cultura).join(', ');
    return `<div class="item pce-termo" data-termo="${esc(t.id)}"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div><div class="hora">${esc(dBR(t.data))}</div></div>
      <div class="info"><span class="mon-prog">Fiscalização</span> ${esc(t.programaVisita || (papel ? 'do papel' : ''))}${culturas ? ' · ' + esc(culturas) : ''} · ${esc(t.municipio)}</div>
      ${situacaoTermo(t, podeAnt)}
      <div class="botoes">${papel && podeAnt ? `<button class="editar" data-mon="abrir" data-id="${esc(t.id)}">Abrir</button>` : ''}
        <button class="editar" data-mon="imprimir" data-tipo="termo" data-id="${esc(t.id)}">PDF</button><button class="tfbtn" data-mon="enviar" data-id="${esc(t.id)}">Enviar</button>
        ${Number(t.cancelado) === 1 ? '' : `<button class="excluir" data-mon="cancelar" data-id="${esc(t.id)}">Cancelar</button>`}</div></div>`;
  }
  function termoColItem(t, podeAnt) {
    return `<div class="item pce-termo" data-termo="${esc(t.id)}"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div><div class="hora">${esc(dBR(t.data))}</div></div>
      <div class="info"><span class="mon-prog">Colheita</span> ${esc(t.cultura)} · ${esc(t.quantidade)} amostra(s) · ${esc(t.municipio)}</div>
      ${situacaoTermo(t, podeAnt)}
      <div class="botoes"><button class="editar" data-pce="imprimirtermo" data-id="${esc(t.id)}">PDF</button><button class="tfbtn" data-pce="enviartermo" data-id="${esc(t.id)}">Enviar</button>
        ${t.cancelado ? '' : `<button class="excluir" data-pce="cancelartermo" data-id="${esc(t.id)}">Cancelar</button>`}</div></div>`;
  }

  /* ================= Levantamento antigo (só leitura) ================= */
  // O levantamento deixou de ser criado: o que já está no aparelho (inclusive o pendente de envio) continua sendo enviado e abre só para ler, com o PDF.
  const SEM_PRAGA = 'Sem praga informada';
  const nomePraga = p => String(p || '').trim() || SEM_PRAGA;
  const RES = Object.fromEntries(P.resultados || [['detectada', 'Detectada'], ['nao_detectada', 'Não detectada'], ['suspeita', 'Suspeita']]);
  const seloRes = r => `<span class="pce-selo-res ${esc(r)}">${esc(RES[r] || '')}</span>`;
  /**
   * O levantamento visto por programa: o PDF é o do Termo, então sai um por programa (Citros: uma ficha com HLB, cancro, ácaro...).
   * "pragas" vira [{praga: nome do programa, culturas: uma linha por cultura × praga}]. Praga opcional sem programa vai na ficha do programa que
   * avaliou a mesma cultura; sem nenhum, ficha própria. As fotos de cada cultura saem uma vez por ficha.
   */
  function levPorPrograma(r) {
    const C = PCECads, G = Docs.pceGrupos(r); if (!G.pragas.length) return r;
    const progs = new Map(), soltas = [];
    G.pragas.forEach(g => {
      const nome = String(g.praga || '').trim();
      if (nome && C.opcional(nome) && !(C.pragaPorNome(nome) || {}).programa) return soltas.push(g);
      const pg = nome ? C.programaDaPraga(nome) : { programa: 'sem-praga', nome: SEM_PRAGA };
      if (!progs.has(pg.programa)) progs.set(pg.programa, { praga: pg.nome, itens: [] });
      progs.get(pg.programa).itens.push(g);
    });
    soltas.forEach(g => {
      const alvo = [...progs.values()].find(p => p.itens.some(x => x.culturas.some(c => g.culturas.some(k => k.cultura === c.cultura))));
      if (alvo) alvo.itens.push(g); else progs.set('opc-' + C.idCat(g.praga), { praga: g.praga, itens: [g] });
    });
    // O nome do programa identifica a praga sozinho (Monilíase, Mosca-da-Carambola)? Senão a linha leva "Cultura – praga" mesmo com uma só praga.
    const sozinho = p => p.itens.length === 1 && [nomePraga(p.itens[0].praga), (C.pragaPorNome(p.itens[0].praga) || {}).nomePopular, (C.pragaPorNome(p.itens[0].praga) || {}).nomeNoTF].some(n => n && (C.idCat(n) === C.idCat(p.praga) || C.idCat(p.praga).startsWith(C.idCat(n) + '-')));
    const pragas = [...progs.values()].map(p => {
      const linhas = p.itens.flatMap(g => g.culturas.map(c => ({ ...c, pragaDaLinha: g.praga }))), ordem = [...new Set(linhas.map(c => c.cultura))], comFoto = new Set();
      linhas.sort((a, b) => ordem.indexOf(a.cultura) - ordem.indexOf(b.cultura));
      return { praga: p.praga, culturas: linhas.map(c => {
        const fotos = comFoto.has(c.cultura) ? [] : c.fotos; comFoto.add(c.cultura);
        return { ...c, culturaBase: c.cultura, cultura: !sozinho(p) ? `${c.cultura} – ${nomePraga(c.pragaDaLinha)}` : c.cultura, fotos };
      }) };
    });
    return { ...r, pragas: JSON.stringify(pragas) };
  }
  async function verLev(id) {
    const r = id ? await Store.obter('levantamentos', id) : null; if (!r || r.excluido) return go('pce');
    await PCECads.carregarCatalogo();
    const G = Docs.pceGrupos(r), GP = Docs.pceGrupos(levPorPrograma(r)), pendArq = new Set(await Store.chaves('arquivos', 'enviado', 0));
    const pend = r.pendente || [...idsArquivos(r)].some(a => pendArq.has(a));
    view(`<div class="card" id="pce-lev-ver"><h3>${icone('documento')} Levantamento antigo</h3>
      <p class="dica" style="text-align:left">Somente leitura: o levantamento deixou de ser criado. A visita agora gera os Termos de Fiscalização.</p>
      <p><b>${esc(r.nome)}</b> · ${esc(r.propriedade || 'Propriedade não informada')}</p><p>${esc(dBR(r.data))} ${esc(r.hora)} · ${esc(r.municipio)}</p>
      ${pend ? `<div class="info pend">${icone('sincronizar')} aguardando envio</div>` : ''}
      <table class="tabela pce-res-tabela" id="pce-lev-res"><thead><tr><th scope="col">Praga</th><th scope="col">Resultado</th></tr></thead>${[...new Set(G.pragas.flatMap(g => g.culturas.map(c => c.cultura)))].map(cultura => {
        const prs = G.pragas.flatMap(g => g.culturas.filter(c => c.cultura === cultura).map(c => ({ praga: g.praga, ...c })));
        return `<tbody><tr class="pce-res-cultura"><th colspan="2" scope="colgroup">${icone('broto')} ${esc(cultura)}</th></tr>${prs.map(x => `<tr><td>${esc(nomePraga(x.praga))}</td><td>${seloRes(x.resultado)}</td></tr>`).join('')}</tbody>`; }).join('')}</table></div>
      <div class="pce-pdfs">${(GP.pragas.length ? GP.pragas : [{ praga: 'Ficha' }]).map((g, i) => `<button class="botao pce-pdf" data-pce="imprimirlev" data-id="${esc(id)}" data-g="${i}">${icone('imprimir')} PDF: ${esc(nomePraga(g.praga))}</button>`).join('')}</div>
      <button class="botao sec" data-cad="abrirprodutor" data-cpf="${esc(digitos(r.doc))}">${icone('pessoa')} Voltar ao produtor</button>`);
  }

  /* ---------- impressão (modelos em web/documentos, via docs.js) ---------- */
  async function imprimirLev(id, g) {
    const r = await Store.obter('levantamentos', id); if (!r) throw new Error('Registro não encontrado.');
    await PCECads.carregarCatalogo();
    await Docs.pceLevantamento(levPorPrograma(r), await arquivosPorId(r), Number(g) || 0);
  }
  async function imprimirColheita(id, modo) {
    const r = await Store.obter('colheitas', id); if (!r) throw new Error('Registro não encontrado.');
    return Docs.pceColheita(r, await arquivosPorId(r), modo);
  }
  /**
   * Via do produtor sem impressora: gera o PDF no aparelho (pdf.js, sem internet) e abre o compartilhamento do celular (WhatsApp, e-mail…).
   * Em dois toques: gerar leva alguns segundos e o navegador só abre o compartilhamento a partir de um toque recente. Sem compartilhamento de
   * arquivos (computador, navegador antigo): baixa o PDF e explica como enviar.
   */
  async function enviarColheita(id) {
    const r = await Store.obter('colheitas', id); if (!r) throw new Error('Registro não encontrado.');
    const fecharM = () => { const m = $('#pce-modal-enviar'); if (m) m.remove(); };
    fecharM();
    const m = document.createElement('div'); m.className = 'tf-modal'; m.id = 'pce-modal-enviar';
    m.innerHTML = `<div class="tf-modal-box pce-enviar"><h3>${icone('enviar')} Enviar ao produtor</h3>
      <p class="dica">${esc(r.nome || '')}</p><p><b>Termo de Colheita ${esc(r.numeroTxt || '')} — via do produtor</b></p>
      <div id="pce-env-st" class="tf-status" aria-live="polite"></div>
      <button class="botao" type="button" id="pce-env-gerar">${icone('documento')} Gerar PDF</button>
      <button class="botao sec" type="button" id="pce-env-fechar">Fechar</button></div>`;
    document.body.append(m);
    const st = m.querySelector('#pce-env-st');
    m.querySelector('#pce-env-fechar').onclick = fecharM;
    m.querySelector('#pce-env-gerar').onclick = async ev => {
      const btn = ev.currentTarget; btn.disabled = true;
      let file;
      try { st.innerHTML = '<small>Gerando PDF…</small>'; file = await imprimirColheita(id, 'arquivo'); }
      catch (e) { btn.disabled = false; st.innerHTML = `<div class="tf-alerta">${icone('alerta')} Não foi possível gerar o PDF: ${esc(e.message || e)}. Use “Imprimir” → “Salvar como PDF” e envie o arquivo salvo.</div>`; return; }
      if (!m.isConnected) return;
      const kb = Math.max(1, Math.round(file.size / 1024)).toLocaleString('pt-BR') + ' KB';
      const podeShare = PDF.podeCompartilhar([file]), titulo = 'Termo de Colheita de Amostras — ADAF', texto = `${titulo}: ${r.nome || ''}, ${dBR(r.data)}. Documento gerado pelo e-GDV.`;
      st.innerHTML = `<div class="tf-ok">${icone('check')} 1 PDF(s) prontos: ${esc(file.name)} (${kb})</div>`;
      btn.remove();
      const fim = m.querySelector('#pce-env-fechar'), add = html => { fim.insertAdjacentHTML('beforebegin', html); return fim.previousElementSibling; };
      if (podeShare) {
        add(`<button class="botao" type="button" id="pce-env-share">${icone('enviar')} Compartilhar</button>`).onclick = async () => { try { if (await PDF.compartilhar([file], titulo, texto)) toast('Enviado para o compartilhamento.'); } catch (e) { toast(e.message, true); } };
        add('<p class="dica">Escolha o WhatsApp (ou o e-mail) e o contato do produtor.</p>');
      } else add('<p class="dica pce-env-semshare">Este aparelho não compartilha arquivos direto do app. Toque em “Baixar”: o PDF vai para a pasta <b>Downloads</b>. Depois, no WhatsApp, anexe → <b>Documento</b> e escolha o arquivo.</p>');
      add(`<button class="botao ${podeShare ? 'sec' : ''}" type="button" id="pce-env-baixar">${icone('seta-baixo')} Baixar PDF</button>`).onclick = () => PDF.baixar(file);
      m.querySelector('.tf-modal-box').scrollTop = 0;
    };
  }

  /** Resumo para o cartão do módulo no hub. */
  async function status() {
    const fis = (await Sync.visiveis('termosPce', await Store.todos('termosPce'))).filter(x => !Number(x.excluido)), cols = (await Sync.visiveis('colheitas', await Store.todos('colheitas'))).filter(x => !x.excluido);
    const levs = (await Sync.visiveis('levantamentos', await Store.todos('levantamentos'))).filter(x => !x.excluido);
    const pend = fis.filter(x => x.pendente).length + cols.filter(x => x.pendente).length + levs.filter(x => x.pendente).length + (await Sync.arquivosPendentes(null, null, [])).length;   // só os do PCE
    if (!fis.length && !cols.length && !levs.length) return 'Nenhum registro';
    return `${fis.length} termo(s) de fiscalização · ${cols.length} de colheita${pend ? ` · ${pend} aguardando envio` : ''}`;
  }

  /* ---------- ações (cliques) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-pce]'); if (!el) return;
    const a = el.dataset.pce, id = el.dataset.id, F = T;
    try {
      if (a === 'servidor') go('pceservidor', { voltar: 'pce' });
      else if (a === 'novotermoantigo') go('pcetermo');
      else if (a === 'verlev') go('pcelevver', id);
      else if (a === 'imprimirlev') await imprimirLev(id, el.dataset.g);
      else if (a === 'enviartermo') await enviarColheita(id);
      else if (a === 'imprimirtermo') await imprimirColheita(id);
      else if (a === 'cancelartermo') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        const t = await Store.obter('colheitas', id); await Store.salvar('colheitas', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); termos();
      }
      else if (!F) return;
      else if (a === 'delfoto') await removerFoto(F, id, '#pce-t-fotos-prev');
      else if (a === 'deldoc') await removerDoc(F, id, '#pce-t-pdfs-lista');
      else if (a === 'verdoc') await verDoc(id);
      else if (a === 'gravaroutro') await gravarTermo(true);
      else if (a === 'consultar') await consultarDoc();
      else if (a === 'gerartexto') { autoTexto(true); agendarRascunho(); }
      else if (a === 'descartartermo') {
        if (!confirm('Descartar este termo? Os dados preenchidos serão perdidos.')) return;
        fechar(F); T = null;
        await apagarSeNaoEnviado([...F.fotos, ...F.docs]); await Store.setMeta('pceTermoRascunho', null); go('pcetermos');
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { termos, termo, pronto, servidor, status, verLev, textoOficial, lerCoordenadas, lerNumeroPapel, partesDoMaterial, numerarColheita, imprimirColheita,
    // usados pelo moniliase.js, pce-cadastros.js e campo.js
    bloqueado, docOk, cnpjOk, conferirDoc, fmtDoc, validarCoord, gms, servidorAtual, servidorOk, soDigitador, podeAntigo, exigirServidor, dadosServidor, servAntigoHTML, servidorDigitado,
    cargoValor, lembrarServidor, completarServidor, servidoresLembrados, dataHoraPassadaOk, montarPessoa, opts, SEM_ANTIGO,
    assHTML, ligarAss, limparAssinatura, naoAssinaHTML, naoAssina, renderDocProdutor, soltarDocProdutor, fotoDocProdutor };
})();
