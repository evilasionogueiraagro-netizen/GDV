/* Portal do Administrativo — "VIGIFITO": valores por posto × mês (ou por período de 10 dias da escala) dos indicadores da planilha de
   controle. Quase tudo é apurado pelo e-GDV a partir do app das barreiras (veículos e a carga registrada neles — partidas, inspeção,
   cargas, internalização/importação/exportação, educação sanitária, medida fitossanitária —, TFs e o que resultaram, amostras,
   abordagem volante): essas linhas aparecem com o valor do e-GDV e aceitam um valor que o SUBSTITUI, com justificativa
   (meses anteriores ao e-GDV ou correção). Validações na hora: sem negativos, contagens inteiras, t/m³ com até 3 casas e aviso de valor
   fora do padrão (t/m³ muito acima da média do posto). Manuais só: capacitação técnica e exportação de madeira (m³). Importação da
   planilha de controle antiga (.xlsx, histórico de 2025) com prévia (js/vig-planilha.js). Importação do relatório de plantão do papel da BVA
   ("Relatório Diário de Trânsito Interestadual", .xls/.xlsx; js/plantao-planilha.js): vira turnos e veículos da BVA, como o app.
   Actions admVigDados, admVigLancar, admVigImportar e admPlantaoImportar. Os relatórios VIGIFITO saem do painel (Central de relatórios). */
(() => {
  'use strict';
  if (typeof Adm === 'undefined' || typeof Indicadores === 'undefined') return;
  const A = Adm, esc = A.esc, IND = Indicadores, F = A.fmt;
  const XLSX_SRC = '../painel/vendor/xlsx/xlsx.mini.min.js', XLSX_CORE = '../painel/vendor/xlsx/xlsx.core.min.js', LOTE = 1000;   // core: também lê .xls
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const pad2 = n => String(n).padStart(2, '0');
  const anoHoje = () => Number(A.hoje().slice(0, 4));
  const E = { ano: anoHoje(), modo: 'mes', mes: Number(A.hoje().slice(5, 7)), periodo: '', dados: {}, edit: {}, just: '', msg: { t: '', cls: '' }, imp: null, impMsg: { t: '', cls: '' }, plt: null, pltMsg: { t: '', cls: '' }, raiz: null, erro: '' };
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : NaN; };
  const D = () => E.dados[E.ano];
  const perAtual = () => E.modo === 'mes' ? `${E.ano}-${pad2(E.mes)}` : 'P' + E.periodo;
  const vt = (v, u) => v == null ? '' : u === 'nº' ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000).replace('.', ',');

  async function carregar(forcar) {
    E.erro = '';
    try { if (!D() || forcar) E.dados[E.ano] = await A.chamar({ action: 'admVigDados', ano: E.ano }); }
    catch (e) { E.erro = e.message; }
    desenhar();
  }
  const lancDe = (per, posto, k) => (D().lancamentos || []).find(l => l.periodo === per && l.posto === posto && l.indicador === k);
  const autoDe = (per, posto, k) => { const ap = D().apuracao, G = per.charAt(0) === 'P' ? (ap.porPeriodo || {})[posto] : (ap.porMes || {})[posto]; const x = G && G[per.charAt(0) === 'P' ? per.slice(1) : per]; return x ? Number(x[k] || 0) : 0; };
  /** Validação de uma célula digitada: '' (apagar) ou número ≥ 0; nº inteiro; t/m³ até 3 casas. Devolve a mensagem de erro ou ''. */
  function erroCel(d, txt) {
    if (txt === '') return '';
    const n = numSimples(txt);
    if (n == null || isNaN(n)) return 'não é número';
    if (n < 0) return 'negativo';
    if (d.unid === 'nº' && Math.round(n) !== n) return 'contagem com decimal';
    if (d.unid !== 'nº' && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return 'mais de 3 casas';
    return '';
  }
  /** Média do posto nos outros meses do ano (t/m³) para o aviso de valor fora do padrão. */
  function foraDoPadrao(d, posto, per, v) {
    if (d.unid === 'nº' || per.charAt(0) === 'P' || !(v > 1)) return '';
    const outros = [...Array(12).keys()].map(i => `${E.ano}-${pad2(i + 1)}`).filter(m => m !== per).map(m => { const l = lancDe(m, posto, d.k); return l ? Number(l.valor) : (d.fonte === 'auto' ? autoDe(m, posto, d.k) : null); }).filter(x => x > 0);
    if (outros.length < 2) return '';
    const media = outros.reduce((s, x) => s + x, 0) / outros.length;
    return v > 3 * media && v - media > 1 ? `valor fora do padrão: ${vt(v, d.unid)} ${d.unid} × média ${vt(media, d.unid)} nos outros meses (lançou em kg? use t)` : '';
  }

  function desenhar() {
    const r = E.raiz; if (!r) return;
    const anos = [anoHoje() - 2, anoHoje() - 1, anoHoje()];
    const d = D(), cfg = d && d.cfg;
    const pers = cfg && typeof VigDocs !== 'undefined' ? VigDocs.periodosDoAno(cfg.ancora, cfg.ciclo, E.ano).filter(p => p.inicio <= A.hoje()) : [];
    if (E.modo === 'periodo' && pers.length && !pers.some(p => p.inicio === E.periodo)) E.periodo = pers[pers.length - 1].inicio;
    r.innerHTML = `<div class="pn-cartao pn-rg-topo"><div class="pn-conv-sel">
        <label>Ano<select id="adm-vig-ano">${anos.map(a => `<option ${a === E.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Lançar por<select id="adm-vig-modo"><option value="mes" ${E.modo === 'mes' ? 'selected' : ''}>Mês</option><option value="periodo" ${E.modo === 'periodo' ? 'selected' : ''}>Período de 10 dias</option></select></label>
        ${E.modo === 'mes' ? `<label>Mês<select id="adm-vig-mes">${MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === E.mes ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
          : `<label>Período<select id="adm-vig-per">${pers.map(p => `<option value="${p.inicio}" ${p.inicio === E.periodo ? 'selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></label>`}</div>
        <h3 class="pn-conv-nome">VIGIFITO — ${E.modo === 'mes' ? `${MESES[E.mes - 1]}/${E.ano}` : esc((pers.find(p => p.inicio === E.periodo) || {}).rotulo || '')}</h3>
        <p class="pn-sub">Quase tudo vem do app das barreiras (veículos, carga registrada no veículo e TFs). Linhas manuais (só capacitação técnica e exportação de madeira em m³): digite o valor de cada posto. Linhas do e-GDV (fundo cinza): o número apurado aparece embaixo; digite só para SUBSTITUIR (meses anteriores ao e-GDV ou correção), com justificativa. Contagens em números inteiros; toneladas (t) e m³ com até 3 casas — nunca em kg. ${cfg ? `Escala dos períodos de 10 dias: a partir de ${esc(F.data(cfg.ancora))}, troca a cada ${cfg.ciclo} dias; o registro conta pela data de início do turno.` : ''}</p></div>
      ${E.erro ? `<p class="pn-erro" role="alert">${esc(E.erro)}${/a[çc][ãa]o inv[áa]lida/i.test(E.erro) ? ' — o servidor ainda está com o Code.gs antigo.' : ''}</p>` : ''}<div id="adm-vig-corpo"></div>`;
    const c = r.querySelector('#adm-vig-corpo');
    if (!d) { A.vazio(c, E.erro ? 'Sem dados.' : 'Carregando…'); return; }
    const per = perAtual(), postos = cfg.postos;
    const s = A.secao(c, 'Valores por posto', `${postos.length} postos (lista configurada no painel → Relatórios → Postos do VIGIFITO).`);
    const k = A.el('div', 'pn-cartao');
    const cab = `<tr><th scope="col">Indicador</th><th scope="col">Unid.</th>${postos.map(p => `<th scope="col" class="num">${esc(p.nome)}</th>`).join('')}</tr>`;
    const linhas = IND.VIGIFITO.map(dd => `<tr><td>${esc(dd.rotuloPlanilha === null ? `(${dd.unid})` : dd.rotulo)}</td><td>${esc(dd.unid)}</td>${postos.map(p => {
      const l = lancDe(per, p.id, dd.k), ch = `${per}|${p.id}|${dd.k}`, ed = E.edit[ch];
      const val = ed != null ? ed : l ? vt(Number(l.valor), dd.unid) : '';
      const auto = dd.fonte === 'auto', erro = erroCel(dd, val), fora = !erro && val !== '' ? foraDoPadrao(dd, p.id, per, numSimples(val)) : '';
      const tit = l ? `lançado por ${l.usuario} em ${F.dataHora(l.atualizadoEm)}${l.origem === 'planilha' ? ' (planilha)' : ''}${l.justificativa ? ' — ' + l.justificativa : ''}` : auto ? 'apurado pelo e-GDV' : 'sem lançamento';
      return `<td class="num${auto ? ' auto' : ''}"><input data-vig="${esc(ch)}" inputmode="decimal" maxlength="14" class="${auto && val !== '' ? 'subst' : ''}${erro ? ' erro' : ''}" aria-label="${esc(dd.rotulo + ' ' + dd.unid + ' – ' + p.nome)}" title="${esc(tit)}" value="${esc(val)}" ${auto ? `placeholder="${esc(vt(autoDe(per, p.id, dd.k), dd.unid))}"` : ''}>` +
        (auto ? `<small>e-GDV: ${esc(vt(autoDe(per, p.id, dd.k), dd.unid))}</small>` : '') + (erro ? `<small class="pn-erro-txt" data-erro>${esc(erro)}</small>` : fora ? `<small class="pn-aviso-txt" data-fora>${esc(fora)}</small>` : '') + '</td>';
    }).join('')}</tr>`).join('');
    k.innerHTML = `<div class="pn-tab adm-vig-grade" id="adm-vig-grade"><div class="pn-tab-rolo"><table><thead>${cab}</thead><tbody>${linhas}</tbody></table></div></div>`;
    s.appendChild(k);
    const subst = Object.keys(E.edit).some(ch => IND.PORK[ch.split('|')[2]].fonte === 'auto' && E.edit[ch] !== '' && ch.indexOf(per + '|') === 0);
    const bar = A.el('div', 'pn-cartao pn-conv-form');
    bar.innerHTML = `<label class="pn-conv-campo pn-conv-largo" ${subst ? '' : 'hidden'} id="adm-vig-just-box">Justificativa das substituições do e-GDV (obrigatória)<textarea id="adm-vig-just" rows="2" maxlength="300" placeholder="Ex.: mês anterior ao e-GDV (dados da planilha de controle)">${esc(E.just)}</textarea></label>
      <div class="pn-conv-acoes pn-conv-largo"><button type="button" class="pn-btn pn-btn-prim" id="adm-vig-salvar">Gravar valores</button><span class="pn-pub-msg${E.msg.cls ? ' ' + E.msg.cls : ''}" data-msg="vig" role="status">${esc(E.msg.t)}</span></div>`;
    s.appendChild(bar);
    secaoImp(c);
    secaoPlt(c);
  }
  /** Validação de uma célula no lugar (erro: negativo, decimal em contagem, mais de 3 casas; aviso: fora do padrão). */
  function validarCel(inp) {
    const [per, posto, k] = inp.dataset.vig.split('|'), d = IND.PORK[k], td = inp.closest('td'), val = inp.value.trim();
    td.querySelectorAll('[data-erro],[data-fora]').forEach(x => x.remove());
    const erro = erroCel(d, val), fora = !erro && val !== '' ? foraDoPadrao(d, posto, per, numSimples(val)) : '';
    inp.classList.toggle('erro', !!erro); inp.classList.toggle('subst', d.fonte === 'auto' && val !== '');
    if (erro || fora) td.insertAdjacentHTML('beforeend', erro ? `<small class="pn-erro-txt" data-erro>${esc(erro)}</small>` : `<small class="pn-aviso-txt" data-fora>${esc(fora)}</small>`);
  }
  function setMsg(t, cls) { E.msg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=vig]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  async function salvar() {
    const per = perAtual(), env = [];
    for (const ch of Object.keys(E.edit)) {
      if (ch.indexOf(per + '|') !== 0) continue;
      const [, posto, k] = ch.split('|'), d = IND.PORK[k], txt = String(E.edit[ch]).trim(), l = lancDe(per, posto, k);
      const er = erroCel(d, txt); if (er) return setMsg(`Corrija: ${d.rotulo} (${d.unid}) – ${(D().cfg.postos.find(p => p.id === posto) || {}).nome}: ${er}.`, 'erro');
      const v = txt === '' ? '' : numSimples(txt);
      if (v === '' && !l) continue;
      if (l && v !== '' && Number(l.valor) === v && (d.fonte === 'manual' || !E.just || E.just === l.justificativa)) continue;
      env.push({ periodo: per, posto, indicador: k, valor: v, justificativa: d.fonte === 'auto' && v !== '' ? (E.just || (l && l.justificativa) || '') : '' });
    }
    if (!env.length) return setMsg('Nada mudou.', '');
    if (env.some(x => IND.PORK[x.indicador].fonte === 'auto' && x.valor !== '' && String(x.justificativa).trim().length < 5)) return setMsg('Substituição de valor do e-GDV exige justificativa.', 'erro');
    setMsg('Gravando…', '');
    try {
      const j = await A.chamar({ action: 'admVigLancar', lancamentos: env });
      E.edit = {}; E.just = '';
      E.dados[E.ano] = await A.chamar({ action: 'admVigDados', ano: E.ano });
      E.msg = { t: `Gravado ✓ ${j.novos} novo(s), ${j.atualizados} alterado(s), ${j.excluidos} apagado(s).`, cls: 'ok' }; desenhar();
    } catch (e) { if (A.logado) setMsg('Não gravou: ' + e.message, 'erro'); }
  }

  /* ---------------- importação da planilha de controle ---------------- */
  function secaoImp(c) {
    const s = A.secao(c, 'Importar a planilha de controle VIGIFITO antiga (.xlsx) — histórico', 'Para meses anteriores ao e-GDV (ex.: 2025). Aba de postos × meses (como "VIGIFITO") e abas de períodos de 10 dias por posto (como "JUNDIÁ"). Grava os valores como lançados (linhas apuradas pelo e-GDV: como substituição); totais e semestres não são importados — saem do sistema. Reimportar não duplica.');
    const box = A.el('div', 'pn-cartao pn-conv-imp');
    box.innerHTML = `<div class="pn-conv-acoes"><label class="pn-btn pn-btn-prim pn-conv-imp-btn" for="adm-vig-imp-arq">📥 Importar planilha VIGIFITO (.xlsx)</label>
      <input type="file" id="adm-vig-imp-arq" accept=".xlsx" class="pn-conv-imp-arq"><span class="pn-pub-msg${E.impMsg.cls ? ' ' + E.impMsg.cls : ''}" data-msg="vigimp" role="status">${esc(E.impMsg.t)}</span></div>
      <div id="adm-vig-imp-previa"></div>`;
    s.appendChild(box);
    desenharImp();
  }
  function msgImp(t, cls) { E.impMsg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=vigimp]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  async function lerPlanilha(arq) {
    msgImp(`Lendo ${arq.name}…`, '');
    try {
      if (!/\.xlsx$/i.test(arq.name)) throw new Error('escolha um arquivo .xlsx');
      if (arq.size > 15e6) throw new Error('arquivo grande demais (máx. 15 MB)');
      if (typeof window.XLSX === 'undefined') await A.script(XLSX_SRC);
      const wb = window.XLSX.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
      const abas = VigPlanilha.abasDoLivro(window.XLSX, wb), ano = VigPlanilha.anoProvavel(abas, arq.name, A.hoje());
      if (!E.dados[ano]) E.dados[ano] = await A.chamar({ action: 'admVigDados', ano });
      E.imp = { arquivo: arq.name, abas, ano, semAuto: false };
      previaImp();
      msgImp(`${arq.name}: ${E.imp.P.totais.valores} valor(es) de ${ano}. Confira a prévia e grave.`, 'ok');
    } catch (e) { E.imp = null; msgImp('Não foi possível ler a planilha: ' + e.message, 'erro'); }
    desenharImp();
  }
  function previaImp() {
    const I = E.imp, cfg = E.dados[I.ano].cfg;
    I.ext = VigPlanilha.extrair(I.abas, cfg, I.ano, { semAuto: I.semAuto });
    I.P = VigPlanilha.previa(I.ext, E.dados[I.ano].lancamentos);
  }
  function desenharImp() {
    const box = E.raiz && E.raiz.querySelector('#adm-vig-imp-previa'); if (!box) return;
    box.innerHTML = '';
    if (!E.imp) return;
    const I = E.imp, X = I.P, T = X.totais;
    const pv = A.el('div', 'pn-conv-imp-pv'); pv.id = 'adm-vig-imp-pv'; box.appendChild(pv);
    pv.appendChild(A.el('h3', null, esc(`Prévia — ${I.arquivo} (${I.ano})`)));
    const anos = [anoHoje() - 3, anoHoje() - 2, anoHoje() - 1, anoHoje()];
    const op = A.el('div', 'adm-filtro');
    op.innerHTML = `<label class="pn-conv-campo">Ano dos meses<select id="adm-vig-imp-ano">${anos.map(a => `<option ${a === I.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="pn-rg-chk"><input type="checkbox" id="adm-vig-imp-semauto" ${I.semAuto ? 'checked' : ''}> Não importar as linhas apuradas pelo e-GDV (veículos, TFs, amostras, educação sanitária)</label>`;
    pv.appendChild(op);
    A.kpis(pv, [{ rotulo: 'Valores na planilha', valor: F.int(T.valores), detalhe: `${X.abas.map(a => `${a.nome}: ${a.valores}`).join(' · ')}${X.ignoradas.length ? ` · abas fora: ${X.ignoradas.join(', ')}` : ''}` },
      { rotulo: 'Novos', valor: F.int(T.novos) }, { rotulo: 'Alterados', valor: F.int(T.alterados), status: T.alterados ? 'atencao' : null }, { rotulo: 'Iguais', valor: F.int(T.iguais), detalhe: 'já no sistema' },
      { rotulo: 'Bloqueados', valor: F.int(T.bloqueados), detalhe: 'negativos, decimais em contagem', status: T.bloqueados ? 'serio' : null },
      { rotulo: 'Substituem o e-GDV', valor: F.int(T.auto), detalhe: 'linhas apuradas pelo e-GDV (≠ 0)' }]);
    A.alertas(pv, X.avisos.map(a => ({ nivel: a.nivel, titulo: a.texto })), { vazio: 'Nenhum aviso. ✓', max: 12 });
    const det = A.el('details', 'pn-conv-imp-linhas'); det.innerHTML = '<summary>Ver os valores bloqueados e com aviso</summary>'; pv.appendChild(det);
    A.tabela(det, [{ chave: 'aba', rotulo: 'Aba' }, { chave: 'linha', rotulo: 'Linha', num: true, fmt: F.int }, { chave: 'postoNome', rotulo: 'Posto' }, { chave: 'periodo', rotulo: 'Período' },
      { chave: 'rotulo', rotulo: 'Indicador', fmt: (x, l) => `${x}${l.unid !== 'nº' ? ' (' + l.unid + ')' : ''}` }, { chave: 'valor', rotulo: 'Valor', num: true, fmt: x => F.num(x, 4) },
      { chave: 'bloqueio', rotulo: 'Situação', fmt: (x, l) => x || l.avisos.join('; ') || l.status }], X.itens.filter(x => x.bloqueio || x.avisos.length), { id: 'vig-imp-linhas', limite: 30, simples: true, vazio: 'Nenhum.' });
    const ac = A.el('div', 'pn-conv-acoes');
    ac.innerHTML = `<button type="button" class="pn-btn pn-btn-prim" id="adm-vig-imp-gravar" ${X.envio.length ? '' : 'disabled'}>${X.envio.length ? `Gravar ${X.envio.length} valor(es)` : 'Nada novo para gravar'}</button><button type="button" class="pn-btn" id="adm-vig-imp-cancelar">Cancelar</button>`;
    pv.appendChild(ac);
  }
  async function gravarImp() {
    const I = E.imp; if (!I || I.enviando) return;
    const env = I.P.envio, tot = { novos: 0, atualizados: 0, iguais: 0 };
    I.enviando = true; const b = E.raiz.querySelector('#adm-vig-imp-gravar'); if (b) b.disabled = true;
    try {
      for (let i = 0; i < env.length; i += LOTE) {
        msgImp(`Gravando… ${Math.min(i + LOTE, env.length)} de ${env.length}`, '');
        const j = await A.chamar({ action: 'admVigImportar', arquivo: I.arquivo, itens: env.slice(i, i + LOTE) });
        ['novos', 'atualizados', 'iguais'].forEach(k => { tot[k] += j[k] || 0; });
      }
      E.dados[I.ano] = await A.chamar({ action: 'admVigDados', ano: I.ano });
      E.imp = null; E.impResumo = Object.assign({ arquivo: I.arquivo, ano: I.ano }, tot);
      E.impMsg = { t: `Importado ✓ ${tot.novos} novo(s), ${tot.atualizados} atualizado(s) (${I.arquivo}).`, cls: 'ok' };
      desenhar();
    } catch (e) { if (!A.logado) return; I.enviando = false; msgImp('Não gravou: ' + e.message + ' (o que já foi gravado não duplica ao repetir).', 'erro'); if (b) b.disabled = false; }
  }

  /* ---------------- importação do relatório de plantão do papel (BVA) ---------------- */
  const UFS = (typeof CONFIG !== 'undefined' && CONFIG.ufs) || ['RR', 'AM'];
  const dBR = d => d ? d.split('-').reverse().join('/') : '';
  function secaoPlt(c) {
    const s = A.secao(c, 'Importar relatório de plantão da BVA (papel, .xls)', 'O "Relatório Diário de Trânsito Interestadual" do plantão (ex.: 10 dias do Jundiá) vira turnos e veículos da BVA, como se tivesse sido feito no app: o quadro de veículos por tipo, a educação sanitária e cada carga da lista (placa, transportador, produto, medida e nº do TF). Os números do VIGIFITO, do painel e do convênio saem sozinhos. Reimportar o mesmo plantão pergunta antes de substituir.');
    const box = A.el('div', 'pn-cartao pn-conv-imp');
    box.innerHTML = `<div class="pn-conv-acoes"><label class="pn-btn pn-btn-prim pn-conv-imp-btn" for="adm-plt-arq">📥 Importar relatório de plantão (.xls)</label>
      <input type="file" id="adm-plt-arq" accept=".xls,.xlsx" class="pn-conv-imp-arq"><span class="pn-pub-msg${E.pltMsg.cls ? ' ' + E.pltMsg.cls : ''}" data-msg="pltimp" role="status">${esc(E.pltMsg.t)}</span></div>
      <div id="adm-plt-previa"></div>`;
    s.appendChild(box);
    desenharPlt();
  }
  function msgPlt(t, cls) { E.pltMsg = { t, cls }; const m = E.raiz && E.raiz.querySelector('[data-msg=pltimp]'); if (m) { m.textContent = t; m.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  async function lerPlantao(arq) {
    msgPlt(`Lendo ${arq.name}…`, '');
    try {
      if (!/\.xlsx?$/i.test(arq.name)) throw new Error('escolha um arquivo .xls ou .xlsx');
      if (arq.size > 15e6) throw new Error('arquivo grande demais (máx. 15 MB)');
      if (typeof window.XLSX === 'undefined' || !window.XLSX.parse_xlscfb) await A.script(XLSX_CORE);
      const wb = window.XLSX.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
      const X = PlantaoPlanilha.extrair(PlantaoPlanilha.lerLivro(window.XLSX, wb), { anoPadrao: anoHoje() });
      if (!X.dias.length) throw new Error(X.erros[0] || 'quadro de veículos por dia não encontrado');
      const ano = Number(X.de.slice(0, 4));
      if (!E.dados[ano]) E.dados[ano] = await A.chamar({ action: 'admVigDados', ano });
      const postos = E.dados[ano].cfg.postos;
      E.plt = { arquivo: arq.name, X, ano, troca: '07:00', fiscal: '', ufOrigem: X.ufBva || '', posto: PlantaoPlanilha.postoProvavel(postos, X.bva) };
      previaPlt();
      msgPlt(`${arq.name}: plantão de ${dBR(X.de)} a ${dBR(X.ate)}. Confira a prévia e grave.`, 'ok');
    } catch (e) { E.plt = null; msgPlt('Não foi possível ler o relatório: ' + e.message, 'erro'); }
    desenharPlt();
  }
  function previaPlt() {
    const I = E.plt;
    I.P = PlantaoPlanilha.previa(I.X, { troca: I.troca, posto: I.posto, fiscal: I.fiscal, ufOrigem: I.ufOrigem });
  }
  function desenharPlt() {
    const box = E.raiz && E.raiz.querySelector('#adm-plt-previa'); if (!box) return;
    box.innerHTML = '';
    if (!E.plt) return;
    const I = E.plt, X = I.P, T = X.totais, postos = (E.dados[I.ano] && E.dados[I.ano].cfg.postos || []).filter(p => p.tipo === 'fixa');
    const pv = A.el('div', 'pn-conv-imp-pv'); pv.id = 'adm-plt-pv'; box.appendChild(pv);
    pv.appendChild(A.el('h3', null, esc(`Prévia — ${I.arquivo}: BVA ${I.X.bva || '?'}${I.X.ufBva ? '/' + I.X.ufBva : ''}, ${dBR(I.X.de)} a ${dBR(I.X.ate)}`)));
    const op = A.el('div', 'adm-filtro');
    op.innerHTML = `<label class="pn-conv-campo">Posto do VIGIFITO (BVA)<select id="adm-plt-posto"><option value="">— escolha —</option>${postos.map(p => `<option value="${esc(p.id)}" ${p.id === I.posto ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="pn-conv-campo">Troca do plantão<input type="time" id="adm-plt-troca" value="${esc(I.troca)}"></label>
      <label class="pn-conv-campo">UF de origem (quando o município não traz)<select id="adm-plt-uf"><option value="">—</option>${UFS.map(u => `<option ${u === I.ufOrigem ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
      <label class="pn-conv-campo">Fiscal(is) do plantão (opcional)<input type="text" id="adm-plt-fiscal" maxlength="120" value="${esc(I.fiscal)}" placeholder="nome completo"></label>`;
    pv.appendChild(op);
    A.kpis(pv, [{ rotulo: 'Dias do plantão', valor: F.int(T.dias), detalhe: `${dBR(I.X.de)} a ${dBR(I.X.ate)}${T.diasVazios ? ` · ${T.diasVazios} sem registro` : ''}` },
      { rotulo: 'Veículos', valor: F.int(T.veiculos), detalhe: T.veiculos !== T.quadro ? `quadro do papel: ${F.int(T.quadro)}` : 'quadro 1 do papel' },
      { rotulo: 'Cargas (partidas)', valor: F.int(T.cargas), detalhe: `${F.num(T.toneladas, 3)} t` },
      { rotulo: 'Liberação', valor: F.int(T.liberacao), detalhe: `${F.num(T.liberacaoT, 3)} t` },
      { rotulo: 'Apreensão', valor: F.int(T.apreensao), detalhe: `${F.num(T.apreensaoT, 3)} t`, status: T.apreensao ? 'atencao' : null },
      { rotulo: 'TFs (nº no papel)', valor: F.int(T.tfs) }, { rotulo: 'Educação sanitária', valor: F.int(T.educacao) }]);
    const erros = X.erros.map(t => ({ nivel: 'critico', titulo: t })).concat(I.posto ? [] : [{ nivel: 'critico', titulo: 'Escolha o posto do VIGIFITO (a BVA do relatório).' }]);
    A.alertas(pv, erros.concat(X.avisos.map(a => ({ nivel: a.nivel, titulo: a.texto }))), { vazio: 'Nenhum aviso. ✓', max: 15 });
    const det = A.el('details', 'pn-conv-imp-linhas'); det.innerHTML = `<summary>Ver as ${X.envio.cargas.length} cargas</summary>`; pv.appendChild(det);
    A.tabela(det, [{ chave: 'data', rotulo: 'Data', fmt: dBR }, { chave: 'hora', rotulo: 'Hora' }, { chave: 'tipo', rotulo: 'Tipo', fmt: v => v === 'MT' ? 'MO' : v }, { chave: 'placa', rotulo: 'Placa' },
      { chave: 'transportador', rotulo: 'Transportador' }, { chave: 'origemMun', rotulo: 'Origem', fmt: (v, l) => `${v}${l.ufOrigem ? '/' + l.ufOrigem : ''}` },
      { chave: 'destinoMun', rotulo: 'Destino', fmt: (v, l) => `${v}${l.ufDestino ? '/' + l.ufDestino : ''}` }, { chave: 'produto', rotulo: 'Produto' },
      { chave: 'quantidade', rotulo: 'Vol.', num: true, fmt: (v, l) => v == null ? '' : `${F.num(v, 3)} ${l.unidade || ''}` },
      { chave: 'medida', rotulo: 'Medida', fmt: v => v === 'apreensao' ? 'Apreensão' : 'Liberação' }, { chave: 'tf', rotulo: 'Nº TF' }], X.envio.cargas, { id: 'plt-cargas', limite: 50 });
    const pode = !erros.length && !X.foraDoPlantao.length;
    const ac = A.el('div', 'pn-conv-acoes');
    ac.innerHTML = `<button type="button" class="pn-btn pn-btn-prim" id="adm-plt-gravar" ${pode ? '' : 'disabled'}>Gravar o plantão (${F.int(T.veiculos)} veículos)</button><button type="button" class="pn-btn" id="adm-plt-cancelar">Cancelar</button>`;
    pv.appendChild(ac);
  }
  async function gravarPlt(substituir) {
    const I = E.plt; if (!I || I.enviando) return;
    I.enviando = true; const b = E.raiz.querySelector('#adm-plt-gravar'); if (b) b.disabled = true;
    msgPlt('Gravando o plantão…', '');
    try {
      const j = await A.chamar(Object.assign({ action: 'admPlantaoImportar', arquivo: I.arquivo, substituir: substituir ? 1 : 0 }, I.P.envio, { posto: I.posto, troca: I.troca, fiscal: I.fiscal }));
      I.enviando = false;
      if (j.jaImportado) {
        const quando = j.importadoEm ? new Date(j.importadoEm).toLocaleString('pt-BR', { timeZone: 'America/Manaus' }) : '';
        if (confirm(`Este plantão (${dBR(j.resumo.de)} a ${dBR(j.resumo.ate)}, ${j.resumo.posto}) já foi importado${quando ? ' em ' + quando : ''}${j.por ? ' por ' + j.por : ''}.\n\nSubstituir pelos dados deste arquivo? Os veículos da importação anterior ficam como excluídos e entram os novos.`)) return gravarPlt(true);
        msgPlt('Nada gravado: o plantão já estava importado.', ''); if (b) b.disabled = false; return;
      }
      const ano = I.ano; E.plt = null;
      E.dados[ano] = await A.chamar({ action: 'admVigDados', ano });
      E.pltMsg = { t: `Importado ✓ ${j.posto}, ${dBR(j.de)} a ${dBR(j.ate)}: ${j.turnos} turno(s), ${j.veiculos} veículo(s), ${j.cargas} carga(s) (${j.liberacao} liberação, ${j.apreensao} apreensão, ${j.tfs} TF)${j.substituidos ? `; ${j.substituidos} veículo(s) da importação anterior excluídos` : ''}.${j.turnosDoApp ? ` Atenção: há ${j.turnosDoApp} turno(s) do app na mesma BVA nesses dias.` : ''}`, cls: 'ok' };
      desenhar();
    } catch (e) {
      if (!A.logado) return; I.enviando = false; if (b) b.disabled = false;
      // servidor ainda sem a action (publicação do Code.gs uns minutos depois do portal): nada foi gravado
      msgPlt(/a[çc][ãa]o inv[áa]lida/i.test(e.message) ? 'Não gravou: o servidor ainda está com a versão antiga (a atualização entra em alguns minutos). Tente de novo daqui a pouco.' : 'Não gravou: ' + e.message, 'erro');
    }
  }

  function montar() {
    const r = A.el('div', 'pn-rg adm-vig'); r.id = 'adm-vig';
    r.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'adm-vig-ano') { E.ano = Number(t.value); E.edit = {}; E.msg = { t: '', cls: '' }; desenhar(); carregar(); }
      else if (t.id === 'adm-vig-modo') { E.modo = t.value; E.edit = {}; desenhar(); }
      else if (t.id === 'adm-vig-mes') { E.mes = Number(t.value); E.edit = {}; desenhar(); }
      else if (t.id === 'adm-vig-per') { E.periodo = t.value; E.edit = {}; desenhar(); }
      else if (t.id === 'adm-vig-imp-arq' && t.files && t.files[0]) { lerPlanilha(t.files[0]); t.value = ''; }
      else if (t.id === 'adm-plt-arq' && t.files && t.files[0]) { lerPlantao(t.files[0]); t.value = ''; }
      else if (E.plt && ['adm-plt-posto', 'adm-plt-troca', 'adm-plt-uf', 'adm-plt-fiscal'].includes(t.id)) {
        const k = { 'adm-plt-posto': 'posto', 'adm-plt-troca': 'troca', 'adm-plt-uf': 'ufOrigem', 'adm-plt-fiscal': 'fiscal' }[t.id];
        E.plt[k] = k === 'troca' ? (t.value || '07:00') : t.value.trim(); previaPlt(); desenharPlt();
      }
      else if (t.id === 'adm-vig-imp-semauto') { E.imp.semAuto = t.checked; previaImp(); desenharImp(); }
      else if (t.id === 'adm-vig-imp-ano') { const a = Number(t.value); E.imp.ano = a; (E.dados[a] ? Promise.resolve() : A.chamar({ action: 'admVigDados', ano: a }).then(d => { E.dados[a] = d; })).then(() => { previaImp(); desenharImp(); }); }
      else if (t.matches('[data-vig]')) validarCel(t);                 // mostra a validação da célula (sem redesenhar: um clique em "Gravar" não se perde)
    });
    r.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-vig]')) { E.edit[t.dataset.vig] = t.value; setMsg('Alterações não gravadas.', ''); const auto = IND.PORK[t.dataset.vig.split('|')[2]].fonte === 'auto'; if (auto) { const b = E.raiz.querySelector('#adm-vig-just-box'); if (b && t.value) b.hidden = false; } }
      if (t.id === 'adm-vig-just') E.just = t.value;
    });
    r.addEventListener('click', e => {
      if (e.target.closest('#adm-vig-salvar')) salvar();
      else if (e.target.closest('#adm-vig-imp-gravar')) gravarImp();
      else if (e.target.closest('#adm-vig-imp-cancelar')) { E.imp = null; desenharImp(); }
      else if (e.target.closest('#adm-plt-gravar')) gravarPlt(false);
      else if (e.target.closest('#adm-plt-cancelar')) { E.plt = null; msgPlt('', ''); desenharPlt(); }
    });
    return r;
  }
  A.registrarAba({ id: 'vigifito', titulo: 'VIGIFITO', render: c => {
    if (!E.raiz) E.raiz = montar();
    c.appendChild(E.raiz);
    if (!D()) { desenhar(); carregar(); } else desenhar();
  } });
  window.AdmVigifito = { estado: () => ({ ano: E.ano, modo: E.modo, mes: E.mes, periodo: E.periodo, dados: D(), imp: E.imp && E.imp.P, impResumo: E.impResumo, edit: E.edit, plt: E.plt && E.plt.P, pltMsg: E.pltMsg }) };
})();
