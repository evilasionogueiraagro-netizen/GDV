// Sincronização com a planilha (Apps Script). Envia o que está pendente e recebe o que mudou.
// O núcleo do envio (lote, marcar enviados, arquivos) fica em envio.js, compartilhado com o service worker (envio em segundo plano).
const Sync = (() => {
  let rodando = false;
  const listeners = [];
  let estado = { tipo: 'idle', msg: '' };

  const cfg = () => ({
    url: localStorage.getItem('gdv.url') || CONFIG.sync.url || '',
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
    Object.keys(MODULO_DO_STORE).forEach(n => { if ((p[n] || []).length && !storePermitido(n)) MODULO_DO_STORE[n].forEach(x => { if (!pode(x)) m.add(x); }); });
    if (!pode('antigo') && pode('pce') && ([...(p.g || []), ...(p.c || [])].some(Envio.ehAntigo)               // registro do papel guardado
      || (p.a || []).length > (await arquivosPendentes(null, PERM)).length)) m.add('antigo');                   // ou PDF/foto dele ainda não enviado
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

  /** Envia ao Drive até N fotos/assinaturas pendentes, uma por requisição (envio.js). */
  const enviarPendentesArquivos = ids => Envio.enviarArquivos(ids, chamar);
  async function enviarArquivos() {
    if (rodando || !ativado() || !navigator.onLine || !pode('pce')) return 0;
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

  async function sincronizar() {
    const c = cfg();
    if (rodando || !c.url || !c.key) return;
    if (!navigator.onLine) { await atualizarContagem(); return; }
    rodando = true;
    emitir({ tipo: 'sync', msg: 'Sincronizando…' });
    try {
      for (let volta = 0; volta < 20; volta++) {
        const l = await Envio.enviarLote(chamar, PERM), r = l.r;           // pendentes permitidos → planilha; marca os enviados
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
        if (mudou && !l.recusouAlgo) continue;                               // módulo liberado agora: manda o que estava guardado
        if (!l.resta) break;
      }
      let erroArq = '';
      if (pode('pce')) {
        try { await enviarPendentesArquivos(await arquivosPendentes(null, PERM)); }   // falha numa foto não derruba o sync principal
        catch (e) { erroArq = e.message || String(e); }
      }
      await limparDeOutros();
      await Store.setMeta('ultimaSync', Date.now());
      marcarRevogado(false);
      const resta = await pendentes(), semPerm = await bloqueadosComPendentes(resta);
      const aviso = avisoSemPermissao(semPerm);
      emitir({ tipo: 'ok', msg: erroArq ? 'Sincronizado (fotos/assinaturas: ' + erroArq + ')' : 'Sincronizado', pend: resta.total, erroArquivos: erroArq,
        semPermissao: semPerm, aviso });
      window.dispatchEvent(new Event('gdv-dados'));
    } catch (e) {
      const p = await pendentes();
      emitir({ tipo: 'erro', msg: e.message, pend: p.total });
      if (/revogado|inv[aá]lido/i.test(e.message) && !localStorage.getItem('gdv.revogado')) {   // pede novo código (uma vez)
        marcarRevogado(true); window.dispatchEvent(new Event('gdv-dados'));
      } else if (p.total) agendarEnvio();                                     // sem internet/servidor: o Android tenta de novo sozinho
    } finally {
      rodando = false;
    }
  }

  async function atualizarContagem() {
    const p = await pendentes(), semPerm = await bloqueadosComPendentes(p);
    if (p.total) agendarEnvio();
    emitir({ tipo: navigator.onLine ? 'idle' : 'offline', pend: p.total, msg: '', semPermissao: semPerm, aviso: avisoSemPermissao(semPerm) });
  }

  async function testar() { return chamar({ action: 'ping' }); }

  function iniciar() {
    // o service worker enviou pendentes em segundo plano: atualiza o selo e a tela
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
      if (!ev.data || ev.data.tipo !== 'gdv-enviado' || rodando) return;
      importarRevogacao().then(atualizarContagem).then(() => window.dispatchEvent(new Event('gdv-dados'))).catch(() => {});
    });
    window.addEventListener('online', sincronizar);
    window.addEventListener('offline', atualizarContagem);
    setInterval(sincronizar, 60000);                       // automático, a cada minuto
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    sincronizar();
  }

  return { prepararFundo, envioAutomatico, agendarEnvio, iniciar, sincronizar, testar, atualizarContagem, ativado, nome, ativar, desativar, consultar, proximoNumero, emitirTF, lembrarUltimos, tfAndamento,
    permissoes, pode, carregarPermissoes, bloqueadosComPendentes, avisoSemPermissao, MODULOS,
    pceProximoNumero, pceEmitir, pceConsultar, lembrarUltimosPce, enviarArquivos, arquivosPendentes, unidadePce, onEstado: f => listeners.push(f), estado: () => estado, cfg };
})();
