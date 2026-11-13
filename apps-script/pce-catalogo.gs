/* ---------- Catálogo do PCE: famílias, culturas e pragas (painel, gerência) ----------
 * Modelo (docs/arquitetura.md, seção do PCE): cada praga pertence a um programa (campo "programa"; um Termo e um PDF por programa, e várias pragas
 * podem dividir um: Citros com HLB, cancro, ácaro...). Programas = os grupos do relatório do convênio: Pragas dos Citros, Pragas da Soja, Monilíase do
 * Cacaueiro e Cupuaçuzeiro, Mosca-da-Carambola, Pragas da Bananeira e Pragas da Mandioca. Praga "opcional" (Moko, Pinta Preta...) vem marcada "Não tem" na visita (a pessoa só troca para "Tem"), conta como avaliada no Termo do programa dela e não gera Termo próprio; a família agrupa culturas e define o modelo de cadastro;
 * pragas de uma cultura = as ligadas à família dela + as ligadas só a ela (PragasDasFamilias, PragasDasCulturas).
 * Fonte única = abas da planilha. Enquanto ninguém editou, vale a base abaixo (CATALOGO_PCE_BASE_, igual ao CONFIG.PCE do app);
 * a primeira gravação no painel copia a base para as abas e daí em diante só as abas valem. Ligação desfeita = ativo 0 (nada é apagado).
 * Os ids nascem do nome (pceId_) e não mudam depois: a migração liga o texto gravado nos levantamentos antigos ao catálogo por eles.
 * Quem lê: quem tem o módulo PCE (painel e app, pelo sync). Quem grava: gerência + PCE. Tudo em HistoricoDeAlteracoes.
 */
const MODELOS_CADASTRO_PCE_ = ['citros', 'banana', 'moniliase', 'mandioca', 'soja', 'propriedade'];   // um formulário e um PDF por modelo
const TIPOS_PRAGA_PCE_ = ['doenca', 'praga'];
// Enquadramento legal por praga: planilha da GDV (docs/modulos/pce-legislacao.csv); igual a CONFIG.PCE.legislacao (o teste pce_legislacao_test confere).
const LEGISLACAO_PCE_ = {
      'Monilíase do Cacaueiro': 'IN 112 DE 11/12/2020; SDA Nº 703 DE 21/11/2022; PORTARIA Nº 337/23 DE 11 DE AGOSTO DE 2023; PORTARIA Nº 263/2024; MAPA 818/2025',
      'HLB / Greening': 'Portaria SDA/MAPA nº 1.326, de 4 de julho de 2025; IN SDA/MAPA nº 38',
      'Cancro Cítrico': 'IN MAPA nº 21/2018; IN SDA/MAPA nº 38',
      'Schizotetranychus hindustanicus': 'IN MAPA nº 8/2012; IN SDA/MAPA nº 38, de 1º de outubro de 2018',
      'Bactrocera carambolae': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA n° 1.545; PORTARIA SDA/MAPA nº 1.569, de 13 de março de 2026; Portaria SDA/MAPA n° 1.675 de 26 de agosto de 2026; Portaria MAPA n° 855, de 7 de novembro de 2025; Portaria MAPA nº 627, de 10 de novembro de 2023; Portaria SDA/MAPA n° 859, de 19 de julho de 2023; Portaria SDA/MAPA nº 780, de 06 de abril de 2023',
      'Phakopsora pachyrhizi': 'Portaria SDA/MAPA nº 1.124, de 25 de junho de 2024; Portaria SDA/MAPA nº 1.579, de 9 de abril de 2026',
      'Amaranthus palmeri': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA nº 1.119',
      'Vassoura de Bruxa da Mandioca': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA nº 1.257; Portaria MAPA nº 769',
      'Fusarium R4T': 'Portaria SDA/MAPA nº 1.291, de 22 de maio de 2025; Instrução Normativa SDA/MAPA nº 131 de 27 de junho de 2019; Instrução Normativa SDA/MAPA nº 30 de 05 de junho de 2020'
};

// Base do catálogo: as culturas e pragas de CONFIG.PCE (web/js/config.js) + os hospedeiros da monilíase e as pragas dos modelos de cadastro
// (Moko, Sigatoka). Nome científico e enquadramento ficam vazios onde não há fonte segura: a gerência completa no painel.
const CATALOGO_PCE_BASE_ = {
  familias: [
    { nome: 'Citros', modeloCadastro: 'citros', culturas: ['Laranja', 'Limão', 'Tangerina'] },
    { nome: 'Bananeira', modeloCadastro: 'banana', culturas: ['Banana'] },
    { nome: 'Cacau e cupuaçu', modeloCadastro: 'moniliase', culturas: ['Cacau', 'Cupuaçu', 'Herrania', 'Cacauí', 'Cupuí', 'Macambo'] },
    { nome: 'Mandioca', modeloCadastro: 'mandioca', culturas: ['Mandioca'] },
    { nome: 'Soja', modeloCadastro: 'soja', culturas: ['Soja'] }
  ],
  culturasSemFamilia: ['Açaí', 'Guaraná', 'Pimenta-do-reino', 'Milho', 'Feijão', 'Arroz', 'Café', 'Coco', 'Abacaxi', 'Mamão', 'Melancia',
    'Maracujá', 'Castanha-do-Brasil', 'Pupunha', 'Dendê', 'Urucum', 'Seringueira', 'Hortaliças diversas', 'Algodão', 'Cana-de-açúcar',
    'Carambola', 'Goiaba', 'Manga', 'Acerola', 'Caju', 'Jaca', 'Pitanga', 'Jambo', 'Taperebá', 'Sapotilha', 'Abiu', 'Araçá-boi', 'Biribá', 'Fruta-pão', 'Tomate', 'Pimenta de cheiro'],
  // nomeAntigo = o texto de CONFIG.PCE.pragas que os levantamentos gravaram (dá o id); nomeNoTF = quadro do Termo de Fiscalização
  pragas: [
    { nomeAntigo: 'Bactrocera carambolae', nomePopular: 'Mosca-da-carambola', nomeCientifico: 'Bactrocera carambolae', tipo: 'praga', nomeNoTF: 'Mosca-da-Carambola', programa: 'Mosca-da-Carambola',
      culturas: ['Carambola', 'Goiaba', 'Manga', 'Acerola', 'Caju', 'Jaca', 'Pitanga', 'Jambo', 'Taperebá', 'Sapotilha', 'Abiu', 'Araçá-boi', 'Biribá', 'Fruta-pão', 'Tomate', 'Pimenta de cheiro', 'Mamão'] },   // hospedeiros: docs/modulos/pce-hospedeiros.md; citros é hospedeiro sem resposta obrigatória (CONFIG.PCE.hospedeiros)
    { nomeAntigo: 'Schizotetranychus hindustanicus', nomePopular: 'Ácaro Hindustânico', nomeCientifico: 'Schizotetranychus hindustanicus', tipo: 'praga',
      nomeNoTF: 'Ácaro Hindustânico', familias: ['Citros'], programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Phakopsora pachyrhizi', nomePopular: 'Ferrugem asiática da soja', nomeCientifico: 'Phakopsora pachyrhizi', tipo: 'doenca',
      nomeNoTF: 'Ferrugem Asiática da soja', familias: ['Soja'], programa: 'Pragas da Soja' },
    { nomeAntigo: 'HLB / Greening', nomePopular: 'HLB / Greening', nomeCientifico: 'Candidatus Liberibacter spp.', tipo: 'doenca', nomeNoTF: 'HLB',
      familias: ['Citros'], programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Cancro Cítrico', nomePopular: 'Cancro Cítrico', nomeCientifico: 'Xanthomonas citri subsp. citri', tipo: 'doenca', nomeNoTF: 'Cancro Cítrico',
      familias: ['Citros'], programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Fusarium R4T', nomePopular: 'Fusariose (FOC R4T)', nomeCientifico: 'Fusarium oxysporum f. sp. cubense raça 4 tropical', tipo: 'doenca',
      nomeNoTF: 'Fusariose FOC R4T', familias: ['Bananeira'], opcional: true, programa: 'Pragas da Bananeira' },   // ausente no Brasil: ação é educação sanitária; no levantamento, opcional (identificada ou não)
    { nomeAntigo: 'Monilíase do Cacaueiro', nomePopular: 'Monilíase do Cacaueiro', nomeCientifico: 'Moniliophthora roreri', tipo: 'doenca', nomeNoTF: 'Monilíase',
      familias: ['Cacau e cupuaçu'], programa: 'Monilíase do Cacaueiro e Cupuaçuzeiro' },
    { nomeAntigo: 'Vassoura de Bruxa da Mandioca', nomePopular: 'Vassoura-de-bruxa da Mandioca', nomeCientifico: '', tipo: 'doenca',
      nomeNoTF: 'Vassoura-de-bruxa da Mandioca', familias: ['Mandioca'], programa: 'Pragas da Mandioca' },
    { nomeAntigo: 'Amaranthus palmeri', nomePopular: 'Amaranthus palmeri', nomeCientifico: 'Amaranthus palmeri', tipo: 'praga', nomeNoTF: 'Amaranthus palmeri',
      familias: ['Soja'], opcional: true, programa: 'Pragas da Soja' },
    { nomeAntigo: 'Diaphorina citri (vetor do HLB)', nomePopular: 'Diaphorina citri (vetor do HLB)', nomeCientifico: 'Diaphorina citri', tipo: 'praga',
      nomeNoTF: 'Diaphorina citri', familias: ['Citros'], opcional: true, programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Pinta Preta dos Citros', nomePopular: 'Pinta Preta dos Citros', nomeCientifico: 'Phyllosticta citricarpa', tipo: 'doenca', familias: ['Citros'], opcional: true, programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Leprose dos Citros', nomePopular: 'Leprose dos Citros', nomeCientifico: '', tipo: 'doenca', familias: ['Citros'], opcional: true, programa: 'Pragas dos Citros' },
    { nomeAntigo: 'Moko da Bananeira', nomePopular: 'Moko da Bananeira', nomeCientifico: 'Ralstonia solanacearum raça 2', tipo: 'doenca', familias: ['Bananeira'], opcional: true, programa: 'Pragas da Bananeira' },
    { nomeAntigo: 'Sigatoka Negra', nomePopular: 'Sigatoka Negra', nomeCientifico: 'Pseudocercospora fijiensis', tipo: 'doenca', familias: ['Bananeira'], opcional: true, programa: 'Pragas da Bananeira' }
  ]
};

/** Id estável a partir do nome: minúsculas sem acento, palavras ligadas por hífen ("HLB / Greening" → "hlb-greening"). */
function pceId_(nome) { return normPub_(nome).replace(/ /g, '-').slice(0, 60); }
const ABAS_CATALOGO_PCE_ = ['FamiliasDeCulturas', 'Culturas', 'Pragas', 'PragasDasFamilias', 'PragasDasCulturas'];

/** Base em linhas (o mesmo formato das abas). */
function catalogoPceBase_() {
  const B = CATALOGO_PCE_BASE_, cat = { familias: [], culturas: [], pragas: [], pragasDasFamilias: [], pragasDasCulturas: [] };
  B.familias.forEach(function (f) {
    cat.familias.push({ id: pceId_(f.nome), nome: f.nome, modeloCadastro: f.modeloCadastro, ativo: 1 });
    f.culturas.forEach(function (c) { cat.culturas.push({ id: pceId_(c), nome: c, nomeCientifico: '', familiaId: pceId_(f.nome), cultivares: '', ativo: 1 }); });
  });
  B.culturasSemFamilia.forEach(function (c) { cat.culturas.push({ id: pceId_(c), nome: c, nomeCientifico: '', familiaId: '', cultivares: '', ativo: 1 }); });
  B.pragas.forEach(function (p) {
    const id = pceId_(p.nomeAntigo);
    cat.pragas.push({ id: id, nomePopular: p.nomePopular, nomeCientifico: p.nomeCientifico || '', tipo: p.tipo, enquadramentoLegal: LEGISLACAO_PCE_[p.nomeAntigo] || '',
                      nomeNoTF: p.nomeNoTF || '', ativo: 1, programa: p.programa || '',
                      levantamento: p.semLevantamento ? 0 : 1, opcional: p.opcional ? 1 : 0 });
    (p.familias || []).forEach(function (f) { cat.pragasDasFamilias.push({ id: id + '|' + pceId_(f), pragaId: id, familiaId: pceId_(f), ativo: 1 }); });
    (p.culturas || []).forEach(function (c) { cat.pragasDasCulturas.push({ id: id + '|' + pceId_(c), pragaId: id, culturaId: pceId_(c), ativo: 1 }); });
  });
  return cat;
}

/** Catálogo em uso: as abas, ou a base enquanto as abas estão vazias. Leitura pura (não cria aba). */
function catalogoPce_() {
  const abas = { familias: lerLeitura_('FamiliasDeCulturas'), culturas: lerLeitura_('Culturas'), pragas: lerLeitura_('Pragas'),
                 pragasDasFamilias: lerLeitura_('PragasDasFamilias'), pragasDasCulturas: lerLeitura_('PragasDasCulturas') };
  const cat = abas.pragas.length || abas.culturas.length ? abas : catalogoPceBase_();
  const limpa = function (l) { return l.filter(function (x) { return x.id; }); };
  const at = function (x) { return Number(x.ativo) === 0 ? 0 : 1; };
  return {
    familias: limpa(cat.familias).map(function (f) { return { id: f.id, nome: f.nome, modeloCadastro: f.modeloCadastro || '', ativo: at(f) }; }),
    culturas: limpa(cat.culturas).map(function (c) {
      return { id: c.id, nome: c.nome, nomeCientifico: c.nomeCientifico || '', familiaId: c.familiaId || '', cultivares: c.cultivares || '', ativo: at(c),
               atualizadoEm: Number(c.atualizadoEm) || 0, atualizadoPor: c.atualizadoPor || '' }; }),
    pragas: limpa(cat.pragas).map(function (p) {
      return { id: p.id, nomePopular: p.nomePopular, nomeCientifico: p.nomeCientifico || '', tipo: TIPOS_PRAGA_PCE_.indexOf(p.tipo) >= 0 ? p.tipo : 'praga',
               enquadramentoLegal: p.enquadramentoLegal || '', nomeNoTF: p.nomeNoTF || '', ativo: at(p), programa: p.programa || '', levantamento: Number(p.levantamento) === 0 && p.levantamento !== '' ? 0 : 1, opcional: Number(p.opcional) === 1 ? 1 : 0,
               atualizadoEm: Number(p.atualizadoEm) || 0, atualizadoPor: p.atualizadoPor || '' }; }),
    // só as ligações valendo
    pragasDasFamilias: limpa(cat.pragasDasFamilias).filter(function (l) { return at(l); }).map(function (l) { return { pragaId: l.pragaId, familiaId: l.familiaId }; }),
    pragasDasCulturas: limpa(cat.pragasDasCulturas).filter(function (l) { return at(l); }).map(function (l) { return { pragaId: l.pragaId, culturaId: l.culturaId }; }),
    modelosCadastro: MODELOS_CADASTRO_PCE_.slice()
  };
}

/** Ids das pragas ativas de uma cultura: as da família dela + as ligadas direto a ela. */
function pragasDaCulturaPce_(cat, culturaId) {
  const c = cat.culturas.filter(function (x) { return x.id === culturaId; })[0];
  if (!c) return [];
  const ativas = {}; cat.pragas.forEach(function (p) { if (p.ativo) ativas[p.id] = true; });
  const ids = [];
  const pega = function (id) { if (ativas[id] && ids.indexOf(id) < 0) ids.push(id); };
  if (c.familiaId) cat.pragasDasFamilias.forEach(function (l) { if (l.familiaId === c.familiaId) pega(l.pragaId); });
  cat.pragasDasCulturas.forEach(function (l) { if (l.culturaId === culturaId) pega(l.pragaId); });
  return ids;
}

/** Recusa quem não tem o módulo PCE (painel). */
function exigirPcePainel_() {
  if (!(USUARIO_ATUAL_ && USUARIO_ATUAL_.modulos && USUARIO_ATUAL_.modulos.pce)) throw new Error('Sem autorização para o módulo PCE. Fale com a gerência.');
}
const podeEditarCatalogoPce_ = function () { return !!(USUARIO_ATUAL_ && (USUARIO_ATUAL_.permissoes || []).indexOf('gerencia') >= 0 && USUARIO_ATUAL_.modulos.pce); };

/** painelPceCatalogo: o catálogo em uso e se quem pede pode editar (gerência + PCE). */
function painelPceCatalogo(token) {
  adminDoToken_(token);
  exigirPcePainel_();
  return { ok: true, catalogo: catalogoPce_(), podeEditar: podeEditarCatalogoPce_() };
}

/** Abas vazias: grava a base (dentro do lock). Chamado antes da primeira alteração. */
function semearCatalogoPce_(quem, agora) {
  if (lerLinhas_('Pragas').length || lerLinhas_('Culturas').length) return;
  const b = catalogoPceBase_(), aut = { criadoEm: agora, criadoPor: 'base do sistema', atualizadoEm: agora, atualizadoPor: 'base do sistema' };
  const com = function (l, campos) { return l.map(function (x) { return Object.assign({}, x, campos); }); };
  inserir_('FamiliasDeCulturas', com(b.familias, aut));
  inserir_('Culturas', com(b.culturas, aut));
  inserir_('Pragas', com(b.pragas, aut));
  inserir_('PragasDasFamilias', com(b.pragasDasFamilias, { atualizadoEm: agora, atualizadoPor: 'base do sistema' }));
  inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: 'semear catálogo do PCE',
    tabela: 'Pragas', registroId: '', antes: '', depois: JSON.stringify({ familias: b.familias.length, culturas: b.culturas.length, pragas: b.pragas.length }) }]);
}

/**
 * painelPceCatalogoSalvar {tipo: 'familia'|'cultura'|'praga', item}: cria ou altera um item (gerência + PCE).
 * praga: item.familias e item.culturas = ids ligados (a lista substitui a anterior); cultura: item.pragas = pragas ligadas só a ela.
 * Devolve {item, catalogo}.
 */
function painelPceCatalogoSalvar(token, req) {
  const quem = adminDoToken_(token, true);
  exigirPcePainel_();
  const tipo = req && req.tipo, it = req && req.item;
  if (['familia', 'cultura', 'praga'].indexOf(tipo) < 0 || !it || typeof it !== 'object') throw new Error('Informe o que salvar (família, cultura ou praga).');
  const txt = function (v, max) { return textoAutor_(String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ')).slice(0, max); };
  const ids = function (v) { return Array.isArray(v) ? v.map(function (x) { return String(x || '').slice(0, 60); }).filter(Boolean) : null; };
  const ativo = it.ativo === false || it.ativo === 0 ? 0 : 1;
  let aba, reg, nomeCampo;
  if (tipo === 'familia') {
    aba = 'FamiliasDeCulturas'; nomeCampo = 'nome';
    reg = { nome: txt(it.nome, 60), modeloCadastro: String(it.modeloCadastro || ''), ativo: ativo };
    if (reg.modeloCadastro && MODELOS_CADASTRO_PCE_.indexOf(reg.modeloCadastro) < 0) throw new Error('Modelo de cadastro inválido.');
  } else if (tipo === 'cultura') {
    aba = 'Culturas'; nomeCampo = 'nome';
    reg = { nome: txt(it.nome, 60), nomeCientifico: txt(it.nomeCientifico, 120), familiaId: String(it.familiaId || '').slice(0, 60), cultivares: txt(it.cultivares, 300), ativo: ativo };
  } else {
    aba = 'Pragas'; nomeCampo = 'nomePopular';
    reg = { nomePopular: txt(it.nomePopular, 80), nomeCientifico: txt(it.nomeCientifico, 120), tipo: TIPOS_PRAGA_PCE_.indexOf(it.tipo) >= 0 ? it.tipo : 'praga',
            enquadramentoLegal: txt(it.enquadramentoLegal, 1000), nomeNoTF: txt(it.nomeNoTF, 60), programa: txt(it.programa, 60),
            levantamento: it.levantamento === false || it.levantamento === 0 ? 0 : 1, opcional: it.opcional === true || it.opcional === 1 ? 1 : 0, ativo: ativo };
  }
  if (reg[nomeCampo].length < 2) throw new Error('Informe o nome.');
  const ligaFam = tipo === 'praga' ? ids(it.familias) : null, ligaCult = tipo === 'praga' ? ids(it.culturas) : tipo === 'cultura' ? ids(it.pragas) : null;

  return comLock_(function () {
    const agora = Date.now();
    semearCatalogoPce_(quem, agora);
    const linhas = lerLinhas_(aba), id0 = String(it.id || '').trim();
    const atual = id0 ? linhas.filter(function (x) { return x.id === id0; })[0] : null;
    if (id0 && !atual) throw new Error('Este item não existe mais. Atualize a tela.');
    if (linhas.some(function (x) { return x.id !== id0 && normPub_(x[nomeCampo]) === normPub_(reg[nomeCampo]); })) throw new Error('Já existe "' + reg[nomeCampo] + '" no catálogo.');
    if (tipo === 'cultura' && reg.familiaId && !lerLinhas_('FamiliasDeCulturas').some(function (f) { return f.id === reg.familiaId; })) throw new Error('Família não encontrada.');
    let id = id0;
    if (!atual) { id = pceId_(reg[nomeCampo]); let n = 2; while (linhas.some(function (x) { return x.id === id; })) id = pceId_(reg[nomeCampo]) + '-' + (n++); }
    const aut = { atualizadoEm: agora, atualizadoPor: textoAutor_(quem) };
    if (atual) atualizar_(aba, atual._linha, Object.assign({}, reg, aut));
    else inserir_(aba, [Object.assign({ id: id, criadoEm: agora, criadoPor: textoAutor_(quem) }, reg, aut)]);
    // ligações: a lista enviada substitui as ligações daquele item (as que saem ficam com ativo 0)
    const ligar = function (abaL, campoItem, campoAlvo, alvos) {
      if (!alvos) return;
      const ls = lerLinhas_(abaL).filter(function (l) { return l[campoItem] === id; });
      ls.forEach(function (l) { const quer = alvos.indexOf(l[campoAlvo]) >= 0 ? 1 : 0; if (Number(l.ativo) !== quer) atualizar_(abaL, l._linha, Object.assign({ ativo: quer }, aut)); });
      const novos = alvos.filter(function (a) { return !ls.some(function (l) { return l[campoAlvo] === a; }); });
      inserir_(abaL, novos.map(function (a) { const o = { ativo: 1 }; o[campoItem] = id; o[campoAlvo] = a;
        o.id = campoItem === 'pragaId' ? id + '|' + a : a + '|' + id; return Object.assign(o, aut); }));
    };
    if (tipo === 'praga') { ligar('PragasDasFamilias', 'pragaId', 'familiaId', ligaFam); ligar('PragasDasCulturas', 'pragaId', 'culturaId', ligaCult); }
    if (tipo === 'cultura') ligar('PragasDasCulturas', 'culturaId', 'pragaId', ligaCult);
    const antes = atual ? Object.assign({}, atual) : null; if (antes) delete antes._linha;
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem),
      acao: (atual ? 'alterar ' : 'cadastrar ') + tipo + ' (catálogo do PCE)', tabela: aba, registroId: id, antes: antes ? JSON.stringify(antes) : '',
      depois: JSON.stringify(Object.assign({}, reg, ligaFam ? { familias: ligaFam } : {}, ligaCult ? (tipo === 'praga' ? { culturas: ligaCult } : { pragas: ligaCult }) : {})) }]);
    return { ok: true, item: Object.assign({ id: id }, reg), catalogo: catalogoPce_() };
  });
}
