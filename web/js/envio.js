// Núcleo do envio à planilha, usado pela página (sync.js) e pelo service worker (sw.js, envio em segundo plano).
// Monta o lote de pendentes (respeitando as permissões e os limites por rodada), marca os enviados, sobe fotos/assinaturas/PDFs
// e faz o envio "só de subida" que o service worker executa quando o Android devolve a conexão (Background Sync).
// Não usa window/document/localStorage: roda também dentro do service worker. Depende de Store (store.js) e CONFIG (config.js).
const Envio = (() => {
  const NOMES = ['t', 'v', 'f', 'p', 'l', 'g', 'c', 'r'];
  const STORES = { t: 'turnos', v: 'veiculos', f: 'tfs', p: 'pessoas', l: 'placas', g: 'levantamentos', c: 'colheitas', r: 'propriedades' };
  const CAMPOS = { t: 'turnos', v: 'veiculos', f: 'tfs', p: 'pessoas', l: 'placas', g: 'levantamentos', c: 'colheitas', r: 'propriedades' };   // nome no corpo da requisição
  const LIMITES = { t: 500, v: 1000, f: 100, p: 300, l: 300, g: 100, c: 100, r: 300 };                                                         // registros por rodada
  // stores de cada módulo (pessoas servem ao TF e ao PCE: sobem se qualquer um dos dois estiver liberado)
  const MODULO_DO_STORE = { t: ['veiculos'], v: ['veiculos'], f: ['tf'], l: ['tf'], p: ['tf', 'pce'], g: ['pce'], c: ['pce'], r: ['pce'], a: ['pce'] };
  /** Permissões por módulo (padrão: tudo liberado — aparelho que nunca sincronizou ou servidor antigo que não manda permissões).
   *  "antigo" (Digitar do papel: registros antigos e PDFs escaneados) é o contrário: só vale se o servidor mandar antigo=1. */
  const normPerm = o => {
    const r = { veiculos: 1, tf: 1, pce: 1, antigo: 0 };
    if (o && typeof o === 'object') ['veiculos', 'tf', 'pce'].forEach(k => { if (k in o) r[k] = Number(o[k]) === 0 || o[k] === false ? 0 : 1; });
    r.antigo = o && (o.antigo === true || Number(o.antigo) === 1) && r.pce ? 1 : 0;
    return r;
  };
  const storePermitido = (n, perm) => MODULO_DO_STORE[n].some(m => (perm || {})[m] !== 0);
  /** Registro digitado do papel (levantamento/termo com registroAntigo=1): só sobe com a permissão "antigo". */
  const ehAntigo = r => !!r && Number(r.registroAntigo) === 1;
  const podeAntigo = perm => !!perm && Number(perm.antigo) === 1;
  const ANTIGO_NOS = ['g', 'c'];                                              // stores que podem ter registros antigos
  const TAG = 'gdv-enviar', TAG_PERIODICO = 'gdv-enviar-periodico';

  const limpo = ({ pendente, provisorio, ...r }) => r;
  const lerJSON = (v, pad) => { try { return JSON.parse(v) || pad; } catch (e) { return pad; } };

  /** Erro de conexão (sem internet, servidor fora do ar, tempo esgotado): vale tentar de novo depois. */
  const erroDeRede = e => !!e && (e.name === 'AbortError' || e.name === 'TypeError' || /abort|fetch|network|rede/i.test(e.message || ''));
  /** O servidor recusou a credencial do aparelho (revogada ou inexistente): não adianta tentar de novo. */
  const credencialRecusada = e => !!e && /revogado|n[aã]o ativado/i.test(e.message || '');

  /** POST para o Apps Script. c = {url, key}. Erro do servidor vira exceção (com semPermissao/permissoes quando o módulo foi tirado). */
  async function post(c, corpo, limiteMs) {
    const ctrl = new AbortController(), t = limiteMs ? setTimeout(() => ctrl.abort(), limiteMs) : null;
    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita preflight CORS
        body: JSON.stringify({ ...corpo, key: c.key }),
        redirect: 'follow',
        signal: ctrl.signal
      });
      const j = await r.json();
      if (!j.ok) {
        const e = new Error(j.erro || 'Erro no servidor');
        if (j.semPermissao) { e.semPermissao = j.semPermissao; e.permissoes = j.permissoes; }
        throw e;
      }
      return j;
    } finally { if (t) clearTimeout(t); }
  }

  /* Fotos, assinaturas e PDFs (PCE): ficam no aparelho (store "arquivos") e sobem ao Drive depois do sync principal.
     Só contam/sobem as que estão ligadas a um levantamento ou termo salvo (não excluído): rascunhos não sobem. */
  function idsReferenciados(regs) {
    const s = new Set();
    regs.forEach(r => {
      if (!r || r.excluido) return;
      lerJSON(r.fotos, []).forEach(id => id && s.add(id));
      lerJSON(r.documentos, []).forEach(id => id && s.add(id));                 // PDFs escaneados (registro digitado do papel)
      Object.values(lerJSON(r.assinaturas, {})).forEach(id => id && s.add(id));
    });
    return s;
  }
  /** perm (opcional): sem a permissão "antigo", os arquivos dos registros do papel (e qualquer PDF) ficam fora da lista de envio. */
  async function arquivosPendentes(regs, perm) {
    if (!regs) regs = [...await Store.todos('levantamentos'), ...await Store.todos('colheitas')];
    if (perm && !podeAntigo(perm)) regs = regs.filter(r => !ehAntigo(r)).map(r => ({ ...r, documentos: '[]' }));
    const ref = idsReferenciados(regs);
    return (await Store.chaves('arquivos', 'enviado', 0)).filter(id => ref.has(id));
  }

  /** Tudo o que ainda não foi enviado, por store (letras de NOMES) + a = ids de arquivos; total = soma. */
  async function pendentes() {
    const lst = await Promise.all(NOMES.map(n => Store.todos(STORES[n])));
    const o = {}; NOMES.forEach((n, i) => { o[n] = lst[i].filter(x => x.pendente); });
    o.a = await arquivosPendentes([...lst[NOMES.indexOf('g')], ...lst[NOMES.indexOf('c')]]);
    o.total = NOMES.reduce((s, n) => s + o[n].length, 0) + o.a.length;
    return o;
  }

  /**
   * Marca como enviados (pendente: 0) os registros aceitos pelo servidor. Lê e grava NA MESMA transação e só marca se atualizadoEm
   * não mudou: uma edição feita durante o envio (nesta página, em outra aba ou no service worker) continua pendente.
   * Recusados pelo servidor (módulo sem autorização) continuam pendentes.
   */
  async function marcarEnviados(store, enviados, recusados, recebidoEm) {
    const fora = new Set((recusados || []).map(String));
    const env = (enviados || []).filter(e => !fora.has(String(e.id)));
    // turno: srv_ts = momento em que a planilha recebeu (a tela "Turno encerrado" mostra "recebido pela planilha às HH:MM")
    const extra = store === 'turnos' && recebidoEm ? { srv_ts: recebidoEm } : {};
    await Store.mesclar(store, env, (atual, e) => atual && atual.pendente && atual.atualizadoEm === e.atualizadoEm ? { ...atual, ...extra, pendente: 0 } : null);
  }

  /* ---------- Sinal do aparelho (heartbeat) ----------
     Toda sincronização (página ou service worker) leva o estado do aparelho: id fixo (meta "aparelhoId"), versão do app, plataforma,
     o que ainda está guardado sem enviar, os turnos encerrados que ainda não chegaram à planilha e o último erro de envio.
     A planilha grava na aba Aparelhos; o painel usa para o "último sinal" das barreiras e para avisar "encerrado no celular,
     aguardando envio". O último erro fica na meta "ultimoErro" até um envio dar certo (vai junto no sync seguinte). */
  async function idAparelho() {
    let id = await Store.meta('aparelhoId');
    if (!id) { id = Store.novoId(); await Store.setMeta('aparelhoId', id); }
    return id;
  }
  const versaoApp = () => (typeof VERSAO_APP !== 'undefined' ? VERSAO_APP : '');
  function plataforma() {
    const n = typeof navigator !== 'undefined' ? navigator : {}, ua = String(n.userAgent || '');
    if (/iPad|iPhone|iPod/.test(ua) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1)) return 'ios';
    return /Android/i.test(ua) ? 'android' : 'outro';
  }
  async function instalado() {
    try {
      if (typeof matchMedia === 'function') return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
    } catch (e) { /* segue */ }
    return !!(await Store.meta('standalone'));                               // service worker: o que a página viu
  }
  /** Texto curto do erro para o fiscal e para o painel (falhas de rede em português). */
  function motivoErro(e) {
    if (!e) return '';
    if (e.name === 'AbortError') return 'tempo esgotado (internet lenta ou servidor demorando)';
    if (erroDeRede(e)) return 'sem conexão com o servidor (sem internet ou sinal fraco)';
    if (e instanceof SyntaxError) return 'resposta inválida do servidor';
    return String(e.message || e).replace(/\s+/g, ' ').trim().slice(0, 200) || 'erro desconhecido';
  }
  /** Guarda o último erro de envio (vai no próximo sinal); sem erro = apaga. */
  async function guardarErro(e) {
    try {
      if (e) await Store.setMeta('ultimoErro', { msg: motivoErro(e), em: Date.now() });
      else await Store.apagar('meta', ['ultimoErro']);
    } catch (e2) { /* sem banco */ }
  }
  /** Estado do aparelho para o sinal. p = pendentes() já lidos (opcional); origem: 'app' | 'segundo-plano'. */
  async function sinal(p, origem) {
    p = p || await pendentes();
    const enc = (p.t || []).filter(t => Number(t.encerrado) === 1).slice(0, 20), fim = {};
    enc.forEach(t => { if (t.fim) fim[t.id] = String(t.fim).slice(0, 5); });
    const err = (await Store.meta('ultimoErro')) || null;
    return { id: await idAparelho(), versao: versaoApp(), plataforma: plataforma(), standalone: await instalado(),
      online: typeof navigator === 'undefined' || navigator.onLine !== false,
      pendentes: { turnos: (p.t || []).length, veiculos: (p.v || []).length, tfs: (p.f || []).length, levantamentos: (p.g || []).length,
        colheitas: (p.c || []).length, arquivos: (p.a || []).length },
      turnosEncerradosPendentes: enc.map(t => t.id), fimPendentes: fim, turnoAtual: (await Store.meta('turnoAtual')) || '',
      ultimoErro: err ? String(err.msg || '') : '', ultimoErroEm: err ? Number(err.em) || 0 : 0, origem: origem === 'segundo-plano' ? 'segundo-plano' : 'app' };
  }
  /**
   * O envio falhou por erro do servidor (não de rede nem credencial): uma chamada leve "ping" só com o sinal, para o painel ao menos
   * ver o erro e o que está guardado. Melhor esforço, uma vez por falha (nunca repete nem chama a si mesma).
   */
  async function avisarFalha(chamar, e, origem) {
    if (!e || erroDeRede(e) || credencialRecusada(e) || e.semPermissao) return false;
    try { await chamar({ action: 'ping', aparelho: await sinal(null, origem) }, 10000); return true; } catch (e2) { return false; }
  }

  /**
   * Uma rodada de envio: lê os pendentes, monta o lote (só módulos permitidos, até LIMITES por store), chama action "sync" e marca
   * os enviados. Devolve {r: resposta do servidor, rec: recusados, recusouAlgo, resta: ainda há pendentes permitidos além do lote}.
   */
  async function enviarLote(chamar, perm, origem) {
    const p = await pendentes();
    // módulo sem autorização (última permissão conhecida): os registros nem sobem; ficam pendentes até a gerência liberar
    const vai = {}; NOMES.forEach(n => { vai[n] = storePermitido(n, perm) ? p[n] : []; });
    // registro antigo (do papel) sem a permissão "antigo": também fica guardado (pendente) até a gerência liberar
    if (!podeAntigo(perm)) ANTIGO_NOS.forEach(n => { vai[n] = vai[n].filter(r => !ehAntigo(r)); });
    const env = {}; NOMES.forEach(n => { env[n] = vai[n].slice(0, LIMITES[n]); });
    const since = (await Store.meta('lastSync')) || 0;
    const corpo = { action: 'sync', since, aparelho: await sinal(p, origem) }; NOMES.forEach(n => { corpo[CAMPOS[n]] = env[n].map(limpo); });
    const r = await chamar(corpo);
    const rec = r.recusados || {};
    for (const n of NOMES) await marcarEnviados(STORES[n], env[n], rec[CAMPOS[n]], Number(r.agora) || 0);
    return { r, rec, recusouAlgo: Object.keys(rec).some(k => (rec[k] || []).length),
      resta: NOMES.some(n => vai[n].length > env[n].length), enviados: NOMES.reduce((s, n) => s + env[n].length, 0) };
  }

  // Falhas por arquivo neste contexto (página ou service worker): o arquivo que falhou vai para o fim da fila e não impede os outros.
  const falhasArq = {};
  const porRodada = () => (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.arquivosPorRodada) || 5;
  /** Envia ao Drive até porRodada fotos/assinaturas/PDFs pendentes, uma por requisição. Os dados ficam no aparelho (reimpressão offline). */
  async function enviarArquivos(ids, chamar) {
    let enviados = 0, erro = null;
    const fila = ids.map((id, i) => ({ id, i })).sort((x, y) => (falhasArq[x.id] || 0) - (falhasArq[y.id] || 0) || x.i - y.i).map(x => x.id);
    for (const id of fila.slice(0, porRodada())) {
      const a = await Store.obter('arquivos', id);
      if (!a || a.enviado || !a.dados) continue;
      const ext = a.mime === 'image/png' ? 'png' : a.mime === 'application/pdf' ? 'pdf' : 'jpg';
      const arquivo = { id: a.id, dono: a.dono, donoId: a.donoId, tipo: a.tipo, papel: a.papel || '', mime: a.mime,
        nome: `${a.donoId}_${a.tipo}_${a.papel || 'n'}_${a.id}.${ext}`, rotulo: a.rotulo || '' };   // rotulo: "praga – cultura" da foto do levantamento
      let r;
      // PDF (até 10 MB ≈ 13,4 MB em base64) tem mais tempo para subir
      try { r = await chamar({ action: 'arquivoEnviar', arquivo, base64: String(a.dados).replace(/^data:[^,]*,/, '') }, a.tipo === 'documento' ? 180000 : 60000); }
      catch (e) {
        falhasArq[id] = (falhasArq[id] || 0) + 1; erro = erro || e;
        // credencial recusada ou sem resposta do servidor (rede/tempo esgotado): os outros falhariam também
        if (e.semPermissao || credencialRecusada(e) || erroDeRede(e)) break;
        continue;
      }
      delete falhasArq[id];
      // PDF já no Drive sai do aparelho (não é impresso nos documentos e ocuparia muito espaço); fotos/assinaturas ficam para reimprimir
      await Store.mesclar('arquivos', [{ id }], atual => atual                // removido durante o envio: nada a gravar
        ? { ...atual, enviado: 1, url: r.url || '', driveId: r.driveId || '', ...(atual.tipo === 'documento' ? { dados: '' } : {}) } : null);
      enviados++;
    }
    if (erro) throw erro;                                                     // quem chamou mostra o erro (depois de tentar os demais)
    return enviados;
  }

  /* ---------- Envio em segundo plano (service worker) ----------
     A página espelha a credencial (localStorage gdv.url/key/nome) na meta "cred" do IndexedDB, que o service worker consegue ler. */

  /**
   * Envio "só de subida": manda os pendentes (e as fotos/assinaturas/PDFs, se o PCE estiver liberado) sem baixar nem aplicar
   * mudanças do servidor (lastSync não muda: a página baixa tudo na próxima sincronização). Rejeita em falha de rede/servidor
   * (o navegador tenta de novo); credencial recusada marca cred.revogado e para (sem repetir).
   * Devolve {enviados, arquivos, resta, motivo?}.
   */
  async function subir() {
    const c = await Store.meta('cred');
    if (!c || !c.url || !c.key) return { enviados: 0, arquivos: 0, motivo: 'aparelho não ativado' };
    if (c.revogado) return { enviados: 0, arquivos: 0, motivo: 'credencial revogada' };
    let perm = normPerm(await Store.meta('permissoes'));
    const guardarPerm = async o => {
      const novo = normPerm(o), mudou = Object.keys(novo).some(k => novo[k] !== perm[k]);
      perm = novo; await Store.setMeta('permissoes', novo); return mudou;
    };
    const chamar = async (corpo, ms) => {
      try { return await post(c, corpo, ms || 120000); }
      catch (e) { if (e.semPermissao) await guardarPerm(e.permissoes || { ...perm, [e.semPermissao]: 0 }); throw e; }
    };
    let enviados = 0, arquivos = 0, resta = false;
    const inicio = Date.now();
    try {
      for (let volta = 0; volta < 20; volta++) {
        let l;
        try { l = await enviarLote(chamar, perm, 'segundo-plano'); }
        catch (e) { if (e.semPermissao) continue; throw e; }               // gerência tirou um módulo: a próxima rodada já o deixa de fora
        enviados += l.enviados;
        const mudou = l.r.permissoes ? await guardarPerm(l.r.permissoes) : false;
        if (mudou && !l.recusouAlgo) continue;                               // módulo liberado agora: manda o que estava guardado
        if (!l.resta) break;
      }
      // fotos/assinaturas/PDFs: algumas rodadas, até ~2 min (o navegador limita o tempo do evento); o resto fica para depois
      while (perm.pce !== 0 && Date.now() - inicio < 120000) {
        const ids = await arquivosPendentes(null, perm);
        if (!ids.length) break;
        let n = 0;
        try { n = await enviarArquivos(ids, chamar); }
        catch (e) { if (erroDeRede(e) || credencialRecusada(e)) throw e; break; }   // (sem permissão: a permissão já foi guardada)   // arquivo com problema: a página mostra o erro
        arquivos += n;
        if (!n) break;
      }
      resta = perm.pce !== 0 && (await arquivosPendentes(null, perm)).length > 0 && Date.now() - inicio >= 120000;
    } catch (e) {
      if (credencialRecusada(e)) {
        const atual = await Store.meta('cred');                              // só marca se ainda for a mesma credencial (sem corrida com nova ativação)
        if (atual && atual.key === c.key) await Store.setMeta('cred', { ...atual, revogado: 1 });
        return { enviados, arquivos, motivo: 'credencial revogada' };
      }
      await guardarErro(e);                                                  // vai no próximo sinal (a página mostra o motivo)
      await avisarFalha(chamar, e, 'segundo-plano');
      throw e;
    }
    await guardarErro(null);                                                 // o erro anterior já foi junto no sinal deste envio
    return { enviados, arquivos, resta };
  }

  return { NOMES, STORES, CAMPOS, LIMITES, MODULO_DO_STORE, TAG, TAG_PERIODICO, normPerm, storePermitido, ehAntigo, podeAntigo, limpo, lerJSON,
    erroDeRede, credencialRecusada, post, arquivosPendentes, pendentes, marcarEnviados, enviarLote, enviarArquivos, subir,
    sinal, idAparelho, versaoApp, plataforma, motivoErro, guardarErro, avisarFalha };
})();
