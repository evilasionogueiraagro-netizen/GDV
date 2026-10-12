// Sincronização com a planilha (Apps Script). Envia o que está pendente e recebe o que mudou.
// O núcleo do envio (lote, marcar enviados, arquivos) fica em envio.js, compartilhado com o service worker (envio em segundo plano).
const Sync = (() => {
  let rodando = false;
  const listeners = [];
  let estado = { tipo: 'idle', msg: '' };

  const cfg = () => ({
    // o endereço oficial (config.js) manda: um endereço antigo guardado na ativação não pode prender o aparelho numa
    // implantação velha. O guardado só vale sem endereço oficial ou nos testes (localhost).
    url: (CONFIG.sync.url && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? CONFIG.sync.url : localStorage.getItem('gdv.url') || CONFIG.sync.url) || '',
    key: localStorage.getItem('gdv.key') || ''
  });
  const ativado = () => { const c = cfg(); return !!(c.url && c.key); };
  const nome = () => localStorage.getItem('gdv.nome') || '';

  /** Troca o código de 6 dígitos por uma credencial própria do aparelho, vinculada ao nome do fiscal. */
  async function ativar(codigo, urlManual) {
    const url = (urlManual || cfg().url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('Endereço do servidor inválido.');
    const cod = String(codigo || '').replace(/\D/g, '');
    if (cod.length !== 6) throw new Error('O código tem 6 dígitos.');
    let j;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ativar', codigo: cod }), redirect: 'follow' });
      j = await r.json();
    } catch (e) { throw new Error('Sem internet ou servidor indisponível. A ativação precisa de conexão.'); }
    if (!j.ok) throw new Error(j.erro || 'Falha na ativação.');
    localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.key', j.token);
    localStorage.setItem('gdv.nome', j.nome); localStorage.removeItem('gdv.revogado');
    await espelharCred();
    return j.nome;
  }
  function desativar() { ['gdv.key', 'gdv.nome', 'gdv.revogado'].forEach(k => localStorage.removeItem(k)); espelharCred(); }
  /** Marca a credencial como recusada pelo servidor (a tela pede novo código) ou limpa a marca. */
  function marcarRevogado(sim) {
    if (!!localStorage.getItem('gdv.revogado') === !!sim) return;
    if (sim) localStorage.setItem('gdv.revogado', '1'); else localStorage.removeItem('gdv.revogado');
    espelharCred();
  }

  /* ---------- Envio em segundo plano (Background Sync, Chrome/Android) ----------
     O service worker não lê localStorage: a credencial é copiada para a meta "cred" do IndexedDB (ativar, desativar, revogação e
     ao abrir o app). Ao desativar o aparelho a cópia é apagada. */
  async function espelharCred() {
    try {
      const c = cfg();
      if (c.url && c.key) await Store.setMeta('cred', { url: c.url, key: c.key, nome: nome(), revogado: localStorage.getItem('gdv.revogado') ? 1 : 0 });
      else await Store.apagar('meta', ['cred']);
    } catch (e) { /* sem banco: o envio em segundo plano só fica indisponível */ }
  }
  /** Ao abrir o app: o service worker pode ter visto a credencial recusada com o app fechado — a tela pede novo código. */
  async function importarRevogacao() {
    try {
      const m = await Store.meta('cred'), c = cfg();
      if (m && m.revogado && c.key && m.key === c.key && !localStorage.getItem('gdv.revogado')) localStorage.setItem('gdv.revogado', '1');
    } catch (e) { /* idem */ }
  }
  /** Ao abrir o app (antes da 1ª tela): traz a revogação vista pelo service worker, espelha a credencial e agenda o envio a cada pendência. */
  async function prepararFundo() {
    await importarRevogacao();
    await espelharCred();
    Store.quandoPendente(agendarEnvio);
  }
  /** O navegador acorda o service worker para enviar os pendentes quando houver internet, mesmo com o app fechado (Android). */
  const envioAutomatico = () => 'serviceWorker' in navigator && typeof window.SyncManager !== 'undefined';
  let periodicoPedido = false;
  function agendarEnvio() {
    try {
      if (!ativado() || !('serviceWorker' in navigator)) return;
      navigator.serviceWorker.ready.then(async reg => {
        if ('sync' in reg) await reg.sync.register(Envio.TAG).catch(() => {});
        // Periodic Background Sync: só se o navegador já concedeu (app instalado e usado com frequência); nunca pede permissão
        if (!periodicoPedido && 'periodicSync' in reg && navigator.permissions) {
          periodicoPedido = true;
          const st = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
          if (st && st.state === 'granted') await reg.periodicSync.register(Envio.TAG_PERIODICO, { minInterval: 15 * 60 * 1000 }).catch(() => {});
        }
      }).catch(() => {});
    } catch (e) { /* sem suporte: o envio acontece quando o app abrir com internet */ }
  }
  function emitir(e) { estado = e; listeners.forEach(f => f(e)); }

  /* ---------- Módulos autorizados (definidos pela gerência no painel → Servidores) ----------
     O servidor devolve {veiculos, tf, pce, antigo} a cada sync; guardamos a última (meta "permissoes") para usar sem internet.
     Padrão: módulos liberados (aparelho que nunca sincronizou, ou versão antiga do servidor que não manda permissões);
     "antigo" (Digitar do papel: registro/termo antigo e PDF escaneado) é o contrário: desligado até o servidor mandar antigo=1. */
  const MODULOS = { veiculos: 'Educação Sanitária/Fiscalização de Trânsito', tf: 'TF de Barreira', pce: 'PCE', antigo: 'Digitar do papel' };
  const { MODULO_DO_STORE, normPerm } = Envio;
  let PERM = normPerm(null);
  const permissoes = () => ({ ...PERM });
  const pode = m => (m === 'antigo' ? Envio.podeAntigo(PERM) : PERM[m] !== 0);
  const storePermitido = n => Envio.storePermitido(n, PERM);
  async function carregarPermissoes() { try { PERM = normPerm(await Store.meta('permissoes')); } catch (e) { /* sem banco: tudo liberado */ } return permissoes(); }
  /** Novas permissões vindas do servidor: guarda e avisa a tela (gdv-permissoes) se algo mudou. */
  async function guardarPermissoes(o) {
    if (!o) return false;
    const novo = normPerm(o), mudou = Object.keys(novo).some(k => novo[k] !== PERM[k]);
    PERM = novo; await Store.setMeta('permissoes', novo);
    if (mudou) window.dispatchEvent(new CustomEvent('gdv-permissoes', { detail: permissoes() }));
    return mudou;
  }
  /** Módulos sem autorização que ainda têm registros guardados no aparelho (não enviados). */
  async function bloqueadosComPendentes(p) {
    p = p || await pendentes();
    const m = new Set();
    Object.keys(MODULO_DO_STORE).forEach(n => { if (n !== 'a' && (p[n] || []).length && !storePermitido(n)) MODULO_DO_STORE[n].forEach(x => { if (!pode(x)) m.add(x); }); });
    const aTF = p.aTF || [], aPCE = (p.a || []).filter(id => !aTF.includes(id));                                // arquivos: fotos/assinaturas do TF ou do PCE
    if (aTF.length && !pode('tf')) m.add('tf');
    if (aPCE.length && !pode('pce')) m.add('pce');
    if (!pode('antigo') && pode('pce') && ([...(p.g || []), ...(p.c || [])].some(Envio.ehAntigo)               // registro do papel guardado
      || (await arquivosPendentes(null, { ...PERM, antigo: 1 })).length > (await arquivosPendentes(null, PERM)).length)) m.add('antigo');   // ou PDF/foto dele ainda não enviado
    return [...m];
  }
  function avisoSemPermissao(mods) {
    const mod = mods.filter(m => m !== 'antigo'), txt = [];
    if (mod.length) txt.push(`Sem autorização para o módulo ${mod.map(m => MODULOS[m]).join(' / ')}`);
    if (mods.includes('antigo')) txt.push('Sem autorização para digitar registros antigos (do papel)');
    return txt.length ? `${txt.join('. ')} — fale com a gerência. Os registros continuam guardados neste aparelho.` : '';
  }

  async function chamar(corpo, limiteMs) {
    try { return await Envio.post(cfg(), corpo, limiteMs); }
    catch (e) {
      if (e.semPermissao) await guardarPermissoes(e.permissoes || { ...PERM, [e.semPermissao]: 0 });   // gerência tirou o módulo
      throw e;
    }
  }

  const { limpo, arquivosPendentes, pendentes } = Envio;

  /* Numeração de TF: o servidor guarda UMA sequência por barreira/ano. Aqui guardamos só o "último nº usado" conhecido,
     para propor um número provisório quando não há internet. */
  async function lembrarUltimos(ultimos) {
    if (!ultimos) return;
    const uv = (await Store.meta('ultimoVisto')) || {};
    Object.keys(ultimos).forEach(k => { uv[k] = Math.max(uv[k] || 0, ultimos[k] || 0); });
    await Store.setMeta('ultimoVisto', uv);
  }
  /* Termo de Colheita (PCE): uma sequência por unidade/ano, chave "UNIDADE|ano" (unidade em maiúsculas). */
  const unidadePce = u => String(u || '').trim().replace(/\s+/g, ' ').toUpperCase();
  async function lembrarUltimosPce(ultimos) {
    if (!ultimos) return;
    const uv = (await Store.meta('ultimoVistoPce')) || {};
    Object.keys(ultimos).forEach(k => { const kk = k.toUpperCase(); uv[kk] = Math.max(uv[kk] || 0, Number(ultimos[k]) || 0); });
    await Store.setMeta('ultimoVistoPce', uv);
  }
  const pceProximoNumero = (unidade, ano) => chamar({ action: 'pceProximoNumero', unidade: unidadePce(unidade), ano }, 9000);
  /** Emissão do Termo de Colheita: a planilha só grava se o número ainda estiver livre (como o TF). */
  const pceEmitir = (colheita, pessoa, propriedade) => chamar({ action: 'pceEmitir', colheita: limpo(colheita),
    pessoa: pessoa ? limpo(pessoa) : undefined, propriedade: propriedade ? limpo(propriedade) : undefined }, 20000);
  /** Cadastro do produtor (pessoa + propriedades) e nº de levantamentos/termos, consultados no servidor. */
  const pceConsultar = doc => chamar({ action: 'pceConsultar', doc }, 15000);

  /** Envia ao Drive até N fotos/assinaturas pendentes (PCE e TF), uma por requisição (envio.js). */
  const enviarPendentesArquivos = ids => Envio.enviarArquivos(ids, chamar);
  async function enviarArquivos() {
    if (rodando || !ativado() || !navigator.onLine || (!pode('pce') && !pode('tf'))) return 0;
    rodando = true;
    try { return await enviarPendentesArquivos(await arquivosPendentes(null, PERM)); }
    finally { rodando = false; await atualizarContagem(); }
  }

  /** Consulta rápida: último nº usado e próximo, direto na planilha. */
  const proximoNumero = (barreira, ano) => chamar({ action: 'tfProximoNumero', barreira, ano }, 9000);
  /** Emissão: a planilha só grava o TF se o número ainda estiver livre. */
  const emitirTF = (tf, pessoa, placa) => chamar({ action: 'tfEmitir', tf: limpo(tf), pessoa: limpo(pessoa), placa: placa ? limpo(placa) : undefined }, 20000);
  /**
   * Sinal "TF em preenchimento" para o painel (melhor esforço): sem internet ou sem ativação não envia nada; erro nunca aparece
   * para o fiscal e não entra em fila. Tempo limite curto (8 s). Os envios saem um de cada vez, na ordem (um "fim" nunca chega
   * antes de um "preenchendo" anterior ainda em trânsito).
   */
  let filaAndamento = Promise.resolve();
  function tfAndamento(dados) {
    if (!ativado() || localStorage.getItem('gdv.revogado') || !navigator.onLine || !pode('tf')) return filaAndamento;
    filaAndamento = filaAndamento.then(() => chamar({ action: 'tfAndamento', ...dados }, 8000)).catch(() => {});
    return filaAndamento;
  }
  /** Cadastro + histórico (reincidência) de um CPF/CNPJ e/ou placa, consultados no servidor. */
  const consultar = (doc, placa) => chamar({ action: 'tfConsultar', doc, placa });

  /* ---------- Índice de reincidência (consulta do TF sem internet) ----------
     Resumo de TODOS os TFs não cancelados (todas as barreiras) por hash do CPF/CNPJ e da placa: {h: {n, ap, re, au, li, ad, ult}}, sem dados
     pessoais em claro. Guardado na meta "tfIndice" {agora (hora do servidor), baixadoEm, itens}; atualizado (incremental) no máximo 1x a cada
     30 min, com internet e com o módulo TF liberado. Melhor esforço: falha não aparece para o fiscal. */
  const INDICE_INTERVALO_MS = 30 * 60 * 1000;
  let indiceTentado = 0;                                                     // falhou (ex.: servidor antigo): espera 5 min para tentar de novo
  async function atualizarIndice(forcar) {
    if (!pode('tf') || !navigator.onLine || !ativado()) return false;
    const atual = await Store.meta('tfIndice');
    if (!forcar && atual && Date.now() - (Number(atual.baixadoEm) || 0) < INDICE_INTERVALO_MS) return false;
    if (!forcar && Date.now() - indiceTentado < 5 * 60 * 1000) return false;
    indiceTentado = Date.now();
    const incr = !!(atual && atual.itens && atual.agora);
    const r = await chamar({ action: 'tfIndiceReincidencia', desde: incr ? atual.agora : 0 }, 30000);
    const itens = r.completo || !incr ? {} : { ...atual.itens };
    (r.itens || []).forEach(a => { if (!a || !a.h) return; if (Number(a.n) > 0) itens[a.h] = { n: a.n, ap: a.ap, re: a.re, au: a.au, li: a.li, ad: a.ad, ult: a.ult }; else delete itens[a.h]; });
    await Store.setMeta('tfIndice', { agora: Number(r.agora) || Date.now(), baixadoEm: Date.now(), itens });
    return true;
  }

  // campos do encerramento de um turno (iguais aos que a planilha protege contra reabertura)
  const CAMPOS_ENCERRAMENTO = ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim', 'encerradoPor', 'encerradoEm'];
  async function aplicar(store, linhas) {
    await Store.mesclar(store, linhas, (local, row) => {
      if (local && local.pendente && local.atualizadoEm > row.atualizadoEm) {               // edição local mais nova: fica a local…
        // …mas o turno encerrado na planilha (pela gerência, p.ex.) encerra aqui também; o resto da edição local continua pendente
        if (store === 'turnos' && Number(row.encerrado) === 1 && (Number(local.encerrado) !== 1 || row.encerradoPor)) {
          const m = { ...local }; CAMPOS_ENCERRAMENTO.forEach(c => { if (c in row) m[c] = row[c]; });
          return m;
        }
        return null;
      }
      return { ...row, pendente: 0 };
    });
  }

  /** O turno em andamento neste aparelho veio encerrado da planilha (pela gerência no painel, ou por outro motivo):
   *  deixa de ser o turno atual e avisa a tela (gdv-turno-encerrado). Os veículos pendentes continuam subindo normalmente. */
  async function conferirTurnoAtual(linhas) {
    const id = await Store.meta('turnoAtual');
    if (!id || !(linhas || []).some(t => t && t.id === id && Number(t.encerrado) === 1)) return;
    const t = await Store.obter('turnos', id);
    if (!t || Number(t.encerrado) !== 1) return;
    await Store.setMeta('turnoAtual', '');
    window.dispatchEvent(new CustomEvent('gdv-turno-encerrado', { detail: { id, numeroTF: t.numeroTF || '', fim: t.fim || '', encerradoPor: t.encerradoPor || '' } }));
  }

  /** O aparelho guarda só os turnos/veículos do próprio fiscal. Versões antigas do servidor mandavam os de todos;
   *  apaga do aparelho (nunca da planilha) os já enviados que são de outro fiscal. Pendentes e o turno atual ficam. */
  async function limparDeOutros() {
    const eu = nome(); if (!eu) return;
    const atual = await Store.meta('turnoAtual');
    const turnos = (await Store.todos('turnos')).filter(t => t.usuario && t.usuario !== eu && !t.pendente && t.id !== atual);
    const fora = new Set(turnos.map(t => t.id));
    const veic = (await Store.todos('veiculos')).filter(v => !v.pendente && fora.has(v.turnoId));   // só os veículos dos turnos removidos
    await Store.apagar('turnos', [...fora]);
    await Store.apagar('veiculos', veic.map(v => v.id));
  }

  /**
   * Sincroniza (envia pendentes + sinal do aparelho, recebe mudanças). Chamada durante outra sincronização: não é descartada —
   * roda de novo assim que a atual terminar (ex.: o encerramento salvo no meio de uma sincronização automática sai logo em seguida).
   * Devolve uma promessa que termina com tudo (inclusive a repetição); o resultado fica em Sync.estado().
   */
  let corrida = null, repetir = false;
  function sincronizar() {
    if (corrida) { repetir = true; return corrida; }
    corrida = (async () => {
      for (let i = 0; i < 3; i++) {
        repetir = false;
        await rodada();
        if (!repetir) break;
      }
    })().finally(() => { corrida = null; window.dispatchEvent(new Event('gdv-sync-fim')); });   // a tela atualiza o status do encerramento
    return corrida;
  }
  async function rodada() {
    const c = cfg();
    if (rodando || !c.url || !c.key) return;
    try { await Store.setMeta('standalone', instaladoAgora()); } catch (e) { /* sem banco */ }
    if (!navigator.onLine) { await atualizarContagem(); return; }
    rodando = true;
    emitir({ tipo: 'sync', msg: 'Sincronizando…' });
    try {
      for (let volta = 0; volta < 20; volta++) {
        const l = await Envio.enviarLote(chamar, PERM, 'app'), r = l.r;   // pendentes permitidos + sinal do aparelho → planilha; marca os enviados
        const mudou = await guardarPermissoes(r.permissoes);
        await aplicar('turnos', r.turnos);
        await conferirTurnoAtual(r.turnos);
        await aplicar('veiculos', r.veiculos);
        await aplicar('tfs', r.tfs || []);
        await aplicar('levantamentos', r.levantamentos || []);
        await aplicar('colheitas', r.colheitas || []);
        if (r.barreiras) await Store.setMeta('barreiras', r.barreiras);
        await lembrarUltimos(r.ultimos);
        await lembrarUltimosPce(r.ultimosPce);
        await Store.setMeta('lastSync', r.agora);
        await Envio.guardarErro(null);                                     // o último erro já foi junto no sinal deste envio
        if (mudou && !l.recusouAlgo) continue;                               // módulo liberado agora: manda o que estava guardado
        if (!l.resta) break;
      }
      let erroArq = '';
      if (pode('pce') || pode('tf')) {
        try { await enviarPendentesArquivos(await arquivosPendentes(null, PERM)); }   // falha numa foto não derruba o sync principal
        catch (e) { erroArq = e.message || String(e); }
      }
      await limparDeOutros();
      try { await atualizarIndice(); } catch (e) { /* índice de reincidência: melhor esforço (tenta de novo na próxima sincronização) */ }
      await Store.setMeta('ultimaSync', Date.now());
      marcarRevogado(false);
      const resta = await pendentes(), semPerm = await bloqueadosComPendentes(resta);
      const aviso = avisoSemPermissao(semPerm);
      emitir({ tipo: 'ok', msg: erroArq ? 'Sincronizado (fotos/assinaturas: ' + erroArq + ')' : 'Sincronizado', pend: resta.total, erroArquivos: erroArq,
        semPermissao: semPerm, aviso });
      window.dispatchEvent(new Event('gdv-dados'));
    } catch (e) {
      const recusada = /revogado|inv[aá]lido/i.test(e.message);
      if (!recusada) {
        await Envio.guardarErro(e);                                          // vai no próximo sinal; a tela mostra o motivo
        await Envio.avisarFalha(chamar, e, 'app');                           // erro do servidor: "ping" leve só com o sinal (uma vez)
      }
      const p = await pendentes();
      emitir({ tipo: 'erro', msg: Envio.motivoErro(e), pend: p.total });
      if (recusada && !localStorage.getItem('gdv.revogado')) {             // pede novo código (uma vez)
        marcarRevogado(true); window.dispatchEvent(new Event('gdv-dados'));
      } else if (p.total) agendarEnvio();                                     // sem internet/servidor: o Android tenta de novo sozinho
    } finally {
      rodando = false;
      prepararSaida();
    }
  }
  const instaladoAgora = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; } catch (e) { return false; } };

  /* ---------- Saída do app com encerramento ainda não enviado ----------
     Fiscal encerra e fecha o app logo em seguida (comum no iPhone, que não envia em segundo plano): ao esconder/fechar a página, um
     sendBeacon leva o turno encerrado (e os veículos dele) à planilha sem esperar resposta. O corpo é montado antes (a saída não
     espera o banco); os registros continuam pendentes no aparelho e sobem de novo na próxima sincronização (a planilha não duplica). */
  let corpoSaida = null;
  async function prepararSaida() {
    try {
      corpoSaida = null;
      const c = cfg();
      if (!c.url || !c.key || localStorage.getItem('gdv.revogado') || !pode('veiculos')) return;
      const p = await pendentes(), enc = p.t.filter(t => Number(t.encerrado) === 1);
      if (!enc.length) return;
      const ids = new Set(enc.map(t => t.id));
      const corpo = { action: 'sync', since: 9e15, key: c.key, turnos: p.t.slice(0, 50).map(limpo),
        veiculos: p.v.filter(v => ids.has(v.turnoId)).slice(0, 300).map(limpo), aparelho: await Envio.sinal(p, 'app') };
      let txt = JSON.stringify(corpo);
      if (txt.length > 60000) { corpo.veiculos = []; txt = JSON.stringify(corpo); }
      if (txt.length <= 60000) corpoSaida = { url: c.url, txt };
    } catch (e) { corpoSaida = null; }
  }
  function enviarNaSaida() {
    if (!corpoSaida || !navigator.onLine || rodando || typeof navigator.sendBeacon !== 'function') return false;
    try { return navigator.sendBeacon(corpoSaida.url, new Blob([corpoSaida.txt], { type: 'text/plain;charset=utf-8' })); } catch (e) { return false; }
  }

  async function atualizarContagem() {
    const p = await pendentes(), semPerm = await bloqueadosComPendentes(p);
    prepararSaida();
    if (p.total) agendarEnvio();
    emitir({ tipo: navigator.onLine ? 'idle' : 'offline', pend: p.total, msg: '', semPermissao: semPerm, aviso: avisoSemPermissao(semPerm) });
  }

  async function testar() { return chamar({ action: 'ping' }); }
  /** Turnos encerrados neste aparelho que ainda não chegaram à planilha (mais recente primeiro). */
  async function encerramentosPendentes() {
    return (await Store.todos('turnos')).filter(t => t.pendente && Number(t.encerrado) === 1).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  }

  function iniciar() {
    // o service worker enviou pendentes em segundo plano: atualiza o selo e a tela
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
      if (!ev.data || ev.data.tipo !== 'gdv-enviado' || rodando) return;
      importarRevogacao().then(atualizarContagem).then(() => window.dispatchEvent(new Event('gdv-dados'))).catch(() => {});
    });
    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', atualizarContagem);
    // automático: a cada 20 s com turno aberto (o painel acompanha a barreira quase ao vivo); sem turno, a cada minuto
    let ultimaAuto = 0;
    setInterval(async () => {
      const comTurno = !!(await Store.meta('turnoAtual').catch(() => ''));
      if (comTurno || Date.now() - ultimaAuto >= 59000) { ultimaAuto = Date.now(); sincronizar(); }
    }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); else enviarNaSaida(); });
    window.addEventListener('pagehide', enviarNaSaida);
    sincronizar();
  }

  return { prepararFundo, envioAutomatico, encerramentosPendentes, emAndamento: () => rodando || !!corrida, prepararSaida, agendarEnvio, iniciar, sincronizar, testar, atualizarContagem, ativado, nome, ativar, desativar, consultar, atualizarIndice, proximoNumero, emitirTF, lembrarUltimos, tfAndamento,
    permissoes, pode, carregarPermissoes, bloqueadosComPendentes, avisoSemPermissao, MODULOS,
    pceProximoNumero, pceEmitir, pceConsultar, lembrarUltimosPce, enviarArquivos, arquivosPendentes, unidadePce, onEstado: f => listeners.push(f), estado: () => estado, cfg };
})();
