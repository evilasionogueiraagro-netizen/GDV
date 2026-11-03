const amb = require('./lib/amb'); const U = require('./lib/usuarios');
// TF de Barreira com internet lenta (plantão): a constatação e o enquadramento aparecem ao marcar o procedimento mesmo antes da
// planilha responder o nº do TF; TF gerado com o procedimento marcado e os textos vazios recebe os textos padrão.
const { APP, API } = amb;
let falhas = 0;
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar(), f = await U.fiscal('Ana Paula Lima');
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });
  await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [f.token, f.nome]);
  // internet lenta: a consulta do próximo nº demora 6 s
  await c.route(API + '/**', async rt => { const body = rt.request().postData() || ''; if (/tfProximoNumero/.test(body)) await new Promise(r => setTimeout(r, 6000)); rt.continue(); });
  const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo', { timeout: 15000 }); await p.click('.modulo[data-v=tf]'); await p.waitForSelector('button[data-tf=novo]');
  await p.click('button[data-tf=novo]'); await p.waitForSelector('#tfForm');
  ok(/Consultando/.test(await p.textContent('#tf-numero')), 'a planilha ainda não respondeu o nº (internet lenta)');
  await p.check('input[name=tf-proc][value=apreensao]'); await p.waitForTimeout(300);
  ok(/SEM a devida documentação/.test(await p.inputValue('#tf-constatacao')) && /Lei Federal nº 9\.712/.test(await p.inputValue('#tf-enquadramento')), 'procedimento marcado antes da resposta: constatação e enquadramento aparecem na hora');
  // textos apagados com o procedimento marcado: ao gerar, entram os textos padrão
  await p.fill('#tf-constatacao', ''); await p.fill('#tf-enquadramento', '');
  await p.fill('#tf-doc', '529.982.247-25'); await p.fill('#tf-nome', 'Fulano Ficticio Teste');
  await p.waitForFunction(() => !/Consultando/.test(document.querySelector('#tf-numero').textContent), null, { timeout: 15000 });
  await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m', { timeout: 20000 }); await p.click('#tf-m-ok'); await p.waitForSelector('text=TF gerado', { timeout: 15000 });
  const id = await p.evaluate(() => document.querySelector('[data-tf=imprimir]').dataset.id), t = await p.evaluate(i => Store.obter('tfs', i), id);
  ok(/SEM a devida documentação/.test(t.constatacao) && /Lei Federal nº 9\.712/.test(t.enquadramento), 'TF gerado com os campos vazios: recebe a constatação e o enquadramento padrão do procedimento');
  ok(!err.length, 'sem erros de página', err);
  await b.close(); console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
