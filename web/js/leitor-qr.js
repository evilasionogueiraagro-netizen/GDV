// Leitura de QR Code pela câmera, dentro do app (o convite do turno compartilhado). Usa o leitor nativo do navegador (BarcodeDetector,
// Chrome/Android) e, sem ele (iPhone), a biblioteca vendorizada vendor/jsQR.js, carregada só quando a câmera abre.
// LeitorQR.ler() abre a tela da câmera e devolve o texto lido, ou null se a pessoa fechar. A câmera desliga ao terminar.
const LeitorQR = (() => {
  const disponivel = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let jsqr = null;
  function carregarJsQR() {
    if (typeof jsQR === 'function') return Promise.resolve();
    return jsqr || (jsqr = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = ok;
      s.onerror = () => { jsqr = null; no(new Error('Não foi possível carregar o leitor de QR Code.')); };
      document.head.appendChild(s);
    }));
  }
  async function decodificador() {
    if ('BarcodeDetector' in window) {
      try {
        const fmts = await BarcodeDetector.getSupportedFormats();
        if (fmts.includes('qr_code')) { const d = new BarcodeDetector({ formats: ['qr_code'] }); return async c => { const r = await d.detect(c); return r[0] ? r[0].rawValue : null; }; }
      } catch (e) { /* cai no jsQR */ }
    }
    await carregarJsQR();
    return async c => { const x = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); const r = jsQR(x.data, x.width, x.height); return r ? r.data : null; };
  }
  function ler(titulo) {
    return new Promise(async resolve => {
      const tela = document.createElement('div');
      tela.className = 'leitor-qr'; tela.setAttribute('role', 'dialog'); tela.setAttribute('aria-label', titulo || 'Ler QR Code');
      tela.innerHTML = `<div class="leitor-qr-topo"><b>${titulo || 'Ler QR Code'}</b><button type="button" class="botao sec mini" data-fechar>Fechar</button></div>
        <video playsinline muted></video><div class="leitor-qr-mira"></div><p class="leitor-qr-msg">Aponte a câmera para o QR Code.</p>`;
      document.body.appendChild(tela);
      const video = tela.querySelector('video'), msg = tela.querySelector('.leitor-qr-msg'), canvas = document.createElement('canvas');
      let stream = null, fim = false, timer = null;
      const terminar = txt => { if (fim) return; fim = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); tela.remove(); resolve(txt); };
      tela.querySelector('[data-fechar]').onclick = () => terminar(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (fim) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play();
        const ler1 = await decodificador();
        const passo = async () => {
          if (fim) return;
          if (video.videoWidth) {
            const k = Math.min(1, 640 / video.videoWidth);                  // reduz o quadro: mais rápido no celular
            canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
            canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height);
            const txt = await ler1(canvas).catch(() => null);
            if (txt) return terminar(txt);
          }
          timer = setTimeout(passo, 200);
        };
        passo();
      } catch (e) {
        msg.textContent = e && e.name === 'NotAllowedError' ? 'Sem permissão para a câmera: libere nas configurações do navegador e tente de novo, ou digite o código.'
          : 'Não foi possível abrir a câmera neste aparelho. Digite o código.';
      }
    });
  }
  return { disponivel, ler };
})();
