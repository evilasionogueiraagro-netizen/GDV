const amb = require('./lib/amb');
// Relatório GDV (painel → aba Relatórios; actions painelRelGdv, painelRelGdvSalvar e painelRelGdvApuracao do Code.gs real via fakegas):
// levantamentos em meses diferentes do ano anterior (citros com HLB/cancro/Diaphorina, soja com Amaranthus, monilíase com detecção e
// suspeita, carambola, R4T e uma praga fora dos grupos), tipos de local (Viveiro, UP), propriedades novas e antigas, Termos de
// Fiscalização do PCE (Educação Sanitária, UP/UC, cancelado), Termos de Colheita com resultados (positivo, negativo, aguardando > 30 dias),
// turnos fixos e volantes com veículos e TFs (liberação/apreensão em kg, t e caixas). Confere a apuração (totais que fecham, propriedades
// e área distintas no ano, toneladas só de massa), a aba (tabelas por grupo, quadro PCE mês/acumulado/total, VIGIFITO total = fixas +
// volantes), lançamentos manuais e textos (salvar, recarregar), o relatório mensal e o anual em PDF e Word (zip, document.xml, números,
// paisagem, mapas; LibreOffice se houver), LGPD (nenhum CPF completo/nome completo), fiscal recusado e celular 390 px.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { API } = amb;
const PORTAL = require('./lib/portal');
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => perfil === 'admin' ? amb.gerente(nome) : amb.usuario(nome);   // conta pronta e token (atalho /__usuario)
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_RELGDV || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const salvar = (nome, buf) => { fs.writeFileSync(amb.saida('relgdv_' + nome), buf); if (SAIDA) fs.writeFileSync(path.join(SAIDA, nome), buf); return amb.saida('relgdv_' + nome); };
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('relgdv_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('relgdv_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const py = (codigo, ...args) => { try { return execFileSync('python3', ['-c', codigo, ...args], { timeout: 90000 }).toString().trim(); } catch (e) { return null; } };

// o ano anterior inteiro já passou: o anual e todos os meses ficam fechados, sem depender da data de hoje
const A = new Date(Date.now() - 4 * 3600e3).getUTCFullYear() - 1;
const d = (m, dia) => `${A}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const CPF = '52998224725', CPF2 = '39053344705';
const PROIBIDOS = [CPF, CPF2, '529.982.247-25', '390.533.447-05', 'RAIMUNDO NONATO SECRETO', 'Raimundo Nonato Secreto', 'FAZENDEIRA OCULTA SILVA', 'Joana Fiscal', '-3.11912', '-60.02171'];
const agora = Date.now();
const C = (cultura, resultado, area, coleta) => ({ cultura, area: String(area), resultado, coleta: coleta ? 'Sim' : 'Não', tipoMaterial: coleta ? 'Frutos' : '', codigoAmostra: coleta ? 'AM-1' : '' });
const LEV = (id, data, municipio, codigo, pragas, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Pedro Volante', doc: CPF, nome: 'RAIMUNDO NONATO SECRETO', propriedade: 'Sítio ' + codigo,
  codigoPropriedade: codigo, municipio, lat: '-3.11912', lon: '-60.02171', culturas: '[]', pragas: JSON.stringify(pragas.map(([praga, ...cs]) => ({ praga, culturas: cs }))),
  fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
const LEVS = [
  LEV('a1', d(1, 15), 'Manaus', 'CIT-1', [['HLB / Greening', C('Laranja', 'nao_detectada', 2)], ['Cancro Cítrico', C('Laranja', 'suspeita', 2)]], { tipoLocal: 'Propriedade comercial', origemVisita: 'Levantamento de rotina' }),
  LEV('a2', d(3, 5), 'Manaus', 'VIV-1', [['HLB / Greening', C('Laranja', 'nao_detectada', 1)], ['Diaphorina citri (vetor do HLB)', C('Laranja', 'detectada', 1)]], { tipoLocal: 'Viveiro' }),
  LEV('a3', d(3, 7), 'Iranduba', 'CIT-2', [['Schizotetranychus hindustanicus', C('Limão', 'nao_detectada', 3)]]),
  LEV('a4', d(3, 10), 'Humaitá', 'SOJ-1', [['Phakopsora pachyrhizi', C('Soja', 'nao_detectada', 10)], ['Amaranthus palmeri', C('Soja', 'detectada', 10, true)]], { tipoLocal: 'Unidade de Produção (UP)', doc: CPF2, nome: 'FAZENDEIRA OCULTA SILVA' }),
  LEV('a5', d(3, 12), 'Tabatinga', 'MON-1', [['Monilíase do Cacaueiro', C('Cacau', 'detectada', 1, true)]]),
  LEV('a6', d(3, 12), 'Tabatinga', 'MON-2', [['Monilíase do Cacaueiro', C('Cupuaçu', 'suspeita', 0.5)]], { origemVisita: 'Notificação voluntária do produtor' }),
  LEV('a7', d(3, 20), 'Manaus', 'CIT-1', [['HLB / Greening', C('Laranja', 'nao_detectada', 2.5)]]),
  LEV('a8', d(3, 21), 'Manaus', 'OLD-1', [['Vassoura de Bruxa da Mandioca', C('Mandioca', 'nao_detectada', 4)]]),
  LEV('a9', d(6, 2), 'Manaus', 'CAR-1', [['Bactrocera carambolae', C('Laranja', 'nao_detectada', 1)]]),
  LEV('a10', d(6, 3), 'Itacoatiara', 'BAN-1', [['Fusarium R4T', C('Banana', 'nao_detectada', 3)]]),
  LEV('a11', d(3, 22), 'Manaus', 'EXC-1', [['HLB / Greening', C('Laranja', 'detectada', 9)]], { excluido: 1 })
];
const TPCE = (id, data, mun, extra = {}) => ({ id, unidade: mun.toUpperCase(), ano: A, numero: Number(id.replace(/\D/g, '')), data, hora: '10:00', municipio: mun, programa: 'moniliase',
  doc: CPF, nome: 'RAIMUNDO NONATO SECRETO', servidor: 'Pedro Volante', pragas: '["Monilíase"]', acoes: '[]', tipoLocal: '[]', testemunhas: '[]', cancelado: 0, excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
const COL = (id, data, mun, levId, cultura, qtd, lab, extra = {}) => ({ id, unidade: mun.toUpperCase(), ano: A, numero: Number(id.replace(/\D/g, '')), numeroTxt: `00${id.replace(/\D/g, '')}/${A}/${mun.toUpperCase()}`,
  data, hora: '11:00', servidor: 'Pedro Volante', municipio: mun, doc: CPF, nome: 'RAIMUNDO NONATO SECRETO', levantamentoId: levId, cultura, quantidade: qtd, analise: 'Fitopatológica',
  partes: 'frutos', fotos: '[]', assinaturas: '{}', cancelado: 0, excluido: 0, criadoEm: agora, atualizadoEm: agora, laboratorio: lab ? JSON.stringify({ atualizadoEm: agora, ...lab }) : '', ...extra });
const T = (id, data, local, posto) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Joana Fiscal', local, unidade: 'MANAUS', posto, encerrado: 1, criadoEm: agora, atualizadoEm: agora });
const V = (id, turnoId, pessoas) => ({ id, turnoId, hora: '08:00', placa: '', tipo: 'PA', pessoas, obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora });
const TF = (id, turnoId, data, proc, produtos, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: A, numero: Number(id.replace(/\D/g, '')), turnoId, data, hora: '09:00', fiscal: 'Joana Fiscal', local: 'BVA - CEASA',
  doc: CPF, nome: 'RAIMUNDO NONATO SECRETO', procedimento: proc, produtos: JSON.stringify(produtos), cancelado: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
const GRUPOS = [{ id: 'citros', colunas: [{ rotulo: 'HLB', pragas: ['HLB', 'Greening'] }, { rotulo: 'Cancro', pragas: ['Cancro'] }, { rotulo: 'Ácaro', pragas: ['Schizotetranychus'] }, { rotulo: 'Diaphorina', pragas: ['Diaphorina'] }] },
  { id: 'soja', colunas: [{ rotulo: 'Ferrugem', pragas: ['Phakopsora'] }, { rotulo: 'Amaranthus', pragas: ['Amaranthus'] }] },
  { id: 'moniliase', colunas: [{ rotulo: 'Focos', pragas: ['Moniliase'] }] }, { id: 'carambola', colunas: [{ rotulo: 'Det', pragas: ['Bactrocera'] }] }, { id: 'banana', colunas: [{ rotulo: 'R4T', pragas: ['R4T'] }] }];

(async () => {
  /* ================= 1. servidor ================= */
  console.log(`1. Servidor: dados de ${A}, permissões e apuração`);
  let r = await post({ action: 'sync', key: await amb.carga(), since: 0, levantamentos: LEVS,
    propriedades: [{ id: 'OLD-1', codigo: 'OLD-1', nome: 'Sítio OLD-1', doc: CPF, municipio: 'Manaus', criadoEm: Date.UTC(A - 1, 4, 1), atualizadoEm: agora }],
    termosPce: [TPCE('p1', d(3, 12), 'Tabatinga', { acoes: '["Levantamento","Educação Sanitária"]' }), TPCE('p2', d(3, 10), 'Humaitá', { propriedadeId: 'SOJ-1', tipoLocal: '["Unidade de Produção (UP)"]', acoes: '["Fiscalização"]' }),
      TPCE('p3', d(6, 2), 'Manaus', { propriedadeId: 'UC-9', tipoLocal: '["Unidade de Consolidação (UC)"]' }), TPCE('p4', d(3, 25), 'Manaus', { cancelado: 1, acoes: '["Educação Sanitária"]' })],
    colheitas: [COL('c1', d(3, 12), 'Tabatinga', 'a5', 'Cacau', 2, { laboratorio: 'LFDA-GO', envio: d(3, 13), resultado: 'positivo', praga: 'Monilíase do Cacaueiro', dataResultado: d(3, 30), laudo: 'L-77' }),
      COL('c2', d(3, 10), 'Humaitá', 'a4', 'Soja', 1, { laboratorio: 'LFDA-PE', envio: d(3, 11), resultado: 'negativo', dataResultado: d(3, 20) }),
      COL('c3', d(6, 3), 'Itacoatiara', 'a10', 'Banana', 3, { laboratorio: 'Laboratório da ADAF', envio: d(6, 4), resultado: 'aguardando' }),
      COL('c4', d(3, 15), 'Manaus', '', 'Laranja', 5, null, { cancelado: 1 })],
    turnos: [T('t1', d(3, 5), 'BVA - CEASA', 'Fixa'), T('t2', d(3, 15), 'Estrada do Volante', 'Móvel'), T('t3', d(6, 10), 'BVA - JUNDIÁ', 'Fixa')],
    veiculos: [V('v1', 't1', 5), V('v2', 't1', 5), V('v3', 't1', 1), V('v4', 't2', 2), V('v5', 't2', 40), V('v6', 't3', 1), { ...V('v7', 't1', 9), excluido: 1 }],
    tfs: [TF('f1', 't1', d(3, 5), 'liberacao', ['LARANJA - 1.500 Kg', 'MANGA - 2 Ton'], { inspecao: 1, documentos: '{"ptv":"123"}' }),
      TF('f2', 't1', d(3, 5), 'apreensao', ['GOIABA - 250 Kg', 'CARAMBOLA - 10 Caixas']),
      TF('f3', 't2', d(3, 15), 'rechaco', [], { coleta: 1, amostras: 2, fiel: 1 }),
      TF('f4', 't3', d(6, 10), 'apreensao', ['TOMATE - 0,5 Ton'], { auto: 1, advertencia: 1 }),
      TF('f5', 't1', d(3, 5), 'apreensao', ['GOIABA - 1000 Kg'], { cancelado: 1 }),
      TF('f6', '', d(3, 20), 'liberacao', ['COCO - 100 Unidades'])] });
  ok(r.ok, 'dados de teste sincronizados', r.erro);
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const adm = await gerar('Gerente Relatorio', 'admin'), TOK = adm.token;
  const fis = await gerar('Fiscal Curioso'), TOKF = fis.token;
  ok(TOK && TOKF, 'credenciais de administrador e de fiscal');
  const SA = await PORTAL.sessao(TOK, 'relatorio.adm@gmail.com', 'Rita Relatorio Administrativa');
  for (const a of ['painelRelGdv', 'painelRelGdvSalvar', 'painelRelGdvApuracao', 'painelPceLaudo']) {
    const x = await post({ action: a, key: TOKF, ano: A, de: d(1, 1), ate: d(12, 31), grupos: GRUPOS, tipo: 'mensal', mes: '03', textos: { introducao: 'x' }, id: 'c1', laboratorio: { resultado: 'negativo' } });
    ok(!x.ok && /Acesso restrito/.test(x.erro), `fiscal comum recusado em ${a}`, x);
  }
  r = await post({ action: 'painelRelGdvApuracao', de: d(1, 1), ate: d(12, 31), grupos: GRUPOS }); ok(!r.ok && /Sessão do painel inválida/.test(r.erro), 'sem credencial: recusado', r.erro);
  r = await post({ action: 'painelRelGdvApuracao', key: TOK, de: d(1, 1), ate: `${A + 1}-03-01`, grupos: GRUPOS }); ok(!r.ok && /longo demais/.test(r.erro), 'período maior que um ano recusado', r.erro);
  const erros = [[{ lancamentos: [{ mes: '13', chave: 'pce.capacitacao', valor: 1 }] }, /Mês inválido/], [{ lancamentos: [{ mes: '03', chave: 'x.y', valor: 1 }] }, /inválida/],
    [{ lancamentos: [{ mes: '03', chave: 'pce.capacitacao', valor: -2 }] }, /inválido/], [{ lancamentos: [{ mes: '03', chave: 'pce.capacitacao', valor: 'dez' }] }, /número/]];
  for (const [x, re] of erros) { const y = await post({ action: 'admRelLancar', sessao: SA.sessao, ano: A, ...x }); ok(!y.ok && re.test(y.erro), `validação (portal): ${re.source}`, y.erro || y); }
  for (const [x, re] of [[{ tipo: 'mensal', mes: '03', textos: { introducao: 'Produtor CPF 529.982.247-25' } }, /CPF/], [{ tipo: 'semanal', textos: {} }, /Tipo de relatório/],
    [{ lancamentos: [{ mes: '03', chave: 'pce.capacitacao', valor: 1 }] }, /Portal do Administrativo/]]) { const y = await post({ action: 'painelRelGdvSalvar', key: TOK, ano: A, ...x }); ok(!y.ok && re.test(y.erro), `validação (painel): ${re.source}`, y.erro || y); }

  const AP = await post({ action: 'painelRelGdvApuracao', key: TOK, de: d(1, 1), ate: d(12, 31), grupos: GRUPOS });
  ok(AP.ok && AP.meses.length === 12, 'apuração anual: 12 meses', AP.erro || AP.meses);
  const Q = AP.quadro, mar = Q.porMes[`${A}-03`], jan = Q.porMes[`${A}-01`], jun = Q.porMes[`${A}-06`];
  ok(mar.inspecoes === 7 && mar.propVisitadas === 7 && mar.propNovas === 5 && mar.propAntigas === 2, 'março: 7 levantamentos, 7 propriedades distintas, 5 novas e 2 antigas (CIT-1 de janeiro; OLD-1 cadastrada no ano anterior)', mar);
  ok(jan.propVisitadas === 1 && jan.propNovas === 1 && jun.propVisitadas === 2 && jun.propNovas === 2, 'janeiro 1 nova; junho 2 novas', [jan, jun]);
  ok(Q.total.propVisitadas === 9 && Q.total.propNovas === 8 && Q.total.propAntigas === 1 && Q.total.inspecoes === 10, 'ano: 9 propriedades distintas (não 10 = soma dos meses), 8 novas, 1 antiga; 10 levantamentos (excluído fora)', Q.total);
  ok(mar.area === 22 && jan.area === 2 && jun.area === 4 && Q.total.area === 26, 'área monitorada: março 22 ha, jan 2, jun 4; ano 26 ha (propriedades distintas, não 28 = soma dos meses)', [mar.area, jan.area, jun.area, Q.total.area]);
  ok(mar.porCol['0:0'] === 2 && Q.total.porCol['0:0'] === 3 && mar.porCol['0:3'] === 1 && mar.porCol['1:1'] === 1 && mar.outras === 1, 'levantamentos por praga: HLB mar 2 / ano 3; Diaphorina 1; Amaranthus 1; outras (vassoura) 1', mar.porCol);
  ok(mar.termosFisc === 2 && mar.educacao === 1 && mar.upuc === 1 && jun.upuc === 1 && Q.total.termosFisc === 3, 'termos de fiscalização (cancelado fora), educação sanitária 1, UP/UC: levantamento + termo da mesma visita = 1', [mar, jun.upuc]);
  ok(mar.colheitas === 2 && mar.amostras === 3 && jun.colheitas === 1 && jun.amostras === 3, 'termos de colheita (cancelado fora) e amostras enviadas pela data de envio', [mar.colheitas, mar.amostras, jun.amostras]);
  const G = Object.fromEntries(AP.grupos.map(g => [g.id, g])), mun = (g, n) => G[g].municipios.find(x => x.municipio === n);
  ok(mun('citros', 'Manaus').propriedades === 2 && mun('citros', 'Manaus').susp[1] === 1 && mun('citros', 'Manaus').det[3] === 1 && mun('citros', 'Iranduba').propriedades === 1 && G.citros.viveiros === 1,
    'citros: Manaus 2 propriedades (CIT-1 duas vezes), cancro suspeito, Diaphorina detectada (não vai para HLB); Iranduba 1; 1 viveiro', G.citros.municipios);
  ok(mun('soja', 'Humaitá').det[1] === 1 && mun('moniliase', 'Tabatinga').propriedades === 2 && mun('moniliase', 'Tabatinga').det[0] === 1 && mun('moniliase', 'Tabatinga').suspeitas === 1 && mun('moniliase', 'Tabatinga').amostras === 1,
    'soja: Amaranthus em Humaitá; monilíase Tabatinga: 2 propriedades, 1 foco, 1 suspeita, 1 amostra');
  ok(G.carambola.propriedades === 1 && G.banana.municipios[0].municipio === 'Itacoatiara', 'carambola e banana (R4T)');
  const lab = Object.fromEntries(AP.laboratorio.porPraga.map(x => [x.praga, x]));
  ok(lab['Monilíase do Cacaueiro'].positivo === 1 && lab['Monilíase do Cacaueiro'].amostras === 2 && lab['Amaranthus palmeri'].negativo === 1 && lab['Fusarium R4T'].aguardando === 1 && AP.laboratorio.semResultado30 === 1,
    'laboratório por praga (do levantamento ligado): monilíase positiva, Amaranthus negativa, R4T aguardando há mais de 30 dias', AP.laboratorio);
  const vf = AP.vigifito.fixa[`${A}-03`], vv = AP.vigifito.volante[`${A}-03`], vj = AP.vigifito.fixa[`${A}-06`];
  ok(vf.turnos === 1 && vf.veiculos === 3 && vf.pessoas === 11 && vf.tfs === 3 && vf.liberacao === 2 && vf.apreensao === 1 && vf.documentos === 1 && vf.inspecao === 1,
    'VIGIFITO fixas/março: 1 turno, 3 veículos (excluído fora), 11 pessoas, 3 TFs (cancelado fora; TF sem turno = fixa), 2 liberações, 1 apreensão', vf);
  ok(vf.liberacaoT === 3.5 && vf.apreensaoT === 0.25 && vf.outrasUnidades.apreensao.Caixas === 10 && vf.outrasUnidades.liberacao.Unidades === 100,
    'toneladas só de massa (1.500 kg + 2 t = 3,5 t; 250 kg = 0,25 t); caixas e unidades à parte, sem conversão', vf);
  ok(vv.turnos === 1 && vv.veiculos === 2 && vv.pessoas === 42 && vv.rechaco === 1 && vv.fiel === 1 && vv.coleta === 1 && vv.amostras === 2 && vj.apreensaoT === 0.5 && vj.infracao === 1 && vj.advertencia === 1,
    'VIGIFITO volantes/março e fixas/junho', [vv, vj]);
  const anexo = G.moniliase.anexo[0], apJson = JSON.stringify(AP);
  ok(anexo.produtor === 'R. N. S.' && anexo.doc === '***.982.247-**' && anexo.lat === -3.12 && anexo.lon === -60.02 && /Monilíase do Cacaueiro: detectada/.test(anexo.resultado),
    'anexo: produtor só com iniciais, CPF mascarado, coordenadas a 2 casas, praga e resultado', anexo);
  ok(!PROIBIDOS.some(x => apJson.includes(x)), 'apuração sem CPF completo, nome completo, servidor de campo ou coordenada exata', PROIBIDOS.filter(x => apJson.includes(x)));
  const AM = await post({ action: 'painelRelGdvApuracao', key: TOK, de: d(3, 1), ate: d(3, 31), grupos: GRUPOS });
  ok(AM.meses.length === 1 && AM.quadro.total.propVisitadas === 7 && AM.resumo.municipiosLevantados === 4, 'apuração só de março (mensal): 7 propriedades, 4 municípios', AM.resumo);

  if (process.env.GDV_RELGDV_SO_SERVIDOR) { console.log(falhas ? `FALHOU=${falhas}` : 'OK'); process.exit(falhas ? 1 : 0); }

  /* ================= 2. painel ================= */
  console.log('2. Painel → aba Relatórios (mensal: março)');
  const b = await amb.lancar();
  const errosPag = [];
  async function abrir(opts = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: true, ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    await c.addInitScript(([tok, url, ano]) => {
      if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Relatorio');
        localStorage.setItem('gdv.painel.relgdv', JSON.stringify({ tipo: 'mensal', ano, mes: 3 })); }
      if (window !== window.top) window.print = () => { const dd = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: dd.body.innerText.replace(/\s+/g, ' '), html: dd.documentElement.outerHTML, folhas: dd.querySelectorAll('.a4').length, imgs: dd.querySelectorAll('figure.fig img').length }); };
    }, [TOK, amb.API_URL, A]);
    const p = await c.newPage();
    p.on('pageerror', e => errosPag.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosPag.push(m.text()); });
    p.on('dialog', dl => dl.accept());
    await p.goto(amb.PAINEL);
    await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
    return p;
  }
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const est = p => p.evaluate(() => { const s = Painel.aba('relatorios').estado(); return JSON.parse(JSON.stringify({ ...s, R: s.R && { ...s.R, futuro: undefined } })); });
  const esperarR = (p, tipo, mes) => esperarR0(p, tipo, mes).catch(async e => { await p.screenshot({ path: amb.saida('relgdv_debug.png'), fullPage: false }); console.log('DEBUG', await p.evaluate(() => { const s = Painel.aba('relatorios').estado(); return JSON.stringify({ tipo: s.tipo, R: !!s.R, Rt: s.R && s.R.tipo, c: !!document.querySelector('#pn-rg-corpo.carregando'), erro: (document.querySelector('#pn-rg .pn-erro') || {}).textContent, msg: (document.querySelector('[data-msg=rg]')||{}).textContent }); }), errosPag.slice(0, 3)); throw e; });
  const esperarR0 = (p, tipo, mes) => p.waitForFunction(([t, m]) => { const s = Painel.aba('relatorios') && Painel.aba('relatorios').estado(); return s && s.R && s.R.tipo === t && (t === 'anual' || s.R.mes === m) && !document.querySelector('#pn-rg-corpo.carregando'); }, [tipo, mes], { timeout: 30000 });
  const p = await abrir();
  ok(await p.isVisible('.pn-aba[data-aba=relatorios]'), 'aba "Relatórios" no painel do administrador');
  await p.click('.pn-aba[data-aba=relatorios]');
  await esperarR(p, 'mensal', 3);
  ok(await p.isHidden('.pn-filtros'), 'aba sem filtros de período (apura no servidor, independente do período carregado)');
  ok(/Relatório Técnico Parcial — março\/\d{4}/.test(await p.textContent('#pn-rg-titulo')), 'título "Relatório Técnico Parcial — março/ano"', await p.textContent('#pn-rg-titulo'));
  let S = await est(p);
  const linhaQ = (R, k) => R.quadroPce.find(x => x.chave === k);
  ok(linhaQ(S.R, 'propVisitadas').mes === 7 && linhaQ(S.R, 'propVisitadas').acum === 7 && linhaQ(S.R, 'propNovas').acum === 6 && linhaQ(S.R, 'propNovas').mes === 5 && linhaQ(S.R, 'propAntigas').mes === 2,
    'quadro PCE (março): 7 visitadas, 5 novas, 2 antigas; acumulado jan–mar 7 distintas (CIT-1 em jan e mar conta uma vez), 6 novas', [linhaQ(S.R, 'propVisitadas'), linhaQ(S.R, 'propNovas')]);
  ok(linhaQ(S.R, 'area').mes === 22 && linhaQ(S.R, 'area').acum === 22, 'área: 22 ha no mês; acumulado jan–mar 22 ha (CIT-1 conta uma vez, com a maior área; não 24 = soma dos meses)', linhaQ(S.R, 'area'));
  const vt = k => S.R.vig.total.find(x => x.chave === k), vfx = k => S.R.vig.fixa.find(x => x.chave === k), vvo = k => S.R.vig.volante.find(x => x.chave === k);
  ok(vt('veiculos').mes === 5 && vt('veiculos').mes === vfx('veiculos').mes + vvo('veiculos').mes && vt('educacao').mes === 53 && vt('tfs').mes === 4 && vt('liberacaoT').mes === 3.5,
    'VIGIFITO na tela: total = fixas + volantes (5 veículos, 53 medidas de educação sanitária = pessoas a bordo, 4 TFs, 3,5 t liberadas)', [vt('veiculos'), vt('tfs')]);
  const gm = S.R.grupos.find(x => x.g.id === 'moniliase');
  ok(gm.total.propriedades === gm.linhas.reduce((s, l) => s + l.propriedades, 0) && gm.total.det[0] === 1 && S.R.grupos.find(x => x.g.id === 'citros').total.propriedades === 3,
    'tabelas por grupo: o total fecha com a soma das linhas', gm.total);
  ok(S.R.avisos.some(a => a.nivel === 'critico' && /positiva/.test(a.titulo)) && S.R.avisos.some(a => /linha\(s\) manual/.test(a.titulo)), 'avisos: amostra positiva e linhas manuais vazias', S.R.avisos.map(a => a.titulo));
  ok((await p.textContent('#pn-rg')).includes('Pragas dos Citros') && await p.locator('.pn-rg-grupo').count() === 5, 'pré-visualização das tabelas dos 5 grupos');
  // lançamentos manuais (Portal do Administrativo) e textos (painel)
  ok(!(await p.$('#pn-rg input.pn-rg-in')) && !(await p.$('[data-rg=add-linha]')), 'painel: linhas manuais só para leitura (lançadas no portal)');
  const pa = await PORTAL.abrir(b, SA, { aba: 'relatorios' });
  await pa.waitForSelector('#pn-rg-ano'); await pa.selectOption('#pn-rg-ano', String(A)); await pa.waitForSelector('#pn-rg-mes');
  await pa.selectOption('#pn-rg-mes', '3'); await pa.waitForSelector('.pn-rg-in[data-chave="pce.capacitacao"]');
  const preencher = async (sel, v) => { await pa.fill(sel, String(v)); };
  await preencher('.pn-rg-in[data-chave="pce.capacitacao"]', 2);
  await preencher('.pn-rg-in[data-chave="pce.areaControlada"]', '12,5');
  await pa.selectOption('[data-mun-novo="moniliase"]', 'Tabatinga'); await pa.click('[data-rg=add-mun][data-grupo=moniliase]');
  await pa.waitForSelector('.pn-rg-in[data-chave="mun.moniliase.poda|Tabatinga"]');
  await preencher('.pn-rg-in[data-chave="mun.moniliase.poda|Tabatinga"]', 5);
  await pa.selectOption('[data-mun-novo="moniliase"]', 'Benjamin Constant'); await pa.click('[data-rg=add-mun][data-grupo=moniliase]');
  await pa.waitForSelector('.pn-rg-in[data-chave="mun.moniliase.poda|Benjamin Constant"]');
  await preencher('.pn-rg-in[data-chave="mun.moniliase.poda|Benjamin Constant"]', 3);
  await preencher('.pn-rg-in[data-chave="hlb.armadilhas"]', 6);
  await pa.click('[data-rg=add-linha][data-tab="tab.cfo"]');
  await pa.fill('[data-tab="tab.cfo"][data-campo=produto]', 'BANANA COMPRIDA'); await pa.fill('[data-tab="tab.cfo"][data-campo=documentos]', '4');
  await pa.fill('[data-tab="tab.cfo"][data-campo=quantidade]', '300'); await pa.fill('[data-tab="tab.cfo"][data-campo=unidade]', 'caixa');
  await pa.click('[data-rg=add-linha][data-tab="tab.educacao"]');
  await pa.fill('[data-tab="tab.educacao"][data-campo=tipo]', 'Palestra'); await pa.fill('[data-tab="tab.educacao"][data-campo=descricao]', 'Palestra sobre monilíase na comunidade');
  await pa.fill('[data-tab="tab.educacao"][data-campo=atingido]', '45');
  await pa.click('#pn-rg-salvar');
  await pa.waitForFunction(() => /Gravado/.test(document.querySelector('[data-msg=rg]').textContent), null, { timeout: 15000 });
  await PORTAL.post({ action: 'admVigLancar', sessao: SA.sessao, lancamentos: [{ periodo: `${A}-03`, posto: 'pf-jundia', indicador: 'partidas', valor: 7, justificativa: 'Partidas anotadas no papel' }, { periodo: `${A}-03`, posto: 'tabatinga-volante', indicador: 'partidas', valor: 3, justificativa: 'Partidas anotadas no papel' }] });
  await p.fill('[data-txt=introducao]', 'Introdução do gestor: {municipiosLevantados} municípios em {periodo}.');
  await p.fill('[data-ass="0:nome"]', 'GESTOR DA GDV');
  await p.click('#pn-rg-salvar');
  await p.waitForFunction(() => /salvos/.test(document.querySelector('[data-msg=rg]').textContent), null, { timeout: 15000 });
  const lancs = await get('/__aba?nome=RelGdvLancamentos'), txts = await get('/__aba?nome=RelGdvTextos');
  const lan = (ch) => lancs.find(l => l[0] === `${A}|03|${ch}`);
  ok(lan('pce.capacitacao')[4] === 2 && lan('pce.areaControlada')[4] === 12.5 && lan('mun.moniliase.poda|Benjamin Constant')[4] === 3 && lan('pce.capacitacao')[6] === 'Rita Relatorio Administrativa',
    'lançamentos do portal na aba RelGdvLancamentos (um por mês e linha; quem lançou)', lancs.slice(1, 4));
  ok(/BANANA COMPRIDA/.test(lan('tab.cfo')[5]) && txts.length === 2 && txts[1][0] === `mensal|${A}|03` && /GESTOR DA GDV/.test(txts[1][4]), 'tabela de CFO (lista JSON) e textos (id mensal|ano|mês, salvos no painel)', txts[1]);
  await pa.context().close();
  await p.reload(); await p.click('.pn-aba[data-aba=relatorios]'); await esperarR(p, 'mensal', 3);
  S = await est(p);
  ok(await p.textContent('.pn-rg-val[data-chave="pce.capacitacao"]') === '2' && /lançado pelo Administrativo em .* por Rita Relatorio Administrativa/.test(await p.getAttribute('.pn-rg-val[data-chave="pce.capacitacao"]', 'title')) &&
    await p.inputValue('[data-txt=introducao]') === 'Introdução do gestor: {municipiosLevantados} municípios em {periodo}.' && /BANANA/.test(await p.textContent('[data-tab="tab.cfo"][data-campo=produto]')),
    'painel: lançamentos (só leitura, com quem/quando), tabela e textos persistem');
  ok(linhaQ(S.R, 'pce.capacitacao').mes === 2 && linhaQ(S.R, 'cfo').mes === 4 && S.R.grupos.find(x => x.g.id === 'moniliase').total.manual.poda === 8 && S.R.vig.total.find(x => x.chave === 'partidas').mes === 14,
    'manuais no cálculo: capacitação 2, CFO 4 (da tabela), poda drástica 5 + 3 = 8, partidas do VIGIFITO: substituições por posto 7 (Jundiá) + 3 (Tabatinga) + 4 TFs dos outros postos (e-GDV) = 14');
  await shot(p, 'aba_mensal');
  // relatório mensal: impressão (texto), PDF e Word
  console.log('3. Relatório mensal (PDF e Word)');
  await p.evaluate(() => { window.__prints = []; });
  await p.click('#pn-rg-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 30000 });
  let pr = await p.evaluate(() => window.__prints[0]), tx = pr.texto;
  ok(/RELATÓRIO TÉCNICO PARCIAL — MARÇO\/\d{4}/.test(tx) && /Introdução do gestor: 4 municípios em março\/\d{4}\./.test(tx), 'PDF mensal: título e marcadores substituídos', tx.slice(0, 300));
  ok(/SEÇÃO I/.test(tx) && /Pragas dos Citros/.test(tx) && /SEÇÃO II/.test(tx) && /SEÇÃO III/.test(tx) && /SEÇÃO IV/.test(tx) && /SEÇÃO V/.test(tx) && /SEÇÃO VI/.test(tx) && /CONCLUSÃO/.test(tx), 'PDF mensal: todas as seções');
  ok(/Acumulado no ano/.test(tx) && /BANANA COMPRIDA/.test(tx) && /Palestra sobre monilíase/.test(tx) && /GESTOR DA GDV/.test(tx) && /Gerente de Defesa Vegetal/.test(tx), 'PDF mensal: quadro com acumulado, CFO, educação e assinaturas');
  ok(pr.imgs >= 3 && !/ANEXOS/.test(tx), 'PDF mensal: mapas dos grupos (imagem) e sem anexo por padrão', [pr.imgs]);
  ok(!PROIBIDOS.some(x => tx.includes(x)), 'PDF mensal: sem CPF completo, nome completo ou coordenada exata', PROIBIDOS.filter(x => tx.includes(x)));
  salvar('relatorio_mensal.html', pr.html);
  const [dlPdf] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), p.click('#pn-rg-pdf')]);
  const pdfM = fs.readFileSync(await dlPdf.path()), pdfMArq = salvar(dlPdf.suggestedFilename(), pdfM);
  const npM = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfMArq));
  ok(pdfM.slice(0, 5).toString() === '%PDF-' && /Relatorio_GDV_Parcial_\d{4}-03\.pdf/.test(dlPdf.suggestedFilename()) && (npM >= 4 || isNaN(npM)), 'Baixar PDF (mensal): arquivo PDF com várias páginas', [dlPdf.suggestedFilename(), pdfM.length, npM]);
  const lerDocx = arq => { const o = py(`import sys,zipfile,json
from xml.dom import minidom
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
nomes=z.namelist(); x=z.read('word/document.xml').decode('utf-8'); minidom.parseString(x)
for n in nomes:
    if n.endswith('.xml') or n.endswith('.rels'): minidom.parseString(z.read(n))
out={'nomes':nomes,'tabelas':x.count('<w:tbl>'),'paisagem':x.count('w:orient="landscape"'),'imgs':[n for n in nomes if n.startswith('word/media/')],'xml':x}
try:
    import docx
    d=docx.Document(sys.argv[1]); out['txt']='\\n'.join(p.text for p in d.paragraphs); out['cel']=[c.text for t in d.tables for r in t.rows for c in r.cells]
except Exception as e: out['erro']=str(e)
print(json.dumps(out))`, arq); return o ? JSON.parse(o) : null; };
  const [dlDoc] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#pn-rg-docx')]);
  const docM = fs.readFileSync(await dlDoc.path()), docMArq = salvar(dlDoc.suggestedFilename(), docM);
  let W = lerDocx(docMArq);
  ok(docM.slice(0, 2).toString() === 'PK' && W && W.nomes.includes('word/document.xml') && W.imgs.length >= 6, 'Word mensal: pacote OOXML válido, logos e mapas (imagens no corpo)', W && [W.imgs.length, W.tabelas]);
  const celM = W && W.cel ? W.cel.join(' | ') : W ? W.xml : '';
  ok(W && W.tabelas >= 10 && /BANANA COMPRIDA/.test(celM) && /Acumulado no ano/.test(celM) && (W.txt || W.xml).includes('Introdução do gestor: 4 municípios'), 'Word mensal: tabelas (grupos, laboratório, PCE, VIGIFITO, CFO, PTV, educação, HLB) e textos', W && W.tabelas);
  ok(W && !PROIBIDOS.some(x => W.xml.includes(x)), 'Word mensal: sem dados pessoais');

  /* ---- anual ---- */
  console.log('4. Relatório anual (consolidado)');
  await p.selectOption('#pn-rg-tipo', 'anual'); await esperarR(p, 'anual');
  S = await est(p);
  ok(/Relatório Técnico \d{4} — Consolidado/.test(await p.textContent('#pn-rg-titulo')), 'título "Relatório Técnico ano — Consolidado"');
  ok(linhaQ(S.R, 'propVisitadas').total === 9 && linhaQ(S.R, 'propVisitadas').valores['03'] === 7 && linhaQ(S.R, 'area').total === 26 && linhaQ(S.R, 'inspecoes').total === 10,
    'quadro anual: jan–dez + total (9 propriedades distintas; área 26 ha; 10 inspeções)', linhaQ(S.R, 'propVisitadas'));
  ok(S.R.vig.total.find(x => x.chave === 'veiculos').total === 6 && S.R.vig.total.find(x => x.chave === 'apreensaoT').total === 0.75, 'VIGIFITO anual: 6 veículos; 0,75 t apreendidas', S.R.vig.total.find(x => x.chave === 'apreensaoT'));
  r = await PORTAL.post({ action: 'admRelLancar', sessao: SA.sessao, ano: A, lancamentos: [{ mes: '06', chave: 'pce.capacitacao', valor: 1 }] });
  ok(r.ok, 'portal: capacitação de junho lançada');
  await p.click('#pn-rg-atualizar'); await esperarR(p, 'anual');
  S = await est(p);
  ok(linhaQ(S.R, 'pce.capacitacao').total === 3 && linhaQ(S.R, 'pce.capacitacao').valores['03'] === 2, 'anual: capacitação = soma dos meses (2 em março + 1 em junho)', linhaQ(S.R, 'pce.capacitacao'));
  ok(await p.isChecked('#pn-rg-anexo'), 'anual: anexo marcado por padrão');
  await shot(p, 'aba_anual');
  await p.evaluate(() => { window.__prints = []; });
  await p.click('#pn-rg-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 30000 });
  pr = await p.evaluate(() => window.__prints[0]); tx = pr.texto;
  ok(/RELATÓRIO TÉCNICO \d{4} — CONSOLIDADO/.test(tx) && /VIGIFITO – TOTAL CONSOLIDADO/.test(tx) && /VIGIFITO – BVA FIXAS/.test(tx) && /VIGIFITO – BVA VOLANTES/.test(tx) && /Jan Fev Mar Abr Mai Jun/.test(tx), 'PDF anual: título, quadros jan–dez e os três blocos do VIGIFITO', tx.slice(0, 200));
  ok(/ANEXOS/.test(tx) && /R\. N\. S\./.test(tx) && /\*\*\*\.982\.247-\*\*/.test(tx) && pr.folhas >= 2, 'PDF anual: anexo por propriedade (iniciais, CPF mascarado) em folha própria', pr.folhas);
  ok(!PROIBIDOS.some(x => tx.includes(x)), 'PDF anual: sem CPF completo, nome completo ou coordenada exata', PROIBIDOS.filter(x => tx.includes(x)));
  salvar('relatorio_anual.html', pr.html);
  const [dlPdfA] = await Promise.all([p.waitForEvent('download', { timeout: 240000 }), p.click('#pn-rg-pdf')]);
  const pdfA = fs.readFileSync(await dlPdfA.path()), pdfAArq = salvar(dlPdfA.suggestedFilename(), pdfA);
  const npA = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfAArq));
  ok(pdfA.slice(0, 5).toString() === '%PDF-' && /Relatorio_GDV_\d{4}_Consolidado\.pdf/.test(dlPdfA.suggestedFilename()) && (npA >= 6 || isNaN(npA)), 'Baixar PDF (anual)', [dlPdfA.suggestedFilename(), npA]);
  const [dlDocA] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#pn-rg-docx')]);
  const docA = fs.readFileSync(await dlDocA.path()), docAArq = salvar(dlDocA.suggestedFilename(), docA);
  W = lerDocx(docAArq);
  const celA = W && W.cel ? W.cel.join(' | ') : W ? W.xml : '';
  ok(W && W.paisagem >= 2 && /TOTAL/.test(celA) && /R\. N\. S\./.test(celA) && /Jan/.test(celA), 'Word anual: seções em paisagem (quadros jan–dez e anexos), totais e anexo', W && [W.paisagem, W.tabelas]);
  ok(W && !PROIBIDOS.some(x => W.xml.includes(x)), 'Word anual: sem dados pessoais');
  for (const [arq, nome] of [[docMArq, 'mensal'], [docAArq, 'anual']]) {
    try {
      const out = amb.saida('relgdv_lo'); fs.mkdirSync(out, { recursive: true });
      execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, arq], { timeout: 180000, stdio: 'pipe' });
      const pdfLo = path.join(out, path.basename(arq).replace(/\.docx$/, '.pdf'));
      const nLo = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfLo));
      const tLo = py('import sys,pypdf;print(" ".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pdfLo) || '';
      ok(nLo >= 4 && /SEÇÃO II/.test(tLo), `LibreOffice converte o .docx ${nome} para PDF (${nLo} páginas)`, [nLo, tLo.slice(0, 100)]);
      if (SAIDA) fs.copyFileSync(pdfLo, path.join(SAIDA, `docx_${nome}_convertido_libreoffice.pdf`));
    } catch (e) { console.log(`  (LibreOffice indisponível: conversão do ${nome} não testada) ` + String(e.message).slice(0, 100)); }
  }

  /* ---- celular, escuro ---- */
  console.log('5. Celular (390 px), claro e escuro');
  for (const [tema, esquema] of [['claro', 'light'], ['escuro', 'dark']]) {
    const pc = await abrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: esquema });
    await pc.click('.pn-aba[data-aba=relatorios]'); await esperarR(pc, 'mensal', 3);
    ok(await semRolagem(pc), `celular ${tema}: aba Relatórios sem rolagem horizontal (tabelas largas rolam por dentro)`);
    await shot(pc, `celular_${tema}`);
    await pc.context().close();
  }
  const aba = await p.textContent('#pn-rg');
  ok(!PROIBIDOS.some(x => aba.includes(x)), 'aba sem dados pessoais', PROIBIDOS.filter(x => aba.includes(x)));
  ok(!errosPag.length, 'sem erros de JavaScript na página', errosPag.slice(0, 5));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
