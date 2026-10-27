const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Turno antigo (Termo do papel): com "Digitar do papel", o fiscal digita no app o nº, a data, o local, os fiscais, o horário e os totais do
// Termo (veículos fiscalizados e pessoas orientadas) e anexa o PDF. O servidor grava o turno encerrado (registroAntigo, pdfs), um veículo sem
// placa por veículo do Termo e as pessoas em pessoasEducacao; a letra segue a ordem do nº; conta no painel. PDF sobe ao Drive (aba Arquivos).
// Sem "Digitar do papel" ou com data futura: recusado. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))); if (!c) falhas++; };
const aba = async n => { const rows = await get('/__aba?nome=' + n); const cab = rows[0]; return rows.slice(1).map(r => Object.fromEntries(cab.map((c, i) => [c, r[i]]))); };
const diaM = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);
const ontem = diaM(Date.now() - 864e5), ANO = ontem.slice(0, 4);

(async () => {
  const b = await amb.lancar();
  try {
    const F = await U.fiscal('Fulano Ficticio Teste');
    const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, F.ls);
    const p = await c.newPage(), err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.type() === 'prompt' ? d.accept('35') : d.accept());
    await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
    await p.click('.modulo[data-v=home]'); await p.waitForSelector('[data-go=turnopapel]');
    const preencher = async (n, veic, pes) => {
      await p.click('[data-go=turnopapel]'); await p.waitForSelector('#fPapel');
      await p.fill('#pN', String(n)); await p.fill('#pData', ontem); await p.selectOption('#pLocal', 'BVA - JUNDIÁ');
      await p.fill('#pFiscal', 'Fulano Ficticio Teste e Beltrano Ficticio Teste'); await p.fill('#pIni', '00:00'); await p.fill('#pFim', '12:00');
      await p.fill('#pVeic', String(veic)); await p.fill('#pPes', String(pes)); await p.screenshot({ path: amb.saida('turno_papel_form.png'), fullPage: true });
      await p.setInputFiles('#pPdfs', { name: 'termo-ficticio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% termo ficticio\n%%EOF\n') });
      await p.waitForFunction(() => /termo-ficticio\.pdf/.test(document.querySelector('#pPdfLista').textContent));
      await p.click('#fPapel button[type=submit]'); await p.waitForFunction(() => /Turno do papel gravado/.test(document.querySelector('main').textContent), null, { timeout: 15000 });
      return p.textContent('main');
    };
    console.log('1) digitar o Termo do papel');
    const t1 = await preencher(31, 3, 12);
    ok(/TF-031-A-/.test(t1) && /3 veículo\(s\)/.test(t1) && /12 pessoa\(s\) orientada\(s\)/.test(t1), 'gravado: TF-031-A, 3 veículos, 12 pessoas', t1.slice(0, 300));
    await p.click('[data-go=turnopapel]'); await p.waitForSelector('#fPapel'); await p.click('[data-go=home]');
    const t2 = await preencher(31, 2, 5);
    ok(/TF-031-B-/.test(t2), 'o mesmo nº de novo na mesma BVA: TF-031-B', t2.slice(0, 200));
    await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1500); await p.evaluate(() => Sync.sincronizar()); await p.waitForTimeout(1500);
    const ts = (await aba('Turnos')).filter(t => /^TF-031-/.test(t.numeroTF)), vs = await aba('Veiculos');
    const ta = ts.find(t => t.letra === 'A');
    ok(ts.length === 2 && ta && String(ta.encerrado) === '1' && String(ta.registroAntigo) === '1' && String(ta.pessoasEducacao) === '12' && ta.fiscal === 'Fulano Ficticio Teste e Beltrano Ficticio Teste' && ta.data === ontem,
      'planilha: turno encerrado, do papel, com as pessoas e os fiscais', ta);
    ok(vs.filter(v => v.turnoId === ta.id).length === 3 && vs.filter(v => v.turnoId === ta.id).every(v => v.placa === '' && v.obs === 'Termo do papel'), 'planilha: 3 veículos sem placa ("Termo do papel")');
    const arq = (await aba('Arquivos')).filter(a => a.dono === 'turnos' && a.donoId === ta.id);
    ok(arq.length === 1 && arq[0].tipo === 'documento' && JSON.parse(ta.pdfs || '[]').includes(arq[0].id), 'PDF do Termo enviado ao Drive e ligado ao turno', arq);
    const adm = await amb.gerente('Gestora Ficticia Teste');
    const PD = await post({ action: 'painelDados', key: adm.token, de: ontem, ate: ontem });
    const tp = (PD.turnos || []).find(x => x.id === ta.id);
    ok(tp && tp.nVeiculos === 3 && tp.nPessoas === 12, 'painel: o turno do papel conta 3 veículos e 12 pessoas', tp && [tp.nVeiculos, tp.nPessoas]);

    console.log('1b) Histórico: corrigir o nº do turno (Jundiá, desde 24/10)');
    await p.click('[data-go=home]').catch(() => {}); await p.click('nav [data-v=historico]'); await p.waitForSelector(`[data-numturno="${ta.id}"]`, { timeout: 10000 });
    await p.click(`[data-numturno="${ta.id}"]`);
    await p.waitForFunction(() => /Nº corrigido: TF-035-A/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
    const tc = (await aba('Turnos')).find(t => t.id === ta.id);
    ok(tc.numeroTF === `TF-035-A-${ANO}` && /TF-035-A/.test(await p.textContent('main')), 'botão "Corrigir nº" no Histórico: TF-031-A vira TF-035-A (planilha e tela)', tc.numeroTF);

    console.log('2) regras do servidor');
    const base = { id: '11111111-2222-4333-8444-555555555555', numero: 40, data: ontem, posto: 'Fixa', local: 'BVA - JUNDIÁ', fiscal: 'Fulano Ficticio Teste', inicio: '00:00', fim: '12:00' };
    let r = await post({ action: 'turnoPapelRegistrar', key: F.token, turno: { ...base, data: diaM(Date.now() + 3 * 864e5) }, veiculos: 1, pessoas: 1 });
    ok(!r.ok && /futuro/.test(r.erro), 'data no futuro: recusada', r.erro);
    r = await post({ action: 'turnoPapelRegistrar', key: F.token, turno: { ...base, fiscal: 'Fulano' }, veiculos: 1, pessoas: 1 });
    ok(!r.ok && /nome completo/.test(r.erro), 'fiscal sem sobrenome: recusado', r.erro);
    const G = await U.fiscal('Ciclano Ficticio Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito'] });
    r = await post({ action: 'turnoPapelRegistrar', key: G.token, turno: base, veiculos: 1, pessoas: 1 });
    ok(!r.ok && r.semPermissao === 'antigo', 'sem "Digitar do papel": recusado', r.erro);
    r = await post({ action: 'turnoPapelRegistrar', key: F.token, turno: base, veiculos: 2, pessoas: 3 });
    const r2 = await post({ action: 'turnoPapelRegistrar', key: F.token, turno: base, veiculos: 2, pessoas: 3 });
    ok(r.ok && r2.ok && r2.existente && (await aba('Veiculos')).filter(v => v.turnoId === base.id).length === 2, 'reenvio com o mesmo id não duplica turno nem veículos');
    ok(!err.length, 'sem erros de página', err);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
