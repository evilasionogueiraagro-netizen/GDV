const amb = require('./lib/amb');
// Painel: o mesmo servidor digitado de jeitos diferentes (maiúsculas, acento, espaço a mais) conta como uma pessoa só nos gráficos
// "Por fiscal" (aba TF) e "Produtividade por fiscal" (aba Barreiras) e no filtro de fiscal. Vale a grafia mais usada. TF do papel (sem
// turno) com o local digitado de vários jeitos entra na linha da barreira escolhida em "Desempenho por barreira". Dados fictícios.
const { API, PAINEL: WEB } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = Number(hoje.slice(0, 4)), ag = Date.now();
const TF = (n, fiscal, proc, x = {}) => ({ id: 'n' + n, barreira: 'BVA-CEASA', ano: ANO, numero: n, numeroTxt: `${String(n).padStart(4, '0')}/${ANO} - BVA - CEASA`, data: hoje, hora: '09:00',
  fiscal, local: 'BVA - CEASA', placa: 'ABC1D23', doc: '52998224725', nome: 'Fulano Ficticio Teste', procedimento: proc, produtos: '[]', cancelado: 0, criadoEm: ag + n, atualizadoEm: ag + n, emitidoEm: ag + n, ...x });
const TURNO = (id, fiscal, local = 'BVA - CEASA') => ({ id, numeroTF: 'TF-' + id, data: hoje, letra: 'A', inicio: '06:00', fim: '12:00', fiscal, local, unidade: 'MANAUS', posto: 'Fixa', encerrado: 1, criadoEm: ag, atualizadoEm: ag });

(async () => {
  const tfs = [TF(1, 'FULANO FICTICIO TESTE', 'apreensao'), TF(2, 'FULANO FICTICIO TESTE', 'apreensao'), TF(3, 'Fulano  Fictício Teste', 'liberacao'),
    TF(4, 'Beltrano Ficticio Teste e fulano ficticio teste', 'liberacao'), TF(5, 'BELTRANO FICTICIO TESTE', 'apreensao'),
    // TFs do papel da BVA - Jundiá: sem turno, local digitado de jeitos diferentes
    TF(6, 'Ciclano Ficticio Teste', 'apreensao', { barreira: 'BVA-JUNDIÁ', local: 'BR 174 km75' }), TF(7, 'Ciclano Ficticio Teste', 'apreensao', { barreira: 'BVA-JUNDIÁ', local: 'BR 174, KM 75, PVA JUNDIÁ - RORAINÓPOLIS' }),
    // quantidades como o TF grava ("PRODUTO - qtd unidade"): "12.723 Ton" é 12,723 t; "1.500 Kg" é mil e quinhentos; 80 t num produto = alerta
    TF(8, 'Ciclano Ficticio Teste', 'liberacao', { produtos: JSON.stringify(['LARANJA - 12.723 Ton']) }),
    TF(9, 'Ciclano Ficticio Teste', 'apreensao', { produtos: JSON.stringify(['MANGA - 1.500 Kg', 'LIMÃO - 80 Ton']) })];
  const turnos = [TURNO('n1', 'Fulano Ficticio Teste'), TURNO('n2', 'FULANO FICTICIO TESTE e Beltrano Ficticio Teste'), TURNO('n3', 'Ciclano Ficticio Teste', 'BVA - JUNDIÁ')];
  const veiculos = [{ id: 'nv1', turnoId: 'n1', hora: '07:00', placa: 'ABC1D23', tipo: 'PA', pessoas: 2, criadoEm: ag, atualizadoEm: ag },
    { id: 'nv2', turnoId: 'n2', hora: '08:00', placa: 'ABC1D24', tipo: 'PA', pessoas: 1, criadoEm: ag, atualizadoEm: ag }];
  const TOK = await amb.carga();   // gerente: grava os registros e abre o painel
  const r = await post({ action: 'sync', key: TOK, since: 0, tfs, turnos, veiculos });
  ok(r.ok, 'registros gravados', r.erro);

  const b = await amb.lancar();
  try {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), rt => rt.abort());
    await c.addInitScript(t => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API);
      localStorage.setItem('gdv.painel.token', t); localStorage.setItem('gdv.painel.nome', 'Gestora Ficticia Teste'); } }, TOK);
    const p = await c.newPage(), err = [];
    p.on('pageerror', e => err.push(e.message));
    await p.goto(WEB); await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 });
    const grafico = titulo => p.evaluate(t => { const g = Object.values(Chart.instances).find(x => { const h = x.canvas.closest('.pn-cartao'); return h && h.querySelector('h3, .pn-cartao-tit') && h.textContent.includes(t); });
      return g ? { labels: g.data.labels, totais: g.data.labels.map((_, i) => g.data.datasets.reduce((s, d) => s + (d.data[i] || 0), 0)) } : null; }, titulo);
    const aba = async id => { await p.click(`.pn-aba[data-aba=${id}]`); await p.waitForFunction(i => document.querySelector(`.pn-aba[data-aba=${i}]`).getAttribute('aria-selected') === 'true', id); await p.waitForTimeout(600); };

    await aba('tf');
    const gf = await grafico('Por fiscal');
    const fulanos = gf && gf.labels.filter(l => /fulano/i.test(l)), iF = gf && gf.labels.indexOf('FULANO FICTICIO TESTE');
    ok(gf && fulanos.length === 1 && iF >= 0 && gf.totais[iF] === 4, 'TF "Por fiscal": as 3 grafias de Fulano viram uma barra só (a mais usada), com 4 TFs', gf);
    const iB = gf && gf.labels.findIndex(l => /beltrano/i.test(l));
    ok(gf && gf.labels.filter(l => /beltrano/i.test(l)).length === 1 && gf.totais[iB] === 2, 'Beltrano: uma barra com 2 TFs', gf);

    const desemp = await p.evaluate(() => { const s = [...document.querySelectorAll('.pn-secao')].find(x => /Desempenho por barreira/.test(x.querySelector('h2').textContent));
      return s ? [...s.querySelectorAll('tbody tr')].map(tr => [...tr.cells].slice(0, 5).map(c => c.textContent.trim())) : null; });
    ok(desemp && desemp.length === 2 && desemp.some(l => l[0] === 'BVA - JUNDIÁ' && l[1] === '1' && l[4] === '2') && !desemp.some(l => /BR 174/.test(l[0])),
      'Desempenho por barreira: só BVA - CEASA e BVA - JUNDIÁ; os TFs do papel ("BR 174 km75"…) entram na linha do Jundiá com o turno', desemp);

    const qtd = await p.evaluate(() => { const s = [...document.querySelectorAll('.pn-secao')].find(x => /Quantidades por produto/.test(x.querySelector('h2').textContent));
      return s ? Object.fromEntries([...s.querySelectorAll('tbody tr')].map(tr => [tr.cells[0].textContent.trim(), [...tr.cells].map(c => c.textContent.trim())])) : null; });
    ok(qtd && qtd.LARANJA && qtd.LARANJA[3] === '12.723' && qtd.MANGA && qtd.MANGA[4] === '1.500' && qtd['LIMÃO'] && qtd['LIMÃO'][4] === '80.000',
      'Quantidades por produto: "12.723 Ton" = 12.723 kg (não 12 milhões), "1.500 Kg" = 1.500 kg, "80 Ton" = 80.000 kg', qtd);
    const alertas = await p.textContent('#pn-conteudo');
    ok(/1 TF\(s\) com quantidade fora do comum/.test(alertas) && /LIMÃO 80 Ton/.test(alertas), 'alerta: TF com 80 t num produto (o de 12,723 t não entra)');

    await aba('barreiras');
    const gb = await grafico('Produtividade por fiscal');
    ok(gb && gb.labels.filter(l => /fulano/i.test(l)).length === 1 && gb.totais[gb.labels.findIndex(l => /fulano/i.test(l))] === 2, 'Barreiras "Produtividade por fiscal": Fulano uma vez, com os veículos dos 2 turnos', gb);

    const ops = await p.$$eval('#pn-fiscal option', os => os.map(o => o.textContent).filter(Boolean));
    ok(ops.filter(o => /fulano/i.test(o)).length === 1 && ops.filter(o => /beltrano/i.test(o)).length === 1, 'filtro de fiscal: cada pessoa aparece uma vez', ops);
    ok(!err.length, 'sem erros de página', err);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
