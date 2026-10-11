const $ = s => document.querySelector(s);
const esc = Docs.esc;
const dBR = iso => (iso || '').split('-').reverse().join('/');
const pad = (n, l = 2) => String(n).padStart(l, '0');
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const agoraHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

let VIEW = 'home', EDIT = null;

function toast(t, erro) {
  const m = $('#toast'); m.textContent = t; m.className = erro ? 'erro on' : 'on';
  clearTimeout(toast.t); toast.t = setTimeout(() => m.className = '', 3500);
}

async function turnoAtual() {
  const id = await Store.meta('turnoAtual');
  if (!id) return null;
  const t = await Store.obter('turnos', id);
  return t && !t.encerrado ? t : null;
}
async function veiculosDe(turnoId) {
  return Docs.ordenar((await Store.todos('veiculos')).filter(v => v.turnoId === turnoId && !v.excluido));
}

/* ---------- localização (GPS funciona sem internet) ---------- */
function pegarLocal() {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy) }),
      () => ok(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
/** Endereço aproximado da coordenada (OpenStreetMap/Nominatim). Sem internet ou em erro: ''. */
async function enderecoDe(g) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=${g.lat}&lon=${g.lng}`, { signal: ctrl.signal });
    const a = (await r.json()).address || {};
    const via = a.road || a.pedestrian || a.path || '', bairro = a.suburb || a.neighbourhood || a.village || a.hamlet || '';
    const cidade = a.city || a.town || a.municipality || a.county || '';
    return [via, bairro, cidade && cidade + (a['ISO3166-2-lvl4'] ? '/' + a['ISO3166-2-lvl4'].split('-')[1] : '')].filter(Boolean).join(' – ');
  } catch (e) { return ''; } finally { clearTimeout(t); }
}
const camposLocal = (g, sufixo) => g ? { ['lat' + sufixo]: g.lat, ['lng' + sufixo]: g.lng, ['prec' + sufixo]: g.prec } : {};

/** A Ficha de Campo só existe nas BVAs marcadas com ficha: true (hoje só a CEASA); nas demais e no volante, só o Termo.
 *  Turno antigo com local digitado à mão (antes da lista de BVAs): ficha só se o local for a CEASA. */
const temFicha = t => { const b = CONFIG.bvas.find(x => x.nome === t.local); return b ? !!b.ficha : /ceasa/i.test(t.local || ''); };
/* ---------- módulos e navegação ---------- */
// Depois de instalar e ativar o aparelho, o fiscal escolhe um módulo: Educação Sanitária/Fiscalização de Trânsito (turnos e veículos), TF ou PCE.
// Dentro da Educação Sanitária/Fiscalização de Trânsito o TF também está embutido (botão "Lavrar TF"); o menu de baixo muda conforme o módulo.
let MODULO = 'hub';
const NAVS = {
  hub: [['modulos', '🏠', 'Módulos'], ['config', '⚙️', 'Status']],
  veiculos: [['modulos', '🏠', 'Módulos'], ['home', '🚛', 'Turno'], ['registrar', '➕', 'Registrar'], ['lista', '📋', 'Lista'], ['resumo', '📊', 'Resumo'], ['historico', '📈', 'Histórico']],
  tf: [['modulos', '🏠', 'Módulos'], ['tf', '📄', 'Meus TFs'], ['tfnovo', '➕', 'Novo TF']],
  pce: [['modulos', '🏠', 'Módulos'], ['pce', '🌱', 'Levantamentos'], ['pcelev', '➕', 'Novo levantamento'], ['pcetermos', '🧪', 'Termos de colheita'], ['pcetermo', '📝', 'Novo termo']]
};
const VIEWS_VEICULOS = ['home', 'registrar', 'editar', 'lista', 'resumo', 'fechado', 'historico'];
/** Módulo (permissão) de cada tela: veiculos, tf ou pce; '' = livre (módulos, status). */
const moduloDaView = v => VIEWS_VEICULOS.includes(v) ? 'veiculos' : /^tf/.test(v) ? 'tf' : /^pce/.test(v) ? 'pce' : '';
const SEM_AUT = 'Sem autorização — fale com a gerência';
/** A gerência tirou o módulo (painel → Servidores): a tela não abre e volta para a tela de módulos. Os dados do aparelho ficam guardados. */
function semPermissaoPara(view) {
  const m = moduloDaView(view);
  if (m && !Sync.pode(m)) return m;
  if (MODULO === 'veiculos' && m === 'tf' && view !== 'tf' && !Sync.pode('veiculos')) return 'veiculos';   // TF embutido na Educação Sanitária/Fiscalização de Trânsito
  return '';
}
function renderNav(view) {
  const ativo = ({ editar: 'lista', fechado: 'home', tfpronto: MODULO === 'tf' ? 'tf' : 'lista', tfnovo: MODULO === 'tf' ? 'tfnovo' : 'lista',
    pcepronto: 'pcetermos', pceservidor: 'pce' })[view] || view;
  $('#nav').innerHTML = NAVS[MODULO].map(([v, i, t]) => `<button data-v="${v}" class="${v === ativo ? 'on' : ''}">${i}<span>${t}</span></button>`).join('');
}
function go(view, arg) {
  const bloq = semPermissaoPara(view);
  if (bloq) { toast(`${SEM_AUT}: ${Sync.MODULOS[bloq]}.`, true); view = 'modulos'; arg = null; }
  if (VIEW === 'tfnovo' && view !== 'tfnovo' && typeof TFUI !== 'undefined') TFUI.saiu();   // saiu do formulário de TF sem gerar
  VIEW = view; EDIT = arg || null;
  if (view === 'modulos' || view === 'config') MODULO = 'hub';
  else if (view === 'tf') MODULO = 'tf';
  else if (VIEWS_VEICULOS.includes(view)) MODULO = 'veiculos';
  else if (/^pce/.test(view)) MODULO = 'pce';
  else if (/^tf/.test(view) && MODULO === 'hub') MODULO = 'tf';          // TF aberto a partir do veículo continua no módulo de veículos (embutido)
  renderNav(view);
  ({ modulos, home, registrar, editar: registrar, lista, resumo, fechado, historico, config, tf: () => TFUI.lista(), tfnovo: () => TFUI.novo(EDIT), tfpronto: () => TFUI.pronto(EDIT),
    pce: () => PCEUI.lista(), pcelev: () => PCEUI.levantamento(EDIT), pcetermos: () => PCEUI.termos(), pcetermo: () => PCEUI.termo(EDIT),
    pcepronto: () => PCEUI.pronto(EDIT), pceservidor: () => PCEUI.servidor(EDIT) }[view])();
  window.scrollTo(0, 0);
}

async function modulos() {
  if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());      // 1º instalar, 2º ativar, 3º módulos
  const t = await turnoAtual(), v = t ? await veiculosDe(t.id) : [];
  const tfs = await Store.todos('tfs'), pend = tfs.filter(x => x.pendente).length, nome = Sync.nome().split(' ')[0];
  const stPce = await PCEUI.status();
  // módulo sem autorização: cartão cinza, não abre (os registros já feitos continuam guardados no aparelho)
  const cartao = (mod, v, ic, titulo, linhas) => Sync.pode(mod)
    ? `<button class="modulo" data-v="${v}"><span class="ic">${ic}</span><span><b>${titulo}</b>${linhas}</span></button>`
    : `<button class="modulo bloqueado" data-bloq="${mod}" aria-disabled="true"><span class="ic">${ic}</span><span><b>${titulo}</b><small class="sem-aut">🔒 ${SEM_AUT}</small>${linhas}</span></button>`;
  const aviso = (Sync.estado() || {}).aviso || Sync.avisoSemPermissao(await Sync.bloqueadosComPendentes());
  view(`<div class="card"><h3>Olá${nome ? ', ' + esc(nome) : ''}!</h3><p class="dica" style="text-align:left">Escolha o que deseja fazer.</p></div>
    ${aviso ? `<div class="card aviso" id="avisoPerm">⚠️ ${esc(aviso)}</div>` : ''}
    ${avisoTurnoEncerrado()}
    ${cartao('veiculos', 'home', '🚛', 'Educação Sanitária/Fiscalização de Trânsito', `<small>${t ? `Turno em andamento · ${v.length} veículo(s) registrado(s)${Sync.pode('veiculos') ? '' : ' (guardado neste aparelho)'}` : 'Registro das informações, por ação'}</small>`)}
    ${cartao('tf', 'tf', '📄', 'Termo de Fiscalização de Barreira', `<small>${tfs.length} TF(s) neste aparelho${pend ? ` · ⏳ ${pend} aguardando envio` : ''}</small>`)}
    ${cartao('pce', 'pce', '🌱', 'PCE', `<small>Programa de Controle e Erradicação — levantamento fitossanitário e Termo de Colheita de Amostras</small><small class="pce-status">${esc(stPce)}</small>`)}
    ${Sync.pode('veiculos') && Sync.pode('tf') ? '<p class="dica">Dentro da Educação Sanitária/Fiscalização de Trânsito também dá para lavrar o TF de um veículo (botão “Lavrar TF”).</p>' : ''}`);
}
const view = html => { $('#view').innerHTML = bannerInstalar() + html; };

/* ---------- instalação: Adicionar à tela inicial (iOS / Android) ---------- */
// Ordem em celulares: 1) instalar na tela inicial → 2) ativar com o código → 3) iniciar turno.
const UA = navigator.userAgent;
const ehIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ehAndroid = /Android/i.test(UA);
const instalado = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let eventoInstalar = null;                                   // evento nativo de instalação (Android/Chrome)
const precisaInstalar = () => (ehIOS || ehAndroid) && !instalado() && !lsGet('gdv.semInstalar');

function bannerInstalar() {
  if (!precisaInstalar()) return '<div id="bInstalar"></div>';
  const saida = `<p class="dica" style="text-align:left">Se a opção não aparecer, abra este endereço direto no ${ehIOS ? 'Safari' : 'Chrome'} (no WhatsApp: toque em ⋯ ou ⋮ → <i>Abrir no navegador</i>).</p>
    <div class="duas"><button class="botao sec" data-instalar="copiar">Copiar endereço</button>
    <button class="botao sec" data-instalar="continuar">Continuar no navegador mesmo assim</button></div>`;
  if (lsGet('gdv.instalado')) {
    return `<div id="bInstalar" class="card instalar"><h3>✅ App instalado</h3>
      <p>Agora <b>feche esta página</b> e abra o app pelo <b>ícone</b> na ${ehIOS ? 'Tela de Início' : 'tela inicial'}. Ele vai pedir o código de ativação e, em seguida, liberar o início do turno.</p>${saida}</div>`;
  }
  const passos = ehIOS
    ? ['Toque no botão <b>Compartilhar</b> (quadrado com seta para cima ⬆️): fica na barra de baixo do Safari (no Chrome, no topo, ao lado do endereço).',
       'Role a lista e toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>.',
       'Abra o app pelo <b>ícone</b> na Tela de Início.']
    : ['Toque no menu <b>⋮</b> do navegador (canto superior direito).', 'Toque em <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).',
       'Confirme em <b>Instalar</b> / <b>Adicionar</b>.', 'Abra o app pelo <b>ícone</b> na tela inicial.'];
  return `<div id="bInstalar" class="card instalar"><h3>📲 Passo 1: instale o app</h3>
    <p>Instale na tela inicial para abrir como aplicativo e funcionar mesmo sem internet. Depois de instalar, abra pelo ícone: o app pede o <b>código de ativação</b> e só então libera o <b>início do turno</b>.</p>
    <ol>${passos.map(p => `<li>${p}</li>`).join('')}</ol>
    ${eventoInstalar ? '<button class="botao" data-instalar="agora">Instalar agora</button>' : ''}
    ${ehIOS ? '<p class="dica" style="text-align:left">No iPhone o app instalado guarda os dados separados do Safari; por isso a ativação é feita depois, dentro do app instalado.' + (Sync.ativado() ? ' Este aparelho já estava ativado no navegador: no app instalado será preciso ativar de novo, com um código novo.' : '') + '</p>' : ''}
    ${saida}</div>`;
}
const atualizarBannerInstalar = () => { const el = $('#bInstalar'); if (el) el.outerHTML = bannerInstalar(); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; atualizarBannerInstalar(); });
window.addEventListener('appinstalled', () => { lsSet('gdv.instalado', '1'); atualizarBannerInstalar(); });

async function acaoInstalar(acao) {
  if (acao === 'agora' && eventoInstalar) {
    eventoInstalar.prompt();
    const r = await eventoInstalar.userChoice; eventoInstalar = null;
    if (r && r.outcome === 'accepted') lsSet('gdv.instalado', '1');
    atualizarBannerInstalar();
  } else if (acao === 'copiar') {
    try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Endereço copiado.'); }
    catch (e) { toast('Não foi possível copiar. Copie o endereço na barra do navegador.', true); }
  } else if (acao === 'continuar') {
    if (!confirm('Continuar sem instalar? O app funciona no navegador, mas pode perder o modo offline e a instalação na tela inicial é o recomendado.')) return;
    lsSet('gdv.semInstalar', '1'); go(VIEW === 'editar' ? 'home' : VIEW);
  }
}

/* ---------- turno encerrado fora do aparelho (gerência no painel) ---------- */
// O sync avisa (gdv-turno-encerrado) quando o turno em andamento chega encerrado da planilha. O aviso fica na tela até o fiscal
// tocar em "Entendi" ou iniciar outro turno (sobrevive a recarregar o app).
const LS_AVISO_ENC = 'gdv.avisoEncerrado';
function textoTurnoEncerrado(a) {
  const hora = a.fim ? ` às ${a.fim}` : '';
  return a.encerradoPor ? `Este turno foi encerrado pela gerência${hora}. Os documentos estão no Histórico.`
    : `Este turno foi encerrado fora deste aparelho${hora}. Os documentos estão no Histórico.`;
}
function avisoTurnoEncerrado() {
  let a = null; try { a = JSON.parse(lsGet(LS_AVISO_ENC) || 'null'); } catch (e) { a = null; }
  if (!a || !a.id) return '';
  return `<div class="card aviso" id="avisoEncerrado" role="alert"><h3>⏹ Turno encerrado</h3><p>${esc(textoTurnoEncerrado(a))}</p>
    ${a.numeroTF || a.encerradoPor ? `<p><small>${esc([a.numeroTF, a.encerradoPor && 'encerrado por ' + a.encerradoPor].filter(Boolean).join(' · '))}</small></p>` : ''}
    <div class="duas"><button class="botao sec" data-go="historico">📈 Abrir o Histórico</button><button class="botao sec" data-avisook="1">Entendi</button></div></div>`;
}
window.addEventListener('gdv-turno-encerrado', e => {
  const a = e.detail || {};
  lsSet(LS_AVISO_ENC, JSON.stringify(a));
  // sai da tela do turno (registrar, lista, resumo…): volta ao início do módulo, onde aparece o aviso e o formulário de novo turno;
  // em outra tela (TF, PCE, histórico…) só avisa: o cartão aparece ao voltar para Módulos/Turno
  if (['home', 'registrar', 'editar', 'lista', 'resumo'].includes(VIEW)) go('home');
  else if (VIEW === 'modulos') go('modulos');
  else toast(textoTurnoEncerrado(a), true);
});

/* ---------- Início / novo turno ---------- */
const avisoAtivacao = () => {
  const revog = localStorage.getItem('gdv.revogado');
  if (Sync.ativado() && !revog) return '';
  if (precisaInstalar()) return '';   // passo 1 ainda pendente: só as instruções de instalação aparecem
  return `<form class="card aviso" id="fAtivar"><h3>${revog ? '⛔ Acesso revogado' : '🔑 Ativar este aparelho'}</h3>
    <p>${revog ? 'Peça um novo código de ativação ao administrador.' : 'Digite o código de 6 dígitos enviado pelo administrador. Só esta etapa exige internet.'}</p>
    ${CONFIG.sync.url ? '' : '<label>Endereço do servidor<input id="aUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" required></label>'}
    <label>Código de ativação<input id="aCod" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="000 000" required></label>
    <button class="botao">Ativar</button></form>`;
};
async function home() {
  const t = await turnoAtual();
  if (!t) return novoTurno();
  const v = await veiculosDe(t.id);
  view(`${avisoAtivacao()}
    <div class="card"><h3>Turno atual</h3>
      <p><b>${esc(t.numeroTF)}</b></p>
      <p><b>Fiscal:</b> ${esc(t.fiscal)}</p><p><b>Local:</b> ${esc(t.local)}</p>
      <p><b>Data:</b> ${dBR(t.data)} &nbsp; <b>Posto:</b> ${esc(t.posto || '')}</p>
      <p><b>Início do turno:</b> ${esc(t.inicio)}</p>
      <p><small>${Number(t.semPlaca) ? 'Placa do veículo opcional neste turno.' : 'Placa do veículo obrigatória neste turno.'}</small></p></div>
    <div class="card contador"><h1>${v.length}</h1><p>Veículos registrados</p></div>
    <button class="botao" data-go="registrar">➕ Registrar veículo</button>
    <button class="botao" data-go="lista">📋 Lista de veículos</button>
    <button class="botao" data-go="resumo">📊 Resumo e documentos</button>
    ${Sync.pode('tf') ? '<button class="botao sec" data-go="tfnovo">📄 Lavrar TF neste turno</button>' : ''}`);
}
function novoTurno() {
  if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());   // turno só após a ativação
  const ls = k => esc(localStorage.getItem('gdv.' + k) || '');
  view(`${avisoAtivacao()}${avisoTurnoEncerrado()}<form class="card" id="fTurno"><h3>Iniciar turno</h3>
    <label>Nº do Termo de Fiscalização<input id="nTF" type="number" min="1" inputmode="numeric" required placeholder="ex.: 12"></label>
    <label>Tipo de posto<select id="nPosto">${CONFIG.postos.map(p => `<option value="${p}" ${localStorage.getItem('gdv.posto') === p ? 'selected' : ''}>${p === 'Móvel' ? 'Volante (móvel)' : p}</option>`).join('')}</select></label>
    <div id="nLocalBox"></div>
    <label>Unidade (Termo)<input id="nUnidade" required value="${localStorage.getItem('gdv.unidade') ? ls('unidade') : esc(CONFIG.unidadePadrao)}"></label>
    <label>Fiscal 1 — nome completo *${Sync.nome() ? ' <small>(vinculado a este aparelho)</small>' : ''}<input id="nFiscal1" autocomplete="off" ${Sync.nome() ? 'readonly' : ''} value="${Sync.nome() ? esc(Sync.nome()) : ls('fiscal1')}" placeholder="Nome e sobrenome"></label>
    <label>Fiscal 2 — nome completo (opcional)<input id="nFiscal2" autocomplete="off" value="${ls('fiscal2')}" placeholder="Nome e sobrenome"></label>
    <button class="botao" type="submit">Iniciar turno</button></form>`);
  // Fixa: lista das BVAs (CONFIG.bvas). Volante: endereço da coordenada, editável. A placa só é obrigatória onde a BVA exige.
  let gpsVolante = null;
  const bvaDe = nome => CONFIG.bvas.find(b => b.nome === nome);
  const placaObrigatoria = () => $('#nPosto').value === 'Fixa' && !!(bvaDe($('#nLocal').value) || {}).placa;
  const avisoPlaca = () => { $('#nPlacaInfo').textContent = placaObrigatoria() ? 'Placa do veículo obrigatória nesta barreira.' : 'Placa do veículo opcional neste local.'; };
  async function preencherEndereco() {
    const st = $('#nLocalSt'); st.textContent = '📍 Obtendo localização…';
    gpsVolante = await pegarLocal();
    const volante = () => $('#nPosto') && $('#nPosto').value === 'Móvel' && $('#nLocal');   // o formulário pode ter sido fechado
    if (!volante()) return;
    if (!gpsVolante) { st.textContent = 'GPS indisponível: digite o local.'; return; }
    const end = await enderecoDe(gpsVolante);
    if (!volante()) return;
    const campo = $('#nLocal');
    if (!campo.dataset.editado) campo.value = end || `Volante – ${gpsVolante.lat.toFixed(5)}, ${gpsVolante.lng.toFixed(5)}`;
    st.textContent = end ? 'Endereço obtido pela localização (pode editar).' : 'Sem endereço (sem internet?): ajuste o local se quiser.';
  }
  function montarLocal() {
    const fixa = $('#nPosto').value === 'Fixa', ult = localStorage.getItem('gdv.local') || '';
    $('#nLocalBox').innerHTML = fixa
      ? `<label>Local / Posto (BVA)<select id="nLocal" required>${CONFIG.bvas.map(b => `<option ${b.nome === ult ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
         <p class="dica" id="nPlacaInfo"></p>`
      : `<label>Local / Posto (volante)<input id="nLocal" required autocomplete="off" placeholder="endereço do posto volante"></label>
         <div class="linha-acoes"><small id="nLocalSt"></small><button type="button" class="botao sec mini" id="nLocalGps">📍 Atualizar pela localização</button></div>
         <p class="dica" id="nPlacaInfo"></p>`;
    $('#nLocal').addEventListener(fixa ? 'change' : 'input', () => { if (!fixa) $('#nLocal').dataset.editado = '1'; avisoPlaca(); });
    if (!fixa) { $('#nLocalGps').onclick = () => { delete $('#nLocal').dataset.editado; preencherEndereco(); }; preencherEndereco(); }
    avisoPlaca();
  }
  $('#nPosto').onchange = montarLocal; montarLocal();
  $('#fTurno').onsubmit = async e => {
    e.preventDefault();
    const nomes = ['#nFiscal1', '#nFiscal2'].map(id => $(id).value.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!nomes.length) { toast('Informe o nome completo de pelo menos um fiscal.', true); $('#nFiscal1').focus(); return; }
    const curto = nomes.find(n => n.split(' ').length < 2);
    if (curto) { toast(`Informe o nome completo (nome e sobrenome): "${curto}"`, true); return; }
    const data = hojeISO(), inicio = agoraHM(), letra = letraDoTurno(inicio);   // horário = instante do clique
    const btn = $('#fTurno button[type=submit]'); btn.disabled = true; btn.textContent = '📍 Obtendo localização…';
    const gps = (await pegarLocal()) || gpsVolante;
    if (!gps) toast('Turno iniciado sem coordenadas (GPS indisponível ou permissão negada).', true);
    const t = await Store.salvar('turnos', {
      numeroTF: `TF-${pad(parseInt($('#nTF').value, 10), 3)}-${letra}-${data.slice(0, 4)}`,
      data, letra, posto: $('#nPosto').value,
      inicio, fim: '', ...camposLocal(gps, 'Ini'),
      fiscal: nomes.join(' e '), local: $('#nLocal').value.trim(),
      unidade: $('#nUnidade').value.trim(), semPlaca: placaObrigatoria() ? 0 : 1, encerrado: 0
    });
    ['local', 'unidade', 'posto'].forEach(k => localStorage.setItem('gdv.' + k, t[k]));
    localStorage.setItem('gdv.fiscal1', $('#nFiscal1').value.trim()); localStorage.setItem('gdv.fiscal2', $('#nFiscal2').value.trim());
    await Store.setMeta('turnoAtual', t.id);
    try { localStorage.removeItem(LS_AVISO_ENC); } catch (e2) { /* sem armazenamento */ }
    Sync.sincronizar(); go('home');
  };
}

/* ---------- Registrar / editar ---------- */
async function registrar() {
  const t = await turnoAtual();
  if (!t) { toast('Inicie um turno primeiro.', true); return go('home'); }
  const v = EDIT ? await Store.obter('veiculos', EDIT) : null;
  const tipo = v ? v.tipo : 'PA', semPlaca = !!Number(t.semPlaca);    // turno com placa opcional (ex.: Jundiá)
  view(`<form class="card" id="fVeic"><h3>${v ? 'Editar veículo' : 'Registrar veículo'}</h3>
    <label>Placa${semPlaca ? ' <small>(opcional)</small>' : ''}<input id="placa" maxlength="8" autocapitalize="characters" autocomplete="off" ${semPlaca ? '' : 'required'} placeholder="ABC1D23" value="${esc(v ? v.placa : '')}"></label>
    <label>Tipo do veículo</label>
    <div class="tipos">${Object.entries(CONFIG.tipos).map(([c, x]) => `
      <label class="tipo-card"><input type="radio" name="tipo" value="${c}" ${c === tipo ? 'checked' : ''}>${x.icone}<span>${x.nome}</span></label>`).join('')}</div>
    <label>Pessoas a bordo (estimativa)<input id="pessoas" type="number" min="0" inputmode="numeric" value="${v ? v.pessoas : CONFIG.tipos[tipo].pessoas}"></label>
    <label>Observações<textarea id="obs" rows="3">${esc(v ? v.obs : '')}</textarea></label>
    <button class="botao">💾 Salvar</button></form>`);
  const placa = $('#placa');
  placa.oninput = () => placa.value = placa.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  document.querySelectorAll('input[name=tipo]').forEach(r => r.onchange = () => {
    if (!v) $('#pessoas').value = CONFIG.tipos[r.value].pessoas;
  });
  if (!v && !semPlaca) placa.focus();
  $('#fVeic').onsubmit = async e => {
    e.preventDefault();
    const p = placa.value.trim();
    if (!p && !semPlaca) { toast('Informe a placa.', true); placa.focus(); return; }
    if (p && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) && !confirm(`A placa "${p}" está fora do padrão. Salvar mesmo assim?`)) return;
    const existentes = await veiculosDe(t.id);
    if (p && existentes.some(x => x.placa === p && x.id !== (v && v.id)) && !confirm(`A placa ${p} já foi registrada neste turno. Registrar de novo?`)) return;
    const tp = document.querySelector('input[name=tipo]:checked').value;
    const dados = { turnoId: t.id, placa: p, tipo: tp, pessoas: Math.max(0, parseInt($('#pessoas').value, 10) || 0), obs: $('#obs').value.trim(), excluido: 0 };
    if (v) { await Store.salvar('veiculos', { ...v, ...dados }); toast('Registro atualizado.'); Sync.sincronizar(); go('lista'); }
    else { await Store.salvar('veiculos', { ...dados, hora: agoraHM() }); toast(p ? `${p} registrado.` : 'Veículo registrado (sem placa).'); Sync.sincronizar(); go('registrar'); }
  };
}

/* ---------- Lista ---------- */
async function lista() {
  const t = await turnoAtual();
  if (!t) return novoTurno();
  const todos = (await veiculosDe(t.id)).reverse();
  view(`<div class="card"><label>Pesquisar placa<input id="q" autocapitalize="characters"></label></div><div id="itens"></div>`);
  const desenhar = () => {
    const q = $('#q').value.toUpperCase();
    const v = todos.filter(x => !q || x.placa.includes(q));
    $('#itens').innerHTML = v.length ? v.map(x => `
      <div class="item"><div class="topo"><div><div class="placa">${x.placa ? esc(x.placa) : '<small>sem placa</small>'}</div>
        <div class="tipo">${CONFIG.tipos[x.tipo] ? CONFIG.tipos[x.tipo].icone + ' ' + CONFIG.tipos[x.tipo].nome : esc(x.tipo)}</div></div>
        <div class="hora">${esc(x.hora)}</div></div>
        <div class="info"><b>Pessoas:</b> ${Number(x.pessoas) || 0}</div>
        ${x.obs ? `<div class="info"><b>Obs:</b> ${esc(x.obs)}</div>` : ''}
        ${x.pendente ? '<div class="info pend">⏳ aguardando envio</div>' : ''}
        <div class="botoes"><button class="editar" data-edit="${esc(x.id)}">Editar</button>
        ${Sync.pode('tf') ? `<button class="tfbtn" data-tfveic="${esc(x.id)}">Lavrar TF</button>` : ''}
        <button class="excluir" data-del="${esc(x.id)}">Excluir</button></div></div>`).join('')
      : '<div class="vazio">Nenhum veículo.</div>';
  };
  desenhar(); $('#q').oninput = desenhar;
}

/* ---------- Resumo / documentos ---------- */
async function resumo() {
  const t = await turnoAtual();
  if (!t) return novoTurno();
  const v = await veiculosDe(t.id);
  const por = contar(v);
  view(`<div class="card"><h3>${esc(t.numeroTF)} — total por tipo</h3>
    ${Object.entries(CONFIG.tipos).map(([c, x]) => `<div class="resumo-item"><span>${x.icone} ${x.nome}</span><strong>${por[c] || 0}</strong></div>`).join('')}
    <div class="total">TOTAL DE VEÍCULOS<br>${v.length}<small>${v.reduce((s, x) => s + (Number(x.pessoas) || 0), 0)} pessoas fiscalizadas</small></div></div>
    ${temFicha(t) ? `<button class="botao" data-doc="ficha" data-id="${t.id}">📝 Ficha de Campo (PDF)</button>` : ''}
    <button class="botao vermelho" id="encerrar">⏹ Encerrar turno</button>
    <p class="dica">Início do turno: ${esc(t.inicio)}. Ao encerrar, o horário final é registrado e o Termo de Fiscalização fica disponível.<br>Na janela de impressão, escolha “Salvar como PDF”.</p>`);
  $('#encerrar').onclick = async () => {
    const fim = agoraHM();
    if (!confirm(`Encerrar o turno agora (${fim})? Esta ação é definitiva: não será possível registrar novos veículos nem reabrir o turno.`)) return;
    const b = $('#encerrar'); b.disabled = true; b.textContent = 'Encerrando…';
    // Grava o encerramento NA HORA (antes do GPS): se o app for fechado ou o celular travar esperando a localização,
    // o turno já está encerrado e nada se perde. A coordenada final é acrescentada depois, quando o GPS responder.
    const f = await Store.salvar('turnos', { ...t, encerrado: 1, fim });
    await Store.setMeta('turnoAtual', '');
    go('fechado', f.id);
    const gps = await pegarLocal();
    if (gps) { const atual = await Store.obter('turnos', f.id); if (atual) await Store.salvar('turnos', { ...atual, ...camposLocal(gps, 'Fim') }); }
    else toast('Turno encerrado sem coordenadas (GPS indisponível ou permissão negada).', true);
    Sync.sincronizar();
  };
}
async function fechado() {
  const t = await Store.obter('turnos', EDIT);
  if (!t) return go('home');
  const v = await veiculosDe(t.id);
  view(`<div class="card"><h3>Turno encerrado</h3><p><b>${esc(t.numeroTF)}</b></p>
    <p>${dBR(t.data)} · das <b>${esc(t.inicio)}</b> às <b>${esc(t.fim)}</b></p>
    <p>${v.length} veículos · ${v.reduce((s, x) => s + (Number(x.pessoas) || 0), 0)} pessoas</p>
    ${t.pendente ? `<p class="pend" id="encPend">⏳ Encerramento ainda não enviado à planilha${avisoEnvio()}. Enquanto não chegar, a gerência vê esta barreira como em andamento.</p>` : '<p id="encPend"><small>✅ Encerramento enviado à planilha.</small></p>'}</div>
    <button class="botao" data-doc="termo" data-id="${t.id}">📄 Termo de Fiscalização (PDF)</button>
    ${temFicha(t) ? `<button class="botao" data-doc="ficha" data-id="${t.id}">📝 Ficha de Campo (PDF)</button>` : ''}
    <button class="botao" data-go="home">➕ Iniciar novo turno</button>
    <p class="dica">Os documentos deste turno também ficam no Histórico.</p>`);
}
/** Complemento dos avisos de pendência: no Android (Background Sync) o envio acontece sozinho; no iPhone, só com o app aberto. */
const avisoEnvio = () => Sync.envioAutomatico() ? ' — será enviado automaticamente quando houver internet, mesmo com o app fechado'
  : ' — abra o app com internet para enviar (e mantenha-o aberto até aparecer “Sincronizado”)';
const contar = v => v.reduce((o, x) => (o[x.tipo] = (o[x.tipo] || 0) + 1, o), {});

/* ---------- Histórico / dashboard ---------- */
async function historico() {
  const fim = hojeISO(), d = new Date(); d.setDate(d.getDate() - 30);
  const ini = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  view(`<div class="card"><div class="duas"><label>De<input type="date" id="hDe" value="${ini}"></label>
    <label>Até<input type="date" id="hAte" value="${fim}"></label></div></div><div id="hOut"></div>`);
  const desenhar = async () => {
    const de = $('#hDe').value, ate = $('#hAte').value;
    const turnos = (await Store.todos('turnos')).filter(t => (!de || t.data >= de) && (!ate || t.data <= ate))
      .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm);
    const ids = new Set(turnos.map(t => t.id));
    const veic = (await Store.todos('veiculos')).filter(v => ids.has(v.turnoId) && !v.excluido);
    const pessoas = veic.reduce((s, x) => s + (Number(x.pessoas) || 0), 0);
    const dataDe = Object.fromEntries(turnos.map(t => [t.id, t.data]));
    const porTipo = contar(veic), porDia = {}, porTurno = {};
    veic.forEach(v => { porDia[dataDe[v.turnoId]] = (porDia[dataDe[v.turnoId]] || 0) + 1; porTurno[v.turnoId] = (porTurno[v.turnoId] || 0) + 1; });
    $('#hOut').innerHTML = `
      <div class="kpis"><div class="card kpi"><b>${turnos.length}</b><span>turnos</span></div>
        <div class="card kpi"><b>${veic.length}</b><span>veículos</span></div>
        <div class="card kpi"><b>${pessoas}</b><span>pessoas</span></div>
        <div class="card kpi"><b>${turnos.length ? (veic.length / turnos.length).toFixed(1).replace('.', ',') : 0}</b><span>veíc./turno</span></div></div>
      <div class="card"><h3>Veículos por tipo</h3>${barras(Object.entries(CONFIG.tipos).map(([c, x]) => [x.icone + ' ' + x.nome, porTipo[c] || 0]))}</div>
      <div class="card"><h3>Veículos por dia</h3>${barras(Object.entries(porDia).sort().map(([k, n]) => [dBR(k).slice(0, 5), n]))}</div>
      <div class="card"><h3>Turnos</h3>${turnos.length ? turnos.map(t => `
        <div class="turno-linha"><div><b>${esc(t.numeroTF)}</b><br><small>${dBR(t.data)} · ${esc(t.inicio)}${t.fim ? '–' + esc(t.fim) : ''} · ${esc(t.fiscal)} · ${porTurno[t.id] || 0} veíc.${t.encerrado ? '' : ' · em andamento'}${t.encerradoPor ? ' · encerrado pela gerência' : ''}${t.pendente ? ' · ⏳ aguardando envio' : ''}</small></div>
        <div>${t.encerrado ? `<button class="mini" data-doc="termo" data-id="${t.id}">Termo</button>` : ''}${temFicha(t) ? `<button class="mini" data-doc="ficha" data-id="${t.id}">Ficha</button>` : ''}</div></div>`).join('') : '<div class="vazio">Sem turnos no período.</div>'}</div>
      <button class="botao vermelho" id="limpar">🗑 Limpar histórico deste aparelho</button>
      <p class="dica">Remove só os turnos já encerrados <b>deste celular</b>. Os dados continuam salvos na planilha.</p>`;
    $('#limpar').onclick = limparHistorico;
  };
  $('#hDe').onchange = $('#hAte').onchange = desenhar;
  desenhar();
}
async function limparHistorico() {
  const atual = await Store.meta('turnoAtual');
  const turnos = (await Store.todos('turnos')).filter(t => t.encerrado && t.id !== atual);
  const ids = new Set(turnos.map(t => t.id));
  const veic = (await Store.todos('veiculos')).filter(v => ids.has(v.turnoId));
  if (!turnos.length) return toast('Não há histórico para limpar.');
  const pend = turnos.filter(t => t.pendente).length + veic.filter(v => v.pendente).length;
  if (pend) return toast(`${pend} registro(s) ainda não foram enviados à planilha. Conecte-se à internet e aguarde a sincronização antes de limpar.`, true);
  if (!confirm(`Limpar o histórico deste aparelho?\n\n${turnos.length} turno(s) e ${veic.length} veículo(s) serão removidos DESTE celular.\nOs dados continuam salvos na planilha. O turno em andamento não é afetado.`)) return;
  await Store.apagar('turnos', turnos.map(t => t.id));
  await Store.apagar('veiculos', veic.map(v => v.id));
  toast('Histórico limpo.'); historico();
}
function barras(pares) {
  const max = Math.max(1, ...pares.map(p => p[1]));
  return pares.length ? pares.map(([r, n]) => `<div class="barra"><span class="rot">${esc(r)}</span>
    <span class="trilho"><i style="width:${(n / max) * 100}%"></i></span><b>${n}</b></div>`).join('') : '<div class="vazio">Sem dados.</div>';
}

/* ---------- Status da sincronização ---------- */
async function config() {
  const ult = await Store.meta('ultimaSync');
  view(`${avisoAtivacao()}<div class="card"><h3>Sincronização</h3>
    <p>Aparelho: ${Sync.ativado() ? '✅ ativado' : '⚠️ não ativado'}</p>
    ${Sync.nome() ? `<p>Fiscal vinculado: <b>${esc(Sync.nome())}</b></p>` : ''}<p id="cEst"></p>
    <p>Última sincronização: ${ult ? new Date(ult).toLocaleString('pt-BR') : 'nunca'}</p>
    <p class="dica">A sincronização é automática (a cada minuto, quando há internet). Para forçar agora, toque no selo no topo da tela.</p>
    ${Sync.ativado() ? '<button class="botao sec" id="desativar">Desativar este aparelho / trocar de fiscal</button>' : ''}</div>`);
  const e = Sync.estado();
  $('#cEst').textContent = (navigator.onLine ? 'Online' : 'Offline') + ' · pendentes de envio: ' + (e.pend || 0) + (e.pend ? avisoEnvio() : '') + (e.tipo === 'erro' ? ' · erro: ' + e.msg : '');
  if ($('#desativar')) $('#desativar').onclick = () => {
    if (!confirm('Desativar este aparelho? Registros ainda não enviados ficam guardados aqui e só serão enviados após uma nova ativação.')) return;
    Sync.desativar(); toast('Aparelho desativado.'); config();
  };
}

document.addEventListener('submit', async e => {            // ativação por código (formulário aparece quando o aparelho não está ativado)
  if (e.target.id !== 'fAtivar') return;
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Ativando…';
  try {
    const nome = await Sync.ativar($('#aCod').value, $('#aUrl') ? $('#aUrl').value : '');
    toast(`Aparelho ativado para ${nome}.`); Sync.sincronizar(); go(VIEW === 'editar' ? 'home' : VIEW);
  } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Ativar'; }
});

/* ---------- eventos globais ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-v],[data-go],[data-edit],[data-del],[data-doc],[data-instalar],[data-tfveic],[data-bloq],[data-avisook]');
  if (!el) return;
  const d = el.dataset;
  if (d.avisook) { try { localStorage.removeItem(LS_AVISO_ENC); } catch (e2) { /* idem */ } const a = $('#avisoEncerrado'); if (a) a.remove(); }
  else if (d.bloq) toast(`${SEM_AUT}: ${Sync.MODULOS[d.bloq] || d.bloq}.`, true);
  else if (d.instalar) acaoInstalar(d.instalar);
  else if (d.tfveic) go('tfnovo', { veiculoId: d.tfveic });
  else if (d.v) go(d.v);
  else if (d.go) go(d.go);
  else if (d.edit) go('editar', d.edit);
  else if (d.del) {
    if (!confirm('Excluir este registro?')) return;
    const v = await Store.obter('veiculos', d.del);
    await Store.salvar('veiculos', { ...v, excluido: 1 });
    Sync.sincronizar(); toast('Excluído.'); lista();
  } else if (d.doc) {
    try {
      await Docs[d.doc](d.id);
    } catch (err) { toast('Erro ao gerar documento: ' + err.message, true); }
  }
});

Sync.onEstado(e => {
  const b = $('#sync');
  const pend = e.pend ? ` · ${e.pend} a enviar` : '';
  b.textContent = (e.tipo === 'sync' ? '🔄 Sincronizando…' : e.tipo === 'erro' ? '⚠️ Falha ao sincronizar' : (navigator.onLine ? '🟢 Online' : '🔴 Offline')) + (e.tipo === 'sync' ? '' : pend);
});
window.addEventListener('gdv-dados', () => { if (['modulos', 'home', 'lista', 'resumo', 'historico', 'tf', 'pce', 'pcetermos', 'fechado'].includes(VIEW)) go(VIEW, EDIT); });
// permissões mudaram no sync: se a tela aberta é de um módulo que deixou de ser autorizado, volta para os módulos (nada é apagado);
// na tela de módulos (ou em telas livres) só redesenha
window.addEventListener('gdv-permissoes', () => {
  if (semPermissaoPara(VIEW)) go(VIEW);                                   // go() avisa e leva para a tela de módulos
  else if (VIEW === 'modulos') go('modulos');
  else if (['home', 'lista', 'pce', 'pcetermos', 'pcepronto'].includes(VIEW)) go(VIEW, EDIT);   // botões "Lavrar TF" / "do papel" aparecem/somem
});
window.addEventListener('online', () => Sync.atualizarContagem());

$('#sync').onclick = () => Sync.sincronizar();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const verificar = () => reg.update().catch(() => {});                    // procura versão nova
    document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar(); });
    setInterval(verificar, 30 * 60 * 1000);
  }).catch(() => {});
  let tinhaControlador = !!navigator.serviceWorker.controller;               // na 1ª instalação não avisa
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaControlador) $('#atualizar').hidden = false;
    tinhaControlador = true;
  });
  $('#btnAtualizar').onclick = () => location.reload();
}
(async () => {
  await Sync.prepararFundo();                                               // envio em segundo plano (credencial para o service worker)
  await Sync.carregarPermissoes();                                          // última permissão conhecida (sem internet também)
  go('modulos');
  await Sync.atualizarContagem();
  Sync.iniciar();
})();
