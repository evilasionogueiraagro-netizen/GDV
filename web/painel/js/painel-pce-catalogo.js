/* Catálogo do PCE no painel (aba PCE → "Culturas" e "Doenças e pragas"): lista à esquerda, detalhe à direita. Lê quem tem o módulo PCE;
   edita quem tem gerência + PCE (o servidor confere). Actions painelPceCatalogo e painelPceCatalogoSalvar (pce-catalogo.gs). As pragas de
   uma cultura são as da família dela + as ligadas só a ela; a praga é o programa (um Termo), menos as que dividem um (campo programa, ex.: Citros). Os aparelhos recebem o catálogo na próxima sincronização. */
(function () {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const MODELOS = { citros: 'Citros', banana: 'Banana', moniliase: 'Cacau e cupuaçu (monilíase)', mandioca: 'Mandioca', soja: 'Soja', propriedade: 'Propriedade (geral)' };
  const TIPOS = { doenca: 'Doença', praga: 'Praga' };
  const ST = { cat: null, podeEditar: false, sel: { culturas: '', pragas: '' }, busca: { culturas: '', pragas: '' }, erro: '', carregando: null };

  async function carregar(forcar) {
    if (ST.cat && !forcar) return;
    if (!ST.carregando) ST.carregando = P.chamar({ action: 'painelPceCatalogo' }).then(r => { ST.cat = r.catalogo; ST.podeEditar = !!r.podeEditar; ST.erro = ''; })
      .catch(e => { ST.erro = e.message; }).finally(() => { ST.carregando = null; });
    return ST.carregando;
  }

  /* ---------- consultas ao catálogo ---------- */
  const familia = id => (ST.cat.familias || []).find(f => f.id === id);
  const cultura = id => ST.cat.culturas.find(c => c.id === id);
  const praga = id => ST.cat.pragas.find(p => p.id === id);
  /** Pragas da cultura com a origem da ligação: [{praga, porFamilia: bool, direta: bool}] (só pragas ativas). */
  function pragasDaCultura(c) {
    const out = [], pega = (id, campo) => { const p = praga(id); if (!p || !p.ativo) return; let o = out.find(x => x.praga.id === id); if (!o) out.push(o = { praga: p, porFamilia: false, direta: false }); o[campo] = true; };
    if (c.familiaId) ST.cat.pragasDasFamilias.forEach(l => { if (l.familiaId === c.familiaId) pega(l.pragaId, 'porFamilia'); });
    ST.cat.pragasDasCulturas.forEach(l => { if (l.culturaId === c.id) pega(l.pragaId, 'direta'); });
    return out.sort((a, b) => a.praga.nomePopular.localeCompare(b.praga.nomePopular, 'pt-BR'));
  }
  const familiasDaPraga = p => ST.cat.pragasDasFamilias.filter(l => l.pragaId === p.id).map(l => l.familiaId);
  const culturasDaPraga = p => ST.cat.pragasDasCulturas.filter(l => l.pragaId === p.id).map(l => l.culturaId);
  const nCulturas = p => new Set(ST.cat.culturas.filter(c => familiasDaPraga(p).includes(c.familiaId)).map(c => c.id).concat(culturasDaPraga(p))).size;
  const quando = (em, por) => !em || por === 'base do sistema' ? 'Base do sistema (ainda não alterado no painel)'
    : `Alterado por ${esc(por || '—')} em ${esc(new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  /* ---------- montagem ---------- */
  function cabeca(c, ic, titulo, desc, botao) {
    const h = P.el('div', 'pn-cat-cabeca');
    h.innerHTML = `<div><h2>${ic && typeof icone === 'function' ? icone(ic) : ''} ${esc(titulo)}</h2><p>${esc(desc)}</p></div>`;
    if (botao) h.appendChild(botao);
    c.appendChild(h);
  }
  function listaHTML(grupos, selId, campoNome, contador) {
    return grupos.map(([g, itens]) => `${g ? `<div class="pn-cat-grupo">${esc(g)}</div>` : ''}${itens.map(x =>
      `<button type="button" class="pn-cat-item${x.id === selId ? ' on' : ''}${x.ativo ? '' : ' inativo'}" data-cat-sel="${esc(x.id)}">${esc(x[campoNome])}<small>${esc(x.ativo ? contador(x) : 'desativada')}</small></button>`).join('')}`).join('')
      || '<p class="pn-sub">Nada encontrado.</p>';
  }
  const campo = (id, rot, v, attrs = '') => `<label class="pn-conv-campo">${rot}<input id="${id}" value="${esc(v || '')}" autocomplete="off" ${attrs}></label>`;
  const selecao = (id, rot, ops, v, attrs = '') => `<label class="pn-conv-campo">${rot}<select id="${id}" ${attrs}>${ops.map(([x, t]) => `<option value="${esc(x)}" ${x === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

  function render(c, visao) {
    c.innerHTML = '';
    if (!ST.cat) {
      c.appendChild(P.el('p', 'pn-sub', ST.erro ? esc(ST.erro) : 'Carregando o catálogo do PCE…'));
      if (!ST.erro) carregar().then(() => { if (c.isConnected) render(c, visao); });
      return;
    }
    if (visao === 'pragas') renderPragas(c); else renderCulturas(c);
  }

  function renderCulturas(c) {
    const ed = ST.podeEditar, dis = ed ? '' : 'disabled';
    const nova = ed ? Object.assign(P.el('button', 'pn-btn pn-btn-prim', '+ Nova cultura'), { type: 'button', onclick: () => { ST.sel.culturas = '+'; render(c, 'culturas'); } }) : null;
    cabeca(c, 'broto', 'Culturas', 'Cada cultura traz para o app as doenças e pragas ligadas a ela (pela família ou direto).', nova);
    const q = k(ST.busca.culturas), todas = ST.cat.culturas.filter(x => !q || k(x.nome).includes(q));
    const grupos = ST.cat.familias.map(f => [f.nome, todas.filter(x => x.familiaId === f.id)]).filter(g => g[1].length)
      .concat([['Sem família', todas.filter(x => !x.familiaId || !familia(x.familiaId))]]).filter(g => g[1].length)
      .map(([g, l]) => [g, l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))]);
    if (!ST.sel.culturas && grupos.length) ST.sel.culturas = grupos[0][1][0].id;
    const atual = ST.sel.culturas === '+' ? { id: '', nome: '', nomeCientifico: '', familiaId: '', cultivares: '', ativo: 1, novo: true } : cultura(ST.sel.culturas);
    const dois = P.el('div', 'pn-cat-dois'); c.appendChild(dois);
    const lista = P.el('div', 'pn-cartao pn-cat-lista');
    lista.innerHTML = `<input type="search" class="pn-cat-busca" placeholder="Buscar cultura" aria-label="Buscar cultura" value="${esc(ST.busca.culturas)}">
      <div class="pn-cat-itens">${listaHTML(grupos, ST.sel.culturas, 'nome', x => plural(pragasDaCultura(x).length, 'praga', 'pragas'))}</div>`;
    dois.appendChild(lista);
    const det = P.el('div', 'pn-cartao pn-cat-detalhe'); dois.appendChild(det);
    ligarLista(c, lista, 'culturas');
    if (!atual) { det.appendChild(P.el('p', 'pn-sub', 'Escolha uma cultura.')); return; }
    const ps = atual.novo ? [] : pragasDaCultura(atual), fam = familia(atual.familiaId);
    const fora = ST.cat.pragas.filter(p => p.ativo && !ps.some(x => x.praga.id === p.id)).sort((a, b) => a.nomePopular.localeCompare(b.nomePopular, 'pt-BR'));
    let diretas = ps.filter(x => x.direta).map(x => x.praga.id);
    det.innerHTML = `<div class="pn-cat-topo"><h3>${esc(atual.novo ? 'Nova cultura' : atual.nome)}</h3>${ed ? `<div class="pn-cat-acoes">
        <button type="button" class="pn-btn pn-btn-prim" id="pn-cat-salvar">Salvar</button></div>` : ''}</div>
      <div class="pn-cat-secao">Dados da cultura</div>
      <div class="pn-cat-form">${campo('pn-cat-nome', 'Nome *', atual.nome, `maxlength="60" ${dis}`)}
        ${selecao('pn-cat-fam', 'Família', [['', 'Sem família (cadastro de propriedade)']].concat(ST.cat.familias.filter(f => f.ativo || f.id === atual.familiaId).map(f => [f.id, f.nome])), atual.familiaId, dis)}
        ${campo('pn-cat-cient', 'Nome científico', atual.nomeCientifico, `maxlength="120" ${dis}`)}
        ${selecao('pn-cat-ativo', 'Situação', [['1', 'Ativa (aparece no app)'], ['0', 'Desativada']], atual.ativo ? '1' : '0', dis)}
        <div class="larga">${campo('pn-cat-cultivares', 'Cultivares sugeridas (texto livre no app, separadas por vírgula)', atual.cultivares, `maxlength="300" ${dis}`)}</div></div>
      ${atual.novo ? '' : `<div class="pn-cat-secao">Doenças e pragas ligadas <small>${plural(ps.length, 'no app para esta cultura', 'no app para esta cultura')}</small></div>
      <div class="pn-tab"><div class="pn-tab-rolo"><table><thead><tr><th>Doença / praga</th><th>Nome científico</th><th>Tipo</th><th>Ligada por</th><th></th></tr></thead><tbody id="pn-cat-ps">
      ${ps.map(x => `<tr><td>${esc(x.praga.nomePopular)}</td><td><i>${esc(x.praga.nomeCientifico || '—')}</i></td><td>${esc(TIPOS[x.praga.tipo] || '—')}</td>
        <td>${x.porFamilia ? `<span class="pn-cat-chip fam">família ${esc(fam ? fam.nome : '')}</span> ` : ''}${x.direta ? `<span class="pn-cat-chip">só ${esc(atual.nome)}</span>` : ''}</td>
        <td>${ed && x.direta ? `<button type="button" class="pn-btn pn-btn-mini" data-cat-desligar="${esc(x.praga.id)}">Desligar</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="5" class="pn-sub">Nenhuma praga ligada: no app, o fiscal informa a praga em "+ Outra praga".</td></tr>'}</tbody></table></div></div>
      ${ed ? `<div class="pn-cat-ligar"><select id="pn-cat-ligar-sel" aria-label="Praga para ligar"><option value="">Ligar outra doença ou praga a esta cultura…</option>
        ${fora.map(p => `<option value="${esc(p.id)}">${esc(p.nomePopular)}</option>`).join('')}</select><button type="button" class="pn-btn" id="pn-cat-ligar">+ Ligar</button></div>` : ''}`}
      <p class="pn-dlg-erro" id="pn-cat-erro" role="alert"></p>
      <div class="pn-cat-rodape">${atual.novo ? '' : quando(atual.atualizadoEm, atual.atualizadoPor)}</div>`;
    if (!ed) return;
    const qd = s => det.querySelector(s);
    const salvar = async extra => {
      const item = { id: atual.id, nome: qd('#pn-cat-nome').value, familiaId: qd('#pn-cat-fam').value, nomeCientifico: qd('#pn-cat-cient').value,
                     cultivares: qd('#pn-cat-cultivares').value, ativo: qd('#pn-cat-ativo').value === '1', ...(atual.novo ? {} : { pragas: diretas }), ...extra };
      await gravar(c, 'culturas', 'cultura', item, det);
    };
    qd('#pn-cat-salvar').onclick = () => salvar();
    det.querySelectorAll('[data-cat-desligar]').forEach(b => { b.onclick = () => { diretas = diretas.filter(id => id !== b.dataset.catDesligar); salvar(); }; });
    if (qd('#pn-cat-ligar')) qd('#pn-cat-ligar').onclick = () => { const v = qd('#pn-cat-ligar-sel').value; if (v) { diretas = diretas.concat(v); salvar(); } };
  }

  function renderPragas(c) {
    const ed = ST.podeEditar, dis = ed ? '' : 'disabled';
    const nova = ed ? Object.assign(P.el('button', 'pn-btn pn-btn-prim', '+ Nova doença ou praga'), { type: 'button', onclick: () => { ST.sel.pragas = '+'; render(c, 'pragas'); } }) : null;
    cabeca(c, 'praga', 'Doenças e pragas', 'Cada praga é um programa (um Termo de Fiscalização), menos as que dividem um, como as de citros: enquadramento legal, programa e as culturas que ela afeta.', nova);
    const q = k(ST.busca.pragas), todas = ST.cat.pragas.filter(x => !q || k(x.nomePopular + ' ' + x.nomeCientifico).includes(q));
    const grupos = [['Doenças', todas.filter(x => x.tipo === 'doenca')], ['Pragas', todas.filter(x => x.tipo !== 'doenca')]].filter(g => g[1].length)
      .map(([g, l]) => [g, l.sort((a, b) => a.nomePopular.localeCompare(b.nomePopular, 'pt-BR'))]);
    if (!ST.sel.pragas && grupos.length) ST.sel.pragas = grupos[0][1][0].id;
    const atual = ST.sel.pragas === '+' ? { id: '', nomePopular: '', nomeCientifico: '', tipo: 'praga', enquadramentoLegal: '', nomeNoTF: '', programa: '', ativo: 1, novo: true } : praga(ST.sel.pragas);
    const dois = P.el('div', 'pn-cat-dois'); c.appendChild(dois);
    const lista = P.el('div', 'pn-cartao pn-cat-lista');
    lista.innerHTML = `<input type="search" class="pn-cat-busca" placeholder="Buscar doença ou praga" aria-label="Buscar doença ou praga" value="${esc(ST.busca.pragas)}">
      <div class="pn-cat-itens">${listaHTML(grupos, ST.sel.pragas, 'nomePopular', x => plural(nCulturas(x), 'cultura', 'culturas'))}</div>`;
    dois.appendChild(lista);
    const det = P.el('div', 'pn-cartao pn-cat-detalhe'); dois.appendChild(det);
    ligarLista(c, lista, 'pragas');
    if (!atual) { det.appendChild(P.el('p', 'pn-sub', 'Escolha uma doença ou praga.')); return; }
    let fams = atual.novo ? [] : familiasDaPraga(atual), cults = atual.novo ? [] : culturasDaPraga(atual);
    const desenharLigacoes = () => {
      const chips = fams.map(id => { const f = familia(id); const cs = ST.cat.culturas.filter(x => x.familiaId === id).map(x => x.nome).join(', ');
        return `<span class="pn-cat-chip fam">família ${esc(f ? f.nome : id)} <i>(${esc(cs || 'sem culturas')})</i>${ed ? ` <button type="button" aria-label="Desligar família" data-cat-tira-fam="${esc(id)}">×</button>` : ''}</span>`; })
        .concat(cults.map(id => { const x = cultura(id);
          return `<span class="pn-cat-chip">${esc(x ? x.nome : id)}${ed ? ` <button type="button" aria-label="Desligar cultura" data-cat-tira-cult="${esc(id)}">×</button>` : ''}</span>`; }));
      det.querySelector('#pn-cat-chips').innerHTML = chips.join('') || '<span class="pn-sub">Nenhuma cultura: a praga não aparece sozinha no app.</span>';
      det.querySelectorAll('[data-cat-tira-fam]').forEach(b => { b.onclick = () => { fams = fams.filter(x => x !== b.dataset.catTiraFam); desenharLigacoes(); }; });
      det.querySelectorAll('[data-cat-tira-cult]').forEach(b => { b.onclick = () => { cults = cults.filter(x => x !== b.dataset.catTiraCult); desenharLigacoes(); }; });
    };
    det.innerHTML = `<div class="pn-cat-topo"><h3>${esc(atual.novo ? 'Nova doença ou praga' : atual.nomePopular)}</h3>${ed ? `<div class="pn-cat-acoes">
        <button type="button" class="pn-btn pn-btn-prim" id="pn-cat-salvar">Salvar</button></div>` : ''}</div>
      <div class="pn-cat-secao">Identificação</div>
      <div class="pn-cat-form">${campo('pn-cat-nome', 'Nome popular *', atual.nomePopular, `maxlength="80" ${dis}`)}
        ${campo('pn-cat-cient', 'Nome científico', atual.nomeCientifico, `maxlength="120" ${dis}`)}
        ${selecao('pn-cat-tipo', 'Tipo', Object.entries(TIPOS), atual.tipo, dis)}
        ${campo('pn-cat-tf', 'Nome no quadro do Termo (vazio = fora do quadro)', atual.nomeNoTF, `maxlength="60" ${dis}`)}
        ${campo('pn-cat-prog', 'Programa que divide com outras pragas (vazio = programa próprio)', atual.programa || '', `maxlength="60" list="pn-cat-progs" placeholder="ex.: Citros" ${dis}`)}
        ${selecao('pn-cat-lev', 'Levantamento no campo', [['1', 'Sim (aparece nas culturas do levantamento)'], ['0', 'Não (ausente no Brasil: só educação sanitária)']], Number(atual.levantamento) === 0 ? '0' : '1', dis)}
        ${selecao('pn-cat-opc', 'No Termo de Fiscalização', [['0', 'Gera Termo (resposta obrigatória no levantamento)'], ['1', 'Campo opcional (sem Termo próprio)']], Number(atual.opcional) === 1 ? '1' : '0', dis)}
        <datalist id="pn-cat-progs">${[...new Set(ST.cat.pragas.map(x => x.programa).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        ${selecao('pn-cat-ativo', 'Situação', [['1', 'Ativa (aparece no app)'], ['0', 'Desativada']], atual.ativo ? '1' : '0', dis)}</div>
      <div class="pn-cat-secao">Enquadramento legal <small>vai no Termo quando detectada ou suspeita</small></div>
      <textarea id="pn-cat-enq" rows="3" maxlength="1000" ${dis} aria-label="Enquadramento legal">${esc(atual.enquadramentoLegal)}</textarea>
      <div class="pn-cat-secao">Culturas afetadas</div>
      <div class="pn-cat-chips" id="pn-cat-chips"></div>
      ${ed ? `<div class="pn-cat-ligar"><select id="pn-cat-fam-sel" aria-label="Família para ligar"><option value="">Ligar família…</option>${ST.cat.familias.filter(f => f.ativo).map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('')}</select>
        <select id="pn-cat-cult-sel" aria-label="Cultura para ligar"><option value="">Ligar cultura…</option>${ST.cat.culturas.filter(x => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(x => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></div>` : ''}
      <p class="pn-dlg-erro" id="pn-cat-erro" role="alert"></p>
      <div class="pn-cat-rodape">${atual.novo ? '' : quando(atual.atualizadoEm, atual.atualizadoPor)}</div>`;
    desenharLigacoes();
    if (!ed) return;
    const qd = s => det.querySelector(s);
    qd('#pn-cat-fam-sel').onchange = e => { const v = e.target.value; if (v && !fams.includes(v)) fams.push(v); e.target.value = ''; desenharLigacoes(); };
    qd('#pn-cat-cult-sel').onchange = e => { const v = e.target.value; if (v && !cults.includes(v)) cults.push(v); e.target.value = ''; desenharLigacoes(); };
    qd('#pn-cat-salvar').onclick = () => gravar(c, 'pragas', 'praga', { id: atual.id, nomePopular: qd('#pn-cat-nome').value, nomeCientifico: qd('#pn-cat-cient').value,
      tipo: qd('#pn-cat-tipo').value, nomeNoTF: qd('#pn-cat-tf').value, programa: qd('#pn-cat-prog').value, levantamento: qd('#pn-cat-lev').value === '1', opcional: qd('#pn-cat-opc').value === '1', enquadramentoLegal: qd('#pn-cat-enq').value, ativo: qd('#pn-cat-ativo').value === '1',
      familias: fams, culturas: cults }, det);
  }

  function ligarLista(c, lista, visao) {
    lista.querySelectorAll('[data-cat-sel]').forEach(b => { b.onclick = () => { ST.sel[visao] = b.dataset.catSel; render(c, visao); }; });
    const busca = lista.querySelector('.pn-cat-busca');
    busca.oninput = () => { ST.busca[visao] = busca.value; const pos = busca.selectionStart; render(c, visao); const n = c.querySelector('.pn-cat-busca'); n.focus(); n.setSelectionRange(pos, pos); };
  }

  async function gravar(c, visao, tipo, item, det) {
    const b = det.querySelector('#pn-cat-salvar'); b.disabled = true;
    try {
      const r = await P.chamar({ action: 'painelPceCatalogoSalvar', tipo, item });
      ST.cat = r.catalogo; ST.sel[visao] = r.item.id;
      P.toast(`${r.item.nome || r.item.nomePopular} salvo. Os aparelhos recebem na próxima sincronização.`);
      render(c, visao);
    } catch (e) { det.querySelector('#pn-cat-erro').textContent = e.message; b.disabled = false; }
  }

  window.PainelPceCatalogo = { render, recarregar: () => carregar(true), get catalogo() { return ST.cat; } };
})();
