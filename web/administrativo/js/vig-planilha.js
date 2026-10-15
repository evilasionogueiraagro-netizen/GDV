/* Portal do Administrativo → VIGIFITO → importação da planilha de controle VIGIFITO (.xlsx, como a "VIGIFITO 2025"). Funções puras
   (sem DOM nem rede): o portal lê o .xlsx com a SheetJS e passa as abas como matrizes de células; o teste usa o mesmo arquivo no Node.
   Layout lido:
   - aba de postos × meses (ex.: "VIGIFITO"): linha de cabeçalho com "Unid." na coluna B e o nome de cada posto no início do seu bloco
     de 15 colunas (J F M A M J | 1º SEMESTRE | J A S O N D | 2º SEMESTRE | TOTAL) + 1 coluna vazia; abaixo, as 28 linhas dos indicadores
     (rótulo na coluna A; a 2ª linha do mesmo indicador, em t, vem sem rótulo). O 2º bloco ("<MUNICÍPIO> - TOTAL") e as abas "1 semestre",
     "2 semestre", "Anual" e "ANUAL-MES" são totais: não são importados (os totais saem do sistema).
   - aba de períodos de 10 dias de um posto (ex.: "JUNDIÁ"): "PERÍODO 1…" na 1ª linha e "05/01 A 14/01/2025" na 2ª; o posto é o que tem
     o nome da aba (Jundiá → PRESIDENTE FIGUEIREDO - BVA JUNDIÁ); o período é o da data de início.
   Cada valor vira um lançamento (periodo AAAA-MM ou P<início>, posto, indicador, valor). Regras: valor negativo e contagem com decimal
   = bloqueados (não entram; o sistema não aceita); t/m³ com mais de 3 casas = arredondado (aviso); total do semestre ≠ soma dos meses
   e total ≠ 1º + 2º semestres = aviso; linhas apuradas pelo e-GDV entram como SUBSTITUIÇÃO do automático (só valores diferentes de
   zero; a opção "semAuto" deixa essas linhas de fora); linhas manuais entram também com zero. Idempotente: a chave é a célula
   (período|posto|indicador) — reimportar a mesma planilha não muda nada. */
const VigPlanilha = (() => {
  'use strict';
  const IND = typeof Indicadores !== 'undefined' ? Indicadores : (typeof window !== 'undefined' ? window.Indicadores : require('../../documentos/indicadores.js'));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pad2 = n => String(n).padStart(2, '0');
  const r3 = v => Math.round(v * 1000) / 1000;
  const somaDias = (dia, n) => new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
  function abasDoLivro(X, wb) { return wb.SheetNames.map(nome => ({ nome, linhas: X.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true }) })); }
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v == null ? '' : v).replace(/\s/g, '');
    if (!s) return null;
    const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
    return isFinite(n) ? n : null;
  }
  const unidN = u => { const s = norm(u); return s === 'n' || s === 'no' || s === 'n o' || s === 'n°' ? 'nº' : s === 't' ? 't' : s === 'm3' || s === 'm 3' ? 'm3' : String(u || '').trim(); };
  /** Linha da planilha → indicador: pelo rótulo (sem acento/maiúsculas; basta começar igual) e a unidade; sem rótulo = 2ª linha (t) do anterior. */
  function indicadorDa(rotulo, unid, anterior) {
    const u = unidN(unid);
    if (rotulo == null || !String(rotulo).trim()) {
      if (!anterior) return null;
      return IND.VIGIFITO.find(d => d.rotulo === anterior.rotulo && d.unid === u) || null;
    }
    const r = norm(rotulo);
    const cands = IND.VIGIFITO.filter(d => d.rotuloPlanilha !== null && (norm(d.rotulo) === r || r.indexOf(norm(d.rotulo)) === 0 || norm(d.rotulo).indexOf(r) === 0));
    return cands.find(d => d.unid === u) || cands[0] || null;
  }
  const postoDe = (cfg, nome) => {
    const n = norm(nome); if (!n) return null;
    return cfg.postos.find(p => norm(p.nome) === n) || null;
  };
  const MES_POS = [1, 2, 3, 4, 5, 6, 'S1', 7, 8, 9, 10, 11, 12, 'S2', 'T'];

  /**
   * abas = [{nome, linhas}]; cfg = configuração do VIGIFITO ({ancora, ciclo, postos}); ano = ano dos meses da aba de postos.
   * Devolve {itens: [{lid, aba, linha, coluna, periodo, posto, postoNome, indicador, rotulo, unid, valor, bloqueio, avisos}], avisos, abas: [{nome, tipo, postos, valores}], ignoradas}.
   */
  function extrair(abas, cfg, ano, op) {
    op = op || {};
    const out = { itens: [], avisos: [], abas: [], ignoradas: [], ano };
    const aviso = (nivel, texto) => out.avisos.push({ nivel, texto });
    abas.forEach(a => {
      const L = a.linhas || [];
      // cabeçalho: linha com "Unid." na coluna B
      const h = L.findIndex((l, i) => i < 10 && l && norm(l[1]) === 'unid');
      if (h < 0) { out.ignoradas.push(a.nome); return; }
      const cab = L[h] || [], sub = L[h + 1] || [];
      const ehPeriodos = cab.slice(2).some(c => /^periodo\s*\d+/.test(norm(c)));
      const ehPostos = !ehPeriodos && norm(sub[2]) === 'j';
      if (!ehPeriodos && !ehPostos) { out.ignoradas.push(a.nome); return; }
      const resumo = { nome: a.nome, tipo: ehPeriodos ? 'periodos' : 'postos', postos: [], valores: 0 };
      // linhas dos indicadores: da 3ª linha do bloco até a 1ª linha vazia
      const linhasInd = []; let ant = null;
      for (let i = h + 2; i < L.length; i++) {
        const l = L[i] || [];
        if (!l.some(c => c != null && String(c).trim() !== '')) break;
        const d = indicadorDa(l[0], l[1], ant);
        if (l[0] != null && String(l[0]).trim()) ant = d;
        if (!d) { aviso('atencao', `${a.nome}, linha ${i + 1}: "${String(l[0] == null ? '(sem rótulo)' : l[0]).slice(0, 60)}" (${l[1] || '—'}) não corresponde a um indicador do VIGIFITO — ignorada.`); continue; }
        linhasInd.push({ i, d, l });
      }
      const add = (posto, periodo, ln, col, bruto) => {
        const d = ln.d, v = numero(bruto);
        if (v == null) return;
        if (d.fonte === 'auto' && (op.semAuto || v === 0)) return;
        const it = { lid: `${a.nome}#${ln.i + 1}#${col + 1}`, aba: a.nome, linha: ln.i + 1, coluna: col + 1, periodo, posto: posto.id, postoNome: posto.nome, indicador: d.k, rotulo: d.rotulo, unid: d.unid,
          fonte: d.fonte, valor: v, bloqueio: '', avisos: [] };
        if (v < 0) it.bloqueio = 'valor negativo';
        else if (d.unid === 'nº' && Math.round(v) !== v) it.bloqueio = 'contagem com decimal';
        else if (d.unid !== 'nº' && r3(v) !== v) { it.avisos.push(`arredondado para 3 casas (${r3(v)})`); it.valor = r3(v); }
        out.itens.push(it); resumo.valores++;
      };
      if (ehPostos) {
        for (let c = 2; c < cab.length; c++) {
          if (cab[c] == null || !String(cab[c]).trim()) continue;
          const nomeP = String(cab[c]).trim();
          if (/ total$/.test(norm(nomeP))) continue;                              // bloco de total por município: não se importa
          const p = postoDe(cfg, nomeP);
          if (!p) { aviso('atencao', `${a.nome}: posto "${nomeP}" não está na lista de postos do VIGIFITO — coluna ignorada (cadastre em "Postos do VIGIFITO" no painel).`); continue; }
          resumo.postos.push(p.nome);
          linhasInd.forEach(ln => {
            const vals = MES_POS.map((m, j) => numero(ln.l[c + j]));
            MES_POS.forEach((m, j) => { if (typeof m === 'number') add(p, `${ano}-${pad2(m)}`, ln, c + j, ln.l[c + j]); });
            const s1 = vals.slice(0, 6).reduce((s, v) => s + (v || 0), 0), s2 = vals.slice(7, 13).reduce((s, v) => s + (v || 0), 0);
            const tx = `${a.nome}, ${p.nome}, ${ln.d.rotulo}${ln.d.unid !== 'nº' ? ' (' + ln.d.unid + ')' : ''}`;
            if (vals[6] != null && Math.abs(vals[6] - s1) > 0.001) aviso('atencao', `${tx}: 1º semestre (${vals[6]}) ≠ soma de janeiro a junho (${r3(s1)}).`);
            if (vals[13] != null && Math.abs(vals[13] - s2) > 0.001) aviso('atencao', `${tx}: 2º semestre (${vals[13]}) ≠ soma de julho a dezembro (${r3(s2)}).`);
            if (vals[14] != null && vals[6] != null && vals[13] != null && Math.abs(vals[14] - vals[6] - vals[13]) > 0.001) aviso('atencao', `${tx}: TOTAL (${vals[14]}) ≠ 1º + 2º semestres (${r3(vals[6] + vals[13])}).`);
          });
        }
      } else {
        const n = norm(a.nome), p = cfg.postos.find(x => norm(x.nome) === n) || cfg.postos.find(x => n && (' ' + norm(x.nome) + ' ').indexOf(' ' + n + ' ') >= 0);
        if (!p) { aviso('atencao', `Aba "${a.nome}" (períodos de 10 dias): nenhum posto com esse nome — ignorada.`); out.ignoradas.push(a.nome); return; }
        resumo.postos.push(p.nome);
        for (let c = 2; c < sub.length; c++) {
          const m = /(\d{1,2})\/(\d{1,2})\s*a\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(String(sub[c] || ''));
          if (!m) continue;
          const anoFim = +m[5], anoIni = +m[2] > +m[4] ? anoFim - 1 : anoFim, ini = `${anoIni}-${pad2(m[2])}-${pad2(m[1])}`;
          const esperado = typeof VigDocs !== 'undefined' ? VigDocs.periodoDe(cfg.ancora, cfg.ciclo, ini) : (() => { const d0 = Date.parse(cfg.ancora + 'T00:00:00Z'), d = Date.parse(ini + 'T00:00:00Z'); return somaDias(cfg.ancora, Math.floor(Math.round((d - d0) / 864e5) / cfg.ciclo) * cfg.ciclo); })();
          if (esperado !== ini) { aviso('serio', `${a.nome}: o período "${String(sub[c]).trim()}" não começa na escala (âncora ${cfg.ancora}, ciclo de ${cfg.ciclo} dias) — coluna ignorada.`); continue; }
          linhasInd.forEach(ln => add(p, 'P' + ini, ln, c, ln.l[c]));
        }
      }
      out.abas.push(resumo);
    });
    const bloq = out.itens.filter(x => x.bloqueio);
    const neg = bloq.filter(x => x.bloqueio === 'valor negativo'), dec = bloq.filter(x => x.bloqueio === 'contagem com decimal');
    if (neg.length) out.avisos.unshift({ nivel: 'serio', texto: `${neg.length} valor(es) negativo(s) — não importados: ` + neg.slice(0, 5).map(x => `${x.postoNome}, ${x.rotulo}, ${x.periodo} (${x.valor})`).join('; ') + (neg.length > 5 ? '…' : '') });
    if (dec.length) out.avisos.unshift({ nivel: 'serio', texto: `${dec.length} contagem(ns) com decimal — não importadas: ` + dec.slice(0, 5).map(x => `${x.postoNome}, ${x.rotulo}, ${x.periodo} (${x.valor})`).join('; ') + (dec.length > 5 ? '…' : '') });
    const arr = out.itens.filter(x => x.avisos.length);
    if (arr.length) out.avisos.push({ nivel: 'info', texto: `${arr.length} valor(es) em t/m³ com mais de 3 casas decimais: arredondados.` });
    return out;
  }

  /** Prévia: compara com os valores já no sistema (lancamentos de admVigDados) → novos, iguais, alterados, bloqueados e o envio. */
  function previa(ext, lancamentos) {
    const ja = {}; (lancamentos || []).forEach(l => { ja[`${l.periodo}|${l.posto}|${l.indicador}`] = l; });
    const T = { valores: ext.itens.length, novos: 0, iguais: 0, alterados: 0, bloqueados: 0, auto: 0, manuais: 0 };
    const envio = [], vistos = {};
    ext.itens.forEach(x => {
      if (x.bloqueio) { x.status = 'bloqueado'; T.bloqueados++; return; }
      const k = `${x.periodo}|${x.posto}|${x.indicador}`;
      if (vistos[k]) { x.status = 'repetido'; x.bloqueio = 'célula repetida na planilha'; T.bloqueados++; return; }
      vistos[k] = 1;
      const a = ja[k];
      x.status = !a ? 'novo' : Number(a.valor) === x.valor && (x.fonte === 'manual' || a.substitui) ? 'igual' : 'alterado';
      T[x.status === 'novo' ? 'novos' : x.status === 'igual' ? 'iguais' : 'alterados']++;
      T[x.fonte === 'auto' ? 'auto' : 'manuais']++;
      if (x.status !== 'igual') envio.push({ periodo: x.periodo, posto: x.posto, indicador: x.indicador, valor: x.valor });
    });
    return { totais: T, envio, itens: ext.itens, avisos: ext.avisos, abas: ext.abas, ignoradas: ext.ignoradas };
  }
  /** Ano provável da planilha: nos rótulos dos períodos de 10 dias ou no nome do arquivo; senão o ano anterior ao de hoje. */
  function anoProvavel(abas, arquivo, hoje) {
    const m = /(20\d\d)/.exec(String(arquivo || '')); if (m) return +m[1];
    for (const a of abas) for (const l of (a.linhas || []).slice(0, 3)) for (const c of (l || [])) { const x = /\d{1,2}\/\d{1,2}\s*a\s*\d{1,2}\/\d{1,2}\/(\d{4})/i.exec(String(c || '')); if (x) return +x[1]; }
    return Number(String(hoje || new Date().toISOString()).slice(0, 4)) - 1;
  }
  return { abasDoLivro, extrair, previa, anoProvavel, indicadorDa, numero };
})();
if (typeof window !== 'undefined') window.VigPlanilha = VigPlanilha;
if (typeof module !== 'undefined' && module.exports) module.exports = VigPlanilha;
