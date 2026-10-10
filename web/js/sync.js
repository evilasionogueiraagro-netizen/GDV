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

  async function chamar(corpo) {
    const c = cfg();
    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita preflight CORS
      body: JSON.stringify({ ...corpo, key: c.key }),
      redirect: 'follow'
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || 'Erro no servidor');
    return j;
  }

  const limpo = ({ pendente, ...r }) => r;

  async function pendentes() {
    const [t, v] = await Promise.all([Store.todos('turnos'), Store.todos('veiculos')]);
    return { t: t.filter(x => x.pendente), v: v.filter(x => x.pendente) };
  }

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
        const t = p.t.slice(0, 500), v = p.v.slice(0, 1000);
        const since = (await Store.meta('lastSync')) || 0;
        const r = await chamar({ action: 'sync', since, turnos: t.map(limpo), veiculos: v.map(limpo) });
        await marcarEnviados('turnos', t);
        await marcarEnviados('veiculos', v);
        await aplicar('turnos', r.turnos);
        await aplicar('veiculos', r.veiculos);
        await Store.setMeta('lastSync', r.agora);
        if (p.t.length <= t.length && p.v.length <= v.length) break;
      }
      await Store.setMeta('ultimaSync', Date.now());
      localStorage.removeItem('gdv.revogado');
      emitir({ tipo: 'ok', msg: 'Sincronizado', pend: 0 });
      window.dispatchEvent(new Event('gdv-dados'));
    } catch (e) {
      const p = await pendentes();
      emitir({ tipo: 'erro', msg: e.message, pend: p.t.length + p.v.length });
      if (/revogado|inv[aá]lido/i.test(e.message) && !localStorage.getItem('gdv.revogado')) {   // pede novo código (uma vez)
        localStorage.setItem('gdv.revogado', '1'); window.dispatchEvent(new Event('gdv-dados'));
      }
    } finally {
      rodando = false;
    }
  }

  async function atualizarContagem() {
    const p = await pendentes();
    emitir({ tipo: navigator.onLine ? 'idle' : 'offline', pend: p.t.length + p.v.length, msg: '' });
  }

  async function testar() { return chamar({ action: 'ping' }); }

  function iniciar() {
    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', atualizarContagem);
    setInterval(sincronizar, 60000);                       // automático, a cada minuto
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    sincronizar();
  }

  return { iniciar, sincronizar, testar, atualizarContagem, ativado, nome, ativar, desativar, onEstado: f => listeners.push(f), estado: () => estado, cfg };
})();
