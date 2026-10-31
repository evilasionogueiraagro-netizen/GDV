#!/usr/bin/env node
// Ver as telas sem tocar na produção: sobe o fakegas (Code.gs real, planilha em memória), cria contas e alguns dados
// fictícios e abre o Chromium já apontado para o servidor local. Fechou o terminal (Ctrl+C), tudo some.
//
//   cd tests && node local.js            abre o app de campo
//   node local.js painel                 abre o painel (também: administrativo, dashboard, inicio)
//   node local.js --sem-navegador        só o servidor; abra http://localhost:8081 num navegador seu
//
// Atenção: num navegador seu, o app em localhost usa o endereço guardado em gdv.url e, sem ele, o OFICIAL (produção).
// Por isso este script abre o próprio Chromium com gdv.url = servidor local em toda página. Sem navegador, rode antes no
// console da página: localStorage.setItem('gdv.url', 'http://localhost:8082/')
// Não é teste: o run.js ignora este arquivo.
'use strict';
const path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const amb = require('./lib/amb');

const args = process.argv.slice(2), semNavegador = args.includes('--sem-navegador');
const APPS = { campo: '', painel: 'painel/', administrativo: 'administrativo/', dashboard: 'dashboard/', inicio: 'inicio/' };
const app = args.find(a => APPS[a] !== undefined) || 'campo';
const post = b => fetch(amb.API_URL, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const dorme = ms => new Promise(r => setTimeout(r, ms));
const manaus = (d = 0) => new Date(Date.now() - 4 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

async function semear() {
  const g = await amb.usuario('Gerente Local Teste', { aplicativo: 'painel', permissoes: ['gerencia'], matricula: 'gerente.local' });
  const f = await amb.usuario('Fiscal Local Teste', { matricula: 'fiscal.local' });
  const agora = Date.now();
  const T = (id, data, extra = {}) => ({ id, numeroTF: '', data, inicio: '06:00', fim: '14:00', fiscal: 'Fiscal Local Teste', local: 'Barreira Porto CEASA',
    unidade: 'MANAUS', posto: 'Fixa', encerrado: 1, criadoEm: agora, atualizadoEm: agora, latIni: '-3.1190', lngIni: '-60.0217', precIni: '12', ...extra });
  const V = (id, t, hora, placa, tipo, p) => ({ id, turnoId: t, hora, placa, tipo, pessoas: p, obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora });
  const TF = (data, numero, extra = {}) => ({ id: crypto.randomUUID(), barreira: 'BVA-CEASA', ano: Number(data.slice(0, 4)), numero, numeroTxt: '', turnoId: 'local-t1',
    data, hora: '08:15', fiscal: 'Fiscal Local Teste', local: 'Barreira Porto CEASA', placa: 'AAA1A11', origem: 'Manacapuru', destino: 'Manaus', doc: '12345678909',
    nome: 'Fiscalizado Ficticio', endereco: 'Rua Ficticia, 100', municipio: 'Manaus', uf: 'AM', telefone: '92 90000-0000', relacao: 'Motorista', inspecao: 1,
    procedimento: 'liberacao', produtos: JSON.stringify(['BANANA - 200 Kg']), constatacao: 'Carga sem irregularidade.', cancelado: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
  const r = await post({ action: 'sync', key: f.token, since: 0,
    turnos: [T('local-t1', manaus(-2)), T('local-t2', manaus(-1)), T('local-t3', manaus(0), { encerrado: 0, fim: '' })],
    veiculos: [V('local-v1', 'local-t1', '07:10', 'AAA1A11', 'PA', 2), V('local-v2', 'local-t1', '09:30', 'BBB2B22', 'CB', 1),
               V('local-v3', 'local-t2', '08:00', 'CCC3C33', 'UT', 3), V('local-v4', 'local-t3', '06:40', 'DDD4D44', 'CC', 1)],
    tfs: [TF(manaus(-2), 1), TF(manaus(-1), 2, { procedimento: 'apreensao' })] });
  if (!r.ok) throw new Error('dados fictícios: ' + r.erro);
  return { g, f };
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'fakegas.js')], { cwd: __dirname, stdio: ['ignore', 'pipe', 'inherit'] });
  const fim = () => { try { srv.kill(); } catch (e) { /* já saiu */ } process.exit(0); };
  process.on('SIGINT', fim); process.on('SIGTERM', fim);
  await new Promise((ok, erro) => { srv.stdout.on('data', d => { if (String(d).includes('ready')) ok(); }); srv.on('exit', c => erro(new Error('fakegas saiu (código ' + c + '); portas 8081/8082 ocupadas?'))); });
  await dorme(300);
  const { g, f } = await semear();
  const url = amb.ORIGEM + '/' + APPS[app];
  console.log('\nServidor local pronto (nada vai para a produção).');
  console.log('  Gerente (painel, portal, campo): matrícula ' + g.matricula + ', senha ' + g.senha);
  console.log('  Fiscal (campo):                  matrícula ' + f.matricula + ', senha ' + f.senha);
  console.log('  Endereço: ' + url + '   (Ctrl+C encerra e apaga tudo)\n');
  if (semNavegador) return;
  const b = await amb.lancar({ headless: !!process.env.GDV_LOCAL_HEADLESS });
  const ctx = await b.newContext({ viewport: null });
  await ctx.addInitScript(u => { try { localStorage.setItem('gdv.url', u); } catch (e) { /* sem armazenamento */ } }, amb.API_URL);
  const p = await ctx.newPage();
  await p.goto(url);
  if (process.env.GDV_LOCAL_HEADLESS) { console.log('título: ' + await p.title()); await b.close(); return fim(); }
  b.on('disconnected', fim);
})().catch(e => { console.error(e.message); process.exit(1); });
