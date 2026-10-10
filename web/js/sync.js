// Sincronização com a planilha (Apps Script). Envia o que está pendente e recebe o que mudou.
const Sync = (() => {
  let rodando = false;
  const listeners = [];
  let estado = { tipo: 'idle', msg: '' };

  const cfg = () => ({
    url: localStorage.getItem('gdv.url') || CONFIG.sync.url || '',
    key: localStorage.getItem('gdv.key') || ''
  });
  const ativado = () => { const c = cfg(); return !!(c.url && c.key); };
  const nome = () => localStorage.getItem('gdv.nome') || '';

  /** Troca o código de 6 dígitos por uma credencial própria do aparelho, vinculada ao nome do fiscal. */
  async function ativar(codigo, urlManual) {
    const url = (urlManual || cfg().url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('Endereço do servidor inválido.');
    const cod = String(codigo || '').replace(/\D/g, '');
    if (cod.length !== 6) throw new Error('O código tem 6 dígitos.');
    let j;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ativar', codigo: cod }), redirect: 'follow' });
      j = await r.json();
    } catch (e) { throw new Error('Sem internet ou servidor indisponível. A ativação precisa de conexão.'); }
    if (!j.ok) throw new Error(j.erro || 'Falha na ativação.');
    localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.key', j.token);
    localStorage.setItem('gdv.nome', j.nome); localStorage.removeItem('gdv.revogado');
    return j.nome;
  }
  function desativar() { ['gdv.key', 'gdv.nome', 'gdv.revogado'].forEach(k => localStorage.removeItem(k)); }
  function emitir(e) { estado = e; listeners.forEach(f => f(e)); }

  async function chamar(corpo, limiteMs) {
    const c = cfg(), ctrl = new AbortController(), t = limiteMs ? setTimeout(() => ctrl.abort(), limiteMs) : null;
    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita preflight CORS
        body: JSON.stringify({ ...corpo, key: c.key }),
        redirect: 'follow',
        signal: ctrl.signal
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || 'Erro no servidor');
      return j;
    } finally { if (t) clearTimeout(t); }
  }

  const limpo = ({ pendente, provisorio, ...r }) => r;

  const NOMES = ['t', 'v', 'f', 'p', 'l', 'g', 'c', 'r'];
  const STORES = { t: 'turnos', v: 'veiculos', f: 'tfs', p: 'pessoas', l: 'placas', g: 'levantamentos', c: 'colheitas', r: 'propriedades' };
  const CAMPOS = { t: 'turnos', v: 'veiculos', f: 'tfs', p: 'pessoas', l: 'placas', g: 'levantamentos', c: 'colheitas', r: 'propriedades' };   // nome no corpo da requisição
  const LIMITES = { t: 500, v: 1000, f: 100, p: 300, l: 300, g: 100, c: 100, r: 300 };                                                         // registros por rodada
  const lerJSON = (v, pad) => { try { return JSON.parse(v) || pad; } catch (e) { return pad; } };

  /* Fotos e assinaturas (PCE): ficam no aparelho (store "arquivos") e sobem ao Drive depois do sync principal.
     Só contam/sobem as que estão ligadas a um levantamento ou termo salvo (não excluído): rascunhos não sobem. */
  function idsReferenciados(regs) {
    const s = new Set();
    regs.forEach(r => {
      if (!r || r.excluido) return;
      lerJSON(r.fotos, []).forEach(id => id && s.add(id));
      Object.values(lerJSON(r.assinaturas, {})).forEach(id => id && s.add(id));
    });
    return s;
  }
  async function arquivosPendentes(regs) {
    if (!regs) regs = [...await Store.todos('levantamentos'), ...await Store.todos('colheitas')];
    const ref = idsReferenciados(regs);
    return (await Store.chaves('arquivos', 'enviado', 0)).filter(id => ref.has(id));
  }

  async function pendentes() {
    const lst = await Promise.all(NOMES.map(n => Store.todos(STORES[n])));
    const o = {}; NOMES.forEach((n, i) => { o[n] = lst[i].filter(x => x.pendente); });
    o.a = await arquivosPendentes([...lst[NOMES.indexOf('g')], ...lst[NOMES.indexOf('c')]]);
    o.total = NOMES.reduce((s, n) => s + o[n].length, 0) + o.a.length;
    return o;
  }

  /* Numeração de TF: o servidor guarda UMA sequência por barreira/ano. Aqui guardamos só o "último nº usado" conhecido,
     para propor um número provisório quando não há internet. */
  async function lembrarUltimos(ultimos) {
    if (!ultimos) return;
    const uv = (await Store.meta('ultimoVisto')) || {};
    Object.keys(ultimos).forEach(k => { uv[k] = Math.max(uv[k] || 0, ultimos[k] || 0); });
    await Store.setMeta('ultimoVisto', uv);
  }
  /* Termo de Colheita (PCE): uma sequência por unidade/ano, chave "UNIDADE|ano" (unidade em maiúsculas). */
  const unidadePce = u => String(u || '').trim().replace(/\s+/g, ' ').toUpperCase();
  async function lembrarUltimosPce(ultimos) {
    if (!ultimos) return;
    const uv = (await Store.meta('ultimoVistoPce')) || {};
    Object.keys(ultimos).forEach(k => { const kk = k.toUpperCase(); uv[kk] = Math.max(uv[kk] || 0, Number(ultimos[k]) || 0); });
    await Store.setMeta('ultimoVistoPce', uv);
  }
  const pceProximoNumero = (unidade, ano) => chamar({ action: 'pceProximoNumero', unidade: unidadePce(unidade), ano }, 9000);
  /** Emissão do Termo de Colheita: a planilha só grava se o número ainda estiver livre (como o TF). */
  const pceEmitir = (colheita, pessoa, propriedade) => chamar({ action: 'pceEmitir', colheita: limpo(colheita),
    pessoa: pessoa ? limpo(pessoa) : undefined, propriedade: propriedade ? limpo(propriedade) : undefined }, 20000);
  /** Cadastro do produtor (pessoa + propriedades) e nº de levantamentos/termos, consultados no servidor. */
  const pceConsultar = doc => chamar({ action: 'pceConsultar', doc }, 15000);

  // Falhas por arquivo nesta sessão: o arquivo que falhou vai para o fim da fila e não impede o envio dos outros.
  const falhasArq = {};
  /** Envia ao Drive até N fotos/assinaturas pendentes, uma por requisição. Os dados ficam no aparelho (reimpressão offline). */
  async function enviarPendentesArquivos(ids) {
    let enviados = 0, erro = null;
    const fila = ids.map((id, i) => ({ id, i })).sort((x, y) => (falhasArq[x.id] || 0) - (falhasArq[y.id] || 0) || x.i - y.i).map(x => x.id);
    for (const id of fila.slice(0, (CONFIG.PCE && CONFIG.PCE.arquivosPorRodada) || 5)) {
      const a = await Store.obter('arquivos', id);
      if (!a || a.enviado || !a.dados) continue;
      const ext = a.mime === 'image/png' ? 'png' : 'jpg';
      const arquivo = { id: a.id, dono: a.dono, donoId: a.donoId, tipo: a.tipo, papel: a.papel || '', mime: a.mime,
        nome: `${a.donoId}_${a.tipo}_${a.papel || 'n'}_${a.id}.${ext}` };
      let r;
      try { r = await chamar({ action: 'arquivoEnviar', arquivo, base64: String(a.dados).replace(/^data:[^,]*,/, '') }, 60000); }
      catch (e) {
        falhasArq[id] = (falhasArq[id] || 0) + 1; erro = erro || e;
        // credencial recusada ou sem resposta do servidor (rede/tempo esgotado): os outros falhariam também
        if (/revogado|n[aã]o ativado|abort|fetch|network|rede/i.test(e.message) || e.name === 'AbortError' || e.name === 'TypeError') break;
        continue;
      }
      delete falhasArq[id];
      const atual = await Store.obter('arquivos', id);
      if (!atual) continue;                                                   // removido durante o envio
      await Store.gravar('arquivos', { ...atual, enviado: 1, url: r.url || '', driveId: r.driveId || '' });
      enviados++;
    }
    if (erro) throw erro;                                                     // quem chamou mostra o erro (depois de tentar os demais)
    return enviados;
  }
  async function enviarArquivos() {
    if (rodando || !ativado() || !navigator.onLine) return 0;
    rodando = true;
    try { return await enviarPendentesArquivos(await arquivosPendentes()); }
    finally { rodando = false; await atualizarContagem(); }
  }

  /** Consulta rápida: último nº usado e próximo, direto na planilha. */
  const proximoNumero = (barreira, ano) => chamar({ action: 'tfProximoNumero', barreira, ano }, 9000);
  /** Emissão: a planilha só grava o TF se o número ainda estiver livre. */
  const emitirTF = (tf, pessoa, placa) => chamar({ action: 'tfEmitir', tf: limpo(tf), pessoa: limpo(pessoa), placa: placa ? limpo(placa) : undefined }, 20000);
  /** Cadastro + histórico (reincidência) de um CPF/CNPJ e/ou placa, consultados no servidor. */
  const consultar = (doc, placa) => chamar({ action: 'tfConsultar', doc, placa });

  async function aplicar(store, linhas) {
    const novos = [];
    for (const row of linhas) {
      const local = await Store.obter(store, row.id);
      if (local && local.pendente && local.atualizadoEm > row.atualizadoEm) continue; // edição local mais nova
      novos.push({ ...row, pendente: 0 });
    }
    await Store.gravarVarios(store, novos);
  }

  async function marcarEnviados(store, enviados) {
    const ok = [];
    for (const e of enviados) {
      const atual = await Store.obter(store, e.id);
      if (atual && atual.atualizadoEm === e.atualizadoEm) ok.push({ ...atual, pendente: 0 });
    }
    await Store.gravarVarios(store, ok);
  }

  async function sincronizar() {
    const c = cfg();
    if (rodando || !c.url || !c.key) return;
    if (!navigator.onLine) { await atualizarContagem(); return; }
    rodando = true;
    emitir({ tipo: 'sync', msg: 'Sincronizando…' });
    try {
      for (let volta = 0; volta < 20; volta++) {
        const p = await pendentes();
        const env = {}; NOMES.forEach(n => { env[n] = p[n].slice(0, LIMITES[n]); });
        const since = (await Store.meta('lastSync')) || 0;
        const corpo = { action: 'sync', since }; NOMES.forEach(n => { corpo[CAMPOS[n]] = env[n].map(limpo); });
        const r = await chamar(corpo);
        for (const n of NOMES) await marcarEnviados(STORES[n], env[n]);
        await aplicar('turnos', r.turnos);
        await aplicar('veiculos', r.veiculos);
        await aplicar('tfs', r.tfs || []);
        await aplicar('levantamentos', r.levantamentos || []);
        await aplicar('colheitas', r.colheitas || []);
        if (r.barreiras) await Store.setMeta('barreiras', r.barreiras);
        await lembrarUltimos(r.ultimos);
        await lembrarUltimosPce(r.ultimosPce);
        await Store.setMeta('lastSync', r.agora);
        if (NOMES.every(n => p[n].length <= env[n].length)) break;
      }
      let erroArq = '';
      try { await enviarPendentesArquivos(await arquivosPendentes()); }      // falha numa foto não derruba o sync principal
      catch (e) { erroArq = e.message || String(e); }
      await Store.setMeta('ultimaSync', Date.now());
      localStorage.removeItem('gdv.revogado');
      const resta = await pendentes();
      emitir({ tipo: 'ok', msg: erroArq ? 'Sincronizado (fotos/assinaturas: ' + erroArq + ')' : 'Sincronizado', pend: resta.total, erroArquivos: erroArq });
      window.dispatchEvent(new Event('gdv-dados'));
    } catch (e) {
      const p = await pendentes();
      emitir({ tipo: 'erro', msg: e.message, pend: p.total });
      if (/revogado|inv[aá]lido/i.test(e.message) && !localStorage.getItem('gdv.revogado')) {   // pede novo código (uma vez)
        localStorage.setItem('gdv.revogado', '1'); window.dispatchEvent(new Event('gdv-dados'));
      }
    } finally {
      rodando = false;
    }
  }

  async function atualizarContagem() {
    const p = await pendentes();
    emitir({ tipo: navigator.onLine ? 'idle' : 'offline', pend: p.total, msg: '' });
  }

  async function testar() { return chamar({ action: 'ping' }); }

  function iniciar() {
    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', atualizarContagem);
    setInterval(sincronizar, 60000);                       // automático, a cada minuto
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    sincronizar();
  }

  return { iniciar, sincronizar, testar, atualizarContagem, ativado, nome, ativar, desativar, consultar, proximoNumero, emitirTF, lembrarUltimos,
    pceProximoNumero, pceEmitir, pceConsultar, lembrarUltimosPce, enviarArquivos, arquivosPendentes, unidadePce, onEstado: f => listeners.push(f), estado: () => estado, cfg };
})();
