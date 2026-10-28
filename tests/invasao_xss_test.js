const amb = require('./lib/amb');
// Teste de invasão no navegador (OWASP A05, XSS armazenado): um fiscal grava textos com HTML/JS (TF, turno, veículo, levantamento,
// nome do fiscal digitado) e quem abre o painel, a verificação pública do TF, o dashboard público, o portal e o app de campo não pode
// executar nada. XSS no painel levaria o token do gerente (localStorage) e, com ele, todos os dados. Complementa invasao_test.js. Dados fictícios.
const crypto = require('crypto');
const { API, ORIGEM, PAINEL, APP } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 500))); if (!c) falhas++; };

// cada carga marca window.__xss se rodar; cobre atributo, tag, SVG e quebra de aspas
const CARGAS = ['<img src=x onerror="window.__xss=(window.__xss||0)+1">', '"><svg onload="window.__xss=1">', "'><script>window.__xss=1</script>",
  '<iframe srcdoc="<script>parent.__xss=1</script>">', '<a href="javascript:window.__xss=1" id="xss-link">clique</a>'];
const X = i => 'Teste ' + CARGAS[i % CARGAS.length];

(async () => {
  const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = Number(hoje.slice(0, 4)), ag = Date.now();
  const TOK = await amb.carga();
  const TURNO = crypto.randomUUID(), TF = crypto.randomUUID(), TF2 = crypto.randomUUID();
  const tf = (id, n, extra) => ({ id, barreira: 'BVA-CEASA', ano: ANO, numero: n, numeroTxt: X(n), turnoId: TURNO, data: hoje, hora: '08:00', fiscal: X(0), local: X(1),
    placa: 'ABC1D23', doc: '52998224725', nome: X(2), endereco: X(3), municipio: X(4), uf: 'AM', origem: X(1), destino: X(2), procedimento: 'apreensao',
    produtos: JSON.stringify([X(0) + ' - 10 Kg']), constatacao: X(3), enquadramento: X(4), cancelado: 0, criadoEm: ag, atualizadoEm: ag, ...extra });
  const r = await post({ action: 'sync', key: TOK, since: 0,
    turnos: [{ id: TURNO, numeroTF: X(0), data: hoje, letra: 'A', inicio: '06:00', fiscal: X(1), local: X(2), unidade: X(3), posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag }],
    veiculos: [{ id: crypto.randomUUID(), turnoId: TURNO, hora: '07:00', placa: X(0), tipo: 'PA', pessoas: 2, obs: X(1), origemMun: X(2), destinoMun: X(3), criadoEm: ag, atualizadoEm: ag }],
    tfs: [tf(TF, 1), tf(TF2, 2, { cancelado: 1, motivoCancel: X(4) })],
    levantamentos: [{ id: crypto.randomUUID(), data: hoje, hora: '09:00', servidor: X(0), cargo: X(1), lotacao: X(2), doc: '52998224725', nome: X(3), propriedade: X(4),
      municipio: 'MANAUS', lat: '-3.1', lon: '-60.0', obs: X(0), criadoEm: ag, atualizadoEm: ag }] });
  ok(r.ok, 'cargas de XSS gravadas pelo sync', r.erro);
  await post({ action: 'painelPublicoSalvar', key: TOK, config: { ativo: true } });
  const AD = await amb.usuario('Portal Xss Teste', { aplicativo: 'administracao' });

  const b = await amb.lancar();
  try {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), rt => rt.abort());
    await c.addInitScript(([t, ad]) => {
      if (sessionStorage.getItem('__init')) return;
      sessionStorage.setItem('__init', 1);
      localStorage.setItem('gdv.url', window.__GDV_API);
      localStorage.setItem('gdv.painel.token', t); localStorage.setItem('gdv.painel.nome', 'Gestora Ficticia Teste');
      localStorage.setItem('gdv.adm.sessao', ad); localStorage.setItem('gdv.adm.nome', 'Portal Xss Teste');
      localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Carga Dados Teste'); localStorage.setItem('gdv.semInstalar', '1');
    }, [TOK, AD.token]);
    // o que denuncia execução: a marca global, um diálogo, ou um elemento ativo vindo dos dados
    const examinar = async (p, onde) => {
      await p.waitForTimeout(800);
      const v = await p.evaluate(() => ({ xss: window.__xss || 0,
        elementos: [...document.querySelectorAll('img, svg, iframe, script, a')]
          .filter(e => [...e.attributes].some(x => /__xss/.test(x.value)) || (e.tagName === 'SCRIPT' && /__xss/.test(e.textContent))).length }));
      ok(!v.xss && !v.elementos, onde + ': nenhuma carga executou nem virou elemento', v);
    };
    const abrir = async (url, espera) => {
      const p = await c.newPage(); let dialogo = 0;
      p.on('dialog', d => { dialogo++; d.dismiss().catch(() => {}); });
      await p.goto(url); if (espera) await p.waitForSelector(espera, { timeout: 20000 }).catch(() => {});
      p.dialogos = () => dialogo;
      return p;
    };

    const p = await abrir(PAINEL, '#pn-conteudo .pn-kpi');
    const abas = await p.$$eval('.pn-aba', l => l.map(x => x.dataset.aba));
    ok(abas.length >= 3, 'painel aberto com as abas', abas);
    for (const a of abas) {
      await p.click(`.pn-aba[data-aba=${a}]`);
      await p.waitForTimeout(1200);
      await examinar(p, 'painel, aba ' + a);
    }
    ok(!p.dialogos(), 'painel: nenhum diálogo aberto por carga');

    const v = await abrir(ORIGEM + '/verificar.html?t=' + TF, '#resultado dl');
    await examinar(v, 'verificação pública do TF');
    const v2 = await abrir(ORIGEM + '/verificar.html?t=' + TF2, '#resultado dl');
    await examinar(v2, 'verificação pública do TF cancelado (motivo)');
    // controle: o detector acusa uma carga que de fato vira HTML
    await v2.evaluate(h => document.body.insertAdjacentHTML('beforeend', h), CARGAS[0]);
    await v2.waitForTimeout(300);
    const ctl = await v2.evaluate(() => window.__xss || 0);
    ok(ctl === 1, 'controle: a mesma carga inserida como HTML é detectada', ctl);
    const d = await abrir(ORIGEM + '/dashboard/', 'main');
    await examinar(d, 'dashboard público');
    const adm = await abrir(ORIGEM + '/administrativo/', 'main');
    await examinar(adm, 'portal do administrativo');
    const app = await abrir(APP, 'body');
    await app.waitForTimeout(3000);
    await examinar(app, 'app de campo (dados do próprio login)');
    ok(![v, v2, d, adm, app].some(x => x.dialogos()), 'nenhum diálogo aberto por carga');
  } finally { await b.close(); }
  console.log(falhas ? `FALHOU=${falhas}` : 'Tudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.log('  ✗ erro: ' + (e && e.stack || e)); process.exitCode = 1; });
