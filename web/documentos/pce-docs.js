// PCE: documentos da Ficha oficial (um só modelo para os 6 formulários de papel: citros, banana, cacau e cupuaçu, mandioca, soja e propriedade),
// do Termo de Fiscalização (um só modelo, todos os programas) e do Relatório de atividades. Usado em três lugares: dentro dos modelos
// (pce-ficha.html, pce-termo.html, pce-relatorio.html), no app de campo (docs.js abre o modelo num iframe e chama PCEDocs.montar) e no painel (relatório).
// Sem dependências: só DOM e dados. A Ficha é guiada por CONFIG.PCE.fichas (js/config.js); os modelos que carregam este script carregam o config antes.
//
// API (o app usa Docs.fichaPce / Docs.termoPce, em js/docs.js):
//   PCEDocs.valoresFicha(modelo, entrada)   o que a ficha mostra (produtor, propriedade, frutos, dados do modelo, visita mais recente)
//   PCEDocs.montar(doc, 'ficha', {modelo, ...entrada}, {arquivos})   desenha a ficha no documento do modelo
//   PCEDocs.montar(doc, 'termo', termo, {arquivos})                  preenche o Termo (novo, antigo e de citros antigo)
//   PCEDocs.entradaDeCadastro(registro)     adaptador: CadastrosPCE antigo (qualquer modelo) -> entrada da ficha, sem alterar o dado
// Tipos antigos continuam aceitos em montar: cadastro, cadastroCitros, cadastroBanana, cadastroMandioca, cadastroSoja, cadastroPropriedade,
// termoCitros (mesmos modelos novos, pelos adaptadores).
//
// Os modelos de Termo e de Relatório são HTML declarativo: [data-c="campo"] recebe o texto; [data-m="campo=valor"] vira "(X)" ou "( )";
// [data-x="campo=valor"] ganha a classe "on" (caixa marcada); [data-se="campo"] some quando o campo está vazio.
const PCEDocs = (() => {
  const lerJSON = (v, pad) => { if (v && typeof v === 'object') return v; try { const r = JSON.parse(v); return r == null ? pad : r; } catch (e) { return pad; } };
  const digitos = v => String(v || '').replace(/\D/g, '');
  const fmtDoc = v => { const d = digitos(v); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : String(v || ''); };
  const dataBR = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
  const pad2 = n => String(n).padStart(2, '0');
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  /** "Laranja" + "Pera" = "Laranja Pera"; cultivar que já começa pelo nome da cultura ("Laranja Pera") não repete a cultura. */
  const culturaCultivar = (cultura, cultivar) => (cultivar && cultura && (norm(cultivar) + ' ').startsWith(norm(cultura) + ' ') ? String(cultivar) : [cultura, cultivar].filter(Boolean).join(' '));
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
  // Quem não assina (mapa[papel + 'Doc']): a foto da pessoa com o documento de identificação vai no lugar da assinatura, com o aviso na linha
  // (mesma regra de montarAssinaturas em js/docs.js).
  function assinaturas(raiz, mapa, arquivos) {
    const imagem = id => { const a = (arquivos || {})[id]; return a && typeof a.dados === 'string' && /^data:image\/(png|jpeg);/.test(a.dados) ? a.dados : ''; };
    raiz.querySelectorAll('[data-ass]').forEach(b => {
      const papel = b.getAttribute('data-ass'), area = b.querySelector('.ass-img'), docId = (mapa || {})[papel + 'Doc'];
      if (!area) return; area.textContent = '';
      const src = imagem(docId || (mapa || {})[papel]);
      if (docId) {
        area.classList.add('doc');
        const linha = b.querySelector('.linha'); if (linha) linha.textContent = 'Não assina: identificado(a) por foto com documento de identificação oficial';
        if (!src) { area.textContent = '(foto arquivada no Drive)'; return; }
      }
      if (src) { const im = raiz.ownerDocument.createElement('img'); im.src = src; im.alt = docId ? 'Foto com documento de identificação' : 'Assinatura'; area.append(im); }
    });
  }
  const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = x => (Array.isArray(x) ? x : []);
  const numTxt = v => (v === '' || v == null ? '' : String(v).replace('.', ','));

  /* ---------- Termo de Fiscalização (um só modelo: pce-termo.html) ---------- */
  const LOCAIS_TERMO = ['Evento Agropecuário', 'Unidade de Produção (UP)', 'Unidade de Consolidação (UC)'];   // caixas do modelo (CONFIG.PCE.termo.locais)
  /**
   * Valores do Termo. Serve ao Termo novo e aos já gravados (sem alterar o dado): o Termo de citros antigo guardava o local especificado em
   * tipoLocal[0] e não marcava a ação (o papel dizia "ao realizar fiscalização"); aqui o local vai para a linha "no(a) ___" e a ação para a caixa.
   */
  function valoresTermo(t) {
    const tst = lerJSON(t.testemunhas, []), T = i => tst[i] || {};
    const ident = [t.servidor, t.cargo, t.matricula && 'Mat. ' + t.matricula, t.lotacao].filter(Boolean).join(' · ');
    const local = arr(lerJSON(t.tipoLocal, [])).map(String), citros = t.programa === 'citros';
    const especifico = local.find(x => !LOCAIS_TERMO.some(s => norm(s) === norm(x))) || '';   // o local escrito pelo fiscal (o que não é uma das caixas)
    const acoes = arr(lerJSON(t.acoes, [])), c = Number(t.cancelado) === 1;
    return { ...t, cpf: digitos(t.doc).length === 11 ? fmtDoc(t.doc) : (digitos(t.doc).length === 14 ? '' : t.doc || ''),
      cnpjTxt: fmtDoc(t.cnpj || (digitos(t.doc).length === 14 ? t.doc : '')), dataTxt: dataBR(t.data), coordTxt: coordTxt(t.lat, t.lon),
      pragas: lerJSON(t.pragas, []), tipoLocal: local, acoes: citros && !acoes.length ? ['Fiscalização'] : acoes, localEspecificado: especifico, hora: String(t.hora || '').slice(0, 5),
      t1nome: T(0).nome || '', t1doc: T(0).doc || '', t2nome: T(1).nome || '', t2doc: T(1).doc || '', servidorIdent: ident,
      programaTxt: String(t.programaVisita || '').trim() || arr(lerJSON(t.pragas, [])).join(', '),   // Termo da visita: o programa por extenso; antigo ou do papel: as pragas marcadas
      pragasRes: pragasDoTermo(t), cancelado: c ? 'TERMO CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : '') : '' };
  }

  /**
   * Pragas avaliadas de um Termo NOVO da visita (tem visitaId e culturas): uma linha por praga e resultado, com as culturas juntas, para as caixas Presença / Ausência / Suspeita.
   * Termo antigo (sem visitaId ou sem culturas) e o digitado do papel devolvem [] e seguem imprimindo o texto da constatação.
   * Praga opcional (Moko, Pinta Preta...) só tem Presença e Ausência: vale o campo `opcional` gravado na cultura ou, sem ele (o servidor só guarda os campos que conhece),
   * a função opcoes.opcional(nome) que o app passa a `montar` (docs.js, com o catálogo). O nome da linha é o do quadro de pragas do Termo (opcoes.nomeDe: nomeNoTF, senão nome popular).
   */
  let OPCIONAL = null, NOME_TF = null;
  function pragasDoTermo(t) {
    const cult = arr(lerJSON(t.culturas, []));
    if (!t.visitaId || !cult.length) return [];
    const mapa = new Map();
    cult.forEach(c => arr(obj(c).pragas).forEach(p => {
      if (!p || !p.praga || !['detectada', 'nao_detectada', 'suspeita'].includes(p.resultado)) return;
      const nome = String((NOME_TF && NOME_TF(p.praga)) || p.praga), k = nome + '|' + p.resultado;
      if (!mapa.has(k)) mapa.set(k, { praga: nome, resultado: p.resultado, opcional: p.opcional != null ? Number(p.opcional) === 1 : !!(OPCIONAL && OPCIONAL(p.praga)), culturas: [] });
      const x = mapa.get(k); if (c.cultura && !x.culturas.includes(c.cultura)) x.culturas.push(String(c.cultura));
    }));
    return [...mapa.values()];
  }
  /**
   * Quadro "Resultado da inspeção" do Termo: uma linha por praga e resultado, com as culturas ao lado e as caixas Presença / Ausência / Suspeita
   * (Suspeita só fora das opcionais, ou se foi a resposta gravada). Linha com presença ou suspeita sai em negrito (classe det).
   */
  function desenharPragas(zona, lista) {
    const doc = zona.ownerDocument, corpo = zona.tBodies[0] || zona.appendChild(doc.createElement('tbody'));
    const el = (tag, cls, ...filhos) => { const e = doc.createElement(tag); if (cls) e.className = cls; filhos.forEach(k => { if (k != null) e.append(k); }); return e; };
    const op = (on, txt) => el('span', 'op', el('span', 'cx' + (on ? ' on' : '')), txt);
    lista.forEach(x => {
      corpo.append(el('tr', 'pr' + (x.resultado === 'nao_detectada' ? '' : ' det'), el('td', 'pr-n', x.praga), el('td', 'pr-c', listaE(x.culturas)),
        el('td', 'pr-x', op(x.resultado === 'detectada', 'Presença')), el('td', 'pr-x', op(x.resultado === 'nao_detectada', 'Ausência')),
        el('td', 'pr-x', !x.opcional || x.resultado === 'suspeita' ? op(x.resultado === 'suspeita', 'Suspeita') : null)));
    });
  }

  /* ---------- Ficha oficial (um só modelo: pce-ficha.html, guiado por CONFIG.PCE.fichas) ---------- */
  const cfgFichas = () => {
    const c = typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.fichas;
    if (!c) throw new Error('Configuração das fichas (CONFIG.PCE.fichas) indisponível nesta versão.');
    return c;
  };
  const MODELOS_FICHA = ['citros', 'banana', 'moniliase', 'mandioca', 'soja', 'propriedade'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const str = v => (v == null ? '' : String(v));
  const vazioV = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const primeiro = (...v) => { for (const x of v) if (!vazioV(x)) return x; return ''; };
  /** sim/não de qualquer forma gravada (sim, Sim, 1, true, não, nao, 0, false) -> 'sim' | 'nao' | ''. */
  const sn = v => { const t = norm(v); return t === 'SIM' || t === 'TRUE' || t === '1' ? 'sim' : t === 'NAO' || t === 'FALSE' || t === '0' ? 'nao' : ''; };
  const lista = v => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.charAt(0) === '[' ? arr(lerJSON(v, [])).map(String) : vazioV(v) ? [] : [String(v)]);
  const ATIV_CITROS = { viveiro_mudas: 'Viveiro – produção de mudas', viveiro_semorigem: 'Viveiro – material de propagação sem origem genética comprovada',
    viveiro_portaenxerto: 'Viveiro – porta-enxerto', viveiro_clonal: 'Viveiro – jardins clonais e borbulheiras', frutos: 'Produção comercial de frutos', outros: 'Outros' };
  const OUTRO = ['outras', 'outros', 'outra'];

  /** Modelo de ficha de uma cultura (CONFIG.PCE.fichas.culturaModelo); cultura que não está na lista cai na ficha da propriedade. */
  function modeloDaCultura(cultura) {
    const k = norm(cultura), m = cfgFichas().culturaModelo || {}, x = Object.keys(m).find(c => norm(c) === k);
    return x ? m[x] : 'propriedade';
  }
  const espTxt = f => {
    const l = str(f.espLinha).trim(), p = str(f.espPlanta).trim(), u = f.espUnidade == null ? 'm' : f.espUnidade;
    return f.espacamento ? str(f.espacamento) : !l && !p ? '' : `${[l, p].filter(Boolean).join(' x ')}${u ? ' ' + u : ''}`;
  };
  const linhaFruto = f => ({ cultura: str(f.cultura), cultivar: str(f.cultivar), area: numTxt(f.area), espacamento: espTxt(f), idade: numTxt(f.idade), quantidade: numTxt(f.quantidade),
    producao: numTxt(f.producao), destino: str(f.destino), atividade: str(f.atividade) });
  /**
   * Frutos da propriedade que entram na ficha do modelo. Cada fruto vale pelo "modelo" que trouxer ou, sem ele, pela cultura (culturaModelo).
   * Sem frutos novos, o registro antigo (CadastrosPCE) entra pelo próprio dados: tabela "culturas" (citros, banana, mandioca, soja, propriedade)
   * ou número de plantas por hospedeiro (monilíase). O dado antigo não é alterado.
   */
  function frutosDoModelo(modelo, frutos, dadosAntigos) {
    const novos = arr(lerJSON(frutos, [])).filter(f => f && typeof f === 'object' && !Number(f.excluido)).filter(f => (f.modelo || modeloDaCultura(f.cultura)) === modelo).map(linhaFruto);
    if (novos.length) return novos;
    const d = obj(dadosAntigos), padrao = (cfgFichas().culturaPadrao || {})[modelo] || '';
    let l;
    if (modelo === 'moniliase') l = HOSP.filter(([k]) => str(obj(d.plantas)[k]) !== '' && num(obj(d.plantas)[k]) > 0).map(([k, n]) => ({ cultura: n, quantidade: numTxt(obj(d.plantas)[k]) }));
    else l = arr(d.culturas).filter(x => x && typeof x === 'object').map(x => ({ cultura: x.cultura || padrao, cultivar: x.cultivar, area: x.area, espacamento: x.espacamento, idade: x.idade, quantidade: x.plantas,
      producao: x.producao, atividade: x.atividade ? (x.atividade === 'outros' && d.atividadeOutros ? d.atividadeOutros : ATIV_CITROS[x.atividade] || '') : '' }));
    return l.map(x => ({ ...linhaFruto(x), destino: str(x.destino || d.destino) }));
  }

  const resultadoSN = r => { const t = norm(r); return t === 'DETECTADA' || t === 'SUSPEITA' ? 'sim' : t === 'NAO DETECTADA' ? 'nao' : sn(r); };
  /** Pragas respondidas na visita (Termo novo: culturas[].pragas[]) que casam com algum dos nomes dados (comparação exata, sem acento nem maiúsculas). */
  function pragasDaVisita(visita, nomes) {
    const alvo = new Set(nomes.map(norm));
    return arr(obj(visita).culturas).flatMap(c => arr(obj(c).pragas).filter(p => p && alvo.has(norm(p.praga))).map(p => ({ ...p, cultura: obj(c).cultura })));
  }
  /** Resultado da linha do quadro "4. Levantamento": a visita mais recente (se avaliou a praga) e, no registro antigo, o que o dado já traz. */
  function linhaLevantamento(L, visita, d) {
    const antigo = obj(obj(d.deteccao)[L.k] || obj(d.delimitacao)[L.k] || obj(d.fito)[L.k]);
    const r = { tem: sn(antigo.tem), tempo: str(antigo.tempo), controle: sn(antigo.controle), qual: str(antigo.qual) };
    const ps = pragasDaVisita(visita, L.pragas), res = ps.map(p => resultadoSN(p.resultado)).filter(Boolean);
    if (res.length) {
      r.tem = res.includes('sim') ? 'sim' : 'nao';
      const base = r.tem === 'sim' ? ps.filter(p => resultadoSN(p.resultado) === 'sim') : ps;
      r.tempo = str(primeiro(...base.map(p => p.haQuantoTempo), r.tempo)); r.controle = sn(primeiro(...ps.map(p => p.controle), r.controle));
      r.qual = str(primeiro(...ps.map(p => p.qualControle), r.qual));
    }
    return r;
  }
  /** Respostas extras que a visita traz por pergunta (culturas[].extras, visita.dados e visita.extras; o mais específico por último). */
  function extrasDaVisita(visita) {
    const v = obj(visita), o = {};
    arr(v.culturas).forEach(c => Object.assign(o, obj(obj(c).extras)));
    return Object.assign(o, obj(v.dados), obj(v.extras));
  }
  const unicos = l => [...new Set(l.map(x => str(x).trim()).filter(Boolean))];

  /** Dados do registro antigo com os nomes de hoje (sem mexer no original): comercial, amostra e idade/produção da monilíase. */
  function dadosAtuais(d0) {
    const d = { ...obj(d0) }, am = d.amostra;
    if (d.naoComercial && !d.tipoNaoComercial) d.tipoNaoComercial = d.naoComercial;
    if (d.naoComercialOutros && !d.tipoOutros) d.tipoOutros = d.naoComercialOutros;
    if (am && typeof am === 'object') { d.amostra = am.tem || ''; if (am.tipo && !d.amostraTipo) d.amostraTipo = am.tipo; }
    const anos = v => (vazioV(v) ? '' : /^[\d.,]+$/.test(str(v).trim()) ? str(v).trim() + ' anos' : str(v));
    if (d.idadePlantio != null) d.idadePlantio = anos(d.idadePlantio);
    if (d.idadeProducao != null) d.idadeProducao = anos(d.idadeProducao);
    if (!d.producaoTxt && d.producao) d.producaoTxt = [d.producao, d.producaoUnidade].filter(Boolean).join(' ');
    return d;
  }
  const ehOpcaoOutro = (p, o) => (p.outroOp ? o === p.outroOp : OUTRO.includes(o));

  /**
   * Tudo o que a ficha mostra, pronto para desenhar. entrada = {
   *   produtor:    {nome, doc (CPF/CNPJ), telefone},
   *   propriedade: {nome, cnpj, codigo, municipio, uf, lat, lon, endereco, viaAcesso, situacaoFundiaria, comercial, tipoPropriedade, frutos},
   *   dados:       respostas próprias do modelo (chaves de CONFIG.PCE.fichas.modelos[modelo]) e, em registro antigo, as comuns também,
   *   visita:      Termo mais recente da propriedade ({data, culturas:[{cultura, pragas:[{praga, resultado, haQuantoTempo, controle, qualControle}], coleta, tipoMaterial, extras}], dados}) ou nada,
   *   frutos:      (opcional) lista pronta de frutos da ficha, no lugar da escolha por modelo,
   *   ficha:       {numeroTxt, data, local, servidor, cargo, matricula, lotacao, assinaturas, rt}
   * }. Dado vazio fica em branco. Não grava nem altera nada.
   */
  function valoresFicha(modelo, entrada) {
    const cfg = cfgFichas(), M = cfg.modelos[modelo];
    if (!M) throw new Error('Modelo de ficha desconhecido: ' + modelo);
    const e = obj(entrada), pe = obj(e.produtor), pr = obj(e.propriedade), f = obj(e.ficha), d = dadosAtuais(e.dados), ext = extrasDaVisita(e.visita), visita = e.visita;
    const doc = digitos(pe.doc), todos = arr(lerJSON(pr.frutos, []));
    const frutos = Array.isArray(e.frutos) ? e.frutos.map(linhaFruto) : frutosDoModelo(modelo, pr.frutos, d);
    // situação fundiária e tipo da propriedade não comercial: o código da ficha ou, na propriedade, o texto da lista longa do levantamento
    const t = norm(pr.situacaoFundiaria);
    const sitProp = !t ? {} : /PROPRIET|TITULAD/.test(t) ? { situacao: 'proprietario' } : /ARREND/.test(t) ? { situacao: 'arrendatario' } : /COOPERATIV/.test(t) ? { situacao: 'cooperativa' } : { situacao: 'outras', situacaoOutras: str(pr.situacaoFundiaria) };
    const tp = str(primeiro(d.tipoNaoComercial, pr.tipoPropriedade)), tpCod = (cfg.naoComercial.find(([c, r]) => c === tp || norm(r) === norm(tp)) || [])[0];
    const r = {};   // respostas por pergunta
    const todasPerguntas = [...arr(M.propriedade), ...arr(M.perguntas), ...arr(obj(M.levantamento).perguntas)];
    const ler = k => primeiro(ext[k], d[k]);
    todasPerguntas.forEach(p => {
      r[p.k] = p.tipo === 'varios' ? lista(ler(p.k)) : p.deFrutos ? lista(ler(p.k)) : str(ler(p.k));
      if (p.k2) { r[p.k2] = numTxt(ler(p.k2)); r[p.k] = numTxt(ler(p.k)); }
      if (p.compl) r[p.compl.k] = p.compl.tipo === 'varios' ? lista(ler(p.compl.k)) : str(ler(p.compl.k));
      if (p.outro) r[p.outro] = str(ler(p.outro));
    });
    // o que o papel pede e os frutos já sabem (soma ou lista de um campo da tabela dos frutos): o que foi escrito na ficha vale primeiro
    const calcDe = c => {
      const [tipo, campo] = String(c).split(':'), vals = frutos.map(x => x[campo]);
      return tipo === 'soma' ? (vals.some(x => num(x)) ? numTxt(Math.round(vals.reduce((t, x) => t + num(x), 0) * 1000) / 1000) : '') : unicos(vals).join(', ');
    };
    todasPerguntas.forEach(p => {
      if (p.calc && !r[p.k]) r[p.k] = calcDe(p.calc);
      if (p.compl && p.compl.calc && !r[p.compl.k]) r[p.compl.k] = calcDe(p.compl.calc);
    });
    // respostas que a visita já dá (a ficha não pergunta de novo): praga avaliada, coleta de amostra e ocorrência de praga
    arr(obj(M.levantamento).perguntas).forEach(p => {
      if (p.deVisita && !r[p.k]) { const ps = pragasDaVisita(visita, p.deVisita).map(x => resultadoSN(x.resultado)).filter(Boolean); if (ps.length) r[p.k] = ps.includes('sim') ? 'sim' : 'nao'; }
      const cs = arr(obj(visita).culturas);
      if (p.fonte === 'coleta' && cs.length) {
        const col = cs.filter(c => sn(obj(c).coleta) === 'sim');
        if (!r[p.k]) r[p.k] = col.length ? 'sim' : 'nao';
        if (p.compl && !r[p.compl.k]) r[p.compl.k] = unicos(col.map(c => obj(c).tipoMaterial)).join(', ');
      }
      if (p.fonte === 'ocorrencia' && cs.length) {
        const det = cs.flatMap(c => arr(obj(c).pragas).filter(x => x && resultadoSN(x.resultado) === 'sim').map(x => x.praga));
        if (!r[p.k]) r[p.k] = det.length ? 'sim' : 'nao';
        if (p.compl && !r[p.compl.k]) r[p.compl.k] = unicos(det).join(', ');
      }
    });
    // tipo de cultura da propriedade: marcado também pelos frutos cadastrados (os que não têm caixa vão em "OUTROS")
    todasPerguntas.filter(p => p.deFrutos).forEach(p => {
      const marcados = new Set(r[p.k]), fora = [];
      todos.forEach(fr => {
        const n = norm(fr.cultura), o = p.ops.find(([c, tx]) => !OUTRO.includes(c) && (norm(tx) === n || n.startsWith(norm(tx) + ' ')));
        if (o) marcados.add(o[0]); else if (n) fora.push(str(fr.cultura));
      });
      if (fora.length) { marcados.add('outros'); if (!r[p.outro]) r[p.outro] = unicos(fora).join(', '); }
      r[p.k] = [...marcados];
    });
    const linhas = arr(obj(M.levantamento).linhas).map(L => ({ ...L, ...linhaLevantamento(L, visita, d) }));
    const comercial = sn(primeiro(pr.comercial, d.comercial));
    const rt = { nome: '', conselho: '', ...obj(d.rt), ...obj(f.rt) };
    return {
      modelo, titulo: M.titulo, numeroRot: M.numero, base: arr(M.base), numeroTxt: str(f.numeroTxt), dataTxt: dataBR(f.data), local: str(f.local),
      comercial, tipoNaoComercial: tpCod || (tp ? 'outros' : ''), tipoOutros: tpCod && tpCod !== 'outros' ? '' : str(primeiro(d.tipoOutros, tpCod ? '' : tp)),
      id: { nome: str(pe.nome), cpf: doc.length === 14 ? '' : fmtDoc(pe.doc), propriedade: str(pr.nome), cnpj: fmtDoc(primeiro(pr.cnpj, doc.length === 14 ? pe.doc : '')),
        telefone: str(primeiro(pe.telefone, d.telefone)), codigo: str(primeiro(pr.codigo, d.codigoPropriedade)), lat: numTxt(pr.lat), lon: numTxt(pr.lon),
        endereco: str(primeiro(pr.endereco, d.endereco)), municipio: str(pr.municipio), uf: str(primeiro(pr.uf, 'AM')), via: str(primeiro(pr.viaAcesso, d.viaAcesso)), viaOutra: str(d.viaOutra) },
      situacao: str(primeiro(d.situacao, sitProp.situacao)), situacaoOutras: str(primeiro(d.situacaoOutras, sitProp.situacaoOutras)),
      frutos, r, linhas, rt, declaracao: str(M.declaracao),
      servidor: { nome: str(f.servidor), cargo: str(f.cargo), matricula: f.matricula ? 'Matrícula: ' + f.matricula : '', lotacao: f.lotacao ? 'Lotação: ' + f.lotacao : '' }
    };
  }

  /* desenho: tudo montado por DOM (texto sempre como texto, nunca HTML) */
  function desenharFicha(pg, V) {
    const cfg = cfgFichas(), M = cfg.modelos[V.modelo], doc = pg.ownerDocument;
    const el = (tag, cls, ...filhos) => { const e = doc.createElement(tag); if (cls) e.className = cls; filhos.flat().forEach(k => { if (k != null) e.append(k); }); return e; };
    const v = (txt, cls) => el('span', 'v' + (cls ? ' ' + cls : ''), str(txt));
    const rot = txt => el('span', 'lbl', txt);
    const cx = on => el('span', 'cx' + (on ? ' on' : ''));
    const op = (on, txt, ...mais) => el('span', 'op', cx(on), txt, ...mais);
    const cp = (r, valor, cls, vcls) => el('div', 'cp' + (cls ? ' ' + cls : ''), rot(r), v(valor, vcls));
    const tabela = (cls, cols, ...linhas) => { const t = el('table', 'ln' + (cls ? ' ' + cls : '')); if (cols) { const cg = el('colgroup'); cols.forEach(w => { const c = el('col'); if (w) c.style.width = w; cg.append(c); }); t.append(cg); } linhas.flat().forEach(l => { if (l) t.append(l); }); return t; };
    const tr = (...tds) => el('tr', '', ...tds);
    const td = (cls, ...filhos) => el('td', cls, ...filhos);
    const tdc = (n, ...filhos) => { const t = td('', ...filhos); t.colSpan = n; return t; };
    const sec = txt => tabela('', null, tr(td('sec', txt)));
    /** Caixas de uma lista de opções; a opção "outro" leva o texto escrito ao lado (sempre, em branco como no papel). */
    const opcoes = (p, ops, marcados, outroTxt) => ops.map(([c, tx, grupo]) => {
      const on = marcados.includes(c), filhos = [];
      if (grupo) filhos.push(el('span', 'grupo', grupo + ' – '));
      filhos.push(tx);
      if (p.outro !== undefined && ehOpcaoOutro(p, c)) filhos.push(el('span', '', /[:?]$/.test(tx) ? ' ' : ': '), v(outroTxt, 'curto'));
      return el('span', 'op', cx(on), ...filhos);
    });
    const complemento = (c) => (!c ? null : c.tipo === 'varios'
      ? el('span', 'compl', rot(/[:?]$/.test(c.rot) ? c.rot : c.rot + ':'), ' ', ...opcoes(c, c.ops, V.r[c.k] || [], ''))
      : el('span', 'compl', rot(/[:?]$/.test(c.rot) ? c.rot : c.rot + ':'), ' ', v(V.r[c.k], 'curto')));
    /** Resposta de uma pergunta como nós soltos (caixas, valor, complemento), para a linha de pergunta e para a célula de duas perguntas. */
    const resposta = p => {
      const val = V.r[p.k];
      if (p.tipo === 'texto' || p.tipo === 'num') return [v(val), p.compl ? complemento(p.compl) : null];
      if (p.tipo === 'coord') return [v(val), '/', v(V.r[p.k2])];
      const ops = p.tipo === 'sn' ? [['sim', 'sim'], ['nao', 'não']] : p.ops, marcados = p.tipo === 'sn' ? [sn(val)] : p.tipo === 'opcao' ? [str(val)] : lista(val);
      return [...opcoes(p, ops, marcados, V.r[p.outro]), complemento(p.compl)];
    };
    /** Linha de pergunta: texto da pergunta à esquerda e, à direita, as caixas (e o complemento) ou o valor. */
    const classeResp = p => (p.tipo === 'texto' || p.tipo === 'num' ? 'cp' : p.tipo === 'coord' ? 'cp duplo' : p.layout || '');
    const linhaPerg = p => tr(td('lbl', p.rot), td('', el('div', classeResp(p), ...resposta(p))));
    /** Duas perguntas na mesma linha do papel, uma célula para cada. */
    const linhaPar = ps => tr(...ps.map(p => td('', el('div', 'cp', rot(p.rot), ' ', ...resposta(p)))));
    // perguntas fixas, comuns às fichas, e as que o papel tira dos frutos
    const unicosTxt = l => unicos(l).join(', ');
    const fixas = {
      situacao: { k: 'situacao', rot: 'SITUAÇÃO FUNDIÁRIA:', tipo: 'opcao', ops: cfg.situacoes, outro: 'situacaoOutras', outroOp: 'outras' },
      destino: { k: 'destino', rot: 'DESTINO DA PRODUÇÃO:', tipo: 'texto' }
    };
    V.r.situacao = V.situacao; V.r.situacaoOutras = V.situacaoOutras; V.r.destino = unicosTxt(V.frutos.map(x => x.destino));
    const pool = [...arr(M.propriedade), ...arr(M.perguntas), ...arr(obj(M.levantamento).perguntas)];
    const pergunta = k => fixas[k] || pool.find(p => p.k === k);
    const colunasDe = (cols) => cols.map(c => [c, (M.colunas && M.colunas[c]) || (cfg.colunas.find(x => x[0] === c) || [])[1] || c.toUpperCase()]);
    const LARG = { cultura: 15, atividade: 20, cultivar: 18, cultivarCultura: 20, area: 9, espacamento: 14, idade: 10, quantidade: 13, producao: 19, destino: 16 };
    const numero = n => (n >= 0 ? n + '.   ' : '');
    // quadro "Cultura (Nº de plantas)" do cacau e cupuaçu: o número de plantas de cada cultura, tirado dos frutos
    const quadroPlantas = () => {
      const nomes = arr(M.plantas), soma = n => V.frutos.filter(x => norm(x.cultura) === norm(n)).reduce((t, x) => t + num(x.quantidade), 0);
      const qtd = nomes.map(n => soma(n)), total = qtd.reduce((t, x) => t + x, 0);
      return tabela('plantas', null, tr(td('', el('div', 'cp', rot('Cultura (Nº de plantas):'), ' ', ...nomes.flatMap((n, i) => [el('span', 'pl-i', el('b', '', n), ' ', v(qtd[i] ? numTxt(qtd[i]) : '', 'curto')), ' ']),
        el('span', 'pl-i', el('b', '', 'Total'), ' ', v(total ? numTxt(total) : '', 'curto'))))));
    };
    /** Tabela dos frutos: só as colunas do papel do modelo, com linhas em branco até o mínimo do papel. */
    const tabelaCultura = (b) => {
      const colunas = colunasDe(b.cultura), cheias = V.frutos, vazias = Math.max(0, (b.linhas || 3) - cheias.length);
      const celula = (x, c) => td('', c === 'cultivarCultura' ? culturaCultivar(x.cultura, x.cultivar) : c === 'cultivar' ? x.cultivar || x.cultura : str(x[c]));   // ficha de uma cultura só: sem cultivar, vale o nome da cultura
      const somaLarg = colunas.reduce((t, [c]) => t + (LARG[c] || 14), 0);
      return tabela('cult', colunas.map(([c]) => ((LARG[c] || 14) * 100 / somaLarg).toFixed(1) + '%'),
        el('thead', '', tr(...colunas.map(([, tx]) => el('th', '', tx)))),
        el('tbody', '', ...cheias.map(x => el('tr', 'cheia', ...colunas.map(([c]) => celula(x, c)))), ...Array.from({ length: vazias }, () => el('tr', 'vazia', ...colunas.map(() => td(''))))));
    };
    /** Linhas do levantamento como no papel: praga, sim, não e "Há quanto tempo" (ou "Qual"); abaixo, "Utiliza met. controle" quando o papel pergunta. */
    const tabelaLinhas = ks => tabela('lev', ['34%', '11%', '11%', ''], ks.flatMap(k => {
      const L = V.linhas.find(x => x.k === k); if (!L) return [];
      const rs = [tr(td('b', L.rot), td('c', op(L.tem === 'sim', 'sim')), td('c', op(L.tem === 'nao', 'não')),
        L.cols.includes('tempo') ? td('', rot('Há quanto tempo:'), ' ', v(L.tempo)) : L.cols.includes('qual') && !L.cols.includes('controle') ? td('', rot('Qual:'), ' ', v(L.qual)) : td(''))];
      if (L.cols.includes('controle')) rs.push(tr(td('', 'Utiliza met. controle:'), td('c', op(L.controle === 'sim', 'sim')), td('c', op(L.controle === 'nao', 'não')), td('', rot('Qual:'), ' ', v(L.qual))));
      return rs;
    }));
    const corpo = [];

    // título oficial com Nº, base legal
    corpo.push(tabela('', null, tr(td('tit', V.titulo)),
      tr(td('tit', V.numeroRot + ' ', (() => { const n = el('span'); n.setAttribute('data-numero', ''); return n; })())),
      V.base.length ? tr(td('base', ...V.base.flatMap((l, i) => (i ? [el('br'), l] : [l])))) : null));
    // propriedade comercial? (só nas fichas que têm o quadro)
    if (M.comercial !== undefined) corpo.push(tabela('aviso', ['39%', '21%', ''],
      tr(td('b', 'PROPRIEDADE COMERCIAL?'), td('', op(V.comercial === 'sim', 'SIM'), op(V.comercial === 'nao', 'NÃO')), td('', M.comercial)),
      tr(tdc(3, 'Propriedade não comercial: ', ...cfg.naoComercial.map(([c, tx]) => op(V.tipoNaoComercial === c, tx + (c === 'outros' ? ':' : ';'), c === 'outros' ? v(V.tipoOutros, 'curto') : null))))));
    // 1. produtor/proprietário: o que o papel de cada modelo tem
    const i = V.id, cmp = arr(M.produtor);
    corpo.push(sec('1.   DADOS DO PRODUTOR/PROPRIETÁRIO'));
    // cada linha é uma tabela com as próprias larguras (nada quebra à toa); as bordas se juntam como num quadro só
    corpo.push(tabela('dados', ['60%', ''], tr(td('', cp('NOME DO PRODUTOR:', i.nome)), td('', cp('CPF:', i.cpf, '', 'nw'))),
      tr(td('', cp('NOME DA PROPRIEDADE:', i.propriedade)), td('', cp('CNPJ:', i.cnpj, '', 'nw')))));
    if (cmp.includes('telefone')) corpo.push(tabela('dados', null, tr(td('', cp('TELEFONE:', i.telefone, '', 'nw')))));
    const georref = el('div', 'cp duplo', rot('GEORREFERENCIAMENTO: Lat.:'), v(i.lat, 'nw'), rot('Lon.:'), v(i.lon, 'nw'));
    corpo.push(cmp.includes('codigo') ? tabela('dados', ['52%', ''], tr(td('', cp('CÓDIGO DA PROPRIEDADE (CONFORME IN Nº33/2016):', i.codigo, '', 'nw')), td('', georref)))
      : tabela('dados', null, tr(td('', georref))));
    if (cmp.includes('via')) corpo.push(tabela('dados', null, tr(td('', rot('PRINCIPAL VIA DE ACESSO À PROPRIEDADE: '), ...cfg.vias.map(([c, tx]) => op(i.via === c, tx, c === 'outra' ? el('span', '', ': ') : null, c === 'outra' ? v(i.viaOutra, 'curto') : null))))));
    corpo.push(tabela('dados', ['60%', ''], tr(td('', cp('ENDEREÇO:', i.endereco)), td('', el('div', 'cp duplo', rot('MUNICÍPIO:'), v(i.municipio), rot('UF:'), v(i.uf, 's nw'))))));
    // demais seções, na ordem do papel do modelo
    arr(M.secoes).forEach((S, n) => {
      corpo.push(sec(numero(n + 2) + S.titulo));
      let grupo = [];
      const fechar = () => { if (grupo.length) corpo.push(tabela('perg', ['32%', ''], grupo.map(linhaPerg))); grupo = []; };
      arr(S.blocos).forEach(b => {
        if (typeof b === 'string') {
          if (b === 'plantas') { fechar(); corpo.push(quadroPlantas()); return; }
          const p = pergunta(b); if (p) grupo.push(p); return;
        }
        fechar();
        if (Array.isArray(b)) { const ps = b.map(pergunta).filter(Boolean); if (ps.length) corpo.push(tabela('par', null, linhaPar(ps))); }
        else if (b.cultura) corpo.push(tabelaCultura(b));
        else if (b.linhas) corpo.push(tabelaLinhas(b.linhas));
      });
      fechar();
    });
    // responsável técnico (só nas fichas que têm), declaração e assinaturas
    const fim = [];
    const rt = V.rt;
    if (M.rt) fim.push(tabela('', ['62%', ''], tr(td('', cp(M.rt, rt.nome)), td('', cp('Nº CONSELHO:', rt.conselho, '', 'nw')))));
    if (V.declaracao) fim.push(el('div', 'resp', V.declaracao));
    const s = V.servidor;
    const dataLinha = M.data === 'localedata' ? el('div', 'data', 'LOCAL E DATA: ', v(V.local, 'curto'), ', ', v(V.dataTxt, 'curto'))
      : M.data === 'dataelocal' ? el('div', 'data', 'DATA: ', v(V.dataTxt, 'curto'), el('br'), 'Local: ', v(V.local, 'curto')) : el('div', 'data', 'DATA: ', v(V.dataTxt, 'curto'));
    fim.push(tabela('assin', null, tr(td('', el('div', 'cols',
      el('div', 'col', el('div', 'ass-img'), el('div', 'linha', 'SERVIDOR DA ADAF-AM'),
        el('div', 'serv', el('b', '', s.nome), el('br'), s.cargo, el('br'), [s.matricula, s.lotacao].filter(Boolean).join(' '))),
      el('div', 'col', el('div', 'ass-img'), el('div', 'linha', 'PRODUTOR/PROPRIETÁRIO'), el('div', 'serv', i.nome))),
      dataLinha))));
    const [colS, colP] = fim[fim.length - 1].querySelectorAll('.col'); colS.setAttribute('data-ass', 'servidor'); colP.setAttribute('data-ass', 'produtor');
    corpo.push(el('div', 'fim', ...fim));
    const alvo = pg.querySelector('[data-ficha]'); alvo.textContent = ''; alvo.append(...corpo.filter(Boolean));
    pg.setAttribute('data-modelo', V.modelo);
  }

  /* ---------- ajuste de folha: o corpo nunca passa do rodapé (preso à base da folha por documento-base.css) ---------- */
  /** Níveis de tamanho (medidas em documento-base.css): corpo de 11 pt, depois .compacta com c1 (10,5 pt) a c5 (8,5 pt). */
  const NIVEIS = [[], ['compacta', 'c1'], ['compacta', 'c2'], ['compacta', 'c3'], ['compacta', 'c4'], ['compacta', 'c5']];
  const NIVEL_FOLHAS = 3;                                                            // o que não cabe em uma folha continua em outras, no corpo de 9,5 pt
  function nivel(pg, n) {
    pg.classList.remove('compacta', 'c1', 'c2', 'c3', 'c4', 'c5'); pg.classList.add(...NIVEIS[n]);
    pg.querySelectorAll('.linhas').forEach(x => DocumentoBase.pautar(x));            // o passo das linhas de escrever muda com o nível
  }
  /**
   * Cada ficha cabe numa folha: se o corpo passar do rodapé, desce para o próximo nível de tamanho (até 8,5 pt); se ainda assim não couber, volta ao corpo de 9,5 pt (c3) e continua
   * numa segunda folha completa (com o próprio rodapé), distribuído por seções e, na tabela de cultura, por linhas com o cabeçalho repetido; responsável técnico e
   * assinaturas ficam juntos na última folha. Só o JS distribui: o navegador não fragmenta nada (cada folha mede 297 mm). No fim, a sobra de altura da folha
   * que leva as assinaturas vai para as áreas de escrever (esticarFolha), para o formulário terminar logo acima das vias.
   */
  function ajustarFolhas(doc) {
    [...doc.querySelectorAll('.a4.ficha, .a4.termo')].forEach(pg => {
      const antes = [...doc.querySelectorAll('.a4.ficha, .a4.termo')];
      if (!NIVEIS.some((_, n) => (nivel(pg, n), DocumentoBase.cabe(pg)))) {
        nivel(pg, NIVEL_FOLHAS);
        (pg.classList.contains('termo') ? paginarTermo : paginarFicha)(pg);
      }
      const todas = [...doc.querySelectorAll('.a4.ficha, .a4.termo')], i = todas.indexOf(pg), n = todas.length - antes.length;
      esticarFolha(todas[i + n]);                                                      // a última folha do documento (a das assinaturas)
    });
  }
  /**
   * Distribui a sobra de altura da folha (entre o quadro e as vias, deixando 3 mm) pelas áreas de escrever, em linhas inteiras onde há linhas:
   * Termo: constatação (50%), enquadramento (15%) e o resto no quadro das testemunhas e assinaturas. Ficha: linhas vazias da tabela de cultura (até 4 mm cada),
   * últimas perguntas (até 2,5 mm cada) e o resto no espaço das assinaturas.
   */
  function esticarFolha(pg) {
    const mm = 96 / 25.4, db = DocumentoBase, livre = () => db.sobra(pg) - 3 * mm;
    if (!pg || livre() < 1) return;
    const px = x => x.getBoundingClientRect().height;
    if (pg.classList.contains('termo')) {
      const blk = pg.querySelector('.blk'); if (!blk) return;
      [['.linhas.l6', 0.5], ['.linhas.l3', 0.15]].forEach(([sel, peso]) => {
        const L = pg.querySelector(sel); if (!L) return;
        const passo = parseFloat(getComputedStyle(L).lineHeight), n = Math.floor(livre() * peso / passo);
        if (n > 0) db.pautar(L, L.querySelectorAll('.pl').length + n);
      });
      blk.style.minHeight = Math.max(0, px(blk) + livre()) + 'px';
      if (livre() < 0) blk.style.minHeight = Math.max(0, px(blk) + livre()) + 'px';
      return;
    }
    const cresce = (linhas, peso, tetoMm) => {
      if (!linhas.length) return;
      const total = livre() * peso, cada = Math.min(total / linhas.length, tetoMm * mm);
      linhas.forEach(l => { l.style.height = px(l) + cada + 'px'; });
    };
    cresce([...pg.querySelectorAll('table.cult tr.vazia')], 0.35, 4);
    const perg = [...pg.querySelectorAll('table.perg')].pop(); if (perg) cresce([...perg.querySelectorAll('tr')], 0.35, 2.5);
    const imgs = [...pg.querySelectorAll('.assin .ass-img')];
    if (imgs.length) { const mais = Math.max(0, livre()); imgs.forEach(x => { x.style.height = px(x) + mais + 'px'; }); }
    if (livre() < 0) { const m = livre(); imgs.forEach(x => { x.style.height = Math.max(0, px(x) + m) + 'px'; }); }
  }
  /**
   * Termo que não cabe numa folha: a folha corta o que passa do rodapé, então nada pode ficar de fora. A constatação continua em folhas completas
   * (com número e rodapé), repartida por palavras; enquadramento e testemunhas seguem depois dela, com as assinaturas juntas na última folha.
   */
  function paginarTermo(pg) {
    const molde = pg.cloneNode(true), texto = pg.querySelector('.linhas.l6'), desc = texto.closest('table');
    const depois = []; for (let x = desc.nextElementSibling; x; x = x.nextElementSibling) depois.push(x);
    depois.forEach(x => x.remove());
    let pedacos = texto.textContent.match(/\s*\S{1,200}\s*/g) || [], atual = pg;
    /** Põe na folha o máximo de texto que cabe (busca binária) e devolve quantos pedaços entraram. */
    const encher = (folha, min) => {
      const el = folha.querySelector('.linhas.l6');
      const tenta = n => { el.textContent = pedacos.slice(0, n).join(''); DocumentoBase.pautar(el, min); return DocumentoBase.cabe(folha); };
      let a = 0, b = pedacos.length;
      while (a < b) { const m = Math.ceil((a + b) / 2); if (tenta(m)) a = m; else b = m - 1; }
      tenta(a); pedacos = pedacos.slice(a);
      return a;
    };
    const nova = () => {
      const c = molde.cloneNode(true), q = c.querySelector('.cq'), titulo = q.firstElementChild;
      q.textContent = ''; q.append(titulo); atual.after(c); atual = c; return q;
    };
    encher(pg, 6);
    while (pedacos.length) {
      const q = nova(), t = atual.ownerDocument.importNode(molde.querySelector('.linhas.l6').closest('table'), true), cel = t.querySelector('td.cxs');
      const linhas = cel.querySelector('.linhas'), nota = cel.querySelector('.linhas ~ .peq');
      t.querySelector('td.sec').textContent = '2 – Descrição da Ação (continuação)';
      cel.textContent = ''; cel.append(linhas, nota);
      [...t.rows].forEach(r => { if (!r.querySelector('td.sec') && !r.contains(cel)) r.remove(); });   // a continuação leva só o título e a situação constatada
      q.append(t);
      if (!encher(atual, 1)) break;
    }
    atual.querySelector('.cq').append(...depois);                                  // enquadramento e quadro das assinaturas vão juntos para a última folha
    if (!DocumentoBase.cabe(atual)) { depois.forEach(x => x.remove()); nova().append(...depois); }
  }
  function paginarFicha(pg) {
    const cq = pg.querySelector('[data-ficha]'), molde = pg.cloneNode(true);
    const ehSec = x => x.matches('table.ln') && x.querySelector('td.sec');
    // unidades que não se separam: título+comercial, cada seção (título e primeira tabela), as demais tabelas, o bloco final
    const un = [];
    [...cq.children].forEach(x => {
      const ult = un[un.length - 1];
      if (ehSec(x)) un.push({ els: [x], aberta: true });
      else if (ult && ult.aberta) { ult.els.push(x); ult.aberta = false; }
      else if (ult && ult.cabeca) ult.els.push(x);
      else un.push({ els: [x], cabeca: !ult });
    });
    cq.textContent = '';
    const nova = () => {                                                         // folha de continuação: o título do documento e o rodapé de sempre
      const c = molde.cloneNode(true), q = c.querySelector('[data-ficha]'), titulo = q.firstElementChild;
      const base = titulo.querySelector('td.base'); if (base) base.parentElement.remove();
      titulo.querySelector('td.tit').append(' (continuação)');
      q.textContent = ''; q.append(titulo); atual.after(c); atual = c; return q;
    };
    let atual = pg, q = cq;
    const cabe = () => DocumentoBase.cabe(atual);
    un.forEach(u => {
      q.append(...u.els);
      if (cabe()) return;
      const cult = u.els.find(x => x.matches('table.cult'));
      if (cult) {                                                                 // tabela de cultura: reparte as linhas e repete o cabeçalho
        const sec = u.els[0], linhas = [...cult.tBodies[0].querySelectorAll('tr:not(.vazia)')];
        cult.tBodies[0].textContent = '';
        cult.tBodies[0].append(linhas[0]);
        if (cabe()) {
          let corpo = cult.tBodies[0], k = 1;
          while (k < linhas.length) {
            corpo.append(linhas[k]);
            if (!cabe()) {
              linhas[k].remove(); q = nova();
              const s2 = sec.cloneNode(true), t2 = cult.cloneNode(true); t2.tBodies[0].textContent = ''; q.append(s2, t2); corpo = t2.tBodies[0];
              corpo.append(linhas[k]);
            }
            k++;
          }
          return;
        }
        cult.tBodies[0].textContent = ''; linhas.forEach(l => cult.tBodies[0].append(l));
      }
      u.els.forEach(x => x.remove()); q = nova(); q.append(...u.els);
    });
  }

  /* ---------- Adaptadores: registros antigos (CadastrosPCE) abrem na ficha nova, sem alterar o dado ---------- */
  /** Modelo de ficha de um cadastro antigo: pelo tipo (cadastroCitros...) ou, em "cadastro", pelo programa do registro (sem programa = monilíase). */
  function modeloDoCadastro(tipo, reg) {
    const m = /^cadastro(.+)$/.exec(tipo || '');
    return m ? m[1].toLowerCase() : (reg && reg.programa) || 'moniliase';
  }
  /** CadastrosPCE antigo (citros, monilíase, banana, mandioca, soja, propriedade) -> entrada de valoresFicha. */
  function entradaDeCadastro(c) {
    const d = lerJSON(c.dados, {});
    return { produtor: { nome: c.nome, doc: c.doc, telefone: d.telefone },
      propriedade: { nome: c.propriedade, cnpj: c.cnpj, codigo: d.codigoPropriedade, municipio: c.municipio, uf: c.uf, lat: c.lat, lon: c.lon, endereco: d.endereco,
        viaAcesso: d.viaAcesso, comercial: d.comercial, tipoPropriedade: d.tipoNaoComercial || d.naoComercial || '' },
      dados: d, visita: null,
      ficha: { numeroTxt: c.numeroTxt, data: c.data, local: c.local, servidor: c.servidor, cargo: c.cargo, matricula: c.matricula, lotacao: c.lotacao, assinaturas: c.assinaturas } };
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
  const ARQUIVO = { termo: 'pce-termo.html', ficha: 'pce-ficha.html', relatorio: 'pce-relatorio.html' };
  /** Qual dos três modelos serve ao tipo (os tipos antigos termoCitros, cadastro, cadastroCitros... usam os modelos novos). */
  const natureza = tipo => (/^termo/.test(tipo) ? 'termo' : /^(ficha|cadastro)/.test(tipo) ? 'ficha' : 'relatorio');
  /** Tipo de um termo/cadastro conforme o programa (nomes antigos, ainda usados em nome de arquivo e no relatório). */
  const tipoDoRegistro = (tipo, reg) => (reg && reg.programa === 'citros' && (tipo === 'termo' || tipo === 'cadastro') ? tipo + 'Citros'
    : reg && tipo === 'cadastro' && MODELOS_FICHA.includes(reg.programa) && reg.programa !== 'moniliase' ? 'cadastro' + cap(reg.programa) : tipo);
  const VALORES = { termo: valoresTermo, relatorio: valoresRelatorio };
  const cacheModelo = {};
  /** Página modelo (.a4) de outro arquivo de documentos (para anexar termos/fichas ao relatório); o <style> dele vem junto, uma vez. */
  async function modeloDe(doc, tipo) {
    const arquivo = ARQUIVO[natureza(tipo)];
    if (!cacheModelo[arquivo]) cacheModelo[arquivo] = fetch(new URL(arquivo, doc.baseURI).href).then(r => { if (!r.ok) throw new Error('Modelo indisponível: ' + arquivo); return r.text(); })
      .then(txt => new DOMParser().parseFromString(txt, 'text/html'));
    const outro = await cacheModelo[arquivo];
    const pg = outro.querySelector('.a4');
    if (!doc.querySelector(`style[data-modelo="${arquivo}"]`)) outro.querySelectorAll('style').forEach(st => { const n = doc.createElement('style'); n.setAttribute('data-modelo', arquivo); n.textContent = st.textContent; doc.head.append(n); });
    return doc.importNode(pg, true);
  }
  function preencherPagina(pg, tipo, dados, arquivos) {
    const nat = natureza(tipo);
    if (nat === 'ficha') {
      const antigo = tipo !== 'ficha', entrada = antigo ? entradaDeCadastro(dados) : dados;
      desenharFicha(pg, valoresFicha(antigo ? modeloDoCadastro(tipo, dados) : dados.modelo, entrada));
      assinaturas(pg, lerJSON(obj(entrada.ficha).assinaturas, {}), arquivos); DocumentoBase.montar(pg, { numero: obj(entrada.ficha).numeroTxt });
      return pg;
    }
    const r = VALORES[nat](dados);
    preencher(pg, r);
    if (nat === 'relatorio') {
      const ul = pg.querySelector('[data-lista=servidores]');
      if (ul) { ul.textContent = ''; (dados.servidores || []).forEach(s => { const li = pg.ownerDocument.createElement('div'); li.textContent = [s.nome, s.funcao].filter(Boolean).join(' - '); ul.append(li); }); }
    } else assinaturas(pg, lerJSON(dados.assinaturas, {}), arquivos);
    const cf = pg.querySelector('.cancelado-faixa'); if (cf && !r.cancelado) cf.remove();
    const zona = pg.querySelector('[data-pragas]'); if (zona) { if (nat === 'termo' && r.pragasRes.length) desenharPragas(zona, r.pragasRes); else (zona.closest('tr.res-l') || zona).remove(); }
    if (nat === 'termo') { DocumentoBase.montar(pg, { numero: r.numeroTxt }); pg.querySelectorAll('.linhas.l6').forEach(x => DocumentoBase.pautar(x, r.pragasRes.length ? 3 : 5)); pg.querySelectorAll('.linhas.l3').forEach(x => DocumentoBase.pautar(x, 2)); }
    return pg;
  }
  /**
   * Preenche o documento aberto (doc = documento do modelo). tipo: ficha ({modelo, produtor, propriedade, dados, visita, ficha}: ver valoresFicha) | termo
   * | relatorio | (antigos, com o registro gravado) termoCitros, cadastro, cadastroCitros, cadastroBanana, cadastroMandioca, cadastroSoja, cadastroPropriedade.
   * opcoes.arquivos = {id: arquivo} (assinaturas); no relatório, opcoes.anexos = {termos:[...], cadastros:[...]} vira páginas depois do relatório;
   * opcoes.extras = [{tipo, dados, arquivos, antes}] = outras páginas antes/depois (ficha e Termo da mesma visita no mesmo PDF).
   */
  async function montar(doc, tipo, dados, opcoes) {
    opcoes = opcoes || {}; OPCIONAL = typeof opcoes.opcional === 'function' ? opcoes.opcional : null; NOME_TF = typeof opcoes.nomeDe === 'function' ? opcoes.nomeDe : null;
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
    ajustarFolhas(doc);
    return doc.querySelectorAll('.a4').length;
  }

  return { montar, preencher, calcularRelatorio, valoresTermo, valoresFicha, entradaDeCadastro, modeloDoCadastro, frutosDoModelo, modeloDaCultura, tipoDoRegistro, MODELOS_FICHA,
    totalPlantas, coordTxt, fmtDoc, dataBR, HOSP, nomeHosp, norm, listaE, lerJSON };
})();
if (typeof window !== 'undefined') window.PCEDocs = PCEDocs;
