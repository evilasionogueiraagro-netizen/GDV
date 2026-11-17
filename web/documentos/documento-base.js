// Ajudante único dos documentos A4 do e-GDV sobre documento-base.css: monta cabeçalho, número (três caixas), rodapé e linhas de escrever, e mede se o corpo
// passa do rodapé. Sem dependências. Marcadores no HTML: [data-cabecalho] (+ data-gdv), [data-numero], [data-rodape data-vias="a|b|c"].
const DocumentoBase = (() => {
  const ENDERECO = ['Avenida Carlos Drummond de Andrade, 1460 Japiim', 'Conj. Atílio Andreazza, ULBRA, Bloco G, 1º andar', 'Fone: (92) 99192-3067 / 99983-1176',
    'Manaus-AM-CEP 69077-730', 'E-mail: gabinete@adaf.am.gov.br'];
  const e = (doc, tag, cls, ...filhos) => { const x = doc.createElement(tag); if (cls) x.className = cls; filhos.flat().forEach(k => { if (k != null) x.append(k); }); return x; };
  const img = (doc, src, alt) => { const i = doc.createElement('img'); i.src = src; i.alt = alt; return i; };

  /** Brasão e órgão (com a Gerência de Defesa Vegetal se o marcador tiver data-gdv). */
  function montarCabecalho(pg) {
    const a = pg.querySelector('[data-cabecalho]'); if (!a) return;
    const d = pg.ownerDocument, gdv = a.hasAttribute('data-gdv');
    a.textContent = ''; a.classList.add('doc-cab');
    a.append(img(d, '../img/brasao.png', 'Brasão do Estado do Amazonas'), e(d, 'div', 'gov', 'GOVERNO DO ESTADO DO AMAZONAS'),
      e(d, 'div', '', 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF/AM'));
    if (gdv) a.append(e(d, 'div', '', 'Gerência de Defesa Vegetal – GDV'));      // o Termo oficial tem só 2 linhas de órgão; a ficha tem 3
  }
  /** Número em três caixas (Nº sequencial - Ano - Unidade) a partir de "001-2026-MANAUS" ou "001.2026.MANAUS". */
  function montarNumero(alvo, txt) {
    const d = alvo.ownerDocument, p = String(txt || '').split(/[-./]/), caixa = (v, rot, cls) => e(d, 'span', 'nc' + (cls ? ' ' + cls : ''), e(d, 'span', '', v || ''), e(d, 'small', '', rot));
    alvo.textContent = ''; alvo.classList.add('doc-num');
    alvo.append(caixa(p[0], 'Nº sequencial'), e(d, 'span', 'sep', '-'), caixa(p[1], 'Ano'), e(d, 'span', 'sep', '-'), caixa(p.slice(2).join('-'), 'Unidade', 'un'));
  }
  /** Rodapé único: filete e vias numa linha; embaixo, endereço, logo da ADAF e texto da SEPROR/AM (como no papel). Preso à base da folha por CSS. */
  function montarRodape(pg) {
    const a = pg.querySelector('[data-rodape]'); if (!a) return;
    const d = pg.ownerDocument;
    a.textContent = ''; a.classList.add('doc-rodape');
    a.append(e(d, 'div', 'doc-vias', (a.getAttribute('data-vias') || '').split('|').filter(Boolean).map(v => e(d, 'span', '', v))),
      e(d, 'div', 'doc-fim', e(d, 'div', 'doc-end', ENDERECO.flatMap((l, i) => (i ? [d.createElement('br'), l] : [l]))), e(d, 'div', 'doc-logo', img(d, '../img/logo-adaf.png', 'ADAF')),
        e(d, 'div', 'doc-dir', 'Secretaria de Produção Rural do Estado do Amazonas – SEPROR/AM')));
  }
  /** Linhas de escrever como bordas pontilhadas (imprimem sem "gráficos de fundo"); o texto fica sobre elas e há no mínimo `min` linhas (guardado em data-min:
   *  chamar de novo sem `min` refaz as linhas com o passo do nível da folha, --pl). Chamar com `min` maior acrescenta linhas vazias. */
  function pautar(el, min) {
    const d = el.ownerDocument, tl = el.querySelector(':scope > .tl'), txt = tl ? tl.textContent : el.textContent;
    if (min == null) min = Number(el.getAttribute('data-min')) || 1; else el.setAttribute('data-min', min);
    el.textContent = ''; el.append(e(d, 'div', 'tl', txt)); el.style.minHeight = '';
    const passo = parseFloat(getComputedStyle(el).lineHeight), mm = 96 / 25.4;
    el.style.minHeight = min * passo + 'px';
    const n = Math.max(min, Math.ceil(el.getBoundingClientRect().height / passo - 0.02));
    for (let i = 1; i <= n; i++) { const l = e(d, 'div', 'pl'); l.style.top = i * passo - 0.7 * mm + 'px'; el.append(l); }
  }
  /** Cabeçalho, números e rodapé de uma folha. o.numero = texto do número ("001-2026-MANAUS"). */
  function montar(pg, o) {
    montarCabecalho(pg); montarRodape(pg);
    pg.querySelectorAll('[data-numero]').forEach(x => montarNumero(x, (o || {}).numero));
  }
  const FOLGA_PX = 1.5 * 96 / 25.4;
  /** Espaço (px) entre o fim do corpo (.cq) e o topo do rodapé; negativo = o corpo passa por cima do rodapé. */
  const sobra = pg => pg.querySelector('[data-rodape]').getBoundingClientRect().top - pg.querySelector('.cq').getBoundingClientRect().bottom;
  const cabe = pg => sobra(pg) >= FOLGA_PX;
  return { montar, montarCabecalho, montarNumero, montarRodape, pautar, sobra, cabe, FOLGA_PX };
})();
if (typeof window !== 'undefined') window.DocumentoBase = DocumentoBase;
