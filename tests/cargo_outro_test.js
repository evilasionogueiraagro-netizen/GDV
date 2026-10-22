const amb = require('./lib/amb');
// PCE: cargo fora da lista ("Outro (digitar)") em Meus dados — salva o texto, reabre como "Outro" preenchido.
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const r = await amb.usuario('Estagiaria Teste Silva');
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Estagiaria Teste Silva'); localStorage.setItem('gdv.semInstalar', '1'); } }, [r.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  ok(await p.locator('#pce-s-cargo option', { hasText: 'Outro (digitar)' }).count() === 1 && await p.isHidden('#pce-s-cargo-outro'), 'lista tem "Outro (digitar)"; campo de texto escondido');
  await p.selectOption('#pce-s-cargo', '__outro__');
  ok(await p.isVisible('#pce-s-cargo-outro'), 'escolher "Outro" mostra o campo de texto');
  await p.click('#pce-s-salvar');
  ok(await p.isVisible('#pceServForm'), 'sem texto: não salva');
  await p.fill('#pce-s-cargo-outro', '  Estagiária   de Agronomia ');
  await p.selectOption('#pce-s-lotacao', { index: 1 });
  await p.click('#pce-s-salvar'); await p.waitForTimeout(500);
  const s = await p.evaluate(() => Store.meta('pceServidor'));
  ok(s && s.cargo === 'Estagiária de Agronomia', 'salva o cargo digitado', s && s.cargo);
  await p.evaluate(() => go('pceservidor')); await p.waitForSelector('#pceServForm');
  ok(await p.inputValue('#pce-s-cargo') === '__outro__' && await p.inputValue('#pce-s-cargo-outro') === 'Estagiária de Agronomia' && await p.isVisible('#pce-s-cargo-outro'), 'reabre com "Outro" e o texto preenchido');
  await p.selectOption('#pce-s-cargo', { index: 1 });
  ok(await p.isHidden('#pce-s-cargo-outro'), 'voltar para um cargo da lista esconde o texto');
  // Cadastro/Termo da monilíase (digitação do papel) usam o mesmo bloco do servidor: o cargo digitado vem do texto, não "__outro__".
  const mon = await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = PCEUI.servAntigoHTML('mt-', { sCargo: 'Técnico de Campo Terceirizado' }, []); document.body.appendChild(d);
    const v = PCEUI.cargoValor('mt-scargo'); d.remove(); return v; });
  ok(mon === 'Técnico de Campo Terceirizado', 'formulário do papel (monilíase): cargo fora da lista lido do texto', mon);
  ok(err.length === 0, 'sem erros de JavaScript', err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
