// Página pública verificar.html: confere um TF pelo código do QR code (action tfVerificar, sem credencial).
// Mostra só nº, data/hora, barreira, procedimento, servidor, situação e placa mascarada — nunca dados pessoais do fiscalizado.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = iso => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? iso.split('-').reverse().join('/') : String(iso || ''));
  // mesmo servidor do app: o endereço oficial (config.js) manda; o guardado no aparelho só vale sem ele ou nos testes (localhost), como em sync.js
  const api = () => {
    let salvo = '';
    try { salvo = localStorage.getItem('gdv.url') || ''; } catch (e) { /* sem localStorage */ }
    return (CONFIG.sync.url && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? CONFIG.sync.url : salvo || CONFIG.sync.url) || '';
  };
  const res = $('#resultado');

  async function verificar(id) {
    id = String(id || '').trim();
    if (!id) { res.innerHTML = ''; return; }
    res.innerHTML = '<div class="veredito erro">Consultando…</div>';
    let j;
    try {
      const r = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'tfVerificar', id }), redirect: 'follow' });
      j = await r.json();
    } catch (e) { res.innerHTML = '<div class="veredito erro">Sem conexão com o servidor. Tente de novo em instantes.</div>'; return; }
    if (!j.ok) { res.innerHTML = `<div class="veredito erro">${icone('alerta')} ${esc(j.erro || 'Não foi possível consultar agora.')}</div>`; return; }
    if (!j.encontrado) {
      res.innerHTML = `<div class="veredito nao" id="naoEncontrado">${icone('info')}<span>Não encontrado<small>Pode ainda não ter sido sincronizado (TF emitido sem internet) ou não ser autêntico. Confirme com a ADAF.</small></span></div>`;
      return;
    }
    const t = j.tf, canc = t.situacao === 'cancelado';
    res.innerHTML = `${canc
      ? `<div class="veredito cancelado" id="selo">${icone('proibido')}<span>TF CANCELADO<small>Documento emitido pela ADAF, mas cancelado${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}.</small></span></div>`
      : '<div class="veredito ok" id="selo"><span>Documento autêntico<small>Termo registrado no sistema da ADAF e válido.</small></span></div>'}
      <div class="card"><dl id="dados">
        <dt>Nº do TF</dt><dd>${esc(t.numeroTxt)}</dd>
        <dt>Data/hora</dt><dd>${esc(dataBR(t.data))} ${esc(t.hora)}</dd>
        <dt>Barreira</dt><dd>${esc(t.barreira)}</dd>
        <dt>Procedimento</dt><dd>${esc(t.procedimento)}</dd>
        <dt>Servidor</dt><dd>${esc(t.servidor)}</dd>
        <dt>Situação</dt><dd>${canc ? 'Cancelado' + (t.motivoCancel ? ' — ' + esc(t.motivoCancel) : '') : 'Válido'}</dd>
        ${t.placa ? `<dt>Placa</dt><dd>${esc(t.placa)}</dd>` : ''}
      </dl></div>`;
  }

  const id = new URLSearchParams(location.search).get('t') || '';
  $('#codigo').value = id;
  $('#fVerif').onsubmit = e => {
    e.preventDefault();
    const v = $('#codigo').value.trim();
    history.replaceState(null, '', v ? '?t=' + encodeURIComponent(v) : location.pathname);
    verificar(v);
  };
  verificar(id);
})();
