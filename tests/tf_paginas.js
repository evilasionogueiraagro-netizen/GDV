const amb = require('./lib/amb');
// Gera o TF com vários níveis de texto e conta as páginas do PDF (esperado: 2 = 1 via por folha A4,
// cada uma com a testemunha e o rodapé). Precisa de python3 com pypdf (pip install pypdf).
const fs = require('fs');
const ok = (c, m, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? ' -> ' + extra : '')); if (!c) process.exitCode = 1; };
const { API, APP } = amb;
const apreensao = 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.';
const legal = 'Lei Federal 9.712 de 20/11/1998; Dec. Federal nº 24.114 de 12/04/1934; Artigo 259 do Código Penal Brasileiro;\nLei Estadual nº 3.097 de 27/11/2006; Dec. Estadual nº 36.108 de 06/08/2015; (Seção VIII, Art. 35, Grupo II, Alínea\n"A"); IN nº 38 de 01/10/2018; PORTARIA SDA/MAPA Nº 1.503, DE 19 DE DEZEMBRO DE 2025.';
const CASOS = {
  tipico:  { constatacao: apreensao, enquadramento: legal, produtos: ['MANGA - 120 Kg'], endereco: 'RUA DAS FLORES, 10', nome: 'JOSÉ DA SILVA' },
  pesado:  { constatacao: apreensao + ' ' + apreensao, enquadramento: legal + '\n' + legal, produtos: ['MANGA - 120 Kg', 'CARAMBOLA - 40 Caixas', 'TOMATE - 25 Sacos', 'CAJU - 10 Kg', 'LARANJA - 300 Kg', 'COCO - 80 Unidades'], endereco: 'RUA DAS FLORES, 1500, CONJUNTO SOL NASCENTE, BAIRRO CENTRO, PRÓXIMO AO MERCADO MUNICIPAL', nome: 'JOSÉ DA SILVA SANTOS DE OLIVEIRA FILHO' },
  extremo: { constatacao: (apreensao + ' ').repeat(5), enquadramento: (legal + '\n').repeat(3), produtos: Array.from({ length: 10 }, (_, i) => `PRODUTO ${i + 1} - ${i + 10} Kg`), endereco: 'RUA DAS FLORES, 1500, CONJUNTO SOL NASCENTE, BAIRRO CENTRO, PRÓXIMO AO MERCADO MUNICIPAL DE ITACOATIARA NO AMAZONAS', nome: 'EMPRESA DE TRANSPORTES E COMÉRCIO DE FRUTAS DA AMAZÔNIA LTDA ME' }
};
(async () => {
  const b = await amb.lancar();
  const g = await (await fetch(API + '/__gerar?nome=' + encodeURIComponent('Ana Paula Lima'))).json();
  const a = await (await fetch(API, { method: 'POST', body: JSON.stringify({ action: 'ativar', codigo: g.codigo }) })).json();
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });
  await c.addInitScript(([t, n]) => { try { localStorage.setItem('gdv.url', window.__GDV_API); localStorage.setItem('gdv.key', t); localStorage.setItem('gdv.nome', n); localStorage.setItem('gdv.semInstalar', '1'); } catch (e) {} }, [a.token, 'Ana Paula Lima']);
  await c.addInitScript(() => { if (window !== window.top) window.print = () => { window.top.__html = document.documentElement.outerHTML; }; });
  const p = await c.newPage(); await p.goto(APP); await p.waitForSelector('#view *', { state: 'attached' }); await p.waitForTimeout(800);
  for (const [nome, d] of Object.entries(CASOS)) {
    const id = await p.evaluate(async d => (await Store.salvar('tfs', { barreira: 'BVA-CEASA', ano: 2026, numero: Math.floor(Math.random() * 1e6), numeroTxt: '0012/2026 - BVA - CEASA', data: '2026-10-10', hora: '09:35', fiscal: 'Ana', local: 'BR-319 PORTO DA CEASA', placa: 'ABC1D23', origem: 'ITACOATIARA - AM', destino: 'MANAUS - AM',
      doc: '52998224725', nome: d.nome, rg: '1234567-8 SSP/AM', endereco: d.endereco, municipio: 'ITACOATIARA', uf: 'AM', telefone: '(92) 99999-0000', relacao: 'Transportador', inspecao: 1, coleta: 1, amostras: 3, procedimento: 'apreensao', fiel: 1, auto: 1, advertencia: 0,
      documentos: JSON.stringify({ nf: '12345', ptv: '', gta: '', sif: '', sie: '', sim: '', lacre: 'L-998', outros: 'DECLARAÇÃO' }), produtos: JSON.stringify(d.produtos), constatacao: d.constatacao, enquadramento: d.enquadramento, cancelado: 0, conflito: 0 })).id, d);
    await p.evaluate(() => { window.__html = null; }); await p.evaluate(id => Docs.tf(id), id); await p.waitForFunction(() => window.__html, null, { timeout: 10000 });
    const html = (await p.evaluate(() => window.__html)).replace('<head>', '<head><base href="' + amb.APP + 'documentos/">');
    const est = await p.evaluate(() => { const m = /data-ajuste='([^']*)'|data-ajuste="([^"]*)"/.exec(window.__html); return m ? (m[1] || m[2]).replace(/&quot;/g, '"') : '(sem ajuste: coube no modelo original)'; });
    console.log('   ajuste aplicado:', JSON.stringify(est));
    const q = await c.newPage(); await q.setContent(html, { waitUntil: 'load' }); await q.waitForTimeout(400);
    await q.pdf({ path: amb.saida(`tfp_${nome}.pdf`), preferCSSPageSize: true, printBackground: true }); await q.close();
    const py = require('child_process').execFileSync('python3', ['-c', `
import sys, json, pypdf
r = pypdf.PdfReader(sys.argv[1])
print(json.dumps([['Testemunha' in pg.extract_text(), 'Av. Carlos Drummond' in pg.extract_text()] for pg in r.pages]))`, amb.saida(`tfp_${nome}.pdf`)]).toString().trim();
    const pags = JSON.parse(py);
    ok(pags.length === 2 && pags.every(([t, r]) => t && r), `${nome}: 2 páginas, cada uma com testemunha e rodapé`, py);
  }
  await b.close();
})();
