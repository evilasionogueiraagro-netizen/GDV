/* Escalas de plantão (só a coordenação de barreira e trânsito: permissão coordenacaoBarreiras → módulo "escala").
   Lista as escalas por BVA e período e monta/edita a equipe de cada uma. O período varia por BVA (início e fim livres; a próxima
   começa, por padrão, no dia seguinte ao fim da última da mesma BVA, com a mesma duração). Rascunho → publicada: só a publicada
   chega aos fiscais. Precisa de internet (lê e grava direto no servidor: escalaDados / escalaSalvar / escalaExcluir). */
const EscalaUI = (() => {
  'use strict';
  let D = null, AVISOS = [];                                   // dados da última leitura; avisos da última gravação
  const hoje = () => (D && D.hoje) || hojeISO();
  const somar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const nl = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bvas = () => { const l = CONFIG.bvas.map(b => b.nome); ((D && D.escalas) || []).forEach(e => { if (!l.some(x => nl(x) === nl(e.bva))) l.push(e.bva); }); return l; };
  const sobrepoe = (a, b) => a.inicio <= b.fim && b.inicio <= a.fim;
  const periodo = e => `${dBR(e.inicio)} a ${dBR(e.fim)}`;
  const semNet = () => `<div class="card aviso"><h3>${icone('offline')} Sem internet</h3><p>As escalas são lidas e gravadas direto na planilha: conecte-se e tente de novo.</p>
    <button class="botao sec" data-go="escalas">${icone('sincronizar')} Tentar de novo</button></div>`;

  async function carregar() { D = await Sync.escalaDados(); return D; }

  /** Lista: por BVA, as escalas que ainda não acabaram (e a última que acabou), com a situação e a equipe. */
  async function lista() {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(semNet());
    mostrar('<div class="card"><p>Carregando as escalas…</p></div>');
    try { await carregar(); } catch (e) { if (mostrar.viva()) mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message || 'Não foi possível ler as escalas.')}</div>`); return; }
    if (!mostrar.viva()) return;
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
          <small>${e.fiscais.length ? esc(e.fiscais.map(f => f.nome).join(', ')) : 'Nenhum fiscal escolhido'}</small></button>`).join('')
        : '<p class="dica">Nenhuma escala ainda.</p>'}
        <button type="button" class="botao sec mini" data-escnova="${esc(b)}">${icone('mais')} Nova escala da ${esc(b)}</button></div>`;
    }).join('');
    mostrar(`<div class="card"><h3>${icone('calendario')} Escalas de plantão</h3>
        <p class="dica" style="text-align:left">Quem fica em cada BVA em cada período. Só a escala <b>publicada</b> aparece para os fiscais e para a gerência.</p>
        <button type="button" class="botao" data-escnova="">${icone('mais')} Nova escala</button></div>
      ${AVISOS.length ? `<div class="card aviso" id="escAvisos">${icone('alerta')} <b>Atenção</b><ul>${AVISOS.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <div id="escLista">${blocos}</div>`);
    AVISOS = [];
  }

  /** Formulário: BVA, início e fim do período e os fiscais (cada um com as outras escalas em que está no mesmo período). */
  async function form(id) {
    const mostrar = tela();
    if (!navigator.onLine) return mostrar(semNet());
    if (!D) { try { await carregar(); } catch (e) { if (mostrar.viva()) mostrar(`<div class="card aviso">${icone('alerta')} ${esc(e.message)}</div>`); return; } }
    if (!mostrar.viva()) return;
    const e = id && id.charAt(0) !== '+' ? D.escalas.find(x => x.id === id) : null;
    if (id && id.charAt(0) !== '+' && !e) { toast('Esta escala não existe mais.', true); return go('escalas'); }
    const sugerir = b => {                                         // nova: começa no dia seguinte ao fim da última da BVA, com a mesma duração
      const ult = D.escalas.filter(x => nl(x.bva) === nl(b)).sort((x, y) => x.fim.localeCompare(y.fim)).pop();
      const ini = ult && ult.fim >= hoje() ? somar(ult.fim, 1) : hoje();
      return { inicio: ini, fim: somar(ini, ult ? Math.max(0, dias(ult.inicio, ult.fim)) : 9) };
    };
    const bvaIni = e ? e.bva : (id && id.slice(1)) || bvas()[0], sug = e ? e : sugerir(bvaIni);
    const marcados = new Set(e ? e.fiscais.map(f => f.id) : []);
    mostrar(`<form class="card" id="fEscala"><h3>${e ? 'Editar escala' : 'Nova escala'}</h3>
      <label>BVA<select id="escBva" ${e ? 'disabled' : ''}>${bvas().map(b => `<option ${b === bvaIni ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <div class="duas"><label>Início<input type="date" id="escIni" required value="${esc(sug.inicio)}"></label><label>Fim<input type="date" id="escFim" required value="${esc(sug.fim)}"></label></div>
      <p class="dica" id="escDias" style="text-align:left"></p>
      <label>Buscar fiscal<input type="search" id="escBusca" autocomplete="off" placeholder="Nome ou matrícula"></label>
      <div class="esc-fiscais" id="escFiscais">${D.fiscais.map(f => `<label class="chk esc-fiscal" data-nome="${esc(nl(f.nome + ' ' + (f.matricula || '')))}">
        <input type="checkbox" data-fiscal="${esc(f.id)}" ${marcados.has(f.id) ? 'checked' : ''}><span><b>${esc(f.nome)}</b><small data-st="${esc(f.id)}"></small></span></label>`).join('') || '<p class="dica">Nenhum fiscal com acesso ao app de campo.</p>'}</div>
      <p class="dica" id="escConta" style="text-align:left"></p>
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
      const n = document.querySelectorAll('#escFiscais input:checked').length;
      $('#escConta').textContent = `${n} fiscal(is) escolhido(s) para a ${bvaAtual()}.`;
    };
    if (!e) $('#escBva').onchange = () => { const s = sugerir($('#escBva').value); $('#escIni').value = s.inicio; $('#escFim').value = s.fim; situar(); };
    $('#escIni').onchange = $('#escFim').onchange = situar;
    $('#escFiscais').onchange = situar;
    $('#escBusca').oninput = ev => { const q = nl(ev.target.value); document.querySelectorAll('.esc-fiscal').forEach(l => { l.hidden = !!q && !l.dataset.nome.includes(q); }); };
    situar();
    const salvar = async situacao => {
      const fiscais = [...document.querySelectorAll('#escFiscais input:checked')].map(i => i.dataset.fiscal);
      if (situacao === 'publicada' && !fiscais.length) return toast('Escolha pelo menos um fiscal para publicar.', true);
      const bts = document.querySelectorAll('#fEscala button'); bts.forEach(b => { b.disabled = true; });
      try {
        const r = await Sync.escalaSalvar({ id: e ? e.id : '', bva: bvaAtual(), inicio: $('#escIni').value, fim: $('#escFim').value, fiscais, situacao });
        AVISOS = r.avisos || [];
        toast(situacao === 'publicada' ? 'Escala publicada.' : 'Rascunho salvo.'); go('escalas');
      } catch (err) { bts.forEach(b => { b.disabled = false; }); toast(err.message || 'Não foi possível gravar.', true); }
    };
    $('#escRascunho').onclick = () => salvar('rascunho');
    $('#escPublicar').onclick = () => salvar('publicada');
    if (e) $('#escExcluir').onclick = async () => {
      if (!confirm(`Excluir a escala da ${e.bva} (${periodo(e)})?\n\nEla sai das telas dos fiscais e do painel; fica registrada no histórico.`)) return;
      try { await Sync.escalaExcluir(e.id); toast('Escala excluída.'); go('escalas'); } catch (err) { toast(err.message || 'Não foi possível excluir.', true); }
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
  document.addEventListener('click', ev => {
    const n = ev.target.closest('[data-escnova]'); if (n) return go('escala', '+' + n.dataset.escnova);
    const i = ev.target.closest('[data-esc]'); if (i) go('escala', i.dataset.esc);
  });
  return { lista, form, minha, cartaoMinha, aviso };
})();
