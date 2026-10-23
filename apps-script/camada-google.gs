/* ---------- Acesso ao Google (camada portátil) ----------
 * Única seção (com "Planilha" abaixo) que fala com os serviços do Google; nomes iguais aos do porte (docs/PORTABILIDADE.md).
 * Código novo usa só estas funções. O código antigo ainda chama LockService/getRange direto e vai sendo migrado seção por seção. */

/** Roda fn() com o lock do script (gravações concorrentes) e devolve o resultado. Valide tudo antes da primeira gravação. */
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Linhas da aba como objetos (paraObjeto_), cada uma com _linha = número da linha na planilha (só vale dentro do mesmo lock). */
function lerLinhas_(nome) {
  const t = lerTudo_(nome);
  return t.valores.map(function (l, i) { const o = paraObjeto_(t.cols, l); o._linha = i + 2; return o; });
}

/** Grava só as colunas informadas (por nome) na linha `linha` da aba. Coluna que não existe em TABELAS é recusada. */
function atualizar_(nome, linha, campos) {
  const sh = aba_(nome), cols = TABELAS[nome];
  Object.keys(campos).forEach(function (c) {
    const i = cols.indexOf(c);
    if (i < 0) throw new Error('Coluna desconhecida em ' + nome + ': ' + c);
    const v = campos[c];
    sh.getRange(linha, i + 1).setValue(v === null || v === undefined ? '' : v);
  });
}

/** Acrescenta objetos no fim da aba (colunas por nome; coluna ausente fica vazia). Uma escrita só. */
function inserir_(nome, objs) {
  if (!objs || !objs.length) return;
  const sh = aba_(nome), cols = TABELAS[nome];
  const linhas = objs.map(function (o) { return cols.map(function (c) { const v = o[c]; return v === null || v === undefined ? '' : v; }); });
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cols.length).setValues(linhas);
}

/** Grava o mesmo valor na coluna `coluna` (por nome) das linhas informadas: lê a coluna e grava de volta numa escrita só. */
function atualizarColuna_(nome, coluna, linhas, valor) {
  if (!linhas || !linhas.length) return;
  const sh = aba_(nome), j = TABELAS[nome].indexOf(coluna);
  if (j < 0) throw new Error('Coluna desconhecida em ' + nome + ': ' + coluna);
  const de = Math.min.apply(null, linhas), ate = Math.max.apply(null, linhas), r = sh.getRange(de, j + 1, ate - de + 1, 1), v = r.getValues();
  linhas.forEach(function (l) { v[l - de][0] = valor; });
  r.setValues(v);
}

/** UUID aleatório (texto de 36 caracteres). */
function uuid_() { return Utilities.getUuid(); }

/** Propriedades do script (configuração que não vai no código). prop_ devolve '' se não existir. */
function prop_(nome) { return PropertiesService.getScriptProperties().getProperty(nome) || ''; }
function setProp_(nome, valor) { PropertiesService.getScriptProperties().setProperty(nome, String(valor)); }
function delProp_(nome) { PropertiesService.getScriptProperties().deleteProperty(nome); }

/** Cache de curta duração (contadores de tentativas e afins). cacheLer_ devolve o texto guardado ou null; seg = validade em segundos. */
function cacheLer_(chave) { return CacheService.getScriptCache().get(chave); }
function cacheGravar_(chave, valor, seg) { CacheService.getScriptCache().put(chave, String(valor), seg); }
function cacheApagar_(chave) { CacheService.getScriptCache().remove(chave); }
