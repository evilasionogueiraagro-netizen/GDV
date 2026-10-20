// PCE — documentos do Cadastro de imóvel (monilíase), do Cadastro de citros, do Termo de Fiscalização do PCE (o de citros tem modelo próprio)
// e do Relatório de atividades. Usado em três lugares: dentro dos modelos (pce-cadastro-moniliase.html, pce-cadastro-citros.html, pce-termo.html,
// pce-termo-citros.html, pce-relatorio.html), no app de campo
// (docs.js abre o modelo num iframe e chama PCEDocs.montar) e no painel (relatório). Sem dependências: só DOM e dados.
//
// Os modelos são HTML declarativo: [data-c="campo"] recebe o texto; [data-m="campo=valor"] vira "(X)" ou "( )" (cadastro, como no papel);
// [data-x="campo=valor"] ganha a classe "on" (caixa marcada do termo); [data-se="campo"] some quando o campo está vazio.
const PCEDocs = (() => {
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { const r = JSON.parse(v); return r == null ? pad : r; } catch (e) { return pad; } };
  const digitos = v => String(v || '').replace(/\D/g, '');
  const fmtDoc = v => { const d = digitos(v); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : String(v || ''); };
  const dataBR = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
  const pad2 = n => String(n).padStart(2, '0');
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const HOSP = [['cupuacu', 'Cupuaçu'], ['cacau', 'Cacau'], ['herrania', 'Herrania'], ['cacaui', 'Cacauí'], ['cupui', 'Cupuí'], ['macambo', 'Macambo']];
  const nomeHosp = k => (HOSP.find(h => h[0] === k) || [k, k])[1];
  const coordTxt = (lat, lon) => {
    const la = parseFloat(lat), lo = parseFloat(lon);
    return isNaN(la) || isNaN(lo) ? '' : `${String(la.toFixed(5)).replace('.', ',')} / ${String(lo.toFixed(5)).replace('.', ',')}`;
  };
  const totalPlantas = d => HOSP.reduce((s, [k]) => s + num(((d || {}).plantas || {})[k]), 0);
  const listaE = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || '');

  /* ---------- preenchimento genérico ---------- */
  function preencher(raiz, v) {
    const val = k => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), v);
    const tem = (k, alvo) => { const x = val(k); return Array.isArray(x) ? x.map(String).includes(alvo) : String(x == null ? '' : x) === alvo; };
    raiz.querySelectorAll('[data-c]').forEach(e => { const x = val(e.getAttribute('data-c')); e.textContent = x == null ? '' : String(x); });
    raiz.querySelectorAll('[data-m]').forEach(e => { const [k, a] = e.getAttribute('data-m').split('='); e.textContent = tem(k, a) ? '(X)' : '(  )'; e.classList.toggle('on', tem(k, a)); });
    raiz.querySelectorAll('[data-x]').forEach(e => { const [k, a] = e.getAttribute('data-x').split('='); e.classList.toggle('on', tem(k, a)); });
    raiz.querySelectorAll('[data-se]').forEach(e => { const x = val(e.getAttribute('data-se')); if (x == null || x === '' || (Array.isArray(x) && !x.length)) e.remove(); });
  }
  /** Imagem da assinatura (dataURL guardada no aparelho) sobre a linha correspondente. */
  function assinaturas(raiz, mapa, arquivos) {
    raiz.querySelectorAll('[data-ass]').forEach(b => {
      const a = (arquivos || {})[(mapa || {})[b.getAttribute('data-ass')]], area = b.querySelector('.ass-img');
      if (!area) return; area.textContent = '';
      if (a && typeof a.dados === 'string' && /^data:image\/(png|jpeg);/.test(a.dados)) { const im = raiz.ownerDocument.createElement('img'); im.src = a.dados; im.alt = 'Assinatura'; area.append(im); }
    });
  }

  /* ---------- valores de cada documento ---------- */
  function valoresTermo(t) {
    const tst = lerJSON(t.testemunhas, []), T = i => tst[i] || {};
    const ident = [t.servidor, t.cargo, t.matricula && 'Mat. ' + t.matricula, t.lotacao].filter(Boolean).join(' · ');
    return { ...t, cpf: digitos(t.doc).length === 11 ? fmtDoc(t.doc) : (digitos(t.doc).length === 14 ? '' : t.doc || ''),
      cnpjTxt: fmtDoc(t.cnpj || (digitos(t.doc).length === 14 ? t.doc : '')), dataTxt: dataBR(t.data), coordTxt: coordTxt(t.lat, t.lon),
      pragas: lerJSON(t.pragas, []), tipoLocal: lerJSON(t.tipoLocal, []), acoes: lerJSON(t.acoes, []),
      t1nome: T(0).nome || '', t1doc: T(0).doc || '', t2nome: T(1).nome || '', t2doc: T(1).doc || '', servidorIdent: ident,
      extras: [`plantas inspecionadas: ${num(t.plantasInspecionadas)}`,
        `amostra coletada: ${t.amostra === 'sim' ? 'sim' : 'não'}`, `sintomas: ${t.sintomas === 'sim' ? 'sim' : 'não'}`].join(' · '),
      cancelado: Number(t.cancelado) === 1 ? 'TERMO CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : '') : '' };
  }
  function valoresCadastro(c) {
    const d = lerJSON(c.dados, {}), pl = d.plantas || {}, f = d.fito || {};
    const plantas = {}; HOSP.forEach(([k]) => { plantas[k] = pl[k] === '' || pl[k] == null ? '' : String(pl[k]); });
    const total = totalPlantas(d);
    const fito = {}; ['vassoura', 'podridao', 'lazio'].forEach(k => { fito[k] = { tem: '', tempo: '', controle: '', qual: '', ...(f[k] || {}) }; });
    return { ...c, d: { ...d, fito, plantas, total: total ? String(total) : '', producaoTxt: [d.producao, d.producao && d.producaoUnidade].filter(Boolean).join(' '),
      idadePlantioTxt: d.idadePlantio ? d.idadePlantio + ' anos' : '', idadeProducaoTxt: d.idadeProducao ? d.idadeProducao + ' anos' : '',
      sintomaLatTxt: d.sintomaLat === '' || d.sintomaLat == null ? '' : String(d.sintomaLat).replace('.', ','), sintomaLonTxt: d.sintomaLon === '' || d.sintomaLon == null ? '' : String(d.sintomaLon).replace('.', ','),
      suspeitos: Array.isArray(d.suspeitos) ? d.suspeitos : [] },
      cpf: digitos(c.doc).length === 14 ? '' : fmtDoc(c.doc), cnpjTxt: fmtDoc(c.cnpj || (digitos(c.doc).length === 14 ? c.doc : '')),
      latTxt: c.lat === '' || c.lat == null ? '' : String(c.lat).replace('.', ','), lonTxt: c.lon === '' || c.lon == null ? '' : String(c.lon).replace('.', ','),
      dataTxt: dataBR(c.data), servCargo: c.cargo || '', servMat: c.matricula ? 'Matrícula: ' + c.matricula : '', servLot: c.lotacao ? 'Lotação: ' + c.lotacao : '' };
  }

  /* ---------- Citros: Cadastro de imóveis de produção comercial de cítricos e Termo de Fiscalização de citros ---------- */
  // rótulos da tabela "Cultura do citros" (os códigos são os de CONFIG.PCE.citros.atividades; o modelo roda sem o config do app)
  const ATIV_CITROS = { viveiro_mudas: 'Viveiro – produção de mudas', viveiro_semorigem: 'Viveiro – material de propagação sem origem genética comprovada',
    viveiro_portaenxerto: 'Viveiro – porta-enxerto', viveiro_clonal: 'Viveiro – jardins clonais e borbulheiras', frutos: 'Produção comercial de frutos', outros: 'Outros' };
  const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = x => (Array.isArray(x) ? x : []);
  const numTxt = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
  function valoresCadastroCitros(c) {
    const d = lerJSON(c.dados, {}), dl = obj(d.delimitacao), dt = obj(d.deteccao);
    const det = {}; ['cancro', 'hlb', 'acaro'].forEach(k => { const x = obj(dt[k]); det[k] = { tem: x.tem || '', tempo: x.tem === 'sim' ? x.tempo || '' : '' }; });
    const pp = obj(dl.pintapreta);
    const culturas = arr(d.culturas).filter(x => x && typeof x === 'object').map(x => ({ atividade: x.atividade === 'outros' && d.atividadeOutros ? d.atividadeOutros : ATIV_CITROS[x.atividade] || '',
      cultivar: x.cultivar || '', area: numTxt(x.area), idade: numTxt(x.idade), plantas: numTxt(x.plantas), producao: numTxt(x.producao) }));
    return { ...c, d: { ...d, atividades: arr(d.atividades), formasEntrega: arr(d.formasEntrega), compradores: arr(d.compradores), materiais: arr(d.materiais),
      deteccao: det, delimitacao: { pintapreta: { tem: pp.tem || '', tempo: pp.tempo || '', controle: pp.controle || '', qual: pp.qual || '' } }, rt: { nome: '', conselho: '', ...obj(d.rt) },
      compradorOutrosTxt: arr(d.compradores).includes('outros') && d.compradorOutros ? '(' + d.compradorOutros + ')' : '' }, culturas,
      cpf: digitos(c.doc).length === 14 ? '' : fmtDoc(c.doc), cnpjTxt: fmtDoc(c.cnpj || (digitos(c.doc).length === 14 ? c.doc : '')),
      latTxt: c.lat === '' || c.lat == null ? '' : String(c.lat).replace('.', ','), lonTxt: c.lon === '' || c.lon == null ? '' : String(c.lon).replace('.', ','),
      dataTxt: dataBR(c.data), servCargo: c.cargo || '', servMat: c.matricula ? 'Matrícula: ' + c.matricula : '', servLot: c.lotacao ? 'Lotação: ' + c.lotacao : '' };
  }
  function valoresTermoCitros(t) {
    const v = valoresTermo(t), h = String(t.hora || '').slice(0, 5).split(':');
    return { ...v, localAcao: String(lerJSON(t.tipoLocal, [])[0] || ''), horaH: h[0] || '', horaM: h[1] || '', coordLat: t.lat === '' || t.lat == null ? '' : String(t.lat).replace('.', ','),
      coordLon: t.lon === '' || t.lon == null ? '' : String(t.lon).replace('.', ',') };
  }
  /** Linhas da tabela "Cultura do citros" (no mínimo 4, como no papel). */
  function linhasCulturas(pg, culturas) {
    const tb = pg.querySelector('[data-lista=culturasCitros]'); if (!tb) return;
    const doc = pg.ownerDocument, l = culturas.slice();
    while (l.length < 4) l.push(null);
    tb.textContent = '';
    l.forEach(c => { const tr = doc.createElement('tr'); tr.className = c ? 'cheia' : 'vazia';
      ['atividade', 'cultivar', 'area', 'idade', 'plantas', 'producao'].forEach(k => { const td = doc.createElement('td'); td.textContent = c ? c[k] : ''; tr.append(td); }); tb.append(tr); });
  }

  /* ---------- Relatório de atividades ---------- */
  /**
   * Agregados do relatório a partir dos Termos de Fiscalização do PCE (e dos cadastros ligados).
   * f = {de, ate, municipio, praga, servidores:[nomes], folders (nº digitado na geração do relatório)}. Termos cancelados/excluídos ficam de fora.
   */
  function calcularRelatorio(termos, cadastros, f) {
    f = f || {};
    const cadPorId = new Map((cadastros || []).filter(c => c && !Number(c.excluido)).map(c => [c.id, c]));
    const servs = (f.servidores || []).map(norm).filter(Boolean);
    const T = (termos || []).filter(t => t && !Number(t.excluido) && !Number(t.cancelado) && (!f.de || t.data >= f.de) && (!f.ate || t.data <= f.ate)
      && (!f.municipio || norm(t.municipio) === norm(f.municipio)) && (!f.praga || lerJSON(t.pragas, []).some(p => norm(p) === norm(f.praga)))
      && (!servs.length || servs.includes(norm(t.servidor))))
      .sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.numero) - Number(b.numero)) || String(a.data + a.hora).localeCompare(String(b.data + b.hora)));
    const ligados = [...new Set(T.map(t => t.cadastroId).filter(Boolean))].map(id => cadPorId.get(id)).filter(Boolean)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.numero) - Number(b.numero));
    const hosp = new Set();
    T.forEach(t => { lerJSON(t.hospedeiros, []).forEach(h => hosp.add(h)); const c = cadPorId.get(t.cadastroId); if (c) HOSP.forEach(([k, n]) => { if (num((lerJSON(c.dados, {}).plantas || {})[k]) > 0) hosp.add(n); }); });
    const hospedeiros = HOSP.map(h => h[1]).filter(n => hosp.has(n));
    const plantas = T.reduce((s, t) => s + num(t.plantasInspecionadas), 0), folders = Math.max(0, Math.round(num(f.folders)));
    // Educação Sanitária: termos com a ação marcada + folders/flyers digitados no relatório (não são anotados por visita)
    const educacao = T.filter(t => lerJSON(t.acoes, []).some(a => norm(a) === 'EDUCACAO SANITARIA')).length;
    const edu = [educacao ? `${educacao} ação(ões)` : '', folders ? `distribuição orientada de ${folders.toLocaleString('pt-BR')} folders e flyers` : ''].filter(Boolean).join('; ');
    const amostras = T.filter(t => t.amostra === 'sim').length, sintomas = T.filter(t => t.sintomas === 'sim').length;
    const muns = [...new Set(T.map(t => String(t.municipio || '').trim()).filter(Boolean))];
    const servidores = []; const vistos = new Set();
    T.forEach(t => { const k = norm(t.servidor); if (k && !vistos.has(k)) { vistos.add(k); servidores.push({ nome: t.servidor, funcao: t.cargo || '' }); } });
    const hospTxt = hospedeiros.length ? (hospedeiros.length === 1 ? hospedeiros[0] : hospedeiros.slice(0, -1).join(', ') + ' ou ' + hospedeiros[hospedeiros.length - 1].toLowerCase()) : '';
    return { termos: T, cadastros: ligados, nTermos: T.length, plantas, folders, educacao, amostras, sintomas, hospedeiros, municipios: muns, servidores,
      textos: {
        hospedeiros: hospTxt || '—',
        plantas: `${plantas.toLocaleString('pt-BR')} plantas`,
        sintomas: sintomas ? `Houve presença de sintomas (${sintomas} ${sintomas === 1 ? 'termo' : 'termos'})` : 'Não houve presença de sintomas',
        coleta: amostras ? `Houve coleta de amostra (${amostras} ${amostras === 1 ? 'termo' : 'termos'})` : 'Não houve coleta de amostra',
        educacao: edu ? edu[0].toUpperCase() + edu.slice(1) : 'não realizada',
        termos: `${pad2(T.length)} ${T.length === 1 ? 'termo' : 'termos'}.`
      } };
  }
  function valoresRelatorio(R) {
    const c = R.calc || { textos: {} };
    return { ...R, periodo: R.de || R.ate ? `${dataBR(R.de)} a ${dataBR(R.ate)}.` : '', intro: `Durante os Levantamentos Fitossanitário da praga ${R.praga || 'Monilíase'}, realizou-se:`,
      t: c.textos, obsTxt: R.obs || '' };
  }

  /* ---------- montagem no documento (dentro do iframe do modelo) ---------- */
  const TEMPLATES = { termo: 'pce-termo.html', cadastro: 'pce-cadastro-moniliase.html', relatorio: 'pce-relatorio.html',
    termoCitros: 'pce-termo-citros.html', cadastroCitros: 'pce-cadastro-citros.html' };
  /** Modelo de um termo/cadastro conforme o programa (citros tem modelo próprio). */
  const tipoDoRegistro = (tipo, reg) => (reg && reg.programa === 'citros' && (tipo === 'termo' || tipo === 'cadastro') ? tipo + 'Citros' : tipo);
  const VALORES = { termo: valoresTermo, cadastro: valoresCadastro, termoCitros: valoresTermoCitros, cadastroCitros: valoresCadastroCitros, relatorio: valoresRelatorio };
  const cacheModelo = {};
  /** Página modelo (.a4) de outro arquivo de documentos (para anexar termos/cadastros ao relatório); o <style> dele vem junto, uma vez. */
  async function modeloDe(doc, tipo) {
    if (!cacheModelo[tipo]) cacheModelo[tipo] = fetch(new URL(TEMPLATES[tipo], doc.baseURI).href).then(r => { if (!r.ok) throw new Error('Modelo indisponível: ' + TEMPLATES[tipo]); return r.text(); })
      .then(txt => new DOMParser().parseFromString(txt, 'text/html'));
    const outro = await cacheModelo[tipo];
    const pg = outro.querySelector('.a4');
    if (!doc.querySelector(`style[data-modelo="${tipo}"]`)) outro.querySelectorAll('style').forEach(st => { const n = doc.createElement('style'); n.setAttribute('data-modelo', tipo); n.textContent = st.textContent; doc.head.append(n); });
    return doc.importNode(pg, true);
  }
  function preencherPagina(pg, tipo, dados, arquivos) {
    const r = VALORES[tipo](dados);
    preencher(pg, r);
    if (tipo === 'cadastroCitros') linhasCulturas(pg, r.culturas);
    if (tipo === 'relatorio') {
      const ul = pg.querySelector('[data-lista=servidores]');
      if (ul) { ul.textContent = ''; (dados.servidores || []).forEach(s => { const li = pg.ownerDocument.createElement('div'); li.textContent = [s.nome, s.funcao].filter(Boolean).join(' - '); ul.append(li); }); }
    } else assinaturas(pg, lerJSON(dados.assinaturas, {}), arquivos);
    const cf = pg.querySelector('.cancelado-faixa'); if (cf && !r.cancelado) cf.remove();
    return pg;
  }
  /**
   * Preenche o documento aberto (doc = documento do modelo). tipo: termo | cadastro | termoCitros | cadastroCitros | relatorio.
   * opcoes.arquivos = {id: arquivo} (assinaturas); no relatório, opcoes.anexos = {termos:[...], cadastros:[...]} vira páginas depois do relatório
   * (termo/cadastro de citros com o modelo de citros); opcoes.extras = [{tipo, dados, arquivos, antes}] = outras páginas antes/depois (citros:
   * Cadastro de citros + Termo de Fiscalização da visita no mesmo PDF).
   */
  async function montar(doc, tipo, dados, opcoes) {
    opcoes = opcoes || {};
    const pg = doc.querySelector('.a4');
    preencherPagina(pg, tipo, dados, opcoes.arquivos);
    let ult = pg, prim = pg;
    if (tipo === 'relatorio' && opcoes.anexos) {
      for (const [t0, lista] of [['termo', opcoes.anexos.termos || []], ['cadastro', opcoes.anexos.cadastros || []]]) {
        for (const reg of lista) { const t = tipoDoRegistro(t0, reg), n = preencherPagina(await modeloDe(doc, t), t, reg, (opcoes.arquivosPorReg || {})[reg.id]); n.classList.add('anexo'); ult.after(n); ult = n; }
      }
    }
    for (const x of opcoes.extras || []) {
      const n = preencherPagina(await modeloDe(doc, x.tipo), x.tipo, x.dados, x.arquivos);
      if (x.antes) { prim.before(n); prim = n; } else { ult.after(n); ult = n; }
    }
    await Promise.all([...doc.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    return doc.querySelectorAll('.a4').length;
  }

  return { montar, preencher, calcularRelatorio, valoresTermo, valoresCadastro, valoresTermoCitros, valoresCadastroCitros, tipoDoRegistro, totalPlantas, coordTxt, fmtDoc, dataBR, HOSP, nomeHosp, norm, listaE, lerJSON };
})();
if (typeof window !== 'undefined') window.PCEDocs = PCEDocs;
