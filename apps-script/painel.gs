/* ---------- Painel do administrador (somente leitura) ---------- */

/**
 * O painel é uma página do GitHub Pages (mesmo site do app): web/painel/ (app separado "e-GDV Painel"). Entra com `entrar`
 * (aplicativo: painel; usuarios.gs) e chama esta API (doPost) com o token em `key`. Quem tem `painel` lê; quem grava precisa de `gerencia`.
 *   painelDados  {key, de, ate}      → dados do período, já sem dados pessoais desnecessários (documentos mascarados)
 *   painelDados  {key, aoVivo:true, ids:[...]} → só os turnos em andamento (e os de "ids", para saber se encerraram) com seus veículos
 *                                       (atualização automática de 1 em 1 minuto, sem reler TFs, levantamentos e termos)
 *   As duas formas de painelDados trazem também tfsAndamento: TFs sendo preenchidos agora nos aparelhos (aba Andamento).
 *   painelDados também roda o encerramento automático de turnos esquecidos (> 12 h, no máximo 1 vez a cada 10 min) e a forma completa
 *   traz rotinas: {ultimoBackup, backupFalhou, desativadas, ultimoArquivamento} (rodapé do painel) e, quando o período começa antes de
 *   1º/jan do ano anterior e já há arquivo anual desses anos, avisoArquivo (texto) + arquivosAnuais [{ano, url}] (ver arquivamento anual).
 * Contas, permissões e sessões: actions de gerência em usuarios.gs (usuariosListar, usuarioCriar...). Sair: `sair`.
 */
const PAINEL_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/painel/';
const PAINEL_MAX_DIAS = 366;                 // período máximo de uma consulta
const PAINEL_MAX_REGISTROS = 60000;          // turnos + veículos + TFs + levantamentos + termos devolvidos numa resposta
const PAINEL_MAX_LACUNAS = 200;              // lacunas listadas por sequência na auditoria (o total vem em lacunasTotal)

/** Endereço do painel (Propriedades do script → PAINEL_URL troca o padrão, ex.: outro domínio). */
function painelUrl_() {
  return PropertiesService.getScriptProperties().getProperty('PAINEL_URL') || PAINEL_URL_PADRAO;
}

/**
 * Valida o token do painel (sessão de matrícula e senha, usuarios.gs) e devolve o nome do usuário. Exige `painel`;
 * `gravar` = true (action que grava) exige `gerencia`. Sem token válido: MSG_ENTRE_ / MSG_SESSAO_.
 */
function adminDoToken_(token, gravar) {
  return usuarioDoPainel_(token, gravar);
}

/* ---------- Painel → "Encerrar turno" (barreira esquecida aberta no aparelho) ---------- */

const RE_HM_ = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENCERRAR_TOLERANCIA_MS = 2 * 3600 * 1000;   // fuso do oeste do AM (UTC−5) e relógio do aparelho adiantado

/**
 * O gerente encerra um turno que ficou aberto (o fiscal diz que encerrou, mas o encerramento não chegou à planilha).
 * Só administrador. fim = "HH:MM" informado no painel; antes do início = dia seguinte (turno que passou da meia-noite).
 * Grava encerrado = 1, fim, encerradoPor/encerradoEm e atualizadoEm/srv_ts = agora: o aparelho do fiscal recebe o encerramento
 * na próxima sincronização, e um envio antigo do aparelho (encerrado = 0) não reabre o turno (ver gravar_).
 */
function painelEncerrarTurno(token, turnoId, fim) {
  const admin = adminDoToken_(token, true);
  const id = String(turnoId === null || turnoId === undefined ? '' : turnoId).trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  fim = String(fim === null || fim === undefined ? '' : fim).trim();
  if (!RE_HM_.test(fim)) throw new Error('Horário de encerramento inválido. Use o formato HH:MM (ex.: 17:30).');
  const quem = textoAutor_(admin);   // texto, nunca fórmula
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Turnos'), cols = t.cols;
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    if (idx < 0) throw new Error('Turno não encontrado na planilha. Atualize o painel e tente de novo.');
    const o = paraObjeto_(cols, t.valores[idx]);
    if (o.encerrado === 1) {
      throw new Error('Este turno já está encerrado' + (o.fim ? ' (fim ' + o.fim + ')' : '') + (o.encerradoPor ? ', encerrado por ' + o.encerradoPor : ' pelo fiscal') + '.');
    }
    const ini = tsManaus_(o.data, o.inicio), agora = Date.now();
    let fimTs = tsManaus_(o.data, fim);
    if (fimTs !== null && ini !== null && fimTs < ini) fimTs += 864e5;                // passou da meia-noite
    if (fimTs !== null && fimTs > agora + ENCERRAR_TOLERANCIA_MS) {
      throw new Error('O horário de encerramento (' + fim + ') ainda não chegou. Um horário antes do início do turno (' + o.inicio + ') conta como o dia seguinte.');
    }
    const novo = { encerrado: 1, fim: fim, atualizadoEm: agora, srv_ts: agora, encerradoPor: quem, encerradoEm: agora };
    const linha = cols.map(function (c, i) { return c in novo ? novo[c] : t.valores[idx][i]; });
    t.sh.getRange(idx + 2, 1, 1, cols.length).setValues([linha]);
    return { ok: true, turno: { id: id, data: o.data, inicio: o.inicio, fim: fim, encerrado: 1, inicioTs: ini, fimTs: fimTs,
                                encerradoPor: quem, encerradoEm: agora, atualizadoEm: agora, srv_ts: agora } };
  } finally {
    lock.releaseLock();
  }
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
  // painel e relatórios: a mesma BVA fixa com um nome só (no volante o local é o endereço e fica como está)
  if (nome === 'Turnos') linhas.forEach(function (t) { const p = normPub_(t.posto); if (p.indexOf('mov') < 0 && p.indexOf('volante') < 0) t.local = localCanon_(t.local); });
  // turno compartilhado: os colegas que entraram pelo código contam como fiscais do turno (painel, relatórios, produtividade)
  if (nome === 'Turnos') linhas.forEach(function (t) { if (t.colegas) t.fiscal = fiscaisComColegas_(t.fiscal, t.colegas); });
  return linhas;
}

/**
 * Nomes diferentes da mesma BVA fixa (turnos antigos digitados à mão, cadastro de barreiras do TF) → o nome do app (CONFIG.bvas).
 * Vale só na leitura (painel, relatórios, convênio, VIGIFITO, página pública): a planilha e os aparelhos ficam como estão.
 * Compara sem acento/caixa/pontuação e sem as palavras "BVA", "Barreira", "da/de/do": "BVA Porto da Ceasa" = "Barreira Porto CEASA".
 */
const BVA_APELIDOS_ = {
  'BVA - CEASA': ['Porto da CEASA', 'BR-319 Porto da CEASA']
};
function chaveBva_(s) {
  return normPub_(s).split(' ').filter(function (w) { return w && !/^(bva|barreira|da|de|do|das|dos)$/.test(w); }).join(' ');
}
let apelidosBva_ = null;
function localCanon_(local) {
  if (!apelidosBva_) {
    apelidosBva_ = {};
    Object.keys(BVA_APELIDOS_).forEach(function (nome) {
      [nome].concat(BVA_APELIDOS_[nome]).forEach(function (a) { const k = chaveBva_(a); if (k) apelidosBva_[k] = nome; });
    });
  }
  const k = chaveBva_(local);
  return (k && apelidosBva_[k]) || local;
}
/** Barreira do cadastro do TF que é uma BVA do app (pelo id, nome, sufixo ou local) → o nome da BVA; senão ''. */
function bvaDoCadastro_(b) {
  const nomes = [b.sufixo, b.nome, b.id, b.local];
  for (let i = 0; i < nomes.length; i++) { const c = localCanon_(nomes[i]); if (c && c !== nomes[i] || BVA_APELIDOS_[c]) return c; }
  return '';
}

/* --- auxiliares do painel (sem efeitos colaterais) --- */

const RE_DIA_ = /^\d{4}-\d{2}-\d{2}$/;
/** "aaaa-mm-dd" + n dias (calendário puro, sem fuso). */
function somarDias_(dia, n) {
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) + n * 864e5);
  return d.toISOString().slice(0, 10);
}
function diaValido_(v) { return RE_DIA_.test(String(v || '')) && somarDias_(v, 0) === v; }
function hojeManaus_() { return Utilities.formatDate(new Date(), 'America/Manaus', 'yyyy-MM-dd'); }
/** Data + "HH:MM" do horário de Manaus (UTC−4, sem horário de verão) → milissegundos; null se faltar algo. */
function tsManaus_(dia, hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  if (!diaValido_(dia) || !m) return null;
  return Date.parse(dia + 'T' + m[1].padStart(2, '0') + ':' + m[2] + ':00-04:00');
}
function numOuNulo_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function lerJSONSeguro_(v, padrao) {
  try { const o = JSON.parse(String(v || '')); return o === null || o === undefined ? padrao : o; } catch (e) { return padrao; }
}
/** CPF → "***.456.789-**"; CNPJ → "**.345.678/0001-**"; outro valor → "***" (vazio continua vazio). */
function mascararDoc_(v) {
  const d = digitos_(v);
  if (d.length === 11) return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  if (d.length === 14) return '**.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-**';
  return String(v || '').trim() ? '***' : '';
}
function tipoDoc_(v) { const n = digitos_(v).length; return n === 11 ? 'CPF' : n === 14 ? 'CNPJ' : ''; }
/** Quantidade "1.234,5" / "1234.5" / "12" → número; null se não der para ler. */
function quantidade_(q, u) {
  let s = String(q || '').trim();
  if (!s) return null;
  // em tonelada, um ponto só e sem vírgula é decimal: "12.723 Ton" = 12,723 t (doze mil toneladas numa carga não existe)
  if (u !== undefined && toneladas_(1, u) === 1 && s.indexOf(',') < 0 && /^\d+\.\d+$/.test(s)) { const t = Number(s); return isFinite(t) ? t : null; }
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');      // "1.500" = mil e quinhentos (separador de milhar do pt-BR)
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** Produtos do TF: o app grava JSON ["PRODUTO - 10 Kg", ...] (aceita também [{p,q,u}] e texto solto). */
function produtosTF_(v) {
  const bruto = lerJSONSeguro_(v, null);
  const lista = Array.isArray(bruto) ? bruto : (String(v || '').trim() ? String(v).split(/\s*[;\n]\s*/) : []);
  return lista.map(function (x) {
    if (x && typeof x === 'object') {
      const p = String(x.p || x.produto || '').trim(), q = String(x.q || x.quantidade || '').trim(), u = String(x.u || x.unidade || '').trim();
      return { produto: p, quantidade: quantidade_(q, u), unidade: u, texto: (p + (q ? ' - ' + q + ' ' + u : '')).trim() };
    }
    const t = String(x || '').trim(), m = /^(.*?)\s+-\s+([\d.,]+)\s*(.*)$/.exec(t);
    return m ? { produto: m[1].trim(), quantidade: quantidade_(m[2], m[3].trim()), unidade: m[3].trim(), texto: t }
             : { produto: t, quantidade: null, unidade: '', texto: t };
  }).filter(function (p) { return p.produto; });
}
/** Documentos apresentados no TF (JSON {nf, ptv, gta, ...}): só os tipos preenchidos, sem os números. */
function documentosTF_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).filter(function (k) { return String(o[k] || '').trim(); }) : [];
}
function contarFotos_(v) { const a = lerJSONSeguro_(v, []); return Array.isArray(a) ? a.filter(Boolean).length : 0; }
function contarAssinaturas_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' ? Object.keys(o).filter(function (k) { return o[k]; }).length : 0;
}
