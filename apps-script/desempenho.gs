/* ---------- Medição de desempenho do servidor (aba Desempenho) ----------
 * Cada chamada ao doPost mede: tempo total, espera na fila do lock, tempo com o lock, tempo lendo abas e quantas linhas leu.
 * As amostras ficam no cache (sem gravar na planilha a cada chamada); a cada DES_LOTE amostras ou DES_JANELA_MS, a chamada que
 * fechar o lote grava um resumo por hora (Manaus) e ação na aba Desempenho: média, mediana (p50), p90, máximo, erros.
 * Amostras de chamadas simultâneas podem se perder (o cache não tem soma atômica): é medição, não contabilidade.
 * Desligar sem publicar código: propriedade do script DESEMPENHO_DESLIGADO = 1. Nunca derruba a resposta. */

const DES_LOTE = 150;                      // amostras por gravação
const DES_JANELA_MS = 15 * 60 * 1000;      // ou a cada 15 min, o que vier primeiro
const DES_MAX = 1200;                      // teto de amostras no cache (o valor do CacheService vai até 100 KB)
const DES_CHAVE = 'des_amostras';
let MED_ = null;                           // medição da requisição atual (zerada no início do doPost)

function medirInicio_() {
  MED_ = { t0: Date.now(), acao: '', erro: 0, lockEspera: 0, lockUso: 0, lockDesde: 0, leitura: 0, leituras: 0, linhas: 0 };
}
function medirAcao_(acao) { if (MED_) MED_.acao = String(acao || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'invalida'; }
function medirErro_() { if (MED_) MED_.erro = 1; }
/** Leitura de aba (lerTudo_/lerLeitura_): ms gastos e linhas lidas. */
function medirLeitura_(ms, linhas) { if (MED_) { MED_.leitura += ms; MED_.leituras++; MED_.linhas += linhas || 0; } }

/** Lock do script com a espera e o uso medidos (mesmos métodos do LockService). Todo código pega o lock por aqui. */
function lockMedido_() {
  const lock = LockService.getScriptLock();
  return {
    waitLock: function (ms) {
      const t = Date.now();
      try { lock.waitLock(ms); } finally { if (MED_) MED_.lockEspera += Date.now() - t; }   // o tempo do timeout também conta
      if (MED_) MED_.lockDesde = Date.now();
    },
    tryLock: function (ms) {
      const t = Date.now(), ok = lock.tryLock(ms);
      if (MED_) { MED_.lockEspera += Date.now() - t; if (ok) MED_.lockDesde = Date.now(); }
      return ok;
    },
    releaseLock: function () {
      lock.releaseLock();
      if (MED_ && MED_.lockDesde) { MED_.lockUso += Date.now() - MED_.lockDesde; MED_.lockDesde = 0; }
    }
  };
}

/** Fim da requisição: guarda a amostra no cache e, se o lote fechou, grava o resumo na aba Desempenho. */
function medirFim_() {
  const m = MED_; MED_ = null;
  if (!m || !m.acao) return;
  try {
    if (prop_('DESEMPENHO_DESLIGADO') === '1') return;
    const agora = Date.now();
    let lista = lerJSONSeguro_(cacheLer_(DES_CHAVE), []);
    if (!Array.isArray(lista)) lista = [];
    lista.push([agora, m.acao, agora - m.t0, m.lockEspera, m.lockUso, m.leitura, m.leituras, m.linhas, m.erro]);
    if (lista.length > DES_MAX) lista = lista.slice(-DES_MAX);
    if (lista.length >= DES_LOTE || agora - lista[0][0] >= DES_JANELA_MS) {
      cacheApagar_(DES_CHAVE);                             // as próximas chamadas começam outro lote
      gravarDesempenho_(lista, agora);
    } else cacheGravar_(DES_CHAVE, JSON.stringify(lista), 6 * 3600);
  } catch (e) { /* medição nunca atrapalha a resposta */ }
}

/** Resume as amostras por hora (Manaus) e ação e grava uma linha por grupo na aba Desempenho. Devolve as linhas gravadas. */
function gravarDesempenho_(lista, agora) {
  const hora = function (ms) { return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 13).replace('T', ' ') + 'h'; };
  const media = function (xs) { return xs.length ? Math.round(xs.reduce(function (s, x) { return s + x; }, 0) / xs.length) : 0; };
  const pct = function (xs, p) { const o = xs.slice().sort(function (a, b) { return a - b; }); return o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))] : 0; };
  const grupos = {};
  lista.forEach(function (a) { const k = hora(a[0]) + '|' + a[1]; (grupos[k] = grupos[k] || []).push(a); });
  const linhas = Object.keys(grupos).sort().map(function (k) {
    const g = grupos[k], col = function (i) { return g.map(function (a) { return Number(a[i]) || 0; }); };
    const tot = col(2), esp = col(3);
    return { id: uuid_(), hora: k.split('|')[0], acao: k.split('|')[1], n: g.length, mediaMs: media(tot), p50Ms: pct(tot, 0.5), p90Ms: pct(tot, 0.9),
      maxMs: Math.max.apply(null, tot), lockEsperaMedioMs: media(esp), lockEsperaMaxMs: Math.max.apply(null, esp), lockUsoMedioMs: media(col(4)),
      leituraMedioMs: media(col(5)), leiturasMedia: Math.round(media(col(6).map(function (x) { return x * 10; }))) / 10, linhasLidasMedia: media(col(7)),
      erros: col(8).reduce(function (s, x) { return s + x; }, 0), gravadoEm: agora, versao: VERSAO_CODIGO };
  });
  // gravação dentro do lock, mas sem segurar a resposta: lock ocupado → as amostras voltam ao cache e vão no próximo lote
  const lock = lockMedido_();
  if (!lock.tryLock(0)) { cacheGravar_(DES_CHAVE, JSON.stringify(lista.slice(-DES_MAX)), 6 * 3600); return []; }
  try { inserir_('Desempenho', linhas); } finally { lock.releaseLock(); }
  return linhas;
}
