// Configurações do posto. Ajuste aqui o que for fixo da unidade.
const CONFIG = {
  // Endereço do servidor (Apps Script, termina em /exec). Não é segredo: sem uma credencial de fiscal
  // o servidor recusa tudo. Com ele preenchido, o fiscal só digita o código de 6 dígitos.
  sync: { url: 'https://script.google.com/macros/s/AKfycbyesoopdbY-lTZQT9QbMe2qvH5Pvp-fN4Z1w1eEFxLmBxGhsF77YYa8NPPu2rnOZFr4/exec' },
  unidadePadrao: 'MANAUS',          // só para turnos antigos sem unidade; hoje a unidade vem da BVA (fixa) ou do município (volante)
  localPadrao: '',                  // sugestão de local (ex.: 'Barreira Porto CEASA'); vazio = digitar a cada turno
  postos: ['Fixa', 'Móvel'],        // "Móvel" aparece como "Volante (móvel)" na tela
  // BVAs fixas (lista do campo Local/Posto quando o posto é Fixa). placa: true = placa do veículo obrigatória;
  // ficha: true = gera a Ficha de Campo (nas demais BVAs e no volante, só o Termo).
  // Posto volante (móvel): local preenchido pelo endereço da coordenada (editável) e placa opcional.
  bvas: [
    { nome: 'BVA - CEASA', placa: true, ficha: true },
    { nome: 'BVA - JUNDIÁ', placa: false, ficha: false },
    { nome: 'BVA - AEROPORTO', placa: false, ficha: false }
  ],
  // Os horários do turno são capturados do relógio do aparelho (ao iniciar e ao encerrar).
  // A letra do TF / quadradinho da Ficha é deduzida da hora de início: das 04:00 às 11:59 = A; demais = B.
  turnos: {
    A: { rotulo: '04h às 12h' },
    B: { rotulo: '12h às 20h' }
  },
  // código → { nome, ícone, pessoas (estimativa padrão por veículo; pode ser alterada em cada registro) }
  tipos: {
    PA: { nome: 'Passeio',           icone: '🚗', pessoas: 5 },
    UT: { nome: 'Utilitário',        icone: '🚙', pessoas: 5 },
    CC: { nome: 'Caminhão/Carreta',  icone: '🚚', pessoas: 1 },
    CB: { nome: 'Caminhão/Carreta Baú', icone: '🚛', pessoas: 1 },
    ON: { nome: 'Ônibus',            icone: '🚌', pessoas: 40 },
    MT: { nome: 'Moto',              icone: '🏍️', pessoas: 2 }
  },
  linhasFicha: 50,
  // Carga do veículo (formulário do veículo; tudo opcional): UFs de origem/destino. Destino AM = internalização/importação; destino em
  // outro estado = carga em trânsito/exportação (alimentam o VIGIFITO sem lançamento manual).
  ufs: ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'Exterior'],
  ufLocal: 'AM',

  // Termo de Fiscalização de Barreira (TF)
  TF: {
    vias: ['1ª via', '2ª via'],                   // impressas em páginas separadas, para assinatura
    relacoes: ['Transportador', 'Proprietário', 'Motorista', 'Responsável Técnico', 'Outro'],
    unidades: ['Kg', 'Ton', 'Caixas', 'Sacos', 'Unidades', 'Mudas'],
    produtos: ['ABIU', 'ACEROLA', 'AJURU', 'AMEIXA ROXA', 'ARAÇÁ BOI', 'BACUPARI', 'BIRIBÁ', 'CAJU', 'CARAMBOLA', 'CASTANHOLA', 'COCO',
               'FRUTA-PÃO', 'GOIABA', 'GOMUTO', 'JACA', 'JAMBO', 'JUJUBA', 'LARANJA', 'LICANIA', 'LIMÃO', 'LIMÃO CAYENA', 'MANGA',
               'MURUCI', 'PIMENTA DE CHEIRO', 'PIMENTA PICANTE', 'PITANGA', 'POMELO', 'SAPOTILHA', 'TANGERINA', 'TAPEREBÁ', 'TOMATE',
               'MUDAS', 'MUDAS-BANANEIRA', 'MAMÃO', 'OUTROS'],
    procedimentos: { liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' },
    maxFotos: 10,                                  // fotos por TF (reduzidas como no PCE: CONFIG.PCE.fotoLado / fotoQualidade); anexo fotográfico no fim do PDF
    textoLegal: 'Lei Federal 9.712 de 20/11/1998; Dec. Federal nº 24.114 de 12/04/1934; Artigo 259 do Código Penal Brasileiro;\n' +
      'Lei Estadual nº 3.097 de 27/11/2006; Dec. Estadual nº 36.108 de 06/08/2015; (Seção VIII, Art. 35, Grupo II, Alínea\n' +
      '"A"); IN nº 38 de 01/10/2018; PORTARIA SDA/MAPA Nº 1.503, DE 19 DE DEZEMBRO DE 2025.',
    // Textos sugeridos (copiados do rascunho do sistema de TF); o fiscal pode editar no formulário.
    constatacao: {
      liberacao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado COM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.',
      apreensao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.',
      rechaco: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo retornou à origem.'
    }
  },

  // Módulo PCE (Programa de Controle e Erradicação): Levantamento fitossanitário e Termo de Colheita de Amostras (listas copiadas do rascunho do sistema PCE)
  PCE: {
    vias: 2,                                       // Termo de Colheita: via da ADAF e via do produtor
    municipios: ['Alvarães', 'Amaturá', 'Anamã', 'Anori', 'Apuí', 'Atalaia do Norte', 'Autazes', 'Barcelos', 'Barreirinha', 'Benjamin Constant',
      'Beruri', 'Boa Vista do Ramos', 'Boca do Acre', 'Borba', 'Caapiranga', 'Canutama', 'Carauari', 'Careiro', 'Careiro da Várzea', 'Coari',
      'Codajás', 'Eirunepé', 'Envira', 'Fonte Boa', 'Guajará', 'Humaitá', 'Ipixuna', 'Iranduba', 'Itacoatiara', 'Itamarati', 'Itapiranga',
      'Japurá', 'Juruá', 'Jutaí', 'Lábrea', 'Manacapuru', 'Manaquiri', 'Manaus', 'Manicoré', 'Maraã', 'Maués', 'Nhamundá', 'Nova Olinda do Norte',
      'Novo Airão', 'Novo Aripuanã', 'Parintins', 'Pauini', 'Presidente Figueiredo', 'Rio Preto da Eva', 'Santa Isabel do Rio Negro',
      'Santo Antônio do Içá', 'São Gabriel da Cachoeira', 'São Paulo de Olivença', 'São Sebastião do Uatumã', 'Silves', 'Tabatinga', 'Tapauá',
      'Tefé', 'Tonantins', 'Uarini', 'Urucará', 'Urucurituba'],
    culturas: ['Mandioca', 'Banana', 'Açaí', 'Cacau', 'Cupuaçu', 'Guaraná', 'Pimenta-do-reino', 'Milho', 'Feijão', 'Arroz', 'Café', 'Coco',
      'Abacaxi', 'Laranja', 'Limão', 'Tangerina', 'Mamão', 'Melancia', 'Maracujá', 'Castanha-do-Brasil', 'Pupunha', 'Dendê', 'Urucum',
      'Seringueira', 'Hortaliças diversas', 'Soja'],
    pragas: ['Bactrocera carambolae', 'Schizotetranychus hindustanicus', 'Phakopsora pachyrhizi', 'HLB / Greening', 'Cancro Cítrico',
      'Fusarium R4T', 'Monilíase do Cacaueiro', 'Vassoura de Bruxa da Mandioca', 'Amaranthus palmeri', 'Diaphorina citri (vetor do HLB)'],
    // dados gerais da visita (opcionais): tipo de local e origem da visita. "Outro" abre um campo para digitar.
    tiposLocal: ['Propriedade comercial', 'Quintal / área urbana', 'Viveiro', 'Plantio abandonado / não comercial', 'Feira / ponto de venda', 'Floricultura',
      'Unidade de Produção (UP)', 'Unidade de Consolidação (UC)', 'Outro'],
    origensVisita: ['Levantamento de rotina', 'Notificação voluntária do produtor', 'Delimitação de foco', 'Verificação / retorno', 'Outro'],
    // resultado laboratorial do Termo de Colheita (registrado depois, no app ou no painel; não muda o número nem o PDF do termo)
    laboratorio: {
      laboratorios: ['LFDA-GO', 'LFDA-PE', 'LFDA-SP', 'Laboratório da ADAF', 'Outro'],
      resultados: [['aguardando', 'Aguardando'], ['negativo', 'Negativo'], ['positivo', 'Positivo'], ['inconclusivo', 'Inconclusivo'], ['inviavel', 'Amostra inviável']],
      prazoDias: 30                                  // sem resultado há mais de 30 dias do envio: alerta "atenção" no painel
    },
    cargos: ['Fiscal Agropecuário Engenheiro Agrônomo', 'Fiscal Agropecuário Médico Veterinário', 'Fiscal Agropecuário Engenheiro Florestal',
      'Técnico de Fiscalização Agropecuária', 'Agente de Defesa Agropecuária', 'Auxiliar de Defesa Agropecuária'],
    situacoes: ['Propriedade titulada', 'Posse', 'Assentamento', 'Arrendamento', 'Comodato', 'Parceria agrícola', 'Concessão de uso',
      'Herança / Espólio', 'Área pública autorizada', 'Outro'],
    partes: ['folhas', 'frutos', 'raízes', 'caule', 'sementes', 'outros'],
    fotoLado: 1600, fotoQualidade: 0.7,            // redução das fotos antes de guardar/enviar (lado maior em px, JPEG)
    arquivosPorRodada: 5,                          // fotos/assinaturas/PDFs enviados ao Drive por sincronização (um por requisição)
    maxDocumentos: 10,                             // PDFs escaneados por registro antigo (até 10 MB cada)
    // Levantamento por praga/doença: um card por praga, com as culturas avaliadas (resultado e fotos de cada cultura). Um PDF por praga.
    resultados: [['detectada', 'Detectada'], ['nao_detectada', 'Não detectada'], ['suspeita', 'Suspeita']],
    maxPragas: 20, maxCulturas: 40, maxFotos: 60,    // por levantamento (cards de praga, culturas somadas e fotos somadas)
    // Cadastro de imóvel (1x por propriedade e programa) e Termo de Fiscalização do PCE (1 por visita; não é o TF de Barreira), dos modelos de papel
    moniliase: {
      hospedeiros: [['cupuacu', 'Cupuaçu'], ['cacau', 'Cacau'], ['herrania', 'Herrania'], ['cacaui', 'Cacauí'], ['cupui', 'Cupuí'], ['macambo', 'Macambo']],
      tiposNaoComercial: [['sitio', 'Sítio'], ['residencia', 'Residência'], ['vegetacao', 'Vegetação espontânea'], ['publica', 'Área pública'], ['outros', 'Outros']],
      doencas: [['vassoura', 'Vassoura de Bruxa'], ['podridao', 'Podridão Parda'], ['lazio', 'Lazio']]
    },
    termo: {
      // pragas do quadro "2 – Descrição da Ação" (ordem do papel); a do programa vem marcada
      pragas: ['Ácaro Hindustânico', 'Cancro Cítrico', 'HLB', 'Ferrugem Asiática da soja', 'Fusariose FOC R4T', 'Monilíase', 'Mosca-da-Carambola', 'Vassoura-de-bruxa da Mandioca',
        'Amaranthus palmeri', 'Diaphorina citri'],   // as duas últimas não estão no papel antigo: entram no fim (a ordem das demais não muda)
      // praga escolhida no levantamento → nome no quadro do Termo (Termo de Fiscalização da visita já sai com as pragas marcadas)
      pragaDoLevantamento: { 'Bactrocera carambolae': 'Mosca-da-Carambola', 'Schizotetranychus hindustanicus': 'Ácaro Hindustânico',
        'Phakopsora pachyrhizi': 'Ferrugem Asiática da soja', 'HLB / Greening': 'HLB', 'Cancro Cítrico': 'Cancro Cítrico', 'Fusarium R4T': 'Fusariose FOC R4T',
        'Monilíase do Cacaueiro': 'Monilíase', 'Vassoura de Bruxa da Mandioca': 'Vassoura-de-bruxa da Mandioca',
        'Amaranthus palmeri': 'Amaranthus palmeri', 'Diaphorina citri (vetor do HLB)': 'Diaphorina citri' },
      locais: ['Evento Agropecuário', 'Unidade de Produção (UP)', 'Unidade de Consolidação (UC)'],
      acoes: ['Controle/Erradicação', 'Levantamento', 'Monitoramento', 'Educação Sanitária', 'Fiscalização'],
      vias: ['1ª via: Interessado', '2ª via: ADAF Central', '3ª via: Unidade Local'],
      constatacaoNegativa: 'Não constatei a presença da monilíase do cacau e do cupuaçu.',
      // Relatório de atividades (prestação de contas do convênio): objetivo sugerido por praga (editável)
      objetivos: {
        'Monilíase': 'Executar Ações de Levantamento Fitossanitário de detecção da praga Monilíase, visando a prevenção e ação imediata de contingência.'
      }
    }
  },

  // Portal do Administrativo (web/administrativo/): ID do cliente OAuth do Google (público; o mesmo valor vai na propriedade do script
  // GOOGLE_CLIENT_ID, usada pelo servidor para conferir o login). Vazio = o portal mostra só a entrada por código de ativação.
  // Passo a passo para criar no README ("Portal do Administrativo").
  adm: { googleClientId: '' },

  // Relatório GDV (painel → aba Relatórios): grupos de pragas da Seção I. Cada coluna casa com as pragas dos levantamentos pelo nome
  // (sem acento/maiúsculas; basta conter um dos termos; vale o termo mais longo — "Diaphorina citri (vetor do HLB)" vai para Diaphorina,
  // não para HLB). Praga nova: acrescente o termo numa coluna (ou um grupo novo) — sem mexer no código. extras: suspeitas/amostras
  // (automáticas); manuais: colunas lançadas à mão por município no painel (ex.: poda drástica).
  RELGDV: {
    grupos: [
      { id: 'citros', nome: 'Pragas dos Citros', colunas: [
        { rotulo: 'Greening (HLB)', pragas: ['HLB', 'Greening', 'Liberibacter'] }, { rotulo: 'Cancro cítrico', pragas: ['Cancro'] },
        { rotulo: 'Ácaro hindustânico', pragas: ['Schizotetranychus', 'Hindustanico'] }, { rotulo: 'Diaphorina citri', pragas: ['Diaphorina'] }] },
      { id: 'soja', nome: 'Pragas da Soja', colunas: [
        { rotulo: 'Ferrugem asiática', pragas: ['Phakopsora', 'Ferrugem'] }, { rotulo: 'Amaranthus palmeri', pragas: ['Amaranthus'] }],
        manuais: [{ chave: 'vazio', rotulo: 'Fiscalizações do vazio sanitário' }] },
      { id: 'moniliase', nome: 'Monilíase do Cacaueiro e Cupuaçuzeiro', colunas: [{ rotulo: 'Focos (detectada)', pragas: ['Moniliase', 'Moniliophthora'] }],
        extras: ['suspeitas', 'amostras'], manuais: [{ chave: 'poda', rotulo: 'Poda drástica' }] },
      { id: 'carambola', nome: 'Mosca-da-Carambola', colunas: [{ rotulo: 'Detecções', pragas: ['Bactrocera', 'Carambola'] }],
        extras: ['suspeitas', 'amostras'], manuais: [{ chave: 'armadilhas', rotulo: 'Monitoramento de armadilhas' }] },
      { id: 'banana', nome: 'Pragas da Bananeira', colunas: [{ rotulo: 'Fusarium R4T', pragas: ['Fusarium', 'R4T'] }] }
    ],
    // assinaturas (nome em branco: o gestor preenche no painel; fica salvo com os textos)
    assinaturas: [{ nome: '', cargo: 'Gerente de Defesa Vegetal' }, { nome: '', cargo: 'Chefe do Departamento de Defesa Agropecuária e Florestal – DDAF' },
      { nome: '', cargo: 'Diretor-Presidente da ADAF' }],
    local: 'Manaus/AM'
  }
};

const letraDoTurno = hora => { const h = parseInt(hora, 10); return h >= 4 && h < 12 ? 'A' : 'B'; };
