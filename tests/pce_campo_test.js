const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE em campo: "Baixar dados para o campo" (action pceBaixarMunicipio), consulta sem internet (CPF, nome, código), mapa "Perto de mim"
// (pontos, cores pelo histórico, lista por distância), "Fazer levantamento aqui", rota com link do Google Maps, "Enviar ao produtor"
// (PDF gerado no aparelho + navigator.share), permissão do módulo PCE e "Apagar do aparelho".
const fs = require('fs');
const { API, APP } = amb;
const get = p => fetch(API + p).then(r => r.json());
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const append = (a, row) => fetch(API + '/__append?aba=' + a + '&row=' + encodeURIComponent(JSON.stringify(row)));
const editar = (aba, col, valor, onde) => fetch(API + `/__editar?aba=${aba}&col=${col}&valor=${encodeURIComponent(JSON.stringify(valor))}&onde=${encodeURIComponent(onde)}`);
const ler = async aba => (await get('/__fn?nome=lerLeitura_&args=' + encodeURIComponent(JSON.stringify([aba])))).r;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) throw new Error(m); };
const diaM = n => new Date(Date.now() - 4 * 3600e3 - n * 864e5).toISOString().slice(0, 10);   // n dias atrás (Manaus)
const R = 6371, rad = x => x * Math.PI / 180;
const dist = (a, b) => { const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const km = d => (d < 1 ? Math.round(d * 1000) + ' m' : (d < 10 ? d.toFixed(1) : String(Math.round(d * 10) / 10)).replace('.', ',') + ' km');
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
  const fC = await credencial('Carla Mendes Rocha'), fD = await credencial('Diego Sem Modulo');
  r = await U.permissoes(fD.uid, U.lista({ veiculos: 1, tf: 1, pce: 0 })); if (!r.ok) throw new Error('permissões: ' + r.erro);

  console.log('1) servidor: pceBaixarMunicipio');
  r = await post({ action: 'pceBaixarMunicipio', key: fC.token, municipios: ['parintins'] });
  ok(r.ok && r.propriedades.length === 5 && r.pessoas.length === 3, `Parintins (pedido "parintins"): ${r.propriedades && r.propriedades.length} propriedades e ${r.pessoas && r.pessoas.length} produtores (PARINTINS em maiúsculas entra)`);
  ok(JSON.stringify(r.municipios) === JSON.stringify([{ municipio: 'parintins', nProps: 5, nPessoas: 3 }]), 'resumo por município: ' + JSON.stringify(r.municipios));
  const rp = id => r.propriedades.find(p => p.id === id);
  ok(rp('PRP-001').areaTotalHa === '12,5' && r.pessoas.find(x => x.id === '52998224725').apelido === 'Zé da Boa Vista', 'colunas acrescentadas à mão na planilha vêm junto (areaTotalHa, apelido)');
  ok(!('srv_ts' in rp('PRP-001')) && !('usuario' in rp('PRP-001')) && !('usuario' in r.pessoas[0]), 'sem campos técnicos (srv_ts, usuario)');
  ok(rp('PRP-001').resumoLev.n === 1 && rp('PRP-001').resumoLev.ultimo === diaM(30) && rp('PRP-001').resumoLev.pragas.length === 0, 'histórico PRP-001: 1 levantamento, último há 30 dias, sem detecção');
  ok(JSON.stringify(rp('PRP-002').resumoLev.pragas) === JSON.stringify([{ praga: 'Bactrocera carambolae', resultado: 'detectada' }, { praga: 'Monilíase do Cacaueiro', resultado: 'suspeita' }]), 'histórico PRP-002: pragas detectadas/suspeitas no último');
  ok(rp('PRP-003').resumoLev.n === 0 && rp('PRP-004').resumoLev.ultimo === diaM(400), 'PRP-003 nunca levantada; PRP-004 há 400 dias');
  const txt = JSON.stringify(r);
  ok(!/ANA MANAUARA|71428793860|MAN-001|Fusarium/.test(txt), 'nada de outro município nem de outros produtores (Manaus fica de fora)');
  const cons = await get('/__aba?nome=Consultas');
  ok(cons.some(l => l[1] === fC.nome && /PCE campo: parintins \(5\)/.test(l[4])), 'download registrado na aba Consultas (quem, municípios, quantas propriedades)');
  r = await post({ action: 'pceBaixarMunicipio', key: fD.token, municipios: ['Parintins'] });
  ok(!r.ok && r.semPermissao === 'pce' && /Sem autorização para o módulo PCE/.test(r.erro), 'fiscal sem o módulo PCE: servidor recusa (' + r.erro + ')');
  r = await post({ action: 'pceBaixarMunicipio', key: fC.token, municipios: [] }); ok(!r.ok && /município/.test(r.erro), 'sem município: recusado');

  console.log('1b) servidor: pceMapaGeral (mapa com todas as propriedades)');
  r = await post({ action: 'pceMapaGeral', key: fC.token });
  const idsG = (r.propriedades || []).map(p => p.id).sort();
  ok(r.ok && JSON.stringify(idsG) === JSON.stringify(['MAN-001', 'PRP-001', 'PRP-002', 'PRP-003', 'PRP-004']), 'todas as propriedades com coordenadas, de todos os municípios (a sem GPS fica de fora): ' + idsG.join(', '));
  ok(!r.propriedades.some(p => 'doc' in p || 'telefone' in p) && !/52998224725|71428793860|JOSÉ DA SILVA|ANA MANAUARA/.test(JSON.stringify(r)), 'sem produtor, CPF/CNPJ nem telefone');
  const man = r.propriedades.find(p => p.id === 'MAN-001');
  ok(man.lat === -3.1 && man.lon === -60 && man.municipio === 'Manaus' && man.resumoLev.n === 1 && man.resumoLev.pragas[0].praga === 'Fusarium R4T', 'coordenadas em número e histórico junto (MAN-001: Fusarium R4T)');
  ok((await get('/__aba?nome=Consultas')).some(l => l[1] === fC.nome && /PCE mapa geral: 5 propriedade/.test(l[4])), 'consulta registrada na aba Consultas');
  r = await post({ action: 'pceMapaGeral', key: fD.token });
  ok(!r.ok && r.semPermissao === 'pce', 'fiscal sem o módulo PCE: recusado');

  // ---------- app ----------
  const b = await amb.lancar();
  const aparelho = async ({ token, nome }) => {
    const c = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: EU[0], longitude: EU[1], accuracy: 12 }, acceptDownloads: true, timezoneId: 'America/Manaus' });   // aparelho em Manaus: "hoje" do app = diaM(0) mesmo depois das 20h
    await c.route('https://tile.openstreetmap.org/**', rt => rt.abort());
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
    // service worker pronto, com o mapa, o gerador de PDF e os contornos no cache (o resto do teste roda sem internet)
    await C.waitForFunction(async () => { if (!navigator.serviceWorker.controller) return false; const ks = await caches.keys(); if (!ks.length) return false;
      const c = await caches.open(ks[0]); return !!(await c.match('vendor/html2canvas.min.js')) && !!(await c.match('painel/vendor/leaflet/leaflet.js')) && !!(await c.match('painel/dados/am-municipios.json')); }, null, { timeout: 20000, polling: 300 });
    ok(true, 'service worker guardou leaflet, contornos dos municípios e html2canvas para usar sem internet');

    console.log('2) Dados para o campo: baixar Parintins');
    await C.click('.modulo[data-v=pce]'); await C.waitForSelector('#pceServForm');
    await C.selectOption('#pce-s-cargo', { index: 1 }); await C.selectOption('#pce-s-lotacao', 'Parintins'); await C.click('#pce-s-salvar');
    await C.waitForSelector('#pce-campo');
    ok(await C.locator('#nav [data-v=pcemapa]').count() === 1, 'menu do PCE com "Perto de mim"');
    await C.click('#pce-campo'); await C.waitForSelector('#campo-muns');
    ok(/Nenhum município baixado/.test(await C.textContent('#campo-baixados')) && await C.locator('input[name=campo-mun]').count() === 62, 'tela "Dados para o campo": nada baixado; lista dos 62 municípios');
    await C.fill('#campo-filtro', 'parin'); ok(await C.locator('#campo-muns label:not([hidden])').count() === 1, 'filtro de municípios');
    await C.check('input[name=campo-mun][value=Parintins]'); await C.click('#campo-baixar');
    await C.waitForSelector('.campo-mun[data-mun=Parintins]', { timeout: 20000 });
    const linha = (await C.textContent('.campo-mun[data-mun=Parintins]')).replace(/\s+/g, ' ');
    ok(/Parintins — 5 propriedade\(s\), 3 produtor\(es\) — baixado em \d\d\/\d\d \d\d:\d\d/.test(linha) && await C.locator('[data-campo=atualizar][data-mun=Parintins]').count() === 1 && await C.locator('[data-campo=apagar][data-mun=Parintins]').count() === 1,
      'mostra o que está no aparelho, com Atualizar e Apagar: ' + linha.trim());
    const loc = await C.evaluate(async () => ({ props: (await Store.todos('propriedades')).map(p => ({ id: p.id, campoMun: p.campoMun, area: p.areaTotalHa, pend: p.pendente })),
      pes: (await Store.todos('pessoas')).map(p => ({ id: p.id, campoMun: p.campoMun, apelido: p.apelido })), meta: await Store.meta('pceCampo') }));
    ok(loc.props.length === 5 && loc.props.every(p => p.campoMun === 'Parintins' && p.pend === 0) && loc.props.find(p => p.id === 'PRP-001').area === '12,5', 'propriedades gravadas no aparelho (com a coluna nova)');
    ok(loc.pes.length === 3 && loc.pes.find(p => p.id === '52998224725').apelido === 'Zé da Boa Vista' && JSON.stringify(loc.meta.PARINTINS && loc.meta.PARINTINS.nProps) === '5', 'produtores e meta pceCampo gravados');
    await C.screenshot({ path: amb.saida('pce_campo_baixar.png'), fullPage: true });

    console.log('3) sem internet: busca por CPF, nome e código no levantamento');
    await C.ctx.setOffline(true); await C.evaluate(() => window.dispatchEvent(new Event('offline')));
    await C.click('nav [data-v=pcelev]'); await C.waitForSelector('#pceLevForm');
    await C.fill('#pce-doc', '11144477735');
    await C.waitForFunction(() => /Cadastro encontrado/.test(document.querySelector('#pce-st-doc').textContent), null, { timeout: 10000 });
    const stDoc = (await C.textContent('#pce-st-doc')).replace(/\s+/g, ' ');
    ok(/Sem conexão: dados baixados \(Parintins em \d\d\/\d\d \d\d:\d\d\)/.test(stDoc), 'mensagem "Sem conexão: dados baixados (Parintins em dd/mm hh:mm)": ' + stDoc.trim());
    ok(/1 levantamento\(s\)/.test(stDoc), 'histórico do servidor (resumo baixado) também sem internet');
    ok((await C.inputValue('#pce-nome')) === 'MARIA OLIVEIRA' && (await C.inputValue('#pce-propriedade')) === 'Fazenda Esperança' && (await C.inputValue('#pce-codigo')) === 'PRP-002' && (await C.inputValue('#pce-municipio')) === 'Parintins',
      'CPF offline preenche produtor e a propriedade (única)');
    await C.fill('#pce-busca-prop', 'pedro'); await C.waitForSelector('#pce-busca-res .campo-res-item');
    let res = await C.locator('#pce-busca-res .campo-res-item').allTextContents();
    ok(res.length === 2 && /PEDRO SANTOS/.test(res[0]) && /Chácara Rio Azul/.test(res[0]) && /Sítio Sem GPS/.test(res[1]), 'busca por nome do produtor: ' + res.map(x => x.replace(/\s+/g, ' ').trim()).join(' | '));
    await C.fill('#pce-busca-prop', 'rio azul'); await C.waitForFunction(() => document.querySelectorAll('#pce-busca-res .campo-res-item').length === 1);
    ok(/Chácara Rio Azul/.test(await C.textContent('#pce-busca-res')), 'busca pelo nome da propriedade');
    await C.fill('#pce-busca-prop', 'PRP-001'); await C.waitForFunction(() => document.querySelectorAll('#pce-busca-res .campo-res-item').length === 1 && /Boa Vista/.test(document.querySelector('#pce-busca-res').textContent));
    await C.click('#pce-busca-res .campo-res-item');
    ok((await C.inputValue('#pce-doc')) === '529.982.247-25' && (await C.inputValue('#pce-nome')) === 'JOSÉ DA SILVA' && (await C.inputValue('#pce-telefone')) === '92 98888-1111'
      && (await C.inputValue('#pce-propriedade')) === 'Sítio Boa Vista' && (await C.inputValue('#pce-codigo')) === 'PRP-001' && (await C.inputValue('#pce-situacao')) === 'Posse',
      'busca pelo código: escolher preenche CPF, produtor, telefone, propriedade, código e situação');
    ok(/Escolhido na busca/.test(await C.textContent('#pce-st-doc')) && (await C.inputValue('#pce-busca-prop')) === '', 'aviso de preenchimento e busca limpa');
    await C.fill('#pce-busca-prop', 'ninguém assim'); await C.waitForFunction(() => /Nada encontrado/.test(document.querySelector('#pce-busca-res').textContent)); ok(true, 'busca sem resultado avisa');
    await C.fill('#pce-busca-prop', '');
    const PR = i => `.pce-praga >> nth=${i}`, CU = (i, k) => `.pce-praga >> nth=${i} >> .pce-cult >> nth=${k}`;
    await C.selectOption(PR(0) + ' >> .p-praga', 'Bactrocera carambolae'); await C.selectOption(CU(0, 0) + ' >> .c-cultura', 'Banana'); await C.click(CU(0, 0) + ' >> .pce-res-nao_detectada');
    const foto = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const x = c.getContext('2d');
      x.fillStyle = '#2a7'; x.fillRect(0, 0, 1200, 800); x.fillStyle = '#fff'; x.fillRect(300, 200, 600, 400); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }).then(b => Buffer.from(b, 'base64'));
    await C.setInputFiles(CU(0, 0) + ' >> .c-fotos', Array.from({ length: 14 }, (_, i) => ({ name: `f${i}.jpg`, mimeType: 'image/jpeg', buffer: foto })));
    await C.waitForFunction(() => document.querySelectorAll('.pce-praga .pce-foto img').length === 14, null, { timeout: 20000 });
    await C.click('#pce-addpraga'); await C.selectOption(PR(1) + ' >> .p-praga', 'HLB / Greening'); await C.selectOption(CU(1, 0) + ' >> .c-cultura', 'Laranja'); await C.click(CU(1, 0) + ' >> .pce-res-nao_detectada');
    for (const k of ['hlb', 'acaro', 'cancro']) await C.click(`#pce-citros label:has(input[name="pce-ci-det-${k}-tem"][value="nao"])`);   // praga de citros: detecção obrigatória
    await C.click('#pce-salvar'); await C.waitForSelector('#pce-lev-pronto');
    const levLocal = await C.evaluate(async () => (await Store.todos('levantamentos')).map(l => ({ cod: l.codigoPropriedade, doc: l.doc, pend: l.pendente, prop: l.propriedade })));
    // o GPS da visita passa a ser a coordenada da propriedade (como antes desta mudança)
    ok(await C.evaluate(() => Store.obter('propriedades', 'PRP-001').then(p => p.lat === -2.63 && p.lon === -56.74 && p.pendente === 1 && p.campoMun === 'Parintins')), 'propriedade atualizada com o GPS da visita (pendente, continua marcada como baixada)');
    P[1].lat = EU[0]; P[1].lon = EU[1];
    ok(levLocal.length === 1 && levLocal[0].cod === 'PRP-001' && levLocal[0].doc === '52998224725' && levLocal[0].pend === 1, 'levantamento salvo sem internet com a propriedade escolhida (pendente)');

    console.log('4) Enviar ao produtor: PDF gerado no aparelho (sem internet) + compartilhamento');
    ok(await C.locator('#pce-enviar').count() === 1, 'botão "📤 Enviar ao produtor" na tela do levantamento salvo');
    await C.click('#pce-enviar'); await C.waitForSelector('#pce-modal-enviar');
    ok(await C.locator('input[name=pce-env]').count() === 2, 'escolha das fichas (uma por praga)');
    await C.click('#pce-env-gerar'); await C.waitForSelector('#pce-env-share', { timeout: 60000 });
    ok(/2 PDF\(s\) prontos/.test(await C.textContent('#pce-env-st')), 'PDFs gerados: ' + (await C.textContent('#pce-env-st')).trim());
    await C.screenshot({ path: amb.saida('pce_campo_enviar.png') });
    await C.click('#pce-env-share'); await C.waitForFunction(() => window.__shares.length === 1);
    const sh = await C.evaluate(() => window.__shares[0]);
    ok(sh.files.length === 2 && sh.files.every(f => f.type === 'application/pdf' && f.ini === '%PDF-' && /%%EOF/.test(f.fim) && f.paginas >= 1 && f.size > 20000 && f.size < 3e6),
      'navigator.share recebeu 2 arquivos PDF válidos: ' + sh.files.map(f => `${f.name} (${Math.round(f.size / 1024)} KB, ${f.paginas} pág.)`).join(', '));
    ok(sh.files[0].paginas >= 2 && sh.files[1].paginas === 1, `ficha com 14 fotos em ${sh.files[0].paginas} páginas (quebra sem cortar fotos); a outra em 1`);
    ok(/Bactrocera/.test(sh.files[0].name) && /HLB/.test(sh.files[1].name) && /Levantamento fitossanitário/.test(sh.title), 'um PDF por praga, com o nome de cada praga');
    const pdfs = await C.evaluate(async () => Promise.all(window.__arqs.map(async f => ({ nome: f.name, b64: await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); }) }))));
    pdfs.forEach((f, i) => fs.writeFileSync(amb.saida(`pce_campo_produtor_${i + 1}.pdf`), Buffer.from(f.b64, 'base64')));
    try {
      const out = require('child_process').execFileSync('python3', ['-c', 'import sys,pypdf\nfor a in sys.argv[1:]:\n r=pypdf.PdfReader(a); p=r.pages[0]; print(len(r.pages), round(float(p.mediabox.width)), round(float(p.mediabox.height)))', amb.saida('pce_campo_produtor_1.pdf'), amb.saida('pce_campo_produtor_2.pdf')]).toString().trim().split('\n');
      ok(out.length === 2 && out.every(l => / 595 842$/.test(l)), 'pypdf abre os PDFs (A4 595×842 pt): ' + out.join(' | '));
    } catch (e) { console.log('  (pypdf indisponível: conferência das páginas pulada) ' + e.message.split('\n')[0]); }
    const termo = await C.evaluate(async () => { const t = { id: 't-campo', unidade: 'PARINTINS', ano: 2026, numero: 7, numeroTxt: '007/2026/PARINTINS', data: '2026-10-12', hora: '10:00',
      servidor: 'Carla Mendes Rocha', cargo: 'Fiscal', municipio: 'Parintins', doc: '52998224725', nome: 'JOSÉ DA SILVA', endereco: 'Sítio Boa Vista', cultura: 'Banana', quantidade: 2,
      partes: 'folhas', descricao: 'Texto oficial.', fotos: '[]', assinaturas: '{}', local: 'Parintins/AM' };
      const f = await Docs.pceColheita(t, {}, 'arquivo'), u = new Uint8Array(await f.arrayBuffer());
      return { name: f.name, ini: String.fromCharCode(...u.slice(0, 5)), pags: (new TextDecoder('latin1').decode(u).match(/\/Type \/Page /g) || []).length }; });
    ok(termo.ini === '%PDF-' && termo.pags === 1 && termo.name === 'Termo_Colheita_007_2026_PARINTINS_via_do_produtor.pdf', 'Termo de Colheita: PDF só com a via do produtor (' + termo.name + ')');
    // aparelho sem compartilhamento de arquivos: baixa e explica
    await C.click('#pce-env-fechar'); await C.evaluate(() => { window.__semShare = true; });
    await C.click('#pce-enviar'); await C.click('input[name=pce-env] >> nth=1'); await C.click('#pce-env-gerar'); await C.waitForSelector('#pce-env-baixar', { timeout: 60000 });
    ok(await C.locator('#pce-env-share').count() === 0 && /Downloads/.test(await C.textContent('.pce-env-semshare')), 'sem compartilhamento de arquivo: botão Baixar + instrução (anexar → Documento)');
    const [dl] = await Promise.all([C.waitForEvent('download'), C.click('#pce-env-baixar')]);
    ok(/^Levantamento_JOSE_DA_SILVA_Bactrocera_carambolae_\d\d-\d\d-\d{4}\.pdf$/.test(dl.suggestedFilename()), 'baixa só o PDF escolhido: ' + dl.suggestedFilename());
    await C.click('#pce-env-fechar'); await C.evaluate(() => { window.__semShare = false; });

    console.log('5) mapa "Perto de mim" (sem internet)');
    await C.click('nav [data-v=pcemapa]'); await C.waitForSelector('#campo-mapa .leaflet-container, #campo-mapa.leaflet-container', { timeout: 15000 });
    await C.waitForFunction(() => document.querySelectorAll('path.campo-ponto').length === 4 && /Sua posição/.test(document.querySelector('#campo-pos-st').textContent), null, { timeout: 15000 });
    const cores = await C.evaluate(() => [...document.querySelectorAll('path.campo-ponto')].map(e => [...e.classList].find(c => /^campo-ponto-/.test(c)).slice(12) + ':' + e.getAttribute('fill')).sort());
    ok(JSON.stringify(cores) === JSON.stringify(['antigo:#d32f2f', 'deteccao:#e0a800', 'nunca:#d32f2f', 'ok:#2e7d32']), 'cores pelo histórico (vermelho nunca/>180 d, amarelo detecção, verde ≤180 d): ' + cores.join(', '));
    ok(await C.locator('path.campo-eu').count() === 1 && await C.locator('#campo-mapa path.leaflet-interactive').count() >= 5, 'posição do servidor no mapa');
    ok(await C.locator('#campo-mapa .leaflet-tile').count() === 0 && await C.locator('#campo-mapa svg path').count() > 60, 'sem internet: sem fundo de ruas, com os contornos dos municípios');
    const ids = await C.$$eval('.campo-item', l => l.map(e => e.dataset.id));
    ok(JSON.stringify(ids) === JSON.stringify(['PRP-001', 'PRP-003', 'PRP-002', 'PRP-004', 'PRP-005']), 'lista por distância, sem localização no fim: ' + ids.join(', '));
    const dists = await C.$$eval('.campo-item .campo-dist', l => l.map(e => e.textContent));
    const esper = [P[1], P[3], P[2], P[4]].map(p => 'a ' + km(dist(EU, [p.lat, p.lon])));
    ok(JSON.stringify(dists) === JSON.stringify([...esper, 'sem localização']), 'distâncias (haversine): ' + dists.join(', '));
    ok(/Sem localização/i.test(await C.textContent('.campo-sep')), 'separador "Sem localização"');
    ok(/Último levantamento: \d\d\/\d\d\/\d{4}.*Bactrocera carambolae.*Monilíase do Cacaueiro \(suspeita\)/.test(await C.textContent('.campo-item[data-id=PRP-002]')), 'item mostra o último levantamento e as pragas');
    await C.screenshot({ path: amb.saida('pce_campo_mapa.png'), fullPage: true });
    await C.selectOption('#campo-raio', '5');
    ok(JSON.stringify(await C.$$eval('.campo-item', l => l.map(e => e.dataset.id))) === '["PRP-001"]', 'raio de 5 km: só a mais próxima');
    await C.selectOption('#campo-raio', ''); await C.fill('#campo-q', 'esperança');
    ok(JSON.stringify(await C.$$eval('.campo-item', l => l.map(e => e.dataset.id))) === '["PRP-002"]', 'busca na lista do mapa');
    await C.fill('#campo-q', '');

    console.log('6) cartão e "Fazer levantamento aqui"');
    await C.click('.campo-item[data-id=PRP-003]'); await C.waitForSelector('#campo-cartao-box');
    const cart = (await C.textContent('#campo-cartao-box')).replace(/\s+/g, ' ');
    ok(/PEDRO SANTOS/.test(cart) && /Chácara Rio Azul/.test(cart) && /PRP-003/.test(cart) && /Nenhum levantamento registrado/.test(cart) && /Nunca levantada/.test(cart), 'cartão: produtor, propriedade, código e último levantamento');
    await C.screenshot({ path: amb.saida('pce_campo_cartao.png'), fullPage: false });
    await C.click('#campo-levantar'); await C.waitForSelector('#pceLevForm');
    await C.waitForFunction(() => document.querySelector('#pce-propriedade').value === 'Chácara Rio Azul');
    ok((await C.inputValue('#pce-doc')) === '390.533.447-05' && (await C.inputValue('#pce-nome')) === 'PEDRO SANTOS' && (await C.inputValue('#pce-codigo')) === 'PRP-003'
      && (await C.inputValue('#pce-municipio')) === 'Parintins' && /Propriedade escolhida no mapa/.test(await C.textContent('#pce-st-doc')), '"Fazer levantamento aqui" abre o formulário novo já preenchido');
    await C.click('[data-pce=descartarlev]'); await C.waitForSelector('#pceItens');

    console.log('7) rota');
    await C.click('nav [data-v=pcemapa]'); await C.waitForSelector('.campo-item');
    for (const id of ['PRP-004', 'PRP-002', 'PRP-003']) { await C.click(`.campo-item[data-id=${id}]`); await C.waitForSelector('#campo-incluir'); await C.click('#campo-incluir'); await C.waitForFunction(i => /na rota/.test(document.querySelector(`.campo-item[data-id="${i}"]`).textContent), id); }
    ok(/Rota \(3\)/.test(await C.textContent('#campo-rota-btn')), 'três propriedades incluídas na rota');
    ok(await C.locator('#campo-cartao-box').count() === 0 || /remover/.test(await C.textContent('#campo-incluir')), 'cartão mostra "Na rota — remover"');
    ok(await C.locator('path.campo-rota-linha').count() === 1, 'rota desenhada no mapa');
    await C.click('#campo-rota-btn'); await C.waitForSelector('#campo-rota');
    let ordem = await C.$$eval('.campo-rota-lista li', l => l.map(e => e.dataset.id));
    ok(JSON.stringify(ordem) === '["PRP-003","PRP-002","PRP-004"]', 'ordem sugerida (mais próxima a partir da posição + 2-opt): ' + ordem.join(' → '));
    const tot = dist(EU, [P[3].lat, P[3].lon]) + dist([P[3].lat, P[3].lon], [P[2].lat, P[2].lon]) + dist([P[2].lat, P[2].lon], [P[4].lat, P[4].lon]);
    ok((await C.textContent('#campo-rota-total')).includes(km(tot)), 'distância total em linha reta: ' + (await C.textContent('#campo-rota-total')).trim());
    const hrefs = await C.$$eval('a.campo-gmaps', l => l.map(a => a.href));
    const u = new URL(hrefs[0]), c6 = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    ok(hrefs.length === 1 && u.origin + u.pathname === 'https://www.google.com/maps/dir/' && u.searchParams.get('api') === '1' && u.searchParams.get('origin') === '-2.630000,-56.740000'
      && u.searchParams.get('destination') === c6(P[4]) && u.searchParams.get('waypoints') === `${c6(P[3])}|${c6(P[2])}` && u.searchParams.get('travelmode') === 'driving',
      'URL do Google Maps: ' + hrefs[0]);
    ok(await C.getAttribute('a.campo-gmaps', 'target') === '_blank' && /Mapas off-line/.test(await C.textContent('#view')), 'abre em nova aba; dica do Google Maps sem internet');
    await C.screenshot({ path: amb.saida('pce_campo_rota.png'), fullPage: true });
    await C.click('[data-campo=descer][data-i="0"]'); await C.waitForFunction(() => document.querySelector('.campo-rota-lista li').dataset.id === 'PRP-002');
    ordem = await C.$$eval('.campo-rota-lista li', l => l.map(e => e.dataset.id));
    ok(JSON.stringify(ordem) === '["PRP-002","PRP-003","PRP-004"]' && /Ordem escolhida por você/.test(await C.textContent('#campo-rota')), 'reordenar à mão (descer)');
    await C.click('[data-campo=sugerir]'); await C.waitForFunction(() => document.querySelector('.campo-rota-lista li').dataset.id === 'PRP-003'); ok(true, '"Sugerir ordem" volta à ordem pela distância');
    await C.click('[data-campo=tirar][data-i="2"]'); await C.waitForFunction(() => document.querySelectorAll('.campo-rota-lista li').length === 2);
    ok(new URL(await C.getAttribute('a.campo-gmaps', 'href')).searchParams.get('waypoints') === c6(P[3]), 'remover da rota atualiza o link');
    const trechos = await C.evaluate(() => { const pts = Array.from({ length: 12 }, (_, i) => ({ lat: -2.5 - i * 0.01, lon: -56.7 })); return Campo.urlsGoogle({ lat: -2.4, lng: -56.7 }, pts).map(x => { const q = new URL(x).searchParams; return { o: q.get('origin'), d: q.get('destination'), w: (q.get('waypoints') || '').split('|').filter(Boolean).length }; }); });
    ok(trechos.length === 2 && trechos[0].w === 9 && trechos[1].o === trechos[0].d && trechos[1].w === 1, 'mais de 9 paradas: dividida em trechos (9 paradas + destino; o trecho 2 começa onde o 1 terminou)');
    ok(await C.evaluate(() => Store.meta('pceRota').then(r => r.ids.length)) === 2, 'rota guardada no aparelho');

    console.log('8) apagar do aparelho (ainda sem internet: o produtor com levantamento pendente fica)');
    await C.click('nav [data-v=pce]'); await C.waitForSelector('#pce-campo'); await C.click('#pce-campo'); await C.waitForSelector('[data-campo=apagar][data-mun=Parintins]');
    await C.click('[data-campo=apagar][data-mun=Parintins]'); await C.waitForSelector('#campo-baixados .vazio');
    const depois = await C.evaluate(async () => ({ props: (await Store.todos('propriedades')).map(p => p.id + (p.campoMun ? '*' : '')).sort(), pes: (await Store.todos('pessoas')).map(p => p.id).sort(),
      meta: await Store.meta('pceCampo'), rota: (await Store.meta('pceRota')).ids }));
    ok(JSON.stringify(depois.props) === '["PRP-001","PRP-004"]' && JSON.stringify(depois.pes) === '["52998224725"]', 'apagou os baixados; ficou só o produtor com levantamento pendente (sem a marca de baixado): ' + JSON.stringify(depois));
    ok(JSON.stringify(depois.meta) === '{}' && JSON.stringify(depois.rota) === '[]', 'meta e rota limpas');

    console.log('9) com internet: envio, novo download e atualização automática (6 h)');
    await C.ctx.setOffline(false); await C.evaluate(() => window.dispatchEvent(new Event('online')));
    await C.evaluate(() => Sync.sincronizar());
    await C.waitForFunction(async () => (await Store.todos('levantamentos')).every(l => !l.pendente), null, { timeout: 15000 });
    const levs = await ler('Levantamentos');
    ok(levs.some(l => l.codigoPropriedade === 'PRP-001' && l.usuario === fC.nome && l.data === diaM(0)), 'levantamento feito sem internet chegou à planilha');
    await C.check('input[name=campo-mun][value=Parintins]'); await C.click('#campo-baixar'); await C.waitForSelector('.campo-mun[data-mun=Parintins]', { timeout: 20000 });
    const antes = await C.evaluate(async () => { const m = await Store.meta('pceCampo'); m.PARINTINS.baixadoEm = Date.now() - 7 * 3600e3; await Store.setMeta('pceCampo', m); return m.PARINTINS.baixadoEm; });
    ok(await C.evaluate(() => Campo.atualizarSozinho()) === true, 'baixado há mais de 6 h: atualiza sozinho');
    ok(await C.evaluate(a => Store.meta('pceCampo').then(m => m.PARINTINS.baixadoEm > a), antes), 'data do download atualizada');
    ok(await C.evaluate(() => Campo.atualizarSozinho()) === false, 'recente: não baixa de novo');
    const hist = await C.evaluate(async () => { const p = await Store.obter('propriedades', 'PRP-001'); return p.resumoLev; });
    ok(hist.n === 2 && hist.ultimo, 'resumo atualizado com o levantamento novo (2 levantamentos)');
    // com internet, o mapa mostra também as propriedades dos municípios não baixados (Manaus), sem produtor
    await C.click('nav [data-v=pcemapa]'); await C.waitForSelector('#campo-mapa .leaflet-container, #campo-mapa.leaflet-container', { timeout: 15000 });
    await C.waitForSelector('.campo-item[data-id=MAN-001]', { timeout: 15000 });
    ok(/1 propriedade\(s\) dos municípios não baixados/.test(await C.textContent('#campo-geral')) && await C.locator('#campo-semdados').count() === 0, 'com internet: aviso de que o mapa inclui as propriedades dos municípios não baixados');
    ok(await C.locator('path.campo-ponto').count() === 5, 'mapa com as 4 de Parintins (baixado) + 1 de Manaus (geral)');
    await C.click('.campo-item[data-id=MAN-001]'); await C.waitForSelector('#campo-cartao-box');
    const cartG = (await C.textContent('#campo-cartao-box')).replace(/\s+/g, ' ');
    ok(/Sítio Manauara/.test(cartG) && /Manaus ainda não foi baixado/.test(cartG) && !/ANA MANAUARA|714\.287/.test(cartG) && await C.locator('#campo-baixar-mun').count() === 1 && await C.locator('#campo-levantar').count() === 0,
      'cartão da propriedade não baixada: sem produtor, com "Baixar dados do município" e sem "Fazer levantamento aqui"');
    await C.click('.campo-item[data-id=PRP-003]'); await C.waitForSelector('#campo-levantar');
    ok(/PEDRO SANTOS/.test(await C.textContent('#campo-cartao-box')), 'propriedade do município baixado continua com o produtor');
    await C.screenshot({ path: amb.saida('pce_campo_mapa_geral.png'), fullPage: true });
    // a gerência tira o PCE: os dados baixados saem do aparelho na próxima sincronização (LGPD)
    r = await U.permissoes(fC.uid, U.lista({ veiculos: 1, tf: 1, pce: 0 })); if (!r.ok) throw new Error(r.erro);
    await C.evaluate(() => Sync.sincronizar());
    await C.waitForFunction(async () => !Object.keys((await Store.meta('pceCampo')) || {}).length && !(await Store.todos('propriedades')).length, null, { timeout: 10000 });
    ok(true, 'sem o módulo PCE: dados baixados apagados do aparelho sozinhos');
    r = await U.permissoes(fC.uid, U.lista({ veiculos: 1, tf: 1, pce: 1 }));

    console.log('10) permissão: fiscal sem o módulo PCE');
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
