// PCE — citros: o que é próprio do programa nas visitas (IN 21/2018 cancro cítrico, Portaria 317/2021 HLB). Reconhece praga de citros e escreve as
// frases de ausência/presença do Termo de Fiscalização. HLB, Ácaro Hindustânico e Cancro Cítrico são obrigatórios na visita (no catálogo, não são
// opcionais); a Diaphorina citri (vetor) é opcional e não marca o HLB. O resto do cadastro de citros (atividade, comercialização, material de
// propagação) é da ficha oficial (CONFIG.PCE.fichas.modelos.citros), perguntada pelo pce-cadastros.js.
const PCECitros = (() => {
  const C = (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.citros) || {};
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const NOMES = new Set((C.pragas || []).map(norm)), TERMOS = (C.termos || []).map(norm);
  const listaE = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || '');

  /** A praga/doença é de citros? (nome da lista CONFIG.PCE.citros.pragas ou texto com um dos termos: citr, cancro, hlb…) */
  const ehCitros = nome => { const n = norm(nome); return !!n && (NOMES.has(n) || TERMOS.some(t => n.includes(t))); };
  /** Praga → item da detecção que ela marca (cancro, hlb, acaro) ou ''. Diaphorina (vetor) não marca o HLB. */
  function chaveDaPraga(nome) {
    const n = norm(nome); if (!n || (C.naoMarcar || []).some(t => n.includes(norm(t)))) return '';
    return Object.keys(C.marcarPor || {}).find(x => C.marcarPor[x].some(t => n.includes(norm(t)))) || '';
  }
  /** Nomes das doenças de detecção obrigatórias (ordem do Termo). */
  const nomesDeteccao = () => (C.deteccao || []).map(x => x[1]);
  /**
   * Uma frase por doença da detecção, na ordem do Termo, ex.: "Ausência de sintomas de HLB nos frutos e folhas da cultura Laranja."
   * resultados = [{praga, resultado}] das pragas de citros avaliadas na visita: detectada ou suspeita = presença; não detectada = ausência.
   * culturas = culturas de citros avaliadas (vazio = só "da cultura"). Doença sem resposta fica de fora.
   */
  function frases(resultados, culturas) {
    const F = C.frases || {}, cs = [...new Set((culturas || []).map(x => String(x || '').trim()).filter(Boolean))];
    return (C.deteccao || []).map(([k, t]) => {
      const rs = (resultados || []).filter(r => chaveDaPraga(r.praga) === k && r.resultado).map(r => r.resultado);
      if (!rs.length) return '';
      const tem = rs.some(x => x === 'detectada' || x === 'suspeita') ? 'sim' : 'nao';
      return F[tem] ? F[tem].replace('{praga}', t).replace('{culturas}', cs.length ? ' ' + listaE(cs) : '') : '';
    }).filter(Boolean);
  }
  return { ehCitros, chaveDaPraga, nomesDeteccao, frases, listaE };
})();
