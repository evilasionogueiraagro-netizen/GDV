const amb = require('./lib/amb');
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
// PCE — Ficha oficial e Termo de Fiscalização em modelo único (documentos/pce-ficha.html guiado por CONFIG.PCE.fichas, documentos/pce-termo.html).
// Renderiza os 6 modelos (citros, banana, cacau e cupuaçu, mandioca, soja, propriedade) com dados novos (produtor, propriedade com frutos, dados do
// modelo e visita mais recente) e com o formato antigo (CadastrosPCE já gravado), e o Termo de citros (antigo) e de outro programa (novo).
// Confere: mesma ordem de seções nos 6, todos os campos oficiais do papel presentes, uma folha A4 cada, o texto próprio do Termo de citros.
// Gera o PDF (A4) e o PNG de cada documento em tests/saida/pce-fichas/. Só dados fictícios. Não usa fakegas: serve web/ por conta própria se preciso.
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 700))); if (!c) falhas++; };
const SAIDA = amb.saida('pce-fichas');
fs.mkdirSync(SAIDA, { recursive: true });

// ---------------------------------------------------------------- dados fictícios
const prodBase = { nome: 'Maria Ficticia da Silva Teste', doc: '11144477735', telefone: '(92) 90000-0000' };
const propBase = { nome: 'Sitio Exemplo Teste', cnpj: '11222333000181', codigo: 'AM-0001', municipio: 'Manaus', uf: 'AM', lat: -3.119, lon: -60.0217, endereco: 'Ramal Ficticio, km 3',
  viaAcesso: 'terrestre', situacaoFundiaria: 'Propriedade titulada', comercial: 'sim' };
const fichaBase = { numeroTxt: '001-2026-MANAUS', data: '2026-11-03', local: 'Manaus', servidor: 'Servidor Ficticio Teste', cargo: 'Fiscal Agropecuário Engenheiro Agrônomo', matricula: '0000', lotacao: 'ULBRA, Manaus' };
const rt = { nome: 'Eng. Agr. Fictício Teste', conselho: 'CREA-AM 0000' };
const F = (cultura, cultivar, area, idade, quantidade, producao, destino, extra = {}) => ({ id: cultura + cultivar, cultura, cultivar, area, espLinha: '3', espPlanta: '2', espUnidade: 'm', idade, quantidade, producao, destino, ...extra });
const P = (praga, resultado, extra = {}) => ({ praga, resultado, ...extra });
const visita = (culturas, extra = {}) => ({ id: 'v1', data: '2026-11-03', culturas, ...extra });

const NOVOS = {
  citros: { propriedade: { ...propBase, frutos: [F('Laranja', 'Pera', '4,5', '5', '1200', '30', 'Feira'), F('Limão', 'Tahiti', '2', '3', '500', '12', 'Atravessador'), F('Banana', 'Prata', '1', '2', '300', '5', 'Feira')] },
    dados: { atividades: ['frutos', 'viveiro_mudas'], entrega: 'sim', formasEntrega: ['caixa'], compradores: ['feira', 'outros'], compradorOutros: 'Merenda escolar', beneficia: 'nao', materiais: ['muda', 'borbulha'], origemMaterial: 'Viveiro fictício', rt },
    visita: visita([{ cultura: 'Laranja', pragas: [P('HLB / Greening', 'nao_detectada'), P('Cancro Cítrico', 'detectada', { haQuantoTempo: '2 meses' }), P('Schizotetranychus hindustanicus', 'nao_detectada'),
      P('Pinta Preta dos Citros', 'suspeita', { haQuantoTempo: '1 mês', controle: 'sim', qualControle: 'Fungicida cúprico' }), P('Diaphorina citri (vetor do HLB)', 'detectada')] }]) },
  banana: { propriedade: { ...propBase, frutos: [F('Banana', 'Prata', '3', '4', '900', '18', 'Feira'), F('Banana', 'Pacovan', '1,5', '2', '400', '6', 'Atravessador')] },
    dados: { compradores: ['atravessador', 'feira'], origemMaterial: 'Muda própria', rt },
    visita: visita([{ cultura: 'Banana', pragas: [P('Moko da Bananeira', 'nao_detectada', { controle: 'nao' }), P('Sigatoka Negra', 'detectada', { haQuantoTempo: '3 meses', controle: 'sim', qualControle: 'Fungicida sistêmico' })] }]) },
  moniliase: { propriedade: { ...propBase, comercial: 'nao', tipoPropriedade: 'sitio', frutos: [F('Cacau', 'CCN-51', '2', '6', '800', '10 sacas', 'Cooperativa'), F('Cupuaçu', 'Branco', '1', '5', '120', '2 sacas', 'Feira')] },
    dados: { areaAbandonada: 'nao', areaProducao: '2', idadeProducao: '6 anos', mumificados: 'sim', origem: 'terceiros', origemFonte: 'Viveiro fictício', sacaria: 'nova', controlePraga: 'sim', assistencia: 'publica', assistenciaOrgao: 'IDAM',
      frutosSaem: 'sim', frutosDestino: 'Feira', camaraUmida: 'sim', camaraMr: 'nao', suspeitos: ['cacau'], diagnostico: 'negativo', sintomaLat: '-3,11', sintomaLon: '-60,02', rt },
    visita: visita([{ cultura: 'Cacau', coleta: 'Sim', tipoMaterial: 'Fruto', pragas: [P('Monilíase do Cacaueiro', 'suspeita')] }]) },
  mandioca: { propriedade: { ...propBase, frutos: [F('Mandioca', 'Pão', '2', '1', '4000', '20', 'Farinheira'), F('Mandioca', 'Amarela', '1', '1', '2000', '9', 'Feira')] },
    dados: { estagio: 'vegetativo', materialDe: 'proprio', origemMaterial: 'Roça vizinha', assistencia: 'sim', assistenciaEmpresa: 'Empresa Ficticia Teste', limpeza: 'sim', limpezaForma: 'Lavagem com hipoclorito' },
    visita: visita([{ cultura: 'Mandioca', coleta: 'Sim', tipoMaterial: 'Folhas', pragas: [P('Vassoura de Bruxa da Mandioca', 'nao_detectada')] }]) },
  soja: { propriedade: { ...propBase, frutos: [F('Soja', 'Cultivar Exemplo', '120', '1', '', '3000', 'Cooperativa')] },
    dados: { maquinario: 'sim', maquinarioLocal: 'Outra UF fictícia', limpeza: 'sim', limpezaForma: 'Jato de ar', fornecedor: 'Semeadora Ficticia Ltda', rt },
    visita: visita([{ cultura: 'Soja', pragas: [P('Phakopsora pachyrhizi', 'detectada', { haQuantoTempo: '15 dias' }), P('Amaranthus palmeri', 'nao_detectada')] }]) },
  propriedade: { propriedade: { ...propBase, frutos: [F('Abacaxi', '', '1', '', '', '8', 'Feira'), F('Açaí', '', '2', '', '', '6', 'Feira'), F('Pupunha', '', '1', '', '', '3', 'Feira')] },
    dados: { areaTotal: '25', areaAgricola: '8', sementes: 'sim', sementesTipo: 'Mudas de fruteiras', manipula: 'sim', natureza: ['natura', 'doces'], instalacoes: 'sim', instalacoesTipos: 'Casa de farinha', rt },
    visita: visita([{ cultura: 'Abacaxi', pragas: [P('Praga Ficticia Teste', 'detectada')] }]) }
};
// o mesmo, no formato antigo (CadastrosPCE já gravado em produção: dados com tabela "culturas", "plantas", "deteccao"...)
const reg = (programa, dados, extra = {}) => ({ id: 'c-' + programa, programa, unidade: 'MANAUS', ano: 2026, numero: 1, numeroTxt: '001-2026-MANAUS', nome: prodBase.nome, doc: '111.444.777-35', propriedade: propBase.nome, cnpj: '11.222.333/0001-81',
  data: '2026-10-20', municipio: 'Manaus', uf: 'AM', lat: '-3.1190', lon: '-60.0217', servidor: fichaBase.servidor, cargo: fichaBase.cargo, matricula: '0000', lotacao: 'ULBRA, Manaus', local: 'Manaus',
  dados: JSON.stringify({ codigoPropriedade: 'AM-0001', endereco: 'Ramal Ficticio, km 3', telefone: '(92) 90000-0000', rt, ...dados }), assinaturas: '{}', ...extra });
const ANTIGOS = {
  citros: reg('citros', { comercial: 'sim', atividades: ['frutos'], culturas: [{ atividade: 'frutos', cultivar: 'Pera', area: '4.5', idade: '5', plantas: '1200', producao: '30' }, { atividade: 'viveiro_mudas', cultivar: 'Limão Tahiti', area: '1', idade: '2', plantas: '800', producao: '' }],
    entrega: 'sim', formasEntrega: ['saco'], compradores: ['feira'], beneficia: 'sim', beneficiaTipo: 'Lavagem', materiais: ['muda'], origemMaterial: 'Viveiro fictício', situacao: 'proprietario',
    delimitacao: { pintapreta: { tem: 'sim', tempo: '1 mês', controle: 'sim', qual: 'Fungicida' } }, deteccao: { cancro: { tem: 'nao' }, hlb: { tem: 'nao' }, acaro: { tem: 'sim', tempo: '2 semanas' } } }),
  moniliase: reg('moniliase', { comercial: 'nao', tipoNaoComercial: 'outros', tipoOutros: 'Quintal fictício', viaAcesso: 'fluvial', plantas: { cupuacu: 10, cacau: 25, herrania: '', cacaui: '', cupui: 3, macambo: '' }, areaAbandonada: 'nao', areaTotal: '3', idadePlantio: '6',
    areaProducao: '2', idadeProducao: '5', mumificados: 'sim', origem: 'proprias', producao: '10', producaoUnidade: 'sacas', destino: 'Cooperativa fictícia', sacaria: 'reutilizada', controlePraga: 'nao', assistencia: 'privada', frutosSaem: 'nao',
    fito: { vassoura: { tem: 'sim', tempo: '1 mês', controle: 'nao' }, podridao: { tem: 'nao' }, lazio: { tem: '' } }, sintomas: 'sim', sintomaLat: '-3.11', sintomaLon: '-60.02', camaraUmida: 'sim', camaraMr: 'sim', suspeitos: ['cacau', 'cupui'], amostra: 'sim', diagnostico: 'positivo' }),
  banana: reg('banana', { comercial: 'sim', compradores: ['feira'], origemMaterial: 'Muda própria', destino: 'Feira', culturas: [{ cultivar: 'Prata', area: '3', idade: '4', plantas: '900', producao: '18' }],
    deteccao: { moko: { tem: 'nao', controle: 'nao' }, sigatoka: { tem: 'sim', tempo: '3 meses', controle: 'sim', qual: 'Fungicida' } } }),
  mandioca: reg('mandioca', { culturas: [{ cultivar: 'Pão', area: '2', espacamento: '1 x 1 m', producao: '20' }], destino: 'Farinheira', estagio: 'raizes', materialDe: 'terceiros', origemMaterial: 'Vizinho fictício', assistencia: 'nao', limpeza: 'sim', limpezaForma: 'Água e sabão',
    situacao: 'arrendatario', deteccao: { vassoura: { tem: 'nao' } }, amostra: { tem: 'sim', tipo: 'Folhas' } }),
  soja: reg('soja', { situacao: 'outras', situacaoOutras: 'Comodato fictício', culturas: [{ cultivar: 'Cultivar Exemplo', area: '120', espacamento: '0,5 m', producao: '3000' }], destino: 'Cooperativa', maquinario: 'nao', limpeza: 'sim', limpezaForma: 'Jato de ar', fornecedor: 'Semeadora Ficticia Ltda',
    deteccao: { ferrugem: { tem: 'sim', tempo: '15 dias' }, amaranthus: { tem: 'nao', qual: 'Capina manual' } } }),
  propriedade: reg('propriedade', { situacao: 'cooperativa', viaAcesso: 'outra', viaOutra: 'Ramal', areaTotal: '25', areaAgricola: '8', sementes: 'sim', sementesTipo: 'Mudas', tipos: ['abacaxi', 'outros'], tiposOutros: 'Pupunha', culturas: [{ cultura: 'Abacaxi', area: '1', producao: '8' }],
    destino: 'Feira', ocorrencia: 'sim', ocorrenciaQuais: 'Praga ficticia', manipula: 'sim', natureza: ['doces'], instalacoes: 'nao' })
};

// Termos: um antigo de citros (tipoLocal[0] = local especificado, sem ação marcada) e um novo de outro programa (visitaId, culturas)
const termoBase = { id: 't1', unidade: 'MANAUS', ano: 2026, numero: 7, numeroTxt: '007.2026.MANAUS', propriedadeId: 'p1', doc: '111.444.777-35', nome: prodBase.nome, atividade: 'Produtor rural', empresa: propBase.nome,
  cnpj: '11.222.333/0001-81', atividadeEmpresa: 'Fruticultura', endereco: propBase.endereco, municipio: 'Manaus', uf: 'AM', telefone: prodBase.telefone, lat: '-3.1190', lon: '-60.0217', data: '2026-11-03', hora: '14:30',
  servidor: fichaBase.servidor, cargo: fichaBase.cargo, matricula: '0000', lotacao: 'ULBRA, Manaus', recebidoEm: '03/11/2026, 14:40, no pomar', assinaturas: '{}', testemunhas: '[]', plantasInspecionadas: 120, amostra: 'nao', sintomas: 'nao' };
const TERMOS = {
  citros: { ...termoBase, programa: 'citros', pragas: '["HLB","Cancro Cítrico","Ácaro Hindustânico"]', acoes: '[]', tipoLocal: '["Pomar de laranja","ao realizar fiscalização no(a)"]',
    constatacao: 'Ausência de sintomas de HLB nos frutos e folhas da cultura laranja.\nAusência de sintomas de Cancro Cítrico nos frutos e folhas da cultura laranja.',
    enquadramento: 'Portaria SDA/MAPA nº 1.326, de 4 de julho de 2025; IN SDA/MAPA nº 38; IN MAPA nº 21/2018' },
  moniliase: { ...termoBase, id: 't2', numeroTxt: '008.2026.MANAUS', programa: 'moniliase', visitaId: 'v1', programaVisita: 'moniliase', pragas: '["Monilíase"]', acoes: '["Levantamento","Monitoramento"]', tipoLocal: '["Unidade de Produção (UP)"]',
    constatacao: 'Não constatei a presença da monilíase do cacau e do cupuaçu.', enquadramento: 'IN 112 DE 11/12/2020; SDA Nº 703 DE 21/11/2022',
    culturas: JSON.stringify([{ cultura: 'Cacau', area: '2', pragas: [{ praga: 'Monilíase do Cacaueiro', resultado: 'nao_detectada' }], coleta: 'Não' }]), testemunhas: '[{"nome":"Testemunha Ficticia Um","doc":"000.000.000-01"}]' }
};

// ---------------------------------------------------------------- campos oficiais do papel (conteudo_gdv/modulos/pce/fichas-de-papel), por modelo
const COMUM = ['PROPRIEDADE COMERCIAL?', 'SIM', 'NÃO', 'Propriedade não comercial', 'sítio', 'residência', 'vegetação espontânea', 'área pública', 'outros', '1. DADOS DO PRODUTOR/PROPRIETÁRIO', 'NOME DO PRODUTOR', 'CPF', 'NOME DA PROPRIEDADE', 'CNPJ',
  'TELEFONE', 'CÓDIGO DA PROPRIEDADE (CONFORME IN Nº33/2016)', 'GEORREFERENCIAMENTO', 'Lat.', 'Lon.', 'ENDEREÇO', 'MUNICÍPIO', 'UF', 'PRINCIPAL VIA DE ACESSO À PROPRIEDADE', 'FLUVIAL', 'TERRESTRE', 'OUTRA',
  '2. DADOS DA PROPRIEDADE', 'SITUAÇÃO FUNDIÁRIA', 'PROPRIETÁRIO', 'ARRENDATÁRIO', 'COOPERATIVA', 'OUTRAS (ESPECIFICAR)', '3. ', 'CULTIVAR', 'ÁREA (ha)', '4. LEVANTAMENTO', 'NOME DO RESPONSÁVEL TÉCNICO', 'CONSELHO',
  'SERVIDOR DA ADAF-AM', 'PRODUTOR/PROPRIETÁRIO', 'LOCAL E DATA', '1ª via: Unidade Local', '2ª via: ADAF Central (E-mail)', 'GOVERNO DO ESTADO DO AMAZONAS',
  'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF/AM', 'Gerência de Defesa Vegetal – GDV', 'Avenida Carlos Drummond de Andrade, 1460 Japiim', 'Fone: (92) 99192-3067 / 99983-1176', 'Manaus-AM-CEP 69077-730', 'gabinete@adaf.am.gov.br',
  'Nº sequencial', 'Ano', 'Unidade', 'Marcada opção “NÃO” preencher apenas itens 1 e 4.'];
const OFICIAL = {
  citros: ['CADASTRO DE IMÓVEIS DE PRODUÇÃO COMERCIAL DE CÍTRICOS', 'CADASTRO DA PROPRIEDADE Nº', '(ATENDIMENTO A IN Nº21 DE 25/04/2018 - Cancro cítrico e Portaria Nº 317 de 21/05/2021 - HLB)', 'LEVANTAMENTO FITOSSANITÁRIO DE PRAGAS QUARENTENÁRIAS DE CITROS',
    'TIPO DE ATIVIDADE', 'VIVEIRO', 'Produção de Mudas', 'Produção comercial de Frutos', 'Fornecedor de Material de Propagação sem origem genética comprovada', 'Outros (especificar)', 'Campos de Produção de Porta-Enxerto', 'Jardins Clonais e Borbulheiras',
    'CULTURA DO CITROS', 'IDADE (Ano)', 'QUANTIDADE (plantas)', 'PRODUÇÃO (tonelada/Ano', 'Entrega na propriedade', 'De que forma', 'saco', 'caixa', 'a granel', 'Com quem comercializa', 'atravessador', 'supermercado', 'feira', 'cooperativa',
    'Beneficia o fruto', 'Tipo', 'Material de propagação', 'muda', 'borbulha', 'cavalinho', 'semente', 'Origem do material genético', 'Pinta Preta', 'Cancro Cítrico', 'HLB', 'Ácaro Hindustânico', 'HÁ QUANTO TEMPO', 'UTILIZA MÉT. CONTROLE', 'QUAL', 'Delimitação', 'Detecção'],
  banana: ['FICHA DE CADASTRO E LEVANTAMENTO DE BANANA', '(ATENDIMENTO A IN Nº17 DE 27/05/2009 – Moko da Bananeira e Portaria Nº 17 de 31/05/2005 – Sigatoka Negra)', 'LEVANTAMENTO FITOSSANITÁRIO DE PRAGAS QUARENTENÁRIAS DA BANANA',
    'DADOS DA CULTURA', 'IDADE DO PLANTIO (Ano)', 'QUANTIDADE (plantas)', 'PRODUÇÃO (tonelada/Ano)', 'Com quem comercializa', 'atravessador', 'supermercado', 'feira', 'cooperativa', 'outros', 'Origem do material genético', 'DESTINO DA PRODUÇÃO',
    'MOKO DA BANANEIRA', 'SIGATOKA NEGRA', 'HÁ QUANTO TEMPO', 'UTILIZA MÉT. CONTROLE', 'QUAL', 'Delimitação'],
  moniliase: ['FICHA DE CADASTRO E LEVANTAMENTO DE CACAU E CUPUAÇU', 'Cupuaçu', 'Cacau', 'QUANTIDADE (Nº de plantas)', 'TOTAL', 'Existe área abandonada com as culturas', 'Área em produção (ha)', 'Idade do Plantio', 'Retirada de frutos mumificados', 'Origem das sementes/mudas',
    'próprias', 'terceiros – informar fonte', 'PRODUÇÃO (sacas ou kg)', 'DESTINO DA PRODUÇÃO', 'Sacaria utilizada', 'nova', 'reutilizada', 'Utiliza algum controle de Praga', 'Assistência Técnica', 'Não possui', 'privada', 'pública/órgão', 'Frutos Inteiros saem da propriedade?',
    'Sim: Qual o destino?', 'FRUTO COM SINTOMAS VISUAIS DE Moniliophthora roreri', 'Em caso de planta com sintoma visual, informar coordenada da planta', 'Realizada Câmara Úmida', 'Câmara Úmida apresenta comportamento de Moniliophthora roreri', 'HOSPEDEIRO SUSPEITO',
    'Herrania', 'Cacauí', 'Cupuí', 'Macambo', 'COLHEITA DE AMOSTRA', 'DIAGNÓSTICO', 'Positivo para M. roreri', 'Negativo para M. roreri'],
  mandioca: ['FICHA DE CADASTRO E LEVANTAMENTO DE MANDIOCA', 'LEVANTAMENTO FITOSSANITÁRIO DE PRAGAS QUARENTENÁRIAS', 'CULTURA DA MANDIOCA', 'CULTIVAR/VARIEDADE', 'ESPAÇAMENTO', 'ESTIMATIVA DE PRODUÇÃO (tonelada/Ano – sacas/ha/ano)', 'ESTÁGIO DA PLANTA',
    'Plantio e Emergência - 15-30 dias', 'Desenvolvimento Vegetativo - 60-90 dias', 'Formação e Desenvolvimento de Raízes - 90-180 dias', 'Maturação das Raízes - 180-270 dias', 'Colheita - 270-360 dias', 'DESTINO DA PRODUÇÃO',
    'ORIGEM DO MATERIAL DE PROPAGAÇÃO', 'PRÓPRIO', 'TERCEIROS', 'ORIGEM', 'ASSISTÊNCIA TÉCNICA?', 'NOME DA EMPRESA', 'LIMPEZA REALIZADA DOS UTENSÍLIOS/FERRAMENTAS?', 'DE QUE FORMA', 'VASSOURA-DE-BRUXA DA MANDIOCA', 'HÁ QUANTO TEMPO',
    'COLHEITA DE AMOSTRAS', 'Tipo de material coletado', 'Detecção'],
  soja: ['FICHA DE CADASTRO E LEVANTAMENTO DE SOJA', '(ATENDIMENTO A PORTARIA Nº 865, DE 2 DE AGOSTO DE 2023)', 'LEVANTAMENTO FITOSSANITÁRIO DE PRAGAS QUARENTENÁRIAS', 'CULTURA DA SOJA', 'ESPAÇAMENTO', 'PRODUÇÃO (tonelada/Ano – sacas/ha/ano)', 'DESTINO DA PRODUÇÃO',
    'MAQUINÁRIO ORIUNDO OU SE DESLOCA PARA OUTRA UF?', 'LOCAL', 'LIMPEZA REALIZADA NO MAQUINÁRIO ANTES DO USO?', 'DE QUE FORMA', 'FORNECEDOR DAS SEMENTES', 'FERRUGEM ASIÁTICA', 'Amaranthus palmeri', 'HÁ QUANTO TEMPO', 'QUAL', 'Detecção'],
  propriedade: ['FICHA DE CADASTRO E LEVANTAMENTO DE PROPRIEDADE DE INTERESSE DA DEFESA VEGETAL', 'ÁREA TOTAL DA PROPRIEDADE (HA)', 'ÁREA AGRÍCOLA DA PROPRIEDADE (HA)', 'EXPLORAÇÃO DA PROPRIEDADE', 'SEMENTE E MUDAS', 'TIPO DE CULTURA', 'ABACAXI', 'ARROZ', 'COCO', 'MARACUJÁ',
    'ACEROLA', 'BANANA', 'GOIABA', 'MILHO', 'AÇAÍ', 'CANA DE AÇÚCAR', 'HORTALIÇAS', 'OUTROS', 'ÁREA PLANTADA', 'CULTURA', 'PRODUÇÃO (tonelada/Ano – sacas/ha/ano)', 'DESTINO DA PRODUÇÃO',
    'Há ocorrência de Pragas (Insetos, Fungos, Bactérias e Ervas Daninhas) na(s) cultura(s)?', 'Em caso positivo, Quais?', 'Produzem e/ou Manipulam produtos e subprodutos de origem vegetal para fins comerciais', 'Natureza operativa do estabelecimento',
    'In natura', 'DOCES/GELEIAS', 'Existem instalações próprias', 'Quais tipos', 'ASSUMO TOTAL RESPONSABILIDADE PELAS INFORMAÇÕES AQUI PRESTADAS']
};

// ---------------------------------------------------------------- ambiente: web/ já servido pelo executor ou, sozinho, por um servidor próprio
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function origem() {
  try { const r = await fetch(amb.ORIGEM + '/documentos/pce-ficha.html'); if (r.ok) return { url: amb.ORIGEM, parar: () => {} }; } catch (e) { /* ninguém servindo */ }
  const raiz = path.join(amb.RAIZ, 'web');
  const srv = http.createServer((q, s) => {
    const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => srv.listen(amb.PORTA_WEB, r));
  return { url: amb.ORIGEM, parar: () => srv.close() };
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const contem = (texto, lista) => lista.filter(x => !norm(texto).includes(norm(x)));

(async () => {
  const O = await origem();
  const b = await amb.lancar();
  const err = [];
  /** Abre o modelo, monta, confere que cabe numa folha A4 e salva PDF + PNG. Devolve {texto, secoes, folhas}. */
  async function gerar(arquivo, nome, montar) {
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } });
    const p = await c.newPage();
    p.on('pageerror', e => err.push(nome + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && err.push(nome + ': ' + m.text()));
    await p.goto(`${O.url}/documentos/${arquivo}`);
    await p.waitForFunction(() => window.PCEDocs);
    await p.evaluate(montar.fn, montar.args);
    await p.evaluate(() => Promise.all([...document.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })))));
    await p.emulateMedia({ media: 'print' });
    const pdf = path.join(SAIDA, nome + '.pdf');
    await p.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const folhas = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    try { execFileSync('pdftoppm', ['-png', '-singlefile', '-r', '110', pdf, path.join(SAIDA, nome)]); } catch (e) { await p.screenshot({ path: path.join(SAIDA, nome + '.png'), fullPage: true }); }
    const r = await p.evaluate(() => ({ texto: document.body.innerText.replace(/\s+/g, ' '), secoes: [...document.querySelectorAll('td.sec')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      altura: document.querySelector('.a4').scrollHeight, modelo: document.querySelector('.a4').getAttribute('data-modelo'), largura: document.documentElement.scrollWidth }));
    await c.close();
    return { ...r, folhas };
  }
  const fichaFn = ([tipo, dados]) => PCEDocs.montar(document, tipo, dados, {});
  const R = {}, A = {};

  console.log('Fichas com dados novos (produtor, propriedade com frutos, dados do modelo, visita mais recente)');
  for (const m of Object.keys(NOVOS)) {
    const N = NOVOS[m];
    R[m] = await gerar('pce-ficha.html', `ficha-${m}`, { fn: fichaFn, args: ['ficha', { modelo: m, produtor: prodBase, propriedade: N.propriedade, dados: N.dados, visita: N.visita, ficha: fichaBase }] });
    ok(R[m].folhas === 1, `${m}: cabe em uma folha A4`, R[m].folhas);
    ok(R[m].modelo === m, `${m}: modelo marcado na página`);
  }
  console.log('Fichas no formato antigo (CadastrosPCE já gravado, sem alterar o dado)');
  for (const m of Object.keys(ANTIGOS)) {
    const antes = JSON.stringify(ANTIGOS[m]);
    A[m] = await gerar('pce-ficha.html', `ficha-${m}-antiga`, { fn: fichaFn, args: [m === 'moniliase' ? 'cadastro' : 'cadastro' + m[0].toUpperCase() + m.slice(1), ANTIGOS[m]] });
    ok(A[m].folhas === 1, `${m} (antigo): cabe em uma folha A4`, A[m].folhas);
    ok(A[m].modelo === m, `${m} (antigo): abre no modelo ${m}`, A[m].modelo);
    ok(JSON.stringify(ANTIGOS[m]) === antes, `${m} (antigo): o registro não foi alterado`);
  }

  console.log('Mesma estrutura nos 6 modelos');
  const ordem = m => R[m].secoes.map(s => (/^(\d)\./.exec(s) || [])[1]).join('');
  ok(Object.keys(R).every(m => ordem(m) === '1234'), 'seções 1, 2, 3 e 4 na mesma ordem em todas', Object.fromEntries(Object.keys(R).map(m => [m, R[m].secoes])));
  ok(Object.keys(R).every(m => R[m].secoes[0].startsWith('1. DADOS DO PRODUTOR/PROPRIETÁRIO') && R[m].secoes[1].startsWith('2. DADOS DA PROPRIEDADE') && R[m].secoes[3] === '4. LEVANTAMENTO'), 'títulos de 1, 2 e 4 iguais em todas');
  ok(Object.keys(A).every(m => ordem.call(null, m) && A[m].secoes.map(s => (/^(\d)\./.exec(s) || [])[1]).join('') === '1234'), 'o mesmo nas fichas de formato antigo');
  // o bloco do produtor é o mesmo (rótulos e ordem) em todas
  const rotulosProdutor = t => ['NOME DO PRODUTOR', 'CPF', 'NOME DA PROPRIEDADE', 'CNPJ', 'TELEFONE', 'CÓDIGO DA PROPRIEDADE', 'GEORREFERENCIAMENTO', 'ENDEREÇO', 'MUNICÍPIO', 'UF', 'PRINCIPAL VIA'].map(x => norm(t).indexOf(norm(x)));
  const ordemProd = m => { const i = rotulosProdutor(R[m].texto); return i.every(x => x >= 0) && i.slice(0, 4).every((x, k, a) => !k || x > a[k - 1]); };
  ok(Object.keys(R).every(ordemProd), 'bloco do produtor completo e na mesma ordem em todas');
  ok(Object.keys(R).every(m => R[m].largura <= 800), 'nada ultrapassa a largura da folha', Object.fromEntries(Object.keys(R).map(m => [m, R[m].largura])));

  console.log('Campos oficiais do papel');
  for (const m of Object.keys(R)) {
    const falta = contem(R[m].texto, [...COMUM, ...OFICIAL[m]]);
    ok(!falta.length, `${m}: todos os campos oficiais presentes (${COMUM.length + OFICIAL[m].length} conferidos)`, falta);
    const faltaA = contem(A[m].texto, [...COMUM, ...OFICIAL[m]]);
    ok(!faltaA.length, `${m} (antigo): idem`, faltaA);
  }

  console.log('Dados aparecem no lugar certo');
  const T = R.citros.texto;
  ok(/Maria Ficticia da Silva Teste/.test(T) && /111\.444\.777-35/.test(T) && /11\.222\.333\/0001-81/.test(T) && /Sitio Exemplo Teste/.test(T) && /-3,119/.test(T) && /Ramal Ficticio, km 3/.test(T), 'citros: produtor e propriedade');
  ok(/Pera/.test(T) && /Laranja/.test(T) && /Limão/.test(T) && !/Prata/.test(T), 'citros: só os frutos de citros entram na tabela de cultura (banana fica fora)');
  ok(/1\.700/.test(T) || /1700/.test(T), 'citros: total de plantas na tabela', T.match(/TOTAL[^A-Z]*/));
  ok(/2 meses/.test(T) && /1 mês/.test(T) && /Fungicida cúprico/.test(T), 'citros: levantamento vem da visita mais recente (há quanto tempo, controle, qual)');
  const marcas = await (async () => { // caixas marcadas por linha do quadro de levantamento
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } }); const p = await c.newPage();
    await p.goto(`${O.url}/documentos/pce-ficha.html`); await p.waitForFunction(() => window.PCEDocs);
    await p.evaluate(([t, d]) => PCEDocs.montar(document, t, d, {}), ['ficha', { modelo: 'citros', produtor: prodBase, propriedade: NOVOS.citros.propriedade, dados: NOVOS.citros.dados, visita: NOVOS.citros.visita, ficha: fichaBase }]);
    const r = await p.evaluate(() => [...document.querySelectorAll('table.lev tbody tr')].map(tr => [tr.cells[0].textContent, tr.cells[2].querySelector('.on') ? 'sim' : tr.cells[3].querySelector('.on') ? 'nao' : '']));
    const sit = await p.evaluate(() => [...document.querySelectorAll('.cx.on')].map(x => x.parentElement.textContent.trim()).join('|'));
    await c.close(); return { r: Object.fromEntries(r), sit };
  })();
  ok(marcas.r['Pinta Preta'] === 'sim' && marcas.r['Cancro Cítrico'] === 'sim' && marcas.r['HLB'] === 'nao' && marcas.r['Ácaro Hindustânico'] === 'nao', 'citros: sim/não do quadro pelo resultado (detectada e suspeita = sim; Diaphorina não marca HLB)', marcas.r);
  ok(/PROPRIETÁRIO/.test(marcas.sit) && /TERRESTRE/.test(marcas.sit) && /Produção comercial de Frutos/.test(marcas.sit), 'citros: situação fundiária da propriedade, via de acesso e atividade marcadas', marcas.sit);
  ok(/Merenda escolar/.test(T) && /Viveiro fictício/.test(T), 'citros: perguntas próprias do modelo');
  ok(/Eng\. Agr\. Fictício Teste/.test(T) && /CREA-AM 0000/.test(T) && /Servidor Ficticio Teste/.test(T) && /03\/11\/2026/.test(T), 'citros: responsável técnico, servidor e data');
  const M = R.moniliase.texto;
  ok(/Cacau/.test(M) && /CCN-51/.test(M) && /Cupuaçu/.test(M) && /Branco/.test(M), 'cacau e cupuaçu: frutos na tabela');
  ok(/IDAM/.test(M) && /Viveiro fictício/.test(M) && /-3,11/.test(M), 'cacau e cupuaçu: perguntas próprias e coordenada');
  const mar = await (async () => {
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } }); const p = await c.newPage();
    await p.goto(`${O.url}/documentos/pce-ficha.html`); await p.waitForFunction(() => window.PCEDocs);
    await p.evaluate(([t, d]) => PCEDocs.montar(document, t, d, {}), ['ficha', { modelo: 'moniliase', produtor: prodBase, propriedade: NOVOS.moniliase.propriedade, dados: NOVOS.moniliase.dados, visita: NOVOS.moniliase.visita, ficha: fichaBase }]);
    const r = await p.evaluate(() => [...document.querySelectorAll('.cx.on')].map(x => x.parentElement.textContent.replace(/\s+/g, ' ').trim()));
    await c.close(); return r;
  })();
  ok(mar.includes('SIM') === false && mar.includes('NÃO') && mar.some(x => /^sítio/.test(x)), 'cacau e cupuaçu: propriedade não comercial e o tipo (sítio)', mar);
  ok(mar.includes('sim') && mar.some(x => /Cacau/.test(x)), 'cacau e cupuaçu: sintomas (suspeita na visita) e hospedeiro suspeito marcados', mar);
  const Mand = R.mandioca.texto;
  ok(/Empresa Ficticia Teste/.test(Mand) && /hipoclorito/.test(Mand) && /Folhas/.test(Mand), 'mandioca: perguntas próprias e coleta de amostra da visita');
  ok(/Cultivar Exemplo/.test(R.soja.texto) && /15 dias/.test(R.soja.texto) && /Semeadora Ficticia Ltda/.test(R.soja.texto), 'soja: tabela, levantamento da visita e pergunta própria');
  ok(/Casa de farinha/.test(R.propriedade.texto) && /Praga Ficticia Teste/.test(R.propriedade.texto) && /Pupunha/.test(R.propriedade.texto), 'propriedade: perguntas próprias, ocorrência de pragas da visita e cultura sem caixa em "OUTROS"');
  console.log('Sem visita: levantamento em branco');
  const semVisita = await (async () => {
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } }); const p = await c.newPage();
    await p.goto(`${O.url}/documentos/pce-ficha.html`); await p.waitForFunction(() => window.PCEDocs);
    await p.evaluate(([t, d]) => PCEDocs.montar(document, t, d, {}), ['ficha', { modelo: 'banana', produtor: prodBase, propriedade: NOVOS.banana.propriedade, dados: {}, ficha: fichaBase }]);
    const r = await p.evaluate(() => document.querySelectorAll('table.lev .cx.on').length); await c.close(); return r;
  })();
  ok(semVisita === 0, 'banana sem visita: nenhuma caixa marcada no quadro', semVisita);
  console.log('Formato antigo');
  ok(/Pinta Preta/.test(A.citros.texto) && /Fungicida/.test(A.citros.texto) && /Viveiro – produção de mudas/.test(A.citros.texto) && /2 semanas/.test(A.citros.texto), 'citros antigo: delimitação, detecção e tipo de atividade de cada linha');
  ok(/Vassoura de Bruxa/.test(A.moniliase.texto) && /Quintal fictício/.test(A.moniliase.texto) && /Cooperativa fictícia/.test(A.moniliase.texto) && /10 sacas/.test(A.moniliase.texto) && /6 anos/.test(A.moniliase.texto), 'cacau e cupuaçu antigo: informações fitossanitárias, tipo não comercial, produção e idade');
  ok(/Cupuí/.test(A.moniliase.texto) && /\b38\b/.test(A.moniliase.texto), 'cacau e cupuaçu antigo: nº de plantas por hospedeiro e total (38)');
  ok(/Comodato fictício/.test(A.soja.texto) && /Capina manual/.test(A.soja.texto) && /Outra UF|MAQUINÁRIO/.test(A.soja.texto), 'soja antiga: situação fundiária e levantamento');
  ok(/Ramal/.test(A.propriedade.texto) && /Praga ficticia/.test(A.propriedade.texto) && /Pupunha/.test(A.propriedade.texto), 'propriedade antiga: via, ocorrência e culturas');
  ok(/Farinheira/.test(A.mandioca.texto) && /1 x 1 m/.test(A.mandioca.texto) && /Vizinho fictício/.test(A.mandioca.texto), 'mandioca antiga: espaçamento, destino e origem');
  ok(/Muda própria/.test(A.banana.texto) && /3 meses/.test(A.banana.texto), 'banana antiga');

  console.log('Termo de Fiscalização (um só modelo)');
  const termoFn = ([tipo, t]) => PCEDocs.montar(document, tipo, t, {});
  const TC = await gerar('pce-termo.html', 'termo-citros', { fn: termoFn, args: ['termoCitros', TERMOS.citros] });
  const TM = await gerar('pce-termo.html', 'termo-moniliase', { fn: termoFn, args: ['termo', TERMOS.moniliase] });
  ok(TC.folhas === 1 && TM.folhas === 1, 'Termo de citros e Termo de outro programa: uma folha A4 cada', [TC.folhas, TM.folhas]);
  const OF_TERMO = ['TERMO DE FISCALIZAÇÃO Nº', 'Nº sequencial', '1 – Identificação', 'Nome', 'CPF', 'Atividade', 'Empresa / Fantasia', 'CNPJ', 'Endereço', 'Município', 'UF', 'Telefone', 'Coordenadas Geográficas', '2 – Descrição da Ação',
    'Ácaro Hindustânico', 'Cancro Cítrico', 'HLB', 'Ferrugem Asiática da soja', 'Fusariose FOC R4T', 'Monilíase', 'Mosca-da-Carambola', 'Vassoura-de-bruxa da Mandioca', 'Amaranthus palmeri', 'Diaphorina citri', 'Evento Agropecuário', 'Unidade de Produção (UP)',
    'Unidade de Consolidação (UC)', 'ao realizar ações de', 'Controle/Erradicação', 'Levantamento', 'Monitoramento', 'Educação Sanitária', 'Fiscalização', '(descrever a situação constatada)', '3 – Enquadramento Legal', '4 – Testemunhas',
    'Recebi a 2ª via deste Termo em', 'Assinatura e Identificação do Servidor da ADAF', '1ª via: Interessado', '2ª via: ADAF Central', '3ª via: Unidade Local', 'GOVERNO DO ESTADO DO AMAZONAS'];
  ok(!contem(TC.texto, OF_TERMO).length && !contem(TM.texto, OF_TERMO).length, 'Termo: todos os campos oficiais do papel presentes', [contem(TC.texto, OF_TERMO), contem(TM.texto, OF_TERMO)]);
  // texto próprio do Termo de citros: "Em ... às ... hora(s) ao realizar fiscalização no(a) <local especificado> constatei" + (especificar o local)
  ok(/Pomar de laranja/.test(TC.texto) && /no\(a\) Pomar de laranja constatei/.test(TC.texto) && /\(especificar o local\)/.test(TC.texto) && /14:30/.test(TC.texto), 'Termo de citros: local especificado, "constatei" e a hora', TC.texto.slice(250, 900));
  ok(/Ausência de sintomas de HLB/.test(TC.texto) && /Portaria SDA\/MAPA nº 1\.326/.test(TC.texto), 'Termo de citros: frases da descrição e enquadramento da planilha');
  const marcasT = async (t, tipo) => {
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } }); const p = await c.newPage();
    await p.goto(`${O.url}/documentos/pce-termo.html`); await p.waitForFunction(() => window.PCEDocs);
    await p.evaluate(([x, y]) => PCEDocs.montar(document, x, y, {}), [tipo, t]);
    const r = await p.evaluate(() => [...document.querySelectorAll('.cx.on')].map(x => x.parentElement.textContent.trim())); await c.close(); return r;
  };
  const mc = await marcasT(TERMOS.citros, 'termoCitros'), mm = await marcasT(TERMOS.moniliase, 'termo');
  ok(mc.includes('HLB') && mc.includes('Cancro Cítrico') && mc.includes('Ácaro Hindustânico') && mc.includes('Fiscalização') && mc.length === 4, 'Termo de citros antigo: pragas marcadas e ação "Fiscalização" (que o papel de citros dizia no texto)', mc);
  ok(mm.includes('Monilíase') && mm.includes('Levantamento') && mm.includes('Monitoramento') && mm.includes('Unidade de Produção (UP)') && mm.length === 4, 'Termo de monilíase: pragas, ações e local marcados', mm);
  ok(/Testemunha Ficticia Um/.test(TM.texto) && /Não constatei a presença da monilíase/.test(TM.texto) && /IN 112/.test(TM.texto) && !/no\(a\) .* constatei/.test(TM.texto.replace(/no\(a\)\s+constatei/, '')) , 'Termo de monilíase: testemunha, constatação e enquadramento');
  ok(JSON.stringify(TERMOS.citros).includes('Pomar de laranja'), 'Termo antigo não foi alterado');

  console.log('Relatório de atividades com anexos (termo e ficha antigos)');
  const REL = await (async () => {
    const c = await b.newContext({ viewport: { width: 794, height: 1123 } }); const p = await c.newPage();
    await p.goto(`${O.url}/documentos/pce-relatorio.html`); await p.waitForFunction(() => window.PCEDocs);
    const r = await p.evaluate(async ([t, cad]) => {
      const calc = PCEDocs.calcularRelatorio([t], [], { praga: 'Monilíase' });
      const n = await PCEDocs.montar(document, 'relatorio', { calc, de: '2026-11-01', ate: '2026-11-30', praga: 'Monilíase', servidores: [], local: 'Manaus' }, { anexos: { termos: [t], cadastros: [cad] } });
      return { n, classes: [...document.querySelectorAll('.a4')].map(x => x.className), texto: document.body.innerText };
    }, [TERMOS.citros, ANTIGOS.moniliase]);
    await c.close(); return r;
  })();
  ok(REL.n === 3 && /pce-doc termo/.test(REL.classes[1]) && /pce-doc ficha/.test(REL.classes[2]) && /Quintal fictício/.test(REL.texto) && /Pomar de laranja/.test(REL.texto), 'relatório: termo e ficha anexados com os modelos novos', REL.classes);

  console.log('Mesma aparência: cabeçalho, quadro e rodapé iguais na Ficha e no Termo');
  const todos = [...Object.values(R), TC, TM];
  ok(todos.every(x => /GOVERNO DO ESTADO DO AMAZONAS/.test(x.texto) && /Avenida Carlos Drummond de Andrade/.test(x.texto) && /SEPROR|gabinete@adaf\.am\.gov\.br/.test(x.texto)), 'cabeçalho e rodapé em todos');

  ok(err.length === 0, 'sem erros de JavaScript', err);
  console.log(`PDF e PNG de cada documento em ${SAIDA}`);
  await b.close(); O.parar();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
