const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Fluxo de instalação do app (PWA) por plataforma: passo "instale o app", entrada e módulos.
const { devices } = require('playwright-core');
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + extra : '')); if (!c) process.exitCode = 1; };
(async () => {
  const paginas = [];
  const b = await amb.lancar();
  const TOKEN = (await U.fiscal('Fiscal Instalacao Teste')).token;
  const novo = async (opts, init, arg) => { const c = await b.newContext({ ...opts }); if (init) await c.addInitScript(init, arg); const p = await c.newPage(); paginas.push(p); p.on('dialog', d => d.accept()); p.err = []; p.on('pageerror', e => p.err.push(e.message)); await p.goto(amb.APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(400); return p; };
  const n = (p, sel) => p.locator(sel).count();
  const passos = async (p) => `instalar:${await n(p, '#bInstalar li') > 0 ? 'SIM' : 'não'} | entrada:${await n(p, '#fEntrar') ? 'SIM' : 'não'} | módulos:${await n(p, '.modulo') ? 'SIM' : 'não'}`;
  const SO_INSTALAR = 'instalar:SIM | entrada:não | módulos:não', SO_ENTRAR = 'instalar:não | entrada:SIM | módulos:não';
  const confere = async (p, esperado, msg) => { const r = await passos(p); ok(r === esperado, msg, r); };

  let p = await novo(devices['iPhone 13']);
  await confere(p, SO_INSTALAR, 'iPhone (Safari): só o passo de instalar');
  ok(/Passo 1: instale o app/.test(await p.textContent('#bInstalar h3')), 'iPhone (Safari): título "Passo 1: instale o app"');
  p = await novo(devices['iPhone 13'], () => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await confere(p, SO_ENTRAR, 'iPhone com o app instalado: entrada');
  p = await novo(devices['Pixel 7']);
  await confere(p, SO_INSTALAR, 'Android (Chrome): só o passo de instalar');
  await p.evaluate(() => { window.__prompted = 0; const ev = new Event('beforeinstallprompt', { cancelable: true }); ev.prompt = () => { window.__prompted++; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(ev); });
  await p.waitForSelector('[data-instalar=agora]'); await p.click('[data-instalar=agora]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__prompted) === 1, 'Android "Instalar agora": chama o prompt do navegador uma vez');
  ok(/App instalado/.test(await p.textContent('#bInstalar h3')), 'Android "Instalar agora": mensagem "App instalado"', await p.textContent('#bInstalar h3'));
  ok(await n(p, '#fEntrar') === 0, 'Android "Instalar agora": entrada continua oculta (é feita no app)');
  // Android com o app instalado (standalone)
  p = await novo(devices['Pixel 7'], () => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q); });
  await confere(p, SO_ENTRAR, 'Android com o app instalado: entrada');
  // aparelho com acesso aberto no navegador: banner, mas pode iniciar turno
  p = await novo(devices['Pixel 7'], t => { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); }, TOKEN);
  await confere(p, 'instalar:SIM | entrada:não | módulos:SIM', 'Android já com acesso no navegador: aviso de instalar, mas módulos liberados');
  // "continuar no navegador mesmo assim" libera a entrada
  p = await novo(devices['Pixel 7']); await p.click('[data-instalar=continuar]'); await p.waitForSelector('#fEntrar');
  await confere(p, SO_ENTRAR, 'Android "continuar no navegador mesmo assim": libera a entrada');
  p = await novo({ viewport: { width: 1200, height: 800 } });
  await confere(p, SO_ENTRAR, 'Desktop: entrada direta');
  const erros = paginas.flatMap(x => x.err);
  ok(!erros.length, 'sem erros de página', JSON.stringify(erros));
  await b.close();
})();
