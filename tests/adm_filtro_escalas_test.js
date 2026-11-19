const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const PORTAL = require('./lib/portal');
// Portal do Administrativo, aba "Diárias das escalas": filtro por período, fiscal e barreira (feito no navegador, sobre as escalas
// já carregadas), combinável, com "Limpar filtros", sem rolagem horizontal no celular e legível no tema escuro. Dados fictícios.
const { API } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const coord = await U.fiscal('Coordenadora Filtro Teste', { permissoes: ['campo', 'fiscalizacaoDeTransito', 'coordenacaoBarreiras'] });
  await U.fiscal('Pessoa Ficticia Um'); await U.fiscal('Pessoa Ficticia Dois'); await U.fiscal('Pessoa Ficticia Tres');
  const D = await post({ action: 'escalaDados', key: coord.token });
  const id = n => D.fiscais.find(f => f.nome === n).id;
  const salvar = async (bva, de, ate, nomes) => {
    const r = await post({ action: 'escalaSalvar', key: coord.token, escala: { bva, inicio: dia(de), fim: dia(ate), fiscais: nomes.map(id), situacao: 'publicada' } });
    if (!r.ok) throw new Error('escalaSalvar: ' + r.erro); return r.escala.id;
  };
  const A = await salvar('BVA - JUNDIÁ', -40, -31, ['Pessoa Ficticia Um']);
  const B = await salvar('BVA - CEASA', -5, 2, ['Pessoa Ficticia Dois', 'Pessoa Ficticia Tres']);
  const C = await salvar('BVA - JUNDIÁ', 10, 19, ['Pessoa Ficticia Um', 'Pessoa Ficticia Tres']);

  const b = await amb.lancar();
  const S = await PORTAL.sessao('', '', 'Administrativa Filtro Teste');
  const p = await PORTAL.abrir(b, S, { aba: 'escalas' });
  const ids = async () => (await p.$$eval('#adm-esc-lista [data-escala]', l => l.map(x => x.dataset.escala))).sort();
  const linhas = async () => p.$$eval('#adm-esc-lista tr[data-fiscal]', l => l.map(x => x.querySelector('td').textContent.trim()));
  const esperar = async (esperado, msg) => {
    const alvo = esperado.slice().sort().join();
    await p.waitForFunction(a => [...document.querySelectorAll('#adm-esc-lista [data-escala]')].map(x => x.dataset.escala).sort().join() === a, alvo, { timeout: 8000 }).catch(() => {});
    const real = await ids(); ok(real.join() === alvo, msg, real);
  };
  await p.waitForSelector('#adm-esc-lista [data-escala]', { timeout: 20000 });
  await p.selectOption('#adm-esc-filtro', 'todas');
  await esperar([A, B, C], 'sem filtro: as três escalas');
  ok((await p.$$eval('#adm-esc-bva option', o => o.map(x => x.textContent))).join() === 'Todas,BVA - CEASA,BVA - JUNDIÁ', 'barreira: opções vêm das escalas carregadas');
  ok((await p.$$eval('#adm-esc-fiscal option', o => o.map(x => x.textContent))).join() === 'Todos,Pessoa Ficticia Dois,Pessoa Ficticia Tres,Pessoa Ficticia Um', 'fiscal: opções vêm das escalas carregadas');
  ok(await p.isDisabled('#adm-esc-limpar'), 'sem filtro: "Limpar filtros" desligado');

  // barreira
  await p.selectOption('#adm-esc-bva', 'BVA - JUNDIÁ'); await esperar([A, C], 'barreira Jundiá: só as escalas dela');
  // fiscal (junto com a barreira: só a escala C tem a Pessoa Tres em Jundiá) e só as linhas dela
  await p.selectOption('#adm-esc-fiscal', 'Pessoa Ficticia Tres'); await esperar([C], 'barreira + fiscal: combinam');
  ok((await linhas()).join() === 'Pessoa Ficticia Tres', 'fiscal: o cartão mostra só a linha dessa pessoa', await linhas());
  await p.click('#adm-esc-limpar'); await esperar([A, B, C], '"Limpar filtros" volta a mostrar tudo');
  ok((await p.inputValue('#adm-esc-fiscal')) === '' && (await p.inputValue('#adm-esc-bva')) === '', 'limpar: campos zerados');

  // fiscal sozinho
  await p.selectOption('#adm-esc-fiscal', 'Pessoa Ficticia Um'); await esperar([A, C], 'fiscal Um: as duas escalas dele');
  ok((await linhas()).every(n => n === 'Pessoa Ficticia Um'), 'fiscal: nenhuma linha de outra pessoa', await linhas());
  await p.selectOption('#adm-esc-fiscal', ''); await esperar([A, B, C], 'fiscal "Todos"');

  // período: a escala entra se cruza o intervalo
  await p.fill('#adm-esc-de', dia(-6)); await p.fill('#adm-esc-ate', dia(0)); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([B], 'período que cruza só a escala CEASA');
  await p.fill('#adm-esc-de', dia(2)); await p.fill('#adm-esc-ate', dia(10)); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([B, C], 'período toca o último dia de uma e o primeiro de outra');
  await p.fill('#adm-esc-de', dia(-35)); await p.fill('#adm-esc-ate', dia(-33)); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([A], 'período antigo: só a escala A');
  await p.fill('#adm-esc-de', dia(-20)); await p.fill('#adm-esc-ate', dia(-10)); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([], 'período sem escala: lista vazia');
  ok(/Nenhuma escala com esses filtros/.test(await p.textContent('#adm-esc-lista')), 'lista vazia explica que é o filtro');
  await p.fill('#adm-esc-de', dia(12)); await p.fill('#adm-esc-ate', dia(5)); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([], 'data inicial depois da final: nada');
  ok(/inicial é depois da final/.test(await p.textContent('#adm-esc-info')), 'aviso de intervalo invertido');
  await p.fill('#adm-esc-de', dia(12)); await p.fill('#adm-esc-ate', ''); await p.dispatchEvent('#adm-esc-ate', 'change');
  await esperar([C], 'só a data inicial: de então em diante');
  await p.click('#adm-esc-limpar');
  ok((await p.inputValue('#adm-esc-de')) === '' && (await p.inputValue('#adm-esc-ate')) === '', 'limpar zera as datas');
  // o filtro vale também para o modo padrão (pendentes) e sobrevive a "Atualizar"
  await p.selectOption('#adm-esc-bva', 'BVA - CEASA'); await esperar([B], 'modo "todas" + barreira');
  await p.click('#adm-esc-atualizar'); await p.waitForSelector('#adm-esc-lista [data-escala]', { timeout: 15000 });
  await esperar([B], 'o filtro continua depois de "Atualizar"');
  await p.selectOption('#adm-esc-bva', '');

  // celular (390 px) e tema escuro
  for (const [rotulo, opts] of [['celular', { viewport: { width: 390, height: 844 } }], ['escuro', { viewport: { width: 1366, height: 900 }, colorScheme: 'dark' }], ['celular escuro', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
    const q = await PORTAL.abrir(b, S, { aba: 'escalas', ...opts });
    await q.waitForSelector('#adm-esc-filtros', { timeout: 20000 });
    const m = await q.evaluate(() => {
      const f = document.querySelector('#adm-esc-filtros'), r = f.getBoundingClientRect();
      const cor = s => getComputedStyle(document.querySelector(s));
      return { rolagem: document.documentElement.scrollWidth - document.documentElement.clientWidth, fora: [...f.querySelectorAll('input,select,button')].filter(x => { const b = x.getBoundingClientRect(); return b.right > innerWidth + 0.5 || b.left < -0.5; }).length,
        larg: Math.round(r.width), fundo: cor('#adm-esc-de').backgroundColor, texto: cor('#adm-esc-de').color };
    });
    ok(m.rolagem <= 0 && m.fora === 0, `${rotulo}: filtros sem rolagem horizontal`, m);
    if (/escuro/.test(rotulo)) ok(m.fundo !== m.texto, `${rotulo}: campo com fundo e texto distintos`, m);
    await q.screenshot({ path: amb.saida('adm_filtro_escalas_' + rotulo.replace(' ', '_') + '.png'), fullPage: true });
    ok(!q.errosPag.length, `${rotulo}: sem erros de página`, q.errosPag);
    await q.context().close();
  }
  ok(!p.errosPag.length, 'portal sem erros', p.errosPag);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
