// Gera o Termo de Referência em Word (.docx) a partir de produto/termo-de-referencia.md.
// Uso: node produto/gerar-tr.js [saida.docx]   (padrão: Termo_de_Referencia_e-GDV.docx na pasta atual)
// Precisa do pacote npm "docx" (npm i docx, fora do repositório). Markdown aceito: # título, ## e ### seções, parágrafos,
// listas com "- " (e "  - " aninhada), tabelas com "|" e **negrito**.
const fs = require('fs'), path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, ImageRun, Header, Footer, PageNumber, LevelFormat } = require('docx');

const RAIZ = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(__dirname, 'termo-de-referencia.md'), 'utf8').replace(/\r/g, '');
const saida = process.argv[2] || 'Termo_de_Referencia_e-GDV.docx';
const FONTE = 'Calibri', LARG = 9638;                       // A4 com margens de 2 cm: 21 − 4 = 17 cm ≈ 9638 DXA

/** "texto com **negrito**" → TextRuns. */
const runs = (t, extra = {}) => t.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  .map(p => new TextRun({ text: p.replace(/^\*\*|\*\*$/g, ''), bold: /^\*\*/.test(p) || extra.bold, font: FONTE, size: extra.size || 22, color: extra.color }));
const versao = (md.match(/\| Versão deste Termo \| ([^|]+) \|/) || [])[1] || '';

function tabela(linhas) {
  const cel = l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const cab = cel(linhas[0]), corpo = linhas.slice(2).map(cel), n = cab.length;
  const larg = n === 2 ? [2600, LARG - 2600] : n === 4 ? [900, 1300, 1700, LARG - 3900] : Array(n).fill(Math.floor(LARG / n));
  const borda = { style: BorderStyle.SINGLE, size: 4, color: '9AA5B8' };
  const c = (t, i, topo) => new TableCell({ width: { size: larg[i], type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: borda, bottom: borda, left: borda, right: borda },
    shading: topo ? { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE5F2' } : undefined,
    children: [new Paragraph({ children: runs(t, { bold: topo, size: 20 }) })] });
  return new Table({ width: { size: LARG, type: WidthType.DXA }, columnWidths: larg,
    rows: [new TableRow({ tableHeader: true, children: cab.map((t, i) => c(t, i, true)) })].concat(corpo.map(l => new TableRow({ children: l.map((t, i) => c(t, i, false)) }))) });
}

const filhos = [], L = md.split('\n');
for (let i = 0; i < L.length; i++) {
  const l = L[i];
  if (!l.trim()) continue;
  if (/^\|/.test(l)) { const t = []; while (i < L.length && /^\|/.test(L[i])) t.push(L[i++]); i--; filhos.push(tabela(t), new Paragraph({ text: '' })); continue; }
  let m;
  if ((m = /^# (.*)/.exec(l))) { filhos.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: runs(m[1], { bold: true, size: 32, color: '0B3A82' }) })); continue; }
  if ((m = /^## (.*)/.exec(l))) { filhos.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: runs(m[1], { bold: true, size: 26, color: '0B3A82' }) })); continue; }
  if ((m = /^### (.*)/.exec(l))) { filhos.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: runs(m[1], { bold: true, size: 23, color: '1B325D' }) })); continue; }
  if ((m = /^( *)- (.*)/.exec(l))) { filhos.push(new Paragraph({ numbering: { reference: 'marcas', level: m[1].length >= 2 ? 1 : 0 }, spacing: { after: 60 }, children: runs(m[2]) })); continue; }
  filhos.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, children: runs(l) }));
}

const brasao = fs.readFileSync(path.join(RAIZ, 'web/img/brasao.png'));
const doc = new Document({
  creator: 'GDV – ADAF/AM', title: 'Termo de Referência – Sistema e-GDV',
  styles: { default: { document: { run: { font: FONTE, size: 22 } } } },
  numbering: { config: [{ reference: 'marcas', levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1700, bottom: 1300, left: 1134, right: 1134, header: 500, footer: 500 } } },
    headers: { default: new Header({ children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: brasao, transformation: { width: 42, height: 42 } })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'GOVERNO DO ESTADO DO AMAZONAS', bold: true, font: FONTE, size: 18 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0B3A82', space: 4 } },
        children: [new TextRun({ text: 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF/AM · Gerência de Defesa Vegetal', font: FONTE, size: 16 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Termo de Referência – Sistema e-GDV${versao ? ' · versão ' + versao : ''} · página `, font: FONTE, size: 16, color: '555555' }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: 16, color: '555555' }),
      new TextRun({ text: ' de ', font: FONTE, size: 16, color: '555555' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTE, size: 16, color: '555555' })] })] }) },
    children: filhos
  }]
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(saida, b); console.log('Gerado: ' + saida); });
