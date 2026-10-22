const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE — campos novos do levantamento (tipo de local e origem da visita, com "Outro" digitável) e resultado de laboratório do Termo de Colheita.
// App: salvar, reabrir, sincronizar ida e volta, linha "Local: … · Origem: …" na ficha (PDF); listas com Soja, Amaranthus palmeri e Diaphorina
// citri; resultado do laboratório no termo (app) → planilha; painel: colunas "Tipo de local"/"Origem" (tabela e CSV), coluna "Resultado" dos
// termos, registro pelo administrador (painelPceLaudo, só a coluna laboratorio, com quem/quando), alertas (sem resultado > 30 dias do envio:
// atenção; positiva: crítico) e o reenvio do termo pelo celular (edição feita sem internet, com o resultado antigo) não apaga o lançado no painel.
const fs = require('fs');
const { API, APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; };
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const dia = n => new Date(Date.now() - 4 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const linhaDe = async (aba, id) => { const t = await get('/__aba?nome=' + aba); const i = t[0].indexOf('id'); const l = t.find(r => r[i] === id); return l ? Object.fromEntries(t[0].map((c, k) => [c, l[k]])) : null; };

(async () => {
  const b = await amb.lancar(), err = [];
  const TOKF = (await U.fiscal('Ana Paula Lima')).token;
  const c = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 }, timezoneId: 'America/Manaus' });
  await c.addInitScript(([t]) => {
    if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Ana Paula Lima'); localStorage.setItem('gdv.semInstalar', '1'); }
    if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' ') }); };
  }, [TOKF]);
  const p = await c.newPage(); p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const sync = () => p.evaluate(() => Sync.sincronizar());

  console.log('1. Levantamento: tipo de local e origem da visita');
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]'); await p.click('.modulo[data-v=pce]'); await p.waitForSelector('#pceServForm');
  await p.selectOption('#pce-s-cargo', { index: 1 }); await p.selectOption('#pce-s-lotacao', 'Manaus'); await p.click('#pce-s-salvar'); await p.waitForSelector('#pce-novolev');
  await p.click('#pce-novolev'); await p.waitForSelector('#pceLevForm');
  const opcoes = sel => p.$$eval(sel + ' option', os => os.map(o => o.textContent));
  const pragas = await opcoes('.pce-praga >> nth=0 >> .p-praga'), culturas = await opcoes('.pce-praga >> nth=0 >> .pce-cult >> nth=0 >> .c-cultura');
  ok(pragas.includes('Amaranthus palmeri') && pragas.includes('Diaphorina citri (vetor do HLB)') && culturas.includes('Soja'), 'listas: Soja nas culturas; Amaranthus palmeri e Diaphorina citri nas pragas');
  const tipos = await opcoes('#pce-tipolocal'), origens = await opcoes('#pce-origem');
  ok(tipos.includes('Viveiro') && tipos.includes('Unidade de Consolidação (UC)') && tipos.includes('Outro') && origens.includes('Notificação voluntária do produtor') && origens.includes('Delimitação de foco'),
    'campos "Tipo de local" e "Origem da visita" com as listas (opcionais: "Não informado")', [tipos.length, origens.length]);
  await p.fill('#pce-doc', '52998224725'); await p.fill('#pce-nome', 'Raimundo Nonato'); await p.fill('#pce-propriedade', 'Sítio Esperança'); await p.fill('#pce-codigo', 'PRP-90');
  await p.selectOption('.pce-praga >> nth=0 >> .p-praga', 'Monilíase do Cacaueiro'); await p.selectOption('.pce-praga >> nth=0 >> .pce-cult >> nth=0 >> .c-cultura', 'Cacau');
  await p.click('.pce-praga >> nth=0 >> .pce-cult >> nth=0 >> .pce-res-suspeita');
  ok(await p.isHidden('#pce-tipolocal-outro-l'), '"Qual?" escondido até escolher "Outro"');
  await p.selectOption('#pce-tipolocal', 'Outro'); ok(await p.isVisible('#pce-tipolocal-outro'), '"Outro" mostra o campo para digitar');
  await p.fill('#pce-tipolocal-outro', 'Escola agrícola'); await p.selectOption('#pce-origem', 'Delimitação de foco');
  await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  ok(/Local: Escola agrícola · Origem: Delimitação de foco/.test(await p.textContent('#pce-pronto-local')), 'tela "Levantamento salvo" mostra local e origem');
  await p.evaluate(() => { window.__prints = []; }); await p.click('.pce-pdf >> nth=0');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  ok(/Local: Escola agrícola · Origem: Delimitação de foco/.test((await p.evaluate(() => window.__prints[0])).texto), 'ficha (PDF): linha "Local: … · Origem: …"');
  await sync(); await p.waitForTimeout(800);
  const lid = await p.evaluate(async () => (await Store.todos('levantamentos'))[0].id);
  let L = await linhaDe('Levantamentos', lid);
  ok(L && L.tipoLocal === 'Escola agrícola' && L.origemVisita === 'Delimitação de foco', 'planilha: colunas tipoLocal e origemVisita (Outro = texto digitado)', L && [L.tipoLocal, L.origemVisita]);
  // volta da planilha: outro aparelho / reabrir
  await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...L, tipoLocal: 'Viveiro', atualizadoEm: Date.now() + 1000, srv_ts: undefined }] });
  await sync(); await p.waitForTimeout(800);
  await p.evaluate(id => go('pcelev', id), lid); await p.waitForSelector('#pceLevForm');
  ok(await p.inputValue('#pce-tipolocal') === 'Viveiro' && await p.inputValue('#pce-origem') === 'Delimitação de foco', 'sincronização de volta: o valor da planilha chega ao aparelho e reabre no formulário', [await p.inputValue('#pce-tipolocal'), await p.inputValue('#pce-origem')]);
  await p.selectOption('#pce-tipolocal', 'Outro'); await p.fill('#pce-tipolocal-outro', 'Escola agrícola'); await p.click('#pce-salvar'); await p.waitForSelector('#pce-lev-pronto');
  await p.evaluate(id => go('pcelev', id), lid); await p.waitForSelector('#pceLevForm');
  ok(await p.inputValue('#pce-tipolocal') === 'Outro' && await p.inputValue('#pce-tipolocal-outro') === 'Escola agrícola', 'reabrir: valor fora da lista volta como "Outro" + texto');
  await p.click('[data-pce=descartarlev]'); await p.waitForSelector('#pce-novolev');
  await sync(); await p.waitForTimeout(600);

  console.log('2. Termo de Colheita: resultado do laboratório no app');
  const TERMO = { id: 'tc-laudo-1', unidade: 'MANAUS', ano: Number(dia(40).slice(0, 4)), numero: 7, numeroTxt: `007/${dia(40).slice(0, 4)}/MANAUS`, levantamentoId: lid, data: dia(40), hora: '10:00',
    servidor: 'Ana Paula Lima', municipio: 'Manaus', doc: '52998224725', nome: 'RAIMUNDO NONATO', cultura: 'Cacau', quantidade: 2, analise: 'Fitopatológica', partes: 'frutos', fotos: '[]',
    assinaturas: '{}', local: 'Manaus/AM', cancelado: 0, excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now() };
  let r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [TERMO] });
  ok(r.ok, 'termo de colheita do servidor na planilha', r.erro);
  await sync(); await p.waitForTimeout(800);
  await p.evaluate(() => go('pcetermos')); await p.waitForSelector('.item.pce-termo');
  ok(/sem resultado registrado/.test(await p.textContent('.item.pce-termo')), 'lista de termos: "sem resultado registrado"');
  await p.click('.item.pce-termo [data-pce=laudo]'); await p.waitForSelector('#pce-modal-lab');
  await p.selectOption('#pce-lab-res', 'positivo'); await p.click('#pce-lab-salvar');
  ok(/praga confirmada/.test(await p.textContent('#toast')), 'positivo sem praga: recusado com mensagem');
  await p.selectOption('#pce-lab-res', 'aguardando'); await p.selectOption('#pce-lab-lab', 'LFDA-GO'); await p.fill('#pce-lab-envio', dia(38));
  await p.click('#pce-lab-salvar'); await p.waitForSelector('#pce-modal-lab', { state: 'detached' });
  await p.waitForFunction(() => /Aguardando/.test(document.querySelector('.item.pce-termo').textContent));
  await sync(); await p.waitForTimeout(800);
  let Tm = await linhaDe('Colheitas', TERMO.id), lab = JSON.parse(Tm.laboratorio || '{}');
  ok(lab.laboratorio === 'LFDA-GO' && lab.envio === dia(38) && lab.resultado === 'aguardando' && lab.por === 'Ana Paula Lima' && lab.atualizadoEm > 0 && Tm.numeroTxt === TERMO.numeroTxt && Tm.numero === 7,
    'planilha: coluna laboratorio (JSON com quem/quando); número do termo não mudou', [Tm.laboratorio, Tm.numeroTxt]);
  await p.screenshot({ path: amb.saida('pce_laudo_app.png'), fullPage: true });

  console.log('3. Painel: colunas, registro do resultado e alertas');
  const adm = await get('/__gerar?nome=Gerente%20Lab&perfil=admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const pc = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', serviceWorkers: 'block', acceptDownloads: true });
  await pc.addInitScript(([tok, url, de, ate]) => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Lab');
    localStorage.setItem('gdv.painel.filtro', JSON.stringify({ preset: 'custom', de, ate })); localStorage.setItem('gdv.painel.aba', 'pce'); } }, [TOK, amb.API_URL, dia(60), dia(0)]);
  await pc.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  const P = await pc.newPage(); P.on('pageerror', e => err.push('painel: ' + e.message)); P.on('dialog', d => d.accept());
  await P.goto(amb.PAINEL); await P.waitForSelector('.pn-aba[data-aba=pce][aria-selected=true]', { timeout: 30000 }); await P.waitForSelector('[data-laudo]', { timeout: 30000 });
  const txtPce = await P.textContent('#pn-conteudo');
  ok(/Tipo de local/.test(txtPce) && /Origem da visita/.test(txtPce) && /Escola agrícola/.test(txtPce) && /Delimitação de foco/.test(txtPce), 'tabela de levantamentos com "Tipo de local" e "Origem da visita"');
  const [dl] = await Promise.all([P.waitForEvent('download'), P.click('.pn-tab:has(th:text("Tipo de local")) .pn-tab-acoes button')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(/Tipo de local;Origem da visita/.test(csv) && /Escola agrícola;Delimitação de foco/.test(csv), 'CSV dos levantamentos com as duas colunas', csv.split('\n')[0]);
  ok(/Aguardando · LFDA-GO/.test(txtPce), 'termos de colheita: coluna "Resultado" (aguardando, laboratório)');
  ok(/1 amostra\(s\) sem resultado há mais de 30 dias do envio/.test(txtPce), 'alerta "atenção": amostra sem resultado há mais de 30 dias do envio');
  // o aparelho edita o termo SEM internet (com o resultado antigo) enquanto o painel registra o laudo
  await c.setOffline(true);
  await p.evaluate(async id => { const t = await Store.obter('colheitas', id); await Store.salvar('colheitas', { ...t, local: 'Manaus/AM (editado no aparelho)' }); }, TERMO.id);
  await P.click(`[data-laudo="${TERMO.id}"]`); await P.waitForSelector('#pn-laudo[open]');
  ok(await P.inputValue('#pn-lab-lab') === 'LFDA-GO' && await P.inputValue('#pn-lab-envio') === dia(38), 'diálogo do painel já vem com o registro do app');
  await P.selectOption('#pn-lab-res', 'positivo'); await P.fill('#pn-lab-praga', ''); await P.fill('#pn-lab-laudo', 'L-2026-99'); await P.fill('#pn-lab-data', dia(1));
  await P.click('#pn-lab-salvar'); await P.waitForFunction(() => /praga confirmada/.test(document.querySelector('#pn-lab-erro').textContent));
  ok(true, 'painel: positivo sem praga recusado pelo servidor');
  await P.fill('#pn-lab-praga', 'Monilíase do Cacaueiro'); await P.click('#pn-lab-salvar');
  await P.waitForSelector('#pn-laudo', { state: 'detached', timeout: 15000 });
  await P.waitForFunction(() => /Amostra positiva: Monilíase do Cacaueiro em Manaus/.test(document.querySelector('#pn-conteudo').textContent), null, { timeout: 30000 });
  ok(true, 'alerta "crítico": amostra positiva (praga e município)');
  Tm = await linhaDe('Colheitas', TERMO.id); lab = JSON.parse(Tm.laboratorio);
  ok(lab.resultado === 'positivo' && lab.por === 'Gerente Lab' && lab.laudo === 'L-2026-99' && Tm.local === 'Manaus/AM' && Tm.srv_ts > 0, 'painelPceLaudo grava só o resultado (quem/quando); o resto do termo não muda', [lab, Tm.local]);
  ok(/Positivo: Monilíase do Cacaueiro/.test(await P.textContent('#pn-conteudo')), 'coluna "Resultado" atualizada');
  await P.screenshot({ path: amb.saida('pce_laudo_painel.png'), fullPage: false });
  // o aparelho volta a ter internet e reenvia o termo editado (resultado antigo): a planilha mantém o resultado do painel
  await c.setOffline(false); await sync(); await p.waitForTimeout(1200); await sync(); await p.waitForTimeout(800);
  Tm = await linhaDe('Colheitas', TERMO.id); lab = JSON.parse(Tm.laboratorio);
  ok(Tm.local === 'Manaus/AM (editado no aparelho)' && lab.resultado === 'positivo' && lab.por === 'Gerente Lab', 'reenvio do termo pelo celular: edição aceita e o resultado do painel NÃO é apagado', [Tm.local, lab.resultado]);
  const local = await p.evaluate(async id => { const t = await Store.obter('colheitas', id); return { lab: JSON.parse(t.laboratorio || '{}'), pend: t.pendente }; }, TERMO.id);
  ok(local.lab.resultado === 'positivo' && !local.pend, 'o aparelho recebe o resultado do painel', local);
  await p.evaluate(() => go('pcetermos')); await p.waitForSelector('.item.pce-termo');
  ok(/Positivo: Monilíase do Cacaueiro/.test(await p.textContent('.item.pce-termo')), 'lista do app mostra "Positivo: Monilíase do Cacaueiro"');
  // reenvio direto com resultado mais velho (API): continua o do painel; com resultado mais novo: vale o novo
  r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [{ ...TERMO, atualizadoEm: Date.now() + 5000, laboratorio: JSON.stringify({ laboratorio: 'LFDA-GO', resultado: 'aguardando', atualizadoEm: 1 }) }] });
  Tm = await linhaDe('Colheitas', TERMO.id);
  ok(JSON.parse(Tm.laboratorio).resultado === 'positivo', 'sync com resultado mais velho: mantém o mais novo (mesclagem pelo atualizadoEm do resultado)');
  r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [{ ...TERMO, atualizadoEm: 1, laboratorio: JSON.stringify({ laboratorio: 'LFDA-GO', resultado: 'negativo', atualizadoEm: Date.now() + 10000 }) }] });
  Tm = await linhaDe('Colheitas', TERMO.id);
  ok(JSON.parse(Tm.laboratorio).resultado === 'negativo' && Tm.local === 'Manaus/AM' && Number(Tm.atualizadoEm) > 1, 'termo mais velho com resultado mais novo: grava só o resultado (o resto do termo continua o mais novo)', [Tm.laboratorio, Tm.local]);
  r = await post({ action: 'painelPceLaudo', key: TOKF, id: TERMO.id, laboratorio: { resultado: 'negativo' } });
  ok(!r.ok && /Acesso restrito/.test(r.erro), 'painelPceLaudo: fiscal recusado', r.erro);
  r = await post({ action: 'painelPceLaudo', key: TOK, id: 'nao-existe', laboratorio: { resultado: 'negativo' } });
  ok(!r.ok && /não encontrado/.test(r.erro), 'painelPceLaudo: termo inexistente recusado', r.erro);
  ok(!err.length, 'sem erros de JavaScript', err.slice(0, 4));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
