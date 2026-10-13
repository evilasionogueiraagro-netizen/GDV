// PDF gerado no próprio aparelho (funciona sem internet), para enviar a via do produtor por WhatsApp/e-mail sem impressora.
// Cada folha do documento (modelos de web/documentos, os mesmos da impressão) vira uma imagem JPEG com o html2canvas
// (vendor/html2canvas.min.js, 1.4.1, MIT — carregado só quando preciso e guardado no cache do app) e o PDF é montado aqui:
// uma imagem por página A4, com as mesmas margens da impressão. As quebras de página evitam cortar linhas, fotos e assinaturas.
const PDF = (() => {
  const MM = 96 / 25.4;                                         // px CSS por mm
  const A4 = { w: 210, h: 297, mx: 7, my: 8 };                  // folha e margens (iguais ao @page dos modelos)
  const ESCALA = 2, QUALIDADE = 0.82;                          // ~190 dpi, JPEG: legível e leve (≈ 150–400 KB por folha)

  let carregando = null;
  function carregarLib() {
    if (typeof window.html2canvas === 'function') return Promise.resolve();
    if (!carregando) carregando = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'vendor/html2canvas.min.js';
      s.onload = () => ok(); s.onerror = () => { carregando = null; s.remove(); no(new Error('Não foi possível carregar o gerador de PDF. Abra o app com internet uma vez para atualizá-lo.')); };
      document.head.append(s);
    });
    return carregando;
  }

  /**
   * O html2canvas redesenha uma cópia do documento num iframe próprio, que não enxerga os arquivos relativos (CSS, brasão, logos) —
   * e sem internet nem chegaria a eles. Então tudo vai embutido antes: o CSS vira <style> e as imagens viram data: URL.
   */
  async function embutir(d) {
    d.querySelectorAll('link[rel=stylesheet]').forEach(l => {
      try { const st = d.createElement('style'); st.textContent = [...l.sheet.cssRules].map(r => r.cssText).join('\n'); l.replaceWith(st); } catch (e) { /* folha inacessível: fica o link */ }
    });
    const imgs = [...d.images].filter(im => im.src && !/^data:/.test(im.src) && im.naturalWidth);
    await Promise.all(imgs.map(im => new Promise(ok => {
      try {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0); im.onload = im.onerror = () => ok(); im.src = c.toDataURL('image/png');
      } catch (e) { ok(); }
    })));
  }

  /** O html2canvas não aplica object-fit: fotos "cover" viram um bloco com a imagem de fundo (mesmo recorte da impressão). */
  function prepararImagens(d) {
    const w = d.defaultView;
    d.querySelectorAll('img').forEach(im => {
      const cs = w.getComputedStyle(im);
      if (cs.objectFit !== 'cover' || !im.src) return;
      const r = im.getBoundingClientRect(), div = d.createElement('div');
      div.className = (im.className ? im.className + ' ' : '') + 'pdf-img';
      div.style.cssText = `width:${r.width}px;height:${r.height}px;box-sizing:border-box;border:${cs.border};display:block;` +
        `background:#fff url("${im.src.replace(/"/g, '%22')}") center / cover no-repeat`;
      im.replaceWith(div);
    });
  }

  /** Onde cortar a folha (px a partir do topo): nunca no meio de um bloco que a impressão não quebra (linha, foto, assinatura…). */
  function cortes(pg, alturaPx) {
    const d = pg.ownerDocument, w = d.defaultView, top0 = pg.getBoundingClientRect().top, total = pg.getBoundingClientRect().height;
    const blocos = [];
    pg.querySelectorAll('*').forEach(e => {
      const cs = w.getComputedStyle(e), r = e.getBoundingClientRect(); if (!r.height) return;
      const a = r.top - top0, b = r.bottom - top0;
      if (cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid') blocos.push([a, b]);
      if (cs.breakAfter === 'avoid' || cs.pageBreakAfter === 'avoid') blocos.push([a, b + 12]);   // título colado no que vem depois
    });
    const uteis = blocos.filter(([a, b]) => b - a < alturaPx * 0.9);
    const out = []; let y = 0;
    while (total - y > alturaPx + 0.5) {
      let c = y + alturaPx, mudou = true;
      while (mudou) { mudou = false; for (const [a, b] of uteis) if (a > y + 1 && a < c - 0.5 && b > c + 0.5) { c = a; mudou = true; } }
      if (c <= y + 40) c = y + alturaPx;                                     // nada cabe inteiro: corta no limite
      out.push([y, c]); y = c;
    }
    out.push([y, total]);
    return out;
  }

  const bytesDe = dataUrl => { const b = atob(dataUrl.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  /** Folhas → imagens JPEG ({jpeg, pw, ph, wmm, hmm}). seletor = folhas do modelo (padrão: .a4). */
  async function paginasDe(d, seletor) {
    await carregarLib();
    await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    if (d.fonts && d.fonts.ready) await d.fonts.ready;
    await embutir(d);
    prepararImagens(d);
    const util = (A4.h - 2 * A4.my) * MM, paginas = [];
    for (const pg of d.querySelectorAll(seletor || '.a4')) {
      const larg = pg.getBoundingClientRect().width;
      const cv = await window.html2canvas(pg, { scale: ESCALA, backgroundColor: '#ffffff', logging: false, useCORS: true,
        windowWidth: d.documentElement.scrollWidth, windowHeight: Math.max(d.documentElement.scrollHeight, pg.scrollHeight) });
      const k = cv.width / larg;
      for (const [a, b] of cortes(pg, util)) {
        const h = Math.max(1, Math.round((b - a) * k)), c = document.createElement('canvas');
        c.width = cv.width; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, h);
        x.drawImage(cv, 0, Math.round(a * k), cv.width, h, 0, 0, cv.width, h);
        paginas.push({ jpeg: bytesDe(c.toDataURL('image/jpeg', QUALIDADE)), pw: c.width, ph: h, wmm: larg / MM, hmm: (b - a) / MM });
      }
    }
    if (!paginas.length) throw new Error('Documento vazio.');
    return paginas;
  }

  /** PDF simples: uma imagem JPEG (DCTDecode) por página A4, centralizada na largura e encostada na margem de cima. */
  function montar(paginas, titulo) {
    const enc = new TextEncoder(), partes = [], offs = [];
    let pos = 0;
    const add = x => { const u = typeof x === 'string' ? enc.encode(x) : x; partes.push(u); pos += u.length; };
    const pt = mm => (mm * 72 / 25.4).toFixed(2);
    const txtPdf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '\\$&');
    const n = paginas.length, total = 3 + 3 * n;                   // 1 catálogo, 2 páginas, 3 info, depois página/conteúdo/imagem
    const obj = (i, corpo) => { offs[i] = pos; add(`${i} 0 obj\n`); corpo(); add('\nendobj\n'); };
    add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add(`<< /Type /Pages /Count ${n} /Kids [${paginas.map((_, i) => `${4 + 3 * i} 0 R`).join(' ')}] >>`));
    obj(3, () => add(`<< /Title (${txtPdf(titulo)}) /Producer (e-GDV) >>`));
    paginas.forEach((p, i) => {
      const pag = 4 + 3 * i, cont = pag + 1, img = pag + 2;
      const x = (A4.w - p.wmm) / 2, y = A4.h - A4.my - p.hmm;
      const fluxo = `q ${pt(p.wmm)} 0 0 ${pt(p.hmm)} ${pt(x)} ${pt(y)} cm /Im0 Do Q`;
      obj(pag, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(A4.w)} ${pt(A4.h)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${cont} 0 R >>`));
      obj(cont, () => add(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`));
      obj(img, () => { add(`<< /Type /XObject /Subtype /Image /Width ${p.pw} /Height ${p.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); add(p.jpeg); add('\nendstream'); });
    });
    const xref = pos;
    add(`xref\n0 ${total + 1}\n0000000000 65535 f \n` + Array.from({ length: total }, (_, i) => `${String(offs[i + 1]).padStart(10, '0')} 00000 n \n`).join(''));
    add(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(partes, { type: 'application/pdf' });
  }

  /** Documento já preenchido num iframe (docs.js) → arquivo PDF. O iframe é removido no fim. */
  async function deFrame(frame, nome, seletor) {
    try {
      const pags = await paginasDe(frame.contentDocument, seletor);
      return new File([montar(pags, nome)], nome + '.pdf', { type: 'application/pdf', lastModified: Date.now() });
    } finally { frame.remove(); }
  }

  /* ---------- compartilhar (WhatsApp, e-mail…) ou baixar ---------- */
  const podeCompartilhar = files => { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files })); } catch (e) { return false; } };
  /** Abre a folha de compartilhamento do aparelho. Precisa de um toque do usuário (chamar direto no clique). false = cancelado. */
  async function compartilhar(files, titulo, texto) {
    try { await navigator.share({ files, title: titulo, text: texto }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; throw new Error('Não foi possível compartilhar: ' + (e.message || e)); }
  }
  /** Salva o arquivo no aparelho (pasta Downloads). */
  function baixar(file) {
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { deFrame, montar, paginasDe, podeCompartilhar, compartilhar, baixar, carregarLib };
})();
