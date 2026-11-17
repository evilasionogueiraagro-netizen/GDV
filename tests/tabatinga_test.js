const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Volante que não conta veículos (CONFIG.volantesSoPessoas: Tabatinga, educação sanitária da monilíase no porto, meta 1.9 do convênio):
// app real (Chromium) + Code.gs real. Confere: no volante com unidade TABATINGA o "Só educação sanitária" vem marcado e o local do porto
// sugerido; o turno mostra o contador de pessoas orientadas (+1/+5/+10/corrigir), "Registrar embarcação" (tipo Embarcação com o nome,
// sem placa e sem pessoas) e "Lavrar TF de barreira"; o total vai para a planilha (Turnos.pessoasEducacao, soPessoas = 1) e a embarcação
// para Veiculos (tipo EM, embarcacao); o Termo fala das pessoas orientadas sobre a monilíase e da embarcação fiscalizada; o painel, o
// VIGIFITO (Tabatinga volante: educação sanitária e abordagem) e a etapa 1.9 do convênio contam o turno. Dados fictícios.
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
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus', permissions: ['geolocation'], geolocation: { latitude: -3.1190, longitude: -60.0217, accuracy: 10 } });
    // sem internet de fora (endereço pela localização): o resultado não pode depender do ambiente (no CI a consulta funciona)
    await ctx.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
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
    await p.click('#fTurno button[type=submit]'); await p.waitForSelector('#pesCont');
    ok(/Registrar embarcação/.test(await p.textContent('main [data-go=registrar]')) && (await p.locator('main [data-go=tfnovo]').count()) === 1 &&
      /Pessoas orientadas/.test(await p.textContent('#pesCont')) && /Monilíase/.test(await p.textContent('main')),
      'tela do turno: contador "Pessoas orientadas" (monilíase), "Registrar embarcação" e "Lavrar TF de barreira"');
    for (const n of ['5', '1', '10']) { await p.click(`[data-pes="${n}"]`); await p.waitForTimeout(250); }
    ok((await p.textContent('#pesCont h1')).trim() === '16', 'contador: +5 +1 +10 = 16', await p.textContent('#pesCont h1'));
    await p.click('[data-pes="corrigir"]'); await p.waitForTimeout(300);
    ok((await p.textContent('#pesCont h1')).trim() === '12', 'corrigir total: 12');
    await p.click('main [data-go=registrar]'); await p.waitForSelector('#fVeic');
    ok(await p.isChecked('input[name=tipo][value=EM]') && await p.isVisible('#embarcacao') && !(await p.isVisible('#placa')) && !(await p.locator('#pessoas').count()) &&
      /Registrar embarcação/.test(await p.textContent('#fVeicTit')), 'Registrar: Embarcação marcada, título "Registrar embarcação", nome no lugar da placa, sem pessoas (ficam no contador)');
    await p.click('#fVeic button.botao'); await p.waitForTimeout(300);
    ok(/nome da embarcação/.test(await p.textContent('#toast')), 'embarcação sem nome: não salva');
    await p.fill('#embarcacao', 'b/m estrela ficticia'); await p.click('#fVeic button.botao'); await p.waitForTimeout(500);
    ok(/ESTRELA FICTICIA registrada/.test(await p.textContent('#toast')), 'embarcação registrada (nome em maiúsculas)', await p.textContent('#toast'));
    await p.click('nav [data-v=home]'); await p.waitForSelector('#pesCont');
    ok(/1\s*Embarcações e veículos fiscalizados/.test(await p.textContent('main')), 'tela do turno: 1 embarcação fiscalizada');
    await p.click('main [data-go=lista]'); await p.waitForSelector('.item');
    ok(/B\/M ESTRELA FICTICIA/.test(await p.textContent('.item .placa')) && /Embarcação/.test(await p.textContent('.item .tipo')) && !/Pessoas:/.test(await p.textContent('.item')),
      'lista: nome da embarcação no lugar da placa, tipo Embarcação');
    await p.click('.item [data-tfveic]'); await p.waitForSelector('#tfForm');
    ok(await p.inputValue('#tf-embarcacao') === 'B/M ESTRELA FICTICIA' && !(await p.inputValue('#tf-placa')),
      '"Lavrar TF" na embarcação: o TF vem com o nome da embarcação (sem placa)', await p.inputValue('#tf-embarcacao').catch(() => 'sem campo'));
    await p.click('nav [data-v=home]'); await p.waitForSelector('#pesCont');
    await p.click('main [data-go=tfnovo]'); await p.waitForSelector('#tfForm');
    ok(await p.evaluate(async () => { const r = await Store.meta('turnoAtual'); return !!r; }), 'Lavrar TF de barreira: abre o formulário do TF com o turno aberto');
    await p.click('nav [data-v=home]'); await p.waitForSelector('#pesCont');
    await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]');
    ok(/1 embarcação\(ões\)\/veículo\(s\) · 12 pessoas orientadas/.test(await p.textContent('main')), 'turno encerrado: 1 embarcação e 12 pessoas orientadas', await p.textContent('main .card'));
    await p.evaluate(() => { window.__prints = []; }); await p.click('[data-doc=termo]');
    await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 8000 });
    const termo = await p.evaluate(() => window.__prints[0]);
    ok(/Foram realizadas 12 ações de educação sanitária \(pessoas orientadas\) sobre a Monilíase do Cacaueiro/.test(termo) && !/Foram fiscalizados/.test(termo) &&
      /fiscalização de 1 embarcação\(ões\) \(B\/M ESTRELA FICTICIA\)/.test(termo), 'Termo: 12 ações de educação sanitária sobre a monilíase e a embarcação fiscalizada', termo.slice(0, 700));
    ok(/Porto Hidroviário de Tabatinga/.test(termo) && /AÇÃO VOLANTE – TABATINGA/.test(termo), 'Termo: ação volante em Tabatinga, com o local do porto');
    await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(2500); await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(2000);

    console.log('2) planilha, painel, VIGIFITO e dashboard público');
    const t = (await ler('Turnos')).find(x => x.unidade === 'TABATINGA');
    ok(t && t.pessoasEducacao === 12 && t.soPessoas === 1 && t.posto === 'Móvel' && t.encerrado === 1, 'Turnos: volante, soPessoas = 1, pessoasEducacao = 12, encerrado', t);
    const vs = (await ler('Veiculos')).filter(v => v.turnoId === (t && t.id));
    ok(vs.length === 1 && vs[0].tipo === 'EM' && vs[0].embarcacao === 'B/M ESTRELA FICTICIA' && !vs[0].placa && !vs[0].pessoas, 'Veiculos: a embarcação (tipo EM, nome, sem placa e sem pessoas)', vs);
    const adm = await amb.gerente('Gestora Ficticia Teste'), TOK = adm.token;
    const hoje = diaManaus(Date.now());
    const PD = await post({ action: 'painelDados', key: TOK, de: hoje, ate: hoje });
    const tp = PD.ok && (PD.turnos || []).find(x => x.id === (t && t.id));
    ok(tp && tp.nVeiculos === 1 && tp.nPessoas === 12 && tp.pessoasEducacao === 12, 'painel: turno com 1 embarcação e 12 pessoas', tp);
    ok((PD.veiculos || []).some(x => x.turnoId === (t && t.id) && x.embarcacao === 'B/M ESTRELA FICTICIA'), 'painel: a embarcação vem com o nome (no lugar de "s/ placa")');
    const VD = await post({ action: 'painelVigDados', key: TOK, ano: Number(hoje.slice(0, 4)) });
    const X = ((VD.apuracao.porMes || {})['tabatinga-volante'] || {})[hoje.slice(0, 7)] || {};
    ok(X.educacao === 12 && X.veiculos === 1 && X.turnos === 1 && X.abordagem === 1, 'VIGIFITO Tabatinga volante: educação sanitária 12, 1 embarcação, 1 abordagem itinerante', X);
    const CA = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: hoje, ate: hoje });
    const e19 = CA.ok && CA.etapas['1.9'], m19 = e19 && (e19.porMunicipio || [])[0];
    ok(!CA.ok || (m19 && m19.total.turnos === 1 && m19.total.veiculos === 1), 'convênio 1.9 (fiscalização móvel, Tabatinga): 1 ação, 1 embarcação', CA.ok ? e19 : CA.erro);
    ok(!err.length, 'sem erros de página', err);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
