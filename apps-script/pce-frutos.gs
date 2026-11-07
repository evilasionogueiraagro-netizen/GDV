/* ---------- PCE: frutos da propriedade ----------
 * Coluna `frutos` da aba Propriedades (JSON). Cada fruto: {id, cultura, cultivar, area, espLinha, espPlanta, espUnidade (m | cm), idade,
 * quantidade, producao, destino, excluido, em, por}. O app salva a propriedade pelo sync com a lista inteira; o servidor normaliza e MESCLA por
 * id (frutosMesclar_): fruto que a planilha tem e o envio não traz fica; fruto removido vem com excluido = 1; reenvio de aparelho desatualizado
 * (propriedade com atualizadoEm menor) só acrescenta frutos novos. `em` (ms) e `por` (login) são do servidor e dizem quando e quem mudou o fruto
 * (`por` não vai para os aparelhos).
 * Sugestão de frutos (frutosSugeridos_): propriedade sem frutos recebe, só para leitura, a lista derivada dos levantamentos antigos; vira cadastro
 * quando o app salva (só insere: nunca sobrescreve fruto existente).
 */
const MAX_FRUTOS_ = 60;

/** Número ≥ 0 (ponto ou vírgula), arredondado em 3 casas; vazio ou inválido = ''. */
function numFruto_(v, inteiro) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (!s) return '';
  const n = Number(s);
  if (!isFinite(n) || n < 0) return '';
  return inteiro ? Math.round(n) : Math.round(n * 1000) / 1000;
}

/** Fruto recebido → fruto normalizado (só as chaves conhecidas); null se não for objeto ou não tiver id/cultura. */
function frutoNormalizar_(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const id = String(f.id === null || f.id === undefined ? '' : f.id).trim().slice(0, 64);
  const cultura = textoCurto_(f.cultura, 60);
  if (!id || !cultura || /^['=+\-@]/.test(id)) return null;
  return { id: id, cultura: cultura, cultivar: textoCurto_(f.cultivar, 80), area: numFruto_(f.area), espLinha: numFruto_(f.espLinha), espPlanta: numFruto_(f.espPlanta),
           espUnidade: f.espUnidade === 'm' || f.espUnidade === 'cm' ? f.espUnidade : '', idade: numFruto_(f.idade), quantidade: numFruto_(f.quantidade, true),
           producao: numFruto_(f.producao), destino: textoCurto_(f.destino, 120), excluido: Number(f.excluido) === 1 ? 1 : 0 };
}

/** Lista de frutos (array ou texto JSON) → lista normalizada, sem id repetido; no máximo MAX_FRUTOS_. */
function frutosLista_(v) {
  const a = Array.isArray(v) ? v : lerJSONSeguro_(v, []), vistos = {}, out = [];
  (Array.isArray(a) ? a : []).forEach(function (f) {
    const n = frutoNormalizar_(f);
    if (!n || vistos[n.id]) return;
    vistos[n.id] = true;
    const em = Number(f.em), por = textoCurto_(f.por, 80);
    if (em > 0) n.em = em;
    if (por) n.por = por;
    out.push(n);
  });
  return out.slice(0, MAX_FRUTOS_);
}

const CAMPOS_FRUTO_ = ['cultura', 'cultivar', 'area', 'espLinha', 'espPlanta', 'espUnidade', 'idade', 'quantidade', 'producao', 'destino', 'excluido'];
function frutoIgual_(a, b) { return CAMPOS_FRUTO_.every(function (c) { return String(a[c]) === String(b[c]); }); }

/**
 * Frutos gravados + frutos recebidos → texto JSON a gravar. `novoMaisNovo` = o envio é de propriedade com atualizadoEm >= o da planilha:
 * então o fruto recebido vale sobre o gravado de mesmo id; senão só entram os frutos que a planilha não tem. Nada é apagado.
 * Fruto novo ou alterado recebe em = agora e por = usuario.
 */
function frutosMesclar_(atual, novo, novoMaisNovo, usuario, agora) {
  const gravados = frutosLista_(atual), recebidos = frutosLista_(novo), porId = {};
  gravados.forEach(function (f) { porId[f.id] = f; });
  const out = gravados.slice();
  recebidos.forEach(function (r) {
    const g = porId[r.id];
    if (!g) {
      if (out.length >= MAX_FRUTOS_) return;
      r.em = agora; r.por = textoCurto_(usuario, 80);
      porId[r.id] = r; out.push(r);
    } else if (novoMaisNovo && !frutoIgual_(g, r)) {
      r.em = agora; r.por = textoCurto_(usuario, 80);
      out[out.indexOf(g)] = r; porId[r.id] = r;
    }
  });
  return out.length ? JSON.stringify(out) : '';
}

/** Frutos como o aparelho recebe: texto JSON sem `por` (login do servidor não vai para o campo). */
function frutosParaApp_(txt) {
  const l = frutosLista_(txt);
  l.forEach(function (f) { delete f.por; });
  return l.length ? JSON.stringify(l) : '';
}

/** Índice dos levantamentos/visitas por propriedade: p → lista (mais recente primeiro) ligada pelo código ou por produtor (doc) + nome da propriedade. */
function indiceVisitasPorPropriedade_(visitas) {
  const chaveCod = function (c) { const s = normPub_(c); return s ? 'C:' + s : ''; };
  const chaveNome = function (doc, nome) { const d = digitos_(doc), n = normPub_(nome); return d && n ? 'N:' + d + '|' + n : ''; };
  const idx = {};
  visitas.forEach(function (r) {
    [chaveCod(r.codigoPropriedade), chaveNome(r.doc, r.propriedade)].forEach(function (k) { if (k) (idx[k] = idx[k] || []).push(r); });
  });
  return function (p) {
    const vistos = {}, lista = [];
    [chaveCod(p.codigo), chaveNome(p.doc, p.nome)].forEach(function (k) {
      (idx[k] || []).forEach(function (r) { if (!vistos[r.id]) { vistos[r.id] = 1; lista.push(r); } });
    });
    lista.sort(function (a, b) { return String(b.data + ' ' + b.hora).localeCompare(String(a.data + ' ' + a.hora)); });
    return lista;
  };
}

/**
 * Sugestão de frutos de uma propriedade SEM frutos, a partir dos levantamentos antigos dela (mais recente primeiro): uma linha por cultura,
 * com a maior área vista e o espaçamento do levantamento mais recente que o tem. Ids "sug-<cultura>" (estáveis). Só leitura: o app mostra e,
 * se o fiscal salvar, vira cadastro. Propriedade que já tem frutos (mesmo só excluídos) não recebe sugestão.
 */
function frutosSugeridos_(propFrutos, levsAntigos) {
  if (frutosLista_(propFrutos).length) return [];
  const por = {}, ordem = [];
  levsAntigos.forEach(function (lev) {
    pragasLev_(lev).forEach(function (g) {
      g.culturas.forEach(function (c) {
        const k = pceId_(c.cultura);
        if (!k) return;
        if (!por[k]) { por[k] = { id: 'sug-' + k, cultura: c.cultura, cultivar: '', area: '', espLinha: '', espPlanta: '', espUnidade: '', idade: '', quantidade: '', producao: '', destino: '', excluido: 0, sugerido: 1 }; ordem.push(k); }
        const f = por[k], area = numFruto_(c.area);
        if (area !== '' && (f.area === '' || area > f.area)) f.area = area;
        if (f.espLinha === '' && f.espPlanta === '' && (numFruto_(c.espLinha) !== '' || numFruto_(c.espPlanta) !== '')) {
          f.espLinha = numFruto_(c.espLinha); f.espPlanta = numFruto_(c.espPlanta); f.espUnidade = c.espUnidade === 'm' || c.espUnidade === 'cm' ? c.espUnidade : '';
        }
      });
    });
  });
  return ordem.map(function (k) { return por[k]; });
}
