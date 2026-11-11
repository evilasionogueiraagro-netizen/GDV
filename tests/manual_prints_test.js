const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const fs = require('fs'), path = require('path');
// Prints do Manual do fiscal (web/manual.html): percorre o app real (Chromium) + Code.gs real com dados fictícios, como um fiscal
// faria (entrar, escala, turno, veículo, colega, TF, encerrar, histórico, PCE), e tira um print de cada tela em tests/saida/manual/.
// Também confere que toda imagem citada no manual existe em web/img/manual/ (o manual não fica com print quebrado).
// Para atualizar os prints do manual depois de mudar uma tela: GDV_MANUAL_SALVAR=1 node run.js manual_prints_test
const { API, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const PASTA = amb.saida('manual'), DESTINO = path.join(amb.RAIZ, 'web', 'img', 'manual');
fs.mkdirSync(PASTA, { recursive: true });
const tirados = [];
async function print(p, nome, alvo) {
  await p.addStyleTag({ content: '#toast { display: none !important; }' });   // aviso passageiro não cobre o print
  await p.waitForTimeout(350);
  const arq = path.join(PASTA, nome + '.jpg'), o = { path: arq, type: 'jpeg', quality: 78 };
  if (alvo) await p.locator(alvo).first().screenshot(o); else await p.screenshot(o);
  tirados.push(nome);
}

(async () => {
  const b = await amb.lancar({ args: ['--no-sandbox', '--lang=pt-BR'] });
  try {
    const coord = await U.fiscal('Carla Coordenadora Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito', 'termoDeBarreira', 'coordenacaoBarreiras'] });
    const A = await U.fiscal('Fulano Ficticio Teste'), B = await U.fiscal('Beltrano Ficticio Teste');
    const D = await post({ action: 'escalaDados', key: coord.token }), id = n => D.fiscais.find(f => f.nome === n).id;
    const r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva: 'BVA - JUNDIÁ', inicio: dia(-2), fim: dia(7), fiscais: [id(A.nome), id(B.nome)], equipeNumero: '14', responsavelId: id(A.nome), situacao: 'publicada' } });
    ok(r.ok, 'escala publicada no Jundiá com os dois fiscais', r.erro);

    const contexto = async ls => {
      const c = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, timezoneId: 'America/Manaus', locale: 'pt-BR',
        permissions: ['geolocation'], geolocation: { latitude: -2.05, longitude: -60.02, accuracy: 10 } });
      await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), rt => rt.abort());
      if (ls) await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, ls);
      else await c.addInitScript(() => { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.semInstalar', '1'); });
      const p = await c.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('dialog', d => d.accept());
      return p;
    };

    console.log('1) entrar e escala');
    const p0 = await contexto(null);
    await p0.goto(APP); await p0.waitForSelector('#fEntrar'); await print(p0, '01-entrar');
    const p = await contexto(A.ls);
    await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());
    await p.waitForSelector('#escPop', { timeout: 10000 }).catch(() => {});
    if (await p.$('#escPop')) { await print(p, '02-sua-escala'); await p.click('#escPopOk'); }
    ok(tirados.includes('02-sua-escala'), 'aviso "Sua escala de plantão" ao abrir o app');
    await print(p, '03-modulos');

    console.log('2) turno');
    await p.click('.modulo[data-v=home]'); await p.waitForSelector('#fTurno');
    if (await p.$('#escPop')) await p.click('#escPopOk');
    await p.selectOption('#nPosto', 'Fixa'); await p.selectOption('#nLocal', 'BVA - JUNDIÁ'); await p.fill('#nTF', '12');
    if (!(await p.inputValue('#nFiscal1'))) await p.fill('#nFiscal1', A.nome);
    await print(p, '04-iniciar-turno');
    await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador', { timeout: 20000 });
    for (const [placa, i] of [['ABC1D23', 0], ['QWE4R56', 1]]) {
      await p.waitForTimeout(300); await p.click('nav [data-v=registrar]'); await p.waitForSelector('#fVeic');
      await p.fill('#placa', placa);
      if (await p.$('#pessoas')) await p.fill('#pessoas', String(2 + i));
      if (!i) await print(p, '06-registrar-veiculo');
      await p.click('#fVeic > button'); await p.waitForTimeout(400);
    }
    await p.click('nav [data-v=home]'); await p.waitForSelector('.contador'); await print(p, '05-turno');
    await p.evaluate(() => Sync.sincronizar());

    console.log('3) colega entra no turno');
    await p.click('#convidar'); await p.waitForTimeout(1500); await print(p, '07-convidar');
    const q = await contexto(B.ls);
    await q.goto(APP); await q.waitForSelector('.modulo'); await q.evaluate(() => Sync.sincronizar()); await q.waitForTimeout(600);
    if (await q.$('#escPop')) await q.click('#escPopOk');
    await q.click('.modulo[data-v=home]'); await q.waitForSelector('#fTurno'); if (await q.$('#escPop')) await q.click('#escPopOk');
    await q.selectOption('#nPosto', 'Fixa'); await q.selectOption('#nLocal', 'BVA - JUNDIÁ');
    await q.waitForSelector('[data-entrar]', { timeout: 15000 }).catch(() => {});
    ok(!!(await q.$('[data-entrar]')), 'colega vê "Turno em andamento nesta BVA"');
    if (await q.$('[data-entrar]')) { await print(q, '08-entrar-neste-turno'); await q.click('[data-entrar]'); await q.waitForSelector('.contador', { timeout: 15000 }); }

    console.log('4) lista de veículos e TF');
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(500);
    if (await p.$('#escPop')) await p.click('#escPopOk');
    if (!(await p.$('nav [data-v=lista]'))) { await p.click('.modulo[data-v=home]'); await p.waitForSelector('.contador'); }
    await p.click('nav [data-v=lista]'); await p.waitForSelector('[data-tfveic]'); await print(p, '09-lista-veiculos');
    await p.locator('[data-tfveic]').first().click(); await p.waitForSelector('#tfForm');
    await p.waitForFunction(() => document.querySelector('#tf-num') && !/Consultando/.test(document.querySelector('#tf-num-dica').textContent), null, { timeout: 10000 });
    await p.selectOption('#tf-barreira', { label: 'BVA - JUNDIÁ' }).catch(() => {});
    await p.fill('#tf-doc', '529.982.247-25'); await p.waitForFunction(() => /Novo cadastro|Cadastro encontrado/.test(document.querySelector('#tf-st-doc').textContent), null, { timeout: 8000 });
    await p.fill('#tf-nome', 'FULANO FICTICIO TESTE'); await p.fill('#tf-endereco', 'RUA DAS FLORES 10'); await p.fill('#tf-municipio', 'MANAUS');
    await p.fill('#tf-uf', 'am'); await p.fill('#tf-telefone', '92999990000'); await p.fill('#tf-origem', 'PRESIDENTE FIGUEIREDO'); await p.fill('#tf-destino', 'MANAUS');
    await p.evaluate(() => { document.querySelector('#tf-doc').closest('.card').scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
    await print(p, '10-tf-dados');
    await p.check('input[name=tf-proc][value=rechaco]');
    await p.selectOption('#tf-produtos .prod select >> nth=0', 'TOMATE'); await p.fill('#tf-produtos .prod input', '20');
    await p.locator('input[name=tf-proc][value=rechaco]').scrollIntoViewIfNeeded(); await print(p, '11-tf-procedimento');
    await p.click('#tfForm button[type=submit]'); await p.waitForSelector('#tf-num-m', { timeout: 15000 }); await print(p, '12-tf-numero');
    await p.click('#tf-m-ok'); await p.waitForSelector('text=TF gerado', { timeout: 10000 }); await print(p, '13-tf-gerado');

    console.log('5) encerrar, termo do turno e histórico');
    await p.click('nav [data-v=home]'); await p.waitForTimeout(400);
    await p.click('nav [data-v=resumo]'); await p.waitForSelector('#encerrar'); await print(p, '14-resumo');
    await p.click('#encerrar'); await p.waitForSelector('[data-doc=termo]', { timeout: 15000 }); await print(p, '15-turno-encerrado');
    await p.click('nav [data-v=historico]'); await p.waitForSelector('#hOut [data-doc=termo]');
    await p.evaluate(() => document.querySelector('#hOut [data-doc=termo]').scrollIntoView({ block: 'center' })); await print(p, '16-historico');

    console.log('6) PCE');
    await p.click('nav [data-v=modulos]'); await p.waitForSelector('.modulo[data-v=pce]');
    await p.click('.modulo[data-v=pce]'); await p.waitForTimeout(800); await print(p, '17-pce');

    ok(tirados.length >= 16, `${tirados.length} prints tirados em tests/saida/manual/`, tirados);
    ok(!p.erros.length && !q.erros.length && !p0.erros.length, 'sem erros de página', p.erros.concat(q.erros, p0.erros));

    // o manual só cita prints que existem
    const html = fs.readFileSync(path.join(amb.RAIZ, 'web', 'manual.html'), 'utf8');
    const citadas = [...html.matchAll(/src="img\/manual\/([^"]+)"/g)].map(m => m[1]);
    if (process.env.GDV_MANUAL_SALVAR) { fs.mkdirSync(DESTINO, { recursive: true }); tirados.forEach(n => fs.copyFileSync(path.join(PASTA, n + '.jpg'), path.join(DESTINO, n + '.jpg'))); console.log('  prints copiados para web/img/manual/'); }
    const faltam = citadas.filter(n => !fs.existsSync(path.join(DESTINO, n)));
    ok(!faltam.length, `manual: as ${citadas.length} imagens citadas existem em web/img/manual/`, faltam);
    ok(citadas.every(n => tirados.includes(n.replace(/\.jpg$/, ''))), 'manual: toda imagem citada é gerada por este teste', citadas.filter(n => !tirados.includes(n.replace(/\.jpg$/, ''))));
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
