/* ---------- Motor de indicadores das barreiras (fonte única para VIGIFITO, Relatório GDV e convênio 1.9/1.10) ----------
 * Cada número das barreiras é definido UMA vez aqui (fonte + regra) e usado por todos os relatórios: o VIGIFITO por posto, o bloco
 * VIGIFITO do Relatório GDV/consolidado (soma dos postos por tipo) e as etapas 1.9/1.10 do convênio — o mesmo número nunca diverge.
 * Regras: turno = registro de barreira (data = data de INÍCIO do turno: um turno que começa no dia da troca da escala conta no
 * período que começa nesse dia); veículos = registros não excluídos do turno; pessoas = soma do campo pessoas (estimativa por tipo de
 * veículo); TF = não cancelado, contado pela data do turno em que foi lavrado (TF sem turno: data do TF, como BVA fixa); posto
 * "Móvel"/"volante" = volante, senão fixa; toneladas = produtos em kg (÷ 1.000) ou t; outras unidades à parte, sem conversão.
 * Indicadores de fiscalização (regras da gerência, 2026-10):
 *   educacao     = pessoas a bordo dos veículos do turno (cada pessoa recebe a orientação de educação sanitária) + pessoas orientadas
 *                  contadas no próprio turno (Turnos.pessoasEducacao: turno que não conta veículos, ex.: volante de Tabatinga, monilíase);
 *   medidaFito, partidas = 1 por TF de barreira; inspecaoFito = TF com "Inspeção" marcada; documentos = TF com documento preenchido;
 *   UF do TF = coluna ufOrigem/ufDestino; TF antigo: UF no fim do texto de origem/destino (ufDoTexto_); senão a do veículo ligado;
 *   internN/internT/importT = TF de outra UF (ou do exterior) com destino ao AM (t = produtos do TF); cargasEstados/exportT = TF com
 *   destino a outra UF; outras unidades desses TFs à parte (outrasUnidades.carga). Veículo SEM TF ligado (TFs.veiculoId) com UF
 *   informada também conta em internN/cargasEstados (sem toneladas); com TF ligado, só o TF conta (nunca duas vezes).
 *   Os campos antigos de fiscalização do veículo (semEducacao, medidaFito, carga, produtos, partida, inspecaoFito, docConferido) não
 *   entram mais em nenhum número.
 *   Relatório de plantão do papel (importado no portal): toda carga (medidaPapel) soma as toneladas da cargaPapel em internT/importT
 *   ou exportT pelo sentido (o internN/cargasEstados já vem da UF do veículo, como acima). Só a carga com nº do TF no papel (tfPapel)
 *   conta como o TF de barreira contaria — tfs, partidas, medidaFito, liberação/apreensão (+ t), auto de destruição (apreensão) e
 *   documentos (docPapel): a mesma regra do app (medida = TF lavrado; decisão da gerência, 2026-10). Se o TF dessa carga também está
 *   na aba TFs (mesmo nº, ano e placa — ex.: TF antigo digitado do papel), a carga conta só como veículo: o resto vem do TF. */
function motorBarreira_(de, ate) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const tipoDe = function (t) { const p = normPub_(t.posto); return p.indexOf('mov') >= 0 || p.indexOf('volante') >= 0 ? 'volante' : 'fixa'; };
  const todos = {}, turnos = [];
  lerLeitura_('Turnos').forEach(function (t) {
    if (!t.id) return;
    const pe = Number(t.pessoasEducacao) || 0;                                // turno sem contagem de veículos: pessoas orientadas no turno
    const o = { id: t.id, data: String(t.data || '').slice(0, 10), posto: t.posto, tipo: tipoDe(t), local: t.local, unidade: t.unidade, veiculos: 0, pessoas: pe,
                educacao: pe, cargasEstados: 0, internN: 0, papel: null };
    todos[t.id] = o;
    if (noPer(o.data)) turnos.push(o);
  });
  const dentro = {}; turnos.forEach(function (t) { dentro[t.id] = t; });
  const uf = String(PropertiesService.getScriptProperties().getProperty('UF_LOCAL') || 'AM').toUpperCase();
  // interestadual: destino AM vindo de outra UF = internalização; destino em outra UF = trânsito para outros estados
  const sentido = function (ori, des) { return des === uf && ori && ori !== uf ? 'intern' : des && des !== uf ? 'estados' : ''; };
  const tfsVivos = lerLeitura_('TFs').filter(function (f) { return f.id && f.cancelado !== 1; }), comTF = {}, tfNumPlaca = {};
  tfsVivos.forEach(function (f) { if (f.veiculoId) comTF[f.veiculoId] = 1; if (f.numero > 0 && f.placa) tfNumPlaca[f.ano + '|' + f.numero + '|' + placaNorm_(f.placa)] = 1; });
  const ufVeic = {};
  lerLeitura_('Veiculos').forEach(function (v) {
    if (!v.id) return;
    const ori = ufNorm_(v.ufOrigem), des = ufNorm_(v.ufDestino);
    ufVeic[v.id] = { ori: ori, des: des };
    const t = dentro[v.turnoId]; if (!t || v.excluido === 1) return;
    t.veiculos++; t.pessoas += Number(v.pessoas) || 0;
    t.educacao += Number(v.pessoas) || 0;                                     // educação sanitária: por pessoa a bordo
    if (comTF[v.id]) return;                                                  // veículo com TF: a origem/destino conta pelo TF
    // carga do relatório de plantão cujo TF (mesmo nº, ano e placa) já está na aba TFs (ex.: TF antigo digitado do papel): conta pelo TF
    if (v.tfPapel && tfNumPlaca[t.data.slice(0, 4) + '|' + Number(String(v.tfPapel).replace(/\D/g, '')) + '|' + placaNorm_(v.placa)]) return;
    const sv = sentido(ori, des);
    if (sv === 'intern') t.internN++; else if (sv === 'estados') t.cargasEstados++;
    if (v.medidaPapel !== 'liberacao' && v.medidaPapel !== 'apreensao') return;
    const p = t.papel = t.papel || { partidas: 0, tfs: 0, documentos: 0, liberacao: 0, liberacaoT: 0, apreensao: 0, apreensaoT: 0, internT: 0, exportT: 0, outras: {} };
    const comTFPapel = !!String(v.tfPapel || '').trim();
    let cargaT = 0;
    produtosTF_(v.cargaPapel).forEach(function (pr) {
      if (pr.quantidade === null) return;
      const tt = toneladas_(pr.quantidade, pr.unidade), u = pr.unidade || 'sem unidade';
      if (tt !== null) { cargaT += tt; return; }
      // outras unidades à parte, nos mesmos grupos do TF: carga (interestadual) e, com TF, liberacao/apreensao
      (sv ? ['carga'] : []).concat(comTFPapel ? [v.medidaPapel] : []).forEach(function (g) { const o = p.outras[g] = p.outras[g] || {}; o[u] = (o[u] || 0) + pr.quantidade; });
    });
    if (sv === 'intern') p.internT += cargaT; else if (sv === 'estados') p.exportT += cargaT;
    if (!comTFPapel) return;                                                  // sem TF no papel: só veículo e internalização
    p.partidas++; p.tfs++; if (String(v.docPapel || '').trim()) p.documentos++;
    p[v.medidaPapel]++; p[v.medidaPapel + 'T'] += cargaT;
  });
  const tfs = [];
  tfsVivos.forEach(function (f) {
    const t = f.turnoId ? todos[f.turnoId] : null, data = t ? t.data : String(f.data || '').slice(0, 10);
    if (!noPer(data)) return;
    const vu = ufVeic[f.veiculoId] || {};
    const ori = ufNorm_(f.ufOrigem) || ufDoTexto_(f.origem) || vu.ori || '', des = ufNorm_(f.ufDestino) || ufDoTexto_(f.destino) || vu.des || '';
    const o = { id: f.id, turnoId: t ? t.id : '', veiculoId: f.veiculoId || '', data: data, tipo: t ? t.tipo : 'fixa', local: f.local, barreira: f.barreira, procedimento: f.procedimento,
                documentos: documentosTF_(f.documentos).length > 0, coleta: f.coleta === 1, amostras: f.coleta === 1 ? Number(f.amostras) || 0 : 0,
                inspecao: f.inspecao === 1, advertencia: f.advertencia === 1, fiel: f.fiel === 1, auto: f.auto === 1, liberacaoT: 0, apreensaoT: 0, outras: {},
                ufOrigem: ori, ufDestino: des, sentido: sentido(ori, des), cargaT: 0, outrasCarga: {} };
    produtosTF_(f.produtos).forEach(function (pr) {
      if (pr.quantidade === null) return;
      const tt = toneladas_(pr.quantidade, pr.unidade), u = pr.unidade || 'sem unidade';
      if (tt !== null) o.cargaT += tt; else o.outrasCarga[u] = (o.outrasCarga[u] || 0) + pr.quantidade;
      if (o.procedimento === 'liberacao' || o.procedimento === 'apreensao') {
        if (tt !== null) o[o.procedimento + 'T'] += tt; else o.outras[u] = (o.outras[u] || 0) + pr.quantidade;
      }
    });
    tfs.push(o);
  });
  return { turnos: turnos, tfs: tfs };
}
