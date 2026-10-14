/* Gerador mínimo de Word (.docx) no navegador, sem biblioteca: OOXML (WordprocessingML) + ZIP sem compressão ("store", com CRC-32).
   Desenha os blocos neutros do relatório (ConvDocs.blocos): título, seções, parágrafos com rótulo em negrito, listas, tabelas com bordas
   (cabeçalho repetido em cada página, células mescladas na vertical) e assinaturas; cabeçalho com o brasão e rodapé com os logos ADAF/SEPROR.
   Escolhido no lugar de uma biblioteca (ex.: docx.js, ~400 KB) porque o relatório só precisa disso, roda sem internet e sem dependência
   nova; o arquivo abre sem aviso no Word e no LibreOffice (testado com soffice --headless --convert-to pdf). */
const DocxMin = (() => {
  'use strict';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const PAG = { w: 11906, h: 16838, mt: 1134, mb: 1134, ml: 1134, mr: 1134 };   // A4, margens de 2 cm (twips)
  const LARG = PAG.w - PAG.ml - PAG.mr, LARG_PAISAGEM = PAG.h - PAG.ml - PAG.mr;
  let larguraAtual = LARG;                                                      // muda nas seções em paisagem (bloco "orientacao")
  const EMU_CM = 360000;

  /* ---------- ZIP (store) ---------- */
  const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = TAB[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(arquivos) {
    const enc = new TextEncoder(), partes = [], central = [];
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0, tamC = 0;
    arquivos.forEach(a => {
      const nome = enc.encode(a.nome), dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados, crc = crc32(dados);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, hora, true); h.setUint16(12, dia, true);
      h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nome, dados);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, hora, true);
      c.setUint16(14, dia, true); c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nome.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nome);
      off += 30 + nome.length + dados.length; tamC += 46 + nome.length;
    });
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true); e.setUint16(8, arquivos.length, true); e.setUint16(10, arquivos.length, true);
    e.setUint32(12, tamC, true); e.setUint32(16, off, true); e.setUint16(20, 0, true);
    return new Blob(partes.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- WordprocessingML ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Run de texto (quebras de linha viram <w:br/>). */
  function run(txt, o) {
    o = o || {};
    const rpr = (o.negrito ? '<w:b/><w:bCs/>' : '') + (o.cor ? `<w:color w:val="${o.cor}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
    return String(txt == null ? '' : txt).split('\n').map((l, i) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
  }
  /** Parágrafo: o = {estilo, jc ('center'|'right'|'both'), antes, depois, manter (keepNext)}; runs = XML dos runs. */
  function par(runs, o) {
    o = o || {};
    const ppr = (o.estilo ? `<w:pStyle w:val="${o.estilo}"/>` : '') + (o.manter ? '<w:keepNext/>' : '') +
      (o.antes != null || o.depois != null ? `<w:spacing${o.antes != null ? ` w:before="${o.antes}"` : ''}${o.depois != null ? ` w:after="${o.depois}"` : ''}/>` : '') +
      (o.ind ? `<w:ind w:left="${o.ind}" w:hanging="${o.hanging || 0}"/>` : '') + (o.jc ? `<w:jc w:val="${o.jc}"/>` : '');
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`;
  }
  /** Imagem inline (r:embed = id da relação; cx/cy em EMU). */
  let idDesenho = 0;
  function imagem(rid, cx, cy, nome) {
    const id = ++idDesenho;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(nome)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  /** Tabela com bordas. b = {titulo, colunas:[{rotulo, largura}], linhas:[[célula|null]], pequena}; null = continuação de célula mesclada (rowspan). */
  function tabela(b) {
    const LARG = larguraAtual;
    const soma = b.colunas.reduce((s, c) => s + c.largura, 0), larg = b.colunas.map(c => Math.floor(LARG * c.largura / soma));
    const sz = b.mini ? 15 : b.pequena ? 17 : 20, borda = '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
    const cel = (w, conteudo, o) => {
      o = o || {};
      const tcpr = `<w:tcW w:w="${w}" w:type="dxa"/>` + (o.span > 1 ? `<w:gridSpan w:val="${o.span}"/>` : '') + (o.vm ? `<w:vMerge${o.vm === 'restart' ? ' w:val="restart"' : ''}/>` : '') +
        (o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : '') + '<w:vAlign w:val="center"/>';
      return `<w:tc><w:tcPr>${tcpr}</w:tcPr>${conteudo}</w:tc>`;
    };
    const pc = (txt, o) => par(run(txt, { negrito: o.negrito, sz }), { jc: o.jc, antes: 0, depois: 0 });
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${LARG}" w:type="dxa"/><w:tblBorders>${borda}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      '<w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
      `<w:tblGrid>${larg.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    if (b.titulo) x += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${cel(LARG, pc(b.titulo, { negrito: true, jc: 'center' }), { span: larg.length, fundo: 'EEF1F6' })}</w:tr>`;
    x += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${b.colunas.map((c, i) => cel(larg[i], pc(c.rotulo, { negrito: true, jc: 'center' }), { fundo: 'D9D9D9' })).join('')}</w:tr>`;
    // rowspan → vMerge: a primeira célula abre ("restart"), as linhas cobertas levam uma célula vazia de continuação
    const abertas = larg.map(() => 0);
    b.linhas.forEach(l => {
      x += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
      l.forEach((c, i) => {
        if (c === null || c === undefined) { x += cel(larg[i], par('', { antes: 0, depois: 0 }), abertas[i] > 0 ? { vm: 'cont' } : {}); if (abertas[i] > 0) abertas[i]--; return; }
        const o = typeof c === 'object' ? c : { texto: c };
        const vm = o.rowspan > 1 ? 'restart' : null; if (vm) abertas[i] = o.rowspan - 1;
        x += cel(larg[i], pc(o.texto == null ? '' : String(o.texto), { negrito: o.negrito, jc: o.alinhar === 'd' ? 'right' : o.alinhar === 'c' ? 'center' : null }), { vm });
      });
      x += '</w:tr>';
    });
    return x + '</w:tbl>' + par('', { antes: 0, depois: 60 });
  }
  /** Propriedades da seção (cabeçalho/rodapé, tamanho e orientação da folha). */
  const sectPr = paisagem => `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>` +
    (paisagem ? `<w:pgSz w:w="${PAG.h}" w:h="${PAG.w}" w:orient="landscape"/>` : `<w:pgSz w:w="${PAG.w}" w:h="${PAG.h}"/>`) +
    `<w:pgMar w:top="${PAG.mt}" w:right="${PAG.mr}" w:bottom="${PAG.mb}" w:left="${PAG.ml}" w:header="425" w:footer="425" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;
  /**
   * Blocos do relatório → corpo do document.xml. Além dos blocos de texto e tabela: {t:'imagem', png: Uint8Array, larguraCm, legenda}
   * (imagem no corpo), {t:'quebra'} (nova página) e {t:'orientacao', paisagem} (nova seção em paisagem/retrato: tabelas largas).
   * img(png) registra a imagem e devolve {rid, cx, cy, nome}. Devolve {xml, paisagem} (orientação da última seção).
   */
  function corpo(B, img) {
    let paisagem = false;
    larguraAtual = LARG;
    const xml = B.map(b => {
      if (b.t === 'orientacao') {
        if (!!b.paisagem === paisagem) return '';
        const fecha = `<w:p><w:pPr>${sectPr(paisagem)}</w:pPr></w:p>`;           // o sectPr num parágrafo encerra a seção anterior
        paisagem = !!b.paisagem; larguraAtual = paisagem ? LARG_PAISAGEM : LARG;
        return fecha;
      }
      if (b.t === 'quebra') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (b.t === 'imagem' && b.png && img) {
        const i = img(b.png, b.larguraCm || 16);
        return par(imagem(i.rid, i.cx, i.cy, i.nome), { jc: 'center', antes: 60, depois: 40, manter: !!b.legenda }) +
          (b.legenda ? par(run(b.legenda, { sz: 18 }), { jc: 'center', antes: 0, depois: 160 }) : '');
      }
      if (b.t === 'titulo') return par(run(b.texto, { negrito: true, sz: 26 }), { jc: 'center', antes: 120, depois: 60, manter: true });
      if (b.t === 'titulo2') return par(run(b.texto, { negrito: true, sz: 24 }), { jc: 'center', depois: 200 });
      if (b.t === 'h') return par(run(b.texto, { negrito: true, sz: 24 }), { antes: 240, depois: 100, manter: true });
      if (b.t === 'h2') return par(run(b.texto, { negrito: true }), { antes: 160, depois: 60, manter: true });
      if (b.t === 'p') return par((b.rotulo ? run(b.rotulo + ': ', { negrito: true, sz: b.pequeno ? 18 : null }) : '') + run(b.texto, { negrito: b.negrito, sz: b.pequeno ? 18 : null }),
        { jc: b.alinhar === 'd' ? 'right' : 'both', antes: b.espaco ? 360 : null });
      if (b.t === 'lista') return b.itens.map(i => par(run('•\t' + i), { ind: 567, hanging: 283, jc: 'both', depois: 40 })).join('');
      if (b.t === 'tabela') return tabela(b);
      if (b.t === 'assinaturas') return b.itens.map((a, i) => par('', { antes: i ? 480 : 720, depois: 0 }) +
        par(run('______________________________________________'), { jc: 'center', antes: 0, depois: 0 }) +
        par(run(a.nome, { negrito: true }), { jc: 'center', antes: 0, depois: 0 }) + par(run(a.cargo), { jc: 'center', antes: 0, depois: 0 })).join('');
      return '';
    }).join('');
    return { xml, paisagem };
  }
  /** Largura e altura de um PNG (bytes 16–23 do cabeçalho IHDR). */
  const tamPng = u => { const v = new DataView(u.buffer, u.byteOffset, u.byteLength); return { w: v.getUint32(16), h: v.getUint32(20) }; };

  /**
   * Monta o .docx. o = {blocos, titulo, autor, cabecalho: Uint8Array PNG (opcional), rodape: [Uint8Array PNG] (opcional), cabecalhoTexto: [linhas]}.
   * Devolve um Blob.
   */
  function criar(o) {
    idDesenho = 0;
    const imgs = [];   // {nome, dados}
    const addImg = (dados, altCm) => { const n = imgs.length + 1, t = tamPng(dados), cy = Math.round(altCm * EMU_CM), cx = Math.round(cy * t.w / t.h);
      imgs.push({ nome: `media/image${n}.png`, dados }); return { rid: 'rIdImg' + n, cx, cy, nome: `image${n}.png` }; };
    let hdr = '', ftr = '';
    if (o.cabecalho) { const i = addImg(o.cabecalho, 1.5); hdr += par(imagem(i.rid, i.cx, i.cy, i.nome), { jc: 'center', antes: 0, depois: 0 }); }
    (o.cabecalhoTexto || []).forEach((l, k) => { hdr += par(run(l, { negrito: k === 0, sz: k === 0 ? 18 : 16 }), { jc: 'center', antes: 0, depois: 0 }); });
    const rods = (o.rodape || []).map(d => addImg(d, 0.9));
    ftr += par(rods.map((i, k) => (k ? '<w:r><w:t xml:space="preserve">          </w:t></w:r>' : '') + imagem(i.rid, i.cx, i.cy, i.nome)).join(''), { jc: 'center', antes: 0, depois: 0 });
    // as relações das imagens ficam no cabeçalho/rodapé que as usa
    const relsDe = lista => XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      lista.map(i => `<Relationship Id="${i.rid}" Type="${REL}image" Target="media/${i.nome}"/>`).join('') + '</Relationships>';
    const imgCab = o.cabecalho ? [{ rid: 'rIdImg1', nome: 'image1.png' }] : [], imgRod = rods.map(i => ({ rid: i.rid, nome: i.nome }));
    // imagens do corpo (ex.: mapas): largura em cm, relação no document.xml.rels
    const imgDoc = [];
    const addImgCorpo = (dados, largCm) => { const n = imgs.length + 1, t = tamPng(dados), cx = Math.round(largCm * EMU_CM), cy = Math.round(cx * t.h / t.w);
      imgs.push({ nome: `media/image${n}.png`, dados }); const i = { rid: 'rIdImg' + n, cx, cy, nome: `image${n}.png` }; imgDoc.push(i); return i; };
    const C = corpo(o.blocos || [], addImgCorpo);
    const doc = XML + `<w:document ${NS}><w:body>${C.xml}${sectPr(C.paisagem)}</w:body></w:document>`;
    const estilos = XML + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
      '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
    const cabXml = XML + `<w:hdr ${NS}>${hdr || par('')}</w:hdr>`, rodXml = XML + `<w:ftr ${NS}>${ftr}</w:ftr>`;
    const agora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const arquivos = [
      { nome: '[Content_Types].xml', dados: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { nome: '_rels/.rels', dados: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}officeDocument" Target="word/document.xml"/>` +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        `<Relationship Id="rId3" Type="${REL}extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { nome: 'docProps/core.xml', dados: XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
        'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(o.titulo || 'Relatório')}</dc:title><dc:creator>${esc(o.autor || 'e-GDV')}</dc:creator><cp:lastModifiedBy>${esc(o.autor || 'e-GDV')}</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${agora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${agora}</dcterms:modified></cp:coreProperties>` },
      { nome: 'docProps/app.xml', dados: XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>e-GDV</Application></Properties>' },
      { nome: 'word/document.xml', dados: doc },
      { nome: 'word/styles.xml', dados: estilos },
      { nome: 'word/settings.xml', dados: XML + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>' +
        '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>' },
      { nome: 'word/_rels/document.xml.rels', dados: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rIdStyles" Type="${REL}styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${REL}settings" Target="settings.xml"/>` +
        `<Relationship Id="rIdHdr" Type="${REL}header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="${REL}footer" Target="footer1.xml"/>` +
        imgDoc.map(i => `<Relationship Id="${i.rid}" Type="${REL}image" Target="media/${i.nome}"/>`).join('') + '</Relationships>' },
      { nome: 'word/header1.xml', dados: cabXml },
      { nome: 'word/_rels/header1.xml.rels', dados: relsDe(imgCab) },
      { nome: 'word/footer1.xml', dados: rodXml },
      { nome: 'word/_rels/footer1.xml.rels', dados: relsDe(imgRod) }
    ].concat(imgs.map(i => ({ nome: 'word/' + i.nome, dados: i.dados })));
    return zip(arquivos);
  }
  return { criar, zip, crc32 };
})();
if (typeof window !== 'undefined') window.DocxMin = DocxMin;
