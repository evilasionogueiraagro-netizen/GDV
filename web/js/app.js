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
const camposLocal = (g, sufixo) => g ? { ['lat' + sufixo]: g.lat, ['lng' + sufixo]: g.lng, ['prec' + sufixo]: g.prec } : {};
const temLocal = (t, s) => t['lat' + s] !== undefined && t['lat' + s] !== '' && !isNaN(parseFloat(t['lat' + s]));
const localHTML = (t, s) => temLocal(t, s)
  ? `<a href="https://www.google.com/maps?q=${parseFloat(t['lat' + s])},${parseFloat(t['lng' + s])}" target="_blank" rel="noopener">${parseFloat(t['lat' + s]).toFixed(5)}, ${parseFloat(t['lng' + s]).toFixed(5)}</a> <small>(±${esc(t['prec' + s])} m)</small>`
  : '<small>não registrada</small>';

/* ---------- navegação ---------- */
function go(view, arg) {
  VIEW = view; EDIT = arg || null;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view || (view === 'editar' && b.dataset.v === 'lista')));
  ({ home, registrar, editar: registrar, lista, resumo, fechado, historico, config }[view])();
  window.scrollTo(0, 0);
}
const view = html => { $('#view').innerHTML = html; };

/* ---------- Início / novo turno ---------- */
async function home() {
  const t = await turnoAtual();
  if (!t) return novoTurno();
  const v = await veiculosDe(t.id);
  view(`
    <div class="card"><h3>Turno atual</h3>
      <p><b>${esc(t.numeroTF)}</b></p>
      <p><b>Fiscal:</b> ${esc(t.fiscal)}</p><p><b>Local:</b> ${esc(t.local)}</p>
      <p><b>Data:</b> ${dBR(t.data)} &nbsp; <b>Posto:</b> ${esc(t.posto || '')}</p>
      <p><b>Início do turno:</b> ${esc(t.inicio)}</p>
      <p><b>📍 Local de início:</b> ${localHTML(t, 'Ini')}</p></div>
    <div class="card contador"><h1>${v.length}</h1><p>Veículos registrados</p></div>
    <button class="botao" data-go="registrar">➕ Registrar veículo</button>
    <button class="botao" data-go="lista">📋 Lista de veículos</button>
    <button class="botao" data-go="resumo">📊 Resumo e documentos</button>`);
}
function novoTurno() {
  const ls = k => esc(localStorage.getItem('gdv.' + k) || '');
  view(`<form class="card" id="fTurno"><h3>Iniciar turno</h3>
    <label>Nº do Termo de Fiscalização<input id="nTF" type="number" min="1" inputmode="numeric" required placeholder="ex.: 12"></label>
    <label>Tipo de posto<select id="nPosto">${CONFIG.postos.map(p => `<option ${localStorage.getItem('gdv.posto') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <label>Local / Posto<input id="nLocal" required value="${localStorage.getItem('gdv.local') ? ls('local') : esc(CONFIG.localPadrao)}" placeholder="ex.: Barreira Porto CEASA ou BR-174 km 120"></label>
    <label>Unidade (Termo)<input id="nUnidade" required value="${localStorage.getItem('gdv.unidade') ? ls('unidade') : esc(CONFIG.unidadePadrao)}"></label>
    <label>Fiscal(is)<input id="nFiscal" required value="${ls('fiscal')}"></label>
    <button class="botao">Iniciar turno</button></form>`);
  $('#fTurno').onsubmit = async e => {
    e.preventDefault();
    const data = hojeISO(), inicio = agoraHM(), letra = letraDoTurno(inicio);   // horário = instante do clique
    const btn = $('#fTurno button'); btn.disabled = true; btn.textContent = '📍 Obtendo localização…';
    const gps = await pegarLocal();
    if (!gps) toast('Turno iniciado sem coordenadas (GPS indisponível ou permissão negada).', true);
    const t = await Store.salvar('turnos', {
      numeroTF: `TF-${pad(parseInt($('#nTF').value, 10), 3)}-${letra}-${data.slice(0, 4)}`,
      data, letra, posto: $('#nPosto').value,
      inicio, fim: '', ...camposLocal(gps, 'Ini'),
      fiscal: $('#nFiscal').value.trim(), local: $('#nLocal').value.trim(),
      unidade: $('#nUnidade').value.trim(), encerrado: 0
    });
    ['fiscal', 'local', 'unidade', 'posto'].forEach(k => localStorage.setItem('gdv.' + k, t[k]));
    await Store.setMeta('turnoAtual', t.id);
    Sync.sincronizar(); go('home');
  };
}

/* ---------- Registrar / editar ---------- */
async function registrar() {
  const t = await turnoAtual();
  if (!t) { toast('Inicie um turno primeiro.', true); return go('home'); }
  const v = EDIT ? await Store.obter('veiculos', EDIT) : null;
  const tipo = v ? v.tipo : 'PA';
  view(`<form class="card" id="fVeic"><h3>${v ? 'Editar veículo' : 'Registrar veículo'}</h3>
    <label>Placa<input id="placa" maxlength="8" autocapitalize="characters" autocomplete="off" required placeholder="ABC1D23" value="${esc(v ? v.placa : '')}"></label>
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
  if (!v) placa.focus();
  $('#fVeic').onsubmit = async e => {
    e.preventDefault();
    const p = placa.value.trim();
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) && !confirm(`A placa "${p}" está fora do padrão. Salvar mesmo assim?`)) return;
    const existentes = await veiculosDe(t.id);
    if (existentes.some(x => x.placa === p && x.id !== (v && v.id)) && !confirm(`A placa ${p} já foi registrada neste turno. Registrar de novo?`)) return;
    const tp = document.querySelector('input[name=tipo]:checked').value;
    const dados = { turnoId: t.id, placa: p, tipo: tp, pessoas: Math.max(0, parseInt($('#pessoas').value, 10) || 0), obs: $('#obs').value.trim(), excluido: 0 };
    if (v) { await Store.salvar('veiculos', { ...v, ...dados }); toast('Registro atualizado.'); Sync.sincronizar(); go('lista'); }
    else { await Store.salvar('veiculos', { ...dados, hora: agoraHM() }); toast(`${p} registrado.`); Sync.sincronizar(); go('registrar'); }
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
      <div class="item"><div class="topo"><div><div class="placa">${esc(x.placa)}</div>
        <div class="tipo">${CONFIG.tipos[x.tipo] ? CONFIG.tipos[x.tipo].icone + ' ' + CONFIG.tipos[x.tipo].nome : esc(x.tipo)}</div></div>
        <div class="hora">${esc(x.hora)}</div></div>
        <div class="info"><b>Pessoas:</b> ${Number(x.pessoas) || 0}</div>
        ${x.obs ? `<div class="info"><b>Obs:</b> ${esc(x.obs)}</div>` : ''}
        ${x.pendente ? '<div class="info pend">⏳ aguardando envio</div>' : ''}
        <div class="botoes"><button class="editar" data-edit="${esc(x.id)}">Editar</button>
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
    <button class="botao" data-doc="ficha" data-id="${t.id}">📝 Ficha de Campo (PDF)</button>
    <button class="botao vermelho" id="encerrar">⏹ Encerrar turno</button>
    <p class="dica">Início do turno: ${esc(t.inicio)}. Ao encerrar, o horário final é registrado e o Termo de Fiscalização fica disponível.<br>Na janela de impressão, escolha “Salvar como PDF”.</p>`);
  $('#encerrar').onclick = async () => {
    const fim = agoraHM();
    if (!confirm(`Encerrar o turno agora (${fim})? Esta ação é definitiva: não será possível registrar novos veículos nem reabrir o turno.`)) return;
    const b = $('#encerrar'); b.disabled = true; b.textContent = '📍 Obtendo localização…';
    const gps = await pegarLocal();
    if (!gps) toast('Turno encerrado sem coordenadas (GPS indisponível ou permissão negada).', true);
    const f = await Store.salvar('turnos', { ...t, encerrado: 1, fim, ...camposLocal(gps, 'Fim') });
    await Store.setMeta('turnoAtual', '');
    Sync.sincronizar(); go('fechado', f.id);
  };
}
async function fechado() {
  const t = await Store.obter('turnos', EDIT);
  if (!t) return go('home');
  const v = await veiculosDe(t.id);
  view(`<div class="card"><h3>Turno encerrado</h3><p><b>${esc(t.numeroTF)}</b></p>
    <p>${dBR(t.data)} · das <b>${esc(t.inicio)}</b> às <b>${esc(t.fim)}</b></p>
    <p>${v.length} veículos · ${v.reduce((s, x) => s + (Number(x.pessoas) || 0), 0)} pessoas</p>
    <p>📍 Início: ${localHTML(t, 'Ini')}</p><p>📍 Encerramento: ${localHTML(t, 'Fim')}</p></div>
    <button class="botao" data-doc="termo" data-id="${t.id}">📄 Termo de Fiscalização (PDF)</button>
    <button class="botao" data-doc="ficha" data-id="${t.id}">📝 Ficha de Campo (PDF)</button>
    <button class="botao" data-go="home">➕ Iniciar novo turno</button>
    <p class="dica">Os documentos deste turno também ficam no Histórico.</p>`);
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
      <div class="card"><h3>Veículos por tipo</h3>${barras(Object.entries(CONFIG.tipos).map(([c, x]) => [x.icone + ' ' + x.nome, porTipo[c] || 0]))}</div>
      <div class="card"><h3>Veículos por dia</h3>${barras(Object.entries(porDia).sort().map(([k, n]) => [dBR(k).slice(0, 5), n]))}</div>
      <div class="card"><h3>Turnos</h3>${turnos.length ? turnos.map(t => `
        <div class="turno-linha"><div><b>${esc(t.numeroTF)}</b><br><small>${dBR(t.data)} · ${esc(t.inicio)}${t.fim ? '–' + esc(t.fim) : ''} · ${esc(t.fiscal)} · ${porTurno[t.id] || 0} veíc.${t.encerrado ? '' : ' · em andamento'}</small></div>
        <div>${t.encerrado ? `<button class="mini" data-doc="termo" data-id="${t.id}">Termo</button>` : ''}<button class="mini" data-doc="ficha" data-id="${t.id}">Ficha</button></div></div>`).join('') : '<div class="vazio">Sem turnos no período.</div>'}</div>
      <button class="botao" id="csv">⬇ Baixar CSV dos veículos</button>`;
    $('#csv').onclick = () => {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const tf = Object.fromEntries(turnos.map(t => [t.id, t]));
      const linhas = [['TF', 'Data', 'Hora', 'Placa', 'Tipo', 'Pessoas', 'Fiscal', 'Local', 'Obs', 'Lat início', 'Lng início', 'Lat fim', 'Lng fim']].concat(
        veic.sort((a, b) => dataDe[a.turnoId].localeCompare(dataDe[b.turnoId]) || a.hora.localeCompare(b.hora)).map(v => {
          const t = tf[v.turnoId]; return [t.numeroTF, dBR(t.data), v.hora, v.placa, v.tipo, v.pessoas, t.fiscal, t.local, v.obs, t.latIni, t.lngIni, t.latFim, t.lngFim];
        }));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = `veiculos_${de}_${ate}.csv`; a.click();
    };
  };
  $('#hDe').onchange = $('#hAte').onchange = desenhar;
  desenhar();
}
function barras(pares) {
  const max = Math.max(1, ...pares.map(p => p[1]));
  return pares.length ? pares.map(([r, n]) => `<div class="barra"><span class="rot">${esc(r)}</span>
    <span class="trilho"><i style="width:${(n / max) * 100}%"></i></span><b>${n}</b></div>`).join('') : '<div class="vazio">Sem dados.</div>';
}

/* ---------- Configurações ---------- */
async function config() {
  const c = Sync.cfg(), ult = await Store.meta('ultimaSync');
  view(`<form class="card" id="fCfg"><h3>Sincronização com a planilha</h3>
    <label>URL do Apps Script (termina em /exec)<input id="cUrl" type="url" value="${esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label>Chave de acesso<input id="cKey" type="password" value="${esc(c.key)}" autocomplete="off"></label>
    <button class="botao">Salvar e testar</button></form>
    <div class="card"><h3>Estado</h3><p id="cEst"></p>
      <p>Última sincronização: ${ult ? new Date(ult).toLocaleString('pt-BR') : 'nunca'}</p>
      <button class="botao" id="cSync">🔄 Sincronizar agora</button></div>`);
  const est = () => { const e = Sync.estado(); $('#cEst') && ($('#cEst').textContent = (navigator.onLine ? 'Online' : 'Offline') + ' · pendentes de envio: ' + (e.pend || 0) + (e.tipo === 'erro' ? ' · erro: ' + e.msg : '')); };
  est();
  $('#cSync').onclick = async () => { await Sync.sincronizar(); est(); toast(Sync.estado().tipo === 'erro' ? 'Falhou: ' + Sync.estado().msg : 'Sincronizado.', Sync.estado().tipo === 'erro'); };
  $('#fCfg').onsubmit = async e => {
    e.preventDefault();
    localStorage.setItem('gdv.url', $('#cUrl').value.trim()); localStorage.setItem('gdv.key', $('#cKey').value.trim());
    try { await Sync.testar(); toast('Conexão OK. Sincronizando…'); await Sync.sincronizar(); est(); }
    catch (err) { toast('Não foi possível conectar: ' + err.message, true); }
  };
}

/* ---------- eventos globais ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-v],[data-go],[data-edit],[data-del],[data-doc]');
  if (!el) return;
  const d = el.dataset;
  if (d.v) go(d.v);
  else if (d.go) go(d.go);
  else if (d.edit) go('editar', d.edit);
  else if (d.del) {
    if (!confirm('Excluir este registro?')) return;
    const v = await Store.obter('veiculos', d.del);
    await Store.salvar('veiculos', { ...v, excluido: 1 });
    Sync.sincronizar(); toast('Excluído.'); lista();
  } else if (d.doc) {
    try {
      const fora = await Docs[d.doc](d.id);
      if (fora) toast(`A ficha comporta ${CONFIG.linhasFicha} veículos; ${fora} ficaram de fora (o Termo conta todos).`, true);
    } catch (err) { toast('Erro ao gerar documento: ' + err.message, true); }
  }
});

Sync.onEstado(e => {
  const b = $('#sync');
  const pend = e.pend ? ` · ${e.pend} a enviar` : '';
  b.textContent = (e.tipo === 'sync' ? '🔄 Sincronizando…' : e.tipo === 'erro' ? '⚠️ Falha ao sincronizar' : (navigator.onLine ? '🟢 Online' : '🔴 Offline')) + (e.tipo === 'sync' ? '' : pend);
});
window.addEventListener('gdv-dados', () => { if (['home', 'lista', 'resumo', 'historico'].includes(VIEW)) go(VIEW); });
window.addEventListener('online', () => Sync.atualizarContagem());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => {
  go('home');
  await Sync.atualizarContagem();
  if (!Sync.cfg().url) toast('Configure a sincronização em ⚙️ Config.');
  Sync.iniciar();
})();
