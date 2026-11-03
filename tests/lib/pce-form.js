// Formulário do levantamento do PCE por cultura (web/js/pce.js): um card .pce-cultura por cultura, com as pragas dela em .pce-pr
// (as do catálogo vêm sozinhas, com data-nome; as somadas em "+ Outra praga" têm o seletor .r-praga).
const cult = i => `.pce-cultura >> nth=${i}`;

/** Escolhe a cultura do card i (cria o card se ainda não existe). */
async function cultura(p, i, nome) {
  if (i >= await p.locator('.pce-cultura').count()) await p.click('#pce-addcult');
  await p.selectOption(`${cult(i)} >> .c-cultura`, nome);
}

/** Bloco da praga no card i: a do catálogo ou, se não houver, uma somada em "+ Outra praga/doença" (nome digitado se não estiver na lista). */
async function praga(p, i, nome) {
  let b = p.locator(`${cult(i)} >> .pce-pr[data-nome="${nome}"]`);
  if (await b.count()) return b.first();
  await p.click(`${cult(i)} >> .pce-addpraga`);
  b = p.locator(`${cult(i)} >> .pce-pr`).last();
  const tem = await b.locator(`.r-praga option`, { hasText: nome }).count();
  if (tem) await b.locator('.r-praga').selectOption({ label: nome });
  else { await b.locator('.r-praga').selectOption('__outra'); await b.locator('.r-outra').fill(nome); }
  return b;
}

/** Resultado (detectada | nao_detectada | suspeita) de uma praga no card i; amostra = {tipo, codigo, destino} marca a coleta. */
async function responder(p, i, nome, resultado, amostra) {
  const b = await praga(p, i, nome);
  await b.locator(`.pce-res-${resultado}`).click();
  if (amostra) {
    await b.locator('.r-coleta').selectOption('Sim');
    if (amostra.tipo) await b.locator('.r-tipoMaterial').fill(amostra.tipo);
    if (amostra.codigo) await b.locator('.r-codigoAmostra').fill(amostra.codigo);
    if (amostra.destino) await b.locator('.r-destinoAmostra').fill(amostra.destino);
  }
  return b;
}

/** Responde todas as pragas obrigatórias do card i que ainda estão sem resultado (padrão: não detectada). */
async function responderObrigatorias(p, i, resultado = 'nao_detectada') {
  const n = await p.locator(`${cult(i)} >> .pce-pr`).count();
  for (let k = 0; k < n; k++) {
    const b = p.locator(`${cult(i)} >> .pce-pr`).nth(k);
    if (!/\*/.test(await b.locator('legend').textContent())) continue;
    if (await b.locator('.r-res:checked').count()) continue;
    await b.locator(`.pce-res-${resultado}`).click();
  }
}

/** Cultura no card i com as pragas dadas ({praga: resultado}) e as demais obrigatórias como "não detectada". */
async function preencherCultura(p, i, nome, respostas = {}) {
  await cultura(p, i, nome);
  for (const [pr, res] of Object.entries(respostas)) await responder(p, i, pr, res);
  await responderObrigatorias(p, i);
}

module.exports = { cult, cultura, praga, responder, responderObrigatorias, preencherCultura };
