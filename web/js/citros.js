// PCE — citros: o que é próprio do programa nas visitas (IN 21/2018 cancro cítrico, Portaria 317/2021 HLB). Reconhece praga de citros e diz quais são as
// doenças da detecção do Termo de Fiscalização (que marca Presença/Ausência em caixas, sem frases prontas). HLB, Ácaro Hindustânico e Cancro Cítrico são obrigatórios na visita (no catálogo, não são
// opcionais); a Diaphorina citri (vetor) é opcional. O resto do cadastro de citros (atividade, comercialização, material de
// propagação) é da ficha oficial (CONFIG.PCE.fichas.modelos.citros), perguntada pelo pce-cadastros.js.
const PCECitros = (() => {
  const C = (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.citros) || {};
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const NOMES = new Set((C.pragas || []).map(norm)), TERMOS = (C.termos || []).map(norm);

  /** A praga/doença é de citros? (nome da lista CONFIG.PCE.citros.pragas ou texto com um dos termos: citr, cancro, hlb…) */
  const ehCitros = nome => { const n = norm(nome); return !!n && (NOMES.has(n) || TERMOS.some(t => n.includes(t))); };
  /** Nomes das doenças de detecção obrigatórias (ordem do Termo). */
  const nomesDeteccao = () => (C.deteccao || []).map(x => x[1]);
  return { ehCitros, nomesDeteccao };
})();
