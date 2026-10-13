const amb = require('./lib/amb');
// App de campo em tablet e computador: menu embaixo (celular/tablet) ou na lateral (PC), sem rolagem horizontal, módulos em grade.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const g = await (await fetch(API + '/__gerar?nome=' + encodeURIComponent('Ana Paula Lima'))).json();
  const r = await (await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'ativar', codigo: g.codigo }) })).json();
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); } }, [r.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  const semRolagem = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const navInfo = () => p.evaluate(() => { const n = document.querySelector('#nav').getBoundingClientRect(), m = document.querySelector('#view').getBoundingClientRect();
    return { navW: Math.round(n.width), navH: Math.round(n.height), navTop: Math.round(n.top), mainL: Math.round(m.left), mainW: Math.round(m.width) }; });
  const colunasModulos = () => p.evaluate(() => new Set([...document.querySelectorAll('.modulos .modulo')].map(e => Math.round(e.getBoundingClientRect().left))).size);

  let n = await navInfo();
  ok(n.navTop > 700 && n.navW === 390 && await colunasModulos() === 1 && await semRolagem(), 'celular: menu embaixo, módulos em 1 coluna, sem rolagem horizontal', n);

  await p.setViewportSize({ width: 820, height: 1180 }); await p.waitForTimeout(200);
  n = await navInfo();
  ok(n.navTop > 1000 && n.mainW >= 740 && await colunasModulos() === 2 && await semRolagem(), 'tablet: conteúdo mais largo, módulos em 2 colunas, menu embaixo', n);
  await p.screenshot({ path: amb.saida('responsivo_tablet_modulos.png') });

  await p.setViewportSize({ width: 1366, height: 768 }); await p.waitForTimeout(200);
  n = await navInfo();
  ok(n.navW === 216 && n.navH > 600 && n.mainL >= 216 && n.mainW > 900 && await semRolagem(), 'PC: menu na lateral esquerda, conteúdo largo ao lado', n);
  ok(await colunasModulos() === 3, 'PC: módulos em 3 colunas', await colunasModulos());
  await p.screenshot({ path: amb.saida('responsivo_pc_modulos.png') });

  await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  n = await navInfo();
  const botoes = await p.evaluate(() => [...document.querySelectorAll('#nav button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
  ok(botoes.length >= 4 && botoes.every(([l, w]) => l < 216 && w > 150), 'PC: botões do menu do PCE empilhados na lateral', botoes);
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  const fw = await p.evaluate(() => Math.round(document.querySelector('#view').getBoundingClientRect().width));
  ok(fw >= 800 && fw <= 900 && await semRolagem(), 'PC: formulário com largura confortável (≤ 880 px de conteúdo)', fw);
  await p.screenshot({ path: amb.saida('responsivo_pc_levantamento.png') });
  await p.setViewportSize({ width: 820, height: 1180 }); await p.waitForTimeout(200);
  ok(await semRolagem(), 'tablet: formulário do levantamento sem rolagem horizontal');
  await p.screenshot({ path: amb.saida('responsivo_tablet_levantamento.png') });
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
