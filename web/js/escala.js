/* Escalas de plantão (só a coordenação de barreira e trânsito: permissão coordenacaoBarreiras → módulo "escala").
   Lista as escalas por BVA e período e monta/edita a equipe de cada uma. O período varia por BVA: ao escolher o início, o fim vem
   sugerido pelo regime da BVA (cadastro de BVAs: N dias, 12 h × 36 h, turno de 8 h; ajustável: o coordenador escolhe). Rascunho → publicada: só a publicada
   chega aos fiscais. Precisa de internet (lê e grava direto no servidor: escalaDados / escalaSalvar / escalaExcluir); a lista abre na hora com a
   última leitura (memória ou meta "escalaDados") e se atualiza por trás. */
const EscalaUI = (() => {
  'use strict';
  let D = null, AVISOS = [];                                   // dados da última leitura; avisos da última gravação
  const hoje = () => (D && D.hoje) || hojeISO();
  const somar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const nl = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bvas = () => { const l = CONFIG.bvas.map(b => b.nome); ((D && D.escalas) || []).forEach(e => { if (!l.some(x => nl(x) === nl(e.bva))) l.push(e.bva); }); return l; };
  const sobrepoe = (a, b) => CONFIG.sobrepoeEscala(a, b);               // encostar só no dia da troca não conta
  const periodo = e => `${dBR(e.inicio)} a ${dBR(e.fim)}`;
  const nomeF = f => f.nome + (f.id ? '' : ' (sem login)');                  // fiscal sem login: nome digitado pela coordenação
  const semNet = () => `<div class="card aviso"><h3>${icone('offline')} Sem internet</h3><p>As escalas são lidas e gravadas direto na planilha: conecte-se e tente de novo.</p>
    <button class="botao sec" data-go="escalas">${icone('sincronizar')} Tentar de novo</button></div>`;

  async function carregar(convenio) {
    const n = await Sync.escalaDados(convenio);
    if (!convenio && D && 'fimConvenio' in D) n.fimConvenio = D.fimConvenio;     // o fim do convênio só vem quando pedido (Gerar períodos)
    D = n; try { await Store.setMeta('escalaDados', D); } catch (e) { /* sem cache */ }
    return D;
  }
  const mexer = f => { if (D) { D = { ...D, escalas: f(D.escalas) }; Store.setMeta('escalaDados', D).catch(() => {}); } };
  async function guardado() { if (!D) try { D = (await Store.meta('escalaDados')) || null; } catch (e) { /* sem cache */ } return D; }

  /** Lista: por BVA, as escalas que ainda não acabaram (e a última que acabou), com a situação e a equipe. */
  async function lista() {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(semNet());
    const antes = await guardado(), velho = antes && JSON.stringify(antes.escalas);
    if (antes) desenhar(mostrar); else mostrar('<div class="card"><p>Carregando as escalas…</p></div>');
    try { await carregar(); } catch (e) {
      if (!mostrar.viva()) return;
      if (antes) return toast(e.message || 'Não foi possível atualizar as escalas.', true);
      return mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message || 'Não foi possível ler as escalas.')}</div>`);
    }
    if (mostrar.viva() && (!antes || JSON.stringify(D.escalas) !== velho)) desenhar(mostrar);
    AVISOS = [];
  }
  function desenhar(mostrar) {
    const h = hoje();
    const blocos = bvas().map(b => {
      const es = D.escalas.filter(e => nl(e.bva) === nl(b)).sort((x, y) => x.inicio.localeCompare(y.inicio));
      const vivas = es.filter(e => e.fim >= h), ultima = es.filter(e => e.fim < h).pop();
      const mostrarEs = (ultima ? [ultima] : []).concat(vivas);
      const atual = vivas.find(e => e.inicio <= h);
      return `<div class="card esc-bva"><div class="esc-cab"><h3>${esc(b)}</h3>${atual ? '' : '<span class="esc-selo aviso">Sem escala hoje</span>'}</div>
        ${mostrarEs.length ? mostrarEs.map(e => `<button type="button" class="esc-item${e.fim < h ? ' passada' : ''}" data-esc="${esc(e.id)}">
          <span class="esc-per"><b>${periodo(e)}</b>${e.inicio <= h && e.fim >= h ? ' <span class="esc-selo atual">Atual</span>' : e.fim < h ? ' <span class="esc-selo">Anterior</span>' : ''}
            <span class="esc-selo ${e.situacao === 'publicada' ? 'ok' : 'rasc'}">${e.situacao === 'publicada' ? 'Publicada' : 'Rascunho'}</span></span>
          <small>${e.equipeNumero ? `Equipe ${esc(e.equipeNumero)} · ` : ''}${e.fiscais.length ? esc(e.fiscais.map(nomeF).join(', ')) : 'Nenhum fiscal escolhido'}</small></button>`).join('')
        : '<p class="dica">Nenhuma escala ainda.</p>'}
        <button type="button" class="botao sec mini" data-escnova="${esc(b)}">${icone('mais')} Nova escala da ${esc(b)}</button>
        ${CONFIG.regimeEscala(b).regime === 'ajustavel' ? '' : `<button type="button" class="botao sec mini" data-escgerar="${esc(b)}">${icone('calendario')} Gerar períodos da ${esc(b)}</button>`}</div>`;
    }).join('');
    mostrar(`<div class="card"><h3>${icone('calendario')} Escalas de plantão</h3>
        <p class="dica" style="text-align:left">Quem fica em cada BVA em cada período. Só a escala <b>publicada</b> aparece para os fiscais e para a gerência.</p>
        <button type="button" class="botao sec mini" data-go="relequipes">${icone('documento')} Relatórios das equipes</button>
        <button type="button" class="botao" data-escnova="">${icone('mais')} Nova escala</button></div>
      ${AVISOS.length ? `<div class="card aviso" id="escAvisos">${icone('alerta')} <b>Atenção</b><ul>${AVISOS.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <div id="escLista">${blocos}</div>`);
  }

  /** Formulário: BVA, início e fim do período e os fiscais (cada um com as outras escalas em que está no mesmo período). */
  async function form(id) {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(semNet());
    if (!(await guardado())) { try { await carregar(); } catch (e) { if (mostrar.viva()) mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message)}</div>`); return; } }
    if (!mostrar.viva()) return;
    const e = id && id.charAt(0) !== '+' ? D.escalas.find(x => x.id === id) : null;
    if (id && id.charAt(0) !== '+' && !e) { toast('Esta escala não existe mais.', true); return go('escalas'); }
    // nova: começa depois da última da BVA (CONFIG.proximoInicioEscala) e o fim vem do regime da BVA (CONFIG.fimEscala: 10 dias no
    // Jundiá, 8 na CEASA, o mesmo dia no 12×36/8 h); período ajustável: a mesma duração da última
    const sugerir = b => {
      const ult = D.escalas.filter(x => nl(x.bva) === nl(b)).sort((x, y) => x.fim.localeCompare(y.fim)).pop();
      const ini = ult && ult.fim >= hoje() ? CONFIG.proximoInicioEscala(b, ult) : hoje();
      return { inicio: ini, fim: CONFIG.fimEscala(b, ini) || (ult ? somar(ini, Math.max(0, dias(ult.inicio, ult.fim))) : ini) };
    };
    const textoRegime = b => CONFIG.regimeEscala(b).regime === 'ajustavel' ? 'Período ajustável: escolha o fim.' : `${CONFIG.textoRegimeEscala(b)}: o fim vem sugerido pelo início (pode mudar).`;
    const bvaIni = e ? e.bva : (id && id.slice(1)) || bvas()[0], sug = e ? e : sugerir(bvaIni);
    const marcados = new Set(e ? e.fiscais.map(f => f.id) : []);
    mostrar(`<form class="card" id="fEscala"><h3>${e ? 'Editar escala' : 'Nova escala'}</h3>
      <label>BVA<select id="escBva" ${e ? 'disabled' : ''}>${bvas().map(b => `<option ${b === bvaIni ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <div class="duas"><label>Início<input type="date" id="escIni" required value="${esc(sug.inicio)}"></label><label>Fim<input type="date" id="escFim" required value="${esc(sug.fim)}"></label></div>
      <p class="dica" id="escRegime" style="text-align:left">${esc(textoRegime(bvaIni))}</p><p class="dica" id="escDias" style="text-align:left"></p>
      <label>Buscar fiscal<input type="search" id="escBusca" autocomplete="off" placeholder="Nome ou matrícula"></label>
      <div class="esc-fiscais" id="escFiscais">${D.fiscais.map(f => `<label class="chk esc-fiscal" data-nome="${esc(nl(f.nome + ' ' + (f.matricula || '')))}">
        <input type="checkbox" data-fiscal="${esc(f.id)}" ${marcados.has(f.id) ? 'checked' : ''}><span><b>${esc(f.nome)}</b><small data-st="${esc(f.id)}"></small></span></label>`).join('') || '<p class="dica">Nenhum fiscal com acesso ao app de campo.</p>'}</div>
      <div class="esc-semlogin"><label>Fiscal que ainda não tem login<input id="escSemNome" maxlength="80" autocomplete="off" placeholder="Nome do fiscal"></label>
        <button type="button" class="botao sec mini" id="escSemAdd">${icone('mais')} Incluir sem login</button>
        <div id="escSemLista" class="esc-chips">${(e ? e.fiscais.filter(f => !f.id) : []).map(f => chipSem(f.nome)).join('')}</div>
        <p class="dica" style="text-align:left">Quando ele ganhar login, tire o nome daqui e marque a conta na lista acima.</p></div>
      <p class="dica" id="escConta" style="text-align:left"></p>
      <div class="duas"><label>Nº da equipe <small>(relatório)</small><input id="escEquipe" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="ex.: 33" value="${esc(e ? e.equipeNumero || '' : '')}"></label>
        <label>Responsável pela equipe<select id="escResp"></select></label></div>
      <div class="duas"><button type="button" class="botao sec" id="escRascunho">${icone('salvar')} Salvar rascunho</button>
        <button type="button" class="botao" id="escPublicar">${icone('ok')} Publicar</button></div>
      ${e ? `<button type="button" class="botao vermelho" id="escExcluir">${icone('lixeira')} Excluir esta escala</button>` : ''}
      <button type="button" class="botao sec" data-go="escalas">${icone('voltar')} Voltar</button>
      ${e && e.atualizadoPor ? `<p class="dica">Última alteração: ${esc(e.atualizadoPor)}${e.situacao === 'publicada' && e.publicadaPor ? ` · publicada por ${esc(e.publicadaPor)}` : ''}.</p>` : ''}</form>`);
    const bvaAtual = () => e ? e.bva : $('#escBva').value;
    /** Situação de cada fiscal no período escolhido (outras escalas que se sobrepõem) e contagem dos marcados. */
    const situar = () => {
      const p = { inicio: $('#escIni').value, fim: $('#escFim').value }, ok = p.inicio && p.fim && p.fim >= p.inicio;
      $('#escDias').textContent = ok ? `${dias(p.inicio, p.fim) + 1} dia(s) de plantão.` : 'Confira as datas: o fim é antes do início.';
      const outras = ok ? D.escalas.filter(x => (!e || x.id !== e.id) && sobrepoe(x, p)) : [];
      D.fiscais.forEach(f => {
        const em = outras.filter(x => x.fiscais.some(y => y.id === f.id)), st = $(`[data-st="${f.id}"]`); if (!st) return;
        st.textContent = em.length ? 'Também na ' + em.map(x => `${x.bva} (${dBR(x.inicio).slice(0, 5)} a ${dBR(x.fim).slice(0, 5)})`).join('; ') : 'Livre neste período';
        st.className = em.length ? 'esc-ocupado' : 'esc-livre';
      });
      // responsável: um dos fiscais escolhidos (conta: id; sem login: "nome:<nome>")
      const sel = $('#escResp'), atual = sel.dataset.v !== undefined ? sel.value : (e ? e.responsavel || '' : '');
      const opc = [...document.querySelectorAll('#escFiscais input:checked')].map(i => [i.dataset.fiscal, (D.fiscais.find(f => f.id === i.dataset.fiscal) || {}).nome || ''])
        .concat([...document.querySelectorAll('#escSemLista [data-sem]')].map(x => ['nome:' + x.dataset.sem.trim().replace(/\s+/g, ' ').toLowerCase(), x.dataset.sem]));
      sel.innerHTML = '<option value="">— escolha —</option>' + opc.map(([v, n]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
      sel.dataset.v = '1';
      const n = document.querySelectorAll('#escFiscais input:checked').length + document.querySelectorAll('#escSemLista [data-sem]').length;
      $('#escConta').textContent = `${n} fiscal(is) escolhido(s) para a ${bvaAtual()}.`;
    };
    if (!e) $('#escBva').onchange = () => { const s = sugerir($('#escBva').value); $('#escIni').value = s.inicio; $('#escFim').value = s.fim; $('#escRegime').textContent = textoRegime($('#escBva').value); situar(); };
    $('#escIni').onchange = () => { const f = CONFIG.fimEscala(bvaAtual(), $('#escIni').value); if (f) $('#escFim').value = f; situar(); };
    $('#escFim').onchange = situar;
    $('#escFiscais').onchange = situar;
    $('#escSemAdd').onclick = () => {
      const n = $('#escSemNome').value.trim().replace(/\s+/g, ' '); if (n.length < 3) return toast('Digite o nome do fiscal.', true);
      if ([...document.querySelectorAll('#escSemLista [data-sem]')].some(x => nl(x.dataset.sem) === nl(n))) return toast('Esse nome já está na escala.', true);
      $('#escSemLista').insertAdjacentHTML('beforeend', chipSem(n)); $('#escSemNome').value = ''; situar();
    };
    $('#escSemLista').onclick = ev => { const b = ev.target.closest('[data-semrm]'); if (b) { b.closest('[data-sem]').remove(); situar(); } };
    $('#escBusca').oninput = ev => { const q = nl(ev.target.value); document.querySelectorAll('.esc-fiscal').forEach(l => { l.hidden = !!q && !l.dataset.nome.includes(q); }); };
    situar();
    const salvar = async situacao => {
      const fiscais = [...document.querySelectorAll('#escFiscais input:checked')].map(i => i.dataset.fiscal)
        .concat([...document.querySelectorAll('#escSemLista [data-sem]')].map(x => ({ nome: x.dataset.sem })));
      if (situacao === 'publicada' && !fiscais.length) return toast('Escolha pelo menos um fiscal para publicar.', true);
      if ($('#escEquipe').value.trim() && !/^\d{1,4}$/.test($('#escEquipe').value.trim())) return toast('Nº da equipe: use só números (ex.: 33).', true);
      const bts = document.querySelectorAll('#fEscala button'); bts.forEach(b => { b.disabled = true; });
      try {
        const r = await Sync.escalaSalvar({ id: e ? e.id : '', bva: bvaAtual(), inicio: $('#escIni').value, fim: $('#escFim').value, fiscais, situacao,
          equipeNumero: $('#escEquipe').value.trim(), responsavel: $('#escResp').value });
        AVISOS = r.avisos || []; mexer(l => l.filter(x => x.id !== r.escala.id).concat([r.escala]));
        toast(situacao === 'publicada' ? 'Escala publicada.' : 'Rascunho salvo.'); go('escalas');
      } catch (err) { bts.forEach(b => { b.disabled = false; }); toast(err.message || 'Não foi possível gravar.', true); }
    };
    $('#escRascunho').onclick = () => salvar('rascunho');
    $('#escPublicar').onclick = () => salvar('publicada');
    if (e) $('#escExcluir').onclick = async () => {
      if (!confirm(`Excluir a escala da ${e.bva} (${periodo(e)})?\n\nEla sai das telas dos fiscais e do painel; fica registrada no histórico.`)) return;
      try { await Sync.escalaExcluir(e.id); mexer(l => l.filter(x => x.id !== e.id)); toast('Escala excluída.'); go('escalas'); } catch (err) { toast(err.message || 'Não foi possível excluir.', true); }
    };
  }

  const chipSem = n => `<span class="esc-chip" data-sem="${esc(n)}">${esc(n)} <small>sem login</small><button type="button" data-semrm aria-label="Tirar ${esc(n)}">${icone('fechar')}</button></span>`;

  /**
   * Gerar períodos: os períodos da BVA pelo regime dela (CONFIG.gerarPeriodosEscala), do início escolhido até a data final (padrão:
   * fim do convênio), como rascunhos sem fiscais. Os que se sobrepõem a uma escala que a BVA já tem são pulados.
   */
  async function gerar(bva) {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(semNet());
    if (!(await guardado()) || !('fimConvenio' in D)) try { mostrar('<div class="card"><p>Carregando…</p></div>'); await carregar(true); } catch (e) { if (mostrar.viva()) mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message)}</div>`); return; }
    if (!mostrar.viva()) return;
    const es = D.escalas.filter(x => nl(x.bva) === nl(bva)).sort((x, y) => x.fim.localeCompare(y.fim)), ult = es[es.length - 1];
    const ini0 = ult ? CONFIG.proximoInicioEscala(bva, ult) : hoje(), ate0 = D.fimConvenio && D.fimConvenio > ini0 ? D.fimConvenio : somar(ini0, 90);
    mostrar(`<form class="card" id="fGerar"><h3>Gerar períodos da ${esc(bva)}</h3>
      <p class="dica" style="text-align:left">${esc(CONFIG.textoRegimeEscala(bva))}. Os períodos entram como <b>rascunho, sem fiscais</b>: depois, abra cada um, escolha a equipe e publique.</p>
      <div class="duas"><label>Primeiro período começa em<input type="date" id="gerIni" value="${esc(ini0)}"></label><label>Até<input type="date" id="gerAte" value="${esc(ate0)}"></label></div>
      ${D.fimConvenio ? `<p class="dica" style="text-align:left">Fim do convênio: ${dBR(D.fimConvenio)}.</p>` : ''}
      <div id="gerPrevia"></div>
      <button type="button" class="botao" id="gerOk">${icone('calendario')} Gerar</button>
      <button type="button" class="botao sec" data-go="escalas">${icone('voltar')} Voltar</button></form>`);
    let lista = [];
    const previa = () => {
      lista = CONFIG.gerarPeriodosEscala(bva, $('#gerIni').value, $('#gerAte').value).map(p => ({ ...p, pula: es.some(x => sobrepoe(x, p)) }));
      const novos = lista.filter(p => !p.pula);
      $('#gerPrevia').innerHTML = lista.length ? `<p><b>${novos.length} período(s) novo(s)</b>${lista.length > novos.length ? ` · ${lista.length - novos.length} já têm escala (pulados)` : ''}</p>
        <ul class="esc-previa">${lista.map(p => `<li class="${p.pula ? 'pula' : ''}">${periodo(p)}${p.pula ? ' — já tem escala' : ''}</li>`).join('')}</ul>` : '<p class="dica">Nenhum período nesse intervalo.</p>';
      $('#gerOk').disabled = !novos.length; $('#gerOk').innerHTML = `${icone('calendario')} Gerar ${novos.length} período(s)`;
    };
    $('#gerIni').onchange = $('#gerAte').onchange = previa; previa();
    $('#gerOk').onclick = async () => {
      const novos = lista.filter(p => !p.pula); if (!novos.length) return;
      $('#gerOk').disabled = true;
      try { const r = await Sync.escalaGerar(bva, novos.map(p => ({ inicio: p.inicio, fim: p.fim })));
        D = null; try { await Store.setMeta('escalaDados', null); } catch (e) { /* sem cache */ }  // os novos só vêm na próxima leitura
        toast(`${r.criados} período(s) criado(s) como rascunho${r.pulados ? `; ${r.pulados} pulado(s)` : ''}.`); go('escalas'); }
      catch (err) { $('#gerOk').disabled = false; toast(err.message || 'Não foi possível gerar.', true); }
    };
  }

  /** Fiscal: a escala de hoje (ou a próxima) para o aviso "Sua escala de plantão" na tela inicial. */
  async function minha() {
    const l = await Sync.minhasEscalas(), h = hojeISO();
    return l.find(e => e.inicio <= h && e.fim >= h) || l.filter(e => e.inicio > h).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] || null;
  }
  const cartaoMinha = e => {
    if (!e) return '';
    const h = hojeISO(), atual = e.inicio <= h;
    return `<div class="card esc-minha" id="suaEscala"><h3 id="escPopTit">${icone('calendario')} Sua escala de plantão</h3>
      <p><b>${esc(e.bva)}</b></p><p>${dBR(e.inicio)} a ${dBR(e.fim)}${atual ? ` · dia ${dias(e.inicio, h) + 1} de ${dias(e.inicio, e.fim) + 1}` : ' · ainda vai começar'}</p>
      ${e.equipe && e.equipe.length ? `<p class="dica" style="text-align:left">Equipe: ${esc(e.equipe.join(', '))}</p>` : ''}</div>`;
  };

  /**
   * Tela inicial do fiscal: aviso (janela por cima) da escala de hoje ou da próxima, uma vez por escala — volta a aparecer se o
   * período ou a equipe mudarem. "Entendi" guarda neste aparelho que o fiscal viu.
   */
  const LS_VISTA = 'gdv.escalaVista';
  async function aviso() {
    const e = await minha(); if (!e || $('#escPop')) return;
    const chave = [e.id, e.inicio, e.fim, (e.equipe || []).join('|')].join('#');
    let vista = ''; try { vista = localStorage.getItem(LS_VISTA) || ''; } catch (x) { /* sem armazenamento: mostra */ }
    if (vista === chave || !$('#view') || VIEW !== 'modulos') return;
    const pop = document.createElement('div'); pop.id = 'escPop'; pop.className = 'esc-pop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'escPopTit');
    pop.innerHTML = `<div class="esc-pop-caixa">${cartaoMinha(e)}<button type="button" class="botao" id="escPopOk">${icone('ok')} Entendi</button></div>`;
    document.body.appendChild(pop);
    const fechar = () => { try { localStorage.setItem(LS_VISTA, chave); } catch (x) { /* sem armazenamento */ } pop.remove(); };
    pop.querySelector('#escPopOk').onclick = fechar;
    pop.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });
    pop.querySelector('#escPopOk').focus();
  }
  /* ---------- Relatório da equipe (prestação de contas do convênio): um por escala publicada ----------
     Veem os fiscais da escala e a coordenação; editam o responsável pela equipe e a coordenação. Os números vêm da planilha (todos os
     turnos da equipe no período); os textos (local, objetivo, deslocamento…) começam pelos do último relatório da BVA ou pelos padrão. */
  async function relLista() {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(`<div class="card aviso"><h3>${icone('offline')} Sem internet</h3><p>O relatório da equipe é montado com os dados da planilha: conecte-se e tente de novo.</p></div>`);
    mostrar('<div class="card"><p>Carregando as escalas…</p></div>');
    let r; try { r = await Sync.relEquipeLista(); } catch (e) { return mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message || 'Não foi possível ler as escalas.')}</div>`); }
    mostrar(`<div class="card"><h3>${icone('documento')} Relatórios da equipe</h3>
      <p class="dica" style="text-align:left">Prestação de contas do convênio: um relatório por escala de plantão, com os números de todos os turnos da equipe no período. O responsável pela equipe edita os textos.</p>
      ${r.escalas.length ? r.escalas.map(e => `<button type="button" class="esc-item" data-releq="${esc(e.id)}">
        <span class="esc-per"><b>${esc(e.bva)}</b> ${e.equipeNumero ? `<span class="esc-selo">Equipe ${esc(e.equipeNumero)}</span>` : ''}${e.inicio <= r.hoje && e.fim >= r.hoje ? ' <span class="esc-selo atual">Em andamento</span>' : ''}${e.salvoEm ? ' <span class="esc-selo ok">Editado</span>' : ''}</span>
        <small>${periodo(e)}${e.editar ? ' · você pode editar' : ''}</small></button>`).join('') : '<p class="dica">Nenhuma escala publicada sua nos últimos 120 dias.</p>'}</div>`);
  }
  const CAMPOS_REL = [['local', 'Local', 1], ['objetivo', 'Objetivo', 4], ['deslocamento', 'Deslocamento', 2], ['intro', 'Texto antes das atividades', 2], ['obs', 'OBS', 2]];
  async function rel(id) {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(`<div class="card aviso"><h3>${icone('offline')} Sem internet</h3><p>Conecte-se para abrir o relatório da equipe.</p></div>`);
    mostrar('<div class="card"><p>Somando os turnos da equipe…</p></div>');
    let R; try { R = await Sync.relEquipe(id); } catch (e) { return mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message || 'Não foi possível abrir o relatório.')}</div>
      <button class="botao sec" data-go="relequipes">${icone('voltar')} Voltar</button>`); }
    const RP = RelEquipeDocs.repasse(R);                                     // Termo de Repasse: o salvo ou o montado pelas apreensões
    const e = R.escala, N = R.numeros, base = { ...CONFIG.textosRelEquipe(e.bva), ...Object.fromEntries(Object.entries(R.anterior || {}).filter(([, v]) => v)), kg: '', repasse: '0' };
    const D0 = { ...base, ...(R.dados || {}) }, ed = !!R.editar;
    const resp = (e.fiscais.find(f => (f.id || 'nome:' + f.nome.trim().replace(/\s+/g, ' ').toLowerCase()) === e.responsavel) || {}).nome;
    const outras = Object.keys(N.outras || {}).map(u => `${N.outras[u]} ${u}`).join(', ');
    const campo = ([k, rot, linhas]) => ed
      ? `<label>${rot}${linhas > 1 ? `<textarea id="re-${k}" rows="${linhas}" maxlength="1500">${esc(D0[k] || '')}</textarea>` : `<input id="re-${k}" maxlength="200" value="${esc(D0[k] || '')}">`}</label>`
      : `<p><b>${rot}:</b> ${esc(D0[k] || '—')}</p>`;
    mostrar(`<div class="card"><h3>${icone('documento')} ${e.equipeNumero ? `Equipe ${esc(e.equipeNumero)} · ` : ''}${esc(e.bva)}</h3>
        <p>${periodo(e)}</p><p class="dica" style="text-align:left">Servidores: ${esc(e.fiscais.map(f => f.nome).join(', '))}<br>Responsável: ${resp ? esc(resp) : '<b>não definido na escala</b>'}</p></div>
      <div class="card"><h3>Atividades (todos os turnos da equipe)</h3>
        <ul class="re-num"><li>${N.turnos} turno(s) · ${N.veiculos} veículo(s) abordado(s)</li><li>${N.tfs} TF(s) de barreira${N.numerosTF.length ? `: ${esc(N.numerosTF.join(', '))}` : ''}</li>
          <li>${N.apreensoes} apreensão(ões) · ${String(N.kg).replace('.', ',')} kg apreendidos${outras ? ` (e ${esc(outras)})` : ''}</li><li>${N.rechacos} rechaço(s)</li><li>${N.educacao} medida(s) de educação sanitária</li></ul>
        ${ed ? `<div class="duas"><label>Quantidade apreendida (kg) <small>(vazio = ${String(N.kg).replace('.', ',')})</small><input id="re-kg" inputmode="decimal" maxlength="20" value="${esc(D0.kg || '')}"></label>
          <label>Termos de repasse<input id="re-repasse" inputmode="numeric" maxlength="4" value="${esc(D0.repasse || '0')}"></label></div>`
          : `<p><b>Termos de repasse:</b> ${esc(D0.repasse || '0')}${D0.kg ? ` · <b>kg (corrigido):</b> ${esc(D0.kg)}` : ''}</p>`}</div>
      <div class="card"><h3>Textos do relatório</h3>${CAMPOS_REL.map(campo).join('')}
        ${R.salvoEm ? `<p class="dica">Última edição: ${esc(R.salvoPor)}.</p>` : ''}${ed ? '' : '<p class="dica">Só o responsável pela equipe (ou a coordenação) edita.</p>'}</div>
      <div class="card"><h3>Termo de repasse de produtos apreendidos</h3>
        ${ed ? `<div class="duas"><label>Nº do termo<input id="re-rpNumero" maxlength="20" value="${esc(RP.numero)}"></label>
          <label>Órgão que recebe <small>(ex.: ADERR)</small><input id="re-rpOrgao" maxlength="60" value="${esc(RP.orgao)}"></label></div>
          <label>Local e data<input id="re-rpLocal" maxlength="200" value="${esc(RP.localData)}"></label>
          <div class="re-itens" id="re-itens"></div>
          <div class="duas"><button type="button" class="botao sec mini" id="re-rpAdd">${icone('mais')} Adicionar item</button>
            <button type="button" class="botao sec mini" id="re-rpRecarregar">${icone('sincronizar')} Refazer pelas apreensões</button></div>
          <p class="dica" style="text-align:left">Os itens vêm dos produtos apreendidos nos TFs da equipe; edite, tire ou acrescente e toque em Salvar. Total: <b id="re-rpTotal"></b></p>`
          : `<p><b>Nº:</b> ${esc(RP.numero)} · <b>Recebe:</b> ${esc(RP.orgao || '—')}</p><p><b>Local e data:</b> ${esc(RP.localData)}</p>
          <ul class="re-num">${RP.itens.map(x => `<li>TF ${esc(x.tf || '—')} · ${esc(x.p)} · ${esc(x.q)} ${esc(x.u)}</li>`).join('') || '<li>Nenhum produto apreendido.</li>'}</ul><p><b>Total:</b> ${esc(RP.totalTxt)}</p>`}
        <button class="botao sec" id="re-rpPdf">${icone('documento')} Termo de repasse (PDF)</button></div>
      ${ed ? `<button class="botao sec" id="re-salvar">${icone('salvar')} Salvar</button>` : ''}
      <button class="botao" id="re-pdf">${icone('documento')} Gerar relatório (PDF)</button>
      <button class="botao sec" data-go="relequipes">${icone('voltar')} Voltar</button>`);
    // itens do Termo de Repasse (só quem edita): nº do TF, produto, unidade e quantidade, uma linha cada
    const linhaRp = x => `<div class="re-item"><input aria-label="Nº do TF" data-k="tf" maxlength="20" value="${esc(x.tf || '')}" placeholder="TF">
      <input aria-label="Produto" data-k="p" maxlength="80" value="${esc(x.p || '')}" placeholder="Produto"><input aria-label="Unidade" data-k="u" maxlength="20" value="${esc(x.u || '')}" placeholder="Und">
      <input aria-label="Quantidade" data-k="q" inputmode="decimal" maxlength="12" value="${esc(String(x.q == null ? '' : x.q).replace('.', ','))}" placeholder="Qtd">
      <button type="button" class="mini" data-rprm aria-label="Tirar item">${icone('fechar')}</button></div>`;
    const itensRp = () => [...document.querySelectorAll('#re-itens .re-item')].map(l => Object.fromEntries([...l.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value.trim()])));
    const totalRp = () => { const t = $('#re-rpTotal'); if (t) t.textContent = RelEquipeDocs.repasse({ ...R, dados: { ...R.dados, repasseItens: itensRp() } }).totalTxt; };
    const desenharRp = itens => { $('#re-itens').innerHTML = itens.map(linhaRp).join(''); totalRp(); };
    if (ed) {
      desenharRp(RP.itens);
      $('#re-itens').oninput = totalRp;
      $('#re-itens').onclick = ev => { const b = ev.target.closest('[data-rprm]'); if (b) { b.closest('.re-item').remove(); totalRp(); } };
      $('#re-rpAdd').onclick = () => { $('#re-itens').insertAdjacentHTML('beforeend', linhaRp({})); totalRp(); };
      $('#re-rpRecarregar').onclick = () => { if (confirm('Refazer os itens pelos produtos apreendidos nos TFs da equipe? O que foi editado nos itens sai.')) desenharRp(RelEquipeDocs.repasse({ ...R, dados: {} }).itens); };
    }
    const atuais = () => { const d = { ...D0 }; if (!ed) return d;
      CAMPOS_REL.concat([['kg'], ['repasse']]).forEach(([k]) => { d[k] = $('#re-' + k).value.trim(); });
      d.repasseNumero = $('#re-rpNumero').value.trim(); d.repasseOrgao = $('#re-rpOrgao').value.trim(); d.repasseLocalData = $('#re-rpLocal').value.trim();
      d.repasseItens = itensRp().filter(x => x.p || x.q); return d; };
    if (ed) $('#re-salvar').onclick = async () => {
      const b = $('#re-salvar'); b.disabled = true;
      try { const r = await Sync.relEquipeSalvar(id, atuais()); R.salvoEm = r.salvoEm; R.salvoPor = r.salvoPor; Object.assign(D0, atuais()); toast('Relatório salvo.'); }
      catch (err) { toast(err.message || 'Não foi possível salvar.', true); }
      b.disabled = false;
    };
    $('#re-rpPdf').onclick = async () => {
      try { await Docs.termoRepasse({ ...R, dados: atuais() }); } catch (err) { toast('Erro ao gerar documento: ' + err.message, true); }
    };
    $('#re-pdf').onclick = async () => {
      try { await Docs.relEquipe({ ...R, dados: atuais() }); } catch (err) { toast('Erro ao gerar documento: ' + err.message, true); }
    };
  }

  document.addEventListener('click', ev => {
    const n = ev.target.closest('[data-escnova]'); if (n) return go('escala', '+' + n.dataset.escnova);
    const gg = ev.target.closest('[data-escgerar]'); if (gg) return go('escalagerar', gg.dataset.escgerar);
    const i = ev.target.closest('[data-esc]'); if (i) return go('escala', i.dataset.esc);
    const re = ev.target.closest('[data-releq]'); if (re) go('relequipe', re.dataset.releq);
  });
  return { lista, form, gerar, minha, cartaoMinha, aviso, relLista, rel };
})();
