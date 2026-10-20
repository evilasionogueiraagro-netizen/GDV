const amb = require('./lib/amb');
// Módulo PCE no servidor (Code.gs real no fakegas): numeração do Termo de Colheita, sync, consulta, arquivos no Drive.
const assert = require('assert'); const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
const aba = nome => get('/__aba?nome=' + encodeURIComponent(nome));
const ativar = async nome => { const g = await get('/__gerar?nome=' + encodeURIComponent(nome)); const r = await post({ action: 'ativar', codigo: g.codigo }); assert.ok(r.ok); return r.token; };
const append = (a, row) => fetch(B + '/__append?aba=' + a + '&row=' + encodeURIComponent(JSON.stringify(row)));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const uuid = () => require('crypto').randomUUID();
(async () => {
  // 0) planilha ANTIGA: aba Pessoas sem a coluna email, com um cadastro do TF
  const CAB_ANTIGO = ['id', 'tipo', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'];
  await append('Pessoas', CAB_ANTIGO);
  await append('Pessoas', ['52998224725', 'PF', 'JOSE DA SILVA', '123', 'RUA X', 'MANAUS', 'AM', '92999990000', 1, 1, 1, 'Antigo Fiscal']);

  const A = await ativar('Ana Paula Lima'), Bk = await ativar('Bruno Costa Souza'), ADM = 'segredo';
  const agora = Date.now(); const ANO = new Date().getFullYear();
  const hojeM = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);   // hoje em Manaus (UTC−4)
  const C = (id, numero, extra = {}) => ({ id, unidade: 'MANAUS', ano: ANO, numero, numeroTxt: String(numero).padStart(3, '0') + '/' + ANO + '/MANAUS', numeroSugerido: numero,
    numeroOrigem: 'sistema', conflito: 0, levantamentoId: '', data: '2026-10-10', hora: '09:00', servidor: 'Ana Paula Lima', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus',
    municipio: 'Manaus', doc: '52998224725', nome: 'JOSE DA SILVA', endereco: 'SITIO BOA VISTA', lat: -3.1, lon: -60.02, precisao: 10, cultura: 'Banana', quantidade: 2,
    analise: 'fitopatológica', partes: 'folhas, frutos', descricao: 'Em 10 de outubro…', fotos: '[]', testemunha1Nome: '', testemunha1Doc: '', testemunha2Nome: '', testemunha2Doc: '',
    assinaturas: '{}', local: 'Manaus/AM', cancelado: 0, motivoCancel: '', excluido: 0, criadoEm: agora + numero, atualizadoEm: agora + numero, ...extra });
  const emitir = (key, colheita, extra = {}) => post({ action: 'pceEmitir', key, colheita, ...extra });
  const prox = (key, unidade = 'MANAUS', ano = ANO) => post({ action: 'pceProximoNumero', key, unidade, ano });

  console.log('1) próximo número: uma sequência por unidade/ano');
  let r = await prox(A); ok(r.ok && r.proximo === 1 && r.ultimo === 0 && r.ultimoTermo === null, 'sem termos: próximo = 1 ' + JSON.stringify(r));
  r = await prox(A, '  manaus '); ok(r.unidade === 'MANAUS' && r.proximo === 1, 'unidade normalizada (maiúsculas, sem espaços sobrando)');
  r = await prox('token-ruim'); ok(!r.ok && /revogado|inválido/.test(r.erro), 'sem credencial não consulta');
  r = await prox(A, ''); ok(!r.ok && /unidade/i.test(r.erro), 'unidade vazia recusada');
  r = await post({ action: 'pceProximoNumero', key: A, unidade: 'MANAUS' }); ok(r.ano === ANO, 'sem ano: usa o ano atual');

  console.log('2) emissão só grava se o número estiver livre');
  const pessoa = { id: '52998224725', tipo: 'PF', nome: 'JOSE DA SILVA', email: 'jose@exemplo.com', telefone: '92988887777', criadoEm: agora, atualizadoEm: agora + 5 };
  const prop = { id: '52998224725|SITIO BOA VISTA', codigo: '', nome: 'SITIO BOA VISTA', doc: '52998224725', municipio: 'Manaus', situacaoFundiaria: 'Posse', lat: -3.1, lon: -60.02, criadoEm: agora, atualizadoEm: agora };
  r = await emitir(A, C('cA1', 1, { numeroTxt: '' }), { pessoa, propriedade: prop });
  ok(r.emitido === true && r.emitidoEm > 0 && r.numeroTxt === '001/' + ANO + '/MANAUS', 'Ana emitiu o 001 (numeroTxt gerado pelo servidor: ' + r.numeroTxt + ')');
  const em1 = r.emitidoEm;
  r = await emitir(Bk, C('cB1', 1, { servidor: 'Bruno' }));
  ok(r.emitido === false && r.proximo === 2 && r.ultimo === 1 && r.ocupadoPor.usuario === 'Ana Paula Lima' && r.ocupadoPor.numeroTxt.startsWith('001/'), 'Bruno tentou o 001 (ocupado): recusado, próximo = 2, ocupado por Ana');
  ok((await fn('lerLeitura_', 'Colheitas')).r.length === 1, 'o termo recusado NÃO foi gravado');
  r = await emitir(Bk, C('cB1', 2, { servidor: 'Bruno', doc: '11144477735', nome: 'MARIA' })); ok(r.emitido === true, 'Bruno emitiu o 002');
  r = await emitir(A, C('cA1', 1)); ok(r.emitido === true && r.emitidoEm === em1, 'reenvio do mesmo termo: aceito, emitidoEm original');
  r = await prox(A); ok(r.proximo === 3 && r.ultimoTermo && r.ultimoTermo.usuario === 'Bruno Costa Souza' && r.ultimoTermo.numeroTxt.startsWith('002/'), 'próximo = 3; último usado: ' + JSON.stringify(r.ultimoTermo));
  const [x, y] = await Promise.all([emitir(A, C('cA3', 3)), emitir(Bk, C('cB3', 3))]);
  ok([x.emitido, y.emitido].filter(Boolean).length === 1, 'dois servidores emitindo o mesmo nº ao mesmo tempo: só um vence');
  r = await emitir(A, C('cX', 0)); ok(!r.ok && /incompletos/.test(r.erro), 'número 0 recusado');
  r = await emitir(A, C('cP1', 1, { unidade: 'parintins', numeroTxt: '' })); ok(r.emitido === true && r.numeroTxt === '001/' + ANO + '/PARINTINS', 'outra unidade tem sequência própria (001/PARINTINS)');
  r = await prox(A, 'MANAUS', ANO + 1); ok(r.proximo === 1, 'ano novo recomeça em 1');

  console.log('3) número editado e auditoria');
  r = await emitir(A, C('cA6', 6, { numeroOrigem: 'editado', numeroSugerido: 4 })); ok(r.emitido, 'emitiu o 006 (editado; sistema sugeriu 004)');
  let au = (await fn('auditarSequencia_', 'manaus', ANO, 'PCE')).r;
  ok(JSON.stringify(au.lacunas) === '[4,5]', 'auditoria PCE: lacunas = ' + JSON.stringify(au.lacunas));
  ok(au.editados.some(e => e.numero === 6 && e.origem === 'editado' && e.sugerido === 4), 'auditoria lista o nº editado com o sugerido');
  const l6 = (await fn('lerLeitura_', 'Colheitas')).r.find(t => t.id === 'cA6'); ok(l6.numeroOrigem === 'editado' && l6.numeroSugerido === 4 && l6.usuario === 'Ana Paula Lima', 'planilha guarda origem "editado", sugerido 4 e usuário');

  console.log('4) provisório offline: conflito marcado no sync');
  r = await post({ action: 'sync', key: Bk, since: 0, colheitas: [C('cOff', 2, { servidor: 'Bruno', unidade: ' manaus', numeroTxt: '', numeroOrigem: 'provisorio', criadoEm: agora + 500, atualizadoEm: agora + 500, emitidoEm: 0 })] });
  let off = r.colheitas.find(t => t.id === 'cOff');
  ok(off && off.conflito === 1 && off.emitidoEm > 0 && off.unidade === 'MANAUS' && off.numeroTxt === '002/' + ANO + '/MANAUS', 'nº 002 repetido via sync: conflito = 1, emitidoEm e numeroTxt preenchidos, unidade normalizada');
  ok(r.colheitas.find(t => t.id === 'cB1').conflito === 0, 'o termo mais antigo (de Bruno, emitido online) continua válido');
  ok(r.ultimosPce['MANAUS|' + ANO] === 6 && r.ultimosPce['PARINTINS|' + ANO] === 1, 'sync informa ultimosPce: ' + JSON.stringify(r.ultimosPce));
  r = await post({ action: 'sync', key: A, since: 0, colheitas: [C('cOff2', 7, { numeroOrigem: 'provisorio', criadoEm: agora + 600, atualizadoEm: agora + 600 })] });
  ok(r.colheitas.find(t => t.id === 'cOff2').conflito === 0, 'provisório com número livre (007): sem conflito');
  au = (await fn('auditarSequencia_', 'MANAUS', ANO, 'PCE')).r;
  ok(au.duplicados.length === 1 && au.duplicados[0].numero === 2 && au.editados.some(e => e.origem === 'provisorio'), 'auditoria: nº 2 duplicado, provisórios listados');

  console.log('5) cancelado mantém o número');
  const c7 = (await fn('lerLeitura_', 'Colheitas')).r.find(t => t.id === 'cOff2');
  r = await post({ action: 'sync', key: A, since: 0, colheitas: [{ ...c7, cancelado: 1, motivoCancel: 'erro de digitação', atualizadoEm: agora + 9999 }] });
  const c7b = r.colheitas.find(t => t.id === 'cOff2');
  ok(c7b.cancelado === 1 && c7b.motivoCancel === 'erro de digitação' && c7b.emitidoEm === c7.emitidoEm, 'cancelamento gravado, emitidoEm mantido');
  r = await prox(A); ok(r.proximo === 8, 'termo cancelado continua ocupando o 007 → próximo = 8');

  console.log('6) ponto de partida definido pelo administrador');
  r = await fn('definirSequencia_', 'Itacoatiara', ANO, 100, 'PCE'); ok(r.r === 100, 'último usado em ITACOATIARA definido = 100');
  r = await prox(A, 'Itacoatiara'); ok(r.proximo === 101, 'próximo = 101');
  const numTF = (await fn('lerLeitura_', 'Numeracao')).r; ok(numTF.some(n => n.id === 'PCE|ITACOATIARA|' + ANO && n.barreira === 'ITACOATIARA'), 'aba Numeracao: id PCE|ITACOATIARA|ano');
  r = await post({ action: 'sync', key: A, since: 0 }); ok(r.ultimosPce['ITACOATIARA|' + ANO] === 100, 'ultimosPce inclui a base da aba Numeracao');
  r = await fn('definirSequencia_', 'MANAUS', 'abc', 1, 'PCE'); ok(/inválido/.test(r.erro || ''), 'ano inválido recusado');
  r = await fn('definirSequencia_', 'MANAUS', ANO, 5); ok(/Barreira desconhecida/.test(r.erro || ''), 'TF continua exigindo barreira cadastrada');
  r = await post({ action: 'tfProximoNumero', key: A, barreira: 'BVA-CEASA', ano: ANO }); ok(r.proximo === 1, 'numeração do TF não foi afetada pelos termos do PCE');

  console.log('7) levantamentos: cada servidor recebe só os próprios; administrador recebe todos');
  const LEV = (id, extra = {}) => ({ id, data: '2026-10-10', hora: '08:30', servidor: 'Ana Paula Lima', cargo: 'Fiscal', matricula: '1', lotacao: 'Manaus', doc: '52998224725',
    nome: 'JOSE DA SILVA', telefone: '92988887777', email: 'jose@exemplo.com', propriedade: 'SITIO BOA VISTA', codigoPropriedade: '', situacaoFundiaria: 'Posse',
    municipio: 'Manaus', lat: -3.1, lon: -60.02, precisao: 12, culturas: JSON.stringify([{ cultura: 'Banana', area: '2', coleta: 'Sim', tipoMaterial: 'folha', codigoAmostra: 'A1', destinoAmostra: 'LAB' }].concat(Array(40).fill({ cultura: 'Mandioca', area: '1', coleta: 'Não' }))),
    fotos: '[]', assinaturas: '{}', obs: 'o'.repeat(1800), excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [LEV('gA1')], pessoas: [{ ...pessoa, atualizadoEm: agora + 10 }], propriedades: [prop] });
  ok(r.levantamentos.length === 1 && r.levantamentos[0].usuario === 'Ana Paula Lima', 'Ana recebe o próprio levantamento');
  const gA1 = r.levantamentos[0]; ok(gA1.obs.length === 1800 && JSON.parse(gA1.culturas).length === 41, 'textos longos preservados (obs 1800, culturas com 41 itens = ' + gA1.culturas.length + ' caracteres)');
  r = await post({ action: 'sync', key: Bk, since: 0, levantamentos: [LEV('gB1', { servidor: 'Bruno', doc: '11144477735', nome: 'MARIA' })] });
  ok(r.levantamentos.length === 1 && r.levantamentos[0].id === 'gB1', 'Bruno recebe só o dele');
  ok(r.colheitas.every(t => t.usuario === 'Bruno Costa Souza') && r.colheitas.length >= 2, 'Bruno recebe só os próprios termos (' + r.colheitas.length + ')');
  r = await post({ action: 'sync', key: A, since: 0 });
  ok(r.colheitas.every(t => t.usuario === 'Ana Paula Lima'), 'Ana recebe só os próprios termos');
  r = await post({ action: 'sync', key: ADM, since: 0 }); ok(r.levantamentos.length === 2 && r.colheitas.length === 7, 'Administrador recebe todos (' + r.levantamentos.length + ' lev, ' + r.colheitas.length + ' termos)');
  const s1 = r.agora; r = await post({ action: 'sync', key: A, since: s1 }); ok(r.levantamentos.length === 0 && r.colheitas.length === 0, 'sync incremental: nada novo depois de "agora"');
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [{ ...gA1, excluido: 1, atualizadoEm: agora + 50 }] });
  ok(r.levantamentos.find(l => l.id === 'gA1').excluido === 1, 'exclusão (soft delete) do levantamento sincronizada');

  console.log('8) e-mail em Pessoas e migração de colunas');
  const pes = await aba('Pessoas');
  ok(JSON.stringify(pes[0]) === JSON.stringify(CAB_ANTIGO.concat('email')), 'cabeçalho de Pessoas ganhou "email" no FIM: ' + pes[0].slice(-2).join(','));
  const pj = (await fn('lerLeitura_', 'Pessoas')).r.find(p => p.id === '52998224725');
  ok(pj.email === 'jose@exemplo.com' && pj.rg === '123' && pj.endereco === 'RUA X', 'cadastro antigo atualizado: e-mail novo, RG e endereço do TF mantidos');
  // o TF não conhece o e-mail: salvar a pessoa pelo TF não pode apagá-lo
  const tfP = { id: '52998224725', tipo: 'PF', nome: 'JOSE DA SILVA', rg: '123', endereco: 'RUA NOVA 5', municipio: 'MANAUS', uf: 'AM', telefone: '92977776666', criadoEm: agora, atualizadoEm: agora + 100 };
  r = await post({ action: 'sync', key: Bk, since: 0, pessoas: [tfP] });
  const pj2 = (await fn('lerLeitura_', 'Pessoas')).r.find(p => p.id === '52998224725');
  ok(pj2.endereco === 'RUA NOVA 5' && pj2.email === 'jose@exemplo.com', 'pessoa salva pelo TF (sem campo email) NÃO apaga o e-mail');
  r = await post({ action: 'sync', key: A, since: 0, pessoas: [{ ...tfP, email: '', atualizadoEm: agora + 200 }] });
  ok((await fn('lerLeitura_', 'Pessoas')).r.find(p => p.id === '52998224725').email === '', 'e-mail enviado vazio de propósito é apagado');
  ok(pes.length === 2 && pes[1][0] === '52998224725', 'linha antiga continua na mesma posição (sem duplicar)');
  const cab = async n => (await aba(n))[0];
  ok((await cab('Levantamentos')).join() === 'id,data,hora,servidor,cargo,matricula,lotacao,doc,nome,telefone,email,propriedade,codigoPropriedade,situacaoFundiaria,municipio,lat,lon,precisao,culturas,fotos,assinaturas,obs,excluido,criadoEm,atualizadoEm,srv_ts,usuario,registroAntigo,documentos,pragas,tipoLocal,origemVisita,citros,cnpj,empresa,endereco,uf', 'aba Levantamentos criada com as colunas da especificação (pragas, tipoLocal, origemVisita, citros e a identificação cnpj/empresa/endereco/uf no fim)');
  ok((await cab('Colheitas')).length === 45 && (await cab('Colheitas')).slice(-3).join() === 'registroAntigo,documentos,laboratorio' && (await cab('Propriedades')).join() === 'id,codigo,nome,doc,municipio,situacaoFundiaria,lat,lon,criadoEm,atualizadoEm,srv_ts,usuario,cnpj,viaAcesso,comercial,tipoPropriedade,endereco,uf,empresa', 'abas Colheitas (45 colunas: registroAntigo, documentos e laboratorio no fim) e Propriedades criadas (campos do Cadastro de imóvel no fim)');

  console.log('9) consulta do produtor (pceConsultar)');
  let c = await post({ action: 'pceConsultar', key: Bk, doc: '529.982.247-25' });
  ok(c.ok && c.pessoa && c.pessoa.nome === 'JOSE DA SILVA' && c.pessoa.telefone === '92977776666', 'cadastro encontrado pelo CPF com pontuação');
  ok(c.propriedades.length === 1 && c.propriedades[0].nome === 'SITIO BOA VISTA' && c.propriedades[0].situacaoFundiaria === 'Posse', 'propriedade do produtor devolvida');
  ok(c.levantamentos === 0 && c.colheitas >= 4, `contagem: ${c.levantamentos} levantamento(s) (o único foi excluído), ${c.colheitas} termo(s) (sem cancelados)`);
  c = await post({ action: 'pceConsultar', key: Bk, doc: '11.222.333/0001-81' }); ok(c.ok && c.pessoa === null && c.propriedades.length === 0 && c.levantamentos === 0, 'CNPJ sem cadastro: novo');
  c = await post({ action: 'pceConsultar', key: Bk, doc: '123' }); ok(!c.ok && /completo/.test(c.erro), 'documento incompleto recusado');
  const cons = await aba('Consultas'); const ult = cons.slice(-2);
  ok(ult[0][2] === '529***25' && ult[0][3] === '' && ult[0][4] === 'PCE: encontrado' && ult[1][4] === 'PCE: novo' && ult[0][1] === 'Bruno Costa Souza', 'consultas auditadas com CPF mascarado: ' + JSON.stringify(ult.map(l => l.slice(1))));

  console.log('10) envio de fotos/assinaturas ao Drive (arquivoEnviar)');
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]).toString('base64');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const A1 = { id: uuid(), dono: 'levantamentos', donoId: 'gA1', tipo: 'foto', papel: '', mime: 'image/jpeg', nome: 'x.jpg' };
  const env = (key, arquivo, base64) => post({ action: 'arquivoEnviar', key, arquivo, base64 });
  r = await env(A, A1, jpg);
  ok(r.ok && r.existente === false && /^https:\/\/drive\.google\.com\//.test(r.url) && r.driveId, 'foto enviada: ' + r.url);
  let dr = await get('/__drive');
  const f1 = dr.arquivos.find(a => a.id === r.driveId);
  ok(f1 && f1.caminho === `GDV - Arquivos/PCE/${ANO}/levantamentos` && f1.nome === `gA1_foto_1_${A1.id}.jpg` && f1.mime === 'image/jpeg' && f1.tamanho === 2006, 'arquivo no Drive: ' + (f1 && f1.caminho + '/' + f1.nome));
  ok(f1 && f1.compartilhado === false, 'arquivo NÃO compartilhado publicamente');
  ok(dr.pastaRaiz && dr.pastas.filter(p => p === 'GDV - Arquivos').length === 1, 'id da pasta raiz guardado em PASTA_ARQUIVOS');
  const r2 = await env(A, A1, jpg); dr = await get('/__drive');
  ok(r2.ok && r2.existente === true && r2.driveId === r.driveId && r2.url === r.url && dr.arquivos.length === 1, 'reenvio do mesmo id é idempotente (mesmo arquivo, nada duplicado)');
  const arqs = (await fn('lerLeitura_', 'Arquivos')).r;
  ok(arqs.length === 1 && arqs[0].usuario === 'Ana Paula Lima' && arqs[0].tamanho === 2006 && arqs[0].donoId === 'gA1' && arqs[0].url === r.url, 'aba Arquivos: 1 linha com usuário, tamanho e link');
  const A2 = { id: uuid(), dono: 'levantamentos', donoId: 'gA1', tipo: 'foto', papel: '', mime: 'image/jpeg' };
  r = await env(A, A2, jpg); dr = await get('/__drive'); ok(r.ok && dr.arquivos.some(a => a.nome === `gA1_foto_2_${A2.id}.jpg`), '2ª foto do mesmo registro: numerada _2_');
  const AS = { id: uuid(), dono: 'colheitas', donoId: 'cA1', tipo: 'assinatura', papel: 'testemunha1', mime: 'image/png' };
  r = await env(Bk, AS, png); dr = await get('/__drive');
  ok(r.ok && dr.arquivos.some(a => a.nome === `cA1_assinatura_testemunha1_${AS.id}.png` && a.caminho === `GDV - Arquivos/PCE/${ANO}/colheitas`), 'assinatura PNG na pasta colheitas, com o papel no nome');
  ok(dr.pastas.filter(p => p === 'GDV - Arquivos/PCE').length === 1 && dr.pastas.filter(p => p === `GDV - Arquivos/PCE/${ANO}`).length === 1, 'pastas reaproveitadas (sem duplicar PCE/ano)');
  const erro = async (arquivo, base64, re, msg) => { const x = await env(A, arquivo, base64); ok(!x.ok && re.test(x.erro), msg + ' → ' + x.erro); };
  const qtdAntes = (await get('/__drive')).arquivos.length;
  await erro({ ...A1, id: uuid(), mime: 'image/gif' }, jpg, /JPEG, PNG ou PDF/, 'mime não aceito (gif)');
  await erro({ ...A1, id: uuid(), mime: 'image/png' }, jpg, /não corresponde/, 'mime PNG com conteúdo JPEG');
  await erro({ ...A1, id: uuid() }, Buffer.from('<script>alert(1)</script>').toString('base64'), /não corresponde/, 'conteúdo que não é imagem');
  await erro({ ...A1, id: uuid() }, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)]).toString('base64'), /4 MB/, 'maior que 4 MB');
  await erro({ ...A1, id: uuid() }, '', /vazio/, 'arquivo vazio');
  await erro({ ...A1, id: uuid() }, '@@@@', /base64|corrompido/, 'base64 inválido');
  await erro({ ...A1, id: 'nao-e-uuid' }, jpg, /Identificador/, 'id que não é uuid');
  await erro({ ...A1, id: uuid(), dono: 'turnos' }, jpg, /origem/, 'dono inválido');
  await erro({ ...A1, id: uuid(), tipo: 'video' }, jpg, /Tipo/, 'tipo inválido');
  await erro({ ...A1, id: uuid(), papel: 'chefe' }, jpg, /Papel/, 'papel inválido');
  const z = await post({ action: 'arquivoEnviar', key: 'token-ruim', arquivo: { ...A1, id: uuid() }, base64: jpg }); ok(!z.ok, 'sem credencial não envia');
  ok((await get('/__drive')).arquivos.length === qtdAntes, 'nenhum envio inválido criou arquivo no Drive');
  r = await env(A, { ...A1, id: uuid() }, 'data:image/jpeg;base64,' + jpg); ok(r.ok, 'prefixo "data:" é tolerado');
  await fetch(B + '/__apagarPasta'); const raiz0 = (await get('/__drive')).pastaRaiz;
  r = await env(A, { ...A1, id: uuid() }, jpg); dr = await get('/__drive');
  ok(r.ok && dr.pastaRaiz !== raiz0 && dr.arquivos.find(a => a.id === r.driveId).caminho === `GDV - Arquivos/PCE/${ANO}/levantamentos`, 'pasta raiz apagada: recriada e id atualizado');


  console.log('11) achados da revisão');
  // arquivo no Drive sem linha em Arquivos (trava ocupada na gravação): vai para a lixeira, sem cópia órfã
  const AO = { id: uuid(), dono: 'levantamentos', donoId: 'gA1', tipo: 'foto', papel: '', mime: 'image/jpeg' };
  const ativosAntes = (await get('/__drive')).arquivos.filter(a => !a.lixeira).length;
  await fetch(B + '/__lockfalha?n=2'); r = await env(A, AO, jpg); dr = await get('/__drive');
  ok(!r.ok && /Lock/.test(r.erro) && dr.arquivos.filter(a => !a.lixeira).length === ativosAntes && dr.arquivos.some(a => a.lixeira && a.nome.includes(AO.id)), 'falha ao gravar a linha: arquivo criado vai para a lixeira (sem órfão)');
  r = await env(A, AO, jpg); dr = await get('/__drive');
  ok(r.ok && r.existente === false && dr.arquivos.filter(a => !a.lixeira && a.nome.includes(AO.id)).length === 1, 'reenvio depois da falha: um único arquivo ativo');
  // emitidoEm: reenvio pelo sync (resposta da emissão perdida) e cancelamento em trânsito não trocam a data de emissão
  r = await emitir(A, C('cE1', 20)); const emE = r.emitidoEm; ok(r.emitido && emE > 0, 'termo 020 emitido online');
  const semEm = C('cE1', 20, { atualizadoEm: agora + 20 + 1000 }); delete semEm.emitidoEm;
  r = await post({ action: 'sync', key: A, since: 0, colheitas: [semEm] });
  ok(r.colheitas.find(t => t.id === 'cE1').emitidoEm === emE, 'reenvio pelo sync sem emitidoEm mantém a data de emissão original');
  r = await post({ action: 'sync', key: A, since: 0, colheitas: [{ ...semEm, cancelado: 1, motivoCancel: 'teste', atualizadoEm: agora + 20 + 2000 }] });
  const cE1 = r.colheitas.find(t => t.id === 'cE1'); ok(cE1.cancelado === 1 && cE1.emitidoEm === emE, 'cancelamento enviado sem emitidoEm mantém a data de emissão');
  const novoSemEm = C('cE2', 21); delete novoSemEm.emitidoEm;
  r = await post({ action: 'sync', key: A, since: 0, colheitas: [novoSemEm] }); ok(r.colheitas.find(t => t.id === 'cE2').emitidoEm >= r.agora - 1, 'termo novo pelo sync ganha emitidoEm');
  // JSON de culturas/fotos grande não é cortado (cortar apagaria fotos e culturas no aparelho)
  const muitasCult = Array(40).fill(0).map((_, i) => ({ cultura: 'Mandioca ' + i, area: 'x'.repeat(60), espLinha: 'y'.repeat(60), espPlanta: 'z'.repeat(60), praga: 'Mosca-negra-dos-citros', coleta: 'Sim',
    tipoMaterial: 'm'.repeat(60), codigoAmostra: 'c'.repeat(60), destinoAmostra: 'd'.repeat(60) }));
  const muitasFotos = Array(120).fill(0).map(() => uuid());
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [LEV('gBig', { culturas: JSON.stringify(muitasCult), fotos: JSON.stringify(muitasFotos) })] });
  const gBig = r.levantamentos.find(l => l.id === 'gBig'); let pc = null, pf = null; try { pc = JSON.parse(gBig.culturas); pf = JSON.parse(gBig.fotos); } catch (e) { /* JSON cortado */ }
  ok(pc && pc.length === 40 && pf && pf.length === 120, `culturas (${gBig.culturas.length} caract.) e fotos (${gBig.fotos.length} caract.) voltam como JSON válido e completo`);

  console.log('12) levantamento por praga/doença (coluna pragas)');
  ok((await cab('Arquivos')).slice(-2).join() === 'criadoEm,rotulo', 'aba Arquivos ganhou "rotulo" no fim');
  const F1 = uuid(), F2 = uuid(), F3 = uuid();
  const PR = [{ praga: 'Moko da bananeira', culturas: [{ cultura: 'Banana', area: '2,5', espLinha: '3', espPlanta: '2', resultado: 'detectada', coleta: 'Sim', tipoMaterial: 'Frutos', codigoAmostra: 'AM-1', destinoAmostra: 'LAB', fotos: [F1, F2] },
    { cultura: 'Cacau', area: '1', espLinha: '', espPlanta: '', resultado: 'nao_detectada', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [] }] },
    { praga: 'Fusarium R4T', culturas: [{ cultura: 'Banana', area: '2,5', espLinha: '3', espPlanta: '2', resultado: 'suspeita', coleta: 'Não', tipoMaterial: '', codigoAmostra: '', destinoAmostra: '', fotos: [F3] }] },
    { praga: 'Sigatoka-negra', culturas: [{ cultura: 'Banana', area: '2,5', resultado: 'nao_detectada', coleta: 'Não', fotos: [] }] }];
  const derivadas = PR.flatMap(g => g.culturas.map(c => ({ cultura: c.cultura, area: c.area, praga: c.resultado === 'nao_detectada' ? '' : g.praga, pragaAvaliada: g.praga, resultado: c.resultado, coleta: c.coleta })));
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [LEV('gP1', { data: hojeM, pragas: JSON.stringify(PR), culturas: JSON.stringify(derivadas), fotos: JSON.stringify([F1, F2, F3]) }),
    LEV('gP0', { data: hojeM, culturas: JSON.stringify([{ cultura: 'Açaí', area: '1', praga: '', coleta: 'Não' }, { cultura: 'Cupuaçu', area: '1', praga: 'Vassoura-de-bruxa', coleta: 'Não' }]) })] });
  const gP1 = r.levantamentos.find(l => l.id === 'gP1');
  ok(gP1 && JSON.stringify(JSON.parse(gP1.pragas)) === JSON.stringify(PR) && JSON.parse(gP1.fotos).length === 3, 'pragas (JSON) volta inteiro ao aparelho, com as fotos de cada cultura');
  ok((await fn('lerLeitura_', 'Levantamentos')).r.find(l => l.id === 'gP1').pragas.length > 300, 'planilha guarda a coluna pragas');
  // JSON grande de pragas não é cortado: 20 pragas × 2 culturas com campos no limite e 60 fotos
  const fotosG = Array(60).fill(0).map(() => uuid());
  const prBig = Array(20).fill(0).map((_, i) => ({ praga: 'Praga longa número ' + i + ' '.padEnd(60, 'p'), culturas: [0, 1].map(k => ({ cultura: 'Cultura ' + k, area: 'a'.repeat(60), espLinha: 'l'.repeat(60), espPlanta: 'p'.repeat(60),
    resultado: 'suspeita', coleta: 'Sim', tipoMaterial: 'm'.repeat(60), codigoAmostra: 'c'.repeat(60), destinoAmostra: 'd'.repeat(60), fotos: fotosG.slice(i * 3 + k, i * 3 + k + 2) })) }));
  r = await post({ action: 'sync', key: A, since: 0, levantamentos: [LEV('gPBig', { pragas: JSON.stringify(prBig) })] });
  let pb = null; try { pb = JSON.parse(r.levantamentos.find(l => l.id === 'gPBig').pragas); } catch (e) { /* cortado */ }
  ok(pb && pb.length === 20 && pb[19].culturas[1].fotos.length === 2, `pragas grande (${JSON.stringify(prBig).length} caract.) volta como JSON válido e completo`);
  // painel: culturas derivadas com resultado, pragas = detectada + suspeita, pragasLev sem dados pessoais; registro anterior convertido
  const pd = await post({ action: 'painelDados', key: ADM });
  const p1 = (pd.levantamentos || []).find(l => l.id === 'gP1'), p0 = (pd.levantamentos || []).find(l => l.id === 'gP0');
  ok(p1 && JSON.stringify(p1.pragas) === '["Moko da bananeira","Fusarium R4T"]', 'painel: pragas = detectada + suspeita (sem a "não detectada")', p1 && p1.pragas);
  ok(p1 && p1.culturas.length === 4 && p1.culturas.filter(c => c.resultado === 'suspeita').length === 1 && p1.culturas.find(c => c.cultura === 'Cacau').praga === '' && p1.culturas.find(c => c.cultura === 'Cacau').avaliada === 'Moko da bananeira',
    'painel: uma cultura por cultura × praga, com resultado e praga avaliada');
  ok(p1 && JSON.stringify(p1.pragasLev) === JSON.stringify([{ praga: 'Moko da bananeira', nFotos: 2, culturas: [{ cultura: 'Banana', area: 2.5, resultado: 'detectada', coleta: 'Sim' }, { cultura: 'Cacau', area: 1, resultado: 'nao_detectada', coleta: 'Não' }] },
    { praga: 'Fusarium R4T', nFotos: 1, culturas: [{ cultura: 'Banana', area: 2.5, resultado: 'suspeita', coleta: 'Não' }] }, { praga: 'Sigatoka-negra', nFotos: 0, culturas: [{ cultura: 'Banana', area: 2.5, resultado: 'nao_detectada', coleta: 'Não' }] }]),
    'painel: pragasLev (praga, culturas com resultado, nº de fotos; sem código de amostra/destino)', p1 && p1.pragasLev);
  ok(p0 && JSON.stringify(p0.pragasLev.map(g => [g.praga, g.culturas.map(c => c.resultado).join()])) === '[["","nao_detectada"],["Vassoura-de-bruxa","detectada"]]' && JSON.stringify(p0.pragas) === '["Vassoura-de-bruxa"]',
    'painel: registro anterior (sem pragas) convertido: praga preenchida = detectada, vazia = "sem praga informada"', p0 && p0.pragasLev);
  ok(p1 && p1.nFotos === 3 && !('fotos' in p1) && !JSON.stringify(p1.pragasLev).includes('AM-1'), 'painel: fotos só como contagem');
  // relatório: detectada e suspeita contam; não detectada = negativo
  const ag = (await fn('agregarRelatorio_', { turnos: [], tfs: [], colheitas: [], levantamentos: [p1, p0].map(l => ({ id: l.id, data: l.data, municipio: l.municipio, culturas: l.culturas, pragas: l.pragas })) }, pd.periodo.de, pd.periodo.ate, Date.now())).r;
  ok(ag && ag.pce.suspeitas === 1 && ag.pce.pragas.find(x => x.praga === 'Fusarium R4T').suspeitas === 1 && !ag.pce.pragas.some(x => x.praga === 'Sigatoka-negra'), 'relatório: suspeita conta (e à parte); "não detectada" não', ag && ag.pce);
  // foto com rótulo "praga – cultura": vai para a aba Arquivos e para o nome no Drive
  const FR = { id: uuid(), dono: 'levantamentos', donoId: 'gP1', tipo: 'foto', papel: '', mime: 'image/jpeg', rotulo: 'Moko da bananeira – Banana' };
  r = await env(A, FR, jpg); dr = await get('/__drive');
  ok(r.ok && dr.arquivos.some(a => a.nome === `gP1_foto_1_Moko-da-bananeira-Banana_${FR.id}.jpg`), 'foto da cultura: praga e cultura no nome do arquivo no Drive', dr.arquivos.map(a => a.nome).filter(n => n.startsWith('gP1')));
  ok((await fn('lerLeitura_', 'Arquivos')).r.find(a => a.id === FR.id).rotulo === 'Moko da bananeira – Banana', 'aba Arquivos: rótulo da foto (praga – cultura)');
  r = await env(A, { ...FR, id: uuid(), tipo: 'assinatura', papel: 'servidor', mime: 'image/png', rotulo: 'x' }, png);
  ok(r.ok && !(await fn('lerLeitura_', 'Arquivos')).r.find(a => a.id === r.id).rotulo, 'assinatura não leva rótulo');

  console.log(falhas ? 'FALHOU=' + falhas : 'OK'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU', e.stack || e.message); process.exit(1); });
