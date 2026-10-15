/* Portal do Administrativo — convênio: "Desembolso" (lançamentos financeiros por subetapa/item do plano de aplicação, com saldo da
   subetapa ao vivo, avisos de memorando repetido, diária acima do previsto e data fora da vigência; servidor da diária escolhido da
   lista de servidores cadastrados — o NOME fica só aqui e na planilha; importação da planilha de movimentação .xlsx) e "Físico do
   convênio" (lançamentos manuais das etapas 1.1 bens, 1.3, 1.5, 1.14 e ajustes +/− das etapas automáticas). Mesmas validações
   e regras de antes (que estavam no painel): actions admConvLancar / admConvFinLancar / admConvExcluir / admConvFinExcluir /
   admConvFinImportar. Os formulários usam os mesmos ids da antiga aba do painel (pn-cl-*, pn-cf-*, pn-conv-imp-*). */
(() => {
  'use strict';
  if (typeof Adm === 'undefined' || typeof ConvDocs === 'undefined') return;
  const A = Adm, esc = A.esc, CD = ConvDocs, F = CD.fmt;
  const AUTO = ['pce', 'volante', 'bva'], NAT_DIARIAS = ['33.90.14', '33.90.36'];
  const XLSX_SRC = '../painel/vendor/xlsx/xlsx.mini.min.js', IMP_LOTE = 200;
  const E = { convId: '', editando: null, editandoFin: null, msg: {}, imp: null, impResumo: null, filtroEtapa: '', avisosFin: [] };
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
  const numSimples = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? n : null; };
  const cfg = () => { const d = A.dados && E.d; return d ? (d.convenios.find(c => c.id === E.convId) || d.convenios[0]) : null; };
  const etapa = id => cfg().etapas.find(e => e.id === id);
  const itemDe = (eId, iId) => { const e = etapa(eId); return e && (e.itens || []).find(x => x.id === iId); };
  const docN = v => A.norm(v).replace(/^(memo|memorando|empenho|ne|nf|pcdp|ob)\s*(n|no)?\s*/, '').replace(/^0+(?=\d)/, '');
  const mesRef = c => { const h = A.hoje().slice(0, 7), ms = CD.mesesDe(c).filter(m => m <= h); return ms.length ? ms[ms.length - 1] : CD.mesesDe(c)[0]; };
  function msg(raiz, k, t, cls) { E.msg[k] = { t, cls }; const el = raiz && raiz.querySelector(`[data-msg="${k}"]`); if (el) { el.textContent = t; el.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  const msgHtml = k => { const m = E.msg[k] || { t: '', cls: '' }; return `<span class="pn-pub-msg${m.cls ? ' ' + m.cls : ''}" data-msg="${k}" role="status">${esc(m.t)}</span>`; };

  async function abrir(c, visao) {
    c.innerHTML = '<div class="pn-vazio">Carregando os dados do convênio…</div>';
    try { E.d = await A.dados(); if (!E.convId) E.convId = E.d.convenios[0].id; }
    catch (e) { c.innerHTML = `<p class="pn-erro">${esc(e.message)}${/a[çc][ãa]o inv[áa]lida/i.test(e.message) ? ' — o servidor ainda está com o Code.gs antigo: o gerente precisa colar o Code.gs novo e criar uma nova versão da implantação.' : ''}</p>`; return; }
    const raiz = A.el('div', 'pn-conv adm-conv'); raiz.id = visao === 'fin' ? 'adm-fin' : 'adm-fis';
    c.innerHTML = ''; c.appendChild(raiz);
    ligar(raiz, visao); desenhar(raiz, visao);
  }
  function cab(raiz) {
    const c = cfg();
    return `<div class="pn-cartao pn-conv-topo"><div class="pn-conv-sel">
      <label>Convênio<select id="pn-conv-sel">${E.d.convenios.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.numero || x.id)}</option>`).join('')}</select></label></div>
      <h3 class="pn-conv-nome">${esc(c.nome)}</h3><p class="pn-sub">Vigência ${F.data(c.vigencia.inicio)} a ${F.data(c.vigencia.fim)} · execução desde ${F.data(c.inicioExecucao)} · valor global ${F.moeda(c.valores.global)}</p></div>`;
  }
  function desenhar(raiz, visao) {
    raiz.innerHTML = cab(raiz) + '<div id="pn-conv-visao" class="pn-conv-visao"></div>';
    const v = raiz.querySelector('#pn-conv-visao');
    if (visao === 'fin') visaoFin(raiz, v); else visaoLanc(raiz, v);
  }
  function ligar(raiz, visao) {
    raiz.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'pn-conv-sel') { E.convId = t.value; E.editando = E.editandoFin = null; desenhar(raiz, visao); }
      if (t.id === 'pn-cl-etapa' || t.id === 'pn-cl-sub') ajustarFormLanc(raiz, t.id === 'pn-cl-etapa');
      if (t.id === 'pn-cf-etapa') { ajustarFormFin(raiz, true); vivoFin(raiz); }
      if (t.id === 'pn-cf-item') { ajustarFormFin(raiz, false); vivoFin(raiz); }
      if (t.id === 'pn-cf-data' || t.id === 'pn-cf-fonte' || t.id === 'pn-cf-tipo' || t.id === 'pn-cf-srv') vivoFin(raiz);
      if (t.id === 'adm-fin-filtro') { E.filtroEtapa = t.value; desenhar(raiz, visao); }
      if (t.id === 'pn-conv-imp-arq' && t.files && t.files[0]) { lerPlanilha(raiz, t.files[0]); t.value = ''; }
      if (E.imp && t.closest && t.closest('#pn-conv-imp-previa')) {
        const op = E.imp.op, lid = t.dataset.lid;
        if (t.matches('[data-imp-data]')) { if (t.value) op.datas[lid] = t.value; else delete op.datas[lid]; }
        else if (t.matches('[data-imp-ign]')) { if (t.checked) op.ignorar[lid] = true; else delete op.ignorar[lid]; }
        else if (t.matches('[data-imp-rep]')) { if (t.checked) op.repetidos[lid] = true; else delete op.repetidos[lid]; }
        else if (t.matches('[data-imp-exc]')) { if (t.checked) op.excluir[t.dataset.id] = true; else delete op.excluir[t.dataset.id]; }
        else return;
        previaImp(); desenharImp(raiz);
      }
    });
    raiz.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'pn-cf-valor') { const q = raiz.querySelector('#pn-cf-qtd'); if (q && !q.dataset.manual) calcDiarias(raiz); vivoFin(raiz); }
      if (t.id === 'pn-cf-qtd') { t.dataset.manual = t.value ? '1' : ''; vivoFin(raiz); }
      if (t.id === 'pn-cf-doc') vivoFin(raiz);
      if (t.id === 'pn-cl-mun') t.dataset.digitado = '1';
    });
    raiz.addEventListener('click', e => {
      const b = e.target.closest('[data-conv]'); if (!b) return;
      const a = b.dataset.conv, id = b.dataset.id;
      if (a === 'lanc-editar') { E.editando = id; desenhar(raiz, visao); const f = raiz.querySelector('#pn-conv-lanc-form'); if (f) f.scrollIntoView({ block: 'start' }); }
      else if (a === 'lanc-excluir') excluir(raiz, visao, 'lanc', id);
      else if (a === 'fin-editar') { E.editandoFin = id; desenhar(raiz, visao); const f = raiz.querySelector('#pn-conv-fin-form'); if (f) f.scrollIntoView({ block: 'start' }); }
      else if (a === 'fin-excluir') excluir(raiz, visao, 'fin', id);
      else if (a === 'lanc-cancelar') { E.editando = null; desenhar(raiz, visao); }
      else if (a === 'fin-cancelar') { E.editandoFin = null; desenhar(raiz, visao); }
      else if (a === 'imp-gravar') gravarImp(raiz, visao);
      else if (a === 'imp-cancelar') { E.imp = null; desenharImp(raiz); }
      else if (a === 'bem') preencherBem(raiz, id);
    });
    raiz.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'pn-conv-lanc-form') salvarLanc(raiz, visao);
      if (e.target.id === 'pn-conv-fin-form') salvarFin(raiz, visao);
    });
  }

  /* ================= Físico do convênio ================= */
  function visaoLanc(raiz, v) {
    const c = cfg();
    const R = CD.calcular(c, { etapas: {} }, E.d.lancamentos, E.d.financeiro, mesRef(c), { hoje: A.hoje(), municipio: n => A.municipioNome(n) || n });
    const sf = A.secao(v, E.editando ? 'Editar lançamento físico' : 'Novo lançamento físico', 'Etapas manuais (1.3, 1.5, 1.14), situação dos bens (1.1) e ajustes +/− das etapas apuradas pelo e-GDV (1.4, 1.9, 1.10), com justificativa.');
    const form = A.el('form', 'pn-cartao pn-conv-form'); form.id = 'pn-conv-lanc-form'; form.noValidate = true;
    const hoje = A.hoje(), dataPadrao = hoje >= c.vigencia.inicio && hoje <= c.vigencia.fim ? hoje : c.inicioExecucao;
    form.innerHTML = `
      <label class="pn-conv-campo">Etapa<select id="pn-cl-etapa">${c.etapas.map(e => `<option value="${esc(e.id)}">${esc(e.id)} – ${esc(e.nomeCurto || e.nome)}${AUTO.includes(e.apuracao) ? ' (ajuste)' : ''}</option>`).join('')}</select></label>
      <label class="pn-conv-campo" data-se="sub">Sub-meta<select id="pn-cl-sub"></select></label>
      <label class="pn-conv-campo" data-se="bem">Bem<select id="pn-cl-bem"></select></label>
      <label class="pn-conv-campo" data-se="sit">Situação<select id="pn-cl-sit">${Object.entries(CD.SIT_BEM).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label class="pn-conv-campo" data-se="mun">Município<input id="pn-cl-mun" list="pn-conv-muns" maxlength="80" autocomplete="off"></label>
      <label class="pn-conv-campo">Data<input id="pn-cl-data" type="date" min="${c.vigencia.inicio}" max="${c.vigencia.fim}" value="${dataPadrao}"></label>
      <label class="pn-conv-campo" data-se="qtd"><span id="pn-cl-qtd-rot">Quantidade</span><input id="pn-cl-qtd" inputmode="decimal" maxlength="12"></label>
      <label class="pn-conv-campo" data-se="arm">Nº de armadilhas<input id="pn-cl-arm" inputmode="numeric" maxlength="6"></label>
      <label class="pn-conv-campo" data-se="prop">Propriedades<input id="pn-cl-prop" inputmode="numeric" maxlength="6"></label>
      <label class="pn-conv-campo pn-conv-largo"><span id="pn-cl-desc-rot">Descrição / evidência</span><textarea id="pn-cl-desc" rows="2" maxlength="2000"></textarea></label>
      <label class="pn-conv-campo">Documento<input id="pn-cl-doc" maxlength="120" placeholder="Relatório, ofício, NF…"></label>
      <p class="pn-sub pn-conv-largo" id="pn-cl-dica"></p>
      <div class="pn-conv-acoes pn-conv-largo"><button type="submit" class="pn-btn pn-btn-prim" id="pn-cl-salvar">${E.editando ? 'Salvar alteração' : 'Lançar'}</button>
        ${E.editando ? '<button type="button" class="pn-btn" data-conv="lanc-cancelar">Cancelar edição</button>' : ''}${msgHtml('lanc')}</div>
      <datalist id="pn-conv-muns">${A.municipios.map(m => `<option value="${esc(m)}">`).join('')}</datalist>`;
    sf.appendChild(form);
    if (E.editando) preencherLanc(raiz, E.editando); else ajustarFormLanc(raiz, true);
    const rb = R.etapas.find(r => r.apuracao === 'bens');
    if (rb) {
      const sb = A.secao(v, `Bens da etapa ${rb.id}`, 'Situação atual (último lançamento de cada bem). "Atualizar" preenche o formulário para lançar a nova situação.');
      A.tabela(sb, [{ chave: 'nome', rotulo: 'Bem' }, { chave: 'local', rotulo: 'Unidade' }, { chave: 'sit', rotulo: 'Situação', html: (x, l) => `<span class="pn-selo ${l.exec ? 'bom' : x === 'em_aquisicao' ? 'atencao' : 'info'}">${esc(CD.SIT_BEM[x] || x)}</span>` },
        { chave: 'data', rotulo: 'Data', fmt: x => x ? F.data(x) : '—' }, { chave: 'doc', rotulo: 'Documento', fmt: x => x || '—' },
        { chave: 'id', rotulo: '', html: x => `<button type="button" class="pn-btn pn-btn-mini" data-conv="bem" data-id="${esc(x)}">Atualizar</button>` }],
        rb.bens.map(x => ({ id: x.b.id, nome: x.b.nome, local: x.b.local, sit: x.sit, exec: x.exec, data: x.data, doc: x.doc })), { id: 'conv-bens', limite: 20, busca: false });
    }
    const sl = A.secao(v, 'Lançamentos físicos', 'Mais recentes primeiro. Excluir é lógico: a linha fica na planilha com quem excluiu (ver Histórico).');
    const subNome = l => { const e = etapa(l.etapa); if (!e) return l.submeta; if (l.tipo === 'bem') { const b = (e.bens || []).find(x => x.id === l.submeta); return b ? `${b.nome} – ${b.local}` : l.submeta; }
      const s = (e.submetas || []).find(x => x.id === l.submeta); return s ? s.nome : (l.submeta || ''); };
    const lst = E.d.lancamentos.filter(l => l.convenio === c.id).slice().sort((a, b) => b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    A.tabela(sl, [
      { chave: 'data', rotulo: 'Data', fmt: F.data }, { chave: 'etapa', rotulo: 'Etapa' },
      { chave: 'tipo', rotulo: 'Tipo', fmt: (x, l) => x === 'ajuste' ? 'Ajuste' : x === 'bem' ? 'Bem: ' + (CD.SIT_BEM[l.situacao] || l.situacao) : 'Execução' },
      { chave: 'submeta', rotulo: 'Sub-meta / município', fmt: (x, l) => { const n = subNome(l) || ''; return [n, l.municipio && !n.includes(l.municipio) ? l.municipio : ''].filter(Boolean).join(' · ') || '—'; } },
      { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: (x, l) => l.tipo === 'bem' ? '—' : (x > 0 && l.tipo === 'ajuste' ? '+' : '') + F.num(x) },
      { chave: 'descricao', rotulo: 'Descrição', fmt: (x, l) => [x, l.armadilhas ? l.armadilhas + ' armadilhas' : '', l.propriedades ? l.propriedades + ' propriedades' : ''].filter(Boolean).join(' · ') || '—' },
      { chave: 'documento', rotulo: 'Documento', fmt: x => x || '—' }, { chave: 'usuario', rotulo: 'Lançado por' }, { chave: 'atualizadoEm', rotulo: 'Em', fmt: A.fmt.dataHora },
      { chave: 'id', rotulo: 'Ações', csv: () => '', html: x => `<span class="pn-conv-acoes-lin"><button type="button" class="pn-btn pn-btn-mini" data-conv="lanc-editar" data-id="${esc(x)}">Editar</button><button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-conv="lanc-excluir" data-id="${esc(x)}">Excluir</button></span>` }
    ], lst, { id: 'conv-lancamentos', csv: `convenio-${c.id}-lancamentos-fisicos.csv`, limite: 30, vazio: 'Nenhum lançamento ainda.' });
  }
  function ajustarFormLanc(raiz, etapaMudou) {
    const f = raiz.querySelector('#pn-conv-lanc-form'); if (!f) return;
    const q = s => f.querySelector(s), e = etapa(q('#pn-cl-etapa').value), auto = AUTO.includes(e.apuracao), bens = e.apuracao === 'bens';
    if (etapaMudou) {
      q('#pn-cl-sub').innerHTML = (e.submetas || []).map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('');
      q('#pn-cl-bem').innerHTML = (e.bens || []).map(b => `<option value="${esc(b.id)}">${esc(b.nome)} – ${esc(b.local)}</option>`).join('');
    }
    const s = (e.submetas || []).find(x => x.id === q('#pn-cl-sub').value);
    const mostra = (k, sim) => { f.querySelector(`[data-se="${k}"]`).hidden = !sim; };
    mostra('sub', !bens && !auto && (e.submetas || []).length > 0); mostra('bem', bens); mostra('sit', bens); mostra('qtd', !bens);
    mostra('mun', !bens); mostra('arm', e.id === '1.3' && !auto && (!s || s.contagem !== 'municipios')); mostra('prop', !bens && !auto);
    if (s && !E.editando && (etapaMudou || !q('#pn-cl-mun').dataset.digitado)) q('#pn-cl-mun').value = s.municipio || '';
    q('#pn-cl-qtd-rot').textContent = auto ? 'Ajuste (+/−)' : `Quantidade${s ? ' (' + (s.contagem === 'municipios' ? 'levantamentos' : s.unidade) + ')' : ' (' + e.unidade + ')'}`;
    q('#pn-cl-desc-rot').textContent = auto ? 'Justificativa (obrigatória)' : 'Descrição / evidência';
    q('#pn-cl-dica').textContent = auto ? 'Etapa apurada automaticamente pelo e-GDV. Use o ajuste só para registros que não estão no sistema (ex.: antes do e-GDV); negativo para corrigir.'
      : bens ? 'Lance cada mudança de situação do bem (em aquisição, adquirido, entregue). Adquirido ou entregue conta como executado.'
      : s && s.contagem === 'municipios' ? `Sub-meta contada por municípios distintos (${(s.municipios || []).join(', ')}); informe o município e as propriedades.` : '';
  }
  function preencherBem(raiz, id) {
    const f = raiz.querySelector('#pn-conv-lanc-form'); if (!f) return;
    const e = cfg().etapas.find(x => x.apuracao === 'bens'); f.querySelector('#pn-cl-etapa').value = e.id; ajustarFormLanc(raiz, true);
    f.querySelector('#pn-cl-bem').value = id; f.scrollIntoView({ block: 'start' }); f.querySelector('#pn-cl-sit').focus();
  }
  function preencherLanc(raiz, id) {
    const l = E.d.lancamentos.find(x => x.id === id), f = raiz.querySelector('#pn-conv-lanc-form'); if (!l || !f) return;
    const q = s => f.querySelector(s);
    q('#pn-cl-etapa').value = l.etapa; ajustarFormLanc(raiz, true);
    if (l.tipo === 'bem') { q('#pn-cl-bem').value = l.submeta; q('#pn-cl-sit').value = l.situacao; } else q('#pn-cl-sub').value = l.submeta;
    ajustarFormLanc(raiz, false);
    q('#pn-cl-mun').value = l.municipio || ''; q('#pn-cl-data').value = l.data; q('#pn-cl-qtd').value = l.tipo === 'bem' ? '' : String(l.quantidade).replace('.', ',');
    q('#pn-cl-arm').value = l.armadilhas == null ? '' : l.armadilhas; q('#pn-cl-prop').value = l.propriedades == null ? '' : l.propriedades;
    q('#pn-cl-desc').value = l.descricao || ''; q('#pn-cl-doc').value = l.documento || '';
  }
  async function salvarLanc(raiz, visao) {
    const f = raiz.querySelector('#pn-conv-lanc-form'), q = s => f.querySelector(s), e = etapa(q('#pn-cl-etapa').value);
    const bens = e.apuracao === 'bens', auto = AUTO.includes(e.apuracao);
    const l = { id: E.editando || '', convenio: cfg().id, etapa: e.id, tipo: bens ? 'bem' : auto ? 'ajuste' : 'execucao', data: q('#pn-cl-data').value,
      submeta: bens ? q('#pn-cl-bem').value : auto ? '' : q('#pn-cl-sub').value, situacao: bens ? q('#pn-cl-sit').value : '',
      municipio: bens ? '' : q('#pn-cl-mun').value.trim(), quantidade: bens ? 1 : numSimples(q('#pn-cl-qtd').value),
      armadilhas: q('[data-se="arm"]').hidden ? '' : numSimples(q('#pn-cl-arm').value), propriedades: q('[data-se="prop"]').hidden ? '' : numSimples(q('#pn-cl-prop').value),
      descricao: q('#pn-cl-desc').value.trim(), documento: q('#pn-cl-doc').value.trim() };
    if (!bens && (l.quantidade == null || (!auto && !(l.quantidade > 0)) || l.quantidade === 0)) return msg(raiz, 'lanc', auto ? 'Informe o ajuste (ex.: 3 ou -2).' : 'Informe a quantidade (maior que zero).', 'erro');
    if (auto && l.descricao.length < 5) return msg(raiz, 'lanc', 'Ajuste exige justificativa.', 'erro');
    const b = q('#pn-cl-salvar'); b.disabled = true; msg(raiz, 'lanc', 'Salvando…', '');
    try {
      const j = await A.chamar({ action: 'admConvLancar', lancamento: l });
      const i = E.d.lancamentos.findIndex(x => x.id === j.lancamento.id);
      if (i >= 0) E.d.lancamentos[i] = j.lancamento; else E.d.lancamentos.push(j.lancamento);
      E.editando = null; E.msg.lanc = { t: `Lançado ✓ (etapa ${e.id})`, cls: 'ok' };
      desenhar(raiz, visao);
    } catch (err) { if (!A.logado) return; msg(raiz, 'lanc', 'Não salvou: ' + err.message, 'erro'); b.disabled = false; }
  }
  async function excluir(raiz, visao, tipo, id) {
    if (!confirm('Excluir este lançamento? (fica registrado na planilha como excluído)')) return;
    try {
      await A.chamar({ action: tipo === 'fin' ? 'admConvFinExcluir' : 'admConvExcluir', id });
      const lista = tipo === 'fin' ? E.d.financeiro : E.d.lancamentos, i = lista.findIndex(x => x.id === id); if (i >= 0) lista.splice(i, 1);
      E.msg[tipo === 'fin' ? 'fin' : 'lanc'] = { t: 'Excluído ✓', cls: 'ok' };
      desenhar(raiz, visao);
    } catch (err) { if (A.logado) alert('Não excluiu: ' + err.message); }
  }

  /* ================= Desembolso ================= */
  const tipoDoItem = it => /superior/i.test(it.nome) ? 'NS' : /m[eé]dio/i.test(it.nome) ? 'NM' : /terceir/i.test(it.nome) ? 'TERC' : '';
  const vivosItem = (itemId, exceto) => E.d.financeiro.filter(l => l.convenio === cfg().id && l.item === itemId && l.id !== exceto);
  function visaoFin(raiz, v) {
    const c = cfg(), Fn = CD.financeiro(c, E.d.financeiro, mesRef(c));
    A.kpis(v, [
      { rotulo: 'Executado acumulado', valor: F.moeda(Fn.total.acum), detalhe: `${F.pct(Fn.total.pct)} de ${F.moeda(Fn.total.previsto)}` },
      { rotulo: 'Saldo do convênio', valor: F.moeda(Fn.total.saldo) },
      { rotulo: 'Repasse × contrapartida', valor: `${F.pct(Fn.fonte.concedente.pct)} · ${F.pct(Fn.fonte.contrapartida.pct)}`, detalhe: `repasse ${F.moeda(Fn.fonte.concedente.acum)}; contrapartida ${F.moeda(Fn.fonte.contrapartida.acum)}` },
      { rotulo: 'Lançamentos', valor: F.int(E.d.financeiro.filter(l => l.convenio === c.id).length), detalhe: 'manuais e importados' }
    ]);
    const sf = A.secao(v, E.editandoFin ? 'Editar desembolso' : 'Novo desembolso', 'Por subetapa (item do plano de aplicação). Diárias: a quantidade é calculada pelo valor ÷ valor unitário do item (pode ser corrigida). O nome do servidor fica só no portal e na planilha — o painel e os relatórios mostram só os totais.');
    const form = A.el('form', 'pn-cartao pn-conv-form'); form.id = 'pn-conv-fin-form'; form.noValidate = true;
    const hoje = A.hoje(), dataPadrao = hoje >= c.vigencia.inicio && hoje <= c.vigencia.fim ? hoje : c.inicioExecucao;
    form.innerHTML = `
      <label class="pn-conv-campo">Etapa<select id="pn-cf-etapa">${c.etapas.map(e => `<option value="${esc(e.id)}">${esc(e.id)} – ${esc(e.nomeCurto || e.nome)}</option>`).join('')}</select></label>
      <label class="pn-conv-campo pn-conv-largo2">Subetapa / item do plano<select id="pn-cf-item"></select></label>
      <label class="pn-conv-campo">Data<input id="pn-cf-data" type="date" value="${dataPadrao}"></label>
      <label class="pn-conv-campo">Valor (R$)<input id="pn-cf-valor" inputmode="decimal" maxlength="16" placeholder="0,00"></label>
      <label class="pn-conv-campo" data-se="tipo">Tipo da diária<select id="pn-cf-tipo"><option value="">—</option><option value="NM">NM (nível médio)</option><option value="NS">NS (nível superior)</option><option value="TERC">Terceiros</option></select></label>
      <label class="pn-conv-campo"><span id="pn-cf-qtd-rot">Quantidade</span><input id="pn-cf-qtd" inputmode="decimal" maxlength="12"></label>
      <label class="pn-conv-campo">Fonte<select id="pn-cf-fonte"><option value="concedente">Repasse (concedente)</option><option value="contrapartida">Contrapartida</option></select></label>
      <label class="pn-conv-campo">Nº do memorando / empenho / NF / PCDP / OB<input id="pn-cf-doc" maxlength="120" placeholder="Memo nº 560/2026"></label>
      <label class="pn-conv-campo pn-conv-largo2" data-se="srv">Servidor (diária)<select id="pn-cf-srv"><option value="">—</option>${(E.d.servidores || []).map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('')}</select></label>
      <label class="pn-conv-campo pn-conv-largo">Descrição<textarea id="pn-cf-desc" rows="2" maxlength="1000"></textarea></label>
      <div class="pn-conv-largo adm-vivo" id="adm-fin-vivo" aria-live="polite"></div>
      <div class="pn-conv-acoes pn-conv-largo"><button type="submit" class="pn-btn pn-btn-prim" id="pn-cf-salvar">${E.editandoFin ? 'Salvar alteração' : 'Lançar'}</button>
        ${E.editandoFin ? '<button type="button" class="pn-btn" data-conv="fin-cancelar">Cancelar edição</button>' : ''}${msgHtml('fin')}</div>`;
    sf.appendChild(form);
    ajustarFormFin(raiz, true);
    if (E.editandoFin) {
      const l = E.d.financeiro.find(x => x.id === E.editandoFin);
      if (l) { const q = s => form.querySelector(s); q('#pn-cf-etapa').value = l.etapa; ajustarFormFin(raiz, true); q('#pn-cf-item').value = l.item; ajustarFormFin(raiz, false); q('#pn-cf-data').value = l.data;
        q('#pn-cf-qtd').value = l.quantidade == null ? '' : String(l.quantidade).replace('.', ','); q('#pn-cf-qtd').dataset.manual = '1'; q('#pn-cf-valor').value = F.num(l.valor, 2).replace(/\./g, '');
        q('#pn-cf-fonte').value = l.fonte; q('#pn-cf-doc').value = l.documento || ''; q('#pn-cf-desc').value = l.descricao || ''; q('#pn-cf-tipo').value = l.tipoDiaria || ''; q('#pn-cf-srv').value = l.servidorId || ''; }
    }
    vivoFin(raiz);
    secaoImp(raiz, v);
    const sl = A.secao(v, 'Lançamentos de desembolso', 'Mais recentes primeiro. O CSV do portal inclui o nome do servidor (o do painel, não).');
    const fl = A.el('div', 'pn-cartao adm-filtro');
    fl.innerHTML = `<label class="pn-conv-campo">Etapa<select id="adm-fin-filtro"><option value="">Todas</option>${c.etapas.map(e => `<option value="${esc(e.id)}" ${E.filtroEtapa === e.id ? 'selected' : ''}>${esc(e.id)} – ${esc(e.nomeCurto || e.nome)}</option>`).join('')}</select></label>`;
    sl.appendChild(fl);
    const itemNome = l => { const it = itemDe(l.etapa, l.item); return it ? `${it.id} ${it.nome}` : l.item; };
    const lst = E.d.financeiro.filter(l => l.convenio === c.id && (!E.filtroEtapa || l.etapa === E.filtroEtapa)).slice().sort((a, b) => b.data.localeCompare(a.data) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    A.tabela(sl, [{ chave: 'data', rotulo: 'Data', fmt: F.data }, { chave: 'etapa', rotulo: 'Etapa' }, { chave: 'item', rotulo: 'Subetapa', fmt: (x, l) => itemNome(l) },
      { chave: 'documento', rotulo: 'Documento', fmt: x => x || '—' }, { chave: 'tipoDiaria', rotulo: 'Tipo', fmt: x => x === 'TERC' ? 'Terceiros' : x || '—' },
      { chave: 'quantidade', rotulo: 'Qtd.', num: true, fmt: x => x == null ? '—' : F.num(x, 1) }, { chave: 'valor', rotulo: 'Valor', num: true, fmt: F.moeda, csv: x => x },
      { chave: 'fonte', rotulo: 'Fonte', fmt: x => x === 'contrapartida' ? 'Contrapartida' : 'Repasse' }, { chave: 'servidorNome', rotulo: 'Servidor', fmt: x => x || '—' },
      { chave: 'descricao', rotulo: 'Descrição', fmt: x => x || '—' },
      { chave: 'origem', rotulo: 'Origem', fmt: (x, l) => x === 'planilha' ? `Planilha${l.importadoEm ? ' ' + A.fmt.dataHora(l.importadoEm) : ''}` : 'Manual' }, { chave: 'usuario', rotulo: 'Lançado por' },
      { chave: 'id', rotulo: 'Ações', csv: () => '', html: x => `<span class="pn-conv-acoes-lin"><button type="button" class="pn-btn pn-btn-mini" data-conv="fin-editar" data-id="${esc(x)}">Editar</button><button type="button" class="pn-btn pn-btn-mini pn-btn-encerrar" data-conv="fin-excluir" data-id="${esc(x)}">Excluir</button></span>` }],
      lst, { id: 'conv-fin-lanc', csv: `convenio-${c.id}-desembolso.csv`, limite: 30, vazio: 'Nenhum desembolso lançado ainda.' });
  }
  function ajustarFormFin(raiz, etapaMudou) {
    const f = raiz.querySelector('#pn-conv-fin-form'); if (!f) return;
    const q = s => f.querySelector(s), e = etapa(q('#pn-cf-etapa').value);
    if (etapaMudou) {
      q('#pn-cf-item').innerHTML = (e.itens || []).map(it => `<option value="${esc(it.id)}">${esc(it.id)} ${esc(it.nome)} (${esc(it.natureza)}; previsto ${F.moeda(it.total)})</option>`).join('');
      q('#pn-cf-fonte').value = e.apuracao === 'bens' ? q('#pn-cf-fonte').value : 'concedente';
    }
    const it = itemDe(e.id, q('#pn-cf-item').value), diaria = !!it && NAT_DIARIAS.includes(it.natureza);
    f.querySelector('[data-se="tipo"]').hidden = !diaria; f.querySelector('[data-se="srv"]').hidden = !diaria;
    q('#pn-cf-qtd-rot').textContent = diaria ? `Diárias (valor ÷ ${F.moeda(it.valorUnitario)})` : 'Quantidade';
    if (diaria && !q('#pn-cf-tipo').value) q('#pn-cf-tipo').value = tipoDoItem(it);
    if (!diaria) { q('#pn-cf-tipo').value = ''; q('#pn-cf-srv').value = ''; }
    if (!q('#pn-cf-qtd').dataset.manual) calcDiarias(raiz);
  }
  function calcDiarias(raiz) {
    const f = raiz.querySelector('#pn-conv-fin-form'), q = s => f.querySelector(s), it = itemDe(q('#pn-cf-etapa').value, q('#pn-cf-item').value), v = num(q('#pn-cf-valor').value);
    if (!it || !NAT_DIARIAS.includes(it.natureza)) return;
    q('#pn-cf-qtd').value = v > 0 && it.valorUnitario > 0 ? String(Math.round(v / it.valorUnitario * 10) / 10).replace('.', ',') : '';
  }
  /** Saldo da subetapa ao vivo e avisos (não bloqueiam; a data fora da vigência o servidor recusa). */
  function vivoFin(raiz) {
    const f = raiz.querySelector('#pn-conv-fin-form'), box = raiz.querySelector('#adm-fin-vivo'); if (!f || !box) return;
    const q = s => f.querySelector(s), c = cfg(), it = itemDe(q('#pn-cf-etapa').value, q('#pn-cf-item').value); if (!it) { box.innerHTML = ''; return; }
    const outros = vivosItem(it.id, E.editandoFin), gasto = outros.reduce((s, l) => s + Number(l.valor || 0), 0), v = num(q('#pn-cf-valor').value) || 0;
    const saldoAntes = it.total - gasto, saldoDepois = saldoAntes - v, avisos = [];
    const doc = q('#pn-cf-doc').value.trim(), data = q('#pn-cf-data').value, qtd = numSimples(q('#pn-cf-qtd').value);
    if (doc && outros.some(l => docN(l.documento) && docN(l.documento) === docN(doc))) avisos.push({ nivel: 'atencao', titulo: `Memorando/documento "${doc}" já lançado nesta subetapa`, detalhe: 'Possível duplicidade: confira antes de lançar.' });
    if (data && (data < c.vigencia.inicio || data > c.vigencia.fim)) avisos.push({ nivel: 'serio', titulo: 'Data fora da vigência do convênio', detalhe: `${F.data(c.vigencia.inicio)} a ${F.data(c.vigencia.fim)} — o servidor não aceita.` });
    if (NAT_DIARIAS.includes(it.natureza) && qtd != null) {
      const usadas = outros.reduce((s, l) => s + (Number(l.quantidade) || (it.valorUnitario ? Number(l.valor || 0) / it.valorUnitario : 0)), 0) + qtd;
      if (usadas > it.quantidade) avisos.push({ nivel: 'atencao', titulo: `Diárias acima do previsto: ${F.num(usadas, 1)} de ${F.int(it.quantidade)}`, detalhe: `Subetapa ${it.id}.` });
    }
    if (saldoDepois < -0.005) avisos.push({ nivel: 'serio', titulo: 'Valor maior que o saldo da subetapa', detalhe: `Saldo ${F.moeda(saldoAntes)}.` });
    box.innerHTML = `<dl class="pn-conv-nums adm-saldo" id="adm-saldo"><div><dt>Previsto da subetapa</dt><dd>${F.moeda(it.total)}</dd></div><div><dt>Já executado</dt><dd>${F.moeda(gasto)}</dd></div>
      <div><dt>Saldo antes</dt><dd>${F.moeda(saldoAntes)}</dd></div><div><dt>Saldo depois deste</dt><dd data-saldo-depois="${Math.round(saldoDepois * 100) / 100}">${F.moeda(saldoDepois)}</dd></div></dl>`;
    const av = A.el('div', 'adm-fin-avisos'); av.id = 'adm-fin-avisos'; box.appendChild(av);
    if (avisos.length || E.avisosFin.length) A.alertas(av, avisos.concat(E.avisosFin.map(t => ({ nivel: 'atencao', titulo: t, detalhe: 'Aviso do servidor no último lançamento.' }))));
  }
  async function salvarFin(raiz, visao) {
    const f = raiz.querySelector('#pn-conv-fin-form'), q = s => f.querySelector(s);
    const valor = num(q('#pn-cf-valor').value);
    if (valor == null || valor === 0) return msg(raiz, 'fin', 'Informe o valor (ex.: 1.234,56).', 'erro');
    const l = { id: E.editandoFin || '', convenio: cfg().id, etapa: q('#pn-cf-etapa').value, item: q('#pn-cf-item').value, data: q('#pn-cf-data').value,
      quantidade: numSimples(q('#pn-cf-qtd').value), valor, fonte: q('#pn-cf-fonte').value, documento: q('#pn-cf-doc').value.trim(), descricao: q('#pn-cf-desc').value.trim(),
      tipoDiaria: q('[data-se="tipo"]').hidden ? '' : q('#pn-cf-tipo').value, servidorId: q('[data-se="srv"]').hidden ? '' : q('#pn-cf-srv').value };
    const b = q('#pn-cf-salvar'); b.disabled = true; msg(raiz, 'fin', 'Salvando…', '');
    try {
      const j = await A.chamar({ action: 'admConvFinLancar', lancamento: l });
      const i = E.d.financeiro.findIndex(x => x.id === j.lancamento.id);
      if (i >= 0) E.d.financeiro[i] = j.lancamento; else E.d.financeiro.push(j.lancamento);
      E.editandoFin = null; E.avisosFin = j.avisos || [];
      E.msg.fin = { t: `Lançado ✓ (${F.moeda(j.lancamento.valor)})${E.avisosFin.length ? ' — com aviso' : ''}`, cls: 'ok' };
      desenhar(raiz, visao);
    } catch (err) { if (!A.logado) return; msg(raiz, 'fin', 'Não salvou: ' + err.message, 'erro'); b.disabled = false; }
  }

  /* ---------------- importação da planilha de movimentação ---------------- */
  function secaoImp(raiz, v) {
    const s = A.secao(v, 'Importar planilha de movimentação', 'Planilha do gestor (.xlsx; uma aba "SUBETAPA x.y.z" por item do plano). Lida aqui no navegador; a coluna NOME não é lida nem enviada. Pode repetir todo mês: o que já foi importado não duplica.');
    const box = A.el('div', 'pn-cartao pn-conv-imp');
    box.innerHTML = `<div class="pn-conv-acoes"><label class="pn-btn pn-btn-prim pn-conv-imp-btn" for="pn-conv-imp-arq">📥 Importar planilha de movimentação (.xlsx)</label>
      <input type="file" id="pn-conv-imp-arq" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="pn-conv-imp-arq">${msgHtml('imp')}</div>
      <div id="pn-conv-imp-previa"></div>`;
    s.appendChild(box);
    desenharImp(raiz);
  }
  async function lerPlanilha(raiz, arq) {
    msg(raiz, 'imp', `Lendo ${arq.name}…`, '');
    try {
      if (!/\.xlsx$/i.test(arq.name)) throw new Error('escolha um arquivo .xlsx');
      if (arq.size > 15e6) throw new Error('arquivo grande demais (máx. 15 MB)');
      if (typeof window.XLSX === 'undefined') await A.script(XLSX_SRC);
      const wb = window.XLSX.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
      const ext = ConvPlanilha.extrair(ConvPlanilha.abasDoLivro(window.XLSX, wb));
      E.imp = { arquivo: arq.name, ext, op: { datas: {}, ignorar: {}, repetidos: {}, excluir: {} }, P: null };
      previaImp();
      msg(raiz, 'imp', `${arq.name}: ${E.imp.P.totais.linhas} lançamento(s) em ${ext.abas.length} aba(s). Confira a prévia e grave.`, 'ok');
    } catch (e) { E.imp = null; msg(raiz, 'imp', 'Não foi possível ler a planilha: ' + e.message, 'erro'); }
    desenharImp(raiz);
  }
  function previaImp() { E.imp.P = ConvPlanilha.previa(E.imp.ext, cfg(), E.d.financeiro, E.imp.op); }
  const dataBR = d => d ? F.data(d) : '—';
  function desenharImp(raiz) {
    const box = raiz.querySelector('#pn-conv-imp-previa'); if (!box) return;
    box.innerHTML = '';
    if (E.impResumo) { const r = E.impResumo;
      box.appendChild(A.el('p', 'pn-conv-imp-resumo', esc(`Última importação (${r.arquivo}): ${r.novos} novo(s), ${r.atualizados} atualizado(s), ${r.iguais} igual(is) já no sistema, ${r.excluidos} excluído(s) — ${F.moeda(r.valor)} gravados.`))); }
    if (!E.imp) return;
    const X = E.imp.P, T = X.totais, c = cfg();
    const pv = A.el('div', 'pn-conv-imp-pv'); pv.id = 'pn-conv-imp-pv'; box.appendChild(pv);
    pv.appendChild(A.el('h3', null, esc(`Prévia — ${E.imp.arquivo}`)));
    A.kpis(pv, [
      { rotulo: 'Na planilha', valor: F.moeda(T.valorPlanilha), detalhe: `${T.linhas} lançamento(s)${X.abasIgnoradas.length ? ` · abas fora: ${X.abasIgnoradas.join(', ')}` : ''}` },
      { rotulo: 'Novos', valor: T.novos, detalhe: 'serão gravados' }, { rotulo: 'Alterados', valor: T.alterados, detalhe: 'valor/data mudou: serão atualizados', status: T.alterados ? 'atencao' : null },
      { rotulo: 'Iguais', valor: T.iguais, detalhe: 'já importados (não duplica)' },
      { rotulo: 'A gravar', valor: F.moeda(T.valorGravar), detalhe: `${T.repetidasFora} repetido(s) fora · ${T.ignoradas} ignorado(s) · ${T.bloqueadas} bloqueado(s)`, status: T.bloqueadas ? 'serio' : null }
    ]);
    A.alertas(pv, X.avisos.map(a => ({ nivel: a.nivel, titulo: a.texto })), { vazio: 'Nenhum aviso. ✓', max: 12 });
    A.tabela(pv, [{ chave: 'rotulo', rotulo: 'Subetapa / item' }, { chave: 'previsto', rotulo: 'Previsto (plano)', num: true, fmt: F.moeda },
      { chave: 'cabExecutado', rotulo: 'Executado (cabeçalho)', num: true, fmt: F.moeda }, { chave: 'planilha', rotulo: 'Soma na planilha', num: true, fmt: F.moeda },
      { chave: 'gravar', rotulo: 'Importado', num: true, fmt: F.moeda }, { chave: 'sistema', rotulo: 'Já no sistema', num: true, fmt: F.moeda },
      { chave: 'novos', rotulo: 'Novos', num: true, fmt: F.int }, { chave: 'iguais', rotulo: 'Iguais', num: true, fmt: F.int }, { chave: 'alterados', rotulo: 'Alterados', num: true, fmt: F.int },
      { chave: 'diarias', rotulo: 'Diárias equiv.', num: true, fmt: (x, l) => `${F.num(x, 1)} de ${F.int(l.quantidadePrevista)}` },
      { chave: 'avisos', rotulo: 'Avisos', fmt: x => x.length ? x.join('; ') : '—' }],
      X.itens.map(y => Object.assign({ rotulo: `${y.id} ${y.nome}` }, y)), { id: 'conv-imp-itens', titulo: 'Por subetapa (item do plano)', limite: 40, busca: false });
    if (X.soma) A.tabela(pv, [{ chave: 'etapa', rotulo: 'Etapa' }, { chave: 'soma', rotulo: 'Aba SOMA', num: true, fmt: F.moeda }, { chave: 'planilha', rotulo: 'Soma das abas', num: true, fmt: F.moeda },
      { chave: 'ok', rotulo: 'Confere', html: x => x ? '<span class="pn-selo bom">confere</span>' : '<span class="pn-selo atencao">diverge</span>' }],
      X.soma.etapas.concat([{ etapa: 'TOTAL', soma: X.soma.total.soma, planilha: X.soma.total.planilha, ok: X.soma.total.ok }]), { id: 'conv-imp-soma', titulo: 'Conferência com a aba SOMA', limite: 20, busca: false });
    const dec = X.linhas.filter(l => !l.dataPlanilha || l.repetido || l.status === 'bloqueada');
    if (dec.length) {
      const d = A.el('div', 'pn-cartao pn-conv-imp-dec'); d.id = 'pn-conv-imp-dec';
      d.innerHTML = `<h3>Linhas que pedem decisão</h3><ul>${dec.map(l => {
        const id = esc(l.lid), base = `<b>${esc(l.aba)}</b>, linha ${l.linha} · memo ${esc(l.memo || '—')} · ${esc(l.tipo || '—')} · ${F.moeda(l.valor)}`;
        if (l.status === 'bloqueada' && l.bloqueio !== 'escolha a data') return `<li data-lid="${id}">${base} · data ${dataBR(l.data)} — <span class="pn-selo serio">bloqueada: ${esc(l.bloqueio)}</span></li>`;
        if (!l.dataPlanilha) return `<li data-lid="${id}">${base} — <span class="pn-selo atencao">sem data</span> <label>Data <input type="date" data-imp-data data-lid="${id}" min="${c.vigencia.inicio}" max="${c.vigencia.fim}" value="${esc(l.data || '')}"></label>
          <label><input type="checkbox" data-imp-ign data-lid="${id}" ${E.imp.op.ignorar[l.lid] ? 'checked' : ''}> ignorar</label></li>`;
        return `<li data-lid="${id}">${base} · data ${dataBR(l.data)} — <span class="pn-selo atencao">memorando repetido</span> <label><input type="checkbox" data-imp-rep data-lid="${id}" ${E.imp.op.repetidos[l.lid] ? 'checked' : ''}> importar mesmo assim</label></li>`;
      }).join('')}</ul>`;
      pv.appendChild(d);
    }
    if (X.ausentes.length) {
      const d = A.el('div', 'pn-cartao pn-conv-imp-dec'); d.id = 'pn-conv-imp-ausentes';
      d.innerHTML = `<h3>No sistema mas não na planilha</h3><p class="pn-sub">Importados antes e que não estão mais na planilha. Não são apagados sozinhos: marque para excluir.</p><ul>${X.ausentes.map(f =>
        `<li>${esc(f.item)} · ${esc(f.documento || '—')} · ${dataBR(f.data)} · ${F.moeda(f.valor)} <label><input type="checkbox" data-imp-exc data-id="${esc(f.id)}" ${f.excluir ? 'checked' : ''}> excluir</label></li>`).join('')}</ul>`;
      pv.appendChild(d);
    }
    const det = A.el('details', 'pn-conv-imp-linhas'); det.innerHTML = `<summary>Ver os ${T.linhas} lançamentos da planilha</summary>`; pv.appendChild(det);
    const ST = { novo: 'Novo', igual: 'Igual (já importado)', alterado: 'Alterado', repetida: 'Repetido (fora)', bloqueada: 'Bloqueado', ignorada: 'Ignorado' };
    A.tabela(det, [{ chave: 'aba', rotulo: 'Aba' }, { chave: 'linha', rotulo: 'Linha', num: true, fmt: F.int }, { chave: 'data', rotulo: 'Data', fmt: dataBR },
      { chave: 'memo', rotulo: 'Memo', fmt: x => x || '—' }, { chave: 'tipo', rotulo: 'Tipo', fmt: x => x || '—' }, { chave: 'sub', rotulo: 'Subetapa' },
      { chave: 'valor', rotulo: 'Valor', num: true, fmt: F.moeda }, { chave: 'quantidade', rotulo: 'Diárias', num: true, fmt: x => x == null ? '—' : F.num(x, 1) },
      { chave: 'status', rotulo: 'Situação', fmt: x => ST[x] || x }, { chave: 'avisos', rotulo: 'Avisos', fmt: (x, l) => [l.bloqueio].concat(x).filter(Boolean).join('; ') || '—' }],
      X.linhas, { id: 'conv-imp-linhas', limite: 30, simples: true });
    const n = X.envio.length, ac = A.el('div', 'pn-conv-acoes pn-conv-imp-acoes');
    ac.innerHTML = `<button type="button" class="pn-btn pn-btn-prim" data-conv="imp-gravar" id="pn-conv-imp-gravar" ${n || X.excluir.length ? '' : 'disabled'}>${n ? `Gravar ${n} lançamento(s)` : 'Nada novo para gravar'}${X.excluir.length ? ` e excluir ${X.excluir.length}` : ''}</button>
      <button type="button" class="pn-btn" data-conv="imp-cancelar">Cancelar</button>`;
    pv.appendChild(ac);
  }
  async function gravarImp(raiz, visao) {
    if (!E.imp || E.imp.enviando) return;
    const X = E.imp.P, c = cfg(), lotes = [];
    for (let i = 0; i < X.envio.length; i += IMP_LOTE) lotes.push(X.envio.slice(i, i + IMP_LOTE));
    if (!lotes.length) lotes.push([]);
    const tot = { novos: 0, atualizados: 0, iguais: 0, excluidos: 0, valor: 0, arquivo: E.imp.arquivo };
    E.imp.enviando = true; const b = raiz.querySelector('#pn-conv-imp-gravar'); if (b) b.disabled = true;
    try {
      for (let i = 0; i < lotes.length; i++) {
        msg(raiz, 'imp', `Gravando… lote ${i + 1} de ${lotes.length}`, '');
        const j = await A.chamar({ action: 'admConvFinImportar', convenio: c.id, arquivo: E.imp.arquivo, itens: lotes[i], excluir: i === lotes.length - 1 ? X.excluir : [] });
        ['novos', 'atualizados', 'iguais', 'excluidos'].forEach(k => { tot[k] += j[k] || 0; });
        tot.valor += (j.lancamentos || []).reduce((s, l) => s + Number(l.valor || 0), 0);
      }
      tot.iguais += X.totais.iguais;
      E.impResumo = tot; E.imp = null;
      E.msg.imp = { t: `Importado ✓ ${tot.novos} novo(s), ${tot.atualizados} atualizado(s), ${tot.excluidos} excluído(s).`, cls: 'ok' };
      E.d = await A.dados(true);
      desenhar(raiz, visao);
    } catch (err) {
      if (!A.logado) return;
      E.imp.enviando = false; msg(raiz, 'imp', 'Não gravou: ' + err.message + ' (o que já foi gravado não duplica ao repetir).', 'erro'); if (b) b.disabled = false;
    }
  }

  A.registrarAba({ id: 'desembolso', titulo: 'Desembolso do convênio', render: c => abrir(c, 'fin') });
  A.registrarAba({ id: 'fisico', titulo: 'Físico do convênio', render: c => abrir(c, 'lanc') });
  window.AdmConvenio = { estado: () => ({ dados: E.d, imp: E.imp && E.imp.P, impResumo: E.impResumo }) };
})();
