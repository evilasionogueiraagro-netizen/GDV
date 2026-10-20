/* Ícones do e-GDV (design system: docs/DESIGN.md). SVG inline, sem dependência externa e sem emoji.
   Todos no mesmo estilo de traço: grade 24x24, sem preenchimento, traço 2 em currentColor (a cor vem do texto em volta),
   pontas e junções arredondadas. Usado pelo app de campo, pelo painel e pelo portal (um desenho só para todos).

   icone('salvar')                         ícone decorativo (aria-hidden): o texto ao lado diz o que é
   icone('fechar', { rotulo: 'Fechar' })   ícone que é o único rótulo: role="img" + <title>
   icone('carro', { tamanho: 28 })         tamanho em px (padrão: 1.25em, acompanha a fonte)
   <span data-icone="sincronizar"></span>  em HTML estático: Icones.preencher() troca pelo SVG (roda sozinho ao carregar)
   CSS (pseudo-elemento): mask: var(--ico-pendente) — as variáveis --ico-<nome> são criadas ao carregar este arquivo.

   Ícone novo: desenhe na grade 24x24 só com traço (paths simples, sem fill), acrescente aqui em ordem alfabética
   e na lista de docs/DESIGN.md. */
const Icones = (() => {
  const D = {
    alerta: '<path d="M10.3 3.9 2.4 17.5a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17.5h.01"/>',
    amostra: '<path d="M8 3h8"/><path d="M14.5 3v13a2.5 2.5 0 0 1-5 0V3"/><path d="M9.5 11h5"/>',
    anexo: '<path d="m20.5 11.5-8.4 8.4a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7.4"/>',
    assinatura: '<path d="M3 21h18"/><path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    baixar: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    bloqueio: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    broto: '<path d="M12 21V11"/><path d="M12 13C12 9.2 9.3 6.5 4 6.5c0 4.2 3 6.5 8 6.5z"/><path d="M12 11c0-3.6 2.6-6.5 8-6.5 0 4.2-3 6.5-8 6.5z"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    'caminhao': '<path d="M14 17V6H3a1 1 0 0 0-1 1v10h2.5"/><path d="M14 9h4.5l3.5 4v4h-3"/><path d="M8.5 17H15"/><circle cx="6.5" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    'caminhao-bau': '<rect x="2" y="5" width="13" height="10" rx="1"/><path d="M15 8h3.5l3.5 4v3h-7"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="10" cy="18" r="1.8"/><circle cx="18.5" cy="18" r="1.8"/>',
    carro: '<path d="M5 16H3v-3.5L5.5 11l2-3.2A1.5 1.5 0 0 1 8.8 7h6a1.5 1.5 0 0 1 1.2.6L18.5 11l2.5 1v4h-2"/><path d="M9 16h6M5.5 11h13"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/>',
    celular: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2.5 2.5M14.5 8.5l2 2"/>',
    citros: '<circle cx="12" cy="14" r="7"/><path d="M12 7V4.5"/><path d="M12 5.5c1-2 3-2.6 5-2-.6 2-2.6 2.8-5 2z"/>',
    compartilhar: '<path d="M8 8H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2"/><path d="M12 2v12M8.5 5.5 12 2l3.5 3.5"/>',
    dica: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.5 1 .5 1.6V16h6v-.5c0-.6.1-1.2.6-1.6A6 6 0 0 0 12 3z"/>',
    documento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    editar: '<path d="M16 3.5a2.1 2.1 0 0 1 3 3L7.5 18 3 19.5 4.5 15z"/><path d="m14 5.5 3 3"/>',
    enviar: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    formulario: '<path d="M12 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v3"/><path d="M14 3v5h5M9 13h4M9 17h2"/><path d="M18.4 13.6a1.4 1.4 0 0 1 2 2L15 21l-2.6.6.6-2.6z"/>',
    historico: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
    imprimir: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
    lista: '<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><path d="M9 11h6M9 15h6"/>',
    lixeira: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
    local: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    manual: '<path d="M2 5h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
    mapa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    moto: '<circle cx="5" cy="16.5" r="3"/><circle cx="19" cy="16.5" r="3"/><path d="M5 16.5h4.5L12 12h4l3 4.5"/><path d="M6 12h6"/><path d="m15 12-1.5-4H17"/>',
    offline: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.4 4.6A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 5-2.6M15.6 10.6a10 10 0 0 1 3.4 1.9M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M3 3l18 18"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    online: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    onibus: '<rect x="2" y="5" width="20" height="11" rx="2"/><path d="M2 10h20M7 5v5M12 5v5M17 5v5"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="17.5" cy="17" r="1.8"/>',
    parar: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    pausa: '<path d="M9 5v14M15 5v14"/>',
    pendente: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    praga: '<rect x="8" y="7" width="8" height="13" rx="4"/><path d="M12 7V5M10 5 8.5 3M14 5l1.5-2M8 11H4M8 15.5H4M16 11h4M16 15.5h4M12 11v9"/>',
    proibido: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>',
    propriedade: '<path d="M3 21V10l9-6 9 6v11M2 21h20"/><path d="M9 21v-7h6v7M9 14l6 7M15 14l-6 7"/>',
    resumo: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    rota: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
    salvar: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    'seta-baixo': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'seta-cima': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    sincronizar: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
    status: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    sugerir: '<path d="M3 7h3.5a4 4 0 0 1 3.2 1.6l4.6 6.8a4 4 0 0 0 3.2 1.6H21"/><path d="M3 17h3.5a4 4 0 0 0 3.2-1.6M14.3 8.6A4 4 0 0 1 17.5 7H21"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/>',
    telefone: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    utilitario: '<path d="M3 16V9a2 2 0 0 1 2-2h9l3 4h2a2 2 0 0 1 2 2v3h-2"/><path d="M9 16h6M3 11h14M10 7v4"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/>',
    voltar: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
  };
  const ATR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** SVG do ícone (string). o.tamanho: px (número) ou medida CSS; o.rotulo: texto quando o ícone é o único rótulo; o.classe: classe extra. */
  function icone(nome, o) {
    o = o || {};
    const d = D[nome];
    if (!d) { if (typeof console !== 'undefined') console.warn('Ícone desconhecido: ' + nome); return ''; }
    const t = o.tamanho == null ? '1.25em' : typeof o.tamanho === 'number' ? o.tamanho + 'px' : String(o.tamanho);
    const cls = 'ico ico-' + nome + (o.classe ? ' ' + o.classe : '');
    const acess = o.rotulo ? `role="img" aria-label="${esc(o.rotulo)}"` : 'aria-hidden="true"';
    return `<svg class="${cls}" ${ATR} width="${t}" height="${t}" ${acess} focusable="false">${o.rotulo ? `<title>${esc(o.rotulo)}</title>` : ''}${d}</svg>`;
  }

  /** Troca cada <elemento data-icone="nome"> (HTML estático) pelo SVG; data-icone-rotulo vira o rótulo acessível. */
  function preencher(raiz) {
    (raiz || document).querySelectorAll('[data-icone]').forEach(el => {
      el.innerHTML = icone(el.dataset.icone, { rotulo: el.dataset.iconeRotulo });
      el.removeAttribute('data-icone');
    });
  }

  /** Variáveis CSS --ico-<nome> (url do SVG) para usar como máscara em pseudo-elementos: mask: var(--ico-check). */
  function variaveisCss() {
    const s = document.documentElement.style;
    Object.keys(D).forEach(n => s.setProperty('--ico-' + n,
      `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${ATR.replace('currentColor', '#000')}>${D[n]}</svg>`)}")`));
  }

  if (typeof document !== 'undefined') {
    variaveisCss();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => preencher());
    else preencher();
  }
  return { icone, preencher, nomes: Object.keys(D) };
})();
const icone = Icones.icone;
