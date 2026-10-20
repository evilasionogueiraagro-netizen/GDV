/* Portal do Administrativo → VIGIFITO → importação do "Relatório Diário de Trânsito Interestadual" da BVA (papel digitado em .xls/.xlsx,
   ex.: o do plantão de 10 dias do Jundiá). Funções puras (sem DOM nem rede): o portal lê o arquivo com a SheetJS (core: lê .xls) e passa a
   matriz de células e as células mescladas; o teste usa o mesmo caminho no Node.
   Layout lido (pelos rótulos, não por posição fixa):
   - cabeçalho: "BVA: <nome>/<UF>", "Ano:" <aaaa>, "Período:" "dd/mm A dd/mm";
   - quadro "1. Veículos Fiscalizados": linha com "1º dia" … "10° dia" (cada dia pode ocupar várias colunas mescladas) e uma linha por tipo
     com a sigla entre parênteses — Passeio (PA), Utilitário (UT), Caminhão/Carreta (CC), Caminhão e Carreta Baú (CB), Ônibus (ON), Moto (MO);
   - quadro "2. Eventos": linha "Educação Sanitária" com os mesmos dias;
   - lista de cargas: cabeçalho "dia/mês | Hora | Município-UF (Origem, Destino) | Transporte (Tipo, Placa, Identificação do transportador) |
     Produto (Discriminação, Vol, Und) | Documentação apresentada (Disc, Nº) | Ação (Liberação, Apreensão) | Nº TF", uma carga por linha.
   Regras: carga sem Liberação nem Apreensão marcada = liberação (decisão da gerência, 2026-10); "Und" T = toneladas; UF de origem/destino
   = sigla no fim do município ("BOA VISTA/RR", "BOA VISTA - RR") ou, sem sigla, a UF padrão (origem: a do cabeçalho da BVA; destino: AM).
   O servidor (admPlantaoImportar) valida de novo e grava turnos e veículos. */
const PlantaoPlanilha = (() => {
  'use strict';
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pad2 = n => String(n).padStart(2, '0');
  const TIPOS = ['PA', 'UT', 'CC', 'CB', 'ON', 'MT'];
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const somaDias = (dia, n) => new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
  const dBR = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v == null ? '' : v).replace(/\s/g, '');
    if (!s) return null;
    const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
    return isFinite(n) ? n : null;
  }
  /** Primeira aba do livro como matriz + células mescladas (SheetJS). */
  function lerLivro(X, wb) {
    const nome = wb.SheetNames[0], ws = wb.Sheets[nome];
    return { aba: nome, linhas: X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }), mescladas: ws['!merges'] || [] };
  }
  /** "13/03" (texto) ou data do Excel (número) → { d, m }. */
  function diaMes(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return { d: d.getUTCDate(), m: d.getUTCMonth() + 1, a: d.getUTCFullYear() }; }
    const m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?$/.exec(String(v == null ? '' : v).trim());
    if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) return null;
    return { d: +m[1], m: +m[2], a: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null };
  }
  /** "15:00", "15h00", "1500" ou fração do dia do Excel → "HH:MM" ('' se inválida). */
  function hora(v) {
    if (typeof v === 'number' && v >= 0 && v < 1) { const min = Math.round(v * 1440) % 1440; return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
    const m = /^(\d{1,2})\s*[:hH.]?\s*(\d{2})/.exec(String(v == null ? '' : v).trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return pad2(+m[1]) + ':' + m[2];
  }
  /** Município com UF no fim ("BOA VISTA/RR", "BOA VISTA - RR", "BOA VISTA (RR)") → { mun, uf }. */
  function munUf(v) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const m = /^(.*?)[\s]*[/\-–(,]\s*([A-Za-z]{2})\)?$/.exec(s);
    if (m && UFS.indexOf(m[2].toUpperCase()) >= 0 && m[1].trim()) return { mun: m[1].trim(), uf: m[2].toUpperCase() };
    return { mun: s, uf: '' };
  }
  const celula = (L, r, c) => (L[r] || [])[c];
  const texto = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  /** Colunas [c0, c1] do rótulo em (r, c): a mescla que o contém ou só a coluna. */
  function largura(M, r, c) {
    const m = M.find(x => x.s.r <= r && x.e.r >= r && x.s.c === c);
    return m ? [m.s.c, m.e.c] : [c, c];
  }
  /** Linha de cabeçalho dos dias ("1º dia" …) a partir de r0: [{n, c0, c1}] por dia. */
  function diasDaLinha(L, M, r) {
    const out = [];
    (L[r] || []).forEach((v, c) => { const m = /^(\d{1,2})\s*[º°ªo]?\s*dia$/.exec(norm(v)); if (m) { const [c0, c1] = largura(M, r, c); out.push({ n: +m[1], c0, c1 }); } });
    return out;
  }
  function somaCols(L, r, d) { let s = 0, algum = false; for (let c = d.c0; c <= d.c1; c++) { const n = numero(celula(L, r, c)); if (n !== null) { s += n; algum = true; } } return algum ? s : 0; }
  /** Acha a 1ª linha (a partir de r0) com uma célula que satisfaz f; devolve { r, c } ou null. */
  function achar(L, f, r0) {
    for (let r = r0 || 0; r < L.length; r++) { const l = L[r] || []; for (let c = 0; c < l.length; c++) if (l[c] != null && f(norm(l[c]), l[c])) return { r, c }; }
    return null;
  }
  /** Valor à direita do rótulo (mesma linha, primeira célula preenchida depois dele). */
  function aDireita(L, p) { const l = L[p.r] || []; for (let c = p.c + 1; c < l.length; c++) if (l[c] != null && texto(l[c])) return l[c]; return null; }

  /**
   * Extrai o relatório. livro = { linhas, mescladas }; op = { anoPadrao } (ano quando o cabeçalho não traz).
   * Devolve { bva, ufBva, ano, de, ate, dias: [{n, data, tipos, total, totalPapel, educacao}], cargas: [...], avisos: [{nivel, texto}], erros: [] }.
   */
  function extrair(livro, op) {
    op = op || {};
    const L = livro.linhas || [], M = livro.mescladas || [], avisos = [], erros = [];
    const pB = achar(L, s => /^bva\s*:/.test(s)), bvaTxt = pB ? texto(String(celula(L, pB.r, pB.c)).replace(/^\s*BVA\s*:\s*/i, '')) : '';
    const bva = munUf(bvaTxt);
    const pAno = achar(L, s => /^ano\s*:?$/.test(s) || /^ano\s*:\s*\d{4}$/.test(s));
    let ano = null;
    if (pAno) { const t = norm(celula(L, pAno.r, pAno.c)).match(/\d{4}/); ano = t ? +t[0] : numero(aDireita(L, pAno)); }
    if (!(ano >= 2000 && ano <= 2100)) ano = op.anoPadrao || null;
    const pPer = achar(L, s => /^periodo\s*:?/.test(s));
    const perTxt = pPer ? texto(/\d/.test(String(celula(L, pPer.r, pPer.c))) ? celula(L, pPer.r, pPer.c) : aDireita(L, pPer)) : '';
    const mPer = /(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)\s*(?:a|à|ate|até|-)\s*(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)/i.exec(perTxt);
    if (!ano) erros.push('Ano do relatório não encontrado (campo "Ano:").');

    // quadro 1: veículos por tipo e dia
    const pVeic = achar(L, s => /veiculos fiscalizados/.test(s));
    if (!pVeic) erros.push('Quadro "Veículos Fiscalizados" não encontrado.');
    let rDias = -1, colDias = [];
    if (pVeic) for (let r = pVeic.r; r < Math.min(L.length, pVeic.r + 4); r++) { const d = diasDaLinha(L, M, r); if (d.length) { rDias = r; colDias = d; break; } }
    if (pVeic && !colDias.length) erros.push('Linha com "1º dia", "2º dia"… não encontrada no quadro de veículos.');
    const nDias = colDias.length ? Math.max(...colDias.map(d => d.n)) : 0;
    let inicio = null;
    if (mPer && ano) { const a = diaMes(mPer[1]); if (a) inicio = `${a.a || ano}-${pad2(a.m)}-${pad2(a.d)}`; }
    if (!inicio && ano) erros.push('Período do plantão não encontrado (campo "Período:" como "13/03 A 22/03").');
    const dias = [];
    for (let n = 1; n <= nDias; n++) dias.push({ n, data: inicio ? somaDias(inicio, n - 1) : '', tipos: Object.fromEntries(TIPOS.map(t => [t, 0])), total: 0, totalPapel: null, educacao: 0 });
    const porN = n => dias[n - 1];
    if (mPer && inicio && ano) {
      const b = diaMes(mPer[2]), ate = b ? `${b.a || (b.m < +inicio.slice(5, 7) ? ano + 1 : ano)}-${pad2(b.m)}-${pad2(b.d)}` : '';
      if (ate && dias.length && ate !== dias[dias.length - 1].data) avisos.push({ nivel: 'atencao', texto: `O período do cabeçalho termina em ${dBR(ate)}, mas o quadro tem ${dias.length} dia(s) (até ${dBR(dias[dias.length - 1].data)}). Valem os dias do quadro.` });
    }
    let rTotal = -1;
    if (rDias >= 0) for (let r = rDias + 1; r < Math.min(L.length, rDias + 15); r++) {
      const rot = texto(celula(L, r, 1)) || texto(celula(L, r, 0)), m = /\(([A-Za-z]{2})\)/.exec(rot);
      if (/^total$/i.test(norm(celula(L, r, 1))) || /^total$/i.test(norm(celula(L, r, 0)))) { rTotal = r; break; }
      if (!m) continue;
      let k = m[1].toUpperCase(); if (k === 'MO') k = 'MT';
      if (TIPOS.indexOf(k) < 0) { avisos.push({ nivel: 'serio', texto: `Tipo de veículo desconhecido no quadro: "${rot}" (fica de fora).` }); continue; }
      colDias.forEach(d => { const v = somaCols(L, r, d); if (Math.round(v) !== v || v < 0) erros.push(`Quadro de veículos, ${rot}, ${d.n}º dia: valor inválido (${v}).`); porN(d.n).tipos[k] += v; porN(d.n).total += v; });
    }
    if (rTotal >= 0) colDias.forEach(d => { const v = numero(celula(L, rTotal, d.c0)); if (v !== null) { porN(d.n).totalPapel = v; if (v !== porN(d.n).total) avisos.push({ nivel: 'atencao', texto: `${d.n}º dia: a linha Total do papel diz ${v}, a soma dos tipos dá ${porN(d.n).total}. Vale a soma dos tipos.` }); } });

    // quadro 2: educação sanitária (dias da linha de cabeçalho mais próxima acima)
    const pEdu = achar(L, s => /educacao sanitaria/.test(s), rDias + 1);
    if (pEdu) {
      let cols = colDias;
      for (let r = pEdu.r - 1; r > rDias; r--) { const d = diasDaLinha(L, M, r); if (d.length) { cols = d; break; } }
      cols.forEach(d => { if (porN(d.n)) { const v = somaCols(L, pEdu.r, d); if (Math.round(v) !== v || v < 0) erros.push(`Educação sanitária, ${d.n}º dia: valor inválido (${v}).`); else porN(d.n).educacao += v; } });
    } else avisos.push({ nivel: 'atencao', texto: 'Linha "Educação Sanitária" não encontrada: educação sanitária fica 0.' });

    // lista de cargas
    const cargas = [];
    const pLista = achar(L, s => /^dia\s*\/\s*mes$/.test(s));
    if (!pLista) avisos.push({ nivel: 'atencao', texto: 'Lista de cargas ("dia/mês | Hora | …") não encontrada: só o quadro de veículos será importado.' });
    else {
      const C = {}, rH = pLista.r;
      for (let r = rH; r <= rH + 2; r++) (L[r] || []).forEach((v, c) => {
        const s = norm(v); if (!s) return;
        const pega = (k) => { if (C[k] === undefined) C[k] = c; };
        if (/^hora$/.test(s)) pega('hora');
        else if (/^origem/.test(s)) pega('origem');
        else if (/^destino/.test(s)) pega('destino');
        else if (/^tipo$/.test(s)) pega('tipo');
        else if (/^placa$/.test(s)) pega('placa');
        else if (/transportador/.test(s)) pega('transp');
        else if (/^discrimina/.test(s)) pega('produto');
        else if (/^vol/.test(s)) pega('vol');
        else if (/^und|^unid/.test(s)) pega('und');
        else if (/^disc$/.test(s)) pega('docDisc');
        else if (/^n\s*[º°o.]?$/.test(s) && r > rH) pega('docNum');
        else if (/^libera/.test(s)) pega('lib');
        else if (/^apreens/.test(s)) pega('apr');
        else if (/^n\s*[º°o.]?\s*tf$/.test(s)) pega('tf');
      });
      ['hora', 'tipo', 'placa'].forEach(k => { if (C[k] === undefined) erros.push(`Lista de cargas: coluna "${k}" não encontrada.`); });
      const ufOri = op.ufOrigem || bva.uf || '', ufDes = op.ufDestino || 'AM';
      let semAcao = 0, semPlaca = 0;
      for (let r = rH + 3; r < L.length; r++) {
        const dm = diaMes(celula(L, r, pLista.c));
        if (!dm) { if (texto(celula(L, r, C.placa)) || texto(celula(L, r, C.produto))) avisos.push({ nivel: 'serio', texto: `Linha ${r + 1}: carga sem data válida na coluna dia/mês (fica de fora).` }); continue; }
        if (!ano) continue;
        const a = dm.a || (inicio && dm.m < +inicio.slice(5, 7) ? ano + 1 : ano), data = `${a}-${pad2(dm.m)}-${pad2(dm.d)}`;
        const h = hora(celula(L, r, C.hora));
        if (!h) { erros.push(`Linha ${r + 1} (${dBR(data)}): hora inválida ("${texto(celula(L, r, C.hora))}").`); continue; }
        let tipo = texto(celula(L, r, C.tipo)).toUpperCase(); if (tipo === 'MO') tipo = 'MT';
        if (TIPOS.indexOf(tipo) < 0) { erros.push(`Linha ${r + 1} (${dBR(data)} ${h}): tipo de veículo "${tipo || 'vazio'}" desconhecido (use PA, UT, CC, CB, ON ou MO).`); continue; }
        const o = munUf(celula(L, r, C.origem)), d = munUf(celula(L, r, C.destino));
        const lib = texto(celula(L, r, C.lib)), apr = texto(celula(L, r, C.apr));
        if (!lib && !apr) semAcao++;
        const placa = texto(celula(L, r, C.placa)).toUpperCase().replace(/[\s-]/g, '');
        if (!placa) semPlaca++;
        const und = texto(celula(L, r, C.und)), tf = celula(L, r, C.tf);
        cargas.push({ linha: r + 1, data, hora: h, tipo, placa,
          origemMun: o.mun, ufOrigem: o.uf || ufOri, ufOrigemTexto: o.uf, destinoMun: d.mun, ufDestino: d.uf || ufDes,
          transportador: texto(celula(L, r, C.transp)), produto: texto(celula(L, r, C.produto)),
          quantidade: numero(celula(L, r, C.vol)), unidade: /^t$/i.test(und) ? 't' : und,
          documento: [texto(celula(L, r, C.docDisc)), texto(celula(L, r, C.docNum))].filter(Boolean).join(' '),
          medida: apr ? 'apreensao' : 'liberacao', semAcao: !lib && !apr,
          tf: tf == null ? '' : typeof tf === 'number' ? String(Math.round(tf)) : texto(tf) });
      }
      if (semAcao) avisos.push({ nivel: 'info', texto: `${semAcao} carga(s) sem Liberação nem Apreensão marcada: entram como liberação.` });
      if (semPlaca) avisos.push({ nivel: 'atencao', texto: `${semPlaca} carga(s) sem placa.` });
      if (cargas.some(c => !c.ufOrigem)) avisos.push({ nivel: 'atencao', texto: 'Há cargas sem UF de origem: escolha a UF de origem padrão (não entram na internalização sem ela).' });
    }
    return { bva: bva.mun, ufBva: bva.uf, ano, de: dias.length ? dias[0].data : '', ate: dias.length ? dias[dias.length - 1].data : '', dias, cargas, avisos, erros };
  }

  /** Dia do plantão da carga: hora antes da troca = plantão do dia anterior (mesma regra do servidor). */
  const diaDoPlantao = (c, troca) => c.hora < troca ? somaDias(c.data, -1) : c.data;

  /**
   * Prévia com a troca do plantão escolhida: cargas por dia, conferência com o quadro (cargas de um tipo a mais que o quadro = aviso),
   * cargas fora do plantão (erro) e os totais. Devolve { dias, foraDoPlantao, avisos, totais, envio } (envio = corpo da action).
   */
  function previa(X, op) {
    const troca = op.troca || '07:00', avisos = [], fora = [];
    const D = {}; X.dias.forEach(d => { D[d.data] = Object.assign({}, d, { cargas: [] }); });
    X.cargas.forEach(c => { const k = diaDoPlantao(c, troca); if (D[k]) D[k].cargas.push(c); else fora.push(c); });
    if (fora.length) avisos.push({ nivel: 'serio', texto: `${fora.length} carga(s) fora dos dias do plantão com a troca às ${troca} (ex.: linha ${fora[0].linha}, ${dBR(fora[0].data)} ${fora[0].hora}). Ajuste a troca do plantão ou o arquivo.` });
    let veiculos = 0;
    Object.values(D).forEach(d => {
      TIPOS.forEach(t => {
        const n = d.cargas.filter(c => c.tipo === t).length;
        if (n > d.tipos[t]) avisos.push({ nivel: 'atencao', texto: `${dBR(d.data)}: ${n} carga(s) ${t === 'MT' ? 'MO' : t} na lista e ${d.tipos[t]} no quadro de veículos — vale a lista (o total do dia sobe).` });
        veiculos += Math.max(n, d.tipos[t]);
      });
    });
    const vazios = Object.values(D).filter(d => !d.cargas.length && !d.educacao && !d.total).map(d => d.data);
    if (vazios.length) avisos.push({ nivel: 'info', texto: `${vazios.map(dBR).join(', ')}: dia sem nenhum registro no papel (ex.: o dia da troca) — não vira turno.` });
    const tons = (f) => Math.round(X.cargas.filter(f).reduce((s, c) => s + (c.unidade === 't' && c.quantidade ? c.quantidade : 0), 0) * 1000) / 1000;
    const totais = { dias: X.dias.length, diasVazios: vazios.length, veiculos, quadro: X.dias.reduce((s, d) => s + d.total, 0), cargas: X.cargas.length,
      liberacao: X.cargas.filter(c => c.medida === 'liberacao').length, apreensao: X.cargas.filter(c => c.medida === 'apreensao').length,
      tfs: X.cargas.filter(c => c.tf).length, educacao: X.dias.reduce((s, d) => s + d.educacao, 0),
      toneladas: tons(() => true), liberacaoT: tons(c => c.medida === 'liberacao'), apreensaoT: tons(c => c.medida === 'apreensao') };
    const envio = { posto: op.posto || '', troca, fiscal: op.fiscal || '',
      dias: X.dias.map(d => ({ data: d.data, tipos: d.tipos, educacao: d.educacao })),
      cargas: X.cargas.map(c => ({ data: c.data, hora: c.hora, tipo: c.tipo, placa: c.placa, origemMun: c.origemMun, ufOrigem: c.ufOrigemTexto || op.ufOrigem || c.ufOrigem || '',
        destinoMun: c.destinoMun, ufDestino: c.ufDestino || 'AM', transportador: c.transportador, produto: c.produto, quantidade: c.quantidade,
        unidade: c.unidade, documento: c.documento, medida: c.medida, tf: c.tf })) };
    return { dias: Object.values(D), foraDoPlantao: fora, avisos: X.avisos.concat(avisos), erros: X.erros.slice(), totais, envio };
  }

  /** Posto VIGIFITO fixo cujo nome ou BVA ligada contém o nome da BVA do cabeçalho ("Jundiá" → PRESIDENTE FIGUEIREDO - BVA JUNDIÁ). */
  function postoProvavel(postos, bva) {
    const b = norm(bva).replace(/\b(bva|barreira|posto|de|da|do)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!b) return '';
    const p = (postos || []).filter(x => x.tipo === 'fixa').find(x => [x.nome].concat(x.locais || []).some(n => norm(n).indexOf(b) >= 0));
    return p ? p.id : '';
  }

  return { lerLivro, extrair, previa, postoProvavel, diaDoPlantao, TIPOS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlantaoPlanilha;
