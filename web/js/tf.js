// Termo de Fiscalização de Barreira (TF): lista, formulário, numeração, cadastro/reincidência e impressão em 2 vias.
// TF antigo (digitado do papel, permissão "Digitar do papel"): mesmo formulário com o nº, a data e a hora do papel, o servidor que
// fiscalizou digitado, fiscalizado opcional ("NÃO IDENTIFICADO") e o PDF escaneado no lugar de fotos/assinaturas; precisa de internet.
// Auto de infração (caixa "Auto de infração", em qualquer procedimento): cartão próprio no formulário, nº numa sequência própria por
// barreira/ano (conferida pela planilha ao gerar; sem internet, provisório) e PDF em 3 vias (documentos/auto.html, Docs.auto).
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
  /** Placa que identifica o veículo (padrão antigo ou Mercosul). Reincidência só por CPF/CNPJ válido (docOk; 000.000.000-00 = não identificado) e placa válida. */
  const placaOk = p => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placaNorm(p));
  /** Reincidência do TF: histórico do documento OU da placa (o que houver), sem contar duas vezes o mesmo TF anterior. */
  const reincDe = h => { const d = h && h.doc, p = h && h.placa; return { reincidente: !!((d && d.reincidente) || (p && p.reincidente)), total: Math.max((d && d.total) || 0, (p && p.total) || 0) }; };
  const fmtDoc = d => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);

  /* ---------- numeração: uma sequência por barreira/ano, consultada na planilha na hora de gerar ---------- */
  const barreiras = async () => (await Store.meta('barreiras')) || [];
  async function ultimoConhecido(b, a) {                                          // base para propor número SEM internet
    const uv = (((await Store.meta('ultimoVisto')) || {})[chave(b, a)] || 0);
    const locais = (await Store.todos('tfs')).filter(t => t.barreira === b && t.ano === a).reduce((m, t) => Math.max(m, t.numero), 0);
    return Math.max(uv, locais);
  }
  /** Último nº de auto de infração conhecido (planilha na última sincronização + autos deste aparelho). */
  async function ultimoAutoConhecido(b, a) {
    const uv = (((await Store.meta('ultimoVisto')) || {})['AI|' + chave(b, a)] || 0);
    return (await Store.todos('tfs')).filter(t => t.barreira === b && t.ano === a).reduce((m, t) => Math.max(m, Number(t.autoNumero) || 0), uv);
  }
  async function sugerirNumero(b, a) {
    if (navigator.onLine && Sync.ativado()) {
      try {
        const r = await Sync.proximoNumero(b, a);                                  // consulta rápida: último nº usado + 1
        await Sync.lembrarUltimos({ [chave(b, a)]: r.ultimo, ['AI|' + chave(b, a)]: r.autoUltimo || 0 });
        return { numero: Math.max(r.proximo, (await ultimoConhecido(b, a)) + 1), origem: 'servidor', ultimo: r.ultimo, ultimoTF: r.ultimoTF,
                 autoUltimo: Math.max(Number(r.autoUltimo) || 0, await ultimoAutoConhecido(b, a)) };
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido|desconhecida/i.test(e.message)) throw e; }   // sem resposta: segue offline
    }
    const u = await ultimoConhecido(b, a);
    return { numero: u + 1, origem: 'offline', ultimo: u, ultimoTF: null, autoUltimo: await ultimoAutoConhecido(b, a) };
  }
  const autoTxt = (n, a, sufixo) => `${num4(n)}-${a}-${sufixo}`;

  /* ---------- estado do formulário ---------- */
  // { hist:{doc,placa}, tpl, turnoId, veiculoId, rid, id (do TF, já na abertura: as fotos ficam ligadas a ele), fotos:[ids], ass, assNovas, recusa }
  let S = null;
  const vazio = () => ({ barreira: '', numero: '', data: hojeISO(), hora: agoraHM(), servidor: '', doc: '', nome: '', rg: '', endereco: '', municipio: '', uf: '', telefone: '', relacao: T.relacoes[0],
    inspecao: false, coleta: false, amostras: '', procedimento: '', fiel: false, auto: false, advertencia: false, local: '', placa: '', origem: '', destino: '', ufOrigem: '', ufDestino: '',
    docs: { nf: '', ptv: '', gta: '', sif: '', sie: '', sim: '', lacre: '', outros: '' }, produtos: [{ p: '', q: '', u: T.unidades[0] }], constatacao: '', enquadramento: '', ai: aiVazio() });
  const testVazia = () => ({ nome: '', cpf: '', endereco: '', telefone: '' });
  /** Campos do auto de infração (os do fiscalizado, da placa e da origem/destino vêm do próprio TF). */
  const aiVazio = () => ({ ocorrencia: 'barreira', nomeComercial: '', cadastro: '', condutor: '', condutorCpf: '', cep: '', renavam: '', fatos: '', enquadramento: '',
    ciencia: '', t1: testVazia(), t2: testVazia() });
  const OCORRENCIAS = { unidade: 'Unidade Local', barreira: 'Em Barreira Fitossanitária', estabelecimento: 'Em Estabelecimento ou Propriedade' };
  const CIENCIAS = { autuado: 'Autuado ciente (assina)', naoSabe: 'Não sabe ler e escrever', recusou: 'Recusou-se a assinar' };

  function coletar() {
    const g = id => { const e = $('#tf-' + id); return e ? e.value : ''; }, c = id => !!($('#tf-' + id) && $('#tf-' + id).checked);
    const proc = document.querySelector('input[name=tf-proc]:checked');
    return { barreira: g('barreira'), numero: S && S.antigo ? g('num') : S && S.numEditado && S.numEditado.b === g('barreira') ? String(S.numEditado.n) : '', data: g('data'), hora: g('hora'), servidor: g('servidor'), doc: g('doc'), nome: g('nome'), rg: g('rg'), endereco: g('endereco'), municipio: g('municipio'),
      uf: g('uf'), telefone: g('telefone'), relacao: g('relacao'), inspecao: c('inspecao'), coleta: c('coleta'), amostras: g('amostras'),
      procedimento: proc ? proc.value : '', fiel: c('fiel'), auto: c('auto'), advertencia: c('advertencia'), local: g('local'), placa: placaNorm(g('placa')), origem: g('origem'), destino: g('destino'), ufOrigem: g('ufOrigem'), ufDestino: g('ufDestino'),
      docs: Object.fromEntries(['nf', 'ptv', 'gta', 'sif', 'sie', 'sim', 'lacre', 'outros'].map(k => [k, g('d-' + k)])),
      produtos: [...document.querySelectorAll('#tf-produtos .prod')].map(r => ({ p: r.querySelector('select').value, q: r.querySelector('input').value, u: r.querySelectorAll('select')[1].value })),
      constatacao: g('constatacao'), enquadramento: g('enquadramento'), ai: coletarAuto(g) };
  }
  function coletarAuto(g) {
    const r = n => { const e = document.querySelector(`input[name=tf-ai-${n}]:checked`); return e ? e.value : ''; };
    const t = k => ({ nome: g(`ai-${k}-nome`), cpf: g(`ai-${k}-cpf`), endereco: g(`ai-${k}-endereco`), telefone: g(`ai-${k}-telefone`) });
    return { ocorrencia: r('ocorrencia') || 'barreira', nomeComercial: g('ai-nomeComercial'), cadastro: g('ai-cadastro'), condutor: g('ai-condutor'), condutorCpf: g('ai-condutorCpf'),
      cep: g('ai-cep'), renavam: g('ai-renavam'), fatos: g('ai-fatos'), enquadramento: g('ai-enquadramento'), ciencia: r('ciencia'), t1: t('t1'), t2: t('t2') };
  }
  let tRasc = null;
  const chaveRasc = antigo => (antigo ? 'tfRascunhoPapel' : 'tfRascunho');                  // TF do papel tem rascunho próprio
  const salvarRascunho = (atraso = 500) => { clearTimeout(tRasc); const f = $('#tfForm'); tRasc = setTimeout(() => { if (S && f && $('#tfForm') === f) Store.setMeta(chaveRasc(S.antigo), { dados: coletar(), turnoId: S.turnoId, veiculoId: S.veiculoId, rid: S.rid,
    id: S.id, fotos: S.fotos, pdfs: S.pdfs, assNovas: S.assNovas, recusa: S.recusa ? 1 : 0, em: Date.now() }); }, atraso); };   // só grava se o formulário ainda for o mesmo que originou a digitação
  /** Descarta um rascunho: apaga as fotos/PDFs que só existiam nele (ainda não foram para nenhum TF salvo). */
  const descartarRascunho = async (rasc, antigo) => { if (rasc) await Anexos.apagarSeNaoEnviado([...(rasc.fotos || []), ...(rasc.pdfs || [])]); await Store.setMeta(chaveRasc(antigo), null); };

  /* ---------- fotos e assinatura na tela (núcleo comum em anexos.js, o mesmo do PCE) ---------- */
  const MAX_FOTOS = T.maxFotos || 10;
  const PAPEIS = { fiscalizado: 'Fiscalizado', servidor: 'Servidor' };
  async function adicionarFotos(input) {
    const files = [...(input.files || [])], st = S; input.value = '';
    for (const file of files) {
      if (st.fotos.length >= MAX_FOTOS) { toast(`Limite de ${MAX_FOTOS} fotos por TF.`, true); break; }
      if (!/^image\//.test(file.type || 'image/')) { toast(`"${file.name}" não é uma imagem.`, true); continue; }
      let a; try { a = Anexos.novoArquivo('tfs', st.id, 'foto', '', 'image/jpeg', await Anexos.reduzirFoto(file, T.fotoLado || CONFIG.PCE.fotoLado, T.fotoQualidade || CONFIG.PCE.fotoQualidade)); }
      catch (e) { toast(e.message, true); continue; }
      if (S !== st) return;                                                      // o formulário foi fechado enquanto a foto era processada
      await Store.gravar('arquivos', a); st.fotos.push(a.id);
    }
    await renderFotos(); salvarRascunho(0);                                       // grava já: as fotos novas ficam ligadas ao rascunho
  }
  const renderFotos = () => S && !S.antigo && Anexos.miniaturas($('#tf-fotos-prev'), S.fotos, 'data-tf="delfoto"');
  /* PDF escaneado do TF do papel (mesmas regras do PCE: começa com %PDF-, até 10 MB, sobe ao Drive como "documento") */
  const MAX_PDFS = 10, MAX_PDF_BYTES = 10 * 1024 * 1024;
  const lerDataURL = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Não foi possível ler ' + file.name)); r.readAsDataURL(file); });
  async function adicionarPDFs(input) {
    const files = [...(input.files || [])], st = S; input.value = '';
    for (const file of files) {
      if (st.pdfs.length >= MAX_PDFS) { toast(`Limite de ${MAX_PDFS} PDFs por TF.`, true); break; }
      if (file.size > MAX_PDF_BYTES) { toast(`"${file.name}" passa do limite de 10 MB.`, true); continue; }
      let dados;
      try {
        const ini = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...ini) !== '%PDF-') { toast(`"${file.name}" não é um PDF válido.`, true); continue; }
        dados = 'data:application/pdf;base64,' + String(await lerDataURL(file)).replace(/^data:[^,]*,/, '');
      } catch (e) { toast(e.message, true); continue; }
      if (S !== st) return;
      const a = { ...Anexos.novoArquivo('tfs', st.id, 'documento', '', 'application/pdf', dados), nomeOriginal: String(file.name || 'tf.pdf').slice(0, 120) };
      await Store.gravar('arquivos', a); st.pdfs.push(a.id);
    }
    await renderPDFs(); salvarRascunho(0);
  }
  /** Lista dos PDFs (formulário ou tela do TF): abrir no aparelho / no Drive; remover só no formulário. */
  async function renderPDFs(ids, alvo, removivel = true) {
    ids = ids || (S && S.pdfs) || []; const el = $(alvo || '#tf-pdfs-lista'); if (!el) return;
    const itens = await Promise.all(ids.map(id => Store.obter('arquivos', id)));
    el.innerHTML = ids.length ? ids.map((id, i) => { const a = itens[i] || {};
      const abrir = a.dados ? `<button type="button" class="mini" data-tf="verpdf" data-id="${esc(id)}">Abrir</button>`
        : a.url ? `<a class="mini" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir no Drive</a>` : '<small>no Drive</small>';
      return `<div class="pce-doc" data-id="${esc(id)}"><span>${icone('documento')} ${esc(a.nomeOriginal || 'tf.pdf')}</span><span class="pce-doc-acoes">${abrir}${removivel ? `<button type="button" class="mini" data-tf="delpdf" data-id="${esc(id)}" aria-label="Remover PDF ${i + 1}">✕</button>` : ''}</span></div>`; }).join('')
      : '<div class="dica">Nenhum PDF anexado.</div>';
  }
  const SERV_PAPEL = 'gdv.tfServidoresPapel';                                     // últimos servidores digitados (datalist)
  const servidoresPapel = () => { try { return JSON.parse(localStorage.getItem(SERV_PAPEL)) || []; } catch (e) { return []; } };
  const lembrarServidor = n => { try { localStorage.setItem(SERV_PAPEL, JSON.stringify([n, ...servidoresPapel().filter(x => x !== n)].slice(0, 40))); } catch (e) { /* sem armazenamento */ } };
  /** Imagem atual da assinatura (desenhada agora ou já salva). */
  async function srcAss(st, papel) {
    if (st.assNovas[papel]) return st.assNovas[papel];
    const a = st.ass[papel] ? await Store.obter('arquivos', st.ass[papel]) : null;
    return (a && a.dados) || '';
  }
  /** Cartão das assinaturas: no formulário (st = S) e na tela do TF gerado (st = estado do TF salvo). */
  // assinatura na tela desligada (CONFIG.assinaturaNaTela): fica só a marcação da recusa, que o TF impresso registra
  const assCardHTML = st => !CONFIG.assinaturaNaTela ? `<div class="card" id="tf-ass-card"><h3>${icone('assinatura')} Assinaturas</h3>
      <p class="dica" style="text-align:left">As assinaturas são feitas no papel: o TF sai com as linhas em branco.</p>
      <label class="chk"><input type="checkbox" id="tf-recusa" ${st.recusa ? 'checked' : ''}> Fiscalizado se recusou a assinar</label></div>`
    : `<div class="card" id="tf-ass-card"><h3>${icone('assinatura')} Assinaturas (opcional)</h3>
      <p class="dica" style="text-align:left">Assine na tela, se quiser. Sem assinatura na tela, o TF sai com a linha em branco para assinar no papel.</p>
      ${Object.keys(PAPEIS).map(p => `<div class="tf-ass" id="tf-ass-${p}"></div>`).join('')}
      <label class="chk"><input type="checkbox" id="tf-recusa" ${st.recusa ? 'checked' : ''}> Fiscalizado se recusou a assinar</label></div>`;
  async function desenharAss(st) {
    for (const p of Object.keys(PAPEIS)) {
      const el = $('#tf-ass-' + p); if (!el) continue;
      const src = await srcAss(st, p), recusou = p === 'fiscalizado' && st.recusa;
      el.innerHTML = `<div class="pce-ass-topo"><span>${PAPEIS[p]}</span></div>
        ${recusou ? '<div class="tf-novo">Recusou-se a assinar: o TF registra a recusa no lugar da assinatura.</div>'
          : `${src ? `<img class="tf-ass-img" src="${esc(src)}" alt="Assinatura: ${PAPEIS[p]}">` : '<div class="dica" style="text-align:left">Sem assinatura na tela (linha em branco no papel).</div>'}
        <div class="duas"><button type="button" class="botao sec" data-tf="assinar" data-papel="${p}">${icone('assinatura')} ${src ? 'Assinar de novo' : 'Assinar na tela'}</button>
        ${src ? `<button type="button" class="botao sec" data-tf="delass" data-papel="${p}">Remover</button>` : ''}</div>`}`;
    }
  }
  /** Janela com o canvas: devolve a assinatura (dataURL PNG) ou null (cancelado). */
  function pedirAssinatura(papel) {
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal';
      m.innerHTML = `<div class="tf-modal-box"><h3>${icone('assinatura')} Assinatura: ${esc(PAPEIS[papel])}</h3>
        <canvas id="tf-canvas" class="pce-canvas tf-canvas" aria-label="Assinatura: ${esc(PAPEIS[papel])}"></canvas>
        <p class="dica">Assine com o dedo dentro do quadro.</p>
        <div class="duas"><button class="botao sec" id="tf-c-limpar" type="button">Limpar</button><button class="botao sec" id="tf-c-cancel" type="button">Cancelar</button></div>
        <button class="botao" id="tf-c-ok" type="button">Salvar assinatura</button></div>`;
      document.body.append(m);
      let img = null; const cv = m.querySelector('canvas');
      Anexos.ligarCanvas(cv, null, d => { img = d; });
      m.querySelector('#tf-c-limpar').onclick = () => { Anexos.limparCanvas(cv); img = null; };
      m.querySelector('#tf-c-cancel').onclick = () => { m.remove(); ok(null); };
      m.querySelector('#tf-c-ok').onclick = () => { if (!img) { toast('Assine dentro do quadro (ou toque em Cancelar).', true); return; } m.remove(); ok(img); };
    });
  }

  /* ---------- sinal "TF em preenchimento" para o painel do gestor ----------
     Melhor esforço: avisa ao abrir o formulário, ao mudar procedimento ou placa e a cada 2 min ("batimento"); "fim" ao gerar,
     descartar ou sair do formulário. Nunca espera resposta, nunca mostra erro e não guarda nada para depois (sem internet, não envia). */
  const BATIMENTO_MS = 2 * 60 * 1000;
  const AND = { rid: '', timer: null, tm: null, gps: null, chave: '' };
  const placaAnd = () => { const p = placaNorm($('#tf-placa') ? $('#tf-placa').value : ''); return p.length >= 7 ? p : ''; };
  const procAnd = () => { const r = document.querySelector('input[name=tf-proc]:checked'); return r ? r.value : ''; };
  function sinal(estado) {
    if (!AND.rid) return;
    const dados = { estado, rascunhoId: AND.rid };
    if (estado === 'preenchendo') {
      const sel = $('#tf-barreira'), op = sel && sel.selectedOptions && sel.selectedOptions[0];
      Object.assign(dados, { turnoId: (S && S.turnoId) || '', placa: placaAnd(), procedimento: procAnd(), local: $('#tf-local') ? $('#tf-local').value.trim() : '',
        barreira: op ? op.textContent.trim() : '', lat: AND.gps ? AND.gps.lat : '', lon: AND.gps ? AND.gps.lng : '' });
      AND.chave = dados.placa + '|' + dados.procedimento;
    }
    try { Sync.tfAndamento(dados); } catch (e) { /* melhor esforço */ }
  }
  function iniciarAndamento(rid) {
    if (AND.rid && AND.rid !== rid) encerrarAndamento();                          // outro formulário (rascunho descartado): o anterior termina
    AND.rid = rid; clearInterval(AND.timer); clearTimeout(AND.tm);
    sinal('preenchendo');
    AND.timer = setInterval(() => { if (AND.rid === rid && $('#tfForm')) sinal('preenchendo'); else if (AND.rid === rid) encerrarAndamento(); }, BATIMENTO_MS);
    if (!AND.gps && typeof pegarLocal === 'function') {                             // GPS uma vez, em segundo plano (não trava o formulário)
      // sem abrir o pedido de permissão: se não houver leitura liberada, usa a coordenada do turno aberto
      const gpsTurno = async () => { const t = S && S.turnoId ? await Store.obter('turnos', S.turnoId) : null;
        return t && t.latIni ? { lat: +t.latIni, lng: +t.lngIni } : null; };
      (typeof pegarLocalSilencioso === 'function' ? pegarLocalSilencioso() : Promise.resolve(null))
        .then(g => g || gpsTurno())
        .then(g => { if (g && AND.rid === rid && $('#tfForm')) { AND.gps = g; sinal('preenchendo'); } }).catch(() => {});
    }
  }
  function encerrarAndamento() {
    if (!AND.rid) return;
    clearInterval(AND.timer); clearTimeout(AND.tm); sinal('fim');
    AND.rid = ''; AND.gps = null; AND.chave = '';
  }
  /** Procedimento ou placa mudou: reenvia (com uma pequena espera, para não mandar a placa a cada letra). */
  function mudouAndamento() {
    clearTimeout(AND.tm);
    AND.tm = setTimeout(() => { if (AND.rid && $('#tfForm') && placaAnd() + '|' + procAnd() !== AND.chave) sinal('preenchendo'); }, 1200);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && AND.rid && $('#tfForm')) sinal('preenchendo'); });   // voltou ao app: batimento já

  /* ---------- tela: formulário ---------- */
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input id="tf-${id}" value="${esc(v)}" ${extra}></label>`;
  const opts = (lista, atual) => lista.map(x => `<option ${x === atual ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const selUF = (id, rot, v) => `<label>${rot} <small>(opcional)</small><select id="tf-${id}"><option value="">—</option>${opts(CONFIG.ufs, v)}</select></label>`;
  const linhaProd = (p, i) => `<div class="prod" data-i="${i}"><select><option value=""></option>${opts(T.produtos, p.p)}</select>
    <input type="number" inputmode="decimal" min="0" step="any" placeholder="Qtd." value="${esc(p.q)}"><select>${opts(T.unidades, p.u)}</select>
    <button type="button" class="mini" data-tf="delprod" data-i="${i}" aria-label="Remover produto">${icone('fechar')}</button></div>`;

  function formHTML(D, bars) {
    const d = D.docs;
    const pap = !!(S && S.antigo);
    return `<form class="tf${pap ? ' tf-papel' : ''}" id="tfForm" autocomplete="off">
    <div class="card"><h3>${pap ? `${icone('documento')} TF antigo (digitado do papel)` : 'Termo de Fiscalização de Barreira'}</h3>
      ${pap ? '<p class="dica" style="text-align:left" id="tf-papel-dica">Digite o TF como está no papel: número, data, hora e o servidor que fiscalizou. Precisa de internet: a planilha confere se o número está livre. Anexe o PDF escaneado.</p>' : ''}
      <label>Barreira<select id="tf-barreira">${bars.map(b => `<option value="${esc(b.id)}" ${b.id === D.barreira ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
      <div class="tf-num" id="tf-numero"></div>
      <div class="duas">${campo('data', 'Data', D.data, `type="date" required${pap ? ` max="${hojeISO()}"` : ''}`)}${campo('hora', 'Hora', D.hora, 'type="time" required')}</div>
      ${pap ? `${campo('servidor', 'Servidor que fiscalizou (nome completo) *', D.servidor, 'list="tf-servidores" autocapitalize="words"')}<datalist id="tf-servidores"></datalist>` : ''}</div>

    <div class="card"><h3>Identificação do fiscalizado</h3>
      ${campo('doc', pap ? 'CPF / CNPJ <small>(vazio = não identificado)</small>' : 'CPF / CNPJ *', D.doc, 'inputmode="numeric" placeholder="000.000.000-00"')}
      <div id="tf-st-doc" class="tf-status" aria-live="polite"></div>
      ${campo('nome', pap ? 'Nome / Razão social <small>(vazio = NÃO IDENTIFICADO)</small>' : 'Nome / Razão social *', D.nome)}
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
      <div class="duas">${campo('origem', 'Origem', D.origem)}${campo('destino', 'Destino', D.destino)}</div>
      <div class="duas">${selUF('ufOrigem', 'UF de origem', D.ufOrigem)}${selUF('ufDestino', 'UF de destino', D.ufDestino)}</div></div>

    <div class="card"><h3>Documentação apresentada</h3><div class="duas">
      ${campo('d-nf', 'NF Nº', d.nf)}${campo('d-ptv', 'PTV Nº', d.ptv)}${campo('d-gta', 'GTA Nº', d.gta)}${campo('d-sif', 'SIF Nº', d.sif)}
      ${campo('d-sie', 'SIE Nº', d.sie)}${campo('d-sim', 'SIM Nº', d.sim)}${campo('d-lacre', 'Lacre', d.lacre)}${campo('d-outros', 'Outros', d.outros)}</div></div>

    <div class="card"><h3>Produtos fiscalizados</h3><div id="tf-produtos">${D.produtos.map(linhaProd).join('')}</div>
      <button type="button" class="botao sec" data-tf="addprod">+ Adicionar produto</button></div>

    <div class="card"><h3>Constatação</h3><label><textarea id="tf-constatacao" rows="5">${esc(D.constatacao)}</textarea></label>
      <h3>Enquadramento legal</h3><label><textarea id="tf-enquadramento" rows="5" placeholder="Leis, decretos, portarias, artigos, incisos e alíneas">${esc(D.enquadramento)}</textarea></label></div>

    ${pap ? '' : autoCardHTML(D)}

    ${pap ? `<div class="card"><h3>${icone('documento')} PDF escaneado do TF</h3>
      <label class="pce-arquivo">${icone('anexo')} Anexar PDF<input type="file" id="tf-pdfs" accept="application/pdf,.pdf" multiple></label>
      <p class="dica" style="text-align:left">Até ${MAX_PDFS} PDFs, 10 MB cada. Vão para o Drive ao sincronizar; depois ficam só no Drive.</p>
      <div id="tf-pdfs-lista"></div></div>` : `<div class="card"><h3>${icone('camera')} Fotos (opcional)</h3>
      <label class="pce-arquivo">${icone('camera')} Tirar foto / escolher da galeria<input type="file" id="tf-fotos" accept="image/*" multiple></label>
      <p class="dica" style="text-align:left">Até ${MAX_FOTOS} fotos. Saem num anexo fotográfico no fim do PDF e vão para o Drive ao sincronizar.</p>
      <div id="tf-fotos-prev" class="pce-fotos"></div></div>
    ${assCardHTML(S)}`}

    <button class="botao" type="submit">${icone(pap ? 'salvar' : 'documento')} ${pap ? 'Gravar TF do papel' : 'Gerar TF'}</button>
    <button class="botao sec" type="button" data-tf="descartar">Descartar este TF</button></form>`;
  }

  /** Cartão do auto de infração: aparece com a caixa "Auto de infração" marcada. */
  function autoCardHTML(D) {
    const ai = { ...aiVazio(), ...(D.ai || {}) }, cid = id => `ai-${id}`;
    const c = (id, rot, v, extra = '') => campo(cid(id), rot, v, 'maxlength="150" ' + extra);   // autoDados cabe na célula (LIMITES_TEXTO)
    const radios = (nome, op, atual) => Object.entries(op).map(([k, t]) => `<label class="chk"><input type="radio" name="tf-ai-${nome}" value="${k}" ${atual === k ? 'checked' : ''}> ${t}</label>`).join('');
    const test = (k, n) => { const t = { ...testVazia(), ...(ai[k] || {}) };
      return `<fieldset class="tf-ai-test"><legend>Testemunha ${n} <small>(opcional)</small></legend>${c(k + '-nome', 'Nome', t.nome)}
        <div class="duas">${c(k + '-cpf', 'CPF', t.cpf, 'inputmode="numeric"')}${c(k + '-telefone', 'Telefone', t.telefone, 'type="tel"')}</div>${c(k + '-endereco', 'Endereço', t.endereco)}</fieldset>`; };
    return `<div class="card" id="tf-ai-card" ${D.auto ? '' : 'hidden'}><h3>${icone('documento')} Auto de infração</h3>
      <p class="dica" style="text-align:left">O nº do auto segue a sequência própria de autos desta barreira (conferida na planilha ao gerar). Nome, CPF/CNPJ, endereço, placa, origem e destino vêm do TF.</p>
      <h4>Ocorrência</h4>${radios('ocorrencia', OCORRENCIAS, ai.ocorrencia)}
      <h4>Dados do autuado</h4>
      <div class="duas">${c('nomeComercial', 'Nome comercial do estabelecimento', ai.nomeComercial)}${c('cadastro', 'Nº de cadastro na GDV/ADAF', ai.cadastro)}</div>
      <div class="duas">${c('condutor', 'Nome do responsável ou condutor', ai.condutor)}${c('condutorCpf', 'CPF do responsável ou condutor', ai.condutorCpf, 'inputmode="numeric"')}</div>
      <div class="duas">${c('cep', 'CEP', ai.cep, 'inputmode="numeric" maxlength="9"')}${c('renavam', 'RENAVAM / Insc. Capitania', ai.renavam)}</div>
      <h4>Descrição resumida dos fatos / da infração</h4><label><textarea id="tf-ai-fatos" rows="5" maxlength="3000">${esc(ai.fatos)}</textarea></label>
      <h4>Enquadramento legal</h4><label><textarea id="tf-ai-enquadramento" rows="4" maxlength="3000" placeholder="Leis, decretos, portarias, artigos, incisos e alíneas">${esc(ai.enquadramento)}</textarea></label>
      <h4>Ciência</h4>${radios('ciencia', CIENCIAS, ai.ciencia)}
      ${test('t1', 1)}${test('t2', 2)}</div>`;
  }
  /** Marcou "Auto de infração": mostra o cartão e começa com a constatação, o enquadramento e o condutor do TF (editáveis). */
  function abrirAuto(ligado) {
    const card = $('#tf-ai-card'); if (!card) return;
    card.hidden = !ligado; if (!ligado) return;
    const copia = (de, para) => { const a = $('#tf-' + de), b = $('#tf-' + para); if (a && b && !b.value.trim()) b.value = a.value; };
    copia('constatacao', 'ai-fatos'); copia('enquadramento', 'ai-enquadramento');
    if ($('#tf-relacao').value === 'Motorista') { copia('nome', 'ai-condutor'); copia('doc', 'ai-condutorCpf'); }
    if (!document.querySelector('input[name=tf-ai-ciencia]:checked') && S && S.recusa) { const r = document.querySelector('input[name=tf-ai-ciencia][value=recusou]'); if (r) r.checked = true; }
    toast('Preencha o auto de infração no fim do formulário.');
  }

  /* Nº do TF no formulário: já vem com o próximo da barreira (último usado + 1, na planilha ou neste aparelho) e é editável —
     ex.: o primeiro TF no sistema segue o talão de papel; daí em diante a sequência de cada barreira continua a partir dele.
     Ao gerar, a planilha confere de novo (outro fiscal pode ter usado o número) e o popup confirma antes do PDF. */
  let numTok = 0;
  async function mostrarInfoNumero() {
    const sel = $('#tf-barreira'), el = $('#tf-numero'); if (!sel || !el || !S) return;
    const b = sel.value, bar = (await barreiras()).find(x => x.id === b); if (!bar) return;
    const pap = !!S.antigo, dv = $('#tf-data') ? $('#tf-data').value : '', a = pap && /^\d{4}-/.test(dv) ? Number(dv.slice(0, 4)) : anoAtual();
    const tok = ++numTok, st = S;
    const desenhar = (sug, consultando) => {
      if (tok !== numTok || S !== st || !$('#tf-numero')) return;
      st.numSug = sug.numero; st.numBarreira = b;
      if (pap) {                                                                  // papel: o nº é o do talão, digitado (nada sugerido)
        const atual = $('#tf-num') ? $('#tf-num').value : (st.numPapel || '');
        el.innerHTML = `<small>Nº do TF (o do papel) *</small>
          <div class="tf-num-campo"><input id="tf-num" type="number" inputmode="numeric" min="1" value="${esc(atual)}" aria-label="Número do TF do papel"><b id="tf-num-suf">/${a} - ${esc(bar.sufixo)}</b></div>
          <small id="tf-num-dica">${consultando ? 'Consultando a planilha… ' : ''}${sug.ultimo ? `Último nº usado nesta barreira em ${a}: ${num4(sug.ultimo)}.` : `Nenhum TF desta barreira em ${a} na planilha.`} O ano vem da data do TF.</small>`;
        el.querySelector('#tf-num').oninput = e => { st.numPapel = e.target.value; };
        return;
      }
      const ult = sug.ultimo ? `Último nº usado nesta barreira: ${num4(sug.ultimo)}/${a}.` : 'Nenhum TF desta barreira neste ano: informe o número do talão, se for o caso.';
      const val = st.numEditado && st.numEditado.b === b ? st.numEditado.n : sug.numero;
      el.innerHTML = `<small>Nº do TF</small>
        <div class="tf-num-campo"><input id="tf-num" type="number" inputmode="numeric" min="1" value="${val}" aria-label="Número do TF"><b id="tf-num-suf">/${a} - ${esc(bar.sufixo)}</b></div>
        <small id="tf-num-dica">${consultando ? 'Consultando a planilha… ' : sug.origem === 'servidor' ? '✓ Próximo nº pela planilha (último usado + 1). ' : 'Sem conexão: próximo nº pelo que este aparelho conhece (provisório). '}${ult} Pode editar; os próximos seguem a partir dele. Ao gerar, a planilha confere o número.</small>`;
      const i = el.querySelector('#tf-num');
      i.oninput = () => { const n = parseInt(i.value, 10); st.numEditado = n > 0 && n !== st.numSug ? { b, n } : null; };
    };
    const u = await ultimoConhecido(b, a);
    desenhar({ numero: u + 1, ultimo: u, origem: 'offline' }, navigator.onLine && Sync.ativado());
    try { desenhar(await sugerirNumero(b, a), false); } catch (e) { desenhar({ numero: u + 1, ultimo: u, origem: 'offline' }, false); }
  }

  async function novo(prefill) {
    if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());
    prefill = prefill || {}; clearTimeout(tRasc);
    const antigo = !!prefill.antigo;
    if (antigo && !(Sync.pode('antigo') && Sync.pode('tf'))) { toast('Sem autorização para digitar TFs do papel. Fale com a gerência (painel → Servidores: TF e Digitar do papel).', true); return go('tf'); }
    const bars = await barreiras();
    if (!bars.length) { view('<div class="card aviso">A lista de barreiras ainda não foi carregada. Conecte-se à internet e aguarde a sincronização.</div>'); Sync.sincronizar(); return; }
    let D = vazio(); S = { hist: { doc: null, placa: null }, tpl: { constatacao: '', enquadramento: '' }, turnoId: '', veiculoId: '', rid: Store.novoId(),
      id: Store.novoId(), fotos: [], pdfs: [], ass: {}, assNovas: {}, recusa: false, antigo };
    const rasc = await Store.meta(chaveRasc(antigo));
    if (rasc && rasc.dados && confirm(`Há um ${antigo ? 'TF do papel não gravado' : 'TF não gerado'}, iniciado em ${new Date(rasc.em).toLocaleString('pt-BR')}.\n\nContinuar de onde parou? (Cancelar descarta o rascunho.)`)) {
      D = { ...D, ...rasc.dados }; S.turnoId = rasc.turnoId || ''; S.veiculoId = rasc.veiculoId || ''; if (rasc.rid) S.rid = rasc.rid;   // mesmo rascunho = mesmo sinal no painel
      if (rasc.id) S.id = rasc.id;                                                   // fotos do rascunho continuam ligadas ao mesmo TF
      S.fotos = Array.isArray(rasc.fotos) ? rasc.fotos.slice() : []; S.pdfs = Array.isArray(rasc.pdfs) ? rasc.pdfs.slice() : []; S.assNovas = rasc.assNovas || {}; S.recusa = !!rasc.recusa;
      if (antigo) S.numPapel = D.numero || '';
      else if (+D.numero > 0) S.numEditado = { b: D.barreira, n: +D.numero };     // nº digitado antes continua valendo
    } else if (antigo) {                                                           // papel: nada vem do turno nem de "agora"
      await descartarRascunho(rasc, true);
      const bPad = localStorage.getItem('gdv.barreira');
      D.barreira = bars.some(b => b.id === bPad) ? bPad : bars[0].id;
      D.local = (bars.find(b => b.id === D.barreira) || {}).local || '';
      D.data = ''; D.hora = ''; D.servidor = servidoresPapel()[0] || '';
    } else {
      await descartarRascunho(rasc);
      const turno = await turnoAtual(); let veic = null;
      if (prefill.veiculoId) { veic = await Store.obter('veiculos', prefill.veiculoId); S.veiculoId = prefill.veiculoId; }
      const tid = (veic && veic.turnoId) || (turno && turno.id) || ''; S.turnoId = tid;                  // TF fica ligado ao turno aberto
      const tr = tid ? await Store.obter('turnos', tid) : null;
      const bPad = localStorage.getItem('gdv.barreira');
      D.barreira = bars.some(b => b.id === bPad) ? bPad : bars[0].id;
      D.local = (tr && tr.local) || (bars.find(b => b.id === D.barreira) || {}).local || '';
      if (veic) { D.placa = veic.placa; D.ufOrigem = veic.ufOrigem || ''; D.ufDestino = veic.ufDestino || '';    // origem/destino do registro do veículo
        D.origem = veic.origemMun || D.origem; D.destino = veic.destinoMun || D.destino; }
    }
    if (!bars.some(b => b.id === D.barreira)) D.barreira = bars[0].id;
    view(formHTML(D, bars));
    ligarForm();                                                                  // já: o fiscal pode marcar o procedimento antes da planilha responder o nº
    if (antigo) { await renderPDFs(); const dl = $('#tf-servidores'); if (dl) dl.innerHTML = servidoresPapel().map(n => `<option value="${esc(n)}">`).join(''); }
    else { await renderFotos(); await desenharAss(S); }
    $('#tf-uf').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    await mostrarInfoNumero();
    if (digitos(D.doc).length >= 11) consultarDoc();
    if (placaNorm(D.placa).length >= 7) consultarPlaca();
    if (!antigo) iniciarAndamento(S.rid);                                         // TF do papel não acende "TF em preenchimento" no painel
  }

  function ligarForm() {
    const f = $('#tfForm');
    f.addEventListener('input', e => {
      if (e.target.id === 'tf-placa') { e.target.value = placaNorm(e.target.value); if (e.target.value.length === 7) agendar('placa'); }
      if (e.target.id === 'tf-doc') { const d = digitos(e.target.value); if (d.length === 11 || d.length === 14) agendar('doc'); else $('#tf-st-doc').replaceChildren(); }
      if (e.target.id === 'tf-placa' && S && !S.antigo) mudouAndamento();
      salvarRascunho();
    });
    f.addEventListener('change', async e => {
      // barreira, produto ou destino mudou: o texto sugerido pode ser outro (ex.: citros na BVA - HUMAITÁ com destino Manaus)
      if (e.target.id === 'tf-barreira' || e.target.id === 'tf-destino' || e.target.closest('#tf-produtos')) aplicarModelo(procMarcado());
      if (e.target.id === 'tf-barreira') { localStorage.setItem('gdv.barreira', e.target.value); await mostrarInfoNumero(); }
      if (e.target.id === 'tf-data' && S && S.antigo) await mostrarInfoNumero();                  // papel: o ano do número é o da data
      if (e.target.id === 'tf-pdfs') return adicionarPDFs(e.target);
      if (e.target.name === 'tf-proc') { aplicarModelo(e.target.value); if (!S.antigo) mudouAndamento(); }
      if (e.target.id === 'tf-doc') { e.target.value = fmtDoc(digitos(e.target.value)); }
      if (e.target.id === 'tf-fotos') return adicionarFotos(e.target);
      if (e.target.id === 'tf-recusa') { S.recusa = e.target.checked; if (S.recusa) delete S.assNovas.fiscalizado; await desenharAss(S); }
      if (e.target.id === 'tf-auto' && S && !S.antigo) abrirAuto(e.target.checked);
      salvarRascunho();
    });
    f.onsubmit = ev => { ev.preventDefault(); if (S && S.antigo) gravarPapel(); else gerar(); };
  }
  const tm = {};
  const agendar = qual => { clearTimeout(tm[qual]); tm[qual] = setTimeout(qual === 'doc' ? consultarDoc : consultarPlaca, 350); };

  /** Textos sugeridos do procedimento: o modelo da BVA/produto/destino (CONFIG.TF.modelos, ex.: citros na BVA - HUMAITÁ) ou os gerais. */
  const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  function textosDe(proc) {
    const sel = $('#tf-barreira'), bar = semAcento(sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '');
    const prods = [...document.querySelectorAll('#tf-produtos .prod select:first-of-type')].map(x => semAcento(x.value)), dest = semAcento($('#tf-destino') ? $('#tf-destino').value : '');
    const m = (T.modelos || []).find(x => bar.includes(semAcento(x.bva)) && (!x.produtos || x.produtos.some(p => prods.includes(semAcento(p)))) && (!x.destino || dest.includes(semAcento(x.destino))));
    return m ? { constatacao: m.constatacao[proc] || '', enquadramento: (m.enquadramento || {})[proc] || '' }
      : { constatacao: T.constatacao[proc] || '', enquadramento: proc === 'liberacao' ? '' : T.textoLegal };
  }
  function aplicarModelo(proc) {                                                     // sugere textos; não sobrescreve o que o fiscal editou
    if (!proc || !S) return;
    const t = textosDe(proc);
    [['constatacao', t.constatacao], ['enquadramento', t.enquadramento]].forEach(([id, novo]) => {
      const el = $('#tf-' + id);
      if (!el.value.trim() || el.value === S.tpl[id]) { el.value = novo; S.tpl[id] = novo; }
    });
  }
  const procMarcado = () => { const r = document.querySelector('input[name=tf-proc]:checked'); return r ? r.value : ''; };

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
        if (r.pessoa && docOk(digitos(r.pessoa.id))) await Store.gravar('pessoas', { ...r.pessoa, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 0 });
        if (r.placa && docOk(digitos(r.placa.doc))) await Store.gravar('placas', { ...r.placa, criadoEm: Date.now(), atualizadoEm: Date.now(), pendente: 0 });
        return { ...r, parcial: false };
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; }
    }
    // sem conexão: índice de reincidência baixado na sincronização (todas as barreiras, até a hora dele) + TFs deste aparelho que ainda não
    // estavam nele; sem índice, só o que este aparelho conhece. Os últimos TFs detalhados (de outros aparelhos) só aparecem online.
    const meus = (await Store.todos('tfs')).filter(t => !t.cancelado), idx = await Store.meta('tfIndice');
    const temIdx = !!(idx && idx.itens && idx.agora) && !!(window.crypto && crypto.subtle);
    const hist = async (chaveIdx, locais) => {
      if (!temIdx) return resumoLocal(locais);
      const e = idx.itens[await hashIndice(chaveIdx)];
      const r = resumoLocal(locais.filter(t => !(Number(t.emitidoEm) > 0 && Number(t.emitidoEm) <= idx.agora)));   // os demais já estão no índice
      if (e) { r.total += e.n || 0; r.apreensoes += e.ap || 0; r.rechacos += e.re || 0; r.autos += e.au || 0; r.liberacoes += e.li || 0; r.advertencias += e.ad || 0; }
      r.ultimos = resumoLocal(locais).ultimos; r.reincidente = r.apreensoes + r.rechacos + r.autos >= 1;
      return r;
    };
    const pl = placa ? await Store.obter('placas', placa) || null : null;
    return { pessoa: docOk(doc) ? await Store.obter('pessoas', doc) || null : null, placa: pl && docOk(digitos(pl.doc)) ? pl : null, parcial: true, indiceEm: temIdx ? idx.agora : 0,
      historicoDoc: doc ? await hist('doc:' + doc, meus.filter(t => digitos(t.doc) === doc)) : null,
      historicoPlaca: placa ? await hist('placa:' + placa, meus.filter(t => placaNorm(t.placa) === placa)) : null };
  }
  /** BVA como no índice do servidor (normPub_): sem acento, minúsculas, só letras e números. */
  const bvaIdx = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  /**
   * TFs (não cancelados) já lavrados para a placa na BVA — aviso no registro do veículo. Sem internet também: índice de reincidência
   * (chave placa + BVA; v ≥ 2) + TFs deste aparelho que ainda não estavam nele. Devolve {n, ult (AAAA-MM-DD)}.
   */
  async function placaNaBva(placa, local) {
    const p = placaNorm(placa), b = bvaIdx(local), r = { n: 0, ult: '' };
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) || !b) return r;
    const idx = await Store.meta('tfIndice'), temIdx = !!(idx && idx.itens && idx.agora && idx.v >= 2) && !!(window.crypto && crypto.subtle);
    if (temIdx) { const e = idx.itens[await hashIndice('placabva:' + p + '|' + b)]; if (e) { r.n += e.n || 0; r.ult = e.ult || ''; } }
    const turnos = {}; (await Store.todos('turnos')).forEach(t => { turnos[t.id] = t.local; });
    (await Store.todos('tfs')).forEach(t => {
      if (t.cancelado || placaNorm(t.placa) !== p || bvaIdx((t.turnoId && turnos[t.turnoId]) || t.local) !== b) return;
      if (temIdx && Number(t.emitidoEm) > 0 && Number(t.emitidoEm) <= idx.agora) return;              // já está no índice
      r.n++; if (String(t.data) > r.ult) r.ult = String(t.data);
    });
    return r;
  }
  /**
   * Alerta de cuidado da placa (registros de veículo marcados por fiscais, em qualquer BVA ou volante): índice do aparelho + registros deste
   * aparelho ainda não enviados (menos o que está sendo editado). Devolve {n, ult, cu: [motivos], ob: [{d, t}] (observações, mais novas antes)}.
   */
  async function cuidadoPlaca(placa, exceto) {
    const p = placaNorm(placa), r = { n: 0, ult: '', cu: [], ob: [] };
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)) return r;
    const idx = await Store.meta('tfIndice');
    const temIdx = !!(idx && idx.itens && idx.agora && idx.v >= 3) && !!(window.crypto && crypto.subtle);
    if (temIdx) {
      const e = idx.itens[await hashIndice('cuidado:' + p)];
      if (e) { r.n += e.n || 0; r.ult = e.ult || ''; r.cu = String(e.cu || '').split(',').filter(Boolean); r.ob = Array.isArray(e.ob) ? e.ob.slice() : []; }
    }
    (await Store.todos('veiculos')).forEach(v => {
      if (v.id === exceto || Number(v.cuidado) !== 1 || placaNorm(v.placa) !== p) return;                    // excluído continua valendo
      if (!v.pendente && temIdx && Number(v.srv_ts) > 0 && Number(v.srv_ts) <= idx.agora) return;           // já está no índice
      r.n++; if (v.cuidadoMotivo && !r.cu.includes(v.cuidadoMotivo)) r.cu.push(v.cuidadoMotivo);
      const dia = new Date(Number(v.criadoEm) || Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
      if (String(v.obs || '').trim()) r.ob.unshift({ d: dia, t: String(v.obs).trim().slice(0, 300) });
    });
    r.ob = r.ob.slice(0, 3);
    return r;
  }
  /** SHA-256 (hex, 16 primeiros caracteres), igual ao do servidor (índice de reincidência). */
  async function hashIndice(txt) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const doisD = n => String(n).padStart(2, '0');
  /** Rodapé do histórico sem conexão: com índice, "histórico até HH:MM de DD/MM + este aparelho"; sem índice, só este aparelho. */
  const notaParcial = (r, curta) => { if (!r.parcial) return '';
    if (!r.indiceEm) return curta ? 'sem conexão: só este aparelho' : 'sem conexão: histórico parcial, só deste aparelho';
    const d = new Date(r.indiceEm); return `sem conexão: histórico até ${doisD(d.getHours())}:${doisD(d.getMinutes())} de ${doisD(d.getDate())}/${doisD(d.getMonth() + 1)} + este aparelho`; };
  function histHTML(h, rotulo, r) {
    if (!h) return '';
    const parcial = notaParcial(r, !h.total);
    if (!h.total) return `<div class="tf-ok">${icone('check')} Sem TF anterior ${rotulo}.${parcial ? ` <small>(${parcial})</small>` : ''}</div>`;
    const partes = [h.apreensoes && `${h.apreensoes} apreensão(ões)`, h.rechacos && `${h.rechacos} rechaço(s)`, h.autos && `${h.autos} auto(s) de infração`, h.liberacoes && `${h.liberacoes} liberação(ões)`].filter(Boolean).join(', ');
    return `<div class="${h.reincidente ? 'tf-alerta' : 'tf-ok'}"><b>${h.reincidente ? 'REINCIDENTE' : 'Já fiscalizado'} ${rotulo}:</b> ${h.total} TF(s) anterior(es) — ${esc(partes)}.
      <ul>${h.ultimos.slice(0, 3).map(u => `<li>${esc(u.numeroTxt)} · ${dBR(u.data)} · ${esc(PROC[u.procedimento] || '—')}${u.placa ? ' · ' + esc(u.placa) : ''}</li>`).join('')}</ul>
      ${parcial ? `<small>(${parcial})</small>` : ''}</div>`;
  }
  async function consultarDoc() {
    if (!S || !$('#tf-doc')) return;
    const d = digitos($('#tf-doc').value); if (d.length !== 11 && d.length !== 14) return;
    const st = $('#tf-st-doc'); st.innerHTML = '<small>Consultando cadastro e histórico…</small>';
    let r; try { r = await buscar(d, ''); } catch (e) { st.textContent = ''; return; }
    if (!S || !$('#tf-doc')) return;
    S.hist.doc = docOk(d) ? r.historicoDoc : null;                              // documento inválido/padrão (000…): fora da reincidência
    const padrao = /^(\d)\1+$/.test(d);                                       // 000.000.000-00: fiscalizado não identificado
    let html = docOk(d) || padrao ? '' : `<div class="tf-alerta">${icone('alerta')} ${d.length === 11 ? 'CPF' : 'CNPJ'} com dígitos inválidos: confira a digitação.</div>`;
    if (!docOk(d)) html += `<div class="tf-novo">${padrao ? 'Documento padrão (fiscalizado não identificado)' : 'Documento inválido'}: não liga a nenhum nome — os dados não são preenchidos nem guardados no cadastro, e não entra na reincidência.</div>`;
    else if (r.pessoa) {
      ['nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone'].forEach(k => { const el = $('#tf-' + k); if (el) el.value = r.pessoa[k] || ''; });
      html += '<div class="tf-ok">✓ Cadastro encontrado — dados preenchidos automaticamente.</div>';
    } else html += '<div class="tf-novo">Novo cadastro — os dados serão salvos na planilha ao gerar o TF.</div>';
    st.innerHTML = html + (docOk(d) ? histHTML(r.historicoDoc, 'para este documento', r) : '');
  }
  async function consultarPlaca() {
    if (!S || !$('#tf-placa')) return;
    const p = placaNorm($('#tf-placa').value); if (p.length < 7) return;
    const st = $('#tf-st-placa');
    if (!placaOk(p)) { if (S) S.hist.placa = null; st.innerHTML = '<div class="tf-novo">Placa fora do padrão: não entra na reincidência.</div>'; return; }
    let r; try { r = await buscar('', p); } catch (e) { return; }
    if (!S || !$('#tf-placa')) return;
    S.hist.placa = r.historicoPlaca;
    let html = histHTML(r.historicoPlaca, 'para esta placa', r);
    if (r.placa && docOk(digitos(r.placa.doc)) && !digitos($('#tf-doc').value)) html += `<div class="tf-novo">Último fiscalizado com esta placa: <b>${esc(r.placa.nome)}</b> (${esc(fmtDoc(r.placa.doc))}) <button type="button" class="mini" data-tf="usardoc" data-doc="${esc(r.placa.doc)}">Usar</button></div>`;
    st.innerHTML = html;
  }

  /* ---------- geração do TF ---------- */
  function pedirNumero(o) {                                                         // popup: número vindo da planilha, editável antes do PDF
    return new Promise(ok => {
      const m = document.createElement('div'); m.className = 'tf-modal';
      const ult = o.ultimoTF ? `Último número usado nesta barreira: <b>${esc(o.ultimoTF.numeroTxt)}</b> (${esc(o.ultimoTF.usuario)}, ${dBR(o.ultimoTF.data)} ${esc(o.ultimoTF.hora)}).`
        : o.ultimo ? `Último número usado: <b>${esc(num4(o.ultimo))}/${o.ano}</b>.` : 'Nenhum TF anterior nesta barreira neste ano.';
      m.innerHTML = `<div class="tf-modal-box"><h3>${icone('documento')} Número do TF</h3>
        ${o.aviso ? `<div class="tf-alerta">${esc(o.aviso)}</div>` : ''}
        ${o.offline ? '<div class="tf-novo">Sem conexão: número <b>provisório</b>, calculado a partir do último número que este aparelho conhece. Será conferido na planilha ao sincronizar.</div>' : '<div class="tf-ok">✓ Número obtido na planilha agora.</div>'}
        <p class="dica">${ult}</p>
        <input id="tf-num-m" type="number" inputmode="numeric" min="1" value="${o.numero}"><div id="tf-num-prev" class="tf-num"></div><div id="tf-num-edit" class="dica"></div>
        <p class="dica">Confira o número. Se necessário, você pode alterá-lo antes de gerar o PDF.</p>
        <div class="duas"><button class="botao sec" id="tf-m-cancel" type="button">Cancelar</button><button class="botao" id="tf-m-ok" type="button">Confirmar e gerar</button></div></div>`;
      document.body.append(m); const i = m.querySelector('input');
      const prev = () => { const n = +i.value || 0; m.querySelector('#tf-num-prev').innerHTML = `<b>${esc(num4(n))}/${o.ano} - ${esc(o.sufixo)}</b>`;
        m.querySelector('#tf-num-edit').textContent = n && n !== o.sugerido ? `Número alterado (o sistema sugeriu ${num4(o.sugerido)}). Isso fica registrado para auditoria.` : ''; };
      i.oninput = prev; prev(); i.focus(); i.select();
      m.querySelector('#tf-m-cancel').onclick = () => { m.remove(); ok(null); };
      m.querySelector('#tf-m-ok').onclick = () => { const n = parseInt(i.value, 10); if (!(n > 0)) { toast('Informe o número do TF.', true); return; } m.remove(); ok(n); };
    });
  }

  /** Procedimento marcado com a constatação ou o enquadramento vazios: entram os textos padrão do procedimento (o fiscal pode editar). */
  function completarTextos() {
    const r = document.querySelector('input[name=tf-proc]:checked'); if (!r || !S) return;
    const t = textosDe(r.value);
    [['constatacao', t.constatacao], ['enquadramento', t.enquadramento]].forEach(([id, novo]) => {
      const el = $('#tf-' + id); if (el && !el.value.trim() && novo) { el.value = novo; S.tpl[id] = novo; }
    });
  }

  async function gerar() {
    completarTextos();
    const D = coletar(), a = anoAtual(), bar = (await barreiras()).find(x => x.id === D.barreira), doc = digitos(D.doc);
    if (!bar || !S) return toast('Escolha a barreira.', true);
    if (!D.nome.trim()) return toast('Informe o nome / razão social do fiscalizado.', true);
    if (doc.length !== 11 && doc.length !== 14) return toast('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo.', true);
    if (!D.local.trim()) return toast('Informe o local.', true);
    if (!docOk(doc) && !confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Gerar o TF mesmo assim?`)) return;
    if (!D.procedimento && !confirm('Nenhum procedimento (liberação, apreensão ou rechaço) foi marcado. Gerar o TF mesmo assim?')) return;
    if (D.auto && !D.ai.fatos.trim()) { toast('Auto de infração: descreva os fatos / a infração.', true); const f = $('#tf-ai-fatos'); if (f) f.focus(); return; }

    const btn = document.querySelector('#tfForm button[type=submit]'), rot = btn.textContent;
    btn.disabled = true; btn.textContent = 'Consultando a planilha…';
    let sug; try { sug = await sugerirNumero(bar.id, a); } catch (e) { btn.disabled = false; btn.textContent = rot; return toast(e.message, true); }
    btn.disabled = false; btn.textContent = rot;

    const turno = S.turnoId ? await Store.obter('turnos', S.turnoId) : null, hist = reincDe(S.hist), t0 = Date.now(), id = S.id;
    // auto de infração: dados do auto (as coordenadas são as do aparelho ou do turno) e nº proposto (último conhecido + 1; a planilha confirma)
    const gpsAuto = AND.gps || (turno && turno.latIni ? { lat: +turno.latIni, lng: +turno.lngIni } : null);
    const autoDados = D.auto ? JSON.stringify({ ...D.ai, lat: gpsAuto ? gpsAuto.lat : '', lon: gpsAuto ? gpsAuto.lng : '' }) : '';
    const autoN = D.auto ? (sug.autoUltimo || 0) + 1 : 0;
    // assinaturas desenhadas viram arquivos PNG (gravados só quando o TF for gravado); recusa: sem assinatura do fiscalizado
    const assS = { dono: 'tfs', id, ass: {}, assNovas: { ...S.assNovas } }; if (S.recusa) delete assS.assNovas.fiscalizado;
    const { mapa: assMapa, novos: assArqs } = Anexos.prepararAssinaturas(assS), fotos = S.fotos.slice(), recusa = S.recusa ? 1 : 0;
    const prods = D.produtos.filter(p => p.p && p.q).map(p => `${p.p} - ${p.q} ${p.u}`);
    const nome = D.nome.trim().toUpperCase();
    const pessoa = { id: doc, tipo: doc.length === 14 ? 'PJ' : 'PF', nome, rg: D.rg.trim(), endereco: D.endereco.trim(), municipio: D.municipio.trim(), uf: D.uf.trim().toUpperCase(), telefone: D.telefone.trim(), criadoEm: t0, atualizadoEm: t0 };
    // documento padrão/inválido (000.000.000-00…) não identifica ninguém: não vira cadastro nem liga a placa a um nome
    const placa = docOk(doc) && D.placa.length >= 7 ? { id: D.placa, doc, nome, criadoEm: t0, atualizadoEm: t0 } : null;

    // número digitado no formulário (ex.: o primeiro, seguindo o talão) vale no lugar do sugerido; o popup confirma
    let numero = S.numEditado && S.numEditado.b === bar.id ? S.numEditado.n : sug.numero, aviso = '';
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const n = await pedirNumero({ numero, sugerido: sug.numero, sufixo: bar.sufixo, ano: a, ultimo: sug.ultimo, ultimoTF: sug.ultimoTF, offline: sug.origem !== 'servidor', aviso });
      if (n == null) return;
      if ((await Store.todos('tfs')).some(t => t.barreira === bar.id && t.ano === a && t.numero === n && t.id !== id)) { numero = n; aviso = `Este aparelho já gerou o TF nº ${num4(n)}/${a}. Escolha outro número.`; continue; }
      const rec = {
        id, criadoEm: t0, atualizadoEm: t0, barreira: bar.id, ano: a, numero: n, numeroTxt: `${num4(n)}/${a} - ${bar.sufixo}`, turnoId: S.turnoId || '', veiculoId: S.veiculoId || '',
        data: D.data, hora: D.hora, fiscal: (turno && turno.fiscal) || Sync.nome(), local: D.local.trim(), placa: D.placa, origem: D.origem.trim(), destino: D.destino.trim(),
        ufOrigem: CONFIG.ufs.includes(D.ufOrigem) ? D.ufOrigem : '', ufDestino: CONFIG.ufs.includes(D.ufDestino) ? D.ufDestino : '',
        doc, nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio, uf: pessoa.uf, telefone: pessoa.telefone, relacao: D.relacao,
        inspecao: D.inspecao ? 1 : 0, coleta: D.coleta ? 1 : 0, amostras: Number(D.amostras) || 0, procedimento: D.procedimento, fiel: D.fiel ? 1 : 0, auto: D.auto ? 1 : 0, advertencia: D.advertencia ? 1 : 0,
        documentos: JSON.stringify(D.docs), produtos: JSON.stringify(prods), constatacao: D.constatacao, enquadramento: D.enquadramento,
        reincidente: hist.reincidente ? 1 : 0, tfsAnteriores: hist.total, cancelado: 0, motivoCancel: '', conflito: 0,
        numeroSugerido: sug.numero, numeroOrigem: sug.origem !== 'servidor' ? 'provisorio' : (n === sug.numero ? 'sistema' : 'editado'),
        fotos: JSON.stringify(fotos), assinaturas: JSON.stringify(assMapa), recusaAssinatura: recusa,
        autoNumero: autoN, autoNumeroTxt: autoN ? autoTxt(autoN, a, bar.sufixo) : '', autoNumeroOrigem: autoN ? (sug.origem === 'servidor' ? 'sistema' : 'provisorio') : '', autoDados, autoConflito: 0
      };
      let emitido = null;
      if (sug.origem === 'servidor') {                                               // a planilha confirma que o número ainda está livre
        try {
          const r = await Sync.emitirTF(rec, docOk(doc) ? pessoa : null, placa);
          if (r.emitido === false) {                                                 // outro fiscal usou este número nesse intervalo: ainda dá tempo de trocar
            sug = { ...sug, numero: r.proximo, ultimo: r.ultimo, ultimoTF: { ...r.ocupadoPor } }; numero = r.proximo;
            aviso = `O nº ${num4(n)}/${a} acabou de ser usado por ${r.ocupadoPor.usuario} (${dBR(r.ocupadoPor.data)} ${r.ocupadoPor.hora}). Nova sugestão: ${num4(r.proximo)}.`;
            continue;
          }
          emitido = r;
          if (rec.autoNumero) Object.assign(rec, { autoNumero: r.autoNumero || rec.autoNumero, autoNumeroTxt: r.autoNumeroTxt || rec.autoNumeroTxt, autoNumeroOrigem: r.autoNumeroOrigem || rec.autoNumeroOrigem });
        } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) return toast(e.message, true); }   // sem resposta: guarda e envia ao sincronizar
      }
      const est = emitido ? { pendente: 0, emitidoEm: emitido.emitidoEm } : { pendente: 1, provisorio: sug.origem !== 'servidor' ? 1 : 0 };
      await Store.gravarVarios('arquivos', assArqs);                                 // fotos já estão no aparelho; sobem ao Drive na sincronização
      await Store.gravar('tfs', { ...rec, ...est });
      if (docOk(doc)) await Store.gravar('pessoas', { ...pessoa, pendente: est.pendente });
      if (placa) await Store.gravar('placas', { ...placa, pendente: est.pendente });
      await Sync.lembrarUltimos({ [chave(bar.id, a)]: n, ...(rec.autoNumero ? { ['AI|' + chave(bar.id, a)]: rec.autoNumero } : {}) });
      clearTimeout(tRasc); await Store.setMeta('tfRascunho', null); localStorage.setItem('gdv.barreira', bar.id);
      encerrarAndamento();                                                        // painel: o TF deixou de estar em preenchimento (sem esperar resposta)
      S = null; Sync.sincronizar(); go('tfpronto', rec.id); return;
    }
    toast('Não foi possível definir o número do TF. Tente novamente.', true);
  }

  /**
   * TF antigo (digitado do papel): grava com o nº, a data e a hora do papel. Precisa de internet — a planilha recusa número já usado
   * (mostra quem usou) e aceita qualquer número livre; um número maior que o último usado faz a sequência da barreira continuar dele.
   */
  async function gravarPapel() {
    const D = coletar(), bar = (await barreiras()).find(x => x.id === D.barreira), doc = digitos(D.doc), st = S;
    if (!bar || !st) return toast('Escolha a barreira.', true);
    const n = parseInt(D.numero, 10), servidor = D.servidor.trim().replace(/\s+/g, ' ');
    if (!(n > 0)) { toast('Informe o número do TF do papel.', true); const i = $('#tf-num'); if (i) i.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(D.data) || !D.hora) return toast('Informe a data e a hora do TF do papel.', true);
    if (D.data > hojeISO()) return toast('A data do TF está no futuro.', true);
    if (servidor.split(' ').length < 2) { toast('Informe o nome completo do servidor que fiscalizou.', true); $('#tf-servidor').focus(); return; }
    if (doc && doc.length !== 11 && doc.length !== 14) return toast('CPF (11 dígitos) ou CNPJ (14 dígitos) incompleto. Deixe vazio se o fiscalizado não foi identificado.', true);
    if (doc && !docOk(doc) && !confirm(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} informado tem dígitos inválidos. Gravar mesmo assim?`)) return;
    if (!D.local.trim()) return toast('Informe o local.', true);
    if (!D.procedimento && !confirm('Nenhum procedimento (liberação, apreensão ou rechaço) foi marcado. Gravar mesmo assim?')) return;
    if (!st.pdfs.length && !confirm('Nenhum PDF escaneado anexado. Gravar o TF sem o PDF?')) return;
    if (!navigator.onLine) return toast('Sem internet: o TF do papel precisa da planilha para conferir o número. Tente de novo com internet (o rascunho fica guardado).', true);
    const a = Number(D.data.slice(0, 4)), btn = document.querySelector('#tfForm button[type=submit]'), rot = btn.textContent;
    btn.disabled = true; btn.textContent = 'Consultando a planilha…';
    const fim = () => { btn.disabled = false; btn.textContent = rot; };
    let sug; try { sug = await Sync.proximoNumero(bar.id, a); } catch (e) { fim(); return toast(e.semPermissao ? e.message : 'Sem resposta da planilha: ' + e.message + ' Tente de novo.', true); }
    const efeito = n > sug.ultimo ? `${sug.ultimo ? `O último nº usado nesta barreira em ${a} é ${num4(sug.ultimo)}.` : `Nenhum TF desta barreira em ${a} na planilha.`} Gravando o ${num4(n)}, a sequência desta barreira continua a partir dele: o próximo TF sugerido (também para os fiscais em campo) será o ${num4(n + 1)}.`
      : `O último nº usado nesta barreira em ${a} é ${num4(sug.ultimo)}: o ${num4(n)} é menor e a sequência não muda.`;
    if (!confirm(`Gravar o TF ${num4(n)}/${a} - ${bar.sufixo} (digitado do papel)?\n\n${efeito}`)) return fim();
    const t0 = Date.now(), nome = (D.nome.trim() || 'NÃO IDENTIFICADO').toUpperCase(), hist = reincDe(st.hist);
    const prods = D.produtos.filter(p => p.p && p.q).map(p => `${p.p} - ${p.q} ${p.u}`);
    const pessoa = doc ? { id: doc, tipo: doc.length === 14 ? 'PJ' : 'PF', nome, rg: D.rg.trim(), endereco: D.endereco.trim(), municipio: D.municipio.trim(), uf: D.uf.trim().toUpperCase(), telefone: D.telefone.trim(), criadoEm: t0, atualizadoEm: t0 } : null;
    const placa = docOk(doc) && D.placa.length >= 7 ? { id: D.placa, doc, nome, criadoEm: t0, atualizadoEm: t0 } : null;   // documento padrão: sem vínculo
    const rec = {
      id: st.id, criadoEm: t0, atualizadoEm: t0, barreira: bar.id, ano: a, numero: n, numeroTxt: `${num4(n)}/${a} - ${bar.sufixo}`, turnoId: '', veiculoId: '',
      data: D.data, hora: D.hora, fiscal: servidor, local: D.local.trim(), placa: D.placa, origem: D.origem.trim(), destino: D.destino.trim(),
      ufOrigem: CONFIG.ufs.includes(D.ufOrigem) ? D.ufOrigem : '', ufDestino: CONFIG.ufs.includes(D.ufDestino) ? D.ufDestino : '',
      doc, nome, rg: D.rg.trim(), endereco: D.endereco.trim(), municipio: D.municipio.trim(), uf: D.uf.trim().toUpperCase(), telefone: D.telefone.trim(), relacao: D.relacao,
      inspecao: D.inspecao ? 1 : 0, coleta: D.coleta ? 1 : 0, amostras: Number(D.amostras) || 0, procedimento: D.procedimento, fiel: D.fiel ? 1 : 0, auto: D.auto ? 1 : 0, advertencia: D.advertencia ? 1 : 0,
      documentos: JSON.stringify(D.docs), produtos: JSON.stringify(prods), constatacao: D.constatacao, enquadramento: D.enquadramento,
      reincidente: hist.reincidente ? 1 : 0, tfsAnteriores: hist.total, cancelado: 0, motivoCancel: '', conflito: 0,
      numeroSugerido: sug.proximo, numeroOrigem: 'papel', fotos: '[]', assinaturas: '{}', recusaAssinatura: 0, registroAntigo: 1, pdfs: JSON.stringify(st.pdfs),
      autoNumero: 0, autoNumeroTxt: '', autoNumeroOrigem: '', autoDados: ''          // auto do papel: só a marcação "Auto de infração" (o auto fica no talão)
    };
    btn.textContent = 'Gravando…';
    let r; try { r = await Sync.emitirTF(rec, docOk(doc) ? pessoa : null, placa); } catch (e) { fim(); return toast((e.semPermissao ? '' : 'Não gravou: ') + e.message, true); }
    if (r.emitido === false) { fim(); return toast(`O nº ${num4(n)}/${a} já está na planilha: ${r.ocupadoPor.numeroTxt} (${r.ocupadoPor.usuario}, ${dBR(r.ocupadoPor.data)} ${r.ocupadoPor.hora}). Confira o número do papel.`, true); }
    await Store.gravar('tfs', { ...rec, pendente: 0, emitidoEm: r.emitidoEm });     // os PDFs sobem ao Drive na sincronização
    if (pessoa && docOk(doc)) await Store.gravar('pessoas', { ...pessoa, pendente: 0 });
    if (placa) await Store.gravar('placas', { ...placa, pendente: 0 });
    await Sync.lembrarUltimos({ [chave(bar.id, a)]: Math.max(n, sug.ultimo) });
    clearTimeout(tRasc); await Store.setMeta(chaveRasc(true), null); localStorage.setItem('gdv.barreira', bar.id); lembrarServidor(servidor);
    S = null; Sync.sincronizar(); toast(`TF ${num4(n)}/${a} do papel gravado ✓`); go('tfpronto', rec.id);
  }

  /* ---------- telas: pronto (detalhes do TF, antes de imprimir) e lista ---------- */
  const temAuto = t => Number(t.auto) === 1 && Number(t.autoNumero) > 0 && Number(t.registroAntigo) !== 1;
  let PR = null;                                                                   // TF aberto na tela de detalhes: { id, ass, assNovas, recusa }
  async function pronto(id) {
    const t = await Store.obter('tfs', id); if (!t) return go('tf');
    PR = { id: t.id, ass: lerJSON(t.assinaturas, {}) || {}, assNovas: {}, recusa: Number(t.recusaAssinatura) === 1 };
    const nF = (lerJSON(t.fotos, []) || []).length, pap = Number(t.registroAntigo) === 1, pdfs = pap ? lerJSON(t.pdfs, []) || [] : [];
    view(`<div class="card"><h3>${icone('ok')} ${pap ? 'TF do papel gravado' : 'TF gerado'}</h3><div class="tf-num"><b>${esc(t.numeroTxt)}</b></div>
      <p>${esc(t.nome)} · ${esc(fmtDoc(t.doc))}</p><p>${dBR(t.data)} ${esc(t.hora)}${t.placa ? ' · ' + esc(t.placa) : ''}</p>
      ${pap ? `<div class="tf-novo" id="tf-papel-info">${icone('documento')} Digitado do papel · servidor que fiscalizou: ${esc(t.fiscal)}</div>` : ''}
      ${t.pendente ? '<div class="tf-novo">⏳ Número provisório / aguardando envio: será conferido na planilha ao sincronizar. Se houver repetição, a coordenação é avisada.</div>' : '<div class="tf-ok">✓ Número confirmado na planilha.</div>'}
      ${t.numeroOrigem === 'editado' ? `<div class="tf-novo">${icone('editar')} Número alterado manualmente (o sistema sugeriu ${num4(t.numeroSugerido)}). Registrado para auditoria.</div>` : ''}
      ${t.reincidente ? `<div class="tf-alerta">${icone('alerta')} Fiscalizado reincidente: ${t.tfsAnteriores} TF(s) anterior(es).</div>` : ''}
      ${t.cancelado ? `<div class="tf-alerta">${icone('proibido')} CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
      ${nF ? `<p class="dica" style="text-align:left">${icone('camera')} ${nF} foto(s): saem no anexo fotográfico, no fim do PDF.</p>` : ''}
      ${temAuto(t) ? `<div class="tf-novo" id="tf-auto-info">${icone('documento')} Auto de infração nº <b>${esc(t.autoNumeroTxt)}</b>${t.autoNumeroOrigem === 'provisorio' ? ' (provisório: conferido na planilha ao sincronizar)' : ''}${Number(t.autoConflito) === 1 ? ' · número repetido na planilha: confira com a coordenação' : ''}</div>` : ''}</div>
      ${pap ? `<div class="card"><h3>${icone('documento')} PDF escaneado</h3><div id="tf-pdfs-pronto"></div></div>` : t.cancelado ? '' : assCardHTML(PR)}
      <button class="botao" data-tf="imprimir" data-id="${esc(t.id)}">${icone('imprimir')} Imprimir / PDF (2 vias)</button>
      ${temAuto(t) ? `<button class="botao" data-tf="imprimirauto" data-id="${esc(t.id)}">${icone('imprimir')} Imprimir auto de infração (3 vias)</button>` : ''}
      <button class="botao sec" data-tf="novo">${icone('mais')} Novo TF</button>
      ${MODULO === 'veiculos' ? '<button class="botao sec" data-go="lista">↩ Voltar à lista de veículos</button>' : '<button class="botao sec" data-go="tf">Ver lista de TFs</button>'}
      <p class="dica">Na janela de impressão, escolha “Salvar como PDF” ou imprima direto. As 2 vias saem em páginas separadas${nF ? '; o anexo fotográfico vai uma vez, no fim' : ''}.</p>`);
    if (pap) await renderPDFs(pdfs, '#tf-pdfs-pronto', false); else await desenharAss(PR);
    const rc = $('#tf-recusa');
    if (rc) rc.onchange = async () => { const r = PR; await gravarAssinatura(r, 'fiscalizado', null, rc.checked); };
  }
  /** Tela de detalhes: grava na hora a assinatura (img = dataURL; null = remover) e/ou a recusa; o TF volta a ficar pendente e sobe. */
  async function gravarAssinatura(st, papel, img, recusa) {
    const t = await Store.obter('tfs', st.id); if (!t || t.cancelado) return;
    const ass = lerJSON(t.assinaturas, {}) || {}, antigo = ass[papel];
    if (img) { const a = Anexos.novoArquivo('tfs', t.id, 'assinatura', papel, 'image/png', img); await Store.gravar('arquivos', a); ass[papel] = a.id; }
    else delete ass[papel];
    if (antigo && antigo !== ass[papel]) await Anexos.apagarSeNaoEnviado([antigo]);   // já enviada: fica no Drive (auditoria)
    const rec = recusa === undefined ? (img && papel === 'fiscalizado' ? 0 : Number(t.recusaAssinatura) || 0) : (recusa ? 1 : 0);
    await Store.salvar('tfs', { ...t, assinaturas: JSON.stringify(ass), recusaAssinatura: rec });
    if (PR !== st) return;
    st.ass = ass; st.recusa = rec === 1;
    await desenharAss(st); Sync.sincronizar();
    toast(recusa !== undefined ? (rec ? 'Recusa registrada.' : 'Recusa desmarcada.') : img ? 'Assinatura salva.' : 'Assinatura removida.');
  }
  let verRemovidos = false;
  async function lista() {
    if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());
    const mostrar = tela();
    const todos = (await Store.todos('tfs')).sort((a, b) => b.criadoEm - a.criadoEm);
    // TF cancelado e já enviado pode sair da lista deste aparelho (só aqui: na planilha, no painel e na auditoria continua, com o número usado)
    const removidos = new Set((await Store.meta('tfsRemovidos')) || []);
    if (!mostrar.viva()) return;
    const nRem = todos.filter(t => removidos.has(t.id)).length;
    if (!nRem) verRemovidos = false;
    view(`<button class="botao" data-tf="novo">${icone('mais')} Novo TF</button>${Sync.pode('antigo') && Sync.pode('tf') ? `<button class="botao sec" data-tf="novoantigo" id="tf-novoantigo">${icone('documento')} TF antigo (digitar do papel)</button>` : ''}<div class="card"><label>Pesquisar (nº, nome, CPF/CNPJ, placa)<input id="tfQ"></label>
      ${nRem ? `<label class="chk"><input type="checkbox" id="tfVerRem" ${verRemovidos ? 'checked' : ''}> Mostrar os excluídos da lista (${nRem})</label>` : ''}</div><div id="tfItens"></div>`);
    const desenhar = () => {
      const q = $('#tfQ').value.trim().toUpperCase(), qd = digitos(q);
      const v = todos.filter(t => verRemovidos || !removidos.has(t.id)).filter(t => !q || t.numeroTxt.toUpperCase().includes(q) || t.nome.toUpperCase().includes(q) || (qd && digitos(t.doc).includes(qd)) || placaNorm(t.placa).includes(placaNorm(q)));
      $('#tfItens').innerHTML = v.length ? v.map(t => `<div class="item"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.nome)}</div></div>
        <div class="hora">${dBR(t.data)}</div></div>
        <div class="info">${esc(PROC[t.procedimento] || 'Sem procedimento')}${t.placa ? ' · ' + esc(t.placa) : ''}${t.reincidente ? ' · reincidente' : ''}${Number(t.registroAntigo) === 1 ? ' · do papel' : ''}</div>
        ${t.cancelado ? `<div class="info pend">${icone('proibido')} CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
        ${t.conflito ? '<div class="info pend">Número duplicado na planilha: confira com a coordenação.</div>' : ''}
        ${t.pendente ? `<div class="info pend">⏳ ${t.provisorio ? 'número provisório, será conferido ao sincronizar' : 'aguardando envio'}</div>` : ''}
        <div class="botoes"><button class="editar" data-tf="abrir" data-id="${esc(t.id)}">Abrir</button><button class="editar" data-tf="imprimir" data-id="${esc(t.id)}">Imprimir</button>
        ${temAuto(t) ? `<button class="editar" data-tf="imprimirauto" data-id="${esc(t.id)}">Auto de infração</button>` : ''}
        ${t.cancelado ? '' : `<button class="excluir" data-tf="cancelar" data-id="${esc(t.id)}">Cancelar TF</button>`}
        ${t.cancelado && !t.pendente ? (removidos.has(t.id) ? `<button class="editar" data-tf="restaurar" data-id="${esc(t.id)}">Voltar para a lista</button>`
          : `<button class="excluir" data-tf="tirar" data-id="${esc(t.id)}">Excluir da lista</button>`) : ''}</div></div>`).join('') : '<div class="vazio">Nenhum TF neste aparelho.</div>';
    };
    desenhar(); $('#tfQ').oninput = desenhar;
    if ($('#tfVerRem')) $('#tfVerRem').onchange = e => { verRemovidos = e.target.checked; desenhar(); };
  }

  /* ---------- ações (cliques) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-tf]'); if (!el) return;
    const a = el.dataset.tf, id = el.dataset.id;
    try {
      if (a === 'novo') go('tfnovo');
      else if (a === 'novoantigo') go('tfnovo', { antigo: 1 });
      else if (a === 'delpdf' && S && $('#tfForm')) { S.pdfs = S.pdfs.filter(x => x !== id); await Anexos.apagarSeNaoEnviado([id]); await renderPDFs(); salvarRascunho(0); }
      else if (a === 'verpdf') { const f = await Store.obter('arquivos', id); if (f && f.dados) { const u = URL.createObjectURL(await (await fetch(f.dados)).blob()); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); } }
      else if (a === 'abrir') go('tfpronto', id);
      else if (a === 'delfoto' && S && $('#tfForm')) { S.fotos = S.fotos.filter(x => x !== id); await Anexos.apagarSeNaoEnviado([id]); await renderFotos(); salvarRascunho(0); }
      else if (a === 'assinar' || a === 'delass') {
        const papel = el.dataset.papel; if (!PAPEIS[papel]) return;
        const img = a === 'assinar' ? await pedirAssinatura(papel) : null;
        if (a === 'assinar' && !img) return;
        if (S && $('#tfForm')) { if (img) S.assNovas[papel] = img; else delete S.assNovas[papel]; await desenharAss(S); salvarRascunho(0); }
        else if (PR && $('#tf-ass-card')) await gravarAssinatura(PR, papel, img);
      }
      else if (a === 'imprimir') await Docs.tf(id);
      else if (a === 'imprimirauto') await Docs.auto(id);
      else if (a === 'tirar' || a === 'restaurar') {
        const t = await Store.obter('tfs', id); if (!t) return;
        if (a === 'tirar' && (!t.cancelado || t.pendente)) return toast('Só TF cancelado e já enviado à planilha pode sair da lista.', true);
        if (a === 'tirar' && !confirm(`Excluir o TF ${t.numeroTxt} (cancelado) da lista deste aparelho?\n\nEle continua na planilha e na auditoria, com o número usado.`)) return;
        const r = new Set((await Store.meta('tfsRemovidos')) || []); if (a === 'tirar') r.add(id); else r.delete(id);
        await Store.setMeta('tfsRemovidos', [...r]); toast(a === 'tirar' ? 'TF excluído da lista.' : 'TF de volta à lista.'); lista();
      }
      else if (a === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (o número do TF continua usado):'); if (motivo == null) return;
        const t = await Store.obter('tfs', id); await Store.salvar('tfs', { ...t, cancelado: 1, motivoCancel: motivo.trim().slice(0, 300) });
        Sync.sincronizar(); toast('TF cancelado.'); lista();
      } else if (a === 'addprod') { const c = coletar(); c.produtos.push({ p: '', q: '', u: T.unidades[0] }); $('#tf-produtos').innerHTML = c.produtos.map(linhaProd).join(''); salvarRascunho(); }
      else if (a === 'delprod') { const c = coletar(); c.produtos.splice(+el.dataset.i, 1); if (!c.produtos.length) c.produtos.push({ p: '', q: '', u: T.unidades[0] }); $('#tf-produtos').innerHTML = c.produtos.map(linhaProd).join(''); salvarRascunho(); }
      else if (a === 'descartar') { if (confirm('Descartar este TF? Os dados preenchidos serão perdidos.')) { clearTimeout(tRasc); encerrarAndamento(); const f = S ? S.fotos : [], pd = S ? S.pdfs : [], ant = !!(S && S.antigo); S = null; await descartarRascunho({ fotos: f, pdfs: pd }, ant); go(MODULO === 'veiculos' ? 'lista' : 'tf'); } }
      else if (a === 'usardoc') { $('#tf-doc').value = fmtDoc(el.dataset.doc); consultarDoc(); }
    } catch (err) { toast(err.message || String(err), true); }
  });

  /** O fiscal saiu do formulário sem gerar (app.js → go): o rascunho continua salvo, mas o painel deixa de mostrar o TF em preenchimento. */
  const saiu = () => encerrarAndamento();

  return { lista, novo, pronto, saiu, placaNaBva, cuidadoPlaca };
})();
