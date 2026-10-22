const amb = require('./lib/amb');
// Sinal do aparelho (heartbeat) em toda sincronização, "ping" de erro, estado "Encerrado no celular, aguardando envio" no painel,
// aba Servidores (último sinal / versão / pendentes / erro) e o status do encerramento no app (⏳ / ✅ / ⚠️ + Tentar enviar agora).
const { chromium } = require('playwright-core');
const { API, PAINEL: WEB, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const M = ms => new Date(ms - 4 * 3600e3);
const diaM = ms => M(ms).toISOString().slice(0, 10), hmM = ms => M(ms).toISOString().slice(11, 16);
const aba = async n => { const rows = await get('/__aba?nome=' + n); if (!rows) return []; const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const aparelho = async id => (await aba('Aparelhos')).find(a => a.id === id);
const esperar = async (f, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };
const editar = (aba, col, valor, onde) => fetch(`${API}/__editar?aba=${aba}&col=${col}&valor=${encodeURIComponent(JSON.stringify(valor))}&onde=${encodeURIComponent(onde)}`).then(r => r.text());

(async () => {
  const AG = Date.now();
  const ADM = (await amb.gerente('Gerente Sinal Lima')).token;
  const ativar = async n => (await amb.usuario(n)).token;
  const FA = await ativar('Fiscal Sinal Alves'), FB = await ativar('Fiscal Antigo Barros'), FC = await ativar('Fiscal Celular Costa');
  ok(ADM && FA && FB && FC, 'credenciais');
  const ini = AG - 3 * 3600e3;
  const T = (id, extra = {}) => ({ id, numeroTF: 'TF-' + id, data: diaM(ini), letra: 'A', inicio: hmM(ini), fim: '', fiscal: 'Fiscal Sinal Alves', local: 'Barreira ' + id,
    unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: ini, atualizadoEm: ini, latIni: '-3.1', lngIni: '-60.0', precIni: '9', ...extra });
  const AP = (id, extra = {}) => ({ id, versao: 'gdv-v13', plataforma: 'android', standalone: true, online: true,
    pendentes: { turnos: 0, veiculos: 0, tfs: 0, levantamentos: 0, colheitas: 0, arquivos: 0 }, turnosEncerradosPendentes: [], fimPendentes: {}, turnoAtual: '',
    ultimoErro: '', ultimoErroEm: 0, origem: 'app', ...extra });
  const envelhecer = async id => { for (const c of ['srv_ts', 'atualizadoEm', 'criadoEm']) await editar('Turnos', c, ini, 'id:' + id); };

  /* ================= 1. servidor ================= */
  console.log('1. Servidor: sinal em toda sincronização, ping e painelDados');
  const ID1 = 'aaaaaaaa-1111-4111-8111-000000000001';
  let r = await post({ action: 'sync', key: FA, since: 0, turnos: [T('sg1')], veiculos: [], aparelho: AP(ID1, { turnoAtual: 'sg1', pendentes: { turnos: 1 } }) });
  ok(r.ok, 'sync com sinal');
  let a1 = await aparelho(ID1);
  ok(a1 && a1.usuario === 'Fiscal Sinal Alves' && a1.versao === 'gdv-v13' && a1.plataforma === 'android' && a1.turnoAtual === 'sg1' && a1.ultimoSinal >= AG && a1.situacao === 'ok' && a1.origem === 'app',
    'aba Aparelhos: id, usuario, versao, plataforma, turnoAtual, ultimoSinal, situacao, origem', a1);
  ok(a1 && a1.pendentes === '{}', 'pendentes já descontam o que chegou neste envio (1 turno enviado → nada pendente)', a1 && a1.pendentes);
  const s0 = a1.ultimoSinal;
  await new Promise(r2 => setTimeout(r2, 30));
  r = await post({ action: 'sync', key: FA, since: r.agora, turnos: [], veiculos: [], aparelho: AP(ID1, { turnoAtual: 'sg1' }) });
  a1 = await aparelho(ID1);
  ok(r.ok && a1.ultimoSinal > s0 && (await aba('Aparelhos')).filter(a => a.id === ID1).length === 1, 'sync SEM nada pendente também grava o sinal (mesma linha, ultimoSinal atualizado)', [s0, a1.ultimoSinal]);
  ok(a1.primeiroSinal === s0, 'primeiroSinal preservado', a1.primeiroSinal);
  // versão antiga do app: sem sinal → linha "legado-"
  r = await post({ action: 'sync', key: FB, since: 0, turnos: [], veiculos: [] });
  const leg = (await aba('Aparelhos')).find(a => a.usuario === 'Fiscal Antigo Barros');
  ok(r.ok && leg && /^legado-/.test(leg.id) && leg.versao === '' && !String(leg.id).includes(FB), 'app antigo (sem sinal): linha "legado-…" sem a credencial inteira', leg && leg.id);
  // turno aberto sem veículo novo há 3 h, mas com o app aberto: último sinal = sinal do aparelho
  await envelhecer('sg1');
  r = await post({ action: 'sync', key: FA, since: 0, turnos: [], veiculos: [], aparelho: AP(ID1, { turnoAtual: 'sg1' }) });
  let d = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: [] });
  let t1 = d.turnos.find(t => t.id === 'sg1');
  ok(t1 && t1.emAndamento && t1.ultimoSinal >= AG && t1.srv_ts === ini && t1.aparelho && t1.aparelho.versao === 'gdv-v13' && t1.encerradoNoCelular === 0,
    'painelDados: último sinal da barreira = sinal do aparelho do fiscal (turno parado há 3 h)', t1 && { us: t1.ultimoSinal, srv: t1.srv_ts, ap: t1.aparelho });
  // aparelho que tem OUTRO turno aberto não dá sinal a este; legado também não
  r = await post({ action: 'sync', key: FA, since: 0, turnos: [T('sg2')], veiculos: [] , aparelho: AP(ID1, { turnoAtual: 'sg1' }) });
  await envelhecer('sg2');
  d = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: [] });
  const t2 = d.turnos.find(t => t.id === 'sg2');
  ok(t2 && t2.ultimoSinal === ini && !t2.aparelho, 'turno que não está aberto em nenhum aparelho com sinal continua com o sinal antigo', t2 && t2.ultimoSinal);
  // ping de erro: encerrado no celular, aguardando envio
  r = await post({ action: 'ping', key: FA, aparelho: AP(ID1, { turnoAtual: '', turnosEncerradosPendentes: ['sg1'], fimPendentes: { sg1: '17:45' }, pendentes: { turnos: 1, veiculos: 2 },
    ultimoErro: '=HYPERLINK("x") Cabeçalho da aba Turnos diferente do esperado na coluna 3.', ultimoErroEm: Date.now() }) });
  ok(r.ok && r.nome === 'Fiscal Sinal Alves' && r.agora, 'ping autenticado responde', r);
  a1 = await aparelho(ID1);
  ok(a1.situacao === 'erro' && /^HYPERLINK/.test(a1.ultimoErro) && a1.ultimoErroEm >= AG && a1.turnosEncerradosPendentes === '["sg1"]' && JSON.parse(a1.pendentes).veiculos === 2,
    'ping grava o sinal com situacao=erro, erro sem "=" no início, encerramento pendente e pendentes', { sit: a1.situacao, e: a1.ultimoErro, enc: a1.turnosEncerradosPendentes });
  ok((await post({ action: 'ping', key: 'invalida', aparelho: AP(ID1) })).ok === false, 'ping com credencial inválida é recusado');
  ok((await post({ action: 'ping', key: FA })).ok, 'ping sem aparelho (teste de conexão) continua funcionando');
  d = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['sg1'] });
  t1 = d.turnos.find(t => t.id === 'sg1');
  ok(t1 && t1.emAndamento && t1.encerradoNoCelular === 1 && t1.fimNoCelular === '17:45' && t1.aparelho.erroAtual === true && /Cabeçalho/.test(t1.aparelho.ultimoErro),
    'painelDados (ao vivo): encerradoNoCelular=1, fimNoCelular e erro atual do aparelho', t1 && { e: t1.encerradoNoCelular, f: t1.fimNoCelular, ap: t1.aparelho });
  const dn = await post({ action: 'painelDados', key: ADM });
  ok(dn.turnos.find(t => t.id === 'sg1').encerradoNoCelular === 1, 'painelDados (normal) também traz o estado');
  // o envio acontece: o encerramento aceito sai dos pendentes no mesmo sync; o painel ao vivo devolve o turno encerrado
  r = await post({ action: 'sync', key: FA, since: 0, turnos: [T('sg1', { encerrado: 1, fim: '17:45', atualizadoEm: Date.now() })], veiculos: [],
    aparelho: AP(ID1, { turnosEncerradosPendentes: ['sg1'], fimPendentes: { sg1: '17:45' }, pendentes: { turnos: 1 }, ultimoErro: 'Cabeçalho da aba Turnos diferente do esperado na coluna 3.', ultimoErroEm: Date.now() - 1000 }) });
  a1 = await aparelho(ID1);
  ok(r.ok && a1.situacao === 'ok' && a1.turnosEncerradosPendentes === '[]' && a1.pendentes === '{}' && /Cabeçalho/.test(a1.ultimoErro), 'sync bem-sucedido: situacao=ok, encerramento aceito sai da lista, o último erro fica como histórico', { sit: a1.situacao, enc: a1.turnosEncerradosPendentes });
  d = await post({ action: 'painelDados', key: ADM, aoVivo: true, ids: ['sg1', 'sg2'] });
  t1 = d.turnos.find(t => t.id === 'sg1');
  ok(t1 && t1.encerrado === 1 && !t1.emAndamento && !t1.encerradoNoCelular, 'modo ao vivo: o turno encerrado volta com encerrado=1 (sai de "em andamento")', t1 && { e: t1.encerrado });
  // usuariosListar (gerência): sinal dos aparelhos de cada conta
  const ID2 = 'aaaaaaaa-1111-4111-8111-000000000002';
  await post({ action: 'sync', key: FA, since: 0, turnos: [], veiculos: [], aparelho: AP(ID2, { versao: 'gdv-velha1', plataforma: 'ios', origem: 'app', pendentes: { veiculos: 3 } }) });
  const ac = await post({ action: 'usuariosListar', key: ADM });
  const la = ac.usuarios.filter(x => x.nome === 'Fiscal Sinal Alves'), lb = ac.usuarios.find(x => x.nome === 'Fiscal Antigo Barros');
  ok(la.length === 1 && la[0].nAparelhos === 2 && la[0].aparelho.versao === 'gdv-velha1' && la[0].aparelho.plataforma === 'ios' && la[0].aparelho.pendentes.veiculos === 3 && la[0].aparelhos.length === 2,
    'usuariosListar: aparelho mais recente + contagem', la[0] && { n: la[0].nAparelhos, ap: la[0].aparelho });
  ok(lb && lb.aparelho && lb.aparelho.legado === true, 'usuariosListar: aparelho sem sinal (versão antiga do app) marcado como legado', lb && lb.aparelho);
  ok(!JSON.stringify(ac).includes(FA) && !JSON.stringify(ac).includes(ID1), 'usuariosListar não expõe token nem id do aparelho');

  /* ================= 2. app + painel ================= */
  console.log('2. App do fiscal e painel');
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(url, ls, opts = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.route('https://nominatim.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await c.addInitScript(i => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
    const p = await c.newPage();
    p.on('pageerror', e => erros.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    p.on('dialog', d2 => d2.accept());
    await p.goto(url); return p;
  }
  const app = await abrir(APP, { 'gdv.key': FC, 'gdv.nome': 'Fiscal Celular Costa', 'gdv.semInstalar': '1' },
    { viewport: { width: 400, height: 820 }, permissions: ['geolocation'], geolocation: { latitude: -3.119, longitude: -60.021, accuracy: 10 } });
  const sync = () => app.evaluate(async () => { await Sync.sincronizar(); return Sync.estado(); });
  await app.waitForSelector('.modulo');
  await app.click('.modulo[data-v=home]'); await app.waitForSelector('#fTurno');
  await app.fill('#nTF', '91'); await app.selectOption('#nPosto', 'Fixa'); await app.selectOption('#nLocal', 'BVA - JUNDIÁ'); await app.click('#fTurno button[type=submit]'); await app.waitForSelector('.contador');
  const idT = await app.evaluate(() => Store.meta('turnoAtual'));
  await sync();
  const idAp = await app.evaluate(() => Store.meta('aparelhoId'));
  let ap = await aparelho(idAp);
  ok(ap && ap.usuario === 'Fiscal Celular Costa' && ap.versao === 'gdv-v13' && ap.plataforma === 'outro' && ap.turnoAtual === idT && ap.pendentes === '{}' && ap.origem === 'app',
    'app: sinal gravado (id fixo do aparelho, versão gdv-v13 do js/versao.js, plataforma, turno atual, nada pendente)', ap);
  const sA = ap.ultimoSinal;
  await app.waitForTimeout(50); await sync(); ap = await aparelho(idAp);
  ok(ap.ultimoSinal > sA, 'app: nova sincronização sem nada pendente atualiza o sinal', [sA, ap.ultimoSinal]);
  // o turno não recebe veículo há 3 h: só o sinal do aparelho mantém a barreira "em andamento"
  await envelhecer(idT); await sync();
  // outro turno aberto há 3 h sem nenhum sinal (comparação)
  await post({ action: 'sync', key: FA, since: 0, turnos: [T('sg3', { local: 'Barreira Sem Celular' })], veiculos: [] }); await envelhecer('sg3');
  const pn = await abrir(WEB, { 'gdv.painel.token': ADM, 'gdv.painel.nome': 'Gerente Sinal Lima' });
  await pn.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }); await pn.waitForTimeout(600);
  const sit = id => pn.evaluate(i => { const t = Painel.todos.turnosTodos.find(x => x.id === i); return t && { sit: t.situacao, us: t.ultimoSinal, emA: t.emAndamento }; }, id);
  const card = id => pn.evaluate(i => { const e = document.querySelector(`.pn-vivo-item[data-turno="${i}"]`); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }, id);
  let s1 = await sit(idT);
  ok(s1 && s1.sit === 'ok' && Date.now() - s1.us < 120e3, 'painel: barreira sem veículo há 3 h mas com o app aberto fica "em andamento" (não "sem sinal")', s1);
  ok(/Em andamento/.test(await card(idT)) && /último sinal (agora|há [12] min)/.test(await card(idT)), 'cartão: "Em andamento", último sinal recente', (await card(idT)).slice(0, 160));
  const s3 = await sit('sg3'), c3 = await card('sg3');
  ok(s3 && s3.sit === 'semsinal' && /Celular sem sincronizar há 3 h \(sem internet ou app fechado\)/.test(c3), 'sem sinal: "Celular sem sincronizar há 3 h (sem internet ou app fechado)"', c3.slice(0, 220));

  // encerra no app com o servidor dando erro no sync (o ping passa)
  console.log('3. Encerramento com erro no servidor');
  let atrasar = 0;
  await app.route(API + '/', async rt => {
    const corpo = JSON.parse(rt.request().postData() || '{}');
    if (corpo.action !== 'sync') return rt.continue();
    if (atrasar) await new Promise(r2 => setTimeout(r2, atrasar));
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, erro: 'Cabeçalho da aba Turnos diferente do esperado na coluna 3.' }) });
  });
  atrasar = 2500;
  await app.click('nav [data-v=resumo]'); await app.waitForSelector('#encerrar'); await app.click('#encerrar'); await app.waitForSelector('#encPend');
  const enviando = await app.textContent('#encPend');
  ok(/⏳ Enviando…/.test(enviando) && /ainda não enviado à planilha/.test(enviando), 'app: "⏳ Enviando…" logo depois de encerrar', enviando.slice(0, 120));
  await app.waitForFunction(() => /Não enviado/.test(document.querySelector('#encPend') && document.querySelector('#encPend').textContent), null, { timeout: 15000 }).catch(() => {});
  atrasar = 0;
  const falhou = await app.textContent('#encPend');
  ok(/⚠️ Não enviado: Cabeçalho da aba Turnos diferente/.test(falhou) && await app.locator('#encPend [data-reenviar]').count() === 1, 'app: "⚠️ Não enviado: <motivo>" + botão "Tentar enviar agora"', falhou.slice(0, 160));
  ok(!/bom descanso/.test(falhou), 'app: sem ✅ enquanto o servidor não confirmou');
  await app.screenshot({ path: amb.saida('sinal_app_erro.png') });
  ap = await aparelho(idAp);
  ok(ap && ap.situacao === 'erro' && /Cabeçalho/.test(ap.ultimoErro) && JSON.parse(ap.turnosEncerradosPendentes).includes(idT) && ap.turnoAtual === '',
    'ping de erro (sync falhou no servidor): aba Aparelhos com situacao=erro, o erro e o encerramento pendente', ap && { sit: ap.situacao, e: ap.ultimoErro, enc: ap.turnosEncerradosPendentes });
  ok((await aba('Turnos')).find(t => t.id === idT).encerrado === 0, 'planilha: turno ainda aberto (o envio falhou)');
  // "Tentar enviar agora" com o servidor ainda falhando: mostra o resultado
  await app.click('#encPend [data-reenviar]');
  await app.waitForFunction(() => /Não enviado/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 }).catch(() => {});
  ok(/⚠️ Não enviado: Cabeçalho/.test(await app.textContent('#toast')), 'Tentar enviar agora (ainda com erro): mostra o motivo', await app.textContent('#toast'));
  // sair da tela: aviso não bloqueante; Módulos com cartão amarelo
  await app.click('nav [data-v=modulos]'); await app.waitForSelector('.modulo');
  await app.waitForFunction(() => /ainda não chegou à planilha/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/O encerramento ainda não chegou à planilha\. Mantenha o app aberto com internet por alguns segundos\./.test(await app.textContent('#toast')), 'aviso ao sair da tela com o encerramento pendente', await app.textContent('#toast'));
  const cartao = await app.textContent('#encCartao').catch(() => '');
  ok(/Não enviado/.test(cartao) && /TF-091/.test(cartao) && await app.locator('#encCartao [data-reenviar]').count() === 1 && await app.evaluate(() => document.querySelector('#view').firstElementChild.nextElementSibling.id === 'encCartao' || document.querySelector('#encCartao').getBoundingClientRect().top < 300),
    'Módulos: cartão amarelo no topo com o status e o botão', cartao.replace(/\s+/g, ' ').slice(0, 160));
  await app.screenshot({ path: amb.saida('sinal_app_modulos.png') });

  // painel: "Encerrado no celular, aguardando envio" + erro
  await pn.evaluate(() => Painel.aoVivo()); await pn.waitForTimeout(500);
  s1 = await sit(idT);
  const c1 = await card(idT);
  ok(s1.sit === 'aguardando' && s1.emA, 'painel: situação "aguardando" (encerrado no celular)', s1);
  ok(/Encerrado no celular, aguardando envio/.test(c1) && /O fiscal encerrou este turno no celular às \d\d:\d\d/.test(c1) && /Erro ao enviar: Cabeçalho da aba Turnos/.test(c1),
    'cartão: "Encerrado no celular, aguardando envio", horário do celular e "Erro ao enviar: …"', c1.slice(0, 300));
  const alertasTxt = await pn.evaluate(() => [...document.querySelectorAll('.pn-alerta')].map(a => a.textContent).join(' | '));
  ok(/Encerrado no celular, aguardando envio: BVA - JUNDIÁ/.test(alertasTxt), 'alerta "Encerrado no celular, aguardando envio" na Visão geral');
  await pn.screenshot({ path: amb.saida('sinal_painel_aguardando.png') });
  // diálogo de encerrar sugere o horário do celular
  await pn.click(`[data-encerrar="${idT}"]`); await pn.waitForSelector('#pn-encerrar[open]');
  const fimCel = await app.evaluate(id => Store.obter('turnos', id).then(t => t.fim), idT);
  ok(await pn.inputValue('#pn-enc-fim') === fimCel && /Encerrado no celular \(/.test(await pn.textContent('#pn-encerrar .pn-dlg-rapidos')), 'Encerrar turno: sugere o horário do celular', await pn.inputValue('#pn-enc-fim'));
  await pn.click('#pn-enc-cancelar'); await pn.waitForTimeout(200);
  // aba Barreiras
  await pn.click('.pn-aba[data-aba=barreiras]'); await pn.waitForTimeout(1000);
  ok(/Encerrado no celular, aguardando envio/.test(await pn.textContent('.pn-bar-vivo')), 'aba Barreiras: estado na lista em andamento');
  await pn.click('.pn-aba[data-aba=geral]'); await pn.waitForTimeout(600);

  // o servidor volta: Tentar enviar agora → ✅
  console.log('4. Envio confirmado');
  await app.unroute(API + '/');
  await app.click('#encCartao [data-reenviar]');
  await app.waitForFunction(() => /bom descanso/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 }).catch(() => {});
  ok(/✅ Turno encerrado, bom descanso!/.test(await app.textContent('#toast')), 'Tentar enviar agora: toast "✅ Turno encerrado, bom descanso!"', await app.textContent('#toast'));
  await app.waitForTimeout(500);
  ok(await app.locator('#encCartao').count() === 0, 'Módulos: cartão some depois do envio');
  await app.evaluate(id => go('fechado', id), idT); await app.waitForSelector('#encPend');
  const okTxt = (await app.textContent('#encPend')).replace(/\s+/g, ' ');
  const srv = (await aba('Turnos')).find(t => t.id === idT);
  const hRec = await app.evaluate(ms => { const d2 = new Date(ms); return String(d2.getHours()).padStart(2, '0') + ':' + String(d2.getMinutes()).padStart(2, '0'); }, srv.srv_ts);
  ok(/✅ Turno encerrado, bom descanso!/.test(okTxt) && okTxt.includes('Recebido pela planilha às ' + hRec) && srv.encerrado === 1, 'tela do turno: "✅ Turno encerrado, bom descanso!" + "Recebido pela planilha às HH:MM" (srv_ts)', okTxt);
  await app.screenshot({ path: amb.saida('sinal_app_ok.png') });
  ap = await aparelho(idAp);
  ok(ap.situacao === 'ok' && ap.turnosEncerradosPendentes === '[]' && /Cabeçalho/.test(ap.ultimoErro), 'aba Aparelhos: situacao ok, nada pendente; erro fica como histórico', { sit: ap.situacao, enc: ap.turnosEncerradosPendentes });
  ok(await app.evaluate(() => Store.meta('ultimoErro')) === undefined, 'app: último erro limpo depois do envio');
  // painel: sai de "em andamento" na consulta ao vivo (sem recarga completa)
  const antes = await pn.evaluate(() => Painel.estado().ultimaCompleta);
  const pedidos = []; pn.on('request', rq => { if (rq.url().startsWith(API) && rq.method() === 'POST') { try { pedidos.push(JSON.parse(rq.postData())); } catch (e) { /* */ } } });
  await pn.evaluate(() => Painel.aoVivo()); await pn.waitForTimeout(600);
  s1 = await sit(idT);
  ok(s1 && !s1.emA && s1.sit === 'encerrada' && await pn.locator(`.pn-vivo-item[data-turno="${idT}"]`).count() === 0, 'painel: a barreira saiu de "em andamento" na consulta ao vivo', s1);
  ok(pedidos.length === 1 && pedidos[0].aoVivo === true && (pedidos[0].ids || []).includes(idT) && await pn.evaluate(() => Painel.estado().ultimaCompleta) === antes, 'foi a consulta leve (aoVivo com os ids abertos), sem recarga completa', pedidos.map(x => ({ a: x.action, v: x.aoVivo })));

  // a aba Servidores do painel (lista de contas com o sinal dos aparelhos) é do front novo, sobre usuariosListar (seção 1)

  const errosReais = erros.filter(e => !/ERR_EMPTY_RESPONSE|Failed to load resource/.test(e));
  ok(!errosReais.length, 'sem erros de console/página', errosReais.slice(0, 5));
  await b.close();
  console.log(`FALHOU=${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
