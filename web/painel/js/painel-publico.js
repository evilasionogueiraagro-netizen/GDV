/* Painel gerencial do GDV — aba "Dashboard público": liga/desliga a página pública web/dashboard/ (sem login) e escolhe o que ela
   mostra: título e apresentação, modos (mapa / números), períodos liberados, blocos de KPIs, gráficos e camadas do mapa, e a
   supressão de números pequenos. Usa as actions painelPublicoConfig / painelPublicoSalvar (Code.gs; só administrador).
   A página pública lê os agregados pela action publicoDados (sem credencial). "Pré-visualizar" abre ../dashboard/?previa=1,
   que usa a credencial deste painel para mostrar a configuração SALVA mesmo com o dashboard desligado.
   Não depende do período nem dos filtros e não aparece no Modo TV. */
(() => {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc, fmt = P.fmt;
  // grupos de blocos: [chave, rótulo curto, descrição]
  const GRUPOS = [
    ['Barreiras', [
      ['acoes', 'Ações de barreira', 'Quantidade de turnos de barreira (fixas e volantes).'],
      ['horas', 'Horas de barreira', 'Soma da duração dos turnos.'],
      ['veiculos', 'Veículos abordados', 'Total de veículos e evolução.'],
      ['pessoas', 'Pessoas orientadas', 'Estimativa de pessoas nos veículos (educação sanitária).'],
      ['porBarreira', 'Por barreira', 'Gráfico por BVA fixa; volantes somados num item só.'],
      ['tiposVeiculo', 'Tipos de veículo', 'Passeio, caminhão, ônibus…']]],
    ['TF de Barreira', [
      ['tfs', 'TFs lavrados', 'Total de termos (cancelados não contam).'],
      ['procedimentos', 'Por procedimento', 'Liberação, apreensão e rechaço.'],
      ['autos', 'Autos de infração', 'Total de autos.'],
      ['produtos', 'Produtos apreendidos', 'Produto, nº de apreensões e quantidade/unidade.']]],
    ['PCE', [
      ['levantamentos', 'Levantamentos', 'Total e por município (mapa).'],
      ['municipios', 'Municípios cobertos', '“X de 62” com levantamento.'],
      ['deteccoes', 'Detecções por praga', 'Detecções e suspeitas por praga; por município no mapa.'],
      ['amostras', 'Amostras e termos', 'Amostras colhidas e termos de colheita.']]],
    ['Gráficos e mapa', [
      ['mensal', 'Evolução no tempo', 'Veículos, TFs e levantamentos por dia ou mês.'],
      ['coropletico', 'Mapa por município', 'Municípios coloridos pelo indicador escolhido.'],
      ['bvas', 'BVAs fixas no mapa', 'Ponto de cada BVA fixa (volantes nunca aparecem).'],
      ['calor', 'Calor de detecções', 'Mancha aproximada (células de ~11 km), sem pontos de propriedades.'],
      ['aoVivo', 'Barreiras agora', 'BVAs fixas em funcionamento neste momento.']]]
  ];
  const AVISO_VIVO = 'Mostra publicamente onde há barreira fixa em funcionamento agora. Pode ajudar quem quer evitar a fiscalização.';
  const PERIODOS = [['15d', 'Últimos 15 dias'], ['30d', 'Últimos 30 dias'], ['ano', 'Ano atual'], ['anoAnterior', 'Ano anterior'], ['tudo', 'Desde o início'], ['intervalo', 'Intervalo (o visitante escolhe as datas)']];
  const E = { raiz: null, cfg: null, url: '', carregando: false, erro: '', sujo: false, msg: '', msgCls: '' };
  const urlPublica = () => { try { return new URL('../dashboard/', location.href).href; } catch (e) { return E.url; } };

  function montar() {
    const r = document.createElement('div'); r.className = 'pn-pub'; r.id = 'pn-pub';
    r.addEventListener('input', () => { E.sujo = true; aviso('Alterações não salvas.', ''); });
    r.addEventListener('change', e => { E.sujo = true; if (e.target.dataset.bloco === 'aoVivo' || e.target.id === 'pn-pub-ativo') destacar(); aviso('Alterações não salvas.', ''); });
    r.addEventListener('submit', e => { e.preventDefault(); salvar(); });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-pub]'); if (!b) return;
      if (b.dataset.pub === 'copiar') copiar(b);
      if (b.dataset.pub === 'previa') window.open(urlPublica() + '?previa=1', '_blank', 'noopener');
      if (b.dataset.pub === 'abrir') window.open(urlPublica(), '_blank', 'noopener');
      if (b.dataset.pub === 'recarregar') carregar();
    });
    return r;
  }
  function aviso(m, cls) { E.msg = m; E.msgCls = cls; const a = E.raiz && E.raiz.querySelector('#pn-pub-msg'); if (a) { a.textContent = m; a.className = 'pn-pub-msg' + (cls ? ' ' + cls : ''); } }
  function destacar() {
    const r = E.raiz; if (!r) return;
    const at = r.querySelector('#pn-pub-ativo'), st = r.querySelector('#pn-pub-sit');
    if (at && st) { st.textContent = at.checked ? 'Publicado: qualquer pessoa com o link vê a página.' : 'Desligado: o link mostra “Dashboard temporariamente indisponível”.'; st.className = 'pn-pub-sit ' + (at.checked ? 'on' : 'off'); }
    const v = r.querySelector('[data-bloco="aoVivo"]'), w = r.querySelector('#pn-pub-vivo-aviso'); if (v && w) w.classList.toggle('ligado', v.checked);
  }
  async function copiar(b) {
    const u = urlPublica(); let ok = false;
    try { await navigator.clipboard.writeText(u); ok = true; } catch (e) {
      const i = E.raiz.querySelector('#pn-pub-link'); if (i) { i.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
    }
    b.textContent = ok ? 'Link copiado ✓' : 'Copie o link ao lado'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar link'; }, 2500);
  }

  function desenhar() {
    const r = E.raiz; if (!r) return;
    if (!E.cfg) { r.innerHTML = `<div class="pn-cartao">${E.erro ? `<p class="pn-erro">Não foi possível ler a configuração: ${esc(E.erro)}</p>${/a[çc][ãa]o inv[áa]lida/i.test(E.erro) ? '<p class="pn-sub">O servidor ainda está com o <b>Code.gs antigo</b>. No Apps Script: cole o <code>Code.gs</code> novo, salve e crie uma <b>nova versão</b> da implantação (Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar).</p>' : ''}<button type="button" class="pn-btn" data-pub="recarregar">Tentar de novo</button>` : '<div class="pn-vazio">Carregando a configuração…</div>'}</div>`; return; }
    const c = E.cfg, B = c.blocos || {}, u = urlPublica();
    const caixa = (k, rot, desc, attr) => `<label class="pn-pub-op${k === 'aoVivo' ? ' pn-pub-op-vivo' : ''}"><input type="checkbox" ${attr}="${k}" ${(attr === 'data-bloco' ? B[k] : attr === 'data-modo' ? c.modos[k] : c.periodos.includes(k)) ? 'checked' : ''}><span><b>${esc(rot)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</span></label>`;
    r.innerHTML = `<p class="pn-sub" style="margin-top:4px">Página pública (sem login) com números agregados do e-GDV: nunca nomes, CPF/CNPJ, placas, propriedades, servidores ou coordenadas de levantamentos.</p>
    <form class="pn-pub-form" novalidate>
      <div class="pn-pub-grade">
        <section class="pn-cartao pn-pub-cartao" aria-labelledby="pn-pub-t1">
          <h3 id="pn-pub-t1">Publicação</h3>
          <label class="pn-pub-chave"><input type="checkbox" id="pn-pub-ativo" ${c.ativo ? 'checked' : ''}><span>Publicar dashboard</span></label>
          <p id="pn-pub-sit" class="pn-pub-sit"></p>
          <label class="pn-pub-campo">Link público<input id="pn-pub-link" readonly value="${esc(u)}"></label>
          <div class="pn-pub-acoes"><button type="button" class="pn-btn pn-btn-mini" data-pub="copiar">Copiar link</button><button type="button" class="pn-btn pn-btn-mini" data-pub="abrir">Abrir</button>
            <button type="button" class="pn-btn pn-btn-mini" data-pub="previa" title="Abre o dashboard em nova aba com a configuração salva, mesmo desligado">Pré-visualizar</button></div>
          <label class="pn-pub-campo">Título<input id="pn-pub-titulo" maxlength="120" value="${esc(c.titulo)}"></label>
          <label class="pn-pub-campo">Apresentação<textarea id="pn-pub-texto" maxlength="600" rows="3">${esc(c.texto)}</textarea></label>
          <fieldset class="pn-pub-fs"><legend>Modos</legend>${caixa('mapa', 'Mapa', 'Mapa interativo do Amazonas', 'data-modo')}${caixa('numeros', 'Números', 'Indicadores e gráficos', 'data-modo')}</fieldset>
          <fieldset class="pn-pub-fs"><legend>Períodos liberados</legend>${PERIODOS.map(([k, t]) => caixa(k, t, k === 'tudo' ? 'O que está na planilha principal (ano atual e anterior)' : '', 'data-periodo')).join('')}</fieldset>
          <fieldset class="pn-pub-fs"><legend>Privacidade</legend>${caixa('supressaoPequenos', 'Ocultar números pequenos', 'Municípios com 1 ou 2 levantamentos/detecções aparecem como “<3”; no calor, células com menos de 3 somem.', 'data-bloco')}</fieldset>
        </section>
        <section class="pn-cartao pn-pub-cartao" aria-labelledby="pn-pub-t2">
          <h3 id="pn-pub-t2">O que aparece</h3>
          ${GRUPOS.map(([g, it]) => `<fieldset class="pn-pub-fs"><legend>${esc(g)}</legend>${it.map(([k, t, d]) => caixa(k, t, d, 'data-bloco') + (k === 'aoVivo' ? `<p class="pn-pub-vivo" id="pn-pub-vivo-aviso" role="note">⚠️ ${esc(AVISO_VIVO)}</p>` : '')).join('')}</fieldset>`).join('')}
        </section>
      </div>
      <div class="pn-cartao pn-pub-rodape">
        <button type="submit" class="pn-btn pn-btn-prim" id="pn-pub-salvar">Salvar</button>
        <span class="pn-pub-msg${E.msgCls ? ' ' + E.msgCls : ''}" id="pn-pub-msg" role="status">${esc(E.msg)}</span>
        <span class="pn-sub" id="pn-pub-quem">${c.atualizadoEm ? `Salvo por ${esc(c.atualizadoPor || '—')} em ${esc(fmt.dataHora(c.atualizadoEm))}` : 'Ainda não configurado (padrão: desligado).'}</span>
      </div>
    </form>`;
    destacar();
  }

  function coletar() {
    const r = E.raiz, v = s => r.querySelector(s);
    const blocos = {}; r.querySelectorAll('[data-bloco]').forEach(i => { blocos[i.dataset.bloco] = i.checked; });
    const modos = {}; r.querySelectorAll('[data-modo]').forEach(i => { modos[i.dataset.modo] = i.checked; });
    return { ativo: v('#pn-pub-ativo').checked, titulo: v('#pn-pub-titulo').value, texto: v('#pn-pub-texto').value,
             modos, periodos: [...r.querySelectorAll('[data-periodo]')].filter(i => i.checked).map(i => i.dataset.periodo), blocos };
  }
  async function salvar() {
    const cfg = coletar();
    if (!cfg.periodos.length) return aviso('Libere pelo menos um período.', 'erro');
    if (!cfg.modos.mapa && !cfg.modos.numeros) return aviso('Deixe pelo menos um modo (Mapa ou Números) ligado.', 'erro');
    const b = E.raiz.querySelector('#pn-pub-salvar'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      const j = await P.chamar({ action: 'painelPublicoSalvar', config: cfg });
      E.cfg = j.config; E.url = j.url || E.url; E.sujo = false; E.msg = 'Salvo ✓'; E.msgCls = 'ok';
      desenhar();
    } catch (e) {
      if (!P.logado) return;
      aviso('Não salvou: ' + e.message, 'erro');
      if (b.isConnected) { b.disabled = false; b.textContent = 'Salvar'; }
    }
  }
  async function carregar() {
    if (E.carregando) return; E.carregando = true; E.erro = '';
    try { const j = await P.chamar({ action: 'painelPublicoConfig' }); E.cfg = j.config; E.url = j.url || ''; E.sujo = false; E.msg = ''; E.msgCls = ''; }
    catch (e) { E.erro = e.message; }
    finally { E.carregando = false; }
    desenhar();
  }
  function render(c) {
    if (!E.raiz) { E.raiz = montar(); desenhar(); }
    c.appendChild(E.raiz);
    if (!E.cfg && !E.carregando) carregar();
  }
  P.aoSair(() => { if (E.raiz) E.raiz.remove(); Object.assign(E, { raiz: null, cfg: null, url: '', erro: '', sujo: false, msg: '', msgCls: '' }); });
  P.registrarAba({ id: 'publico', titulo: 'Dashboard público', render, semFiltros: true });
})();
