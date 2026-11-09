const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Aparelho da base com vários logins (Sync.visiveis): as telas mostram só o que é do login atual e o dos turnos de que ele participa
// (quem abriu e os colegas). O de outros logins fica guardado e escondido; o que outra pessoa deixou sem enviar fica retido.
// App real (Chromium) + Code.gs real; registros de outro login gravados direto no banco do aparelho. Dados fictícios.
const { APP } = amb;
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ano = Number(hoje.slice(0, 4));

(async () => {
  const b = await amb.lancar();
  try {
    const B = await U.fiscal('Beltrano Ficticio Teste');
    const c = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Manaus' });
    await c.route(u => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u)), r => r.abort());
    await c.addInitScript(i => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); } }, B.ls);
    const p = await c.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(APP); await p.waitForSelector('.modulo'); await p.evaluate(() => Sync.sincronizar());

    // o que o login anterior (outro fiscal) deixou neste aparelho, e um turno dele em que o login atual entrou como colega
    await p.evaluate(({ hoje, ano, eu }) => {
      const base = { criadoEm: Date.now() - 3600e3, atualizadoEm: Date.now() - 3600e3, pendente: 0, srv_ts: 1 };
      const turno = (id, colegas) => ({ ...base, id, numeroTF: 'TF-0' + id.slice(-2) + '-A-' + ano, data: hoje, letra: 'A', inicio: '07:00', fim: '13:00', encerrado: 1,
        fiscal: 'Ciclano Ficticio Teste', usuario: 'Ciclano Ficticio Teste', local: 'BVA - CEASA', unidade: 'BVA - CEASA', posto: 'Fixa', colegas });
      const tf = (id, n, turnoId, extra) => ({ ...base, id, barreira: 'BVA-CEASA', ano, numero: n, numeroTxt: `${String(n).padStart(4, '0')}/${ano} - BVA - CEASA`, data: hoje, hora: '08:00',
        usuario: 'Ciclano Ficticio Teste', fiscal: 'Ciclano Ficticio Teste', turnoId, nome: 'FULANO FICTICIO TESTE', doc: '52998224725', procedimento: 'rechaco', cancelado: 0, ...extra });
      return Promise.all([
        Store.gravar('turnos', turno('turno-outro-01', '')), Store.gravar('turnos', turno('turno-junto-02', JSON.stringify([eu]))),
        Store.gravar('tfs', tf('tf-outro', 901, 'turno-outro-01')), Store.gravar('tfs', tf('tf-junto', 902, 'turno-junto-02')),
        Store.gravar('tfs', tf('tf-retido', 903, '', { usuario: '', pendente: 1 })),
        Store.gravar('levantamentos', { ...base, id: 'lev-outro', usuario: 'Ciclano Ficticio Teste', data: hoje, hora: '09:00', municipio: 'MANAUS', propriedade: 'SITIO FICTICIO', culturas: '[]', fotos: '[]' }),
        Store.setMeta('retidos', [{ usuarioId: 'outro-login', nome: 'Ciclano Ficticio Teste', matricula: 'X1', em: Date.now(), ids: { f: ['tf-retido'] } }])
      ]);
    }, { hoje, ano, eu: B.nome });

    await p.evaluate(() => go('tf')); await p.waitForSelector('#tfItens');
    const lista = await p.textContent('#tfItens');
    ok(/0902\//.test(lista) && !/0901\//.test(lista) && !/0903\//.test(lista), 'Meus TFs: o TF do turno de que participa aparece; o de outro login e o retido não', lista.slice(0, 300));
    await p.evaluate(() => go('tfpronto', 'tf-outro')); await p.waitForSelector('#tfItens');
    ok(true, 'abrir direto o TF de outro login volta para a lista');

    await p.evaluate(() => go('historico')); await p.waitForSelector('#hOut');
    await p.fill('#hDe', hoje); await p.fill('#hAte', hoje); await p.dispatchEvent('#hDe', 'change'); await p.waitForTimeout(500);
    const hist = await p.textContent('#hOut');
    ok(/TF-002-A/.test(hist) && !/TF-001-A/.test(hist), 'Histórico: o turno de que participa aparece; o de outro login não', hist.slice(0, 300));

    const levs = await p.evaluate(async () => (await Sync.visiveis('levantamentos', await Store.todos('levantamentos'))).map(x => x.id));
    ok(!levs.includes('lev-outro'), 'PCE: levantamento de outro login fica fora das telas (Sync.visiveis)', levs);
    const guardados = await p.evaluate(() => Promise.all([Store.obter('tfs', 'tf-outro'), Store.obter('levantamentos', 'lev-outro'), Store.obter('tfs', 'tf-retido')]).then(l => l.every(Boolean)));
    ok(guardados, 'os registros de outro login continuam guardados no aparelho (só escondidos)');
    const aposSync = await p.evaluate(async () => { await Sync.sincronizar(); return !!(await Store.obter('turnos', 'turno-outro-01')); });
    ok(aposSync, 'a sincronização não apaga o turno de outro login (continua no aparelho para quando ele voltar)');
    // nome guardado no aparelho diferente do nome da conta (conta renomeada no painel): o TF que o servidor manda continua visível
    await p.evaluate(() => localStorage.setItem('gdv.nome', 'Beltrano Antigo Teste'));
    const r = await fetch(amb.API + '/', { method: 'POST', body: JSON.stringify({ action: 'tfEmitir', key: B.token, tf: { id: 'tf-meu-cel', barreira: 'BVA-CEASA', ano, numero: 950, numeroTxt: `0950/${ano} - BVA - CEASA`,
      data: hoje, hora: '09:00', fiscal: B.nome, nome: 'NÃO IDENTIFICADO', doc: '', procedimento: 'rechaco', cancelado: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), fotos: '[]', assinaturas: '{}' } }) }).then(x => x.json());
    const vis = await p.evaluate(async () => { await Sync.sincronizar(); return { ids: (await Sync.visiveis('tfs', await Store.todos('tfs'))).map(t => t.id), nome: Sync.nome() }; });
    ok(r.ok && r.emitido && vis.ids.includes('tf-meu-cel') && vis.nome === B.nome, 'TF do mesmo login lavrado em outro aparelho aparece mesmo com o nome guardado diferente; o nome é atualizado', vis);
    ok(!erros.length, 'sem erros de página', erros);
  } finally { await b.close(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
