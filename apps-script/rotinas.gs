/* ---------- Rotinas automáticas (gatilhos de tempo): turno esquecido, backup diário e relatório mensal ---------- */
// Ativadas uma vez pelo dono da planilha: menu e-GDV → Ativar rotinas automáticas (pede autorização para gatilhos, Drive e e-mail).
//   encerrarTurnosAutomatico  a cada 30 min   turno aberto há mais de 12 h é encerrado (encerradoPor = "Automático (12 h)")
//   backupDiario              todo dia ~03h   cópia da planilha em "GDV - Backups" (mantém as 30 mais recentes)
//   relatorioMensal           dia 1 ~07h      e-mail com os números do mês anterior (destinatários em RELATORIO_EMAILS)
//   arquivarAnosAntigos       todo dia ~04h   só age se houver linhas de anos anteriores ao ano passado (ver "Arquivamento anual")
// "Desativar rotinas automáticas" apaga os gatilhos e grava ROTINAS_DESATIVADAS = 1 (o painel também deixa de encerrar turnos).

const TURNO_MAX_MS = 12 * 3600 * 1000;             // plantão dura no máximo 12 h: aberto além disso = turno esquecido
const ENCERRADO_AUTO = 'Automático (12 h)';         // encerradoPor do encerramento automático (painel e app reconhecem o início "Automático")
const AUTO_INTERVALO_S = 600;                        // dentro do painelDados: no máximo 1 vez a cada 10 min
const BACKUP_PASTA = 'GDV - Backups', BACKUP_PREFIXO = 'GDV backup ', BACKUP_MANTER = 30;
const ROTINAS_ = [
  { fn: 'encerrarTurnosAutomatico', nome: 'Encerrar turnos esquecidos (a cada 30 min)',
    criar: function (b) { return b.timeBased().everyMinutes(30); } },
  { fn: 'backupDiario', nome: 'Backup diário (por volta das 03h)',
    criar: function (b) { return b.timeBased().everyDays(1).atHour(3).inTimezone('America/Manaus'); } },
  { fn: 'relatorioMensal', nome: 'Relatório mensal por e-mail (dia 1, por volta das 07h)',
    criar: function (b) { return b.timeBased().onMonthDay(1).atHour(7).inTimezone('America/Manaus'); } },
  { fn: 'arquivarAnosAntigos', nome: 'Arquivamento anual (verificação diária leve, por volta das 04h)',
    criar: function (b) { return b.timeBased().everyDays(1).atHour(4).inTimezone('America/Manaus'); } }
];

/** "HH:MM" no horário de Manaus (UTC−4, como tsManaus_). */
function hmManaus_(ms) { return new Date(ms - 4 * 3600 * 1000).toISOString().slice(11, 16); }
function rotinasDesativadas_() { return PropertiesService.getScriptProperties().getProperty('ROTINAS_DESATIVADAS') === '1'; }

/**
 * Encerra os turnos abertos (encerrado ≠ 1) cujo início (data + inicio, Manaus) foi há mais de 12 h. fim = o que o celular informou
 * (turno encerrado no aparelho que não chegou: aba Aparelhos → fimPendentes) ou o último registro do turno (maior entre o último
 * veículo, o último sinal do aparelho com o turno aberto e o início), nunca depois de início + 12 h. Grava encerradoPor = "Automático (12 h)",
 * encerradoEm e atualizadoEm/srv_ts = agora: o aparelho recebe o encerramento no próximo sync e não reabre o turno (ver gravar_).
 * Idempotente. Sem turno vencido, só lê a aba Turnos (sem lock).
 */
function encerrarTurnosAutomatico() {
  if (rotinasDesativadas_()) return { ok: true, encerrados: [], desativado: true };
  const agora = Date.now();
  const vencido = function (o) { const ini = tsManaus_(o.data, o.inicio); return !!o.id && o.encerrado !== 1 && ini !== null && agora - ini > TURNO_MAX_MS; };
  if (!lerLeitura_('Turnos').some(vencido)) return { ok: true, encerrados: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Turnos'), cols = t.cols, alvo = {};
    t.valores.forEach(function (l, i) { const o = paraObjeto_(cols, l); if (vencido(o)) alvo[o.id] = { i: i, o: o, ini: tsManaus_(o.data, o.inicio), ult: 0 }; });
    if (!Object.keys(alvo).length) return { ok: true, encerrados: [] };
    lerLeitura_('Veiculos').forEach(function (v) {
      const a = alvo[v.turnoId];
      if (!a || v.excluido === 1) return;
      let ms = tsManaus_(a.o.data, v.hora);
      if (ms !== null && ms < a.ini) ms += 864e5;                                     // veículo depois da meia-noite
      if (ms !== null && ms > a.ult) a.ult = ms;
    });
    let aparelhos = [];
    try { aparelhos = lerAparelhos_(); } catch (e) { /* sem aba Aparelhos: usa só os veículos */ }
    const feitos = [];
    Object.keys(alvo).forEach(function (id) {
      const a = alvo[id], o = a.o;
      const aps = aparelhos.filter(function (ap) { return !ap.legado && ap.usuario === o.usuario; });
      const cel = aps.filter(function (ap) { return ap.turnosEncerradosPendentes.indexOf(id) >= 0 && RE_HM_.test(String(ap.fimPendentes[id] || '')); })
        .sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
      let fim;
      if (cel) fim = String(cel.fimPendentes[id]);                                    // o fiscal encerrou no celular: vale o horário dele
      else {
        let ms = Math.max(a.ini, a.ult);
        aps.forEach(function (ap) { if (ap.turnoAtual === id && ap.ultimoSinal > ms) ms = ap.ultimoSinal; });
        fim = hmManaus_(Math.min(ms, a.ini + TURNO_MAX_MS));
      }
      const novo = { encerrado: 1, fim: fim, atualizadoEm: agora, srv_ts: agora, encerradoPor: ENCERRADO_AUTO, encerradoEm: agora };
      t.sh.getRange(a.i + 2, 1, 1, cols.length).setValues([cols.map(function (c, i) { return c in novo ? novo[c] : t.valores[a.i][i]; })]);
      feitos.push({ id: id, fim: fim, doCelular: !!cel });
    });
    return { ok: true, encerrados: feitos };
  } finally {
    lock.releaseLock();
  }
}

/** Chamado pelo painelDados: roda o encerramento automático no máximo 1 vez a cada 10 min (CacheService). Nunca derruba o painel. */
function encerrarTurnosAutomaticoBarato_() {
  try {
    const c = CacheService.getScriptCache();
    if (c.get('auto_encerrar')) return;
    c.put('auto_encerrar', '1', AUTO_INTERVALO_S);
    encerrarTurnosAutomatico();
  } catch (e) { /* trava ocupada ou aba com problema: tenta de novo na próxima vez */ }
}

/** Situação das rotinas para o painel (rodapé): último backup e última falha de backup (se mais recente). */
function situacaoRotinas_() {
  const props = PropertiesService.getScriptProperties();
  const b = lerJSONSeguro_(props.getProperty('ULTIMO_BACKUP'), null), e = lerJSONSeguro_(props.getProperty('ULTIMO_BACKUP_ERRO'), null);
  const em = b && Number(b.em) || null;
  const a = lerJSONSeguro_(props.getProperty('ULTIMO_ARQUIVAMENTO'), null);
  return { ultimoBackup: em, backupFalhou: e && Number(e.em) > (em || 0) ? Number(e.em) : null, desativadas: rotinasDesativadas_(),
           ultimoArquivamento: a && Number(a.em) || null };
}

/** Cria os gatilhos que faltam (não duplica; repetidos de uma mesma rotina são apagados). Devolve os nomes das rotinas ativas. */
function ativarRotinasAutomaticas_() {
  const vistos = {};
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const fn = tr.getHandlerFunction();
    if (!ROTINAS_.some(function (r) { return r.fn === fn; })) return;
    if (vistos[fn]) ScriptApp.deleteTrigger(tr); else vistos[fn] = true;
  });
  const criadas = [];
  ROTINAS_.forEach(function (r) { if (!vistos[r.fn]) { r.criar(ScriptApp.newTrigger(r.fn)).create(); criadas.push(r.fn); } });
  PropertiesService.getScriptProperties().deleteProperty('ROTINAS_DESATIVADAS');
  return { criadas: criadas, ativas: ROTINAS_.map(function (r) { return r.nome; }) };
}

/** Apaga os gatilhos das rotinas e desliga o encerramento automático feito pelo painel. Devolve quantos gatilhos foram apagados. */
function desativarRotinasAutomaticas_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const fn = tr.getHandlerFunction();
    if (ROTINAS_.some(function (r) { return r.fn === fn; })) { ScriptApp.deleteTrigger(tr); n++; }
  });
  PropertiesService.getScriptProperties().setProperty('ROTINAS_DESATIVADAS', '1');
  return n;
}

/* --- backup diário --- */

/** Pasta "GDV - Backups" no Drive do dono (id em PASTA_BACKUPS; recriada se sumir). */
function pastaBackups_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_BACKUPS');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder(BACKUP_PASTA);
  props.setProperty('PASTA_BACKUPS', nova.getId());
  return nova;
}

/**
 * Copia a planilha inteira para "GDV - Backups/GDV backup AAAA-MM-DD" (dia de Manaus) e manda para a lixeira as cópias antigas dessa pasta:
 * fica uma por dia (a mais nova) e só as 30 mais recentes. Grava ULTIMO_BACKUP {em, nome, id}. Nunca lança erro (falha vai para
 * ULTIMO_BACKUP_ERRO e para o retorno).
 */
function backupDiario() {
  const props = PropertiesService.getScriptProperties();
  try {
    const nome = BACKUP_PREFIXO + hojeManaus_(), pasta = pastaBackups_();
    const copia = DriveApp.getFileById(planilha_().getId()).makeCopy(nome, pasta);
    let apagados = 0;
    try { apagados = limparBackups_(pasta, copia.getId()); } catch (e) { /* limpeza fica para o próximo backup */ }
    const info = { em: Date.now(), nome: nome, id: copia.getId() };
    props.setProperty('ULTIMO_BACKUP', JSON.stringify(info));
    return { ok: true, em: info.em, nome: nome, id: info.id, apagados: apagados };
  } catch (e) {
    const erro = String((e && e.message) || e).slice(0, 300);
    try { props.setProperty('ULTIMO_BACKUP_ERRO', JSON.stringify({ em: Date.now(), erro: erro })); } catch (e2) { /* nada a fazer */ }
    return { ok: false, erro: erro };
  }
}

/** Mantém em "GDV - Backups" uma cópia por dia (a mais nova) e só as BACKUP_MANTER mais recentes. Devolve quantas foram para a lixeira. */
function limparBackups_(pasta, manterId) {
  const lst = [], it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed() && String(f.getName()).indexOf(BACKUP_PREFIXO) === 0) lst.push(f);
  }
  const criado = function (f) { try { return Number(f.getDateCreated()) || 0; } catch (e) { return 0; } };
  lst.sort(function (a, b) { return String(b.getName()).localeCompare(String(a.getName())) || criado(b) - criado(a); });   // mais novo primeiro
  const dias = {};
  let mantidos = 0, n = 0;
  lst.forEach(function (f) {
    const nome = String(f.getName()), fica = f.getId() === manterId || (!dias[nome] && mantidos < BACKUP_MANTER);
    if (fica) { if (!dias[nome]) mantidos++; dias[nome] = true; return; }
    try { f.setTrashed(true); n++; } catch (e) { /* sem permissão: segue */ }
  });
  return n;
}

/* --- arquivamento anual --- */
// A planilha principal guarda só o ano atual e o anterior (pela data do registro, horário de Manaus). Linhas mais antigas das abas que
// crescem sem parar vão para uma planilha "e-GDV – Arquivo AAAA" (uma por ano) na pasta "GDV - Arquivo anual" do Drive do dono.
//   Veiculos   acompanham o turno (veículo de turno arquivado vai junto; sem turno na planilha: ano do criadoEm)
//   Turnos     só encerrados (turno aberto nunca sai), pelo campo data
//   Consultas  pelo campo em (sem id: a chave é a linha inteira)
//   Andamento  só os finalizados (estado "fim" ou sem batimento há mais de 10 min), pelo atualizadoTs
// Ficam sempre na principal: TFs, Pessoas, Placas, Levantamentos, Colheitas, Propriedades, Fiscais, Permissoes, Barreiras, Numeracao
// (reincidência, histórico de pragas, numeração e credenciais), Arquivos (links das fotos pelo id) e Aparelhos (uma linha por aparelho).
// Cada lote, sob o mesmo LockService do sync: copia → confere no arquivo (todas as chaves presentes) → apaga da principal com deleteRows em
// blocos contíguos, de baixo para cima. Interrompido em qualquer ponto, a próxima execução refaz o lote sem duplicar (chave = id).

const ARQ_PASTA = 'GDV - Arquivo anual', ARQ_PREFIXO = 'e-GDV – Arquivo ';
const ARQ_ABAS = ['Veiculos', 'Turnos', 'Consultas', 'Andamento'];   // Veiculos antes de Turnos: o ano do veículo vem do turno ainda na principal
const ARQ_LOTE = 5000;                                                 // linhas por lote (um lock por lote; os celulares sincronizam entre os lotes)
const ARQ_TEMPO_MS = 4 * 60 * 1000;                                    // passou disso: guarda o progresso e continua na próxima execução (limite: 6 min)

/** Ano (Manaus) de um instante em ms; 0 se vazio. */
function anoMs_(ms) { ms = Number(ms) || 0; return ms > 0 ? new Date(ms - 4 * 3600 * 1000).getUTCFullYear() : 0; }
/** Ano de um dia "aaaa-mm-dd"; 0 se inválido. */
function anoDia_(d) { const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(d || '')); return m ? Number(m[1]) : 0; }
function anoAtualManaus_() { return Number(hojeManaus_().slice(0, 4)); }

/** Chave de idempotência da linha: o id (1ª coluna); Consultas não têm id → a linha inteira. */
function chaveArq_(nome, linha) {
  return nome === 'Consultas' ? linha.slice(0, TABELAS.Consultas.length).map(function (v) { return String(v === null || v === undefined ? '' : v); }).join('|')
    : String(linha[0] === null || linha[0] === undefined ? '' : linha[0]);
}

/**
 * Ano em que a linha deve ser arquivada, ou 0 (fica na principal). ctx: {limite, agora, turnos: {id: ano de arquivamento ou 0}}.
 * Só arquiva ano < limite (limite = ano anterior ao atual).
 */
function anoArquivo_(nome, o, ctx) {
  let ano = 0;
  if (nome === 'Turnos') ano = o.encerrado === 1 ? anoDia_(o.data) : 0;
  else if (nome === 'Veiculos') {
    if (Object.prototype.hasOwnProperty.call(ctx.turnos, o.turnoId)) return ctx.turnos[o.turnoId];   // acompanha o turno
    ano = anoMs_(o.criadoEm) || anoMs_(o.srv_ts);                                                     // turno fora da principal
  } else if (nome === 'Consultas') ano = anoMs_(o.em);
  else if (nome === 'Andamento') {
    if (o.estado === 'preenchendo' && ctx.agora - o.atualizadoTs <= ANDAMENTO_VALIDADE_MS) return 0;
    ano = anoMs_(o.atualizadoTs) || anoMs_(o.inicioTs);
  }
  return ano && ano < ctx.limite ? ano : 0;
}

/** Pasta "GDV - Arquivo anual" no Drive do dono (id em PASTA_ARQUIVO_ANUAL; recriada se sumir). */
function pastaArquivoAnual_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_ARQUIVO_ANUAL');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder(ARQ_PASTA);
  props.setProperty('PASTA_ARQUIVO_ANUAL', nova.getId());
  return nova;
}

/** {id, url} da planilha de arquivo do ano guardados em ARQUIVO_ANUAL_AAAA (sem abrir nada); null se não houver. */
function infoArquivoAnual_(ano) {
  const i = lerJSONSeguro_(PropertiesService.getScriptProperties().getProperty('ARQUIVO_ANUAL_' + ano), null);
  return i && i.id ? i : null;
}

/** Planilha "e-GDV – Arquivo AAAA" (abre a guardada; senão procura na pasta; senão cria e move para a pasta). */
function planilhaArquivoAnual_(ano) {
  const props = PropertiesService.getScriptProperties(), info = infoArquivoAnual_(ano), nome = ARQ_PREFIXO + ano;
  if (info) {
    try { if (!DriveApp.getFileById(info.id).isTrashed()) return SpreadsheetApp.openById(info.id); } catch (e) { /* apagada: procura/cria */ }
  }
  const pasta = pastaArquivoAnual_(), it = pasta.getFilesByName(nome);
  let ss = null;
  while (!ss && it.hasNext()) { const f = it.next(); if (!f.isTrashed()) ss = SpreadsheetApp.openById(f.getId()); }
  if (!ss) {
    ss = SpreadsheetApp.create(nome);
    DriveApp.getFileById(ss.getId()).moveTo(pasta);
  }
  props.setProperty('ARQUIVO_ANUAL_' + ano, JSON.stringify({ id: ss.getId(), url: ss.getUrl() }));
  return ss;
}

/** Chaves já gravadas numa aba do arquivo → número da linha (lê só a coluna do id; Consultas: as 5 colunas). */
function chavesArquivo_(sh, nome) {
  const n = sh.getLastRow() - 1, m = {};
  if (n < 1) return m;
  const larg = nome === 'Consultas' ? TABELAS.Consultas.length : 1;
  sh.getRange(2, 1, n, larg).getValues().forEach(function (l, i) { const k = chaveArq_(nome, l); if (k) m[k] = i + 2; });
  return m;
}

/**
 * Um lote de uma aba, sob lock: escolhe até "max" linhas antigas, grava cada uma no arquivo do seu ano (id que já está lá: atualiza a linha
 * se mudou, nunca duplica), confere que todas as chaves estão no arquivo e só então apaga da principal (blocos contíguos, de baixo para cima).
 * Devolve {movidas, porAno: {ano: n}, restam}.
 */
function arquivarLote_(nome, limite, agora, max) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = planilha_().getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return { movidas: 0, porAno: {}, restam: false };
    const t = lerTudo_(nome), cols = t.cols, ctx = { limite: limite, agora: agora, turnos: {} };
    if (nome === 'Veiculos') lerLeitura_('Turnos').forEach(function (o) { if (o.id) ctx.turnos[o.id] = anoArquivo_('Turnos', o, ctx); });
    const sel = [];
    t.valores.forEach(function (l, i) {
      const k = chaveArq_(nome, l);
      if (!k || k === '||||') return;                                             // linha vazia
      const ano = anoArquivo_(nome, paraObjeto_(cols, l), ctx);
      if (ano) sel.push({ i: i, ano: ano, k: k, l: l });
    });
    const lote = sel.slice(0, max);
    if (!lote.length) return { movidas: 0, porAno: {}, restam: false };
    const porAno = {};
    lote.forEach(function (x) { (porAno[x.ano] = porAno[x.ano] || []).push(x); });
    Object.keys(porAno).forEach(function (ano) {
      const shA = abaDe_(planilhaArquivoAnual_(ano), nome), ja = chavesArquivo_(shA, nome), novas = [], vistas = {};
      porAno[ano].forEach(function (x) {
        const linha = cols.map(function (c, j) { return x.l[j] === undefined || x.l[j] === null ? '' : x.l[j]; });
        if (ja[x.k]) {                                                            // já arquivada (execução interrompida ou reenvio do aparelho)
          const atual = shA.getRange(ja[x.k], 1, 1, cols.length).getValues()[0];
          if (linha.some(function (v, j) { return String(v) !== String(atual[j] === undefined || atual[j] === null ? '' : atual[j]); })) {
            shA.getRange(ja[x.k], 1, 1, cols.length).setValues([linha]);
          }
        } else if (vistas[x.k] === undefined) { vistas[x.k] = novas.length; novas.push(linha); }
        else novas[vistas[x.k]] = linha;                                          // id repetido na principal: fica a última
      });
      if (novas.length) shA.getRange(shA.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
      SpreadsheetApp.flush();
      const conferidas = chavesArquivo_(shA, nome), faltam = porAno[ano].filter(function (x) { return !conferidas[x.k]; }).length;
      if (faltam) throw new Error('Conferência do arquivo ' + ano + ' (' + nome + ') falhou: ' + faltam + ' linha(s) não gravada(s). Nada foi apagado da planilha.');
    });
    // apaga da principal: blocos contíguos, de baixo para cima (cada deleteRows não mexe nas linhas de cima ainda por apagar)
    const idx = lote.map(function (x) { return x.i + 2; }).sort(function (a, b) { return b - a; });
    if (sh.getMaxRows() <= sh.getLastRow()) sh.insertRowsAfter(sh.getMaxRows(), 1);   // o Sheets não deixa apagar todas as linhas não congeladas
    for (let j = 0; j < idx.length;) {
      let fim = idx[j], ini = fim, k = j + 1;
      while (k < idx.length && idx[k] === ini - 1) { ini--; k++; }
      sh.deleteRows(ini, fim - ini + 1);
      j = k;
    }
    SpreadsheetApp.flush();
    const cont = {};
    Object.keys(porAno).forEach(function (ano) { cont[ano] = porAno[ano].length; });
    return { movidas: lote.length, porAno: cont, restam: sel.length > lote.length };
  } finally {
    lock.releaseLock();
  }
}

/** Há algo a arquivar? Verificação leve (Turnos, Consultas e Andamento; Veiculos seguem os turnos e não são lidos aqui). */
function haLinhasAntigas_(limite, agora) {
  const ctx = { limite: limite, agora: agora, turnos: {} };
  return ['Turnos', 'Consultas', 'Andamento'].some(function (nome) {
    return lerLeitura_(nome).some(function (o) { return anoArquivo_(nome, o, ctx) > 0; });
  });
}

/** Gatilho diário (~04h). Sem nada antigo na planilha, só lê três abas pequenas e sai. */
function arquivarAnosAntigos() { return arquivarAnosAntigos_({}); }

/**
 * Arquivamento anual. opcoes: {manual (menu; roda mesmo com as rotinas desativadas), lote, tempoMs (testes)}.
 * Sessão nova: confere se há linhas antigas, faz o backup (sem backup não arquiva) e processa as abas na ordem de ARQ_ABAS, um lote por vez.
 * Tempo esgotado: guarda ARQUIVO_PROGRESSO {aba, porAba, em} e a próxima execução continua de onde parou (sem novo backup).
 * Fim: limpa caches, grava ULTIMO_ARQUIVAMENTO {em, porAba, arquivos}. Nunca lança erro (falha vai para ULTIMO_ARQUIVAMENTO_ERRO e para o retorno).
 * Devolve {ok, nada?, incompleto?, porAba: {Aba: {ano: n}}, total, arquivos: [{ano, url}], backup?}.
 */
function arquivarAnosAntigos_(opcoes) {
  opcoes = opcoes || {};
  const props = PropertiesService.getScriptProperties();
  if (!opcoes.manual && rotinasDesativadas_()) return { ok: true, desativado: true };
  const max = Number(opcoes.lote) > 0 ? Number(opcoes.lote) : ARQ_LOTE, tempo = opcoes.tempoMs >= 0 ? Number(opcoes.tempoMs) : ARQ_TEMPO_MS;
  try {
    const t0 = Date.now(), limite = anoAtualManaus_() - 1;
    const prog = lerJSONSeguro_(props.getProperty('ARQUIVO_PROGRESSO'), null);
    let backup = null;
    if (!prog) {
      if (!haLinhasAntigas_(limite, t0)) return { ok: true, nada: true, porAba: {}, total: 0, arquivos: [] };
      backup = backupDiario();
      if (!backup.ok) throw new Error('Backup antes do arquivamento falhou (' + backup.erro + '). Nada foi arquivado.');
    }
    const porAba = (prog && prog.porAba) || {};
    let i = prog ? Math.max(0, ARQ_ABAS.indexOf(prog.aba)) : 0;
    for (; i < ARQ_ABAS.length; i++) {
      const nome = ARQ_ABAS[i];
      for (;;) {
        const r = arquivarLote_(nome, limite, Date.now(), max);
        Object.keys(r.porAno).forEach(function (ano) { const a = porAba[nome] = porAba[nome] || {}; a[ano] = (a[ano] || 0) + r.porAno[ano]; });
        const resta = r.restam || i < ARQ_ABAS.length - 1;
        if (Date.now() - t0 >= tempo && resta) {
          props.setProperty('ARQUIVO_PROGRESSO', JSON.stringify({ aba: r.restam ? nome : ARQ_ABAS[i + 1], porAba: porAba, em: Date.now() }));
          return resumoArquivamento_({ ok: true, incompleto: true, backup: backup }, porAba);
        }
        if (!r.restam) break;
      }
    }
    props.deleteProperty('ARQUIVO_PROGRESSO');
    const cache = CacheService.getScriptCache();                     // nenhum cache guarda linhas dessas abas; estes dois dependem de Turnos/consultas
    ['auto_encerrar', 'indice_reinc'].forEach(function (k) { try { cache.remove(k); } catch (e) { /* segue */ } });
    const r = resumoArquivamento_({ ok: true, backup: backup }, porAba);
    props.setProperty('ULTIMO_ARQUIVAMENTO', JSON.stringify({ em: Date.now(), porAba: porAba, total: r.total, arquivos: r.arquivos }));
    return r;
  } catch (e) {
    const erro = String((e && e.message) || e).slice(0, 300);
    try { props.setProperty('ULTIMO_ARQUIVAMENTO_ERRO', JSON.stringify({ em: Date.now(), erro: erro })); } catch (e2) { /* nada a fazer */ }
    return { ok: false, erro: erro };
  }
}

function resumoArquivamento_(r, porAba) {
  const anos = {};
  let total = 0;
  Object.keys(porAba).forEach(function (aba) { Object.keys(porAba[aba]).forEach(function (ano) { anos[ano] = true; total += porAba[aba][ano]; }); });
  r.porAba = porAba; r.total = total;
  r.arquivos = Object.keys(anos).sort().map(function (ano) { const i = infoArquivoAnual_(ano); return { ano: Number(ano), url: i ? i.url : '' }; });
  return r;
}

/**
 * Aviso do painel quando o período começa antes de 1º/jan do ano anterior e já existe arquivo anual de algum ano do período:
 * {texto, arquivos: [{ano, url}]} (só lê as propriedades; não abre os arquivos). null = nada a avisar.
 */
function avisoArquivo_(de) {
  const limite = anoAtualManaus_() - 1, ini = anoDia_(de);
  if (!ini || ini >= limite) return null;
  const arquivos = [];
  for (let ano = ini; ano < limite; ano++) { const i = infoArquivoAnual_(ano); if (i && i.url) arquivos.push({ ano: ano, url: i.url }); }
  if (!arquivos.length) return null;
  return { texto: 'Dados de veículos e turnos de ' + arquivos.map(function (a) { return a.ano; }).join(' e ') + ' estão no arquivo anual: ' +
                  arquivos.map(function (a) { return a.url; }).join(' · '), arquivos: arquivos };
}

/* --- relatório mensal --- */

const MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const RE_EMAIL_ = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

/** Mês anterior a "hoje" (aaaa-mm-dd): {de, ate, rotulo: "setembro de 2026"}. */
function mesAnterior_(hoje) {
  const y = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return { de: py + '-' + String(pm).padStart(2, '0') + '-01', ate: somarDias_(hoje.slice(0, 8) + '01', -1), rotulo: MESES_[pm - 1] + ' de ' + py };
}

/** Texto "a@x, b@y" → lista de e-mails (erro com o primeiro inválido). Vazio = lista vazia. */
function listaEmails_(texto) {
  const lst = String(texto || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  lst.forEach(function (e) { if (!RE_EMAIL_.test(e)) throw new Error('E-mail inválido: ' + e.slice(0, 80)); });
  return lst.filter(function (e, i) { return lst.indexOf(e) === i; }).slice(0, 20);
}

/** Destinatários do relatório: propriedade RELATORIO_EMAILS ou, sem ela, o dono da planilha. */
function destinatariosRelatorio_() {
  let lst = [];
  try { lst = listaEmails_(PropertiesService.getScriptProperties().getProperty('RELATORIO_EMAILS')); } catch (e) { lst = []; }
  if (lst.length) return lst;
  let dono = '';
  try { dono = Session.getEffectiveUser().getEmail(); } catch (e) { dono = ''; }
  return dono ? [dono] : [];
}

/** Grava os destinatários (texto separado por vírgula). Vazio = volta ao padrão (dono da planilha). Devolve a lista efetiva. */
function definirEmailsRelatorio_(texto) {
  const lst = listaEmails_(texto), props = PropertiesService.getScriptProperties();
  if (lst.length) props.setProperty('RELATORIO_EMAILS', lst.join(', ')); else props.deleteProperty('RELATORIO_EMAILS');
  return destinatariosRelatorio_();
}

/**
 * Números do período a partir do resultado de dadosPainel_ (mesmos campos e regras do painel). Turnos pela data de início; horas de barreira:
 * encerrado = fim − início; ainda aberto = até agora, no máximo 12 h. TFs e termos cancelados ficam fora das contagens (vêm à parte).
 */
function agregarRelatorio_(d, de, ate, agora) {
  const noPer = function (r) { return r.data >= de && r.data <= ate; };
  const porBarreira = {}, tot = { turnos: 0, minutos: 0, veiculos: 0, pessoas: 0 }, enc = { automatico: 0, gerencia: 0, abertos: 0 };
  d.turnos.filter(noPer).forEach(function (t) {
    const k = t.local || '(sem local)';
    const b = porBarreira[k] = porBarreira[k] || { barreira: k, turnos: 0, minutos: 0, veiculos: 0, pessoas: 0 };
    let min = 0;
    if (t.inicioTs !== null) {
      const f = t.encerrado === 1 ? t.fimTs : Math.min(agora, t.inicioTs + TURNO_MAX_MS);
      if (f !== null && f > t.inicioTs) min = (f - t.inicioTs) / 60000;
    }
    [b, tot].forEach(function (x) { x.turnos++; x.minutos += min; x.veiculos += t.nVeiculos; x.pessoas += t.nPessoas; });
    if (t.encerrado !== 1) enc.abertos++;
    else if (String(t.encerradoPor || '').indexOf('Automático') === 0) enc.automatico++;
    else if (t.encerradoPor) enc.gerencia++;
  });
  const tfsVal = d.tfs.filter(function (r) { return r.cancelado !== 1; });
  const proc = { liberacao: 0, apreensao: 0, rechaco: 0, outro: 0 };
  tfsVal.forEach(function (r) { proc[proc.hasOwnProperty(r.procedimento) ? r.procedimento : 'outro']++; });
  const apreensoes = tfsVal.filter(function (r) { return r.procedimento === 'apreensao'; })
    .sort(function (a, b) { return String(a.data + a.hora).localeCompare(String(b.data + b.hora)); })
    .map(function (r) { return { numeroTxt: r.numeroTxt, data: r.data, local: r.local, produtos: r.produtos.map(function (p) { return p.texto; }).join('; ') }; });
  const pragas = {}, municipios = {};
  d.levantamentos.forEach(function (l) {
    if (l.municipio) municipios[l.municipio] = true;
    l.culturas.forEach(function (c) {                                       // detectada e suspeita contam como detecção (suspeita também à parte)
      if (!c.praga) return;
      const p = pragas[c.praga] = pragas[c.praga] || { praga: c.praga, deteccoes: 0, suspeitas: 0, municipios: {} };
      p.deteccoes++; if (c.resultado === 'suspeita') p.suspeitas++; if (l.municipio) p.municipios[l.municipio] = true;
    });
  });
  const suspeitas = d.levantamentos.reduce(function (s, l) { return s + l.culturas.filter(function (c) { return c.praga && c.resultado === 'suspeita'; }).length; }, 0);
  const termos = d.colheitas.filter(function (c) { return c.cancelado !== 1; });
  return {
    de: de, ate: ate,
    barreiras: Object.keys(porBarreira).map(function (k) { return porBarreira[k]; }).sort(function (a, b) { return b.turnos - a.turnos || a.barreira.localeCompare(b.barreira); }),
    total: tot, encerramentos: enc,
    tfs: { total: tfsVal.length, liberacao: proc.liberacao, apreensao: proc.apreensao, rechaco: proc.rechaco, outro: proc.outro,
           autos: tfsVal.filter(function (r) { return r.auto === 1; }).length, advertencias: tfsVal.filter(function (r) { return r.advertencia === 1; }).length,
           cancelados: d.tfs.length - tfsVal.length, apreensoes: apreensoes },
    pce: { levantamentos: d.levantamentos.length, municipios: Object.keys(municipios).length,
           comPraga: d.levantamentos.filter(function (l) { return l.pragas.length; }).length,
           negativos: d.levantamentos.filter(function (l) { return !l.pragas.length; }).length,   // nenhuma praga detectada nem suspeita
           suspeitas: suspeitas,
           pragas: Object.keys(pragas).map(function (k) { const p = pragas[k]; return { praga: p.praga, deteccoes: p.deteccoes, suspeitas: p.suspeitas, municipios: Object.keys(p.municipios).sort() }; })
             .sort(function (a, b) { return b.deteccoes - a.deteccoes || a.praga.localeCompare(b.praga); }),
           termos: termos.length, termosCancelados: d.colheitas.length - termos.length }
  };
}

function escHtml_(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function numBR_(n, casas) {
  const s = Number(n || 0).toFixed(casas || 0).split('.');
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (s[1] ? ',' + s[1] : '');
}
function diaBR_(d) { return String(d || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'); }

/** E-mail HTML do relatório (tabelas simples, lidas em qualquer cliente de e-mail). */
function htmlRelatorio_(a, rotulo) {
  const th = 'style="text-align:left;padding:4px 8px;border-bottom:2px solid #c9d3e3;background:#eef2f8"';
  const td = 'style="padding:4px 8px;border-bottom:1px solid #e3e8f0"', tdn = 'style="padding:4px 8px;border-bottom:1px solid #e3e8f0;text-align:right"';
  const tabela = function (cab, linhas, numericas) {
    return '<table style="border-collapse:collapse;font-size:14px;margin:6px 0 14px">' +
      '<tr>' + cab.map(function (c) { return '<th ' + th + '>' + escHtml_(c) + '</th>'; }).join('') + '</tr>' +
      linhas.map(function (l) { return '<tr>' + l.map(function (v, i) { return '<td ' + (numericas.indexOf(i) >= 0 ? tdn : td) + '>' + escHtml_(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  };
  const h = function (t) { return '<h3 style="margin:18px 0 4px;color:#1f3b63">' + escHtml_(t) + '</h3>'; };
  const horas = function (m) { return numBR_(m / 60, 1); };
  let out = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2433;max-width:760px">' +
    '<h2 style="margin:0 0 4px">e-GDV – Relatório mensal: ' + escHtml_(rotulo) + '</h2>' +
    '<p style="margin:0;color:#5b6475">Período ' + diaBR_(a.de) + ' a ' + diaBR_(a.ate) + ' (horário de Manaus).</p>';
  out += h('Barreiras (Educação Sanitária/Fiscalização de Trânsito)');
  out += a.barreiras.length ? tabela(['Barreira', 'Turnos', 'Horas de barreira', 'Veículos', 'Pessoas'],
    a.barreiras.map(function (b) { return [b.barreira, numBR_(b.turnos), horas(b.minutos), numBR_(b.veiculos), numBR_(b.pessoas)]; })
      .concat([['Total', numBR_(a.total.turnos), horas(a.total.minutos), numBR_(a.total.veiculos), numBR_(a.total.pessoas)]]), [1, 2, 3, 4])
    : '<p>Nenhum turno no período.</p>';
  out += '<p style="margin:0 0 4px">Turnos encerrados automaticamente (aberto há mais de 12 h): <b>' + numBR_(a.encerramentos.automatico) + '</b> · ' +
    'encerrados pela gerência: <b>' + numBR_(a.encerramentos.gerencia) + '</b>' +
    (a.encerramentos.abertos ? ' · ainda abertos: <b>' + numBR_(a.encerramentos.abertos) + '</b>' : '') + '</p>';
  out += h('TF de Barreira');
  out += tabela(['Procedimento', 'TFs'], [['Liberação', numBR_(a.tfs.liberacao)], ['Apreensão', numBR_(a.tfs.apreensao)], ['Rechaço', numBR_(a.tfs.rechaco)]]
    .concat(a.tfs.outro ? [['Outro', numBR_(a.tfs.outro)]] : []).concat([['Total', numBR_(a.tfs.total)]]), [1]);
  out += '<p style="margin:0 0 4px">Autos de infração: <b>' + numBR_(a.tfs.autos) + '</b> · advertências: <b>' + numBR_(a.tfs.advertencias) + '</b>' +
    (a.tfs.cancelados ? ' · cancelados (fora da contagem): ' + numBR_(a.tfs.cancelados) : '') + '</p>';
  if (a.tfs.apreensoes.length) {
    out += '<p style="margin:8px 0 0"><b>Apreensões</b></p>' + tabela(['TF', 'Data', 'Local', 'Produtos'],
      a.tfs.apreensoes.slice(0, 50).map(function (x) { return [x.numeroTxt, diaBR_(x.data), x.local, x.produtos]; }), []) +
      (a.tfs.apreensoes.length > 50 ? '<p>… e mais ' + (a.tfs.apreensoes.length - 50) + ' (veja no painel).</p>' : '');
  }
  out += h('PCE');
  out += '<p style="margin:0 0 4px">Levantamentos: <b>' + numBR_(a.pce.levantamentos) + '</b> em ' + numBR_(a.pce.municipios) + ' município(s) · ' +
    'com praga detectada ou suspeita: <b>' + numBR_(a.pce.comPraga) + '</b> · levantamentos negativos: <b>' + numBR_(a.pce.negativos || 0) + '</b>' +
    (a.pce.suspeitas ? ' · suspeitas: <b>' + numBR_(a.pce.suspeitas) + '</b>' : '') + ' · Termos de Colheita: <b>' + numBR_(a.pce.termos) + '</b>' +
    (a.pce.termosCancelados ? ' (cancelados fora da contagem: ' + numBR_(a.pce.termosCancelados) + ')' : '') + '</p>';
  out += a.pce.pragas.length ? tabela(['Praga', 'Detecções', 'Suspeitas (incluídas)', 'Municípios'],
    a.pce.pragas.map(function (p) { return [p.praga, numBR_(p.deteccoes), numBR_(p.suspeitas || 0), p.municipios.join(', ')]; }), [1, 2])
    : '<p>Nenhuma praga detectada no período.</p>';
  const url = painelUrl_();
  out += '<p style="margin-top:18px">Detalhes, gráficos e mapa no painel: <a href="' + escHtml_(url) + '">' + escHtml_(url) + '</a></p>' +
    '<p style="color:#5b6475;font-size:12px">E-mail automático do e-GDV (menu e-GDV da planilha → Definir e-mails do relatório mensal).</p></div>';
  return out;
}

/** Gatilho mensal (dia 1): envia o relatório do mês anterior. */
function relatorioMensal() {
  return enviarRelatorio_(mesAnterior_(hojeManaus_()));
}

/** Monta e envia o relatório de um período {de, ate, rotulo}. Grava ULTIMO_RELATORIO. */
function enviarRelatorio_(per) {
  const para = destinatariosRelatorio_();
  if (!para.length) throw new Error('Sem destinatários: use e-GDV → Definir e-mails do relatório mensal.');
  const d = dadosPainel_('Relatório mensal', { de: per.de, ate: per.ate });
  const a = agregarRelatorio_(d, per.de, per.ate, Date.now());
  const assunto = 'e-GDV – Relatório mensal de ' + per.rotulo;
  const texto = 'e-GDV – Relatório mensal de ' + per.rotulo + ' (' + diaBR_(per.de) + ' a ' + diaBR_(per.ate) + ')\n' +
    'Turnos: ' + a.total.turnos + ' · horas de barreira: ' + numBR_(a.total.minutos / 60, 1) + ' · veículos: ' + a.total.veiculos + ' · pessoas: ' + a.total.pessoas + '\n' +
    'TFs: ' + a.tfs.total + ' (apreensões: ' + a.tfs.apreensao + ') · levantamentos: ' + a.pce.levantamentos + ' · termos de colheita: ' + a.pce.termos + '\n' +
    'Painel: ' + painelUrl_();
  MailApp.sendEmail({ to: para.join(','), subject: assunto, htmlBody: htmlRelatorio_(a, per.rotulo), body: texto, name: 'e-GDV' });
  PropertiesService.getScriptProperties().setProperty('ULTIMO_RELATORIO', JSON.stringify({ em: Date.now(), de: per.de, ate: per.ate, para: para }));
  return { ok: true, para: para, assunto: assunto, numeros: a };
}
