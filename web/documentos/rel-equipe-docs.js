// Relatório da equipe (prestação de contas do convênio, etapa 1.10): preenche o modelo rel-equipe.html. Usado pelo app de campo
// (js/docs.js → relEquipe) e pelo painel (aba Escalas). R = resposta de relEquipe/painelRelEquipe: {escala, numeros, dados}, com
// dados = os campos do relatório já com os textos padrão (CONFIG.textosRelEquipe) onde não houver texto salvo.
(function () {
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze',
    'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  /** Número inteiro (0 a 999.999) por extenso: 12 → "doze"; 1530 → "mil quinhentos e trinta". feminino: "uma", "duas", "duzentas". */
  function extenso(n, feminino) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (feminino) return extenso(n).replace(/\bum\b/g, 'uma').replace(/\bdois\b/g, 'duas').replace(/entos\b/g, 'entas');
    const ate999 = x => {
      if (x < 20) return UNI[x];
      if (x < 100) return DEZ[Math.floor(x / 10)] + (x % 10 ? ' e ' + UNI[x % 10] : '');
      if (x === 100) return 'cem';
      return CEM[Math.floor(x / 100)] + (x % 100 ? ' e ' + ate999(x % 100) : '');
    };
    if (n < 1000) return ate999(n);
    if (n > 999999) return String(n);
    const mil = Math.floor(n / 1000), resto = n % 1000;
    return (mil === 1 ? 'mil' : ate999(mil) + ' mil') + (resto ? (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') + ate999(resto) : '');
  }
  const dia = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? { d: m[3], m: MESES[+m[2] - 1], a: m[1] } : null; };
  /** "de 24 de outubro a 02 de novembro de 2026" (ano só no fim quando é o mesmo). */
  function periodo(ini, fim) {
    const a = dia(ini), b = dia(fim); if (!a || !b) return '';
    return `de ${a.d} de ${a.m}${a.a !== b.a ? ' de ' + a.a : ''} a ${b.d} de ${b.m} de ${b.a}`;
  }
  const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);
  const comExtenso = (n, um, varios, fem) => `${n} (${extenso(n, fem)}) ${plural(n, um, varios)}`;

  /** Valores do relatório (os mesmos que vão para a tela e para o PDF). */
  function valores(R) {
    const e = R.escala, N = R.numeros, d = R.dados || {};
    const resp = (e.fiscais || []).find(f => (f.id ? f.id : 'nome:' + String(f.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()) === e.responsavel);
    const kgTxt = String(d.kg || '').trim();
    const kg = kgTxt ? Number(kgTxt.replace(',', '.')) : N.kg;
    const outras = kgTxt ? '' : Object.keys(N.outras || {}).map(u => `${num(N.outras[u])} ${u.toLowerCase()}`).join(', ');
    // termos de repasse: o digitado; sem nada digitado, 1 se o Termo de Repasse tem itens (salvos ou das apreensões), senão 0
    const nRep = d.repasse != null && String(d.repasse).trim() !== '' ? Number(d.repasse) || 0 : (repasse(R).itens.length ? 1 : 0);
    return {
      convenio: CONFIG.RELEQUIPE.convenio, etapa: CONFIG.RELEQUIPE.etapa,
      equipe: e.equipeNumero ? `Equipe ${e.equipeNumero}` : 'Equipe',
      servidores: (e.fiscais || []).map(f => f.nome), responsavel: resp ? resp.nome : '',
      periodo: periodo(e.inicio, e.fim), local: d.local || '', objetivo: d.objetivo || '', deslocamento: d.deslocamento || '', intro: d.intro || '',
      linhas: [
        `Veículos abordados: ${num(N.veiculos)} ${plural(N.veiculos, 'veículo', 'veículos')}.`,
        `Termo de Fiscalização emitidos: ${comExtenso(N.tfs, 'termo', 'termos')}.`,
        `Apreensões realizadas: ${comExtenso(N.apreensoes, 'apreensão', 'apreensões', true)}.`,
        `Quantidade de Produtos Apreendidos: ${num(kg)} ${plural(kg, 'quilograma', 'quilogramas')}${outras ? ` (e ${outras})` : ''}.`,
        `Termos de ${repasse(R).tipo} emitidos: ${nRep} ${plural(nRep, 'termo', 'termos')}.`,
        `Rechaços realizados: ${N.rechacos} ${plural(N.rechacos, 'rechaço', 'rechaços')}.`,
        `Medidas de educação sanitária: ${num(N.educacao)} ${plural(N.educacao, 'medida', 'medidas')}.`
      ],
      obs: d.obs || ''
    };
  }

  /** Preenche o modelo (documento do iframe) com o relatório R. */
  function montar(doc, R) {
    const v = valores(R), set = (k, t) => doc.querySelectorAll(`[data-c="${k}"]`).forEach(x => { x.textContent = t; });
    ['convenio', 'etapa', 'equipe', 'responsavel', 'periodo', 'local', 'objetivo', 'deslocamento', 'intro', 'obs'].forEach(k => set(k, v[k]));
    const lista = (id, itens, fn) => { const el = doc.getElementById(id); el.replaceChildren(); itens.forEach(x => el.appendChild(fn(x))); };
    lista('servidores', v.servidores, n => Object.assign(doc.createElement('div'), { textContent: n }));
    lista('linhas', v.linhas, t => Object.assign(doc.createElement('div'), { textContent: t }));
    // assinaturas: cada servidor (o responsável por último, com a linha do responsável)
    const outros = v.servidores.filter(n => n !== v.responsavel);
    lista('assinaturas', outros, n => { const a = doc.createElement('div'); a.className = 'assin';
      a.innerHTML = '<div class="linha"></div><b></b><small>Assinatura e carimbo do Servidor</small>'; a.querySelector('b').textContent = n; return a; });
    const r = doc.getElementById('assin-resp');
    r.querySelector('b').textContent = v.responsavel; r.hidden = !v.responsavel;
    doc.getElementById('obs-linha').hidden = !v.obs;
    return v;
  }
  /* ---------- Termo de Repasse (ou de Destruição, CEASA) de produtos apreendidos (modelo termo-repasse.html) ----------
     Itens: os salvos pelo responsável (dados.repasseItens) ou, sem nada salvo, os produtos das apreensões da equipe (numeros.apreendidos).
     Nº padrão: o da equipe com 3 dígitos / ano do fim (033/2026); local e data: o local da BVA + o último dia do período. */
  const KG = { kg: 1, kgs: 1, quilo: 1, quilos: 1, quilograma: 1, quilogramas: 1, t: 1000, ton: 1000, tons: 1000, tonelada: 1000, toneladas: 1000 };
  const fatorKg = u => KG[String(u || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')];
  const qtd = v => Number(String(v == null ? '' : v).replace(',', '.')) || 0;
  function repasse(R) {
    const e = R.escala, d = R.dados || {}, pad = CONFIG.textosRelEquipe(e.bva), fim = dia(e.fim);
    const itens = Array.isArray(d.repasseItens) ? d.repasseItens.map(x => ({ ...x }))
      : (R.numeros.apreendidos || []).map(x => ({ tf: String(x.tf || ''), p: x.p, u: x.u || '', q: String(x.q) }));
    let kg = 0; const outras = {};
    itens.forEach(x => { const f = fatorKg(x.u); if (f) kg += qtd(x.q) * f; else if (x.q !== '') outras[x.u || 'sem unidade'] = (outras[x.u || 'sem unidade'] || 0) + qtd(x.q); });
    const tipo = pad.termo || 'Repasse';                                  // Repasse (Jundiá…) ou Destruição (CEASA)
    return { tipo, nome: `Termo de ${tipo}`, titulo: `TERMO DE ${tipo.toUpperCase()} DE PRODUTOS APREENDIDOS`, destruicao: tipo === 'Destruição',
      numero: d.repasseNumero || `${e.equipeNumero ? String(e.equipeNumero).padStart(3, '0') : '___'}/${String(e.fim).slice(0, 4)}`,
      localData: d.repasseLocalData || `${pad.repasseLocal}, ${fim ? `${fim.d} de ${fim.m} de ${fim.a}` : ''}.`,
      orgao: d.repasseOrgao != null && d.repasseOrgao !== '' ? d.repasseOrgao : pad.repasseOrgao, itens,
      kg: Math.round(kg * 1000) / 1000, outras, totalTxt: num(Math.round(kg * 1000) / 1000) + ' Kg' + Object.keys(outras).map(u => ` + ${num(outras[u])} ${u}`).join('') };
  }
  /** Preenche o modelo do Termo de Repasse (ou de Destruição). */
  function montarRepasse(doc, R) {
    const r = repasse(R), set = (k, t) => doc.querySelectorAll(`[data-c="${k}"]`).forEach(x => { x.textContent = t; });
    set('titulo', r.titulo); set('numero', r.numero); set('localData', r.localData); set('total', r.totalTxt); doc.title = r.nome;
    set('orgao', r.orgao ? `Assinatura e Carimbo do Servidor da ${r.orgao}` : r.destruicao ? 'Assinatura e Carimbo do Responsável no Local da Destruição' : 'Assinatura e Carimbo do Recebedor');
    const tb = doc.getElementById('itens'); tb.replaceChildren();
    r.itens.forEach(x => { const tr = doc.createElement('tr');
      [x.tf, x.p, x.u, x.q === '' ? '' : num(qtd(x.q))].forEach((t, i) => { const td = doc.createElement('td'); td.textContent = t; if (i !== 1) td.className = 'c'; tr.appendChild(td); });
      tb.appendChild(tr); });
    for (let i = r.itens.length; i < 6; i++) { const tr = doc.createElement('tr'); tr.innerHTML = '<td>&nbsp;</td><td></td><td></td><td></td>'; tb.appendChild(tr); }   // linhas em branco, como no papel
    return r;
  }
  window.RelEquipeDocs = { montar, valores, extenso, periodo, repasse, montarRepasse };
})();
