/* Painel gerencial do GDV — aba "Relatórios": CENTRAL DE RELATÓRIOS (só administrador; não aparece no Modo TV; não usa o período nem os
   filtros do painel). Tipo → período → gerar (Word .docx, PDF e Imprimir em todos; o VIGIFITO também em .xlsx no layout da planilha):
   - PCE: as partes de PCE do Relatório GDV (Seção I por grupo de pragas com tabelas e mapas, amostras e laudos, quadro PCE, HLB, anexo LGPD);
   - VIGIFITO: indicadores × postos (mensal, período de 10 dias da escala, semestral e anual), ../documentos/vigifito-docs.js (VigDocs);
   - Convênio: o relatório circunstancial mensal do convênio (o mesmo da aba Convênios; os textos são editados lá);
   - Consolidado: o Relatório Técnico da GDV (parcial mensal e consolidado anual), com a Seção II/VIGIFITO = o relatório VIGIFITO.
   Os números vêm de um motor só (documentos/indicadores.js + apurações do servidor). O painel só mostra e gera: os números manuais são
   lançados no Portal do Administrativo (aqui só leitura, com "lançado pelo Administrativo em … por …"); os textos são redigidos aqui.
   Apurações: painelRelGdvApuracao (PCE/consolidado), painelVigDados (VIGIFITO), painelConvenios/painelConvApuracao (convênio);
   textos: painelRelGdv / painelRelGdvSalvar. Word: js/docx.js (DocxMin); PDF: ../documentos/relgdv-relatorio.html (conv-relatorio.html
   no convênio) + ../js/pdf.js; .xlsx: SheetJS (vendor/xlsx, carregada só no clique). */
(() => {
  'use strict';
  if (typeof Painel === 'undefined' || typeof RelGdvDocs === 'undefined') return;
  const P = Painel, esc = P.esc, RD = RelGdvDocs, F = RD.fmt;
  const VD = typeof VigDocs !== 'undefined' ? VigDocs : null, CD = typeof ConvDocs !== 'undefined' ? ConvDocs : null, IND = typeof Indicadores !== 'undefined' ? Indicadores : null;
  const LS = 'gdv.painel.relgdv', XLSX_SRC = 'vendor/xlsx/xlsx.mini.min.js';
  const RELS = [['pce', 'PCE'], ['vigifito', 'VIGIFITO'], ['convenio', 'Convênio'], ['consolidado', 'Consolidado (Relatório GDV)']];
  const lembrado = (() => { try { return JSON.parse(P.ls.get(LS) || '{}') || {}; } catch (e) { return {}; } })();
  const hoje = () => P.hoje();
  const pad2 = n => String(n).padStart(2, '0');
  const anoHoje = () => Number(hoje().slice(0, 4)), mesHoje = () => Number(hoje().slice(5, 7));
  const E = { raiz: null, rel: RELS.some(r => r[0] === lembrado.rel) ? lembrado.rel : 'consolidado', tipo: lembrado.tipo === 'anual' ? 'anual' : 'mensal',
              ano: Number(lembrado.ano) || anoHoje(), mes: Number(lembrado.mes) || mesHoje(), vmodo: lembrado.vmodo || 'mensal', vper: lembrado.vper || '', vsem: Number(lembrado.vsem) || 1,
              cid: '', cmes: lembrado.cmes || '', dados: {}, ap: {}, vig: {}, R: null, VR: null, conv: null, capur: {}, CR: null,
              carregando: false, erro: '', textos: null, txtInfo: null, chaveTxt: '', L: null, listas: null, anoEstado: 0, meta: {}, msg: { t: '', cls: '' }, gerando: false };
  const cfg = () => (typeof CONFIG !== 'undefined' && CONFIG.RELGDV) || { grupos: [], assinaturas: [], local: 'Manaus/AM' };
  const ehGdv = () => E.rel === 'pce' || E.rel === 'consolidado';
  const lembrar = () => P.ls.set(LS, JSON.stringify({ rel: E.rel, tipo: E.tipo, ano: E.ano, mes: E.mes, vmodo: E.vmodo, vper: E.vper, vsem: E.vsem, cmes: E.cmes }));
  const periodo = () => {
    const a = E.ano, m = pad2(E.mes);
    return E.tipo === 'mensal' ? { de: `${a}-${m}-01`, ate: RD.fimDoMes(a, E.mes), deAno: `${a}-01-01` } : { de: `${a}-01-01`, ate: `${a}-12-31`, deAno: `${a}-01-01` };
  };
  const gruposReq = () => (cfg().grupos || []).map(g => ({ id: g.id, colunas: (g.colunas || []).map(c => ({ rotulo: c.rotulo, pragas: c.pragas })) }));
  const vigChave = () => E.vmodo === 'mensal' ? pad2(E.mes) : E.vmodo === 'periodo' ? 'P' + E.vper : E.vmodo === 'semestral' ? 'S' + E.vsem : '';

  /* ---------------- carga ---------------- */
  async function apurar(de, ate, forcar) {
    const k = `${de}|${ate}`;
    if (!E.ap[k] || forcar) E.ap[k] = await P.chamar({ action: 'painelRelGdvApuracao', de, ate, grupos: gruposReq() });
    return E.ap[k];
  }
  async function vigDados(ano, forcar) { if (!E.vig[ano] || forcar) E.vig[ano] = await P.chamar({ action: 'painelVigDados', ano }); return E.vig[ano]; }
  async function carregar(forcar) {
    if (E.carregando) return;
    E.carregando = true; E.erro = ''; E.R = null; E.VR = null; E.CR = null;
    try {
      desenhar();
      if (E.rel === 'convenio') {
        if (!CD) throw new Error('ConvDocs não carregado.');
        if (!E.conv || forcar) E.conv = await P.chamar({ action: 'painelConvenios' });
        const c = cfgConv(), ms = mesesConv(c);
        if (E.cmes !== 'total' && !ms.includes(E.cmes)) E.cmes = ms[ms.length - 1];
        const k = `${c.id}|${E.cmes}|${c.versao || 0}`;
        if (!E.capur[k] || forcar) E.capur[k] = await P.chamar({ action: 'painelConvApuracao', convenio: c.id, de: c.inicioExecucao, ate: consolConv() ? hoje() : CD.fimDoMes(E.cmes) });
      } else {
        if (!E.dados[E.ano] || forcar) E.dados[E.ano] = await P.chamar({ action: 'painelRelGdv', ano: E.ano });
        if (E.anoEstado !== E.ano || forcar) iniciarLancamentos();
        if (ehGdv()) {
          const p = periodo();
          await apurar(p.de, p.ate, forcar);
          if (E.tipo === 'mensal') await apurar(p.deAno, p.ate, forcar);
        }
        if ((E.rel === 'vigifito' || E.rel === 'consolidado') && VD) await vigDados(E.ano, forcar);
        iniciarTextos(forcar);
      }
    } catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    recalcular(); desenhar();
  }
  /** Lançamentos do ano (do Portal do Administrativo; só leitura): L[MM][chave] = valor; listas[chave][MM] = [linhas]; meta = quem/quando. */
  function iniciarLancamentos() {
    E.L = {}; E.listas = {}; E.anoEstado = E.ano; E.meta = {};
    (E.dados[E.ano].lancamentos || []).forEach(l => {
      E.meta[l.mes + '|' + l.chave] = { usuario: l.usuario, em: l.atualizadoEm };
      if (RD.TABS[l.chave]) { (E.listas[l.chave] = E.listas[l.chave] || {})[l.mes] = (l.lista || []).map(x => ({ ...x })); return; }
      if (l.valor != null) (E.L[l.mes] = E.L[l.mes] || {})[l.chave] = String(l.valor).replace('.', ',');
    });
  }
  /** Textos: PCE e consolidado usam os do Relatório GDV (mensal/anual); o VIGIFITO, os próprios (por período do relatório). */
  function iniciarTextos(forcar) {
    const chave = E.rel === 'vigifito' ? `vigifito|${E.ano}|${vigChave()}` : `${E.tipo}|${E.ano}|${E.tipo === 'mensal' ? E.mes : ''}`;
    if (E.chaveTxt === chave && E.textos && !forcar) return;
    if (E.rel === 'vigifito') {
      const salvos = (E.dados[E.ano].textos || []).filter(r => r.tipo === 'vigifito').sort((a, b) => (a.atualizadoEm || 0) - (b.atualizadoEm || 0));
      const deste = salvos.find(r => r.ano === E.ano && String(r.mes || '') === vigChave()), anterior = salvos[salvos.length - 1];
      const base = { ...(VD ? VD.TEXTO_PADRAO : {}), assinaturas: cfg().assinaturas || [], local: cfg().local || 'Manaus/AM' };
      E.textos = { ...base, ...((deste || anterior || {}).textos || {}) };
      if (!Array.isArray(E.textos.assinaturas) || !E.textos.assinaturas.length) E.textos.assinaturas = base.assinaturas;
      E.txtInfo = { salvo: !!deste, origem: deste ? 'salvo' : anterior ? 'anterior' : 'padrao', anterior: anterior && !deste ? 'outro período do VIGIFITO' : '' };
    } else { const t = RD.textosIniciais(E.dados[E.ano].textos, E.tipo, E.ano, E.mes, cfg()); E.textos = t.textos; E.txtInfo = t; }
    E.chaveTxt = chave;
  }
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : null; };
  function lancamentos() {
    const out = [];
    Object.keys(E.L || {}).forEach(m => Object.keys(E.L[m]).forEach(chave => { const v = numSimples(E.L[m][chave]); out.push({ mes: m, chave, valor: v == null ? '' : v }); }));
    Object.keys(E.listas || {}).forEach(chave => Object.keys(E.listas[chave]).forEach(m => out.push({ mes: m, chave, lista: E.listas[chave][m] })));
    return out;
  }
  const vigCalc = (tipo, extra) => VD && E.vig[E.ano] ? VD.calcular(Object.assign({ tipo, ano: E.ano, dados: E.vig[E.ano], hoje: hoje() }, extra || {})) : null;
  function recalcular() {
    E.R = null; E.VR = null; E.CR = null;
    if (E.rel === 'convenio') {
      const c = cfgConv(); if (!c) return;
      const ap = E.capur[`${c.id}|${E.cmes}|${c.versao || 0}`];
      if (ap) E.CR = CD.calcular(c, ap, E.conv.lancamentos, E.conv.financeiro, cmesEf(c), { hoje: hoje(), municipio: n => P.municipioNome(n) || n });
      return;
    }
    if (E.rel === 'vigifito') {
      if (!E.vig[E.ano]) return;
      const per = E.vper || (VD.periodosDoAno(E.vig[E.ano].cfg.ancora, E.vig[E.ano].cfg.ciclo, E.ano).filter(p => p.inicio <= hoje()).pop() || {}).inicio;
      E.vper = per || '';
      E.VR = vigCalc(E.vmodo === 'periodo' ? 'periodo' : E.vmodo, { mes: E.mes, periodo: per, semestre: E.vsem });
      return;
    }
    const p = periodo(), ap = E.ap[`${p.de}|${p.ate}`];
    if (!ap || !E.dados[E.ano]) return;
    E.R = RD.calcular({ tipo: E.tipo, ano: E.ano, mes: E.mes, ap, apAno: E.tipo === 'mensal' ? E.ap[`${p.deAno}|${p.ate}`] : ap, lancamentos: lancamentos(),
      cfg: cfg(), hoje: hoje(), municipio: n => P.municipioNome(n) || n, vig: E.rel === 'consolidado' ? vigCalc('anual') : null });
  }
  const cfgConv = () => E.conv ? (E.conv.convenios.find(c => c.id === E.cid) || E.conv.convenios[0]) : null;
  const mesesConv = c => { const ate = hoje().slice(0, 7); const l = CD.mesesDe(c).filter(m => m <= ate); return l.length ? l : [CD.mesesDe(c)[0]]; };
  // "total" = consolidado desde o início da execução até hoje (o motor usa o último mês disponível; a apuração vai até hoje)
  const consolConv = () => E.cmes === 'total';
  const cmesEf = c => { if (!consolConv()) return E.cmes; const ms = mesesConv(c); return ms[ms.length - 1]; };

  /* ---------------- estrutura e eventos ---------------- */
  function montar() {
    const r = P.el('div', 'pn-rg'); r.id = 'pn-rg';
    r.addEventListener('change', e => {
      const t = e.target, q = s => r.querySelector(s);
      if (['pn-rg-rel', 'pn-rg-tipo', 'pn-rg-ano', 'pn-rg-mes', 'pn-rg-vmodo', 'pn-rg-vper', 'pn-rg-vsem', 'pn-rg-conv', 'pn-rg-cmes'].includes(t.id)) {
        if (t.id === 'pn-rg-rel') E.rel = t.value;
        if (q('#pn-rg-tipo')) E.tipo = q('#pn-rg-tipo').value;
        if (q('#pn-rg-ano')) E.ano = Number(q('#pn-rg-ano').value);
        if (q('#pn-rg-mes')) E.mes = Number(q('#pn-rg-mes').value) || 1;
        if (q('#pn-rg-vmodo')) E.vmodo = q('#pn-rg-vmodo').value;
        if (t.id === 'pn-rg-vper') E.vper = t.value;
        if (q('#pn-rg-vsem')) E.vsem = Number(q('#pn-rg-vsem').value) || 1;
        if (t.id === 'pn-rg-conv') E.cid = t.value;
        if (t.id === 'pn-rg-cmes') E.cmes = t.value;
        if (t.id === 'pn-rg-ano' || t.id === 'pn-rg-vmodo') E.vper = '';
        lembrar(); E.msg = { t: '', cls: '' }; E.chaveTxt = ''; carregar();
      } else if (t.id === 'pn-rg-anexo') E.textos.anexo = t.checked ? 1 : 0;
    });
    r.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.txt) { E.textos[t.dataset.txt] = t.value; marcarSujo(); }
      else if (t.dataset.ass) { const [i, k] = t.dataset.ass.split(':'); E.textos.assinaturas = (E.textos.assinaturas || []).slice(); while (E.textos.assinaturas.length < 3) E.textos.assinaturas.push({ nome: '', cargo: '' });
        E.textos.assinaturas[+i] = { ...E.textos.assinaturas[+i], [k]: t.value }; marcarSujo(); }
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-rg]'); if (!b) return;
      const a = b.dataset.rg;
      if (a === 'atualizar') carregar(true);
      else if (a === 'salvar') salvar();
      else if (a === 'docx' || a === 'pdf' || a === 'imprimir' || a === 'xlsx') gerar(a);
      else if (a === 'postos') dialogoPostos();
      else if (a === 'ir-conv') P.irPara('convenios');
      else if (a === 'padrao') { if (!confirm('Trocar todos os textos pelos textos-padrão?')) return; Object.assign(E.textos, E.rel === 'vigifito' ? VD.TEXTO_PADRAO : RD.TEXTOS_PADRAO); desenharEdicao(); marcarSujo(); }
    });
    return r;
  }
  function marcarSujo() { setMsg('Alterações não salvas.', ''); }
  function setMsg(t, cls) { E.msg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=rg]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }

  function titulo() {
    if (E.rel === 'pce') return E.tipo === 'mensal' ? `Relatório PCE Parcial — ${RD.MESES[E.mes - 1]}/${E.ano}` : `Relatório PCE ${E.ano} — Consolidado`;
    if (E.rel === 'vigifito') return `Relatório VIGIFITO — ${E.VR ? E.VR.rotulo : E.ano}`;
    if (E.rel === 'convenio') { const c = cfgConv(); return c ? `Relatório do convênio ${c.numero} — ${consolConv() ? 'consolidado até ' + CD.fmt.data(hoje()) : CD.fmt.mes(E.cmes)}` : 'Relatório do convênio'; }
    return E.tipo === 'mensal' ? `Relatório Técnico Parcial — ${RD.MESES[E.mes - 1]}/${E.ano}` : `Relatório Técnico ${E.ano} — Consolidado`;
  }
  function desenhar() {
    const r = E.raiz; if (!r) return;
    const anos = [anoHoje() - 2, anoHoje() - 1, anoHoje()], meses = RD.MESES.map((n, i) => [i + 1, n]).filter(([i]) => E.ano < anoHoje() || i <= mesHoje());
    if (!meses.some(([i]) => i === E.mes)) E.mes = meses[meses.length - 1][0];
    const selAno = `<label>Ano<select id="pn-rg-ano">${anos.map(a => `<option ${a === E.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>`;
    const selMes = oculto => `<label ${oculto ? 'hidden' : ''}>Mês<select id="pn-rg-mes">${meses.map(([i, n]) => `<option value="${i}" ${i === E.mes ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    let ctl = '';
    if (ehGdv()) ctl = `<label>Período<select id="pn-rg-tipo"><option value="mensal" ${E.tipo === 'mensal' ? 'selected' : ''}>Parcial mensal</option><option value="anual" ${E.tipo === 'anual' ? 'selected' : ''}>Consolidado anual</option></select></label>${selAno}${selMes(E.tipo === 'anual')}`;
    else if (E.rel === 'vigifito') {
      const vd = E.vig[E.ano], pers = vd && VD ? VD.periodosDoAno(vd.cfg.ancora, vd.cfg.ciclo, E.ano).filter(p => p.inicio <= hoje()) : [];
      ctl = `<label>Período<select id="pn-rg-vmodo">${[['mensal', 'Mensal'], ['periodo', 'Período de 10 dias'], ['semestral', 'Semestral'], ['anual', 'Anual']].map(([k, t]) => `<option value="${k}" ${E.vmodo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>${selAno}` +
        (E.vmodo === 'mensal' ? selMes(false) : E.vmodo === 'periodo' ? `<label>Período de 10 dias<select id="pn-rg-vper">${pers.map(p => `<option value="${p.inicio}" ${p.inicio === E.vper ? 'selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></label>`
          : E.vmodo === 'semestral' ? `<label>Semestre<select id="pn-rg-vsem"><option value="1" ${E.vsem === 1 ? 'selected' : ''}>1º semestre</option><option value="2" ${E.vsem === 2 ? 'selected' : ''}>2º semestre</option></select></label>` : '');
    } else if (E.rel === 'convenio' && E.conv) {
      const c = cfgConv(), ms = mesesConv(c);
      ctl = `<label>Convênio<select id="pn-rg-conv">${E.conv.convenios.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.numero || x.id)}</option>`).join('')}</select></label>
        <label>Mês de referência<select id="pn-rg-cmes"><option value="total" ${consolConv() ? 'selected' : ''}>Total (consolidado até hoje)</option>${ms.slice().reverse().map(m => `<option value="${m}" ${m === E.cmes ? 'selected' : ''}>${esc(CD.fmt.mes(m))}</option>`).join('')}</select></label>`;
    }
    const ap = ehGdv() && E.ap[`${periodo().de}|${periodo().ate}`];
    const sub = E.rel === 'pce' ? 'Seção I por grupo de pragas (tabelas e mapas), amostras e laudos, quadro PCE, HLB e anexo (LGPD).'
      : E.rel === 'vigifito' ? 'Indicadores da planilha de controle por posto. Valores do e-GDV (turnos, veículos, TFs) + lançados pelo Administrativo (linhas manuais e substituições). Word, PDF e Excel (.xlsx com os dados).'
      : E.rel === 'convenio' ? 'Relatório circunstancial técnico do convênio (metas e execução financeira): mensal (parcial) ou o total consolidado desde o início da execução até hoje. Os textos são editados na aba Convênios.'
      : 'Relatório Técnico da GDV: todas as seções (PCE, VIGIFITO — o mesmo relatório VIGIFITO —, CFO/CFOC, PTV, educação sanitária, HLB).';
    r.innerHTML = `
      <div class="pn-cartao pn-rg-topo">
        <div class="pn-conv-sel">
          <label>Relatório<select id="pn-rg-rel">${RELS.map(([k, t]) => `<option value="${k}" ${E.rel === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          ${ctl}
          <div class="pn-conv-botoes"><button type="button" class="pn-btn" data-rg="atualizar" id="pn-rg-atualizar">Atualizar</button>${E.rel === 'vigifito' && P.gerencia ? '<button type="button" class="pn-btn" data-rg="postos" id="pn-vig-postos">Postos do VIGIFITO</button>' : ''}</div>
        </div>
        <h3 class="pn-conv-nome" id="pn-rg-titulo">${esc(titulo())}</h3>
        <p class="pn-sub">${esc(sub)} Apuração no servidor, independente do período carregado nas outras abas; números manuais lançados no <a href="../administrativo/" target="_blank" rel="noopener">Portal do Administrativo</a>.${ap && ap.apuradoEm ? ` Apurado em ${esc(P.fmt.dataHora(ap.apuradoEm))}.` : ''}</p>
      </div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}${/a[çc][ãa]o inv[áa]lida/i.test(E.erro) ? ' — o servidor ainda está com o Code.gs antigo: cole o Code.gs novo e crie uma nova versão da implantação.' : ''}</p>` : ''}
      <div id="pn-rg-corpo" class="${E.carregando ? 'carregando' : ''}"></div>`;
    const c = r.querySelector('#pn-rg-corpo');
    if (E.rel === 'convenio') { if (!E.CR) { P.vazio(c, E.carregando ? 'Apurando o convênio…' : 'Sem apuração.'); return; } return desenharConv(c); }
    if (E.rel === 'vigifito') { if (!E.VR) { P.vazio(c, E.carregando ? 'Apurando o VIGIFITO…' : 'Sem apuração.'); return; } return desenharVig(c); }
    if (!E.R) { P.vazio(c, E.carregando ? 'Apurando o relatório…' : 'Sem apuração.'); return; }
    desenharCorpo(c);
  }
  function desenharEdicao() { recalcular(); const c = E.raiz && E.raiz.querySelector('#pn-rg-corpo'); if (!c) return; const y = window.scrollY; c.innerHTML = '';
    if (E.rel === 'vigifito') desenharVig(c); else if (E.rel === 'convenio') desenharConv(c); else desenharCorpo(c); window.scrollTo(0, y); }

  /* ---------------- PCE / consolidado ---------------- */
  const tabela = (cab, linhas, extra) => `<div class="pn-tab pn-rg-tab ${extra || ''}"><div class="pn-tab-rolo"><table><thead><tr>${cab.map(h => `<th scope="col" class="${h.num ? 'num' : ''}">${esc(h.r)}</th>`).join('')}</tr></thead>` +
    `<tbody>${linhas.map(l => `<tr class="${l.cls || ''}">${l.c.map((x, i) => `<td class="${cab[i] && cab[i].num ? 'num' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  /** Número lançado no Portal do Administrativo (só leitura no painel), com quem lançou e quando. */
  const quem = (m, chave) => { const x = E.meta[m + '|' + chave]; return x ? `lançado pelo Administrativo em ${P.fmt.data(P.diaManaus(x.em))} ${P.horaManaus(x.em)} por ${x.usuario}` : 'sem lançamento (lance no Portal do Administrativo)'; };
  const inp = (m, chave, rot) => { const v = ((E.L[m] || {})[chave]); return `<span class="pn-rg-val${v == null || v === '' ? ' vazio' : ''}" data-mes="${m}" data-chave="${esc(chave)}" aria-label="${esc(rot)}" title="${esc(quem(m, chave))}">${esc(v == null || v === '' ? '—' : v)}</span>`; };
  const val = (v, u) => esc(RD.valorTxt(v, u || 'nº'));
  const seloFonte = f => f === 'auto' ? '<span class="pn-selo bom">e-GDV</span>' : '<span class="pn-selo info">lançado</span>';
  function desenharCorpo(c) {
    const R = E.R, M = R.marcadores, anual = R.tipo === 'anual', mm = R.mm, soPce = E.rel === 'pce';
    c.innerHTML = '';
    P.kpis(c, [
      { rotulo: 'Municípios com levantamento', valor: R.resumo.municipiosLevantados || 0 },
      { rotulo: 'Propriedades visitadas', valor: (anual ? R.quadroPce.find(x => x.chave === 'propVisitadas').total : R.quadroPce.find(x => x.chave === 'propVisitadas').mes) || 0, detalhe: 'distintas no período' },
      { rotulo: 'Levantamentos', valor: R.resumo.levantamentos || 0, detalhe: `${F.int(R.resumo.deteccoes || 0)} detecção(ões)/suspeita(s)` },
      { rotulo: 'Termos de colheita', valor: R.lab.total.termos, detalhe: `${F.int(R.lab.total.amostras)} amostra(s) · ${F.int(R.lab.total.positivo)} positiva(s)`, status: R.lab.total.positivo ? 'critico' : null }
    ].concat(soPce ? [] : [{ rotulo: 'Veículos abordados', valor: Number(String(M.veiculos).replace(/\./g, '')) || 0, detalhe: `${M.tfs} TF(s) · ${M.pessoas} medida(s) de educação sanitária` }]));
    P.alertas(P.secao(c, 'Avisos de consistência', 'Antes de gerar: linhas manuais vazias, amostras sem resultado, campos opcionais e unidades sem conversão.'), soPce ? R.avisos.filter(a => !/VIGIFITO|Liberações/.test(a.titulo)) : R.avisos, { vazio: 'Nenhum aviso. ✓', max: 6 });

    const s1 = P.secao(c, 'Seção I — Levantamentos por grupo de pragas', 'Tabelas por município (propriedades distintas; detecções por praga; "–" = zero). O total fecha por construção (soma das linhas). Colunas † por município: lançadas no Portal do Administrativo.');
    R.grupos.forEach(G => {
      const g = G.g, card = P.el('div', 'pn-cartao pn-rg-grupo'); card.dataset.grupo = g.id;
      const cab = [{ r: 'Município' }, { r: 'Propriedades', num: true }].concat((g.colunas || []).map(x => ({ r: x.rotulo, num: true })))
        .concat(G.extras.map(x => ({ r: x === 'suspeitas' ? 'Suspeitas' : 'Amostras', num: true }))).concat(G.manuais.map(x => ({ r: x.rotulo + ' †', num: true })));
      const linhas = G.linhas.map(r => ({ c: [esc(r.municipio), esc(F.int(r.propriedades))]
        .concat(r.det.map((v, j) => esc(v ? F.int(v) : '–') + (r.susp[j] && !G.extras.includes('suspeitas') ? ` <small>(+${F.int(r.susp[j])} susp.)</small>` : '')))
        .concat(G.extras.map(x => esc((x === 'suspeitas' ? r.suspeitas : r.amostras) ? F.int(x === 'suspeitas' ? r.suspeitas : r.amostras) : '–')))
        .concat(G.manuais.map(mn => !anual ? inp(mm, `mun.${g.id}.${mn.chave}|${r.municipio}`, `${mn.rotulo} – ${r.municipio}`) : esc(r.manual[mn.chave] != null ? F.int(r.manual[mn.chave]) : '–'))) }))
        .concat([{ cls: 'pn-rg-total', c: ['<b>TOTAL</b>', `<b>${esc(F.int(G.total.propriedades))}</b>`].concat(G.total.det.map(v => `<b>${esc(v ? F.int(v) : '–')}</b>`))
          .concat(G.extras.map(x => `<b>${esc(F.int(x === 'suspeitas' ? G.total.suspeitas : G.total.amostras))}</b>`)).concat(G.manuais.map(mn => `<b>${esc(G.total.manual[mn.chave] != null ? F.int(G.total.manual[mn.chave]) : '–')}</b>`)) }]);
      card.innerHTML = `<h3>${esc(g.nome)}</h3><p class="pn-sub">${esc(F.int(G.levantamentos || 0))} levantamento(s) · ${esc(F.int(G.propriedades || 0))} propriedade(s) · ${Object.keys(G.niveis).length} município(s) no mapa</p>` +
        tabela(cab, linhas) + (G.manuais.length ? `<p class="pn-sub">Colunas † lançadas por município no Portal do Administrativo${anual ? ' (no anual, somam os meses)' : ''}.</p>` : '');
      s1.appendChild(card);
    });
    const labCab = ['Praga', 'Termos', 'Amostras', 'Enviadas', 'Aguardando', 'Negativo', 'Positivo', 'Inconclusivo', 'Inviável'].map((r, i) => ({ r, num: i > 0 }));
    const labK = ['termos', 'amostras', 'enviadas', 'aguardando', 'negativo', 'positivo', 'inconclusivo', 'inviavel'];
    const lab = P.el('div', 'pn-cartao'); lab.innerHTML = '<h3>Amostras e resultados de laboratório</h3>' + tabela(labCab, R.lab.porPraga.map(x => ({ c: [esc(x.praga)].concat(labK.map(k => esc(F.int(x[k] || 0)))) }))
      .concat([{ cls: 'pn-rg-total', c: ['<b>TOTAL</b>'].concat(labK.map(k => `<b>${esc(F.int(R.lab.total[k]))}</b>`)) }]));
    s1.appendChild(lab);

    const s2 = P.secao(c, 'Seção II — Quadro PCE', anual ? 'Jan–dez e total. Linhas "lançado": valores do Portal do Administrativo (o total soma os meses). Propriedades e área: o total usa propriedades distintas no ano.' : `Mês e acumulado no ano (1º de janeiro a ${RD.MESES[E.mes - 1]}).`);
    const ML = R.meses.map(m => RD.MESES_CURTOS[+m - 1]);
    const celulaMes = (r, m) => (r.fonte === 'manual' && !R.futuro(m) ? inp(m, r.chave, `${r.rotulo} – ${RD.MESES_CURTOS[+m - 1]}`) : esc(R.futuro(m) ? '' : RD.valorTxt(r.valores[m], r.unid)));
    const cabQ = anual ? [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }].concat(ML.map(m => ({ r: m, num: true }))).concat([{ r: 'Total', num: true }])
      : [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }, { r: `${RD.MESES_CURTOS[E.mes - 1]}/${E.ano}`, num: true }, { r: 'Acumulado no ano', num: true }];
    const linhaQ = r => ({ c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte)].concat(anual ? R.meses.map(m => celulaMes(r, m)).concat([`<b>${val(r.total, r.unid)}</b>`]) : [celulaMes(r, mm), `<b>${val(r.acum, r.unid)}</b>`]) });
    const qp = P.el('div', 'pn-cartao'); qp.innerHTML = '<h3>Programa de Prevenção, Controle e Erradicação de Pragas – PCE</h3>' + tabela(cabQ, R.quadroPce.map(linhaQ), 'pn-rg-quadro');
    s2.appendChild(qp);
    if (!soPce) {
      const sv = P.secao(c, 'Seção II — VIGIFITO (barreiras)', 'Os mesmos números do relatório VIGIFITO (soma dos postos por tipo). Total = BVA fixas + BVA volantes. Valores manuais: lançados por posto no Portal do Administrativo.');
      if (anual) {
        [['fixa', 'BVA fixas'], ['volante', 'BVA volantes'], ['total', 'Total consolidado']].forEach(([b, t]) => {
          const k = P.el('div', 'pn-cartao'); k.innerHTML = `<h3>VIGIFITO – ${esc(t)}</h3>` + tabela(cabQ, R.vig[b].map(r => ({ c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte)].concat(R.meses.map(m => esc(R.futuro(m) ? '' : RD.valorTxt(r.valores[m], r.unid)))).concat([`<b>${val(r.total, r.unid)}</b>`]) })), 'pn-rg-quadro'); sv.appendChild(k);
        });
      } else {
        const cabV = [{ r: 'Ação' }, { r: 'Unid.' }, { r: 'Fonte' }, { r: 'BVA fixas', num: true }, { r: 'BVA volantes', num: true }, { r: 'Total no mês', num: true }, { r: 'Acumulado no ano', num: true }];
        const k = P.el('div', 'pn-cartao'); k.innerHTML = '<h3>Programa de Vigilância Fitossanitária – VIGIFITO</h3>' + tabela(cabV, R.vig.total.map((r, i) => ({ c: [esc(r.rotulo), esc(r.unid), seloFonte(r.fonte), val(R.vig.fixa[i].mes, r.unid), val(R.vig.volante[i].mes, r.unid), `<b>${val(r.mes, r.unid)}</b>`, val(r.acum, r.unid)] })), 'pn-rg-quadro'); sv.appendChild(k);
      }
      const s3 = P.secao(c, 'Seções III, IV e V — CFO/CFOC, PTV e educação sanitária', `Tabelas lançadas no Portal do Administrativo (${anual ? 'todos os meses' : `${RD.MESES[E.mes - 1]}/${E.ano}`}). A orientação nas barreiras vem do VIGIFITO.`);
      [['tab.cfo', 'CFO/CFOC emitidos (Seção III)'], ['tab.ptv', 'PTV emitidas (Seção IV)'], ['tab.educacao', 'Ações de educação sanitária (Seção V)']].forEach(([chave, tit]) => {
        const C = RD.TABS[chave], k = P.el('div', 'pn-cartao pn-rg-lista'); k.dataset.tab = chave;
        const meses = anual ? R.meses : [mm], linhas = [];
        meses.forEach(m => ((E.listas[chave] || {})[m] || []).forEach((x, i) => linhas.push({ c: (anual ? [esc(RD.MESES_CURTOS[+m - 1])] : [])
          .concat(C.map(([campo, , n]) => `<span data-tab="${chave}" data-mes="${m}" data-i="${i}" data-campo="${campo}">${esc(x[campo] == null || x[campo] === '' ? '—' : n ? F.num(x[campo], 2) : String(x[campo]))}</span>`)) })));
        const meta = meses.map(m => E.meta[m + '|' + chave]).filter(Boolean).sort((a, b) => b.em - a.em)[0];
        k.innerHTML = `<h3>${esc(tit)} †</h3><p class="pn-sub">${meta ? esc(`Lançado pelo Administrativo em ${P.fmt.data(P.diaManaus(meta.em))} ${P.horaManaus(meta.em)} por ${meta.usuario}.`) : 'Lançadas no Portal do Administrativo.'}</p>` +
          (linhas.length ? tabela((anual ? [{ r: 'Mês' }] : []).concat(C.map(([, r, n]) => ({ r, num: !!n }))), linhas) : '<p class="pn-vazio">Nenhuma linha lançada.</p>');
        s3.appendChild(k);
      });
    }
    const s6 = P.secao(c, `Seção ${soPce ? 'III' : 'VI'} — Plano de contingência HLB`, 'Números do e-GDV (grupo Citros) e armadilhas para Diaphorina citri (lançado no portal).');
    const H = R.hlb, h = P.el('div', 'pn-cartao');
    h.innerHTML = tabela([{ r: 'Indicador' }, { r: 'Valor', num: true }, { r: 'Fonte' }], [['Levantamentos de pragas dos citros', H.levantamentos, 'auto'], ['Viveiros inspecionados', H.viveiros, 'auto'],
      ['Propriedades com HLB detectado ou suspeito', H.hlb, 'auto'], ['Propriedades com Diaphorina citri detectada ou suspeita', H.diaphorina, 'auto']]
      .map(([a, v, f]) => ({ c: [esc(a), esc(F.int(v || 0)), seloFonte(f)] }))
      .concat([{ c: ['Armadilhas para Diaphorina citri † ' + (anual ? '(soma dos meses)' : ''), anual ? esc(H.armadilhas == null ? '—' : F.int(H.armadilhas)) : inp(mm, 'hlb.armadilhas', 'Armadilhas para Diaphorina citri'), seloFonte('manual')] }]));
    s6.appendChild(h);
    desenharTextosGdv(c, M);
    barra(c, false);
  }
  function desenharTextosGdv(c, M) {
    const st = P.secao(c, 'Textos do relatório', `${E.txtInfo.salvo ? 'Textos salvos deste relatório.' : E.txtInfo.origem === 'anterior' ? `Pré-preenchidos com os do relatório de ${E.txtInfo.anterior}.` : 'Textos-padrão (genéricos).'} Marcadores substituídos na geração: ${Object.keys(RD.MARCADORES).map(k => `{${k}}`).join(' ')}.`);
    const T = E.textos, form = P.el('div', 'pn-cartao pn-rg-textos');
    const ta = (k, rot, rows) => `<label class="pn-conv-campo pn-conv-largo">${esc(rot)}<textarea data-txt="${esc(k)}" rows="${rows || 3}" maxlength="8000">${esc(T[k] == null ? '' : T[k])}</textarea></label>`;
    const naoPce = E.rel === 'pce' ? ['vigifito', 'cfo', 'ptv', 'educacao'] : [];
    form.innerHTML = `<details class="pn-rg-marc"><summary>Marcadores automáticos (valores deste relatório)</summary><dl>${Object.entries(RD.MARCADORES).map(([k, d]) => `<div><dt>{${esc(k)}}</dt><dd>${esc(d)} = <b>${esc(M[k])}</b></dd></div>`).join('')}</dl></details>` +
      Object.entries(RD.ROTULOS_TXT).slice(0, 4).map(([k, r]) => ta(k, r, k === 'introducao' ? 5 : 3)).join('') +
      (cfg().grupos || []).map(g => { if (T['grupo_' + g.id] == null) T['grupo_' + g.id] = RD.textoGrupo(T, g); return ta('grupo_' + g.id, `1.2 – ${g.nome}`, 3); }).join('') +
      Object.entries(RD.ROTULOS_TXT).slice(4).filter(([k]) => !naoPce.includes(k)).map(([k, r]) => ta(k, r, k === 'conclusao' ? 5 : 3)).join('') + assinaturasHtml(true);
    st.appendChild(form);
  }
  function assinaturasHtml(anexo) {
    const T = E.textos, ass = (T.assinaturas || []).concat([{}, {}, {}]).slice(0, 3);
    return `<fieldset class="pn-conv-cfg-etapa"><legend>Local, assinaturas${anexo ? ' e anexo' : ''}</legend>
      <label class="pn-conv-campo">Local (data por extenso na geração)<input data-txt="local" maxlength="80" value="${esc(T.local || '')}"></label>
      ${ass.map((a, i) => `<div class="pn-conv-ass"><label class="pn-conv-campo">Nome ${i + 1}<input data-ass="${i}:nome" maxlength="100" value="${esc(a.nome || '')}"></label><label class="pn-conv-campo">Cargo<input data-ass="${i}:cargo" maxlength="140" value="${esc(a.cargo || '')}"></label></div>`).join('')}
      ${anexo ? `<label class="pn-rg-chk"><input type="checkbox" id="pn-rg-anexo" ${T.anexo ? 'checked' : ''}> Incluir o anexo por propriedade (produtor só com iniciais, CPF/CNPJ mascarado, coordenadas a 2 casas)</label>` : ''}</fieldset>`;
  }
  function barra(c, xlsx, semTextos) {
    const bar = P.el('div', 'pn-cartao pn-conv-rel-acoes pn-rg-acoes');
    bar.innerHTML = `${semTextos || !P.gerencia ? '' : '<button type="button" class="pn-btn" data-rg="salvar" id="pn-rg-salvar">Salvar textos</button>'}
      <button type="button" class="pn-btn pn-btn-prim" data-rg="docx" id="pn-rg-docx">Baixar Word (.docx)</button>
      <button type="button" class="pn-btn pn-btn-prim" data-rg="pdf" id="pn-rg-pdf">Baixar PDF</button>
      ${xlsx ? '<button type="button" class="pn-btn pn-btn-prim" data-rg="xlsx" id="pn-rg-xlsx">Baixar Excel (.xlsx)</button>' : ''}
      <button type="button" class="pn-btn" data-rg="imprimir" id="pn-rg-imprimir">Imprimir</button>
      ${semTextos ? '' : '<button type="button" class="pn-link" data-rg="padrao">Usar textos-padrão</button>'}
      <span class="pn-pub-msg${E.msg.cls ? ' ' + E.msg.cls : ''}" data-msg="rg" role="status">${esc(E.msg.t)}</span>`;
    c.appendChild(bar);
  }

  /* ---------------- VIGIFITO ---------------- */
  const MARCA = og => og.substituido ? ' ‡' : og.lancado && !og.auto ? ' †' : '';
  function desenharVig(c) {
    const R = E.VR, tot = k => R.tot(R.todos, k).v;
    P.kpis(c, [
      { rotulo: 'Veículos parados', valor: tot('veiculos') || 0, detalhe: `${F.int(tot('abordagem') || 0)} abordagem(ns) volante(s)` },
      { rotulo: 'Termos de fiscalização', valor: tot('tfs') || 0, detalhe: `${F.int(tot('apreensao') || 0)} apreensão(ões) · ${F.int(tot('liberacao') || 0)} liberação(ões)` },
      { rotulo: 'Educação sanitária', valor: tot('educacao') || 0, detalhe: `veículos orientados · ${F.int(tot('partidas') || 0)} partida(s) fiscalizada(s)` },
      { rotulo: 'Postos', valor: R.postos.length, detalhe: `${R.fixas.length} fixo(s) · ${R.volantes.length} volante(s)` },
      { rotulo: 'Substituições do e-GDV', valor: R.substituicoes.length, detalhe: 'valores lançados no lugar do apurado', status: R.substituicoes.length ? 'atencao' : null }
    ]);
    P.alertas(P.secao(c, 'Avisos de consistência', 'Postos não mapeados, valores fora do padrão (t muito acima da média do posto), unidades sem conversão, substituições e linhas manuais vazias.'), R.avisos, { vazio: 'Nenhum aviso. ✓', max: 8 });
    const s = P.secao(c, `Quadro por posto — ${R.rotulo}`, 'Sem marca: e-GDV. † lançado pelo Administrativo. ‡ lançado no lugar do e-GDV. "—" sem lançamento.');
    const cab = [{ r: 'Indicador' }, { r: 'Unid.' }].concat(R.grupos.map(g => ({ r: g.rotulo, num: true })));
    const k = P.el('div', 'pn-cartao'); k.id = 'pn-vig-quadro';
    k.innerHTML = tabela(cab, IND.VIGIFITO.map(d => ({ c: [esc(d.rotuloPlanilha === null ? `(${d.unid})` : d.rotulo), esc(d.unid)].concat(R.grupos.map(g => { const x = R.tot(g.ids, d.k);
      return `<span data-vig="${esc(g.id)}|${d.k}"${g.tipo !== 'posto' ? ' class="pn-rg-tot"' : ''}>${esc(VD.valorTxt(x.v, d.unid) + MARCA(x.origens))}</span>`; })) })), 'pn-rg-quadro');
    s.appendChild(k);
    if (R.tipo === 'anual' || R.tipo === 'semestral') {
      const k2 = P.el('div', 'pn-cartao');
      k2.innerHTML = '<h3>Total consolidado mês a mês</h3>' + tabela([{ r: 'Indicador' }, { r: 'Unid.' }].concat(R.colunas.map(m => ({ r: VD.CURTOS[+m.slice(5, 7) - 1], num: true }))).concat([{ r: 'Total', num: true }]),
        IND.VIGIFITO.map(d => ({ c: [esc(d.rotuloPlanilha === null ? `(${d.unid})` : d.rotulo), esc(d.unid)].concat(R.colunas.map(m => esc(R.futuro(m) ? '' : VD.valorTxt(R.tot(R.todos, d.k, [m]).v, d.unid)))).concat([`<b>${esc(VD.valorTxt(R.tot(R.todos, d.k).v, d.unid))}</b>`]) })), 'pn-rg-quadro');
      s.appendChild(k2);
    }
    const st = P.secao(c, 'Textos do relatório VIGIFITO', E.txtInfo.salvo ? 'Textos salvos deste relatório.' : E.txtInfo.origem === 'anterior' ? 'Pré-preenchidos com os do último relatório VIGIFITO salvo.' : 'Texto-padrão. Marcador: {periodo}.');
    const T = E.textos, form = P.el('div', 'pn-cartao pn-rg-textos');
    form.innerHTML = `<label class="pn-conv-campo pn-conv-largo">Apresentação<textarea data-txt="vig_intro" rows="4" maxlength="8000">${esc(T.vig_intro || '')}</textarea></label>
      <label class="pn-conv-campo pn-conv-largo">Observações (opcional)<textarea data-txt="vig_obs" rows="3" maxlength="8000">${esc(T.vig_obs || '')}</textarea></label>` + assinaturasHtml(false);
    st.appendChild(form);
    barra(c, true);
  }
  /** Diálogo "Postos do VIGIFITO": correspondência posto → BVA (locais do turno) / município, tipo, e a escala dos períodos de 10 dias. */
  function dialogoPostos() {
    const vd = E.vig[E.ano]; if (!vd) return;
    const c = JSON.parse(JSON.stringify(vd.cfg)), velho = document.getElementById('pn-vig-cfg'); if (velho) velho.remove();
    const dlg = P.el('dialog', 'pn-dlg pn-conv-dlg'); dlg.id = 'pn-vig-cfg';
    const linha = (p, i) => `<div class="pn-conv-sub" data-i="${i}"><label>Id<input data-k="id" maxlength="40" value="${esc(p.id || '')}"></label><label>Nome no relatório<input data-k="nome" maxlength="80" value="${esc(p.nome || '')}"></label>
      <label>Município<input data-k="municipio" maxlength="60" value="${esc(p.municipio || '')}"></label><label>Tipo<select data-k="tipo"><option value="fixa" ${p.tipo === 'fixa' ? 'selected' : ''}>BVA fixa</option><option value="volante" ${p.tipo === 'volante' ? 'selected' : ''}>Volante</option></select></label>
      <label>BVAs/locais do turno (fixa; separe com ;)<input data-k="locais" maxlength="300" value="${esc((p.locais || []).join('; '))}"></label><button type="button" class="pn-btn pn-btn-mini" data-rm>Remover</button></div>`;
    dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>Postos do VIGIFITO</h3>
      <p class="pn-sub">Turnos de BVA fixa entram no posto cujo "BVAs/locais" tem o local do turno (nomes de CONFIG.bvas / aba Barreiras: ${esc(((typeof CONFIG !== 'undefined' && CONFIG.bvas) || []).map(b => b.nome).join(', '))}); turnos volantes, no posto volante do município do turno. Sem posto: "outras (não mapeadas)", com aviso.</p>
      <div class="pn-conv-cfg-grade"><label class="pn-conv-campo">Escala: data-âncora (início do período 1)<input id="pn-vig-ancora" type="date" value="${esc(c.ancora)}"></label><label class="pn-conv-campo">Ciclo (dias)<input id="pn-vig-ciclo" inputmode="numeric" maxlength="2" value="${esc(c.ciclo)}"></label></div>
      <div class="pn-conv-subs" id="pn-vig-postos-lista">${c.postos.map(linha).join('')}</div><button type="button" class="pn-btn pn-btn-mini" data-add>Adicionar posto</button>
      <p class="pn-dlg-erro" id="pn-vig-cfg-erro" role="alert"></p>
      <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-vig-cfg-cancelar">Cancelar</button><button type="submit" class="pn-btn pn-btn-prim" id="pn-vig-cfg-salvar">Salvar</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => {
      if (e.target.closest('[data-add]')) dlg.querySelector('#pn-vig-postos-lista').insertAdjacentHTML('beforeend', linha({ tipo: 'volante' }, dlg.querySelectorAll('.pn-conv-sub').length));
      const rm = e.target.closest('[data-rm]'); if (rm) rm.closest('.pn-conv-sub').remove();
    });
    dlg.querySelector('#pn-vig-cfg-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const postos = [...dlg.querySelectorAll('.pn-conv-sub')].map(d => { const g = k => d.querySelector(`[data-k=${k}]`).value.trim();
        return { id: g('id'), nome: g('nome'), municipio: g('municipio'), tipo: g('tipo'), locais: g('locais').split(/[;\n]/).map(s => s.trim()).filter(Boolean) }; });
      const b = dlg.querySelector('#pn-vig-cfg-salvar'); b.disabled = true;
      try {
        await P.chamar({ action: 'painelVigConfigSalvar', config: { ancora: dlg.querySelector('#pn-vig-ancora').value, ciclo: Number(dlg.querySelector('#pn-vig-ciclo').value), postos } });
        dlg.close(); E.vig = {}; carregar(true);
      } catch (err) { if (!P.logado) return; dlg.querySelector('#pn-vig-cfg-erro').textContent = 'Não salvou: ' + err.message; b.disabled = false; }
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ---------------- Convênio ---------------- */
  function desenharConv(c) {
    const R = E.CR;
    P.kpis(c, [{ rotulo: 'Esperado pelo tempo', valor: CD.fmt.pct(R.esperado) }, { rotulo: 'Execução financeira', valor: CD.fmt.pct(R.fin.total.pct), detalhe: `${CD.fmt.moeda(R.fin.total.acum)} de ${CD.fmt.moeda(R.fin.total.previsto)}` },
      { rotulo: 'Etapas atrasadas', valor: R.etapas.filter(r => r.situacao === 'atrasada').length, detalhe: `de ${R.etapas.length}` },
      consolConv() ? { rotulo: 'Consolidado', valor: 'Total', detalhe: `${CD.fmt.data(R.cfg.inicioExecucao)} a ${CD.fmt.data(hoje())}` } : { rotulo: 'Parcial nº', valor: CD.textosIniciais(R.cfg, E.conv.relatorios, E.cmes).numero }]);
    const consol = consolConv();
    const s = P.secao(c, consol ? `Metas — consolidado até ${CD.fmt.data(hoje())}` : 'Metas no mês de referência', 'Os mesmos números da aba Convênios (motor de metas do convênio). Os textos do relatório (por etapa e gerais) são editados na aba Convênios → Relatório; aqui o relatório é gerado com os textos salvos.');
    const k = P.el('div', 'pn-cartao');
    k.innerHTML = tabela([{ r: 'Etapa' }, { r: 'Previsto', num: true }].concat(consol ? [] : [{ r: 'No mês', num: true }]).concat([{ r: 'Acumulado', num: true }, { r: '%', num: true }, { r: 'Situação' }]),
      R.etapas.map(r => ({ c: [esc(`${r.id} ${r.nomeCurto}`), esc(r.previstoTxt)].concat(consol ? [] : [esc(r.mesTxt)]).concat([esc(r.acumTxt), esc(CD.fmt.pct(r.pct)), esc(r.situacaoTxt)]) }))) +
      '<p><button type="button" class="pn-link" data-rg="ir-conv">Editar os textos na aba Convênios ›</button></p>';
    s.appendChild(k);
    barra(c, false, true);
  }

  /* ---------------- salvar e gerar ---------------- */
  async function salvar(silencioso) {
    if (E.rel === 'convenio' || !P.gerencia) return true;         // sem gerência o painel é só de leitura: gera o relatório sem guardar os textos
    if (!silencioso) setMsg('Salvando…', '');
    try {
      const t = { ...E.textos, assinaturas: (E.textos.assinaturas || []).slice(0, 3) };
      const vig = E.rel === 'vigifito';
      if (vig) Object.keys(t).forEach(k => { if (!['vig_intro', 'vig_obs', 'assinaturas', 'local'].includes(k)) delete t[k]; });
      const j = await P.chamar({ action: 'painelRelGdvSalvar', ano: E.ano, tipo: vig ? 'vigifito' : E.tipo, mes: vig ? vigChave() : pad2(E.mes), textos: t });
      const d = E.dados[E.ano];
      if (j.textos) { const i = d.textos.findIndex(x => x.id === j.textos.id); if (i >= 0) d.textos[i] = j.textos; else d.textos.push(j.textos); E.txtInfo = { ...E.txtInfo, salvo: true, origem: 'salvo' }; }
      setMsg('Textos salvos ✓', 'ok');
      if (!silencioso) desenharEdicao();
      return true;
    } catch (e) { if (P.logado) setMsg('Não salvou: ' + e.message, 'erro'); return false; }
  }
  function nomeArq(ext) {
    if (E.rel === 'vigifito') return VD.nomeArquivo(E.VR, ext);
    if (E.rel === 'convenio') { const c = cfgConv(); if (consolConv()) return `Relatorio_Convenio_${c.numero.replace(/\W+/g, '-')}_Consolidado_ate_${hoje()}.${ext}`; return `Relatorio_Convenio_${c.numero.replace(/\W+/g, '-')}_Parcial_${CD.textosIniciais(c, E.conv.relatorios, E.cmes).numero}_${E.cmes}.${ext}`; }
    const pre = E.rel === 'pce' ? 'Relatorio_PCE' : 'Relatorio_GDV';
    return (E.tipo === 'mensal' ? `${pre}_Parcial_${E.ano}-${pad2(E.mes)}` : `${pre}_${E.ano}_Consolidado`) + '.' + ext;
  }
  function baixarBlob(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
  const bytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('Não foi possível carregar ' + src)); }; document.head.appendChild(s); });
  /** Blocos do relatório escolhido (os mesmos para Word e PDF). */
  async function montarBlocos() {
    recalcular();
    if (E.rel === 'vigifito') return VD.blocos(E.VR, E.textos, { dataEmissao: hoje() });
    if (E.rel === 'convenio') { const c = cfgConv(), t = CD.textosIniciais(c, E.conv.relatorios, cmesEf(c)); return CD.blocos(E.CR, t.textos, { numero: t.numero, dataEmissao: hoje(), consolidado: consolConv(), ate: hoje() }); }
    const geo = await P.carregarGeo(), mapas = {};
    E.R.grupos.forEach(G => { if (Object.keys(G.niveis).length) mapas[G.g.id] = RD.mapa(geo, G.niveis); });
    const o = { dataEmissao: hoje(), mapas, anexo: !!E.textos.anexo, pce: E.rel === 'pce' };
    if (E.rel === 'consolidado' && VD && E.vig[E.ano]) o.vigBlocos = E.tipo === 'anual' ? VD.blocos(vigCalc('anual'), E.textos, { secao: true, semOrientacao: true })
      : VD.blocos(vigCalc('mensal', { mes: E.mes }), E.textos, { secao: true });
    return RD.blocos(E.R, E.textos, o);
  }
  async function gerar(tipo) {
    if (E.gerando || !(E.R || E.VR || E.CR)) return; E.gerando = true;
    const botoes = [...E.raiz.querySelectorAll('.pn-rg-acoes button')]; botoes.forEach(b => { b.disabled = true; });
    try {
      if (!(await salvar(true))) return;
      if (tipo === 'xlsx') {
        setMsg('Gerando o Excel…', '');
        if (typeof window.XLSX === 'undefined') await script(XLSX_SRC);
        const wb = VD.xlsx(E.VR, window.XLSX), buf = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        E.ultimoXlsx = true;
        baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArq('xlsx')); setMsg('Excel gerado ✓', 'ok');
        return;
      }
      const B = await montarBlocos();
      E.ultimosBlocos = B;
      if (tipo === 'docx') {
        setMsg('Gerando o Word…', '');
        const [cab, adaf, sepror] = await Promise.all([bytes('../img/brasao.png'), bytes('../img/logo-adaf.png'), bytes('../img/sepror.png')]);
        const blob = DocxMin.criar({ blocos: B, titulo: E.rel === 'convenio' ? titulo() : B[0].texto, autor: P.usuario || 'e-GDV', cabecalho: cab, rodape: [adaf, sepror],
          cabecalhoTexto: ['GOVERNO DO ESTADO DO AMAZONAS', 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF'] });
        baixarBlob(blob, nomeArq('docx')); setMsg('Word gerado ✓', 'ok');
      } else {
        setMsg(tipo === 'pdf' ? 'Gerando o PDF…' : 'Abrindo a impressão…', '');
        const conv = E.rel === 'convenio', fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0'; fr.title = 'Relatório';
        await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.src = conv ? '../documentos/conv-relatorio.html' : '../documentos/relgdv-relatorio.html'; document.body.appendChild(fr); });
        const w = fr.contentWindow, d = fr.contentDocument;
        for (let i = 0; i < 50 && !(conv ? w.ConvDocs : w.RelGdvDocs); i++) await new Promise(r => setTimeout(r, 50));
        if (conv) w.ConvDocs.html(d, d.getElementById('corpo'), B); else w.RelGdvDocs.html(d, B);
        await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
        const nome = nomeArq('pdf').replace(/\.pdf$/, ''); d.title = nome;
        if (tipo === 'imprimir') {
          const tt = document.title; document.title = nome;
          w.addEventListener('afterprint', () => { document.title = tt; fr.remove(); });
          w.focus(); w.print(); setMsg('', '');
        } else {
          if (typeof window.html2canvas !== 'function') await script('../vendor/html2canvas.min.js');
          if (typeof PDF === 'undefined') await script('../js/pdf.js');
          const arq = await PDF.deFrame(fr, nome);
          baixarBlob(arq, arq.name); setMsg('PDF gerado ✓', 'ok');
        }
      }
    } catch (e) { setMsg('Falha ao gerar: ' + e.message, 'erro'); }
    finally { E.gerando = false; botoes.forEach(b => { b.disabled = false; }); }
  }

  /* ---------------- registro ---------------- */
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); desenhar(); }
    c.appendChild(E.raiz);
    if (!E.carregando && !E.erro && !(E.R || E.VR || E.CR)) carregar();
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, dados: {}, ap: {}, vig: {}, conv: null, capur: {}, R: null, VR: null, CR: null, erro: '', textos: null, chaveTxt: '', L: null, listas: null, anoEstado: 0, msg: { t: '', cls: '' } }); });
  P.registrarAba({ id: 'relatorios', titulo: 'Relatórios', render, semFiltros: true,
    contador: () => (E.R ? E.R.avisos.filter(a => a.nivel === 'critico').length : 0),
    /** usados pelos testes: estado calculado, blocos do último relatório gerado e recarga */
    estado: () => ({ rel: E.rel, R: E.R, VR: E.VR, CR: E.CR, tipo: E.tipo, ano: E.ano, mes: E.mes, vmodo: E.vmodo, vper: E.vper, vsem: E.vsem, textos: E.textos, L: E.L, listas: E.listas, dados: E.dados[E.ano], vig: E.vig[E.ano], blocos: E.ultimosBlocos, carregando: E.carregando }),
    montarBlocos, recarregar: () => carregar(true) });
})();
