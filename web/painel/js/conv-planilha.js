/* Convênios → Financeiro: importação da planilha de movimentação financeira do convênio (.xlsx do gestor, ex.: "MOVIMENTAÇÃO CONVÊNIO
   VEGETAL - 2026.xlsx"). Funções puras (sem DOM nem rede): o painel lê o .xlsx no navegador com a SheetJS (vendor/xlsx, carregada só
   no clique), passa as abas como matrizes de células (ConvPlanilha.abasDoLivro) e recebe a prévia; o teste usa o mesmo arquivo no Node.

   Layout esperado (uma aba por subetapa, nome "SUBETAPA 1.10.4"; a aba CONSOLIDADA fica de fora — desatualizada):
     linha "MOVIMENTAÇÃO FINANCEIRA CONVÊNIO VEGETAL | SALDO TOTAL | <etapa>";
     linha "VALOR DA SUBETAPA | previsto | executado | saldo | descrição";
     cabeçalho "DATA EMISSÃO | MEMO Nº | TIPO | SUBETAPA | NOME | Valor Original (R$)" e as linhas dos memorandos;
     no fim, uma linha sem data e sem memo com o TOTAL da aba (não é lançamento).
   Sem abas "SUBETAPA": layout genérico — qualquer aba com um cabeçalho que tenha data, memo, subetapa e valor.
   Aba "SOMA" (opcional): total executado por etapa e TOTAL, usado só para conferência.

   LGPD: a coluna NOME (servidor que recebeu a diária) NUNCA é lida — só data, memo, tipo (NM/NS), subetapa e valor. Nada de nome
   sai do navegador, entra na prévia ou é gravado; a descrição gravada é "Diária NM"/"Diária NS".

   Regras:
   - linha sem data e sem memo: se o valor = soma das demais linhas da aba, é o total → descartada; senão é "lançamento sem data":
     entra com a data do lançamento datado anterior da aba (ou o primeiro, se não houver anterior) — o usuário troca a data ou ignora;
   - memorando repetido na mesma subetapa: marcado e NÃO importado por padrão (caixa "importar mesmo assim");
   - data antes do início da execução: aviso (importa); fora da vigência: bloqueia a linha; subetapa fora do plano: bloqueia a linha;
   - chave de idempotência: imp|<convênio>|<item>|<memo sem zeros à esquerda> (repetição importada: …|<memo>|2); sem memo:
     imp|<convênio>|<item>|<data da planilha ou vazio>|<valor>|<n> (n = ordem entre iguais). Reimportar não duplica; memo com valor/data
     mudados é atualizado; lançamento importado que sumiu da planilha só é listado (o usuário decide excluir). */
const ConvPlanilha = (() => {
  'use strict';
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
  const pad2 = n => String(n).padStart(2, '0');
  const r2 = v => Math.round(v * 100) / 100;
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const NAT_DIARIAS = ['33.90.14', '33.90.36'];
  const RE_COD = /(\d+\.\d+(?:\.\d+)+)/;

  /** Livro da SheetJS → [{nome, linhas: [[célula…]…]}] com os valores crus (números como números; datas como nº de série). */
  function abasDoLivro(X, wb) {
    return wb.SheetNames.map(nome => ({ nome, linhas: X.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true }) }));
  }

  /** Data da célula → AAAA-MM-DD (nº de série do Excel, Date, "dd/mm/aaaa" ou "aaaa-mm-dd"); '' se não for data. */
  function data(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      if (!(v > 20000 && v < 80000)) return '';                  // 1954…2119: fora disso não é data
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${pad2(m[2])}-${pad2(m[1])}`; }
    return '';
  }
  /** Número da célula (aceita "1.234,56" e "R$ 105,00"); null se vazio/inválido. */
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v == null ? '' : v).replace(/R\$|\s/g, '');
    if (!s) return null;
    const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
    return isFinite(n) ? n : null;
  }
  /** Memo "089/2026" → "89/2026" (zeros à esquerda não mudam o memorando). */
  const memoNorm = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').replace(/^0+(?=\d)/, '');
  const tipoDe = v => { const s = norm(v); return /\bns\b|superior/.test(s) ? 'NS' : /\bnm\b|medio/.test(s) ? 'NM' : /terceir/.test(s) ? 'TERC' : ''; };

  /** Acha o cabeçalho (data, memo, subetapa, valor) nas primeiras linhas da aba. */
  function cabecalho(linhas) {
    for (let i = 0; i < Math.min(linhas.length, 20); i++) {
      const c = (linhas[i] || []).map(norm), col = f => c.findIndex(f);
      const iData = col(x => /^data/.test(x)), iMemo = col(x => /memo|memorando/.test(x)), iValor = col(x => /^valor/.test(x));
      if (iData < 0 || iMemo < 0 || iValor < 0) continue;
      return { linha: i, data: iData, memo: iMemo, valor: iValor, tipo: col(x => /^tipo/.test(x)), sub: col(x => /subetapa|^item/.test(x)), nome: col(x => /^nome/.test(x)) };
    }
    return null;
  }

  /**
   * Extrai os lançamentos das abas. Devolve {formato: 'subetapas'|'generico', abas: [{nome, codigo, previsto, executado, saldo,
   * linhas: [{lid, aba, linha, data, memo, tipo, sub, valor}], totais: [valor], somaLinhas}], soma: {porEtapa: {'1.10': v}, total} | null,
   * ignoradas: [nomes]}. A coluna NOME não é lida.
   */
  function extrair(abas) {
    const out = { formato: 'subetapas', abas: [], soma: null, ignoradas: [] };
    const subs = abas.filter(a => /subetapa/i.test(a.nome) && RE_COD.test(a.nome));
    let fonte = subs;
    if (!subs.length) { out.formato = 'generico'; fonte = abas.filter(a => !/consolidad|^\s*soma\s*$/i.test(a.nome) && cabecalho(a.linhas)); }
    abas.forEach(a => { if (!fonte.includes(a) && !/^\s*soma\s*$/i.test(a.nome)) out.ignoradas.push(a.nome); });
    fonte.forEach(a => {
      const h = cabecalho(a.linhas); if (!h) { out.ignoradas.push(a.nome); return; }
      const codigo = (RE_COD.exec(a.nome) || [])[1] || '';
      const x = { nome: a.nome, codigo, previsto: null, executado: null, saldo: null, linhas: [], totais: [], somaLinhas: 0 };
      // "VALOR DA SUBETAPA | previsto | executado | saldo"
      for (let i = 0; i < h.linha; i++) {
        const l = a.linhas[i] || [];
        if (/valor da subetapa|valor da etapa/.test(norm(l[0]))) {
          const ns = l.slice(1, 6).map(v => typeof v === 'number' ? v : null).filter(v => v != null);
          [x.previsto, x.executado, x.saldo] = [ns[0], ns[1], ns[2]].map(v => v == null ? null : v);
        }
      }
      const brutas = [];
      for (let i = h.linha + 1; i < a.linhas.length; i++) {
        const l = a.linhas[i] || [];
        const valor = numero(l[h.valor]);
        if (!(valor > 0)) continue;
        const memo = memoNorm(l[h.memo]), dt = data(l[h.data]);
        const sub = String((h.sub >= 0 && l[h.sub] != null && String(l[h.sub]).trim()) || codigo).trim().replace(/^subetapa\s*/i, '');
        brutas.push({ lid: `${a.nome}#${i + 1}`, aba: a.nome, linha: i + 1, data: dt, memo, tipo: h.tipo >= 0 ? tipoDe(l[h.tipo]) : '', sub, valor: r2(valor),
          semData: !dt, vazia: !dt && !memo });
      }
      // linhas sem data e sem memo: a que vale a soma das demais é o total da aba (pode haver mais de um total: maiores primeiro)
      const totalTudo = brutas.reduce((s, l) => s + l.valor, 0);
      const cand = brutas.filter(l => l.vazia).sort((p, q) => q.valor - p.valor);
      let descartado = 0;
      cand.forEach(l => { if (igual(l.valor, totalTudo - descartado - l.valor)) { l.total = true; descartado += l.valor; } });
      brutas.forEach(l => { if (l.total) x.totais.push(l.valor); else { delete l.vazia; x.linhas.push(l); } });
      x.somaLinhas = r2(x.linhas.reduce((s, l) => s + l.valor, 0));
      out.abas.push(x);
    });
    const soma = abas.find(a => /^\s*soma\s*$/i.test(a.nome));
    if (soma) {
      const porEtapa = {}; let total = null;
      soma.linhas.forEach(l => {
        const rot = String((l || [])[0] == null ? '' : l[0]).trim(), v = (l || []).slice(1).find(c => typeof c === 'number');
        if (v == null) return;
        if (/^total/i.test(rot)) total = v; else if (/^\d+(\.\d+)+$/.test(rot)) porEtapa[rot] = v;
      });
      if (total != null || Object.keys(porEtapa).length) out.soma = { porEtapa, total };
    }
    return out;
  }

  /** Mapa id do item → {item, etapa} do plano de aplicação. */
  function itensDo(cfg) {
    const m = {};
    cfg.etapas.forEach(e => (e.itens || []).forEach(it => { m[it.id] = { it, e }; }));
    return m;
  }
  const descricaoDe = (tipo, it) => {
    const t = tipo || (/superior/i.test(it.nome) ? 'NS' : /m[ée]dio/i.test(it.nome) ? 'NM' : /terceir/i.test(it.nome) ? 'TERC' : '');
    return t === 'TERC' ? 'Diária terceiros' : t ? 'Diária ' + t : 'Diária';
  };

  /**
   * Prévia da importação. ext = extrair(...); cfg = convênio; financeiro = lançamentos já no sistema (painelConvenios.financeiro);
   * op = {datas: {lid: 'AAAA-MM-DD'}, ignorar: {lid: true}, repetidos: {lid: true} (importar mesmo assim), excluir: {id: true}}.
   */
  function previa(ext, cfg, financeiro, op) {
    op = op || {}; const datas = op.datas || {}, ignorar = op.ignorar || {}, repetidos = op.repetidos || {}, excluir = op.excluir || {};
    const IT = itensDo(cfg), pre = `imp|${cfg.id}|`;
    const sist = (financeiro || []).filter(f => f.convenio === cfg.id && !Number(f.excluido));
    const porChave = {}; sist.forEach(f => { if (f.chave) porChave[f.chave] = f; });
    const linhas = [], vistos = {}, semMemo = {}, avisos = [];
    ext.abas.forEach(a => {
      const datadas = a.linhas.filter(l => l.data);
      a.linhas.forEach((l, i) => {
        const x = Object.assign({}, l, { avisos: [], bloqueio: '', status: 'novo', importar: true });
        const alvo = IT[l.sub];
        if (!alvo) { x.bloqueio = `subetapa ${l.sub || '(vazia)'} não existe no plano de aplicação`; x.status = 'bloqueada'; x.importar = false; }
        else { x.item = alvo.it.id; x.etapa = alvo.e.id; x.natureza = alvo.it.natureza; x.valorUnitario = Number(alvo.it.valorUnitario) || 0; }
        // chave
        if (x.item) {
          if (l.memo) {
            const k = x.item + '|' + l.memo.toLowerCase(), n = vistos[k] = (vistos[k] || 0) + 1;
            x.chave = pre + x.item + '|' + l.memo + (n > 1 ? '|' + n : '');
            if (n > 1) { x.repetido = n; x.avisos.push(`memorando ${l.memo} repetido na subetapa ${l.sub}`);
              if (!repetidos[l.lid] && !x.bloqueio) { x.status = 'repetida'; x.importar = false; } }
          } else {
            const k = [x.item, l.data, l.valor.toFixed(2)].join('|'), n = semMemo[k] = (semMemo[k] || 0) + 1;
            x.chave = pre + k + '|' + n;
          }
        }
        // data: a da planilha; sem data → escolhida pelo usuário ou a do lançamento datado anterior (ou o primeiro) da aba
        x.dataPlanilha = l.data;
        if (!l.data) {
          const ant = a.linhas.slice(0, i).filter(y => y.data).pop() || datadas[0];
          // já importada antes (a chave não depende da data): mantém a data escolhida naquela vez
          x.dataPadrao = (x.chave && porChave[x.chave] && porChave[x.chave].data) || (ant ? ant.data : '');
          x.data = datas[l.lid] || x.dataPadrao;
          x.avisos.push('sem data na planilha' + (x.dataPadrao ? ` (padrão: ${x.dataPadrao.split('-').reverse().join('/')})` : ''));
          if (!x.data && !x.bloqueio) { x.bloqueio = 'escolha a data'; x.status = 'bloqueada'; x.importar = false; }
        }
        if (x.data && !x.bloqueio && (x.data < cfg.vigencia.inicio || x.data > cfg.vigencia.fim)) { x.bloqueio = 'data fora da vigência'; x.status = 'bloqueada'; x.importar = false; }
        if (x.data && x.data < cfg.inicioExecucao && x.data >= cfg.vigencia.inicio) x.avisos.push('antes do início da execução');
        if (ignorar[l.lid] && x.status !== 'bloqueada') { x.status = 'ignorada'; x.importar = false; }
        if (x.item) {
          x.quantidade = x.valorUnitario ? Math.round(l.valor / x.valorUnitario * 100) / 100 : null;
          x.documento = l.memo ? 'Memo nº ' + l.memo : '';
          x.descricao = descricaoDe(l.tipo, alvo.it);
        }
        if (x.importar) {
          const f = porChave[x.chave];
          if (f) x.status = f.data === x.data && igual(Number(f.valor), l.valor) && (f.documento || '') === x.documento && (f.descricao || '') === x.descricao &&
            f.item === x.item && (f.quantidade == null ? null : Number(f.quantidade)) === x.quantidade ? 'igual' : 'alterado';
          if (f) x.id = f.id;
        }
        linhas.push(x);
      });
    });
    const chavesPlan = new Set(linhas.filter(l => l.chave).map(l => l.chave));
    const ausentes = sist.filter(f => f.chave && f.chave.startsWith(pre) && !chavesPlan.has(f.chave)).map(f => Object.assign({}, f, { excluir: !!excluir[f.id] }));
    // por item do plano (os que aparecem na planilha ou têm lançamento importado)
    const itens = [];
    cfg.etapas.forEach(e => (e.itens || []).forEach(it => {
      const ls = linhas.filter(l => l.item === it.id), abasIt = ext.abas.filter(a => a.codigo === it.id);
      const doSist = sist.filter(f => f.item === it.id && f.etapa === e.id);
      if (!ls.length && !abasIt.length && !doSist.some(f => f.chave)) return;
      const gravar = ls.filter(l => l.importar);
      const y = { id: it.id, etapa: e.id, nome: it.nome, natureza: it.natureza, previsto: Number(it.total) || 0, valorUnitario: Number(it.valorUnitario) || 0,
        quantidadePrevista: Number(it.quantidade) || 0,
        cabPrevisto: abasIt.length ? abasIt[0].previsto : null, cabExecutado: abasIt.length ? abasIt.reduce((s, a) => s + (a.executado || 0), 0) : null,
        planilha: r2(ls.reduce((s, l) => s + l.valor, 0)), gravar: r2(gravar.reduce((s, l) => s + l.valor, 0)),
        sistema: r2(doSist.reduce((s, f) => s + Number(f.valor || 0), 0)),
        novos: ls.filter(l => l.status === 'novo').length, iguais: ls.filter(l => l.status === 'igual').length, alterados: ls.filter(l => l.status === 'alterado').length,
        repetidas: ls.filter(l => l.repetido).length, bloqueadas: ls.filter(l => l.status === 'bloqueada').length,
        diarias: Math.round(gravar.reduce((s, l) => s + (l.quantidade || 0), 0) * 100) / 100, avisos: [] };
      // depois de gravar: o que já está no sistema e não vem da planilha + o que a planilha grava
      const fora = doSist.filter(f => !(f.chave && f.chave.startsWith(pre))).reduce((s, f) => s + Number(f.valor || 0), 0)
        + ausentes.filter(f => f.item === it.id && !f.excluir).reduce((s, f) => s + Number(f.valor || 0), 0);
      y.depois = r2(fora + y.gravar);
      if (y.cabExecutado != null && !igual(y.cabExecutado, y.planilha)) y.avisos.push(`total da aba (${moeda(y.planilha)}) ≠ executado do cabeçalho (${moeda(y.cabExecutado)})`);
      if (y.cabPrevisto != null && !igual(y.cabPrevisto, y.previsto)) y.avisos.push(`previsto da aba (${moeda(y.cabPrevisto)}) ≠ previsto do plano (${moeda(y.previsto)})`);
      if (y.depois > y.previsto + 0.005) y.avisos.push(`executado (${moeda(y.depois)}) acima do previsto do item (${moeda(y.previsto)})`);
      itens.push(y);
    }));
    // conferência com a aba SOMA (soma de TODAS as linhas da planilha, inclusive repetidas e sem data, como a própria planilha soma)
    let soma = null;
    if (ext.soma) {
      const porEt = {};
      linhas.forEach(l => { const et = l.etapa || (l.sub || '').split('.').slice(0, 2).join('.'); porEt[et] = (porEt[et] || 0) + l.valor; });
      const ets = [...new Set(Object.keys(ext.soma.porEtapa).concat(Object.keys(porEt)))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
      const tot = r2(linhas.reduce((s, l) => s + l.valor, 0));
      soma = { etapas: ets.map(et => ({ etapa: et, soma: ext.soma.porEtapa[et] == null ? null : ext.soma.porEtapa[et], planilha: r2(porEt[et] || 0),
        ok: ext.soma.porEtapa[et] != null && igual(ext.soma.porEtapa[et], porEt[et] || 0) })),
        total: { soma: ext.soma.total, planilha: tot, ok: ext.soma.total != null && igual(ext.soma.total, tot) } };
      if (!soma.total.ok) avisos.push({ nivel: 'atencao', texto: `Total das abas (${moeda(tot)}) diferente do TOTAL da aba SOMA (${moeda(ext.soma.total)}).` });
      soma.etapas.filter(x => !x.ok).forEach(x => avisos.push({ nivel: 'atencao', texto: x.soma == null ? `Etapa ${x.etapa}: abas somam ${moeda(x.planilha)}, mas a etapa não consta na aba SOMA.` : `Etapa ${x.etapa}: abas somam ${moeda(x.planilha)}; aba SOMA diz ${moeda(x.soma)}.` }));
    }
    const cont = s => linhas.filter(l => l.status === s).length;
    const t = { linhas: linhas.length, novos: cont('novo'), iguais: cont('igual'), alterados: cont('alterado'), repetidas: linhas.filter(l => l.repetido).length,
      repetidasFora: cont('repetida'), semData: linhas.filter(l => !l.dataPlanilha).length, bloqueadas: cont('bloqueada'), ignoradas: cont('ignorada'),
      antesInicio: linhas.filter(l => l.importar && l.avisos.includes('antes do início da execução')).length,
      valorPlanilha: r2(linhas.reduce((s, l) => s + l.valor, 0)), valorGravar: r2(linhas.filter(l => l.importar).reduce((s, l) => s + l.valor, 0)),
      ausentes: ausentes.length, excluir: ausentes.filter(f => f.excluir).length };
    t.valorAntesInicio = r2(linhas.filter(l => l.importar && l.avisos.includes('antes do início da execução')).reduce((s, l) => s + l.valor, 0));
    if (!ext.abas.length) avisos.push({ nivel: 'serio', texto: 'Nenhuma aba de movimentação encontrada (abas "SUBETAPA x.y.z" ou com colunas data, memo, subetapa e valor).' });
    if (t.repetidas) avisos.push({ nivel: 'atencao', texto: `${t.repetidas} memorando(s) repetido(s) na mesma subetapa: ${linhas.filter(l => l.repetido).map(l => `${l.memo} (${l.sub})`).join(', ')} — provável duplicidade; não importado(s) por padrão.` });
    if (t.semData) avisos.push({ nivel: 'atencao', texto: `${t.semData} lançamento(s) sem data e sem memo (não são o total da aba): escolha a data ou ignore.` });
    if (t.antesInicio) avisos.push({ nivel: 'info', texto: `${t.antesInicio} lançamento(s) (${moeda(t.valorAntesInicio)}) com data antes do início da execução (${cfg.inicioExecucao.split('-').reverse().join('/')}), dentro da vigência: serão importados.` });
    if (t.bloqueadas) avisos.push({ nivel: 'serio', texto: `${t.bloqueadas} linha(s) bloqueada(s): ${[...new Set(linhas.filter(l => l.status === 'bloqueada').map(l => l.bloqueio))].join('; ')}.` });
    itens.forEach(y => y.avisos.forEach(a => avisos.push({ nivel: 'atencao', texto: `Item ${y.id}: ${a}.` })));
    if (t.ausentes) avisos.push({ nivel: 'info', texto: `${t.ausentes} lançamento(s) importado(s) antes não estão mais na planilha (não são apagados sozinhos; marque para excluir).` });
    const envio = linhas.filter(l => l.importar && l.status !== 'igual').map(l => ({ chave: l.chave, item: l.item, etapa: l.etapa, data: l.data, valor: l.valor,
      documento: l.documento, quantidade: l.quantidade, fonte: 'concedente', descricao: l.descricao }));
    return { linhas, itens, ausentes, soma, totais: t, avisos, envio, excluir: ausentes.filter(f => f.excluir).map(f => f.id), abasIgnoradas: ext.ignoradas, formato: ext.formato };
  }
  function moeda(v) { return v == null || !isFinite(v) ? '—' : 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v); }

  return { abasDoLivro, extrair, previa, data, numero, memoNorm, NAT_DIARIAS };
})();
if (typeof window !== 'undefined') window.ConvPlanilha = ConvPlanilha;
if (typeof module !== 'undefined' && module.exports) module.exports = ConvPlanilha;
