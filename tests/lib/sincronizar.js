// Sincroniza o app e espera a rodada terminar, sem pausa fixa. Se já há uma sincronização em curso, espera ela acabar
// (em passos de 25 ms) e então sincroniza de novo. Com { stores } ou { ateZero: true }, garante pendentes zerados.
// Devolve o estado final (Sync.estado()).
module.exports = function sincronizar(p, opts = {}) {
  return p.evaluate(async o => {
    const temPend = async () => {
      if (!o || (!o.ateZero && !o.stores && !o.arquivos)) return false;
      const lista = o.stores || ['turnos', 'veiculos', 'tfs', 'pessoas', 'placas', 'levantamentos', 'colheitas', 'propriedades', 'cadastrosPce', 'termosPce', 'termosEducacao'];
      let t = 0;
      for (const s of lista) if (typeof Store !== 'undefined') t += (await Store.todos(s)).filter(x => x.pendente).length;
      if (o.arquivos !== false && typeof Sync !== 'undefined' && Sync.arquivosPendentes) t += (await Sync.arquivosPendentes()).length;
      return t > 0;
    };
    for (let i = 0; i < 240 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 25));
    await Sync.sincronizar();
    for (let i = 0; i < 15 && (await temPend()); i++) {
      await new Promise(r => setTimeout(r, 25));
      await Sync.sincronizar();
    }
    return Sync.estado();
  }, opts);
};
