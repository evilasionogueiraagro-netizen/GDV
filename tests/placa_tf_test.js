const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// Registro do veículo: placa que já tem TF de barreira lavrado na mesma BVA fica com a borda vermelha e um aviso escrito. Vale sem internet:
// o índice de reincidência do aparelho tem a chave placa + BVA (TF do turno → local do turno; sem turno → local do TF, com os apelidos da
// BVA). TF de outra BVA e TF cancelado não contam; TF deste aparelho que ainda não está no índice conta. Alerta de cuidado: veículo marcado
// por um fiscal deixa a placa com a borda amarela e "Cuidado ao abordar este veículo" em qualquer BVA. Dados fictícios.
const { API, APP } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ANO = Number(hoje.slice(0, 4)), ag = Date.now();
const T = (id, local) => ({ id, numeroTF: 'TF-' + id, data: hoje, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Fulano Ficticio Teste', local, unidade: local, posto: 'Fixa', encerrado: 1, criadoEm: ag, atualizadoEm: ag });
const TF = (n, turnoId, local, placa, extra = {}) => ({ id: 'pt' + n, barreira: 'BVA-X', ano: ANO, numero: n, numeroTxt: `${String(n).padStart(4, '0')}/${ANO}`, turnoId, data: hoje, hora: '09:00',
  fiscal: 'Fulano Ficticio Teste', local, placa, doc: '52998224725', nome: 'Ciclano Ficticio Teste', procedimento: 'liberacao', produtos: '[]', cancelado: 0, criadoEm: ag + n, atualizadoEm: ag + n, emitidoEm: ag + n, ...extra });

(async () => {
  console.log('1) índice de reincidência com a chave placa + BVA');
  const fA = await U.fiscal('Fiscal Placa A');
  let r = await post({ action: 'sync', key: fA.token, since: 0, turnos: [T('tj', 'BVA - JUNDIÁ')],
    tfs: [TF(1, 'tj', 'Ramal do km 10', 'ABC1D23'),                                   // TF do turno do Jundiá: BVA pelo local do turno
      TF(2, '', 'Barreira Porto da CEASA', 'QWE4R56'),                                 // sem turno: pelo local do TF (apelido da CEASA)
      TF(3, 'tj', 'BVA - JUNDIÁ', 'ZZZ9Z99', { cancelado: 1, motivoCancel: 'teste' })],   // cancelado: não conta
    veiculos: [{ id: 'vc1', turnoId: 'tj', hora: '10:00', placa: 'CDE2F34', tipo: 'PA', pessoas: 1, obs: 'motorista exaltado (fictício)', excluido: 0, criadoEm: ag, atualizadoEm: ag, cuidado: 1, cuidadoMotivo: 'ameaca' },
      { id: 'vc2', turnoId: 'tj', hora: '10:05', placa: 'FGH3I45', tipo: 'PA', pessoas: 1, obs: '', excluido: 1, criadoEm: ag, atualizadoEm: ag, cuidado: 1, cuidadoMotivo: 'ameaca' }] });   // excluído: não vale
  ok(r.ok, 'turno e TFs gravados', r.erro);
  const ix = await post({ action: 'tfIndiceReincidencia', key: fA.token });
  const crypto = require('crypto'), h = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16), m = Object.fromEntries((ix.itens || []).map(i => [i.h, i]));
  ok(ix.ok && m[h('placabva:ABC1D23|bva jundia')] && m[h('placabva:ABC1D23|bva jundia')].n === 1 && m[h('placabva:QWE4R56|bva ceasa')] && !m[h('placabva:ZZZ9Z99|bva jundia')] && !m[h('placabva:QWE4R56|bva jundia')],
    'chave placa + BVA: pelo local do turno, pelo apelido da BVA no TF sem turno; cancelado e outra BVA fora', Object.keys(m).length);
  const cu = m[h('cuidado:CDE2F34')];
  ok(cu && cu.n === 1 && cu.cu === 'ameaca' && cu.ult === hoje && !m[h('cuidado:FGH3I45')] && !JSON.stringify(ix).includes('exaltado'), 'alerta de cuidado no índice: só placa (hash), motivo e data; excluído fora; sem as observações', cu);
  const fV = await U.fiscal('Fiscal So Veiculos', { permissoes: ['campo', 'fiscalizacaoDeTransito'] });
  const ixV = await post({ action: 'tfIndiceReincidencia', key: fV.token });
  ok(ixV.ok && ixV.itens.some(i => i.h === h('cuidado:CDE2F34')), 'quem só registra veículos também baixa o índice (alerta de cuidado)', ixV.erro);

  console.log('2) app: borda vermelha e aviso no registro do veículo (Jundiá)');
  const b = await amb.lancar();
  const fB = await U.fiscal('Fiscal Placa B');
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: -2.0, longitude: -60.0 } });
  await c.addInitScript(([t]) => { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', 'Fiscal Placa B'); localStorage.setItem('gdv.semInstalar', '1'); } }, [fB.token]);
  const p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForSelector('.modulo[data-v=home]'); await p.click('.modulo[data-v=home]');
  await p.waitForSelector('#fTurno #nLocal', { timeout: 15000 });
  await p.selectOption('#nLocal', 'BVA - JUNDIÁ'); await p.fill('#nTF', '41'); await p.click('#fTurno button[type=submit]'); await p.waitForSelector('.contador');
  await p.evaluate(() => Sync.atualizarIndice(true));
  ok(await p.evaluate(async () => (await Store.meta('tfIndice')).v === 3), 'aparelho baixou o índice v3');
  // TF deste aparelho ainda não enviado (fora do índice), no turno atual
  await p.evaluate(async () => { const id = await Store.meta('turnoAtual'); await Store.gravar('tfs', { id: 'pt-local', turnoId: id, placa: 'MNB1C23', data: '2026-01-02', local: '', cancelado: 0, pendente: 1 }); });
  await p.click('[data-go=registrar]'); await p.waitForSelector('#fVeic');
  const estado = async placa => { await p.fill('#placa', ''); await p.type('#placa', placa); await p.waitForTimeout(400);
    return p.evaluate(() => ({ vermelho: document.querySelector('#placa').classList.contains('placa-com-tf') && getComputedStyle(document.querySelector('#placa')).borderTopColor !== '', aviso: document.querySelector('#placa-tf').hidden ? '' : document.querySelector('#placa-tf').textContent.trim() })); };
  let e = await estado('ABC1D23');
  ok(e.vermelho && /Já há 1 TF de barreira lavrado para esta placa em BVA - JUNDIÁ/.test(e.aviso), 'placa com TF no Jundiá: borda vermelha + aviso', e);
  await p.screenshot({ path: amb.saida('placa_tf_alerta.png') });
  e = await estado('QWE4R56'); ok(!e.vermelho && !e.aviso, 'placa com TF só na CEASA: sem alerta no Jundiá', e);
  e = await estado('ZZZ9Z99'); ok(!e.vermelho && !e.aviso, 'TF cancelado: sem alerta', e);
  e = await estado('MNB1C23'); ok(e.vermelho && /\(último em 02\/01\/2026\)/.test(e.aviso), 'TF deste aparelho ainda fora do índice: alerta', e);
  e = await estado('ABC1D2'); ok(!e.vermelho && !e.aviso, 'placa incompleta: sem alerta', e);
  await p.context().setOffline(true);
  // espera a sincronização terminar sem veículos pendentes (waitForFunction não espera Promises)
  const semPendentes = async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(async () => !Sync.emAndamento() && !(await Store.todos('veiculos')).some(v => v.pendente))) return; await p.waitForTimeout(250); } throw new Error('veículos pendentes'); };
  e = await estado('ABC1D23'); ok(e.vermelho && e.aviso, 'sem internet: alerta pelo índice do aparelho', e);
  await p.context().setOffline(false);
  await p.click('#fVeic > button.botao'); await p.waitForTimeout(500);
  ok((await p.evaluate(async () => (await Store.todos('veiculos')).some(v => v.placa === 'ABC1D23'))), 'o alerta não impede registrar o veículo');

  console.log('3) alerta de cuidado: borda amarela e "Cuidado ao abordar este veículo"; marcar e desmarcar');
  await p.waitForSelector('#fVeic');                                     // depois de salvar, volta ao formulário de registro
  e = await estado('CDE2F34');
  const amarelo = await p.evaluate(() => document.querySelector('#placa').classList.contains('placa-cuidado'));
  ok(amarelo && /Cuidado ao abordar este veículo\. Ameaça · marcado em/.test(await p.textContent('#placa-cuidado')), 'placa marcada por outro fiscal (outra BVA não importa): borda amarela + aviso', await p.textContent('#placa-cuidado'));
  await p.screenshot({ path: amb.saida('placa_cuidado_alerta.png') });
  e = await estado('FGH3I45'); ok(!(await p.evaluate(() => document.querySelector('#placa').classList.contains('placa-cuidado'))), 'registro excluído: sem alerta');
  // marcar um veículo novo
  await estado('JKL4M56'); await p.check('#vCuidado'); await p.click('#fVeic > button.botao'); await p.waitForTimeout(300);
  ok(await p.isVisible('#vCuidadoMot') && (await p.evaluate(async () => (await Store.todos('veiculos')).filter(v => v.placa === 'JKL4M56').length)) === 0, 'marcar sem motivo: pede o motivo');
  await p.selectOption('#vCuidadoMot', 'resistencia'); await p.fill('#obs', 'recusou parar (fictício)'); await p.click('#fVeic > button.botao');
  let novo = null; for (let i = 0; i < 40 && !novo; i++) { await p.waitForTimeout(250); novo = await p.evaluate(async () => (await Store.todos('veiculos')).find(v => v.placa === 'JKL4M56')); }
  await p.waitForSelector('#fVeic #placa');
  ok(!!novo && novo.cuidado === 1 && novo.cuidadoMotivo === 'resistencia', 'veículo gravado com o alerta de cuidado', novo);
  e = await estado('JKL4M56'); ok(/Resistência à fiscalização/.test(await p.textContent('#placa-cuidado')), 'registro deste aparelho ainda não enviado já alerta');
  await p.evaluate(() => Sync.sincronizar()); await semPendentes();
  let ix2 = await post({ action: 'tfIndiceReincidencia', key: fA.token, desde: ix.agora });
  ok(ix2.itens.some(i => i.h === h('cuidado:JKL4M56') && i.n === 1 && i.cu === 'resistencia'), 'servidor: alerta novo no índice incremental (vale para os outros aparelhos)', ix2.itens.filter(i => i.cu != null));
  // desmarcar (editar o próprio registro)
  await p.waitForFunction(() => !Sync.emAndamento(), null, { timeout: 15000 });
  await p.evaluate(async id => { const v = await Store.obter('veiculos', id); await Store.salvar('veiculos', { ...v, cuidado: 0, cuidadoMotivo: '' }); Sync.sincronizar(); }, novo.id);
  await semPendentes();
  ix2 = await post({ action: 'tfIndiceReincidencia', key: fA.token, desde: ix.agora });
  ok(ix2.itens.some(i => i.h === h('cuidado:JKL4M56') && i.n === 0), 'desmarcado: o índice incremental manda apagar (n = 0)', ix2.itens.filter(i => i.cu != null));
  ok(!err.length, 'sem erros de página', err);
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
