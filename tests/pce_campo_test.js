const amb = require('./lib/amb');
const U = require('./lib/usuarios');
const A = require('./lib/pce-app');
// PCE em campo: "Baixar dados para o campo" (action pceBaixarMunicipio), busca de produtores sem internet (CPF, nome, código), visita sem internet
// sobre dados baixados, "Enviar ao produtor" (PDF do Termo gerado no aparelho + navigator.share), permissão do módulo PCE e "Apagar do aparelho".
const fs = require('fs');
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const append = (a, row) => fetch(API + '/__append?aba=' + a + '&row=' + encodeURIComponent(JSON.stringify(row)));
const editar = (aba, col, valor, onde) => fetch(API + `/__editar?aba=${aba}&col=${col}&valor=${encodeURIComponent(JSON.stringify(valor))}&onde=${encodeURIComponent(onde)}`);
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) throw new Error(m); };
const diaM = n => new Date(Date.now() - 4 * 3600e3 - n * 864e5).toISOString().slice(0, 10);   // n dias atrás (Manaus)
const EU = [-2.63, -56.74];

(async () => {
  // ---------- planilha: 2 municípios (Parintins e Manaus), colunas acrescentadas à mão em Propriedades e Pessoas ----------
  await append('Propriedades', ['id', 'codigo', 'nome', 'doc', 'municipio', 'situacaoFundiaria', 'lat', 'lon', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario', 'areaTotalHa']);
  await append('Pessoas', ['id', 'tipo', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario', 'email', 'apelido']);
  const t0 = Date.now();
  const pes = (id, nome, mun, tel) => ({ id, tipo: 'PF', nome, rg: '', endereco: 'Zona rural', municipio: mun, uf: 'AM', telefone: tel, email: '', criadoEm: t0, atualizadoEm: t0 });
  const prop = (codigo, nome, doc, mun, lat, lon) => ({ id: codigo, codigo, nome, doc, municipio: mun, situacaoFundiaria: 'Posse', lat, lon, criadoEm: t0, atualizadoEm: t0 });
  const P = {
    1: prop('PRP-001', 'Sítio Boa Vista', '52998224725', 'Parintins', -2.64, -56.74),
    2: prop('PRP-002', 'Fazenda Esperança', '11144477735', 'Parintins', -2.70, -56.70),
    3: prop('PRP-003', 'Chácara Rio Azul', '39053344705', 'Parintins', -2.60, -56.80),
    4: prop('PRP-004', 'Sítio Antigo', '52998224725', 'PARINTINS', -2.90, -56.60),     // município em maiúsculas: comparação sem acento/maiúsculas
    5: prop('PRP-005', 'Sítio Sem GPS', '39053344705', 'Parintins', '', ''),
    6: prop('MAN-001', 'Sítio Manauara', '71428793860', 'Manaus', -3.10, -60.00)
  };
  const lev = (id, p, nome, dias, pragas) => ({ id, data: diaM(dias), hora: '09:00', servidor: 'Outro Servidor', cargo: 'Fiscal', matricula: '1', lotacao: 'Parintins',
    doc: p.doc, nome, telefone: '', email: '', propriedade: p.nome, codigoPropriedade: p.codigo, situacaoFundiaria: 'Posse', municipio: p.municipio, lat: p.lat, lon: p.lon,
    precisao: 10, culturas: '[]', pragas: JSON.stringify(pragas), fotos: '[]', assinaturas: '{}', obs: '', excluido: 0, criadoEm: t0, atualizadoEm: t0 });
  const nd = (praga, cultura) => ({ praga, culturas: [{ cultura, area: '1', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] });
  let r = await post({ action: 'sync', key: await U.semeador(), since: 9e15,
    pessoas: [pes('52998224725', 'JOSÉ DA SILVA', 'Parintins', '92 98888-1111'), pes('11144477735', 'MARIA OLIVEIRA', 'Parintins', '92 98888-2222'),
      pes('39053344705', 'PEDRO SANTOS', 'Parintins', '92 98888-3333'), pes('71428793860', 'ANA MANAUARA', 'Manaus', '92 98888-4444')],
    propriedades: Object.values(P),
    levantamentos: [lev('L1', P[1], 'JOSÉ DA SILVA', 30, [nd('Bactrocera carambolae', 'Banana')]),
      lev('L2', P[2], 'MARIA OLIVEIRA', 10, [{ praga: 'Bactrocera carambolae', culturas: [{ cultura: 'Goiaba', resultado: 'detectada', coleta: 'Não', fotos: [] }] },
        { praga: 'Monilíase do Cacaueiro', culturas: [{ cultura: 'Cacau', resultado: 'suspeita', coleta: 'Não', fotos: [] }] }]),
      lev('L3', P[4], 'JOSÉ DA SILVA', 400, [nd('HLB / Greening', 'Laranja')]),
      lev('L4', P[6], 'ANA MANAUARA', 5, [{ praga: 'Fusarium R4T', culturas: [{ cultura: 'Banana', resultado: 'detectada', coleta: 'Não', fotos: [] }] }])] });
  if (!r.ok) throw new Error('carga inicial: ' + r.erro);
  await editar('Propriedades', 'areaTotalHa', '12,5', 'id:PRP-001');
  await editar('Pessoas', 'apelido', 'Zé da Boa Vista', 'id:52998224725');

  const credencial = async nome => { const f = await U.fiscal(nome); return { token: f.token, nome: f.nome, uid: f.usuario.id }; };
  const fC = await credencial('Pessoa Ficticia Gama'), fD = await credencial('Diego Sem Modulo');
  r = await U.permissoes(fD.uid, U.lista({ veiculos: 1, tf: 1, pce: 0 })); if (!r.ok) throw new Error('permissões: ' + r.erro);

  console.log('1) servidor: pceBaixarMunicipio');
  r = await post({ action: 'pceBaixarMunicipio', key: fC.token, municipios: ['parintins'] });
  ok(r.ok && r.propriedades.length === 5 && r.pessoas.length === 3, `Parintins (pedido "parintins"): ${r.propriedades && r.propriedades.length} propriedades e ${r.pessoas && r.pessoas.length} produtores (PARINTINS em maiúsculas entra)`);
  ok(JSON.stringify(r.municipios) === JSON.stringify([{ municipio: 'parintins', nProps: 5, nPessoas: 3 }]), 'resumo por município: ' + JSON.stringify(r.municipios));
  const rp = id => r.propriedades.find(p => p.id === id);
  ok(rp('PRP-001').areaTotalHa === '12,5' && r.pessoas.find(x => x.id === '52998224725').apelido === 'Zé da Boa Vista', 'colunas acrescentadas à mão na planilha vêm junto (areaTotalHa, apelido)');
  ok(!('srv_ts' in rp('PRP-001')) && !('usuario' in rp('PRP-001')) && !('usuario' in r.pessoas[0]), 'sem campos técnicos (srv_ts, usuario)');
  ok(r.propriedades.every(p => !('resumoLev' in p)), 'o download não traz mais o resumo do histórico por propriedade (o app não o usa)');
  const txt = JSON.stringify(r);
  ok(!/ANA MANAUARA|71428793860|MAN-001|Fusarium/.test(txt), 'nada de outro município nem de outros produtores (Manaus fica de fora)');
  const cons = await get('/__aba?nome=Consultas');
  ok(cons.some(l => l[1] === fC.nome && /PCE campo: parintins \(5\)/.test(l[4])), 'download registrado na aba Consultas (quem, municípios, quantas propriedades)');
  r = await post({ action: 'pceBaixarMunicipio', key: fD.token, municipios: ['Parintins'] });
  ok(!r.ok && r.semPermissao === 'pce' && /Sem autorização para o módulo PCE/.test(r.erro), 'fiscal sem o módulo PCE: servidor recusa (' + r.erro + ')');
  r = await post({ action: 'pceBaixarMunicipio', key: fC.token, municipios: [] }); ok(!r.ok && /município/.test(r.erro), 'sem município: recusado');

  // ---------- app ----------
  const b = await amb.lancar();
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: EU[0], longitude: EU[1], accuracy: 12 }, acceptDownloads: true, timezoneId: 'America/Manaus' });
    await c.addInitScript(([t, n]) => { try { if (!localStorage.getItem('gdv.key')) { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } } catch (e) {} }, [token, nome]);
    await c.addInitScript(() => {          // compartilhamento do celular (WhatsApp/e-mail) simulado: guarda os arquivos recebidos
      if (window !== window.top) return;
      window.__shares = []; window.__arqs = [];
      navigator.canShare = d => !window.__semShare && !!(d && d.files && d.files.length);
      navigator.share = async d => { const fs = [];
        for (const f of d.files || []) { const u = new Uint8Array(await f.arrayBuffer()); window.__arqs.push(f);
          fs.push({ name: f.name, type: f.type, size: f.size, ini: String.fromCharCode(...u.slice(0, 5)), fim: new TextDecoder().decode(u.slice(-7)), paginas: (new TextDecoder('latin1').decode(u).match(/\/Type \/Page /g) || []).length }); }
        window.__shares.push({ title: d.title, text: d.text, files: fs }); };
    });
    const p = await c.newPage(); p.err = []; p.on('pageerror', e => p.err.push(e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && p.err.push(m.text()));
    p.on('dialog', d => d.accept()); p.ctx = c;
    await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' });
    return p;
  };
  const C = await aparelho(fC);
  try {
    // service worker pronto, com o gerador de PDF no cache (o resto do teste roda sem internet)
    await C.waitForFunction(async () => { if (!navigator.serviceWorker.controller) return false; const ks = await caches.keys(); if (!ks.length) return false;
      const c = await caches.open(ks[0]); return !!(await c.match('vendor/html2canvas.min.js')); }, null, { timeout: 30000 });
    ok(true, 'service worker guardou o gerador de PDF (html2canvas) para usar sem internet');

    console.log('2) Dados para o campo: baixar Parintins (dentro da área Produtores)');
    await C.click('.modulo[data-v=pce]'); await C.waitForSelector('#pceServForm');
    await C.selectOption('#pce-s-cargo', { index: 1 }); await C.selectOption('#pce-s-lotacao', 'Parintins'); await C.click('#pce-s-salvar');
    await C.waitForSelector('#pce-campo');
    ok(await C.locator('#nav button').count() === 3 && await C.locator('#nav [data-v=pcemapa]').count() === 0 && /Nenhum município baixado neste aparelho/.test(await C.textContent('#pce-campo-res')), 'menu Módulos | Produtores | Termos (sem Perto de mim); nada baixado ainda');
    await C.click('#pce-campo'); await C.waitForSelector('#campo-muns');
    ok(/Nenhum município baixado/.test(await C.textContent('#campo-baixados')) && await C.locator('input[name=campo-mun]').count() === 62, 'tela "Dados para o campo": nada baixado; lista dos 62 municípios');
    await C.fill('#campo-filtro', 'parin'); ok(await C.locator('#campo-muns label:not([hidden])').count() === 1, 'filtro de municípios');
    await C.check('input[name=campo-mun][value=Parintins]'); await C.click('#campo-baixar');
    await C.waitForSelector('.campo-mun[data-mun=Parintins]', { timeout: 20000 });
    const linha = (await C.textContent('.campo-mun[data-mun=Parintins]')).replace(/\s+/g, ' ');
    ok(/Parintins — 5 propriedade\(s\), 3 produtor\(es\) — baixado em \d\d\/\d\d \d\d:\d\d/.test(linha) && await C.locator('[data-campo=atualizar][data-mun=Parintins]').count() === 1 && await C.locator('[data-campo=apagar][data-mun=Parintins]').count() === 1,
      'mostra o que está no aparelho, com Atualizar e Apagar: ' + linha.trim());
    const loc = await C.evaluate(async () => ({ props: (await Store.todos('propriedades')).map(p => ({ id: p.id, campoMun: p.campoMun, area: p.areaTotalHa, pend: p.pendente, sug: (p.frutosSugeridos || []).map(f => f.cultura) })),
      pes: (await Store.todos('pessoas')).map(p => ({ id: p.id, campoMun: p.campoMun, apelido: p.apelido })), meta: await Store.meta('pceCampo') }));
    ok(loc.props.length === 5 && loc.props.every(p => p.campoMun === 'Parintins' && p.pend === 0) && loc.props.find(p => p.id === 'PRP-001').area === '12,5', 'propriedades gravadas no aparelho (com a coluna nova)');
    ok(JSON.stringify(loc.props.find(p => p.id === 'PRP-001').sug) === '["Banana"]' && JSON.stringify(loc.props.find(p => p.id === 'PRP-002').sug.sort()) === '["Cacau","Goiaba"]', 'propriedades sem frutos baixam com a sugestão do histórico (frutosSugeridos)', loc.props.map(p => p.id + ':' + p.sug));
    ok(loc.pes.length === 3 && loc.pes.find(p => p.id === '52998224725').apelido === 'Zé da Boa Vista' && JSON.stringify(loc.meta.PARINTINS && loc.meta.PARINTINS.nProps) === '5', 'produtores e meta pceCampo gravados');
    await C.screenshot({ path: amb.saida('pce_campo_baixar.png'), fullPage: true });

    console.log('3) sem internet: busca por CPF, nome e código; cadastro e visita sobre os dados baixados');
    await C.ctx.setOffline(true); await C.evaluate(() => window.dispatchEvent(new Event('offline')));
    await C.click('nav [data-v=pce]'); await C.waitForSelector('#campoQ');
    ok(await C.locator('.campo-res-item').count() === 3 && /dados para trabalhar sem internet/i.test(await C.textContent('#campo-offline')) && /Parintins \(5\) — \d\d\/\d\d/.test(await C.textContent('#pce-campo-res')), 'lista mostra os 3 produtores baixados e quando baixou');
    await C.fill('#campoQ', '111.444.777-35'); await C.waitForFunction(() => document.querySelectorAll('.campo-res-item').length === 1);
    ok(/MARIA OLIVEIRA/.test(await C.textContent('.campo-res-item')) && /Fazenda Esperança/.test(await C.textContent('.campo-res-item')), 'busca por CPF');
    await C.fill('#campoQ', 'pedro'); await C.waitForFunction(() => document.querySelectorAll('.campo-res-item').length === 1 && /PEDRO SANTOS/.test(document.querySelector('.campo-res-item').textContent));
    ok(/Chácara Rio Azul/.test(await C.textContent('.campo-res-item')), 'busca pelo nome do produtor (uma linha por produtor)');
    await C.fill('#campoQ', 'rio azul'); await C.waitForFunction(() => document.querySelectorAll('.campo-res-item').length === 1); ok(true, 'busca pelo nome da propriedade');
    await C.fill('#campoQ', 'PRP-001'); await C.waitForFunction(() => document.querySelectorAll('.campo-res-item').length === 1 && /JOSÉ DA SILVA/.test(document.querySelector('.campo-res-item').textContent)); ok(true, 'busca pelo código da propriedade');
    await C.fill('#campoQ', 'ninguém assim'); await C.waitForFunction(() => /Nenhum produtor encontrado neste aparelho/.test(document.querySelector('#campoRes').textContent)); ok(true, 'busca sem resultado avisa e oferece cadastrar');
    await C.fill('#campoQ', '390.533.447-05'); await C.waitForSelector('.campo-res-item'); await C.click('.campo-res-item'); await C.waitForSelector('#pce-produtor');
    ok(await C.locator('.pce-prop').count() === 2 && /Chácara Rio Azul/.test(await C.textContent('#view')) && /Sítio Sem GPS/.test(await C.textContent('#view')), 'tela do produtor com as duas propriedades dele');
    await C.click('nav [data-v=pce]'); await C.click('#campo-novo'); await C.waitForSelector('#pceProdForm'); await C.fill('#pp-doc', '111.444.777-35');
    await C.waitForFunction(() => /Produtor já cadastrado/.test(document.querySelector('#pp-st-doc').textContent), null, { timeout: 10000 });
    const stDoc = (await C.textContent('#pp-st-doc')).replace(/\s+/g, ' ');
    ok(/MARIA OLIVEIRA/.test(stDoc) && /Sem conexão: dados baixados \(Parintins em \d\d\/\d\d \d\d:\d\d\)/.test(stDoc) && await C.inputValue('#pp-nome') === 'MARIA OLIVEIRA', 'CPF no cadastro novo, sem internet: acha o produtor baixado e diz de quando são os dados: ' + stDoc.trim());
    await C.click('[data-cad=cancelarform]'); await C.waitForSelector('#campoQ');
    // visita sobre dados baixados: José (PRP-001) sem frutos cadastrados, só a sugestão do histórico
    await C.fill('#campoQ', 'PRP-001'); await C.waitForSelector('.campo-res-item'); await C.click('.campo-res-item'); await C.waitForSelector('#pce-produtor');
    ok(/Há sugestão do histórico: Banana/.test(await C.textContent('.pce-prop')), 'propriedade sem frutos: mostra a sugestão do histórico');
    await C.click('[data-cad=editar][data-prop]'); await C.waitForSelector('#pceProdForm'); await C.click('#pp-salvar'); await C.waitForSelector('#pce-produtor');
    ok(await C.locator('.pce-frutos li').count() === 1 && /Banana/.test(await C.textContent('.pce-frutos')), 'salvar a sugestão cadastra o fruto (sem internet)');
    await A.visita(C, { frutos: ['Banana'], resultados: { Banana: { 'Moko da Bananeira': 'nao_detectada' } } });
    const lv = await C.evaluate(async () => (await Store.todos('termosPce')).map(t => ({ n: t.numeroTxt, prov: t.provisorio, pend: t.pendente, u: t.unidade, prop: t.propriedadeId })));
    ok(lv.length === 1 && lv[0].pend === 1 && lv[0].prov === 1 && lv[0].u === 'PARINTINS' && lv[0].prop === 'PRP-001' && /^001\.\d{4}\.PARINTINS$/.test(lv[0].n), 'visita feita sem internet sobre a propriedade baixada: Termo 001 provisório da unidade Parintins', lv);

    console.log('4) Enviar ao produtor: PDF do Termo gerado no aparelho (sem internet) + compartilhamento');
    await C.click('.pce-termo-pronto [data-mon=enviar]'); await C.waitForSelector('#mon-modal-enviar'); await C.click('#mon-env-gerar'); await C.waitForSelector('#mon-env-share', { timeout: 60000 });
    ok(/PDF pronto: Termo_Fiscalizacao_.*\.pdf/.test(await C.textContent('#mon-env-st')), 'PDF gerado: ' + (await C.textContent('#mon-env-st')).trim());
    await C.screenshot({ path: amb.saida('pce_campo_enviar.png') });
    await C.click('#mon-env-share'); await C.waitForFunction(() => window.__shares.length === 1);
    const sh = await C.evaluate(() => window.__shares[0]);
    ok(sh.files.length === 1 && sh.files[0].type === 'application/pdf' && sh.files[0].ini === '%PDF-' && /%%EOF/.test(sh.files[0].fim) && sh.files[0].paginas >= 1 && sh.files[0].size > 20000 && sh.files[0].size < 3e6 && /Termo de Fiscalização/.test(sh.title),
      'navigator.share recebeu um PDF válido: ' + sh.files.map(f => `${f.name} (${Math.round(f.size / 1024)} KB, ${f.paginas} pág.)`).join(', '));
    const pdfs = await C.evaluate(async () => Promise.all(window.__arqs.map(async f => ({ nome: f.name, b64: await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); }) }))));
    pdfs.forEach((f, i) => fs.writeFileSync(amb.saida(`pce_campo_produtor_${i + 1}.pdf`), Buffer.from(f.b64, 'base64')));
    try {
      const out = require('child_process').execFileSync('python3', ['-c', 'import sys,pypdf\nfor a in sys.argv[1:]:\n r=pypdf.PdfReader(a); p=r.pages[0]; print(len(r.pages), round(float(p.mediabox.width)), round(float(p.mediabox.height)))', amb.saida('pce_campo_produtor_1.pdf')]).toString().trim().split('\n');
      ok(out.length === 1 && / 595 842$/.test(out[0]), 'pypdf abre o PDF (A4 595×842 pt): ' + out.join(' | '));
    } catch (e) { console.log('  (pypdf indisponível: conferência das páginas pulada) ' + e.message.split('\n')[0]); }
    const termo = await C.evaluate(async () => { const t = { id: 't-campo', unidade: 'PARINTINS', ano: 2026, numero: 7, numeroTxt: '007/2026/PARINTINS', data: '2026-10-12', hora: '10:00',
      servidor: 'Pessoa Ficticia Gama', cargo: 'Fiscal', municipio: 'Parintins', doc: '52998224725', nome: 'JOSÉ DA SILVA', endereco: 'Sítio Boa Vista', cultura: 'Banana', quantidade: 2,
      partes: 'folhas', descricao: 'Texto oficial.', fotos: '[]', assinaturas: '{}', local: 'Parintins/AM' };
      const f = await Docs.pceColheita(t, {}, 'arquivo'), u = new Uint8Array(await f.arrayBuffer());
      return { name: f.name, ini: String.fromCharCode(...u.slice(0, 5)), pags: (new TextDecoder('latin1').decode(u).match(/\/Type \/Page /g) || []).length }; });
    ok(termo.ini === '%PDF-' && termo.pags === 1 && termo.name === 'Termo_Colheita_007_2026_PARINTINS_via_do_produtor.pdf', 'Termo de Colheita: PDF só com a via do produtor (' + termo.name + ')');
    // aparelho sem compartilhamento de arquivos: baixa e explica
    await C.click('#mon-env-fechar'); await C.evaluate(() => { window.__semShare = true; });
    await C.click('.pce-termo-pronto [data-mon=enviar]'); await C.click('#mon-env-gerar'); await C.waitForSelector('#mon-env-baixar', { timeout: 60000 });
    ok(await C.locator('#mon-env-share').count() === 0 && /Baixar/.test(await C.textContent('#mon-modal-enviar')), 'sem compartilhamento de arquivo: botão Baixar + instrução (anexar → Documento)');
    const [dl] = await Promise.all([C.waitForEvent('download'), C.click('#mon-env-baixar')]);
    ok(/^Termo_Fiscalizacao_.*\.pdf$/.test(dl.suggestedFilename()), 'baixa o PDF do Termo: ' + dl.suggestedFilename());
    await C.click('#mon-env-fechar'); await C.evaluate(() => { window.__semShare = false; });

    console.log('5) apagar do aparelho (ainda sem internet: o produtor com registro pendente fica)');
    await C.click('nav [data-v=pce]'); await C.waitForSelector('#pce-campo'); await C.click('#pce-campo'); await C.waitForSelector('[data-campo=apagar][data-mun=Parintins]');
    await C.click('[data-campo=apagar][data-mun=Parintins]'); await C.waitForSelector('#campo-baixados .vazio');
    const depois = await C.evaluate(async () => ({ props: (await Store.todos('propriedades')).map(p => p.id + (p.campoMun ? '*' : '')).sort(), pes: (await Store.todos('pessoas')).map(p => p.id).sort(), meta: await Store.meta('pceCampo') }));
    ok(JSON.stringify(depois.props) === '["PRP-001","PRP-004"]' && JSON.stringify(depois.pes) === '["52998224725"]', 'apagou os baixados; ficou só o produtor com registro pendente (sem a marca de baixado): ' + JSON.stringify(depois));
    ok(JSON.stringify(depois.meta) === '{}', 'meta limpa');

    console.log('6) com internet: envio, novo download e atualização automática (6 h)');
    await C.ctx.setOffline(false); await C.evaluate(() => window.dispatchEvent(new Event('online')));
    await A.sync(C);
    const tps = await ler('TermosPCE');
    ok(tps.some(t => t.propriedadeId === 'PRP-001' && t.usuario === fC.nome && t.data === diaM(0) && t.unidade === 'PARINTINS'), 'Termo feito sem internet chegou à planilha');
    ok(JSON.parse((await ler('Propriedades')).find(p => p.id === 'PRP-001').frutos).some(f => f.cultura === 'Banana'), 'fruto cadastrado a partir da sugestão chegou à planilha');
    await C.check('input[name=campo-mun][value=Parintins]'); await C.click('#campo-baixar'); await C.waitForSelector('.campo-mun[data-mun=Parintins]', { timeout: 20000 });
    const antes = await C.evaluate(async () => { const m = await Store.meta('pceCampo'); m.PARINTINS.baixadoEm = Date.now() - 7 * 3600e3; await Store.setMeta('pceCampo', m); return m.PARINTINS.baixadoEm; });
    ok(await C.evaluate(() => Campo.atualizarSozinho()) === true, 'baixado há mais de 6 h: atualiza sozinho');
    ok(await C.evaluate(a => Store.meta('pceCampo').then(m => m.PARINTINS.baixadoEm > a), antes), 'data do download atualizada');
    ok(await C.evaluate(() => Campo.atualizarSozinho()) === false, 'recente: não baixa de novo');
    const f1 = await C.evaluate(async () => { const p = await Store.obter('propriedades', 'PRP-001'); return JSON.parse(p.frutos); });
    ok(f1.length === 1 && f1[0].cultura === 'Banana', 'o novo download não apaga nem duplica o fruto cadastrado (o do aparelho e o da planilha são o mesmo id)', f1);
    // a gerência tira o PCE: os dados baixados saem do aparelho na próxima sincronização (LGPD)
    r = await U.permissoes(fC.uid, U.lista({ veiculos: 1, tf: 1, pce: 0 })); if (!r.ok) throw new Error(r.erro);
    await C.evaluate(() => Sync.sincronizar());
    await C.waitForFunction(async () => !Object.keys((await Store.meta('pceCampo')) || {}).length && !(await Store.todos('propriedades')).length, null, { timeout: 10000 });
    ok(true, 'sem o módulo PCE: dados baixados apagados do aparelho sozinhos');
    r = await U.permissoes(fC.uid, U.lista({ veiculos: 1, tf: 1, pce: 1 }));

    console.log('7) permissão: fiscal sem o módulo PCE');
    const D = await aparelho(fD);
    await D.waitForSelector('.modulo[data-v=home]', { timeout: 10000 });
    // o menu nasce antes da primeira sincronização; os módulos da conta chegam com ela
    await D.waitForFunction(() => !document.querySelector('.modulo[data-v=pce]'), null, { timeout: 10000 }).catch(() => {});
    ok(await D.locator('.modulo[data-v=pce]').count() === 0, 'cartão do PCE some do menu (não abre "Dados para o campo")');
    await D.evaluate(() => go('pcecampo')); await D.waitForTimeout(300);
    ok(await D.locator('#campo-muns').count() === 0 && /Sem autorização/.test(await D.textContent('#toast')), 'tela de download bloqueada no app');
    ok(!C.err.length && !D.err.length, 'sem erros de JavaScript' + (C.err.length || D.err.length ? ': ' + [...C.err, ...D.err].join(' | ') : ''));
    console.log('FALHOU=0');
  } catch (e) {
    console.log('  ✗ ' + e.message); try { await C.screenshot({ path: amb.saida('pce_campo_erro.png'), fullPage: true }); } catch (x) {}
    if (C.err.length) console.log('  erros JS: ' + C.err.join(' | '));
    process.exitCode = 1;
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
