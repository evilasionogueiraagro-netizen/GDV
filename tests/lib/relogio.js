// Relógio deslocado para testes que dependem da data (ex.: rotinas_test, relatório mensal).
// GDV_DESLOC_MS = milissegundos somados ao relógio real. O run.js calcula o valor a partir do
// comentário "// gdv:relogio dia=15 hora=10:00" no topo do teste e passa a MESMA variável ao
// fakegas e ao teste; lib/amb.js aplica o mesmo deslocamento no navegador. O tempo continua
// correndo normalmente (só o ponto de partida muda).
const DESLOC = Number(process.env.GDV_DESLOC_MS) || 0;

// Mesmo código serve para Node e para o navegador (via addInitScript).
function instalar(g, desl) {
  if (!desl || g.Date.__gdvDesloc) return;
  const D = g.Date;
  function FD(...a) {
    if (!new.target) return new D(D.now() + desl).toString();
    return a.length ? new D(...a) : new D(D.now() + desl);
  }
  FD.prototype = D.prototype;
  FD.now = () => D.now() + desl;
  FD.parse = D.parse; FD.UTC = D.UTC;
  FD.__gdvDesloc = desl;
  g.Date = FD;
}
instalar(globalThis, DESLOC);

// Deslocamento para que "agora" caia no dia `dia` do mês corrente (Manaus, UTC−4) às `hora` ("HH:MM").
function deslocPara(dia, hora) {
  const agora = Date.now(), m = new Date(agora - 4 * 3600e3);
  const [h, mi] = (hora || '10:00').split(':').map(Number);
  const alvo = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), dia, h + 4, mi);
  return alvo - agora;
}

module.exports = { DESLOC, instalar, deslocPara };
