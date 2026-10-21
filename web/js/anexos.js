// Fotos e assinaturas colhidas no aparelho (PCE e TF): store "arquivos", redução das fotos, miniaturas e assinatura na tela (canvas).
// Os arquivos ficam no aparelho e sobem ao Drive na sincronização (envio.js → action arquivoEnviar).
const Anexos = (() => {
  const lerJSON = (v, pad) => { try { return JSON.parse(v) || pad; } catch (e) { return pad; } };
  const escA = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Ids de arquivos ligados a um registro (fotos, PDFs escaneados e assinaturas). */
  const idsArquivos = rec => new Set(rec ? [...lerJSON(rec.fotos, []), ...(Array.isArray(lerJSON(rec.documentos, null)) ? lerJSON(rec.documentos, []) : []),
    ...(Array.isArray(lerJSON(rec.pdfs, null)) ? lerJSON(rec.pdfs, []) : []),                      // TF digitado do papel: PDFs escaneados
    ...Object.values(lerJSON(rec.assinaturas, {}))].filter(x => typeof x === 'string' && x) : []);
  /** Apaga do aparelho os arquivos ainda não enviados (os já enviados ficam: o Drive guarda para auditoria). */
  async function apagarSeNaoEnviado(ids) {
    const fora = [];
    for (const id of ids) { const a = await Store.obter('arquivos', id); if (a && !a.enviado) fora.push(id); }
    await Store.apagar('arquivos', fora);
  }
  /** {id: arquivo} dos arquivos do registro que ainda estão no aparelho (para imprimir). */
  async function arquivosPorId(rec) {
    const m = {};
    for (const id of idsArquivos(rec)) { const a = await Store.obter('arquivos', id); if (a) m[id] = a; }
    return m;
  }
  const tamanhoDataURL = d => Math.round((String(d).length - String(d).indexOf(',') - 1) * 3 / 4);
  const novoArquivo = (dono, donoId, tipo, papel, mime, dados) => ({ id: Store.novoId(), dono, donoId, tipo, papel: papel || '', mime, dados,
    tamanho: tamanhoDataURL(dados), criadoEm: Date.now(), enviado: 0, url: '', driveId: '' });

  /** Reduz a foto no aparelho: lado maior até `lado` px (padrão 1600), JPEG com qualidade `q` (padrão 0,7). */
  async function reduzirFoto(file, lado, q) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Não foi possível ler a imagem ' + (file.name || ''))); i.src = url; });
      const f = Math.min(1, (lado || 1600) / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * f)); cv.height = Math.max(1, Math.round(img.naturalHeight * f));
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', q || 0.7);
    } finally { URL.revokeObjectURL(url); }
  }

  /** Miniaturas (grade .pce-fotos). attrs = atributos do botão de remover, ex.: 'data-pce="delfoto"' (recebe também data-id). */
  async function miniaturas(el, ids, attrs) {
    if (!el) return;
    const itens = await Promise.all(ids.map(id => Store.obter('arquivos', id)));
    if (!el.isConnected) return;
    el.innerHTML = ids.length ? ids.map((id, i) => { const a = itens[i];
      return `<div class="pce-foto" data-id="${escA(id)}">${a && a.dados ? `<img src="${escA(a.dados)}" alt="Foto ${i + 1}">` : '<span>☁️ foto arquivada no Drive</span>'}
        <button type="button" class="pce-foto-del" ${attrs} data-id="${escA(id)}" aria-label="Remover foto ${i + 1}">✕</button></div>`; }).join('')
      : '<div class="dica" style="grid-column:1/-1">Nenhuma foto.</div>';
  }

  /**
   * Assinatura com o dedo num canvas: desenha a assinatura inicial (dataURL, se houver) e chama aoTerminar(dataURL PNG) a cada traço.
   * Um dedo por vez (segundo dedo/palma é ignorado); o toque é convertido para a escala do bitmap se a tela mudar de tamanho.
   */
  function ligarCanvas(cv, inicial, aoTerminar) {
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 140;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = '#0b1f4a';
    if (inicial) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = inicial; }
    let ativo = false, ult = null, idAtivo = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * w / (r.width || w), y: (e.clientY - r.top) * h / (r.height || h) }; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); if (ativo) return;
      ativo = true; idAtivo = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
      ult = pos(e); ctx.beginPath(); ctx.arc(ult.x, ult.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    });
    cv.addEventListener('pointermove', e => {
      if (!ativo || e.pointerId !== idAtivo) return; e.preventDefault();
      const p = pos(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p;
    });
    const fim = e => { if (!ativo || (e && e.pointerId !== idAtivo)) return; ativo = false; idAtivo = null; aoTerminar(cv.toDataURL('image/png')); };
    cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim); cv.addEventListener('lostpointercapture', fim);
  }
  const limparCanvas = cv => { if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); };

  /** Assinaturas: F.ass (papel → id já salvo) + F.assNovas (papel → dataURL desenhada agora) viram o mapa final e os arquivos PNG a gravar. */
  function prepararAssinaturas(F) {
    const mapa = {}, novos = [];
    Object.keys(F.ass || {}).forEach(p => { if (F.ass[p]) mapa[p] = F.ass[p]; });
    Object.keys(F.assNovas || {}).forEach(p => { const a = novoArquivo(F.dono, F.id, 'assinatura', p, 'image/png', F.assNovas[p]); novos.push(a); mapa[p] = a.id; });
    return { mapa, novos };
  }

  return { idsArquivos, apagarSeNaoEnviado, arquivosPorId, tamanhoDataURL, novoArquivo, reduzirFoto, miniaturas, ligarCanvas, limparCanvas, prepararAssinaturas };
})();
