// Banco local (IndexedDB). Tudo funciona sem internet; `pendente: 1` marca o que ainda não foi enviado.
const Store = (() => {
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((ok, no) => {
      // v2: tfs, pessoas, placas · v3: módulo PCE (levantamentos, colheitas, propriedades, arquivos). Os dados antigos são mantidos.
      const rq = indexedDB.open('gdv', 3);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades']
          .forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
        // fotos/assinaturas: o índice "enviado" permite contar os pendentes sem carregar as imagens
        if (!d.objectStoreNames.contains('arquivos')) d.createObjectStore('arquivos', { keyPath: 'id' }).createIndex('enviado', 'enviado');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      // outra janela/aba do app ainda aberta com a versão antiga do banco: a atualização espera ela fechar
      rq.onblocked = () => aviso('Feche as outras janelas ou abas do GDV para concluir a atualização.');
      rq.onsuccess = () => {
        const d = rq.result;
        aviso('');
        // uma versão mais nova do app (em outra janela) precisa atualizar o banco: libera a conexão em vez de travá-la
        d.onversionchange = () => { d.close(); dbp = null; aviso('O GDV foi atualizado em outra janela. Recarregue esta página.'); };
        ok(d);
      };
      rq.onerror = () => no(rq.error);
    });
    return dbp;
  }
  /** Faixa fixa no topo (sem depender do app.js): avisos do banco local. Texto vazio remove. */
  function aviso(msg) {
    try {
      let el = document.getElementById('gdv-aviso-db');
      if (!msg) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div'); el.id = 'gdv-aviso-db'; el.setAttribute('role', 'alert');
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px 16px;background:#b45309;color:#fff;font:600 15px system-ui,sans-serif;text-align:center';
        document.body.append(el);
      }
      el.textContent = msg;
    } catch (e) { /* sem documento (ex.: worker) */ }
  }
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

  async function todos(store) { const d = await db(); return req(d.transaction(store).objectStore(store).getAll()); }
  async function obter(store, id) { const d = await db(); return req(d.transaction(store).objectStore(store).get(id)); }
  async function gravar(store, rec) { const d = await db(); return req(d.transaction(store, 'readwrite').objectStore(store).put(rec)); }
  async function gravarVarios(store, recs) {
    if (!recs.length) return;
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction(store, 'readwrite'), s = t.objectStore(store);
      recs.forEach(r => s.put(r));
      t.oncomplete = ok; t.onerror = t.onabort = () => no(t.error);
    });
  }
  async function apagar(store, ids) {
    if (!ids.length) return;
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction(store, 'readwrite'), o = t.objectStore(store);
      ids.forEach(id => o.delete(id));
      t.oncomplete = ok; t.onerror = t.onabort = () => no(t.error);
    });
  }
  /** Só as chaves (ids) dos registros com índice = valor, sem carregar os registros (ex.: arquivos ainda não enviados). */
  async function chaves(store, indice, valor) {
    const d = await db();
    return req(d.transaction(store).objectStore(store).index(indice).getAllKeys(IDBKeyRange.only(valor)));
  }
  async function meta(k) { const r = await obter('meta', k); return r ? r.v : undefined; }
  async function setMeta(k, v) { return gravar('meta', { k, v }); }

  // sempre UUID v4 (o servidor exige esse formato nos arquivos); navegadores sem randomUUID (Chrome < 92, iOS < 15.4) usam getRandomValues
  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  /** Salva um registro marcando-o como pendente de envio. */
  async function salvar(store, rec) {
    const agora = Date.now();
    rec.id = rec.id || uuid();
    rec.criadoEm = rec.criadoEm || agora;
    rec.atualizadoEm = agora;
    rec.pendente = 1;
    await gravar(store, rec);
    return rec;
  }

  return { todos, obter, gravar, gravarVarios, apagar, chaves, meta, setMeta, salvar, novoId: uuid };
})();
