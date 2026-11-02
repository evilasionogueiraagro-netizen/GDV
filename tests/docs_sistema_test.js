const amb = require('./lib/amb');
// Documentos do sistema no Drive (documentos-sistema.gs): o GitHub envia o Word do Termo de Referência (action docSistemaSalvar)
// com a chave DOC_SISTEMA_CHAVE; o arquivo vai para "GDV - Documentos do sistema" e o anterior para "Versões anteriores".
const { API } = amb;
const post = b => fetch(API, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 400))); if (!c) falhas++; };
const NOME = 'Termo_de_Referencia_e-GDV.docx';
const docx = txt => Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from(txt)]).toString('base64');   // basta começar como um zip

(async () => {
  let r = await post({ action: 'docSistemaSalvar', chave: 'x', nome: NOME, versao: '1.0', base64: docx('v1') });
  ok(!r.ok && /não configurado/.test(r.erro), 'sem a chave configurada: recusado', r.erro);
  const chave = (await fn('docSistemaChaveNova_')).r;
  ok(/^[0-9a-f]{64}$/.test(chave), 'chave nova: 64 caracteres', chave);
  r = await post({ action: 'docSistemaSalvar', chave: chave.slice(0, -1) + 'z', nome: NOME, versao: '1.0', base64: docx('v1') });
  ok(!r.ok && r.erro === 'Chave inválida.', 'chave errada: recusado', r.erro);
  r = await post({ action: 'docSistemaSalvar', chave, nome: 'outro.docx', versao: '1.0', base64: docx('v1') });
  ok(!r.ok && /não aceito/.test(r.erro), 'nome fora da lista: recusado', r.erro);
  r = await post({ action: 'docSistemaSalvar', chave, nome: NOME, versao: '1.0', base64: Buffer.from('<html>').toString('base64') });
  ok(!r.ok && /não é um \.docx/.test(r.erro), 'arquivo que não é .docx: recusado', r.erro);
  r = await post({ action: 'docSistemaSalvar', chave, nome: NOME, versao: '1.0', base64: Buffer.alloc(6 * 1024 * 1024, 80).toString('base64') });
  ok(!r.ok && /grande demais/.test(r.erro), 'acima de 5 MB: recusado', r.erro);

  const r1 = await post({ action: 'docSistemaSalvar', chave, nome: NOME, versao: '1.0, de 01/11/2026', base64: docx('v1') });
  let dr = await get('/__drive');
  const atual = () => dr.arquivos.filter(a => a.caminho === 'GDV - Documentos do sistema' && a.nome === NOME);
  const antigos = () => dr.arquivos.filter(a => a.caminho === 'GDV - Documentos do sistema/Versões anteriores');
  ok(r1.ok && atual().length === 1 && atual()[0].mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && !antigos().length,
    'primeiro envio: o Word na pasta "GDV - Documentos do sistema"', [r1, dr.arquivos]);
  const r2 = await post({ action: 'docSistemaSalvar', chave, nome: NOME, versao: '1.1', base64: docx('v2') });
  dr = await get('/__drive');
  ok(r2.ok && r2.pasta === r1.pasta && atual().length === 1 && atual()[0].id === r2.id && antigos().length === 1 && /^\d{4}-\d{2}-\d{2} \d{2}-\d{2} - Termo_de_Referencia_e-GDV\.docx$/.test(antigos()[0].nome),
    'novo envio: a pasta é a mesma, o atual é o novo e o anterior vai para "Versões anteriores" com a data', dr.arquivos.map(a => [a.caminho, a.nome]));
  const tudo = await get('/__tudo'), H = tudo.HistoricoDeAlteracoes, c = H[0];
  const regs = H.slice(1).map(l => Object.fromEntries(c.map((k, i) => [k, l[i]]))).filter(h => h.acao === 'atualizar documento do sistema');
  ok(regs.length === 2 && regs.every(h => h.usuarioId === 'GitHub (publicação automática)') && /"versao":"1.1"/.test(regs[1].depois), 'cada envio no histórico (quem e qual versão)', regs);
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
