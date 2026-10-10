// Banco local (IndexedDB). Tudo funciona sem internet; `pendente: 1` marca o que ainda não foi enviado.
const Store = (() => {
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((ok, no) => {
      const rq = indexedDB.open('gdv', 2);                      // v2: tfs, pessoas, placas (os dados antigos são mantidos)
      rq.onupgradeneeded = () => {
        const d = rq.result;
        ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => no(rq.error);
    });
    return dbp;
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
  async function meta(k) { const r = await obter('meta', k); return r ? r.v : undefined; }
  async function setMeta(k, v) { return gravar('meta', { k, v }); }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

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

  return { todos, obter, gravar, gravarVarios, apagar, meta, setMeta, salvar };
})();
