// Sincroniza o app e espera a rodada terminar, sem pausa fixa. Se já há uma sincronização em curso, espera ela acabar
// (até 6 s, em passos de 150 ms) e então sincroniza de novo. Devolve o estado final (Sync.estado()).
// Usado pelos testes que precisam que os dados do aparelho estejam na planilha antes de seguir.
module.exports = function sincronizar(p) {
  return p.evaluate(async () => {
    for (let i = 0; i < 40 && Sync.estado().tipo === 'sync'; i++) await new Promise(r => setTimeout(r, 150));
    await Sync.sincronizar(); return Sync.estado();
  });
};
