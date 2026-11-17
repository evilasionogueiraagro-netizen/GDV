// Módulo Termo de Educação Sanitária (permissão educacaoSanitaria; módulo "educacao"): independente do turno, do TF de barreira e do PCE.
// Telas: lista "Meus termos", "Novo termo" (rascunho automático), termo aberto (Imprimir/PDF, Gerar arquivo PDF, Cancelar) e "Meus dados" do servidor.
// Numeração "NNN.AAAA.UNIDADE" (unidade = lotação): online a planilha confirma o número (educacaoRegistrar); sem internet o número é provisório e a
// planilha confere ao sincronizar (repetido = conflito). Registros na store "termosEducacao" (aba TermosEducacao). Regras: docs/modulos/educacao-sanitaria.md.
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, hojeISO, agoraHM, avisoAtivacao) em tempo de execução.
const EducacaoUI = (() => {
  const P = CONFIG.PCE;
  const META = 'educacaoServidor', RASC = 'educacaoRascunho', OUTRO = 'Outro', OUTRO_CARGO = '__outro__';
  const MAX_DESC = 1800, MAX_OBS = 600;                                    // cabem numa folha do modelo (documentos/educacao-termo.html)
  const unid = u => Sync.unidadePce(u);
  const chave = (u, a) => unid(u) + '|' + a;
  const numTxt = (n, a, u) => `${String(n).padStart(3, '0')}.${a}.${unid(u)}`;
  const lerJSON = (v, pad) => { try { const r = JSON.parse(v); return Array.isArray(r) ? r : pad; } catch (e) { return pad; } };
  const online = () => navigator.onLine && Sync.ativado();
  const bloqueado = () => !Sync.ativado() || localStorage.getItem('gdv.revogado');
  const programas = () => ((P.termo || {}).programasRelatorio || []).map(p => p.nome);
  const opts = (lista, atual, vazio) => `<option value="">${esc(vazio)}</option>` + lista.map(x => `<option ${x === atual ? 'selected' : ''}>${esc(x)}</option>`).join('') +
    (atual && !lista.includes(atual) ? `<option selected>${esc(atual)}</option>` : '');

  /* ---------- servidor ("Meus dados"): guardado no aparelho e copiado para cada termo ---------- */
  const servidorOk = s => !!(s && s.nome && s.cargo && s.lotacao);
  async function servidorAtual() {
    const s = await Store.meta(META);
    if (servidorOk(s)) return s;
    const pce = await Store.meta('pceServidor');                          // quem já se identificou no PCE aproveita os dados (cópia; os módulos não se misturam)
    return servidorOk(pce) ? { nome: pce.nome, cargo: pce.cargo, matricula: pce.matricula || '', lotacao: pce.lotacao, sugerido: 1 } : (s || null);
  }
  async function exigirServidor(voltar, arg) {
    const s = await Store.meta(META);
    if (servidorOk(s)) return s;
    go('educacaoservidor', { voltar, arg });
    return null;
  }
  const cargoHTML = (id, atual) => {
    const naLista = !atual || P.cargos.includes(atual);
    return `<select id="${id}" data-edu-cargo>${opts(P.cargos, naLista ? atual : '', 'Selecione')}<option value="${OUTRO_CARGO}" ${naLista ? '' : 'selected'}>Outro (digitar)</option></select>
      <input id="${id}-outro" placeholder="Digite o cargo" autocomplete="off" value="${naLista ? '' : esc(atual)}" ${naLista ? 'hidden' : ''}>`;
  };
  const cargoValor = id => { const s = $('#' + id); return !s ? '' : s.value === OUTRO_CARGO ? ($('#' + id + '-outro').value || '').trim().replace(/\s+/g, ' ') : s.value; };
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('select[data-edu-cargo]')) return;
    const t = $('#' + e.target.id + '-outro'); if (!t) return;
    t.hidden = e.target.value !== OUTRO_CARGO; if (!t.hidden) t.focus();
  });
  async function servidor(o) {
    if (bloqueado()) return view(avisoAtivacao());
    o = o || {};
    const s = (await servidorAtual()) || {}, u = Sync.usuario() || {}, primeira = !servidorOk(await Store.meta(META));
    view(`<form class="card" id="eduServForm" autocomplete="off"><h3>${icone('pessoa')} Identificação do servidor</h3>
      <p class="dica" style="text-align:left">${primeira ? 'Antes de começar, informe seus dados. ' : ''}Eles ficam neste aparelho e são copiados para cada termo no momento em que é criado.</p>
      <label>Nome do servidor *<input id="edu-s-nome" value="${esc(s.nome || Sync.nome())}" placeholder="Nome completo"></label>
      <label>Cargo *${cargoHTML('edu-s-cargo', s.cargo)}</label>
      <label>Matrícula<input id="edu-s-matricula" value="${esc(s.matricula || u.matricula || '')}" autocapitalize="characters" autocomplete="off" maxlength="30"></label>
      <label>Lotação (município) *<select id="edu-s-lotacao">${opts(P.municipios, s.lotacao, 'Selecione')}</select></label>
      <button class="botao" type="submit" id="edu-s-salvar">${icone('salvar')} Salvar</button>
      ${primeira ? '' : '<button class="botao sec" type="button" data-v="educacao">Voltar</button>'}</form>`);
    $('#eduServForm').onsubmit = async e => {
      e.preventDefault();
      const d = { nome: $('#edu-s-nome').value.trim().replace(/\s+/g, ' '), cargo: cargoValor('edu-s-cargo'), matricula: $('#edu-s-matricula').value.trim(), lotacao: $('#edu-s-lotacao').value };
      if (d.nome.split(' ').length < 2) return toast('Informe o nome completo (nome e sobrenome).', true);
      if (!d.cargo) return toast('Escolha o cargo (ou "Outro" e digite).', true);
      if (!d.lotacao) return toast('Escolha a lotação.', true);
      await Store.setMeta(META, d);
      toast('Dados do servidor salvos.');
      go(o.voltar || 'educacao', o.arg);
    };
  }

  /* ---------- numeração (online: planilha confirma; sem internet: provisório) ---------- */
  async function ultimoLocal(u, a) {
    const uv = ((await Store.meta('ultimoVistoEducacao')) || {})[chave(u, a)] || 0;
    const loc = (await Store.todos('termosEducacao')).filter(r => unid(r.unidade) === unid(u) && Number(r.ano) === a).reduce((m, r) => Math.max(m, Number(r.numero) || 0), 0);
    return Math.max(uv, loc);
  }
  const erroDeRede = e => Envio.erroDeRede(e) || e instanceof SyntaxError;
  async function gravarLocal(rec, pendente) {
    if (pendente) return Store.salvar('termosEducacao', { ...rec });
    return Store.gravar('termosEducacao', { ...rec, pendente: 0 });
  }
  /** Define o número do termo (rec ainda sem número), grava no aparelho e devolve o registro gravado. */
  async function numerar(rec) {
    const u = unid(rec.unidade), a = Number(String(rec.data).slice(0, 4)) || new Date().getFullYear();
    let sug = null;
    if (online()) {
      try { const r = await Sync.educacaoProximoNumero(u, a); await Sync.lembrarUltimosEducacao({ [chave(u, a)]: r.ultimo }); sug = { numero: Math.max(r.proximo, (await ultimoLocal(u, a)) + 1), origem: 'servidor' }; }
      catch (e) { if (!erroDeRede(e)) throw e; }                            // sem resposta: segue offline
    }
    if (!sug) sug = { numero: (await ultimoLocal(u, a)) + 1, origem: 'offline' };
    let n = sug.numero;
    for (let t = 0; t < 8; t++) {
      const locais = (await Store.todos('termosEducacao')).filter(r => r.id !== rec.id && unid(r.unidade) === u && Number(r.ano) === a);
      while (locais.some(r => Number(r.numero) === n)) n++;
      Object.assign(rec, { unidade: u, ano: a, numero: n, numeroTxt: numTxt(n, a, u), numeroSugerido: sug.numero, conflito: 0,
        numeroOrigem: sug.origem === 'servidor' ? (n === sug.numero ? 'sistema' : 'editado') : 'provisorio' });
      if (sug.origem === 'servidor') {
        let r = null;
        try { r = await Sync.educacaoRegistrar(rec); } catch (e) { if (!erroDeRede(e)) throw e; }
        if (r && r.emitido === false) { n = Math.max(n + 1, Number(r.proximo) || 0); continue; }   // outro servidor usou este número agora
        if (r) { const g = { ...rec, emitidoEm: r.emitidoEm, criadoEm: rec.criadoEm || Date.now(), atualizadoEm: rec.atualizadoEm || Date.now() }; await gravarLocal(g, 0); await Sync.lembrarUltimosEducacao({ [chave(u, a)]: n }); return g; }
      }
      const g = await gravarLocal({ ...rec, provisorio: sug.origem !== 'servidor' ? 1 : 0 }, 1);
      await Sync.lembrarUltimosEducacao({ [chave(u, a)]: n });
      return g;
    }
    throw new Error('Não foi possível definir o número do termo. Tente de novo.');
  }

  /* ---------- formulário (Novo termo) ---------- */
  let F = null, tRasc = null;
  const fechar = () => { if (F) F.vivo = false; clearTimeout(tRasc); };
  const marcados = (nome) => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map(x => x.value);
  /** Valores digitados (também o que vai para o rascunho). */
  function lerForm() {
    const g = id => ($('#' + id) || {}).value || '';
    return { data: g('edu-data'), hora: g('edu-hora'), municipio: g('edu-municipio'), local: g('edu-local'), tipoMedida: g('edu-medida'), tipoMedidaOutro: g('edu-medida-outro'),
      publicoAlvo: marcados('edu-publico'), publicoOutro: g('edu-publico-outro'), programas: marcados('edu-programa'), programaOutro: g('edu-programa-outro'),
      descricao: g('edu-descricao'), pessoas: g('edu-pessoas'), folders: g('edu-folders'), obs: g('edu-obs') };
  }
  function agendarRascunho(atraso = 400) {
    if (!F || !F.vivo) return;
    clearTimeout(tRasc);
    tRasc = setTimeout(() => {
      if (!F || !F.vivo) return;
      const v = lerForm(), vazio = !(v.local.trim() || v.tipoMedida || v.publicoAlvo.length || v.programas.length || v.descricao.trim() || v.pessoas || v.folders || v.obs.trim());
      Store.setMeta(RASC, vazio ? null : { id: F.id, em: F.em, v }).catch(() => {});      // formulário em branco não vira rascunho
    }, atraso);
  }
  const grupo = (nome, lista, atuais, outroId, outroTxt, titulo) => `<fieldset class="edu-grupo"><legend>${titulo}</legend>
    ${lista.map((x, i) => `<label class="chk"><input type="checkbox" name="${nome}" value="${esc(x)}" ${atuais.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}
    <label id="${outroId}-box" ${atuais.includes(OUTRO) ? '' : 'hidden'}>Qual? *<input id="${outroId}" maxlength="120" autocomplete="off" value="${esc(outroTxt)}"></label></fieldset>`;
  async function novo() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await exigirServidor('educacaonovo'); if (!s || !mostrar.viva()) return;
    fechar();
    const rasc = await Store.meta(RASC), r = rasc && rasc.v ? rasc : null, v = r ? r.v : {};
    F = { id: r ? r.id : Store.novoId(), em: r ? r.em : Date.now(), vivo: true };
    if (!mostrar.viva()) return;
    mostrar(`<form class="card" id="eduForm" autocomplete="off" novalidate><h3>${icone('manual')} Novo termo de educação sanitária</h3>
      ${r ? `<div class="aviso-info" id="edu-rascunho">${icone('info')} Rascunho recuperado (iniciado em ${esc(new Date(F.em).toLocaleString('pt-BR'))}). <button type="button" class="mini" data-edu="descartar">Descartar</button></div>` : ''}
      <div class="duas"><label>Data *<input type="date" id="edu-data" max="${hojeISO()}" value="${esc(v.data || hojeISO())}"></label>
        <label>Hora *<input type="time" id="edu-hora" value="${esc(v.hora || agoraHM())}"></label></div>
      <label>Município *<select id="edu-municipio">${opts(P.municipios, v.municipio || s.lotacao, 'Selecione')}</select></label>
      <label>Local da ação *<input id="edu-local" maxlength="200" placeholder="Escola, feira, porto, BVA…" value="${esc(v.local || '')}"></label>
      <label>Tipo de medida *<select id="edu-medida">${opts(EducacaoDocs.MEDIDAS, v.tipoMedida, 'Selecione')}</select></label>
      <label id="edu-medida-outro-box" ${v.tipoMedida === OUTRO ? '' : 'hidden'}>Qual? *<input id="edu-medida-outro" maxlength="120" autocomplete="off" value="${esc(v.tipoMedidaOutro || '')}"></label>
      ${grupo('edu-publico', EducacaoDocs.PUBLICOS, v.publicoAlvo || [], 'edu-publico-outro', v.publicoOutro || '', 'Público-alvo *')}
      ${grupo('edu-programa', programas().concat(OUTRO), v.programas || [], 'edu-programa-outro', v.programaOutro || '', 'Programas / pragas abordados *')}
      <label>Descrição da ação * <small id="edu-desc-n"></small><textarea id="edu-descricao" rows="5" maxlength="${MAX_DESC}">${esc(v.descricao || '')}</textarea></label>
      <div class="duas"><label>Pessoas orientadas *<input type="number" id="edu-pessoas" min="0" step="1" inputmode="numeric" value="${esc(v.pessoas || '')}" placeholder="0"></label>
        <label>Folders / flyers entregues<input type="number" id="edu-folders" min="0" step="1" inputmode="numeric" value="${esc(v.folders || '')}" placeholder="0"></label></div>
      <label>Observações<textarea id="edu-obs" rows="3" maxlength="${MAX_OBS}">${esc(v.obs || '')}</textarea></label>
      <p class="dica" style="text-align:left">Servidor: ${esc(s.nome)} · ${esc(s.cargo)} · ${esc(s.lotacao)}. <a href="#" data-edu="meusdados">Alterar meus dados</a></p>
      <button class="botao" type="submit" id="edu-gravar">${icone('salvar')} Gravar termo</button>
      <button class="botao sec" type="button" data-v="educacao" id="edu-voltar">Voltar (o rascunho fica guardado)</button></form>`);
    const form = $('#eduForm'), contar = () => { const n = $('#edu-desc-n'); if (n) n.textContent = `(${$('#edu-descricao').value.length}/${MAX_DESC})`; };
    contar();
    const outros = () => {
      $('#edu-medida-outro-box').hidden = $('#edu-medida').value !== OUTRO;
      ['publico', 'programa'].forEach(k => { $(`#edu-${k}-outro-box`).hidden = !marcados('edu-' + k).includes(OUTRO); });
    };
    form.addEventListener('input', () => { contar(); agendarRascunho(); });
    form.addEventListener('change', () => { outros(); agendarRascunho(); });
    form.onsubmit = e => { e.preventDefault(); gravar(); };
    agendarRascunho(0);
  }
  /** Confere os campos obrigatórios; devolve o texto do problema ou ''. */
  function problema(d) {
    const inteiro = x => /^\d+$/.test(String(x).trim());
    if (!d.data) return 'Informe a data.';
    if (d.data > hojeISO()) return 'A data não pode ser futura.';
    if (!/^\d{2}:\d{2}$/.test(d.hora)) return 'Informe a hora.';
    if (!d.municipio) return 'Escolha o município.';
    if (!d.local.trim()) return 'Informe o local da ação.';
    if (!d.tipoMedida) return 'Escolha o tipo de medida.';
    if (d.tipoMedida === OUTRO && !d.tipoMedidaOutro.trim()) return 'Descreva o tipo de medida (Outro).';
    if (!d.publicoAlvo.length) return 'Escolha o público-alvo.';
    if (d.publicoAlvo.includes(OUTRO) && !d.publicoOutro.trim()) return 'Descreva o público-alvo (Outro).';
    if (!d.programas.length) return 'Escolha os programas ou pragas abordados.';
    if (d.programas.includes(OUTRO) && !d.programaOutro.trim()) return 'Descreva o programa ou a praga (Outro).';
    if (!d.descricao.trim()) return 'Descreva a ação.';
    if (!inteiro(d.pessoas)) return 'Informe o número de pessoas orientadas (inteiro, 0 ou mais).';
    if (String(d.folders).trim() !== '' && !inteiro(d.folders)) return 'O número de folders deve ser um inteiro, 0 ou mais.';
    return '';
  }
  async function gravar() {
    if (!F || !F.vivo || F.gravando) return;
    const d = lerForm(), erro = problema(d);
    if (erro) return toast(erro, true);
    const s = await exigirServidor('educacaonovo'); if (!s) return;
    F.gravando = true; const btn = $('#edu-gravar'); if (btn) btn.disabled = true;
    try {
      const t = Date.now(), txt = x => String(x || '').trim().replace(/\s+/g, ' ');
      const rec = { id: F.id, criadoEm: F.em, atualizadoEm: t, unidade: unid(s.lotacao), data: d.data, hora: d.hora, municipio: d.municipio, local: txt(d.local),
        tipoMedida: d.tipoMedida, tipoMedidaOutro: d.tipoMedida === OUTRO ? txt(d.tipoMedidaOutro) : '',
        publicoAlvo: JSON.stringify(d.publicoAlvo), publicoOutro: d.publicoAlvo.includes(OUTRO) ? txt(d.publicoOutro) : '',
        programas: JSON.stringify(d.programas), programaOutro: d.programas.includes(OUTRO) ? txt(d.programaOutro) : '',
        descricao: d.descricao.trim(), pessoas: Number(d.pessoas), folders: String(d.folders).trim() === '' ? 0 : Number(d.folders), obs: d.obs.trim(),
        servidor: s.nome, cargo: s.cargo, matricula: s.matricula || '', lotacao: s.lotacao, cancelado: 0, motivoCancel: '', excluido: 0 };
      const g = await numerar(rec);
      fechar(); F = null; await Store.setMeta(RASC, null);
      Sync.sincronizar();
      go('educacaotermo', g.id);
    } catch (e) { toast(e.message || String(e), true); }
    finally { if (F) F.gravando = false; if (btn && btn.isConnected) btn.disabled = false; }
  }

  /* ---------- lista e termo aberto ---------- */
  const situacao = t => `${Number(t.cancelado) === 1 ? `<div class="info pend">${icone('proibido')} CANCELADO${t.motivoCancel ? ': ' + esc(t.motivoCancel) : ''}</div>` : ''}
    ${Number(t.conflito) === 1 ? `<div class="info pend">${icone('alerta')} Número duplicado na planilha: confira com a coordenação.</div>` : ''}
    ${t.pendente ? `<div class="info pend">${icone('sincronizar')} ${t.provisorio ? 'número provisório, será conferido ao sincronizar' : 'aguardando envio'}</div>` : ''}`;
  const meus = async () => (await Sync.visiveis('termosEducacao', await Store.todos('termosEducacao'))).filter(x => !Number(x.excluido)).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  async function lista() {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela();
    const s = await exigirServidor('educacao'); if (!s || !mostrar.viva()) return;
    fechar();
    const todos = await meus(); if (!mostrar.viva()) return;
    mostrar(`<button class="botao" data-edu="novo" id="edu-novo">${icone('mais')} Novo termo</button>
      <div class="card"><h3>${icone('manual')} Meus termos de educação sanitária</h3><p class="dica" style="text-align:left">${todos.length} termo(s) neste aparelho. <a href="#" data-edu="meusdados">Meus dados</a></p></div>
      <div id="eduItens">${todos.length ? todos.map(t => `<div class="item edu-item" data-edu="abrir" data-id="${esc(t.id)}"><div class="topo"><div><div class="placa">${esc(t.numeroTxt)}</div><div class="tipo">${esc(t.tipoMedida === OUTRO && t.tipoMedidaOutro ? t.tipoMedidaOutro : t.tipoMedida)}</div></div><div class="hora">${esc(dBR(t.data))}</div></div>
        <div class="info">${esc(t.municipio)} · ${esc(t.local)} · ${esc(Number(t.pessoas) || 0)} pessoa(s)</div>${situacao(t)}</div>`).join('')
        : '<div class="vazio">Nenhum termo neste aparelho.</div>'}</div>`);
  }
  const textoLista = (v, outro) => lerJSON(v, []).map(x => (x === OUTRO && outro ? `${OUTRO}: ${outro}` : x)).join(', ');
  async function termo(id) {
    if (bloqueado()) return view(avisoAtivacao());
    const mostrar = tela(), t = await Store.obter('termosEducacao', id);
    if (!t) return go('educacao');
    if (!mostrar.viva()) return;
    mostrar(`<div class="card" id="edu-termo"><h3>${icone('manual')} Termo de Educação Sanitária</h3><div class="tf-num"><b id="edu-termo-num">${esc(t.numeroTxt)}</b></div>
      <p><b>${esc(dBR(t.data))} ${esc(t.hora)}</b> · ${esc(t.municipio)}</p><p>Local: ${esc(t.local)}</p>
      <p>Medida: ${esc(t.tipoMedida === OUTRO && t.tipoMedidaOutro ? `${OUTRO}: ${t.tipoMedidaOutro}` : t.tipoMedida)}</p>
      <p>Público-alvo: ${esc(textoLista(t.publicoAlvo, t.publicoOutro))}</p><p>Programas / pragas: ${esc(textoLista(t.programas, t.programaOutro))}</p>
      <p style="white-space:pre-wrap">${esc(t.descricao)}</p>
      <p>Pessoas orientadas: <b>${esc(Number(t.pessoas) || 0)}</b> · Folders/flyers: <b>${esc(Number(t.folders) || 0)}</b></p>
      ${t.obs ? `<p>Observações: ${esc(t.obs)}</p>` : ''}<p class="dica" style="text-align:left">${esc(t.servidor)} · ${esc(t.cargo)}${t.matricula ? ' · Mat. ' + esc(t.matricula) : ''} · ${esc(t.lotacao)}</p>
      ${situacao(t)}${t.pendente ? '' : `<div class="tf-ok">${icone('check')} Número confirmado na planilha.</div>`}</div>
      <button class="botao" data-edu="imprimir" data-id="${esc(t.id)}" id="edu-imprimir">${icone('imprimir')} Imprimir / PDF</button>
      <button class="botao sec" data-edu="arquivo" data-id="${esc(t.id)}" id="edu-arquivo">${icone('documento')} Gerar arquivo PDF (enviar/guardar)</button>
      ${Number(t.cancelado) === 1 ? '' : `<button class="botao sec" data-edu="cancelar" data-id="${esc(t.id)}" id="edu-cancelar">${icone('proibido')} Cancelar termo</button>`}
      <button class="botao sec" data-v="educacao">${icone('lista')} Meus termos</button>`);
  }
  async function gerarArquivo(id) {
    const t = await Store.obter('termosEducacao', id); if (!t) throw new Error('Termo não encontrado.');
    const r = await Docs.termoEducacao(t, 'arquivo');
    if (PDF.podeCompartilhar([r])) { try { await PDF.compartilhar([r], 'Termo de Educação Sanitária — ADAF', 'Termo de Educação Sanitária gerado pelo e-GDV.'); } catch (e) { PDF.baixar(r); } }
    else PDF.baixar(r);
    toast(`PDF gerado: ${r.name}`);
  }
  async function status() {
    if (!Sync.pode('educacao')) return '';
    const l = await meus();
    return `${l.length} termo(s) neste aparelho${l.some(x => x.pendente) ? ` · ${l.filter(x => x.pendente).length} aguardando envio` : ''}`;
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-edu]'); if (!el) return;
    const a = el.dataset.edu, id = el.dataset.id;
    try {
      if (a === 'novo') go('educacaonovo');
      else if (a === 'meusdados') { e.preventDefault(); go('educacaoservidor', { voltar: VIEW === 'educacaonovo' ? 'educacaonovo' : 'educacao' }); }
      else if (a === 'abrir') go('educacaotermo', id);
      else if (a === 'imprimir') await Docs.termoEducacao(await Store.obter('termosEducacao', id));
      else if (a === 'arquivo') await gerarArquivo(id);
      else if (a === 'descartar') {
        if (!confirm('Descartar o rascunho? Os dados preenchidos serão perdidos.')) return;
        fechar(); F = null; await Store.setMeta(RASC, null); go('educacaonovo');
      }
      else if (a === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (o número do termo continua usado):'); if (motivo == null) return;
        if (!motivo.trim()) return toast('Informe o motivo do cancelamento.', true);
        const t = await Store.obter('termosEducacao', id);
        await Store.salvar('termosEducacao', { ...t, cancelado: 1, motivoCancel: motivo.trim().replace(/\s+/g, ' ').slice(0, 300) });
        Sync.sincronizar(); toast('Termo cancelado.'); termo(id);
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { lista, novo, termo, servidor, status };
})();
