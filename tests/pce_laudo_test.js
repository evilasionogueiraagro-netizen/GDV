const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE — dados do levantamento antigo (tipo de local, origem da visita e comercial) e resultado de laboratório do Termo de Colheita.
// Levantamento antigo: enviado pelo aparelho, sincronizado ida e volta, linha "Local: … · Origem: …" no PDF aberto no app (só leitura). Laudo:
// só no painel (painelPceLaudo, só a coluna laboratorio, com quem/quando): colunas "Tipo de local"/"Origem" (tabela e CSV), coluna "Resultado"
// dos termos, alertas (sem resultado > 30 dias do envio: atenção; positiva: crítico) e o reenvio do termo pelo celular (edição feita sem internet,
// com o resultado antigo) não apaga o lançado no painel. O laudo e o formulário do levantamento saíram do app.
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
  const TOKF = (await U.fiscal('Pessoa Ficticia Alfa')).token;
  const c = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -3.12, longitude: -60.02, accuracy: 9 }, timezoneId: 'America/Manaus' });
  await c.addInitScript(([t]) => {
    if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Pessoa Ficticia Alfa'); localStorage.setItem('gdv.semInstalar', '1'); }
    if (window !== window.top) window.print = () => { const d = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: d.body.innerText.replace(/\s+/g, ' ') }); };
  }, [TOKF]);
  const p = await c.newPage(); p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  const sync = () => p.evaluate(() => Sync.sincronizar());

  // O app só abre o levantamento antigo (leitura e PDF) e não tem mais formulário nem laudo: o levantamento entra pelo envio do aparelho
  // (aqui, direto pela API) e o resultado do laboratório é lançado no painel.
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(() => Store.setMeta('pceServidor', { nome: 'Pessoa Ficticia Alfa', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '1', lotacao: 'Manaus' }));
  const cult = resultado => ({ cultura: 'Cacau', area: '2', espLinha: '4', espPlanta: '3', espUnidade: 'm', resultado, coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] });
  const LEV = { id: 'lev-laudo-1', data: dia(5), hora: '09:00', servidor: 'Pessoa Ficticia Alfa', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', doc: '52998224725', nome: 'RAIMUNDO NONATO', propriedade: 'Sítio Esperança',
    codigoPropriedade: 'PRP-90', municipio: 'Manaus', uf: 'AM', lat: '-3.1', lon: '-60.0', culturas: '[]', fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(),
    pragas: JSON.stringify([{ praga: 'Monilíase do Cacaueiro', culturas: [cult('suspeita')] }]), tipoLocal: 'Escola agrícola', origemVisita: 'Delimitação de foco', comercial: 'sim' };

  console.log('1. Levantamento antigo enviado pelo aparelho: tipo de local, origem da visita e comercial');
  let r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [LEV] });
  ok(r.ok && !(r.recusados.levantamentos || []).length, 'levantamento antigo (aparelho com pendência) aceito pelo servidor', r.recusados);
  let L = await linhaDe('Levantamentos', LEV.id);
  ok(L && L.tipoLocal === 'Escola agrícola' && L.origemVisita === 'Delimitação de foco' && L.comercial === 'sim', 'planilha: colunas tipoLocal, origemVisita (texto livre do "Outro") e comercial', L && [L.tipoLocal, L.origemVisita, L.comercial]);
  r = await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...LEV, tipoLocal: 'Viveiro', comercial: 'talvez', atualizadoEm: Date.now() + 1000 }] });
  L = await linhaDe('Levantamentos', LEV.id);
  ok(L && L.tipoLocal === 'Viveiro' && L.comercial === '', 'servidor: "comercial" só aceita sim, nao ou vazio', L && [L.tipoLocal, L.comercial]);
  await sync(); await p.waitForTimeout(800);
  const noAparelho = await p.evaluate(async id => { const l = await Store.obter('levantamentos', id); return l && { tipoLocal: l.tipoLocal, origemVisita: l.origemVisita, comercial: l.comercial }; }, LEV.id);
  ok(noAparelho && noAparelho.tipoLocal === 'Viveiro' && noAparelho.origemVisita === 'Delimitação de foco' && noAparelho.comercial === '', 'sincronização de volta: o valor da planilha chega ao aparelho', noAparelho);
  await post({ action: 'sync', key: TOKF, since: 0, levantamentos: [{ ...LEV, tipoLocal: 'Escola agrícola', comercial: 'sim', atualizadoEm: Date.now() + 2000 }] });
  await sync(); await p.waitForTimeout(600);
  await p.evaluate(id => go('pcelevver', id), LEV.id); await p.waitForSelector('#pce-lev-ver');
  await p.evaluate(() => { window.__prints = []; }); await p.click('.pce-pdf >> nth=0');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 15000 });
  ok(/Local: Escola agrícola · Comercial: sim · Origem: Delimitação de foco/.test((await p.evaluate(() => window.__prints[0])).texto), 'levantamento antigo aberto no app (só leitura): PDF com a linha "Local: … · Comercial: … · Origem: …"');

  console.log('2. Termo de Colheita com resultado de laboratório');
  const TERMO = { id: 'tc-laudo-1', unidade: 'MANAUS', ano: Number(dia(40).slice(0, 4)), numero: 7, numeroTxt: `007/${dia(40).slice(0, 4)}/MANAUS`, levantamentoId: LEV.id, data: dia(40), hora: '10:00',
    servidor: 'Pessoa Ficticia Alfa', municipio: 'Manaus', doc: '52998224725', nome: 'RAIMUNDO NONATO', cultura: 'Cacau', quantidade: 2, analise: 'Fitopatológica', partes: 'frutos', fotos: '[]',
    assinaturas: '{}', local: 'Manaus/AM', cancelado: 0, excluido: 0, criadoEm: Date.now(), atualizadoEm: Date.now(),
    laboratorio: JSON.stringify({ laboratorio: 'LFDA-GO', envio: dia(38), resultado: 'aguardando', atualizadoEm: Date.now() }) };
  r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [TERMO] });
  ok(r.ok, 'termo de colheita do servidor na planilha, aguardando o laboratório', r.erro);
  await sync(); await p.waitForTimeout(800);
  let Tm = await linhaDe('Colheitas', TERMO.id), lab = JSON.parse(Tm.laboratorio || '{}');
  ok(lab.laboratorio === 'LFDA-GO' && lab.envio === dia(38) && lab.resultado === 'aguardando' && lab.atualizadoEm > 0 && Tm.numeroTxt === TERMO.numeroTxt && Tm.numero === 7,
    'planilha: coluna laboratorio (JSON com data de envio e momento); número do termo não mudou', [Tm.laboratorio, Tm.numeroTxt]);
  await p.evaluate(() => go('pcetermos')); await p.waitForSelector('.item.pce-termo');
  ok(await p.locator('[data-pce=laudo]').count() === 0 && /Colheita/.test(await p.textContent('.item.pce-termo')), 'lista de Termos do app: o Termo de Colheita aparece e o laudo não se lança mais no app');

  console.log('3. Painel: colunas, registro do resultado e alertas');
  const adm = await amb.gerente('Gerente Lab'), TOK = adm.token;
  const pc = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', serviceWorkers: 'block', acceptDownloads: true });
  await pc.addInitScript(([tok, url, de, ate]) => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Lab');
    localStorage.setItem('gdv.painel.filtro', JSON.stringify({ preset: 'custom', de, ate })); localStorage.setItem('gdv.painel.aba', 'pce'); } }, [TOK, amb.API_URL, dia(60), dia(0)]);
  await pc.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  const P = await pc.newPage(); P.on('pageerror', e => err.push('painel: ' + e.message)); P.on('dialog', d => d.accept());
  await P.goto(amb.PAINEL); await P.waitForSelector('.pn-aba[data-aba=pce][aria-selected=true]', { timeout: 30000 }); await P.waitForSelector('[data-laudo]', { timeout: 30000 });
  const txtPce = await P.textContent('#pn-conteudo');
  ok(/Tipo de local/.test(txtPce) && /Origem da visita/.test(txtPce) && /Escola agrícola/.test(txtPce) && /Delimitação de foco/.test(txtPce), 'tabela de levantamentos (antigos) com "Tipo de local" e "Origem da visita"');
  const [dl] = await Promise.all([P.waitForEvent('download'), P.click('.pn-tab:has(th:text("Tipo de local")) .pn-tab-acoes button')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(/Tipo de local;Comercial;Origem da visita/.test(csv) && /Escola agrícola;(Sim|Não|não informado);Delimitação de foco/.test(csv), 'CSV dos levantamentos com tipo de local, comercial e origem', csv.split('\n')[0]);
  ok(/Aguardando · LFDA-GO/.test(txtPce), 'termos de colheita: coluna "Resultado" (aguardando, laboratório)');
  ok(/1 amostra\(s\) sem resultado há mais de 30 dias do envio/.test(txtPce), 'alerta "atenção": amostra sem resultado há mais de 30 dias do envio');
  // o aparelho edita o termo SEM internet (com o resultado antigo) enquanto o painel registra o laudo
  await c.setOffline(true);
  await p.evaluate(async id => { const t = await Store.obter('colheitas', id); await Store.salvar('colheitas', { ...t, local: 'Manaus/AM (editado no aparelho)' }); }, TERMO.id);
  await P.click(`[data-laudo="${TERMO.id}"]`); await P.waitForSelector('#pn-laudo[open]');
  ok(await P.inputValue('#pn-lab-lab') === 'LFDA-GO' && await P.inputValue('#pn-lab-envio') === dia(38), 'diálogo do painel já vem com o registro enviado pelo aparelho');
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
  // reenvio direto com resultado mais velho (API): continua o do painel; com resultado mais novo: vale o novo
  r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [{ ...TERMO, atualizadoEm: Date.now() + 5000, laboratorio: JSON.stringify({ laboratorio: 'LFDA-GO', resultado: 'aguardando', atualizadoEm: 1 }) }] });
  Tm = await linhaDe('Colheitas', TERMO.id);
  ok(JSON.parse(Tm.laboratorio).resultado === 'positivo', 'sync com resultado mais velho: mantém o mais novo (mesclagem pelo atualizadoEm do resultado)');
  r = await post({ action: 'sync', key: TOKF, since: 0, colheitas: [{ ...TERMO, atualizadoEm: 1, laboratorio: JSON.stringify({ laboratorio: 'LFDA-GO', resultado: 'negativo', atualizadoEm: Date.now() + 10000 }) }] });
  Tm = await linhaDe('Colheitas', TERMO.id);
  ok(JSON.parse(Tm.laboratorio).resultado === 'negativo' && Tm.local === 'Manaus/AM' && Number(Tm.atualizadoEm) > 1, 'termo mais velho com resultado mais novo: grava só o resultado (o resto do termo continua o mais novo)', [Tm.laboratorio, Tm.local]);
  r = await post({ action: 'painelPceLaudo', key: TOKF, id: TERMO.id, laboratorio: { resultado: 'negativo' } });
  ok(!r.ok && /não inclui o painel/.test(r.erro), 'painelPceLaudo: fiscal recusado', r.erro);
  r = await post({ action: 'painelPceLaudo', key: TOK, id: 'nao-existe', laboratorio: { resultado: 'negativo' } });
  ok(!r.ok && /não encontrado/.test(r.erro), 'painelPceLaudo: termo inexistente recusado', r.erro);
  ok(!err.length, 'sem erros de JavaScript', err.slice(0, 4));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
