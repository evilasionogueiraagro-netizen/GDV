const $ = s => document.querySelector(s);
const esc = Docs.esc;
const dBR = iso => (iso || '').split('-').reverse().join('/');
const pad = (n, l = 2) => String(n).padStart(l, '0');
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const agoraHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

let VIEW = 'home', EDIT = null;
/* Cada go() abre uma nova "geração" de tela. Telas que esperam o banco (await) antes de desenhar pegam a geração no início
   (tela()) e só desenham se ninguém navegou nesse meio-tempo: senão a sincronização que termina junto com um toque
   redesenhava a tela antiga (ex.: módulos) por cima da nova. */
let GER = 0;
const tela = () => { const g = GER; const f = html => { if (g === GER) view(html); }; f.viva = () => g === GER; return f; };

function toast(t, erro) {
  const m = $('#toast'); m.textContent = t; m.className = erro ? 'erro on' : 'on';
  clearTimeout(toast.t); toast.t = setTimeout(() => m.className = '', 3500);
}

async function turnoAtual() {
  const id = await Store.meta('turnoAtual');
  const t = id ? await Store.obter('turnos', id) : null;
  if (t && !t.encerrado) return t;
  // sem turno neste aparelho: o turno aberto com o mesmo login em outro aparelho (o PC e o celular da BVA) é o turno deste também
  const [outro] = await turnosAbertosOutros();
  if (!outro) return null;
  await Store.setMeta('turnoAtual', outro.id);
  return outro;
}
async function veiculosDe(turnoId) {
  return Docs.ordenar((await Store.todos('veiculos')).filter(v => v.turnoId === turnoId && !v.excluido));
}

/* ---------- localização (GPS funciona sem internet) ---------- */
/* Localização. O pedido de permissão do celular só deve aparecer quando o fiscal faz algo que precisa dela
   (entrar, iniciar/encerrar turno, posto volante, botão "Atualizar GPS"). Leituras automáticas
   (TF em preenchimento, GPS ao abrir o levantamento) usam pegarLocalSilencioso, que nunca abre o pedido. */
let ultimaLocal = null;                                         // reaproveita uma leitura recente (evita pedidos seguidos)
function pegarLocal() {
  if (ultimaLocal && Date.now() - ultimaLocal.em < 2 * 60 * 1000) return Promise.resolve(ultimaLocal.g);
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      p => { const g = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy) };
        ultimaLocal = { g, em: Date.now() }; ok(g); },
      () => ok(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}
async function permissaoLocal() {
  try { return navigator.permissions ? (await navigator.permissions.query({ name: 'geolocation' })).state : 'desconhecido'; }
  catch (e) { return 'desconhecido'; }
}
/** Só lê o GPS se a permissão já foi dada; nunca mostra o pedido ao fiscal. */
async function pegarLocalSilencioso() {
  if (ultimaLocal && Date.now() - ultimaLocal.em < 2 * 60 * 1000) return ultimaLocal.g;
  return (await permissaoLocal()) === 'granted' ? pegarLocal() : null;
}
/** Endereço aproximado da coordenada (OpenStreetMap/Nominatim). Sem internet ou em erro: ''. */
async function enderecoDe(g) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=${g.lat}&lon=${g.lng}`, { signal: ctrl.signal });
    const a = (await r.json()).address || {};
    const via = a.road || a.pedestrian || a.path || '', bairro = a.suburb || a.neighbourhood || a.village || a.hamlet || '';
    const cidade = a.city || a.town || a.municipality || a.county || '';
    return { texto: [via, bairro, cidade && cidade + (a['ISO3166-2-lvl4'] ? '/' + a['ISO3166-2-lvl4'].split('-')[1] : '')].filter(Boolean).join(' – '), cidade };
  } catch (e) { return { texto: '', cidade: '' }; } finally { clearTimeout(t); }
}
const camposLocal = (g, sufixo) => g ? { ['lat' + sufixo]: g.lat, ['lng' + sufixo]: g.lng, ['prec' + sufixo]: g.prec } : {};

/** A Ficha de Campo só existe nas BVAs marcadas com ficha: true (hoje só a CEASA); nas demais e no volante, só o Termo.
 *  Turno antigo com local digitado à mão (antes da lista de BVAs): ficha só se o local for a CEASA. */
const temFicha = t => { const b = CONFIG.bvas.find(x => x.nome === t.local); return b ? !!b.ficha : /ceasa/i.test(t.local || ''); };
/** Turno que não conta veículos (soPessoas = 1, ex.: volante de Tabatinga): conta só as pessoas orientadas (turno.pessoasEducacao). */
const soPessoas = t => !!(t && Number(t.soPessoas) === 1);
/** Turno compartilhado: o turno é de outro login (o colega entrou pelo código do dono). Só o dono encerra; o colega sai. */
const souColega = t => !!(t && t.usuario && Sync.nome() && t.usuario !== Sync.nome());
const botaoFim = t => souColega(t) ? `<button class="botao vermelho" id="encerrar">${icone('voltar')} Sair do turno</button>`
  : `<button class="botao vermelho" id="encerrar">${icone('parar')} Encerrar turno</button>`;
const cfgSoPessoas = unidade => ((CONFIG.volantesSoPessoas || {})[String(unidade || '').trim().toUpperCase()]) || null;
const pessoasDoTurno = (t, v) => (v || []).reduce((s, x) => s + (Number(x.pessoas) || 0), 0) + (Number(t && t.pessoasEducacao) || 0);
/* ---------- módulos e navegação ---------- */
// Depois de instalar o app e entrar (matrícula e senha), o fiscal escolhe um módulo: Educação Sanitária/Fiscalização de Trânsito (turnos e veículos), TF ou PCE.
// Dentro da Educação Sanitária/Fiscalização de Trânsito o TF também está embutido (botão "Lavrar TF"); o menu de baixo muda conforme o módulo.
let MODULO = 'hub';
const NAVS = {
  hub: [['modulos', 'inicio', 'Módulos'], ['config', 'status', 'Status']],
  veiculos: [['modulos', 'inicio', 'Módulos'], ['home', 'caminhao-bau', 'Turno'], ['registrar', 'mais', 'Registrar'], ['lista', 'lista', 'Lista'], ['resumo', 'resumo', 'Resumo'], ['historico', 'historico', 'Histórico']],
  tf: [['modulos', 'inicio', 'Módulos'], ['tf', 'documento', 'Meus TFs'], ['tfnovo', 'mais', 'Novo TF']],
  pce: [['modulos', 'inicio', 'Módulos'], ['pce', 'broto', 'Levantamentos'], ['pcelev', 'mais', 'Novo levantamento'], ['pcemapa', 'mapa', 'Perto de mim'], ['pcetermos', 'amostra', 'Termos de colheita'], ['pcetermo', 'formulario', 'Novo termo']]
};
const VIEWS_VEICULOS = ['home', 'registrar', 'editar', 'lista', 'resumo', 'fechado', 'historico', 'turnopapel'];
/** Módulo (permissão) de cada tela: veiculos, tf ou pce; '' = livre (módulos, status). */
const moduloDaView = v => VIEWS_VEICULOS.includes(v) ? 'veiculos' : /^tf/.test(v) ? 'tf' : /^pce/.test(v) ? 'pce' : '';
const SEM_AUT = 'Sem autorização — fale com a gerência';
const MODS_LIBERADOS = () => ['veiculos', 'tf', 'pce'].some(m => Sync.pode(m));
/** A gerência tirou o módulo (painel → Servidores): a tela não abre e volta para a tela de módulos. Os dados do aparelho ficam guardados. */
function semPermissaoPara(view) {
  const m = moduloDaView(view);
  if (m && !Sync.pode(m)) return m;
  if (MODULO === 'veiculos' && m === 'tf' && view !== 'tf' && !Sync.pode('veiculos')) return 'veiculos';   // TF embutido na Educação Sanitária/Fiscalização de Trânsito
  return '';
}
function renderNav(view) {
  const ativo = ({ editar: 'lista', fechado: 'home', tfpronto: MODULO === 'tf' ? 'tf' : 'lista', tfnovo: MODULO === 'tf' ? 'tfnovo' : 'lista',
    pcepronto: 'pcetermos', pcelevpronto: 'pce', pceservidor: 'pce', pcecampo: 'pce', pcerota: 'pcemapa',
    pcecads: 'pce', pcecad: 'pce', pcecadpronto: 'pce', pcetfs: 'pce', pcetf: 'pce', pcetfpronto: 'pce', pcerel: 'pce' })[view] || view;
  $('#nav').innerHTML = NAVS[MODULO].map(([v, i, t]) => `<button data-v="${v}" class="${v === ativo ? 'on' : ''}">${icone(i)}<span>${t}</span></button>`).join('');
}
function go(view, arg) {
  if (VIEW === 'fechado' && view !== 'fechado' && EDIT) avisarSaidaPendente(EDIT);   // aviso não bloqueante: encerramento ainda não chegou
  const bloq = semPermissaoPara(view);
  if (bloq) { toast(`${SEM_AUT}: ${Sync.MODULOS[bloq]}.`, true); view = 'modulos'; arg = null; }
  if (VIEW === 'tfnovo' && view !== 'tfnovo' && typeof TFUI !== 'undefined') TFUI.saiu();   // saiu do formulário de TF sem gerar
  VIEW = view; EDIT = arg || null;
  if (view === 'modulos' || view === 'config') MODULO = 'hub';
  else if (view === 'tf') MODULO = 'tf';
  else if (VIEWS_VEICULOS.includes(view)) MODULO = 'veiculos';
  else if (/^pce/.test(view)) MODULO = 'pce';
  else if (/^tf/.test(view) && MODULO === 'hub') MODULO = 'tf';          // TF aberto a partir do veículo continua no módulo de veículos (embutido)
  renderNav(view); GER++;
  ({ modulos, home, registrar, editar: registrar, lista, resumo, fechado, historico, config, turnopapel, tf: () => TFUI.lista(), tfnovo: () => TFUI.novo(EDIT), tfpronto: () => TFUI.pronto(EDIT),
    pce: () => PCEUI.lista(), pcelev: () => PCEUI.levantamento(EDIT), pcetermos: () => PCEUI.termos(), pcetermo: () => PCEUI.termo(EDIT),
    pcepronto: () => PCEUI.pronto(EDIT), pcelevpronto: () => PCEUI.levPronto(EDIT), pceservidor: () => PCEUI.servidor(EDIT),
    pcecampo: () => Campo.telaBaixar(), pcemapa: () => Campo.telaMapa(), pcerota: () => Campo.telaRota(),
    // PCE monilíase: Cadastro de imóvel, Termo de Fiscalização do PCE e Relatório de atividades (moniliase.js)
    pcecads: () => PCEMon.lista('cadastro'), pcecad: () => PCEMon.cadastro(EDIT), pcecadpronto: () => PCEMon.pronto('cadastro', EDIT),
    pcetfs: () => PCEMon.lista('termo'), pcetf: () => PCEMon.termo(EDIT), pcetfpronto: () => PCEMon.pronto('termo', EDIT), pcerel: () => PCEMon.relatorio() }[view])();
  window.scrollTo(0, 0);
}

async function modulos() {
  if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());      // 1º instalar, 2º entrar, 3º módulos
  const mostrar = tela();
  const t = await turnoAtual(), v = t ? await veiculosDe(t.id) : [];
  const tfs = await Store.todos('tfs'), pend = tfs.filter(x => x.pendente).length, nome = Sync.nome().split(' ')[0];
  const stPce = await PCEUI.status();
  // módulo sem autorização some do menu (os registros já feitos continuam guardados no aparelho; o aviso abaixo lembra se houver pendentes)
  const cartao = (mod, v, ic, titulo, linhas) => Sync.pode(mod)
    ? `<button class="modulo" data-v="${v}"><span class="ic">${icone(ic)}</span><span><b>${titulo}</b>${linhas}</span></button>` : '';
  const aviso = (Sync.estado() || {}).aviso || Sync.avisoSemPermissao(await Sync.bloqueadosComPendentes());
  const encPend = await cartaoEncerramento();                       // turno encerrado aqui que ainda não chegou à planilha: no topo
  mostrar(`${encPend}<div class="card"><h3>Olá${nome ? ', ' + esc(nome) : ''}!</h3><p class="dica" style="text-align:left">Escolha o que deseja fazer.</p></div>
    ${aviso ? `<div class="card aviso" id="avisoPerm">${icone('alerta')} ${esc(aviso)}</div>` : ''}
    ${avisoTurnoEncerrado()}
    ${MODS_LIBERADOS() ? '' : '<div class="card aviso" id="semModulos"><h3>Nenhum módulo liberado</h3><p>O seu acesso não libera nenhum módulo do app de campo. Fale com a gerência. Os registros que estão neste aparelho continuam guardados.</p></div>'}
    <div class="modulos">${cartao('veiculos', 'home', 'caminhao-bau', 'Educação Sanitária/Fiscalização de Trânsito', `<small>${t ? `Turno em andamento · ${v.length} veículo(s) registrado(s)` : 'Registro das informações, por ação'}</small>`)}
    ${cartao('tf', 'tf', 'documento', 'Termo de Fiscalização de Barreira', `<small>${tfs.length} TF(s) neste aparelho${pend ? ` · ${icone('pendente')} ${pend} aguardando envio` : ''}</small>`)}
    ${cartao('pce', 'pce', 'broto', 'PCE', `<small>Programa de Controle e Erradicação — levantamento fitossanitário e Termo de Colheita de Amostras</small><small class="pce-status">${esc(stPce)}</small>`)}</div>
    ${Sync.pode('veiculos') && Sync.pode('tf') ? '<p class="dica">Dentro da Educação Sanitária/Fiscalização de Trânsito também dá para lavrar o TF de um veículo (botão “Lavrar TF”).</p>' : ''}
    <a class="botao sec" href="manual.html">${icone('manual')} Manual do fiscal</a>`);
}
const view = html => { $('#view').innerHTML = bannerInstalar() + html; };

/* ---------- instalação: Adicionar à tela inicial (iOS / Android) ---------- */
// Ordem em celulares: 1) instalar na tela inicial → 2) entrar com matrícula e senha → 3) iniciar turno.
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
    return `<div id="bInstalar" class="card instalar"><h3>${icone('ok')} App instalado</h3>
      <p>Agora <b>feche esta página</b> e abra o app pelo <b>ícone</b> na ${ehIOS ? 'Tela de Início' : 'tela inicial'}. Ele vai pedir a matrícula e a senha e, em seguida, liberar o início do turno.</p>${saida}</div>`;
  }
  const passos = ehIOS
    ? [`Toque no botão <b>Compartilhar</b> (quadrado com seta para cima ${icone('compartilhar')}): fica na barra de baixo do Safari (no Chrome, no topo, ao lado do endereço).`,
       'Role a lista e toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>.',
       'Abra o app pelo <b>ícone</b> na Tela de Início.']
    : ['Toque no menu <b>⋮</b> do navegador (canto superior direito).', 'Toque em <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).',
       'Confirme em <b>Instalar</b> / <b>Adicionar</b>.', 'Abra o app pelo <b>ícone</b> na tela inicial.'];
  return `<div id="bInstalar" class="card instalar"><h3>${icone('celular')} Passo 1: instale o app</h3>
    <p>Instale na tela inicial para abrir como aplicativo e funcionar mesmo sem internet. Depois de instalar, abra pelo ícone: o app pede a <b>matrícula e a senha</b> e só então libera o <b>início do turno</b>.</p>
    <ol>${passos.map(p => `<li>${p}</li>`).join('')}</ol>
    ${eventoInstalar ? '<button class="botao" data-instalar="agora">Instalar agora</button>' : ''}
    ${ehIOS ? '<p class="dica" style="text-align:left">No iPhone o app instalado guarda os dados separados do Safari; por isso a entrada é feita depois, dentro do app instalado.' + (Sync.ativado() ? ' Este aparelho já estava com acesso no navegador: no app instalado será preciso entrar de novo.' : '') + '</p>' : ''}
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
const encerradoAuto = por => /^Automático/.test(String(por || ''));   // encerramento automático da planilha (turno aberto há mais de 12 h)
function textoTurnoEncerrado(a) {
  const hora = a.fim ? `, às ${a.fim}` : '';
  if (encerradoAuto(a.encerradoPor)) return `Este turno foi encerrado automaticamente após 12\u00a0h${hora}. Os documentos estão no Histórico.`;
  return a.encerradoPor ? `Este turno foi encerrado pela gerência${hora.replace(',', '')}. Os documentos estão no Histórico.`
    : `Este turno foi encerrado fora deste aparelho${hora.replace(',', '')}. Os documentos estão no Histórico.`;
}
function avisoTurnoEncerrado() {
  let a = null; try { a = JSON.parse(lsGet(LS_AVISO_ENC) || 'null'); } catch (e) { a = null; }
  if (!a || !a.id) return '';
  return `<div class="card aviso" id="avisoEncerrado" role="alert"><h3>${icone('parar')} Turno encerrado</h3><p>${esc(textoTurnoEncerrado(a))}</p>
    ${a.numeroTF || a.encerradoPor ? `<p><small>${esc([a.numeroTF, a.encerradoPor && !encerradoAuto(a.encerradoPor) && 'encerrado por ' + a.encerradoPor].filter(Boolean).join(' · '))}</small></p>` : ''}
    <div class="duas"><button class="botao sec" data-go="historico">${icone('historico')} Abrir o Histórico</button><button class="botao sec" data-avisook="1">Entendi</button></div></div>`;
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
  const sit = Sync.situacao();
  if (sit === 'ok') return '';
  if (sit === 'entrar' && precisaInstalar()) return '';   // passo 1 ainda pendente: só as instruções de instalação aparecem
  return Login.tela();                                     // Entrar (matrícula e senha) ou Trocar senha: login.js
};
async function home() {
  const mostrar = tela();
  const t = await turnoAtual();
  if (!mostrar.viva()) return;
  if (!t) return novoTurno();
  const v = await veiculosDe(t.id);
  if (soPessoas(t)) return homePessoas(t, mostrar);
  mostrar(`${avisoAtivacao()}
    <div class="card"><h3>Turno atual</h3>
      <p><b>${esc(t.numeroTF)}</b> ${botaoNumero(t)}</p>
      <p><b>Fiscal:</b> ${esc(Docs.fiscaisDoTurno(t))}</p><p><b>Local:</b> ${esc(t.local)}</p>
      <p><b>Data:</b> ${dBR(t.data)} &nbsp; <b>Posto:</b> ${esc(t.posto || '')}</p>
      <p><b>Início do turno:</b> ${esc(t.inicio)}</p>
      <p><small>${Number(t.semPlaca) ? 'Placa do veículo opcional neste turno.' : 'Placa do veículo obrigatória neste turno.'}</small></p>
      ${souColega(t) ? `<p class="dica">Turno de <b>${esc(t.usuario)}</b>: você está colaborando com o seu login. Os veículos e TFs que você lançar entram neste turno; só quem abriu encerra.</p>` : ''}</div>
    <div id="conviteBox"></div>
    <div class="card contador"><h1>${v.length}</h1><p>Veículos registrados</p></div>
    <button class="botao" data-go="registrar">${icone('mais')} Registrar veículo</button>
    <button class="botao" data-go="lista">${icone('lista')} Lista de veículos</button>
    <button class="botao" data-go="resumo">${icone('resumo')} Resumo e documentos</button>
    ${souColega(t) ? '' : `<button class="botao sec" id="convidar">${icone('pessoa')} Convidar colega para este turno</button>`}
    ${botaoFim(t)}`);
  $('#encerrar').onclick = () => encerrarTurno(t);
  if ($('#convidar')) $('#convidar').onclick = () => convidarColega(t);
}
/** Dono do turno: código de 6 números (15 min) para um colega entrar com o próprio login. Precisa de internet. */
async function convidarColega(t) {
  if (!navigator.onLine) return toast('Sem internet: o convite precisa de conexão (nos dois aparelhos).', true);
  const b = $('#convidar'); b.disabled = true; b.textContent = 'Gerando o código…';
  try {
    await Sync.sincronizar();                                    // o turno precisa estar no servidor
    const r = await Sync.convidarColega(t.id);
    const box = $('#conviteBox'); if (!box) return;
    const hora = new Date(r.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `<div class="card aviso" id="convite"><h3>${icone('pessoa')} Convite para o colega</h3>
      <div class="codigo-par" aria-label="Código ${esc(r.codigo.split('').join(' '))}">${esc(r.codigo.slice(0, 3))} ${esc(r.codigo.slice(3))}</div>
      <p>Vale até <b>${esc(hora)}</b> e para uma pessoa. No app do colega, com o login dele: <b>Turno → Entrar no turno de um colega</b> e digite o código.</p>
      <p class="dica">Ele passa a lançar veículos e TFs neste turno e o nome dele entra no Termo. Para mais de um colega, gere um código para cada.</p></div>`;
  } catch (e) { toast(e.message || 'Não foi possível gerar o código.', true); }
  finally { const b2 = $('#convidar'); if (b2) { b2.disabled = false; b2.innerHTML = `${icone('pessoa')} Convidar outro colega`; } }
}
/** Colega: sai do turno compartilhado (o que lançou continua no turno). Sem internet, sai só deste aparelho. */
async function sairDoTurno(t) {
  if (!confirm(`Sair do turno de ${t.usuario}?\n\nO que você lançou continua no turno. Para voltar, peça um código novo.`)) return;
  await Store.setMeta('turnoAtual', '');
  Sync.sincronizar().catch(() => {}).then(() => Sync.sairDoTurno(t.id)).catch(() => {});   // pendentes sobem; o servidor registra a saída
  toast('Você saiu do turno do colega.'); go('home');
}
/** Colega: entra no turno do dono com o código. */
async function entrarComCodigo(codigo) {
  if (!navigator.onLine) return toast('Sem internet: para entrar no turno do colega é preciso conexão.', true);
  const b = $('#fParear button[type=submit]'); if (b) { b.disabled = true; b.textContent = 'Entrando…'; }
  try {
    const r = await Sync.parearTurno(codigo);
    await Store.setMeta('turnoAtual', r.turno.id);
    try { localStorage.removeItem(LS_AVISO_ENC); } catch (e) { /* sem armazenamento */ }
    toast(`Você entrou no turno de ${r.dono}.`); Sync.sincronizar(); go('home');
  } catch (e) { toast(e.message || 'Não foi possível entrar no turno.', true); const b2 = $('#fParear button[type=submit]'); if (b2) { b2.disabled = false; b2.innerHTML = `${icone('pessoa')} Entrar no turno`; } }
}
/** Turno de BVA sem contagem de veículos: contador de pessoas orientadas (educação sanitária), gravado no turno. */
function homePessoas(t, mostrar) {
  const n = Number(t.pessoasEducacao) || 0, tema = (cfgSoPessoas(t.unidade) || {}).tema;
  mostrar(`${avisoAtivacao()}
    <div class="card"><h3>Turno atual</h3>
      <p><b>${esc(t.numeroTF)}</b></p>
      <p><b>Fiscal:</b> ${esc(t.fiscal)}</p><p><b>Local:</b> ${esc(t.local)}</p>
      <p><b>Data:</b> ${dBR(t.data)} &nbsp; <b>Posto:</b> ${esc(t.posto || '')}</p>
      <p><b>Início do turno:</b> ${esc(t.inicio)}</p>
      <p><small>Neste turno não se contam veículos: conte as pessoas orientadas${tema ? ' sobre a ' + esc(tema) : ''}.</small></p></div>
    <div class="card contador" id="pesCont"><h1>${n}</h1><p>Pessoas orientadas (educação sanitária)</p></div>
    <div class="duas pes-botoes"><button class="botao" data-pes="1">+1 pessoa</button><button class="botao" data-pes="5">+5</button></div>
    <div class="duas pes-botoes"><button class="botao sec" data-pes="10">+10</button><button class="botao sec" data-pes="corrigir">${icone('editar')} Corrigir total</button></div>
    ${botaoFim(t)}`);
  document.querySelectorAll('[data-pes]').forEach(b => b.onclick = async () => {
    const atual = (await Store.obter('turnos', t.id)) || t; let total = Number(atual.pessoasEducacao) || 0;
    if (b.dataset.pes === 'corrigir') {
      const r = prompt('Total de pessoas orientadas neste turno:', String(total)); if (r == null) return;
      const x = parseInt(r, 10); if (!(x >= 0) || x > 100000) return toast('Informe um número inteiro (0 ou mais).', true);
      total = x;
    } else total += Number(b.dataset.pes);
    const s = await Store.salvar('turnos', { ...atual, pessoasEducacao: total });
    $('#pesCont h1').textContent = total; toast(`${total} pessoa(s) orientada(s).`); Sync.sincronizar(); t = s;
  });
  $('#encerrar').onclick = () => encerrarTurno(t);
}
/* ---------- corrigir o nº do TF do turno (onde a gerência liberou: CONFIG.turnoNumeroEditavel) ---------- */
const nlLocal = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const numeroEditavel = t => !!t && (CONFIG.turnoNumeroEditavel || []).some(r => nlLocal(r.local) === nlLocal(t.local) && String(t.data) >= r.desde);
const botaoNumero = t => numeroEditavel(t) ? `<button class="mini" type="button" data-numturno="${esc(t.id)}">${icone('editar')} Corrigir nº</button>` : '';
async function corrigirNumero(id) {
  const t = await Store.obter('turnos', id); if (!t) return;
  if (!navigator.onLine) return toast('Sem internet: a correção do nº precisa de conexão.', true);
  const atual = (/^TF-(\d+)-/.exec(t.numeroTF || '') || [])[1] || '';
  const r = prompt(`Nº correto do Termo de Fiscalização de ${t.numeroTF} (${dBR(t.data)}):`, String(Number(atual) || '')); if (r == null) return;
  const n = parseInt(String(r).replace(/\D/g, ''), 10); if (!(n >= 1)) return toast('Digite só o número do Termo (ex.: 12).', true);
  try {
    await Sync.sincronizar();                                                   // o turno precisa estar no servidor
    const res = await Sync.corrigirNumeroTurno(id, n);
    const t2 = (await Store.obter('turnos', id)) || t;
    await Store.gravar('turnos', { ...t2, numeroTF: res.turno.numeroTF, letra: res.turno.letra });
    toast(res.igual ? 'O nº já era esse.' : `Nº corrigido: ${res.turno.numeroTF}.`); go(VIEW, EDIT);
  } catch (e) { toast(e.message || 'Não foi possível corrigir o nº.', true); }
}

/* ---------- turno aberto em outro aparelho (o PC e o celular da BVA com o mesmo login) ---------- */
// O aparelho recebe na sincronização os turnos e veículos do próprio login. Um turno ainda aberto que não é o deste aparelho é o de
// outro aparelho: vira o turno deste também (turnoAtual), e os veículos lançados nos dois vão para o mesmo turno (e o mesmo Termo).
async function turnosAbertosOutros() {
  const eu = Sync.nome(), limite = Date.now() - 24 * 3600e3;
  return (await Store.todos('turnos')).filter(t => !Number(t.encerrado) && !t.excluido && (!t.usuario || !eu || t.usuario === eu) &&
    (Number(t.criadoEm) || Date.parse(t.data + 'T' + (t.inicio || '00:00') + ':00-04:00') || 0) >= limite)
    .sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
}
// o turno foi aberto no outro aparelho enquanto este mostrava "Iniciar turno": passa direto para o turno em andamento
window.addEventListener('gdv-sync-fim', async () => {
  if (!$('#fTurno') || !(await turnosAbertosOutros()).length || !$('#fTurno')) return;
  toast('Turno em andamento no outro aparelho com o seu login: continue lançando por aqui.'); go('home');
});

/**
 * Letra do turno pela ordem do nº: o 1º turno com o mesmo nº (mesma BVA/local, mesmo ano) é A, o 2º B, o 3º C… Proposta pelo que o
 * aparelho conhece (os turnos do login e os compartilhados); o servidor confere com os de todos e corrige na sincronização.
 */
async function letraProposta(n, local, ano) {
  const nl = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const usadas = new Set((await Store.todos('turnos')).filter(t => !Number(t.excluido) && nl(t.local) === nl(local))
    .map(t => /^TF-(\d+)-([A-Z])-(\d{4})$/.exec(String(t.numeroTF || ''))).filter(m => m && Number(m[1]) === n && m[3] === ano).map(m => m[2]));
  let i = 0; while (usadas.has(String.fromCharCode(65 + i)) && i < 25) i++;
  return String.fromCharCode(65 + i);
}
function novoTurno() {
  if (!Sync.ativado() || localStorage.getItem('gdv.revogado')) return view(avisoAtivacao());   // turno só depois de entrar
  const ls = k => esc(localStorage.getItem('gdv.' + k) || '');
  view(`${avisoAtivacao()}${avisoTurnoEncerrado()}<details class="card parear" id="parearBox"><summary>${icone('pessoa')} Entrar no turno de um colega (código)</summary><form id="fParear">
      <p class="dica">O colega que abriu o turno toca em "Convidar colega" e te passa o código. Você lança com o seu login no turno dele.</p>
      <label>Código de 6 números<input id="pCodigo" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="000 000"></label>
      <button class="botao sec" type="submit">${icone('pessoa')} Entrar no turno</button></form></details>
    ${Sync.pode('antigo') ? `<button class="botao sec" data-go="turnopapel">${icone('documento')} Turno antigo (digitar o Termo do papel)</button>` : ''}
    <form class="card" id="fTurno"><h3>Iniciar turno</h3>
    <label>Nº do Termo de Fiscalização <small>(a letra do turno vem sozinha: o 1º turno com este nº é A, o 2º B, o 3º C)</small><input id="nTF" type="number" min="1" inputmode="numeric" required placeholder="ex.: 12"></label>
    <label>Tipo de posto<select id="nPosto">${CONFIG.postos.map(p => `<option value="${p}" ${localStorage.getItem('gdv.posto') === p ? 'selected' : ''}>${p === 'Móvel' ? 'Volante (móvel)' : p}</option>`).join('')}</select></label>
    <div id="nLocalBox"></div>
    <label>Unidade (Termo) <small id="nUnidadeInfo"></small><input id="nUnidade" required autocomplete="off"></label>
    <label>Fiscal — nome completo *${Sync.nome() ? ` <small>(${Sync.usuario() ? 'da sua conta' : 'vinculado a este aparelho'})</small>` : ''}<input id="nFiscal1" autocomplete="off" ${Sync.nome() ? 'readonly' : ''} value="${Sync.nome() ? esc(Sync.nome()) : ls('fiscal1')}" placeholder="Nome e sobrenome"></label>
    <button class="botao" type="submit">Iniciar turno</button></form>`);
  $('#fParear').onsubmit = e => { e.preventDefault(); const c = $('#pCodigo').value.replace(/\D/g, '');
    if (c.length !== 6) return toast('Digite os 6 números do código.', true); entrarComCodigo(c); };
  // Fixa: lista das BVAs (CONFIG.bvas). Volante: endereço da coordenada, editável. A placa só é obrigatória onde a BVA exige.
  let gpsVolante = null;
  const bvaDe = nome => CONFIG.bvas.find(b => b.nome === nome);
  const placaObrigatoria = () => $('#nPosto').value === 'Fixa' && !!(bvaDe($('#nLocal').value) || {}).placa;
  const avisoPlaca = () => { $('#nPlacaInfo').textContent = placaObrigatoria() ? 'Placa do veículo obrigatória nesta barreira.' : 'Placa do veículo opcional neste local.'; };
  async function preencherEndereco() {
    const st = $('#nLocalSt'); st.textContent = 'Obtendo localização…';
    gpsVolante = await pegarLocal();
    const volante = () => $('#nPosto') && $('#nPosto').value === 'Móvel' && $('#nLocal');   // o formulário pode ter sido fechado
    if (!volante()) return;
    if (!gpsVolante) { st.textContent = 'GPS indisponível: digite o local.'; return; }
    const { texto: end, cidade } = await enderecoDe(gpsVolante);
    if (!volante()) return;
    const campo = $('#nLocal'), un = $('#nUnidade');
    if (!campo.dataset.editado) campo.value = end || `Volante – ${gpsVolante.lat.toFixed(5)}, ${gpsVolante.lng.toFixed(5)}`;
    if (cidade && !un.dataset.editado) un.value = cidade.toUpperCase();          // volante: unidade = município onde a barreira está
    soPessoasDoMunicipio();
    st.textContent = end ? 'Endereço obtido pela localização (pode editar).' : 'Sem endereço (sem internet?): ajuste o local e a unidade se quiser.';
  }
  function montarLocal() {
    const fixa = $('#nPosto').value === 'Fixa', ult = localStorage.getItem('gdv.local') || '';
    $('#nLocalBox').innerHTML = fixa
      ? `<label>Local / Posto (BVA)<select id="nLocal" required>${CONFIG.bvas.map(b => `<option ${b.nome === ult ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
         <p class="dica" id="nPlacaInfo"></p>`
      : `<label>Local / Posto (volante)<input id="nLocal" required autocomplete="off" placeholder="endereço do posto volante"></label>
         <div class="linha-acoes"><small id="nLocalSt"></small><button type="button" class="botao sec mini" id="nLocalGps">${icone('local')} Atualizar pela localização</button></div>
         <label class="chk" id="nSoPesBox"><input type="checkbox" id="nSoPessoas"> Só educação sanitária: contar as pessoas orientadas (sem registrar veículos)</label>
         <p class="dica" id="nPlacaInfo"></p>`;
    $('#nLocal').addEventListener(fixa ? 'change' : 'input', () => { if (!fixa) $('#nLocal').dataset.editado = '1'; avisoPlaca(); unidadeDoLocal(); });
    // Unidade (Termo): na BVA fixa é a própria BVA escolhida (não edita); no volante, o município da barreira (vem da localização, editável)
    const un = $('#nUnidade'); delete un.dataset.editado;
    un.readOnly = fixa; un.placeholder = fixa ? '' : 'município da barreira volante';
    if (!fixa) un.value = localStorage.getItem('gdv.unidadeVolante') || '';     // sem GPS/internet: o último município de volante (a localização substitui)
    $('#nUnidadeInfo').textContent = fixa ? '(a mesma da BVA)' : '(município da barreira volante)';
    unidadeDoLocal();
    if (!fixa) { $('#nLocalGps').onclick = () => { delete $('#nLocal').dataset.editado; preencherEndereco(); }; soPessoasDoMunicipio(); preencherEndereco(); }
    avisoPlaca();
  }
  function unidadeDoLocal() { if ($('#nPosto').value === 'Fixa') $('#nUnidade').value = $('#nLocal').value; }
  /** Volante num município de CONFIG.volantesSoPessoas (ex.: Tabatinga): marca "Só educação sanitária" e sugere o local do porto. */
  function soPessoasDoMunicipio() {
    const c = $('#nSoPessoas'), cfg = cfgSoPessoas($('#nUnidade').value); if (!c || !cfg || c.dataset.mexeu) return;
    c.checked = true;
    const campo = $('#nLocal'); if (cfg.local && campo && !campo.dataset.editado) { campo.value = cfg.local; const st = $('#nLocalSt'); if (st) st.textContent = 'Local sugerido para ' + $('#nUnidade').value + ' (pode editar).'; }
  }
  $('#nUnidade').addEventListener('input', e => { e.target.dataset.editado = '1'; soPessoasDoMunicipio(); });
  $('#fTurno').addEventListener('change', e => { if (e.target && e.target.id === 'nSoPessoas') e.target.dataset.mexeu = '1'; });
  $('#nPosto').onchange = montarLocal; montarLocal();
  $('#fTurno').onsubmit = async e => {
    e.preventDefault();
    // um fiscal por login: o colega entra no turno com o próprio login ("Convidar colega"), não digitado aqui
    const nomes = ['#nFiscal1'].map(id => $(id).value.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!nomes.length) { toast('Informe o nome completo do fiscal.', true); $('#nFiscal1').focus(); return; }
    const curto = nomes.find(n => n.split(' ').length < 2);
    if (curto) { toast(`Informe o nome completo (nome e sobrenome): "${curto}"`, true); return; }
    const data = hojeISO(), inicio = agoraHM();                                  // horário = instante do clique
    const btn = $('#fTurno button[type=submit]'); btn.disabled = true; btn.textContent = 'Obtendo localização…';
    // o outro aparelho abriu o turno enquanto este formulário estava na tela: entra nele em vez de abrir outro
    // (depois da validação e com o botão já travado: dois toques seguidos não abrem dois turnos)
    if ((await turnosAbertosOutros()).length) { toast('Turno em andamento no outro aparelho com o seu login: continue lançando por aqui.'); return go('home'); }
    const nTF = parseInt($('#nTF').value, 10), letra = await letraProposta(nTF, $('#nLocal').value.trim(), data.slice(0, 4));
    const gps = (await pegarLocal()) || gpsVolante;
    if (!gps) toast('Turno iniciado sem coordenadas (GPS indisponível ou permissão negada).', true);
    const t = await Store.salvar('turnos', {
      numeroTF: `TF-${pad(nTF, 3)}-${letra}-${data.slice(0, 4)}`,
      data, letra, posto: $('#nPosto').value,
      inicio, fim: '', ...camposLocal(gps, 'Ini'),
      fiscal: nomes.join(' e '), local: $('#nLocal').value.trim(),
      unidade: $('#nUnidade').value.trim(), semPlaca: placaObrigatoria() ? 0 : 1, encerrado: 0,
      soPessoas: $('#nPosto').value === 'Móvel' && $('#nSoPessoas') && $('#nSoPessoas').checked ? 1 : 0, pessoasEducacao: 0
    });
    ['local', 'unidade', 'posto'].forEach(k => localStorage.setItem('gdv.' + k, t[k]));
    if (t.posto === 'Móvel') localStorage.setItem('gdv.unidadeVolante', t.unidade);
    localStorage.setItem('gdv.fiscal1', $('#nFiscal1').value.trim());
    await Store.setMeta('turnoAtual', t.id);
    try { localStorage.removeItem(LS_AVISO_ENC); } catch (e2) { /* sem armazenamento */ }
    Sync.sincronizar(); go('home');
  };
}

/* ---------- Turno antigo (digitar o Termo do papel) ----------
   Termo de Fiscalização do turno feito no papel: nº, data, local, fiscais, horário e os totais (veículos fiscalizados e pessoas
   orientadas), com o PDF escaneado. Só com internet e com "Digitar do papel"; o servidor grava o turno encerrado (turnoPapelRegistrar). */
let PAPEL_PDFS = [];
function turnopapel() {
  if (!Sync.pode('antigo')) { toast('Sem autorização para digitar registros antigos (do papel). Fale com a gerência.', true); return go('home'); }
  PAPEL_PDFS = []; const id = Store.novoId(), hoje = hojeISO();
  view(`<form class="card" id="fPapel"><h3>${icone('documento')} Turno antigo (Termo do papel)</h3>
    <p class="dica">Digite os dados do Termo de Fiscalização do turno e anexe o PDF escaneado. Precisa de internet.</p>
    <label>Nº do Termo de Fiscalização <small>(a letra vem sozinha: 1º turno com este nº = A, 2º = B, 3º = C)</small><input id="pN" type="number" min="1" inputmode="numeric" required></label>
    <label>Data do turno<input id="pData" type="date" max="${hoje}" required></label>
    <label>Tipo de posto<select id="pPosto"><option value="Fixa">Fixa</option><option value="Móvel">Volante (móvel)</option></select></label>
    <div id="pLocalBox"></div>
    <label>Fiscal(is) — nome completo <small>(mais de um: separe com " e ")</small><input id="pFiscal" required autocomplete="off" value="${esc(Sync.nome())}" placeholder="Nome Sobrenome e Nome Sobrenome"></label>
    <div class="duas"><label>Início<input id="pIni" type="time" required></label><label>Fim<input id="pFim" type="time" required></label></div>
    <div class="duas"><label>Veículos fiscalizados<input id="pVeic" type="number" min="0" max="2000" inputmode="numeric" required></label>
      <label>Pessoas orientadas<input id="pPes" type="number" min="0" inputmode="numeric" required></label></div>
    <label class="pce-arquivo">${icone('anexo')} Anexar o Termo escaneado (PDF)<input type="file" id="pPdfs" accept="application/pdf" multiple></label>
    <div id="pPdfLista"><div class="dica">Nenhum PDF anexado.</div></div>
    <button class="botao" type="submit">${icone('salvar')} Gravar o turno do papel</button>
    <button class="botao sec" type="button" data-go="home">Cancelar</button></form>`);
  const montar = () => {
    const fixa = $('#pPosto').value === 'Fixa';
    $('#pLocalBox').innerHTML = fixa ? `<label>Local / Posto (BVA)<select id="pLocal">${CONFIG.bvas.map(b => `<option>${esc(b.nome)}</option>`).join('')}</select></label>`
      : `<label>Local / Posto (volante)<input id="pLocal" required autocomplete="off"></label><label>Unidade (município)<input id="pUnidade" required autocomplete="off"></label>`;
  };
  $('#pPosto').onchange = montar; montar();
  $('#pPdfs').onchange = async e => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    for (const f of files) {
      if (PAPEL_PDFS.length >= 10) { toast('Limite de 10 PDFs.', true); break; }
      if (f.size > 10 * 1024 * 1024) { toast(`"${f.name}" passa do limite de 10 MB.`, true); continue; }
      const ini = new Uint8Array(await f.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...ini) !== '%PDF-') { toast(`"${f.name}" não é um PDF válido.`, true); continue; }
      const dados = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      const a = { ...Anexos.novoArquivo('turnos', id, 'documento', '', 'application/pdf', 'data:application/pdf;base64,' + String(dados).replace(/^data:[^,]*,/, '')), nomeOriginal: String(f.name || 'termo.pdf').slice(0, 120) };
      PAPEL_PDFS.push(a);
    }
    $('#pPdfLista').innerHTML = PAPEL_PDFS.length ? PAPEL_PDFS.map(a => `<div class="pce-doc"><span>${icone('documento')} ${esc(a.nomeOriginal)}</span></div>`).join('') : '<div class="dica">Nenhum PDF anexado.</div>';
  };
  $('#fPapel').onsubmit = async e => {
    e.preventDefault();
    if (!navigator.onLine) return toast('Sem internet: o turno do papel só é gravado com conexão.', true);
    const fiscal = $('#pFiscal').value.trim().replace(/\s+/g, ' ');
    if (fiscal.split(/\s+e\s+|,|;|\//).some(n => n.trim().split(' ').length < 2)) return toast('Informe o nome completo de cada fiscal (nome e sobrenome).', true);
    if ($('#pData').value > hoje) return toast('A data do turno não pode ser no futuro.', true);
    if (!PAPEL_PDFS.length && !confirm('Nenhum PDF do Termo anexado. Gravar mesmo assim?')) return;
    const fixa = $('#pPosto').value === 'Fixa', local = $('#pLocal').value.trim();
    const turno = { id, numero: parseInt($('#pN').value, 10), data: $('#pData').value, posto: $('#pPosto').value, local, unidade: fixa ? local : $('#pUnidade').value.trim(),
      fiscal, inicio: $('#pIni').value, fim: $('#pFim').value, pdfs: PAPEL_PDFS.map(a => a.id) };
    const btn = $('#fPapel button[type=submit]'); btn.disabled = true; btn.textContent = 'Gravando…';
    try {
      const r = await Sync.turnoPapel(turno, parseInt($('#pVeic').value, 10) || 0, parseInt($('#pPes').value, 10) || 0);
      await Store.gravarVarios('arquivos', PAPEL_PDFS);                   // PDFs sobem ao Drive na sincronização (ligados ao turno)
      await Store.gravar('turnos', { ...r.turno, pendente: 0 });
      Sync.sincronizar();
      view(`<div class="card"><h3>${icone('ok')} Turno do papel gravado</h3><p><b>${esc(r.turno.numeroTF)}</b> · ${dBR(r.turno.data)} · ${esc(r.turno.local)}</p>
        <p>${esc(String(r.veiculos != null ? r.veiculos : ''))} veículo(s) · ${esc(String(r.turno.pessoasEducacao || 0))} pessoa(s) orientada(s) · ${PAPEL_PDFS.length} PDF(s)</p>
        <p class="dica">Ele já conta no painel, no VIGIFITO e no convênio. ${r.existente ? 'Este turno já estava gravado.' : ''}</p></div>
        <button class="botao" data-go="turnopapel">${icone('mais')} Digitar outro turno do papel</button><button class="botao sec" data-go="home">Voltar</button>`);
    } catch (err) { btn.disabled = false; btn.innerHTML = `${icone('salvar')} Gravar o turno do papel`; toast(err.message || 'Não foi possível gravar.', true); }
  };
}

/* ---------- Registrar / editar ---------- */
/** Carga de um registro ANTIGO do veículo (o formulário não tem mais o bloco "Fiscalização"; produtos como no TF: ["PRODUTO - 10 Kg", ...]). */
function cargaProdutos(v) {
  let l = []; try { l = JSON.parse((v && v.produtos) || '[]'); } catch (e) { l = []; }
  return (Array.isArray(l) ? l : []).map(t => { const m = /^(.*?)\s+-\s+([\d.,]+)\s*(.*)$/.exec(String(t)); return m ? { p: m[1], q: m[2], u: m[3] } : { p: String(t), q: '', u: '' }; });
}
const lugar = (cidade, uf) => [cidade, uf].filter(Boolean).join('/') || '?';      // "Boa Vista/RR", "RR", "Boa Vista" ou "?"
const opcoesUF = atual => `<option value="">—</option>${CONFIG.ufs.map(u => `<option ${atual === u ? 'selected' : ''}>${u}</option>`).join('')}`;
async function registrar() {
  const t = await turnoAtual();
  if (!t) { toast('Inicie um turno primeiro.', true); return go('home'); }
  if (soPessoas(t)) { toast('Neste turno não se registram veículos: conte as pessoas orientadas na tela do turno.'); return go('home'); }
  const v = EDIT ? await Store.obter('veiculos', EDIT) : null;
  const tipo = v ? v.tipo : 'PA', semPlaca = !!Number(t.semPlaca);    // turno com placa opcional (ex.: Jundiá)
  view(`<form class="card" id="fVeic"><h3>${v ? 'Editar veículo' : 'Registrar veículo'}</h3>
    <label>Placa${semPlaca ? ' <small>(opcional)</small>' : ''}<input id="placa" maxlength="8" autocapitalize="characters" autocomplete="off" ${semPlaca ? '' : 'required'} placeholder="ABC1D23" value="${esc(v ? v.placa : '')}" aria-describedby="placa-tf"></label>
    <p id="placa-tf" class="aviso-erro placa-tf" role="status" hidden></p>
    <label>Tipo do veículo</label>
    <div class="tipos">${Object.entries(CONFIG.tipos).map(([c, x]) => `
      <label class="tipo-card"><input type="radio" name="tipo" value="${c}" ${c === tipo ? 'checked' : ''}>${icone(x.icone)}<span>${x.nome}</span></label>`).join('')}</div>
    <label>Pessoas a bordo (estimativa)<input id="pessoas" type="number" min="0" inputmode="numeric" value="${v ? v.pessoas : CONFIG.tipos[tipo].pessoas}"></label>
    <div class="veic-ufs" role="group" aria-label="Origem e destino (opcional)"><div class="veic-ufs-rot">Origem e destino <small>(opcional)</small></div>
      <label>Cidade de origem<input id="vMunOri" maxlength="60" autocomplete="off" autocapitalize="words" placeholder="ex.: Boa Vista" value="${esc(v && v.origemMun || '')}"></label>
      <label>UF<select id="vUfOri" aria-label="UF de origem">${opcoesUF(v && v.ufOrigem)}</select></label>
      <label>Cidade de destino<input id="vMunDes" maxlength="60" autocomplete="off" autocapitalize="words" placeholder="ex.: Manaus" value="${esc(v && v.destinoMun || '')}"></label>
      <label>UF<select id="vUfDes" aria-label="UF de destino">${opcoesUF(v && v.ufDestino)}</select></label></div>
    <label>Observações<textarea id="obs" rows="3">${esc(v ? v.obs : '')}</textarea></label>
    <button class="botao">${icone('salvar')} Salvar</button></form>`);
  const placa = $('#placa');
  // placa que já tem TF de barreira lavrado nesta BVA: borda vermelha e aviso (também sem internet: índice de reincidência do aparelho)
  const avisoTF = $('#placa-tf');
  const conferirTF = async () => {
    const p = placa.value, r = await TFUI.placaNaBva(p, t.local).catch(() => ({ n: 0 }));
    if (placa.value !== p) return;                                         // o fiscal continuou digitando
    placa.classList.toggle('placa-com-tf', r.n > 0); placa.setAttribute('aria-invalid', r.n > 0 ? 'true' : 'false');
    avisoTF.hidden = !(r.n > 0);
    if (r.n > 0) avisoTF.innerHTML = `${icone('alerta')} ${r.n === 1 ? 'Já há 1 TF de barreira lavrado' : `Já há ${r.n} TFs de barreira lavrados`} para esta placa em ${esc(t.local)}${r.ult ? ` (último em ${dBR(r.ult)})` : ''}.`;
  };
  placa.oninput = () => { placa.value = placa.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); conferirTF(); };
  if (placa.value) conferirTF();
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
    // educação sanitária, medida fitossanitária, partidas, documentos e inspeção saem das pessoas a bordo e dos TFs (servidor); ao editar um
    // registro antigo, os campos de fiscalização que ele já tinha ficam como estavam ({ ...v, ...dados })
    const dados = { turnoId: t.id, placa: p, tipo: tp, pessoas: Math.max(0, parseInt($('#pessoas').value, 10) || 0), obs: $('#obs').value.trim(), excluido: 0,
      ufOrigem: $('#vUfOri').value, ufDestino: $('#vUfDes').value,
      origemMun: $('#vMunOri').value.trim().replace(/\s+/g, ' '), destinoMun: $('#vMunDes').value.trim().replace(/\s+/g, ' ') };
    if (v) { await Store.salvar('veiculos', { ...v, ...dados }); toast('Registro atualizado.'); Sync.sincronizar(); go('lista'); }
    else { await Store.salvar('veiculos', { ...dados, hora: agoraHM() }); toast(p ? `${p} registrado.` : 'Veículo registrado (sem placa).'); Sync.sincronizar(); go('registrar'); }
  };
}

/* ---------- Lista ---------- */
async function lista() {
  const mostrar = tela();
  const t = await turnoAtual();
  if (!mostrar.viva()) return;
  if (!t) return novoTurno();
  const todos = (await veiculosDe(t.id)).reverse();
  if (!mostrar.viva()) return;
  view(`<div class="card"><label>Pesquisar placa<input id="q" autocapitalize="characters"></label></div><div id="itens"></div>`);
  const desenhar = () => {
    const q = $('#q').value.toUpperCase();
    const v = todos.filter(x => !q || x.placa.includes(q));
    $('#itens').innerHTML = v.length ? v.map(x => `
      <div class="item"><div class="topo"><div><div class="placa">${x.placa ? esc(x.placa) : '<small>sem placa</small>'}</div>
        <div class="tipo">${CONFIG.tipos[x.tipo] ? icone(CONFIG.tipos[x.tipo].icone) + ' ' + CONFIG.tipos[x.tipo].nome : esc(x.tipo)}</div></div>
        <div class="hora">${esc(x.hora)}</div></div>
        <div class="info"><b>Pessoas:</b> ${Number(x.pessoas) || 0}</div>
        ${Number(x.carga) ? `<div class="info veic-carga"><b>Carga:</b> ${esc(cargaProdutos(x).map(c => c.p + (c.q ? ` ${c.q} ${c.u}` : '')).join('; ') || 'vegetais/partes')}</div>` : ''}
        ${x.ufOrigem || x.ufDestino || x.origemMun || x.destinoMun ? `<div class="info veic-uf"><b>Origem → destino:</b> ${esc(lugar(x.origemMun, x.ufOrigem))} → ${esc(lugar(x.destinoMun, x.ufDestino))}</div>` : ''}
        ${x.obs ? `<div class="info"><b>Obs:</b> ${esc(x.obs)}</div>` : ''}
        ${x.pendente ? `<div class="info pend">${icone('pendente')} aguardando envio</div>` : ''}
        <div class="botoes"><button class="editar" data-edit="${esc(x.id)}">Editar</button>
        ${Sync.pode('tf') ? `<button class="tfbtn" data-tfveic="${esc(x.id)}">Lavrar TF</button>` : ''}
        <button class="excluir" data-del="${esc(x.id)}">Excluir</button></div></div>`).join('')
      : '<div class="vazio">Nenhum veículo.</div>';
  };
  desenhar(); $('#q').oninput = desenhar;
}

/* ---------- Resumo / documentos ---------- */
async function resumo() {
  const mostrar = tela();
  const t = await turnoAtual();
  if (!mostrar.viva()) return;
  if (!t) return novoTurno();
  const v = await veiculosDe(t.id);
  const por = contar(v);
  if (!mostrar.viva()) return;
  if (soPessoas(t)) {
    view(`<div class="card"><h3>${esc(t.numeroTF)}</h3><div class="total">PESSOAS ORIENTADAS<br>${pessoasDoTurno(t, v)}<small>educação sanitária (sem contagem de veículos neste turno)</small></div></div>
      ${botaoFim(t)}
      <p class="dica">Início do turno: ${esc(t.inicio)}. Ao encerrar, o horário final é registrado e o Termo de Fiscalização fica disponível.<br>Na janela de impressão, escolha “Salvar como PDF”.</p>`);
    $('#encerrar').onclick = () => encerrarTurno(t); return;
  }
  view(`<div class="card"><h3>${esc(t.numeroTF)} — total por tipo</h3>
    ${Object.entries(CONFIG.tipos).map(([c, x]) => `<div class="resumo-item"><span>${icone(x.icone)} ${x.nome}</span><strong>${por[c] || 0}</strong></div>`).join('')}
    <div class="total">TOTAL DE VEÍCULOS<br>${v.length}<small>${v.reduce((s, x) => s + (Number(x.pessoas) || 0), 0)} pessoas fiscalizadas</small></div></div>
    ${temFicha(t) ? `<button class="botao" data-doc="ficha" data-id="${t.id}">${icone('formulario')} Ficha de Campo (PDF)</button>` : ''}
    ${botaoFim(t)}
    <p class="dica">Início do turno: ${esc(t.inicio)}. Ao encerrar, o horário final é registrado e o Termo de Fiscalização fica disponível.<br>Na janela de impressão, escolha “Salvar como PDF”.</p>`);
  $('#encerrar').onclick = () => encerrarTurno(t);
}
/** Encerra o turno (botão na tela do turno e no Resumo). */
async function encerrarTurno(t) {
  if (souColega(t)) return sairDoTurno(t);
  const fim = agoraHM();
  if (!confirm(`Encerrar o turno agora (${fim})? Esta ação é definitiva: não será possível registrar novos veículos nem reabrir o turno.`)) return;
  const b = $('#encerrar'); b.disabled = true; b.textContent = 'Encerrando…';
  // Grava o encerramento NA HORA (antes do GPS): se o app for fechado ou o celular travar esperando a localização,
  // o turno já está encerrado e nada se perde. A coordenada final é acrescentada depois, quando o GPS responder.
  const f = await Store.salvar('turnos', { ...((await Store.obter('turnos', t.id)) || t), encerrado: 1, fim });
  await Store.setMeta('turnoAtual', '');
  Sync.sincronizar();                                    // envia já (não espera o GPS: o fiscal pode fechar o app logo em seguida)
  go('fechado', f.id);
  const gps = await pegarLocal();
  if (gps) { const atual = await Store.obter('turnos', f.id); if (atual) await Store.salvar('turnos', { ...atual, ...camposLocal(gps, 'Fim') }); }
  else toast('Turno encerrado sem coordenadas (GPS indisponível ou permissão negada).', true);
  Sync.sincronizar();
}
async function fechado() {
  const mostrar = tela();
  const t = await Store.obter('turnos', EDIT);
  if (!mostrar.viva()) return;
  if (!t) return go('home');
  const v = await veiculosDe(t.id);
  if (!mostrar.viva()) return;
  view(`<div class="card"><h3>Turno encerrado</h3><p><b>${esc(t.numeroTF)}</b> ${botaoNumero(t)}</p>
    <p>${dBR(t.data)} · das <b>${esc(t.inicio)}</b> às <b>${esc(t.fim)}</b></p>
    <p>${soPessoas(t) ? '' : v.length + ' veículos · '}${pessoasDoTurno(t, v)} pessoas${soPessoas(t) ? ' orientadas' : ''}</p>
    ${htmlStatusEnc(t)}</div>
    <button class="botao" data-doc="termo" data-id="${t.id}">${icone('documento')} Termo de Fiscalização (PDF)</button>
    ${temFicha(t) ? `<button class="botao" data-doc="ficha" data-id="${t.id}">${icone('formulario')} Ficha de Campo (PDF)</button>` : ''}
    <button class="botao" data-go="home">${icone('mais')} Iniciar novo turno</button>
    <p class="dica">Os documentos deste turno também ficam no Histórico.</p>`);
}
/** Complemento dos avisos de pendência: no Android (Background Sync) o envio acontece sozinho; no iPhone, só com o app aberto. */
const avisoEnvio = () => Sync.envioAutomatico() ? ' — será enviado automaticamente quando houver internet, mesmo com o app fechado'
  : ' — abra o app com internet para enviar (e mantenha-o aberto até aparecer “Sincronizado”)';

/* ---------- status do encerramento (feito neste aparelho) até a planilha confirmar ----------
   enviando / não enviado (motivo + Tentar enviar agora) / encerrado só quando o servidor confirmou (o sync marca pendente: 0).
   Aparece na tela "Turno encerrado" e, enquanto houver encerramento pendente, num cartão amarelo no topo de Módulos. */
const AVISO_SAIDA = 'O encerramento ainda não chegou à planilha. Mantenha o app aberto com internet por alguns segundos.';
const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function estadoEnvio() {
  const e = Sync.estado() || {};
  if (!navigator.onLine) return { tipo: 'falha', motivo: 'sem internet' };
  if (Sync.emAndamento() || e.tipo === 'sync') return { tipo: 'enviando' };
  if (e.tipo === 'erro') return { tipo: 'falha', motivo: e.msg || 'erro ao enviar' };
  if (e.tipo === 'ok') return { tipo: 'falha', motivo: e.aviso || 'ainda não confirmado pela planilha' };
  return { tipo: 'aguardando' };
}
function htmlStatusEnc(t, cartao) {
  const attrs = `id="${cartao ? 'encCartao' : 'encPend'}" data-id="${esc(t.id)}" role="status" aria-live="polite"`;
  if (!t.pendente) {
    if (cartao) return '';
    return `<div ${attrs} class="enc-st ok"><b>${icone('ok')} Turno encerrado, bom descanso!</b><small>${t.srv_ts ? `Recebido pela planilha às ${hhmm(Number(t.srv_ts))}.` : 'Recebido pela planilha.'}</small></div>`;
  }
  const st = estadoEnvio(), qual = cartao ? `<span class="enc-qual">${icone('parar')} Turno <b>${esc(t.numeroTF || '')}</b> encerrado às ${esc(t.fim || '')}</span>` : '';
  const pend = `Encerramento ainda não enviado à planilha${avisoEnvio()}. Enquanto não chegar, a gerência vê esta barreira como em andamento.`;
  const botao = `<button type="button" class="botao sec mini" data-reenviar="${esc(t.id)}">${icone('sincronizar')} Tentar enviar agora</button>`;
  if (st.tipo === 'enviando') return `<div ${attrs} class="enc-st pend${cartao ? ' card aviso' : ''}">${qual}<b>${icone('pendente')} Enviando…</b><small>${esc(pend)} Mantenha o app aberto com internet por alguns segundos.</small></div>`;
  if (st.tipo === 'aguardando') return `<div ${attrs} class="enc-st pend${cartao ? ' card aviso' : ''}">${qual}<b>${icone('pendente')} Aguardando envio…</b><small>${esc(pend)}</small>${botao}</div>`;
  return `<div ${attrs} class="enc-st erro${cartao ? ' card aviso' : ''}">${qual}<b>${icone('alerta')} Não enviado: ${esc(st.motivo)}</b><small>${esc(pend)}</small>${botao}</div>`;
}
/** Cartão amarelo no topo de Módulos enquanto houver turno encerrado neste aparelho sem chegar à planilha. */
async function cartaoEncerramento() {
  const l = await Sync.encerramentosPendentes();
  if (!l.length) return '';
  const h = htmlStatusEnc(l[0], true);
  return l.length > 1 ? h.replace('</div>', `<small>${l.length} turnos encerrados aguardando envio.</small></div>`) : h;
}
/** Redesenha só o status (sem refazer a tela) a cada mudança da sincronização. */
async function atualizarStatusEnc() {
  const el = $('#encPend');
  if (el) { const t = await Store.obter('turnos', el.dataset.id); if (t && el.isConnected) el.outerHTML = htmlStatusEnc(t); }
  const c = $('#encCartao');
  if (c) { const h = await cartaoEncerramento(); if (c.isConnected) { if (h) c.outerHTML = h; else c.remove(); } }
}
function avisarSaidaPendente(id) {
  Store.obter('turnos', id).then(t => { if (t && t.pendente && Number(t.encerrado) === 1) toast(AVISO_SAIDA, true); }).catch(() => {});
}
async function tentarEnviarAgora(id, botao) {
  if (botao) { botao.disabled = true; botao.textContent = 'Enviando…'; }
  await Sync.sincronizar();
  const t = await Store.obter('turnos', id);
  if (t && !t.pendente) toast('Turno encerrado, bom descanso!');
  else { const st = estadoEnvio(); toast(`Não enviado: ${st.motivo || 'tente de novo em instantes'}`, true); }
  await atualizarStatusEnc();
}
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
      <div class="card"><h3>Veículos por tipo</h3>${barras(Object.entries(CONFIG.tipos).map(([c, x]) => [x.nome, porTipo[c] || 0, x.icone]))}</div>
      <div class="card"><h3>Veículos por dia</h3>${barras(Object.entries(porDia).sort().map(([k, n]) => [dBR(k).slice(0, 5), n]))}</div>
      <div class="card"><h3>Turnos</h3>${turnos.length ? turnos.map(t => `
        <div class="turno-linha"><div><b>${esc(t.numeroTF)}</b><br><small>${dBR(t.data)} · ${esc(t.inicio)}${t.fim ? '–' + esc(t.fim) : ''} · ${esc(t.fiscal)} · ${porTurno[t.id] || 0} veíc.${t.encerrado ? '' : ' · em andamento'}${t.encerradoPor ? (encerradoAuto(t.encerradoPor) ? ' · encerrado automaticamente (12 h)' : ' · encerrado pela gerência') : ''}${t.pendente ? ` · ${icone('pendente')} aguardando envio` : ''}</small></div>
        <div>${botaoNumero(t)}${t.encerrado ? `<button class="mini" data-doc="termo" data-id="${t.id}">Termo</button>` : ''}${temFicha(t) ? `<button class="mini" data-doc="ficha" data-id="${t.id}">Ficha</button>` : ''}</div></div>`).join('') : '<div class="vazio">Sem turnos no período.</div>'}</div>
      <button class="botao vermelho" id="limpar">${icone('lixeira')} Limpar histórico deste aparelho</button>
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
function barras(pares) {                                    // [rótulo, valor, ícone opcional]
  const max = Math.max(1, ...pares.map(p => p[1]));
  return pares.length ? pares.map(([r, n, ic]) => `<div class="barra"><span class="rot">${ic ? icone(ic) + ' ' : ''}${esc(r)}</span>
    <span class="trilho"><i style="width:${(n / max) * 100}%"></i></span><b>${n}</b></div>`).join('') : '<div class="vazio">Sem dados.</div>';
}

/* ---------- Status da sincronização ---------- */
/** Versão do app (a mesma que o painel mostra em Usuários): "gdv-abc1234" → "abc1234". */
const versaoCurta = v => String(v || '').replace(/^gdv-/, '') || '?';
/** Status: compara a versão em uso com a publicada (js/versao.js direto do servidor); diferente, oferece recarregar o app. */
async function conferirVersao() {
  const el = $('#cVer'); if (!el) return;
  if (!navigator.onLine) { el.textContent = '(sem internet para conferir se há versão nova)'; return; }
  el.textContent = '(conferindo…)';
  const txt = await fetch('js/versao.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
  const pub = (/VERSAO_APP\s*=\s*'([^']+)'/.exec(txt) || [])[1];
  if (!$('#cVer')) return;
  if (!pub) { el.textContent = ''; return; }
  if (pub === Envio.versaoApp()) { el.textContent = '· atualizada'; return; }
  el.innerHTML = `· <b>há versão nova (${esc(versaoCurta(pub))})</b> <button class="botao sec mini" type="button" id="cVerAtualizar">${icone('sincronizar')} Atualizar agora</button>`;
  $('#cVerAtualizar').onclick = () => location.reload();
}
async function config() {
  const mostrar = tela();
  const ult = await Store.meta('ultimaSync'), ret = await Sync.retidos();
  if (!mostrar.viva()) return;
  const u = Sync.usuario();
  view(`${avisoAtivacao()}<div class="card"><h3>Sincronização</h3>
    <p>Acesso: ${Sync.situacao() === 'ok' ? 'entrou' : 'precisa entrar'}</p>
    ${u ? `<p>Entrou como: <b>${esc(u.nome)}</b> (matrícula ${esc(u.matricula)})</p>` : Sync.nome() ? `<p>Fiscal vinculado: <b>${esc(Sync.nome())}</b></p>` : ''}<p id="cEst"></p>
    ${ret.length ? `<p>Guardados neste aparelho, de outras pessoas (só são enviados quando elas entrarem de novo): ${ret.map(r => `${esc(r.nome)} (${r.n})`).join(', ')}.</p>` : ''}
    <p>Última sincronização: ${ult ? new Date(ult).toLocaleString('pt-BR') : 'nunca'}</p>
    <p>Versão do app: <b>${esc(versaoCurta(Envio.versaoApp()))}</b> <span id="cVer"></span></p>
    <p class="dica">A sincronização é automática quando há internet (a cada 20 s com turno aberto; sem turno, a cada minuto). Para forçar agora, toque no selo no topo da tela.</p>
    <p><a href="manual.html">${icone('manual')} Manual do fiscal</a></p>
    ${Sync.ativado() ? '<button class="botao sec" data-sair="1">Sair</button>' : ''}</div>`);
  conferirVersao().catch(() => {});
  const e = Sync.estado();
  $('#cEst').textContent = (navigator.onLine ? 'Online' : 'Offline') + ' · pendentes de envio: ' + (e.pend || 0) + (e.pend ? avisoEnvio() : '') + (e.tipo === 'erro' ? ' · erro: ' + e.msg : '');
}

/* ---------- eventos globais ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-v],[data-go],[data-edit],[data-del],[data-doc],[data-instalar],[data-tfveic],[data-avisook],[data-reenviar],[data-numturno]');
  if (!el) return;
  const d = el.dataset;
  if (d.numturno) return corrigirNumero(d.numturno);
  if (d.reenviar) tentarEnviarAgora(d.reenviar, el);
  else if (d.avisook) { try { localStorage.removeItem(LS_AVISO_ENC); } catch (e2) { /* idem */ } const a = $('#avisoEncerrado'); if (a) a.remove(); }
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
  const [ic, txt] = e.tipo === 'sync' ? ['sincronizar', 'Sincronizando…'] : e.tipo === 'erro' ? ['alerta', 'Falha ao sincronizar']
    : navigator.onLine ? ['online', 'Online'] : ['offline', 'Offline'];
  b.innerHTML = icone(ic) + ' ' + esc(txt + (e.tipo === 'sync' ? '' : pend));
  atualizarStatusEnc().catch(() => {});
});
window.addEventListener('gdv-dados', () => { if (['modulos', 'home', 'lista', 'resumo', 'historico', 'tf', 'pce', 'pcetermos', 'pcecads', 'pcetfs', 'fechado'].includes(VIEW)) go(VIEW, EDIT); });
// permissões mudaram no sync: se a tela aberta é de um módulo que deixou de ser autorizado, volta para os módulos (nada é apagado);
// na tela de módulos (ou em telas livres) só redesenha
window.addEventListener('gdv-permissoes', () => {
  if (semPermissaoPara(VIEW)) go(VIEW);                                   // go() avisa e leva para a tela de módulos
  else if (VIEW === 'modulos') go('modulos');
  else if (['home', 'lista', 'pce', 'pcetermos', 'pcepronto', 'pcelevpronto'].includes(VIEW)) go(VIEW, EDIT);   // botões "Lavrar TF" / "do papel" aparecem/somem
});
window.addEventListener('online', () => Sync.atualizarContagem());
window.addEventListener('gdv-sync-fim', () => { atualizarStatusEnc().catch(() => {}); });

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
