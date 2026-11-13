// PCE em campo: lista e busca de produtores e dados dos municípios no aparelho (para trabalhar sem internet).
// Usa funções do app.js (view, go, tela, toast, $, esc, dBR, pad) e do pce-cadastros.js (PCECads) em tempo de execução.
//
// Dados baixados (action pceBaixarMunicipio do Code.gs, só com o módulo PCE): ficam nos stores "propriedades" e "pessoas", com
// campoMun (município baixado; nas pessoas, a lista) e frutosSugeridos nas propriedades que ainda não têm frutos cadastrados.
// Meta "pceCampo" = {MUNICÍPIO NORMALIZADO: {municipio, baixadoEm, nProps, nPessoas}}.
const Campo = (() => {
  const P = CONFIG.PCE;
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digitos = v => String(v || '').replace(/\D/g, '');
  const INTERVALO_MS = 6 * 3600e3;                                       // atualização automática: no máximo 1x a cada 6 h
  const MOSTRAR = 30;                                                   // produtores listados de uma vez
  const fmtDH = ms => { const d = new Date(Number(ms) || 0); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtDoc = d => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);
  const online = () => navigator.onLine && Sync.ativado();

  /* ================= dados no aparelho ================= */
  const lerMeta = async () => (await Store.meta('pceCampo')) || {};
  /** Produtores com registro ainda não enviado: os dados deles não saem do aparelho ao apagar. */
  async function docsEmUso() {
    const s = new Set();
    [...await Store.todos('levantamentos'), ...await Store.todos('colheitas'), ...await Store.todos('cadastrosPce'), ...await Store.todos('termosPce'), ...await Store.todos('propriedades')]
      .forEach(r => { if (r.pendente && !r.excluido) s.add(digitos(r.doc)); });
    return s;
  }
  /** campoMun das pessoas = municípios baixados das propriedades delas. Sem nenhum: some do aparelho (se não estiver pendente nem em uso). */
  async function ajustarPessoas(uso) {
    const porDoc = {};
    (await Store.todos('propriedades')).forEach(p => { if (p.campoMun) (porDoc[digitos(p.doc)] = porDoc[digitos(p.doc)] || new Set()).add(p.campoMun); });
    const del = [], upd = [];
    (await Store.todos('pessoas')).filter(x => Array.isArray(x.campoMun)).forEach(x => {
      const m = [...(porDoc[digitos(x.id)] || [])];
      if (m.length) { if (m.join('|') !== x.campoMun.join('|')) upd.push({ ...x, campoMun: m }); }
      else if (!x.pendente && !uso.has(digitos(x.id))) del.push(x.id);
      else { const o = { ...x }; delete o.campoMun; upd.push(o); }
    });
    await Store.apagar('pessoas', del);
    await Store.gravarVarios('pessoas', upd);
  }
  /** Grava o que veio do servidor. Registro local ainda não enviado (pendente) nunca é sobrescrito. */
  async function aplicar(r, pedidos) {
    const agora = Date.now(), chaves = new Set(pedidos.map(norm));
    const props = (r.propriedades || []).filter(p => p && p.id), pessoas = (r.pessoas || []).filter(p => p && p.id);
    const novos = new Set(props.map(p => p.id));
    // saiu da planilha (ou mudou de município) desde o último download: some do aparelho (só o que foi baixado e não tem edição local)
    const velhos = (await Store.todos('propriedades')).filter(p => p.campoMun && chaves.has(norm(p.campoMun)) && !novos.has(p.id) && !p.pendente);
    await Store.apagar('propriedades', velhos.map(p => p.id));
    await Store.mesclar('propriedades', props, (local, row) => (local && local.pendente ? { ...local, campoMun: row.campoMun } : { ...row, pendente: 0, baixadoEm: agora }));
    await Store.mesclar('pessoas', pessoas, (local, row) => {
      const mun = [...new Set([...((local && Array.isArray(local.campoMun) && local.campoMun) || []), ...(row.campoMun || [])])];
      return local && local.pendente ? { ...local, campoMun: mun } : { ...(local || {}), ...row, campoMun: mun, pendente: 0, baixadoEm: agora };
    });
    // fichas oficiais já feitas dessas propriedades: para mostrar e refazer o PDF sem internet
    const cads = (r.cadastrosPce || []).filter(c => c && c.id), novosC = new Set(cads.map(c => c.id));
    const velhosC = (await Store.todos('cadastrosPce')).filter(c => c.campoMun && chaves.has(norm(c.campoMun)) && !novosC.has(c.id) && !c.pendente);
    await Store.apagar('cadastrosPce', velhosC.map(c => c.id));
    await Store.mesclar('cadastrosPce', cads, (local, row) => (local && local.pendente ? null : { ...(local || {}), ...row, pendente: 0, baixadoEm: agora }));
    await ajustarPessoas(await docsEmUso());
    const m = await lerMeta();
    (r.municipios || []).forEach(x => { m[norm(x.municipio)] = { municipio: x.municipio, baixadoEm: agora, nProps: x.nProps, nPessoas: x.nPessoas }; });
    await Store.setMeta('pceCampo', m);
    return r.municipios || [];
  }
  /** Baixa um município de cada vez (progresso e limite de propriedades por chamada). */
  async function baixar(municipios, progresso) {
    const feitos = [];
    for (const [i, mun] of municipios.entries()) {
      if (progresso) progresso(`Baixando ${mun} (${i + 1} de ${municipios.length})…`);
      let r;
      try { r = await Sync.pceBaixarMunicipio([mun]); }
      catch (e) {
        if (/a[cç][aã]o inv[aá]lida/i.test(e.message)) throw new Error('A planilha ainda não tem esta função: a gerência precisa atualizar o Code.gs (nova versão da implantação).');
        if (e.name === 'AbortError' || e.name === 'TypeError') throw new Error('Sem resposta da planilha. Confira a internet e tente de novo.');
        throw e;
      }
      feitos.push(...await aplicar(r, [mun]));
    }
    return feitos;
  }
  /** Apaga do aparelho os dados baixados de um município (o que tem registro pendente fica, como dado comum). */
  async function apagar(municipio) {
    const K = norm(municipio), uso = await docsEmUso();
    const props = (await Store.todos('propriedades')).filter(p => p.campoMun && norm(p.campoMun) === K);
    const fora = props.filter(p => !p.pendente && !uso.has(digitos(p.doc))), ficam = props.filter(p => !fora.includes(p));
    await Store.apagar('propriedades', fora.map(p => p.id));
    await Store.gravarVarios('propriedades', ficam.map(p => { const o = { ...p }; delete o.campoMun; return o; }));
    const cads = (await Store.todos('cadastrosPce')).filter(c => c.campoMun && norm(c.campoMun) === K);
    await Store.apagar('cadastrosPce', cads.filter(c => !c.pendente && !uso.has(digitos(c.doc))).map(c => c.id));
    await ajustarPessoas(uso);
    const m = await lerMeta(); delete m[K]; await Store.setMeta('pceCampo', m);
    return { apagadas: fora.length, mantidas: ficam.length };
  }
  let tentadoEm = 0, auto = false;
  /** Chamado ao fim de cada sincronização: atualiza os municípios baixados há mais de 6 h (melhor esforço, em silêncio). */
  async function atualizarSozinho() {
    if (auto || !Sync.ativado() || localStorage.getItem('gdv.revogado') || !navigator.onLine || !Sync.pode('pce')) return false;
    const venc = Object.values(await lerMeta()).filter(x => Date.now() - (Number(x.baixadoEm) || 0) >= INTERVALO_MS).map(x => x.municipio);
    if (!venc.length || Date.now() - tentadoEm < 15 * 60e3) return false;
    tentadoEm = Date.now(); auto = true;
    try { await baixar(venc); if (VIEW_CAMPO() === 'pcecampo') telaBaixar(); return true; } finally { auto = false; }
  }
  const VIEW_CAMPO = () => (typeof VIEW !== 'undefined' ? VIEW : '');
  /** LGPD: a gerência tirou o módulo PCE ou revogou o aparelho → os dados baixados e o catálogo saem do aparelho (o que tem registro pendente fica). */
  async function limparSeSemAcesso() {
    if (!(localStorage.getItem('gdv.revogado') || !Sync.pode('pce'))) return false;
    await Store.apagar('meta', ['catalogoPce']);                         // catálogo de culturas e pragas: o servidor só manda a quem tem o módulo
    const m = Object.values(await lerMeta()); if (!m.length) return false;
    for (const x of m) await apagar(x.municipio);
    return true;
  }
  window.addEventListener('gdv-permissoes', () => { limparSeSemAcesso().catch(() => {}); });
  window.addEventListener('gdv-dados', () => { limparSeSemAcesso().catch(() => {}); });

  /* ================= busca (nome do produtor, propriedade, código ou CPF/CNPJ) ================= */
  async function buscar(q, limite = 20) {
    const t = norm(q), d = digitos(q), pal = t.split(' ').filter(Boolean);
    if (t.length < 2 && d.length < 3) return [];
    const pes = new Map((await Store.todos('pessoas')).map(p => [digitos(p.id), p]));
    const props = (await Store.todos('propriedades')).filter(p => !p.excluido);
    const casa = txt => pal.length && pal.every(w => txt.includes(w));
    const res = [], comProp = new Set();
    props.forEach(p => {
      const pe = pes.get(digitos(p.doc)) || null; comProp.add(digitos(p.doc));
      if (casa(norm([p.nome, p.codigo, pe && pe.nome].join(' '))) || (d.length >= 3 && (digitos(p.doc).includes(d) || digitos(p.codigo).includes(d)))) res.push({ prop: p, pessoa: pe });
    });
    pes.forEach((pe, doc) => { if (!comProp.has(doc) && (casa(norm(pe.nome)) || (d.length >= 3 && doc.includes(d)))) res.push({ prop: null, pessoa: pe }); });
    const nome = x => norm((x.pessoa && x.pessoa.nome) || '') + ' ' + norm((x.prop && x.prop.nome) || '');
    return res.sort((a, b) => nome(a).localeCompare(nome(b))).slice(0, limite);
  }
  /** Texto para a consulta sem internet: de quando são os dados baixados que servem a este CPF/CNPJ. */
  async function textoOffline(doc) {
    const m = await lerMeta(), muns = Object.values(m);
    if (!muns.length) return 'só os dados deste aparelho (nenhum município baixado para o campo)';
    const meus = new Set((await Store.todos('propriedades')).filter(p => p.campoMun && digitos(p.doc) === doc).map(p => norm(p.campoMun)));
    const pe = await Store.obter('pessoas', doc); if (pe && Array.isArray(pe.campoMun)) pe.campoMun.forEach(x => meus.add(norm(x)));
    const lista = (meus.size ? muns.filter(x => meus.has(norm(x.municipio))) : muns);
    const txt = lista.map(x => `${x.municipio} em ${fmtDH(x.baixadoEm)}`).join('; ');
    return meus.size ? `dados baixados (${txt})` : `dados baixados (${txt}) — este CPF/CNPJ não está neles`;
  }
  /** Resumo (municípios baixados) para o cartão do módulo e para a lista de produtores. */
  async function resumo() {
    const m = Object.values(await lerMeta());
    return m.length ? m.map(x => `${x.municipio} (${x.nProps}) — ${fmtDH(x.baixadoEm)}`).join(' · ') : '';
  }
  /**
   * Consulta o produtor no servidor (com internet) e guarda no aparelho o que veio, sem sobrescrever registro pendente. Sem internet ou sem
   * resposta, devolve só o que o aparelho já tem (parcial: true). Erro de permissão ou de acesso sobe.
   */
  async function consultar(doc) {
    if (online()) {
      try {
        const r = await Sync.pceConsultar(doc), t = Date.now();
        if (r.pessoa) { const l = await Store.obter('pessoas', r.pessoa.id || doc); if (!l || !l.pendente) await Store.gravar('pessoas', { ...(l || {}), ...r.pessoa, id: r.pessoa.id || doc, criadoEm: (l && l.criadoEm) || t, atualizadoEm: t, pendente: 0 }); }
        for (const p of r.propriedades || []) { const l = await Store.obter('propriedades', p.id); if (p.id && (!l || !l.pendente)) await Store.gravar('propriedades', { ...(l || {}), ...p, pendente: 0 }); }
        return { achou: !!(r.pessoa || (r.propriedades || []).length), parcial: false, visitas: Number(r.levantamentos) || 0, colheitas: Number(r.colheitas) || 0 };
      } catch (e) { if (e.semPermissao || /revogado|inv[aá]lido/i.test(e.message)) throw e; }   // sem resposta: segue com o aparelho
    }
    const achou = !!(await Store.obter('pessoas', doc)) || (await Store.todos('propriedades')).some(p => !p.excluido && digitos(p.doc) === doc);
    return { achou, parcial: true, offline: await textoOffline(doc) };
  }

  /* ================= tela: produtores ================= */
  /** Produtores do aparelho (pessoas + propriedades), um por CPF/CNPJ, com as propriedades e a última atividade. */
  async function produtores() {
    const pes = new Map((await Store.todos('pessoas')).filter(p => !p.excluido).map(p => [digitos(p.id), p]));
    const por = new Map();
    const novo = (doc, pe) => { if (!por.has(doc)) por.set(doc, { doc, pessoa: pe || pes.get(doc) || null, props: [], pend: false }); return por.get(doc); };
    pes.forEach((pe, doc) => { if (doc) novo(doc, pe); });
    (await Store.todos('propriedades')).filter(p => !p.excluido).forEach(p => { const doc = digitos(p.doc); if (!doc) return; const x = novo(doc); x.props.push(p); if (p.pendente) x.pend = true; });
    por.forEach(x => { if (x.pessoa && x.pessoa.pendente) x.pend = true; });
    return [...por.values()];
  }
  const nomeDe = x => (x.pessoa && x.pessoa.nome) || (x.props[0] && x.props[0].nome) || 'Produtor sem nome';
  const linhaProdutor = x => `<li><button type="button" class="campo-res-item" data-campo="abrir" data-cpf="${esc(x.doc)}"><b>${esc(nomeDe(x))}</b>
      <small>${esc([fmtDoc(x.doc), x.props.map(p => p.nome || p.codigo).filter(Boolean).slice(0, 2).join(', ') || 'sem propriedade cadastrada', x.props[0] && x.props[0].municipio].filter(Boolean).join(' · '))}</small>
      ${x.pend ? `<small>${icone('sincronizar')} aguardando envio</small>` : ''}</button></li>`;

  async function telaProdutores() {
    const mostrar = tela();
    const s = await PCEUI.exigirServidor('pce', null, true); if (!s || !mostrar.viva()) return;
    const todos = (await produtores()).sort((a, b) => norm(nomeDe(a)).localeCompare(norm(nomeDe(b)))), baixados = await resumo();
    const podeAnt = PCEUI.podeAntigo(), dig = PCEUI.soDigitador(s) && podeAnt;
    if (!mostrar.viva()) return;
    mostrar(`<div class="card pce-serv"><div><b>${esc(s.nome)}</b><small>${dig ? 'Digitação de registros do papel' : esc(s.cargo) + ' · ' + esc(s.lotacao)}${s.matricula ? ' · Mat. ' + esc(s.matricula) : ''}</small></div>
        <button class="mini" data-pce="servidor" id="pce-meusdados">${icone('pessoa')} Meus dados</button></div>
      <div class="card"><h3>${icone('pessoa')} Produtores</h3>
        <label>Município<select id="campoMun"><option value="">Todos os municípios</option>${P.municipios.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></label>
        <label>Buscar por CPF/CNPJ, nome do produtor, propriedade ou código<input id="campoQ" type="search" autocomplete="off" inputmode="search" placeholder="ex.: 529.982.247-25 ou Sítio Boa Vista"></label>
        <div id="campoRes" aria-live="polite"></div>
        <button class="botao" type="button" data-campo="novo" id="campo-novo">${icone('mais')} Novo produtor</button></div>
      <div class="card" id="campo-offline"><h3>${icone('baixar')} Dados para trabalhar sem internet</h3>
        <p class="dica" style="text-align:left" id="pce-campo-res">${baixados ? 'No aparelho: ' + esc(baixados) : 'Nenhum município baixado neste aparelho.'}</p>
        <button class="botao sec" type="button" data-v="pcecampo" id="pce-campo">${icone('baixar')} Baixar dados para o campo</button></div>`);
    const q = $('#campoQ'), saida = $('#campoRes'), selMun = $('#campoMun');
    let tq = null, seq = 0;
    const desenhar = async () => {
      const eu = ++seq, txt = q.value.trim(), d = digitos(txt);
      const mun = norm(selMun.value), base = mun ? todos.filter(x => x.props.some(p => norm(p.municipio) === mun)) : todos;   // filtro por município: produtores com propriedade nele
      let lista;
      if (txt.length < 2 && d.length < 3) lista = base.slice(0, MOSTRAR);
      else {
        const docs = new Set((await buscar(txt, 80)).map(r => digitos(r.prop ? r.prop.doc : r.pessoa.id)));
        lista = base.filter(x => docs.has(x.doc)).slice(0, MOSTRAR);
      }
      if (eu !== seq || !saida.isConnected) return;
      const cheio = txt.length < 2 && d.length < 3;
      let extra = '';
      if (!lista.length) {
        extra = `<div class="tf-novo">Nenhum produtor encontrado neste aparelho. ${online() && (d.length === 11 || d.length === 14) ? 'Toque em “Procurar no servidor” para ver se já tem cadastro.' : 'Baixe os dados do município (abaixo) ou cadastre como novo.'}</div>`
          + (online() && (d.length === 11 || d.length === 14) ? `<button class="botao sec" type="button" data-campo="servidor" data-cpf="${esc(d)}" id="campo-servidor">${icone('busca')} Procurar no servidor</button>` : '');
      } else if (cheio && base.length > MOSTRAR) extra = `<p class="dica">Mostrando ${MOSTRAR} de ${base.length} produtores${mun ? ' neste município' : ' neste aparelho'}. Digite para buscar.</p>`;
      saida.innerHTML = `${lista.length ? `<ul class="campo-res">${lista.map(linhaProdutor).join('')}</ul>` : ''}${extra}`;
    };
    q.oninput = () => { clearTimeout(tq); tq = setTimeout(() => desenhar().catch(() => {}), 200); };
    selMun.onchange = () => desenhar().catch(() => {});
    await desenhar();
  }

  /* ================= tela: baixar dados para o campo ================= */
  /* ================= tela: novo Termo (aba Termos) ================= */
  // Procura o produtor ou a propriedade para gerar o Termo: primeiro neste aparelho; se não achar, na planilha (pceBuscarTexto). Sem internet,
  // avisa que só o aparelho foi consultado. O que vem da planilha é só a identificação: o cadastro completo chega pelo consultar(doc).
  async function telaNovoTermo() {
    const mostrar = tela();
    const s = await PCEUI.exigirServidor('pcenovotermo', null, true); if (!s || !mostrar.viva()) return;
    if (!Sync.pode('pce') || PCEUI.soDigitador(s)) { toast('O Termo de campo é gerado por quem tem o módulo PCE e os dados de servidor.', true); return go('pcetermos'); }
    const todos = (await produtores()).sort((a, b) => norm(nomeDe(a)).localeCompare(norm(nomeDe(b))));
    if (!mostrar.viva()) return;
    mostrar(`<div class="card" id="pce-novotermo"><h3>${icone('formulario')} Novo Termo de Fiscalização</h3>
        <p class="dica" style="text-align:left">Procure o produtor ou a propriedade. Ao abrir, escolha “Nova visita” ou “Termos de Fiscalização” na propriedade.</p>
        <label>Município<select id="ntMun"><option value="">Todos os municípios</option>${P.municipios.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></label>
        <label>Buscar por CPF/CNPJ, nome do produtor, propriedade ou código<input id="ntQ" type="search" autocomplete="off" inputmode="search"></label>
        <h4 class="pce-sub">Neste aparelho</h4><div id="ntLocal" aria-live="polite"></div>
        <h4 class="pce-sub">Na planilha</h4><div id="ntSrv" aria-live="polite"></div></div>
      <button class="botao sec" type="button" data-v="pcetermos">${icone('voltar')} Voltar aos termos</button>`);
    const q = $('#ntQ'), selMun = $('#ntMun'), local = $('#ntLocal'), srv = $('#ntSrv');
    let tq = null, seq = 0;
    const basta = () => norm(q.value).length >= 3 || digitos(q.value).length >= 3;
    const srvInicial = () => {
      srv.innerHTML = online()
        ? `<button class="botao sec" type="button" id="nt-planilha" ${basta() ? '' : 'disabled'}>${icone('busca')} Procurar na planilha</button>${basta() ? '' : '<p class="dica" style="text-align:left">Digite pelo menos 3 letras ou números.</p>'}`
        : `<div class="tf-novo" id="nt-offline">${icone('alerta')} Sem internet: a busca olhou só este aparelho. Com internet, dá para procurar na planilha.</div>`;
    };
    const desenhar = async () => {
      const eu = ++seq, txt = q.value.trim(), d = digitos(txt), mun = norm(selMun.value);
      const base = mun ? todos.filter(x => x.props.some(p => norm(p.municipio) === mun)) : todos;
      let lista = [];
      if (txt.length >= 2 || d.length >= 3) {
        const docs = new Set((await buscar(txt, 80)).map(r => digitos(r.prop ? r.prop.doc : r.pessoa.id)));
        lista = base.filter(x => docs.has(x.doc)).slice(0, MOSTRAR);
      }
      if (eu !== seq || !local.isConnected) return;
      local.innerHTML = lista.length ? `<ul class="campo-res">${lista.map(linhaProdutor).join('')}</ul>`
        : `<p class="dica" style="text-align:left">${txt.length >= 2 || d.length >= 3 ? 'Nenhum produtor encontrado neste aparelho.' : 'Digite para buscar.'}</p>`;
      srvInicial();
    };
    const procurar = async btn => {
      const eu = seq; btn.disabled = true; btn.textContent = 'Procurando…';
      try {
        const r = await Sync.pceBuscarTexto(q.value.trim(), selMun.value);
        if (eu !== seq || !srv.isConnected) return;
        const l = r.resultados || [];
        srv.innerHTML = l.length ? `<ul class="campo-res">${l.map(x => `<li><button type="button" class="campo-res-item" data-campo="trazer" data-cpf="${esc(digitos(x.doc))}"><b>${esc(x.nome || ((x.propriedades || [])[0] || {}).nome || 'Produtor sem nome')}</b>
            <small>${esc([fmtDoc(digitos(x.doc)), (x.propriedades || []).map(p => p.nome || p.codigo).filter(Boolean).slice(0, 2).join(', ') || 'sem propriedade cadastrada', ((x.propriedades || [])[0] || {}).municipio].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>
            ${Number(r.total) > l.length ? `<p class="dica" style="text-align:left">Mostrando ${l.length} de ${Number(r.total)}. Escreva mais para afinar a busca.</p>` : ''}`
          : `<div class="tf-novo">Nenhum produtor encontrado na planilha. Cadastre como novo.</div>
            <button class="botao sec" type="button" data-campo="novo">${icone('mais')} Novo produtor</button>`;
      } catch (e) {
        if (eu !== seq || !srv.isConnected) return;
        srvInicial();
        toast(/a[cç][aã]o inv[aá]lida/i.test(e.message) ? 'A planilha ainda não tem esta busca: a gerência precisa atualizar o Code.gs.'
          : (e.name === 'AbortError' || e.name === 'TypeError') ? 'Sem resposta da planilha. Confira a internet e tente de novo.' : e.message, true);
      }
    };
    q.oninput = () => { clearTimeout(tq); tq = setTimeout(() => desenhar().catch(() => {}), 200); };
    selMun.onchange = () => desenhar().catch(() => {});
    srv.onclick = e => { const b = e.target.closest('#nt-planilha'); if (b && !b.disabled) procurar(b); };
    await desenhar();
  }

  async function telaBaixar() {
    const mostrar = tela();
    const m = await lerMeta(), lista = Object.values(m).sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));
    if (!mostrar.viva()) return;
    const totP = lista.reduce((s, x) => s + (x.nProps || 0), 0), totPe = lista.reduce((s, x) => s + (x.nPessoas || 0), 0);
    mostrar(`<div class="card pce-stats">
        <div class="pce-stats-topo">
          <b>${icone('baixar')} Armazenamento offline</b>
          <small>Dados guardados neste aparelho</small>
        </div>
        <div class="pce-stats-grid">
          <div class="pce-stat-item"><span class="pce-stat-num">${lista.length}</span><span class="pce-stat-rot">Municípios salvos</span></div>
          <div class="pce-stat-item"><span class="pce-stat-num">${totP}</span><span class="pce-stat-rot">Propriedades</span></div>
          <div class="pce-stat-item"><span class="pce-stat-num">${totPe}</span><span class="pce-stat-rot">Produtores</span></div>
        </div>
      </div>
      <div class="card" id="campo-topo"><h3>${icone('baixar')} Dados para o campo</h3>
        <p class="dica" style="text-align:left">Antes de sair, <b>com internet</b>, baixe os produtores e as propriedades do(s) município(s) da viagem. Sem internet, a busca por CPF, nome ou código e a nova visita usam esses dados. Com internet, eles se atualizam sozinhos (a cada 6 h).</p>
        <p class="dica campo-lgpd" style="text-align:left">${icone('bloqueio')} São dados pessoais (LGPD): use só no serviço e <b>apague do aparelho ao voltar</b>.</p></div>
      <div class="card" id="campo-baixados"><h3>Neste aparelho</h3>${lista.length ? lista.map(x => `<div class="campo-mun" data-mun="${esc(x.municipio)}">
          <div><b>${esc(x.municipio)}</b> — ${x.nProps} propriedade(s), ${x.nPessoas} produtor(es) <small>— baixado em ${esc(fmtDH(x.baixadoEm))}</small></div>
          <div class="campo-mun-acoes"><button class="mini" data-campo="atualizar" data-mun="${esc(x.municipio)}">Atualizar</button>
          <button class="mini campo-apagar" data-campo="apagar" data-mun="${esc(x.municipio)}">Apagar do aparelho</button></div></div>`).join('')
        : '<div class="vazio">Nenhum município baixado.</div>'}</div>
      <div class="card"><h3>Baixar municípios</h3>
        <label>Filtrar<input id="campo-filtro" placeholder="Nome do município" autocomplete="off"></label>
        <div class="campo-muns" id="campo-muns">${P.municipios.map(x => `<label class="chk"><input type="checkbox" name="campo-mun" value="${esc(x)}" ${m[norm(x)] ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
        <button class="botao" type="button" data-campo="baixar" id="campo-baixar">${icone('baixar')} Baixar selecionados</button>
        <div id="campo-st" class="tf-status" aria-live="polite"></div></div>
      <button class="botao sec" data-v="pce">${icone('voltar')} Voltar aos produtores</button>`);
    $('#campo-filtro').oninput = e => { const q = norm(e.target.value); document.querySelectorAll('#campo-muns label').forEach(l => { l.hidden = !!q && !norm(l.textContent).includes(q); }); };
  }
  async function executarBaixar(muns) {
    const st = $('#campo-st'), btn = $('#campo-baixar');
    if (!muns.length) return toast('Marque pelo menos um município.', true);
    if (!navigator.onLine) return toast('Sem internet: baixe os dados antes de sair, com conexão.', true);
    if (!Sync.ativado()) return toast('Aparelho não ativado.', true);
    if (btn) btn.disabled = true;
    const msg = t => { const s = $('#campo-st'); if (s) s.innerHTML = `<small>${esc(t)}</small>`; };
    try {
      const r = await baixar(muns, msg);
      toast(`Dados baixados: ${r.map(x => `${x.municipio} (${x.nProps})`).join(', ')}.`);
      if (VIEW_CAMPO() === 'pcecampo') await telaBaixar();
    } catch (e) {
      if (st && st.isConnected) st.innerHTML = `<div class="tf-alerta">${icone('alerta')} ${esc(e.message)}</div>`;
      toast(e.message, true);
    } finally { if (btn && btn.isConnected) btn.disabled = false; }
  }

  /* ================= ações (cliques) ================= */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-campo]'); if (!el) return;
    const a = el.dataset.campo, mun = el.dataset.mun;
    try {
      if (a === 'baixar') await executarBaixar([...document.querySelectorAll('input[name=campo-mun]:checked')].map(c => c.value));
      else if (a === 'atualizar') await executarBaixar([mun]);
      else if (a === 'apagar') {
        if (!confirm(`Apagar do aparelho os dados baixados de ${mun}? O que tem registro ainda não enviado fica. Os dados continuam na planilha.`)) return;
        const r = await apagar(mun);
        toast(`${mun}: ${r.apagadas} propriedade(s) apagada(s)${r.mantidas ? `; ${r.mantidas} ficou(aram) por ter registro pendente` : ''}.`);
        await telaBaixar();
      }
      else if (a === 'abrir') go('pceprodutor', el.dataset.cpf);
      else if (a === 'novo') { const v = ($('#campoQ') || $('#ntQ') || {}).value; go('pceprodform', { doc: digitos(v).length >= 11 ? digitos(v) : '' }); }
      else if (a === 'trazer') {                                          // resultado da planilha: traz o cadastro completo para o aparelho e abre o produtor
        el.disabled = true;
        const r = await consultar(el.dataset.cpf);
        if (r.achou) go('pceprodutor', el.dataset.cpf); else { el.disabled = false; toast('Não foi possível trazer este cadastro agora. Tente de novo.', true); }
      }
      else if (a === 'servidor') {
        el.disabled = true;
        const r = await consultar(el.dataset.cpf);
        if (r.achou) go('pceprodutor', el.dataset.cpf); else { el.disabled = false; toast('Sem cadastro no servidor para este CPF/CNPJ. Use “Novo produtor”.', true); }
      }
    } catch (err) { toast(err.message || String(err), true); }
  });

  return { telaProdutores, telaNovoTermo, telaBaixar, baixar, apagar, atualizarSozinho, buscar, consultar, textoOffline, resumo, produtores, norm, fmtDoc };
})();
