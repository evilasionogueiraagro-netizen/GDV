const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Volante que não conta veículos (CONFIG.volantesSoPessoas: Tabatinga, educação sanitária da monilíase no porto, meta 1.9 do convênio):
// app real (Chromium) + Code.gs real. Confere: no volante com unidade TABATINGA o "Só educação sanitária" vem marcado e o local do porto
// sugerido; o turno mostra o contador de pessoas orientadas (+1/+5/+10/corrigir) no lugar de "Registrar veículo"; o total vai para a
// planilha (Turnos.pessoasEducacao, soPessoas = 1); o Termo fala das pessoas orientadas sobre a monilíase (sem veículos); o painel, o
// VIGIFITO (Tabatinga volante: educação sanitária e abordagem) e a etapa 1.9 do convênio contam o turno, sem veículo nenhum. Dados fictícios.
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const diaManaus = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const b = await amb.lancar();
  try {
    const F = await U.fiscal('Fiscal Ficticio Teste');
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: -4.2316, longitude: -69.9406, accuracy: 10 } });
    await ctx.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [F.token, 'Fiscal Ficticio Teste']);
    await ctx.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__prints = window.top.__prints || []; window.top.__prints.push(document.body.innerText.replace(/\s+/g, ' ')); }; });
    const p = await ctx.newPage(); const err = []; const dialogos = [];
    p.on('pageerror', e => err.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && err.push(m.text()));
    p.on('dialog', d => { dialogos.push(d.message()); d.type() === 'prompt' ? d.accept('12') : d.accept(); });
    await p.goto(APP); await p.waitForSelector('.modulo');

    console.log('1) turno volante em Tabatinga: contador de pessoas no lugar dos veículos');
    await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
    await p.fill('#nTF', '3'); await p.selectOption('#nPosto', 'Móvel'); await p.waitForSelector('#nSoPessoas');
    ok(!(await p.isChecked('#nSoPessoas')), 'volante em outro município: "Só educação sanitária" desmarcado');
    await p.fill('#nUnidade', 'TABATINGA'); await p.waitForTimeout(300);
    ok(await p.isChecked('#nSoPessoas') && /Porto Hidroviário de Tabatinga/.test(await p.inputValue('#nLocal')), 'unidade TABATINGA: "Só educação sanitária" marcado e o local do porto sugerido', await p.inputValue('#nLocal'));
    await p.fill('#nFiscal2', 'Beltrano Ficticio Teste');
    await p.click('#fTurno button[type=submit]'); await p.waitForSelector('#pesCont');
    ok(!(await p.locator('[data-go=registrar]').count()) && /Pessoas orientadas/.test(await p.textContent('#pesCont')) && /Monilíase/.test(await p.textContent('main')),
      'tela do turno: contador "Pessoas orientadas" (monilíase), sem "Registrar veículo"');
    for (const n of ['5', '1', '10']) { await p.click(`[data-pes="${n}"]`); await p.waitForTimeout(250); }
    ok((await p.textContent('#pesCont h1')).trim() === '16', 'contador: +5 +1 +10 = 16', await p.textContent('#pesCont h1'));
    await p.click('[data-pes="corrigir"]'); await p.waitForTimeout(300);
    ok((await p.textContent('#pesCont h1')).trim() === '12', 'corrigir total: 12');
    await p.click('nav [data-v=registrar]'); await p.waitForSelector('#pesCont');
    // #pesCont já estava na tela: espera o aviso, que pode chegar depois do clique
    await p.waitForFunction(() => /não se registram veículos/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 3000 }).catch(() => {});
    ok(/não se registram veículos/.test(await p.textContent('#toast')), 'aba Registrar: avisa que não se registram veículos e volta ao contador');
    await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]');
    ok(/12 pessoas orientadas/.test(await p.textContent('main')) && !/veículos/.test(await p.textContent('main .card')), 'turno encerrado: "12 pessoas orientadas", sem veículos');
    await p.evaluate(() => { window.__prints = []; }); await p.click('[data-doc=termo]');
    await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 8000 });
    const termo = await p.evaluate(() => window.__prints[0]);
    ok(/Foram realizadas 12 ações de educação sanitária \(pessoas orientadas\) sobre a Monilíase do Cacaueiro/.test(termo) && !/Foram fiscalizados/.test(termo), 'Termo: 12 ações de educação sanitária sobre a monilíase, sem frase de veículos', termo.slice(0, 600));
    ok(/Porto Hidroviário de Tabatinga/.test(termo) && /AÇÃO VOLANTE – TABATINGA/.test(termo), 'Termo: ação volante em Tabatinga, com o local do porto');
    await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(2500); await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(2000);

    console.log('2) planilha, painel, VIGIFITO e dashboard público');
    const t = (await ler('Turnos')).find(x => x.unidade === 'TABATINGA');
    ok(t && t.pessoasEducacao === 12 && t.soPessoas === 1 && t.posto === 'Móvel' && t.encerrado === 1, 'Turnos: volante, soPessoas = 1, pessoasEducacao = 12, encerrado', t);
    ok(!(await ler('Veiculos')).some(v => v.turnoId === (t && t.id)), 'nenhum veículo gravado no turno');
    const adm = await get('/__gerar?nome=' + encodeURIComponent('Gestora Ficticia Teste') + '&perfil=admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
    const hoje = diaManaus(Date.now());
    const PD = await post({ action: 'painelDados', key: TOK, de: hoje, ate: hoje });
    const tp = PD.ok && (PD.turnos || []).find(x => x.id === (t && t.id));
    ok(tp && tp.nVeiculos === 0 && tp.nPessoas === 12 && tp.pessoasEducacao === 12, 'painel: turno com 0 veículos e 12 pessoas', tp);
    const VD = await post({ action: 'painelVigDados', key: TOK, ano: Number(hoje.slice(0, 4)) });
    const X = ((VD.apuracao.porMes || {})['tabatinga-volante'] || {})[hoje.slice(0, 7)] || {};
    ok(X.educacao === 12 && X.veiculos === 0 && X.turnos === 1 && X.abordagem === 1, 'VIGIFITO Tabatinga volante: educação sanitária 12, veículos 0, 1 abordagem itinerante', X);
    const CA = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: hoje, ate: hoje });
    const e19 = CA.ok && CA.etapas['1.9'], m19 = e19 && (e19.porMunicipio || [])[0];
    ok(!CA.ok || (m19 && m19.total.turnos === 1 && m19.total.veiculos === 0), 'convênio 1.9 (fiscalização móvel, Tabatinga): 1 ação, sem veículos', CA.ok ? e19 : CA.erro);
    ok(!err.length, 'sem erros de página', err);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
