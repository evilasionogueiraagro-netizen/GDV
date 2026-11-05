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
    // endereco/municipio: identificação do posto no Termo de Fiscalização do turno (vazio = linha em branco para preencher à mão)
    // escala: regime da escala de plantão (REGIMES_ESCALA abaixo); a tela de escalas sugere o fim do período pelo início
    { nome: 'BVA - CEASA', placa: true, ficha: true, endereco: 'Av. Ministro Mário Andreazza, 913, Vila Buriti (próximo ao Mauazinho), CEP 69075-390', municipio: 'Manaus', escala: { regime: 'dias', dias: 8, troca: true } },
    { nome: 'BVA - JUNDIÁ', placa: false, ficha: false, endereco: 'BR-174, km 75', municipio: 'Presidente Figueiredo', escala: { regime: 'dias', dias: 10, troca: true } },
    { nome: 'BVA - AEROPORTO', placa: false, ficha: false, endereco: 'Av. Santos Dumont, 1350 – Tarumã', municipio: 'Manaus', escala: { regime: '12x36' } }
  ],
  // Regimes da escala de plantão por BVA. dias: período de N dias (fim = início + N − 1; o próximo começa no dia seguinte, ou no
  // próprio fim com troca: true — a equipe troca no último dia, como no Jundiá: 15/10 a 24/10, 24/10 a 02/11…); 12x36:
  // plantão de 12 h com 36 h de descanso (um dia por escala; o próximo, 2 dias depois); 8h: turno diário de 8 h (um dia por escala);
  // ajustavel: o coordenador escolhe o fim.
  REGIMES_ESCALA: { dias: 'Período de N dias', '12x36': 'Plantão de 12 h × 36 h de descanso', '8h': 'Turno diário de 8 h', ajustavel: 'Período ajustável' },
  // Volante que não conta veículos, por município (unidade do turno, em maiúsculas): o turno conta só as pessoas orientadas na educação
  // sanitária (tema = assunto da orientação, no app e no Termo); local = texto sugerido para o "Local / Posto (volante)".
  // assinatura com o dedo na tela (TF de Barreira e PCE). Desligada por enquanto (decisão da gerência, 28/10/2026): os documentos saem com as
  // linhas em branco para assinar no papel. Para voltar, troque para true (o código das assinaturas continua todo no app).
  assinaturaNaTela: false,
  // onde o fiscal pode corrigir o nº do TF do turno (o servidor confere a mesma regra: NUMERO_TURNO_EDITAVEL_)
  turnoNumeroEditavel: [{ local: 'BVA - JUNDIÁ', desde: '2026-10-24' }],
  volantesSoPessoas: {
    TABATINGA: { tema: 'Monilíase do Cacaueiro (Moniliophthora roreri)',
      local: 'Porto Hidroviário de Tabatinga, Comunidades de Benjamin Constant, Cidade Nova-BC, Feijoal BC e Prosperidade II-BC' }
  },
  // Os horários do turno são capturados do relógio do aparelho (ao iniciar e ao encerrar).
  // A letra do TF / quadradinho da Ficha é deduzida da hora de início: das 04:00 às 11:59 = A; demais = B.
  turnos: {
    A: { rotulo: '04h às 12h' },
    B: { rotulo: '12h às 20h' }
  },
  // código → { nome, ícone (nome em web/js/icones.js) }; as pessoas orientadas de cada veículo são digitadas pelo fiscal (sem sugestão por tipo)
  tipos: {
    PA: { nome: 'Passeio',           icone: 'carro' },
    UT: { nome: 'Utilitário',        icone: 'utilitario' },
    CC: { nome: 'Caminhão/Carreta',  icone: 'caminhao' },
    CB: { nome: 'Caminhão/Carreta Baú', icone: 'caminhao-bau' },
    ON: { nome: 'Ônibus',            icone: 'onibus' },
    MT: { nome: 'Moto',              icone: 'moto' }
  },
  linhasFicha: 50,
  // UFs de origem/destino (opcionais no registro do veículo e no TF; mesma lista que UFS_ no Code.gs). Destino AM vindo de outra UF =
  // internalização/importação; destino em outro estado = carga em trânsito/exportação (alimentam o VIGIFITO sem lançamento manual).
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
    // Enquadramento legal da apreensão e do rechaço (planilha ENQUADRAMENTOS x PRAGAS da GDV): por BVA, sentido da rota e grupo de produto.
    // Sentido: nas BVAs de Manaus (manaus), pelo município Manaus na origem/destino; nas demais, pela UF AM (ou município do AM). Cada produto
    // casa com a 1ª regra da BVA (do sentido, ou sem sentido) que o contém; carga mista junta as normas, sem repetir. Nada casa → comum.
    enquadramento: {
      normas: {
        lei9712: 'Lei Federal nº 9.712 de 20/11/1998', dec24114: 'Dec. Federal nº 24.114 de 12/04/1934', cp259: 'Art. 259 do Código Penal Brasileiro',
        lei3097: 'Lei Estadual nº 3.097 de 27/11/2006', dec36108: 'Dec. Estadual nº 36.108 de 06/08/2015 (Seção VIII, Art. 35, Grupo II, Alínea "A")',
        in28: 'IN nº 28/2016', in28_17: 'IN nº 28 de 20/07/2017', in38: 'IN nº 38 de 01/10/2018', in8: 'IN nº 8 de 17/04/2012',
        in21: 'IN nº 21 de 25/04/2018', p780: 'Portaria nº 780 de 06/04/2023', p940: 'Portaria SDA/MAPA nº 940 de 17/11/2023',
        p1188: 'Portaria SDA nº 1.188 de 15/10/2024', p776: 'Portaria nº 776 de 12/03/2025', p1326: 'Portaria SDA/MAPA nº 1.326 de 04/07/2025 (HLB)',
        p1675: 'Portaria SDA/MAPA nº 1.675 de 26/08/2026'
      },
      comum: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38'],
      grupos: {
        // hospedeiros da mosca-da-carambola: os produtos do TF, menos mudas, coco e outros
        mosca: ['ABIU', 'ACEROLA', 'AJURU', 'AMEIXA ROXA', 'ARAÇÁ BOI', 'BACUPARI', 'BIRIBÁ', 'CAJU', 'CARAMBOLA', 'CASTANHOLA', 'FRUTA-PÃO', 'GOIABA',
          'GOMUTO', 'JACA', 'JAMBO', 'JUJUBA', 'LARANJA', 'LICANIA', 'LIMÃO', 'LIMÃO CAYENA', 'MANGA', 'MURUCI', 'PIMENTA DE CHEIRO', 'PIMENTA PICANTE',
          'PITANGA', 'POMELO', 'SAPOTILHA', 'TANGERINA', 'TAPEREBÁ', 'TOMATE', 'MAMÃO'],
        citros: ['LARANJA', 'LIMÃO', 'TANGERINA', 'POMELO'],             // cancro cítrico e HLB
        citrosJundia: ['LARANJA', 'TANGERINA'], acaro: ['LIMÃO', 'COCO']  // Jundiá: citros (mosca, cancro, ácaro) e ácaro hindustânico
      },
      manaus: ['CEASA', 'AEROPORTO'],
      regras: [
        { bva: 'JUNDIÁ', grupo: 'acaro', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in38', 'in8', 'p1188'] },
        { bva: 'JUNDIÁ', grupo: 'citrosJundia', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38', 'p780', 'in8', 'in21', 'p1188', 'p776'] },
        { bva: 'JUNDIÁ', grupo: 'mosca', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38', 'p780', 'p1188', 'p776'] },
        { bva: 'PARINTINS', sentido: 'entrada', grupo: 'citros', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38', 'p1326'] },
        { bva: 'PARINTINS', sentido: 'entrada', grupo: 'mosca', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in28_17', 'in38', 'p940'] },
        { bva: ['CEASA', 'AEROPORTO', 'HUMAITÁ'], sentido: 'entrada', grupo: 'citros', normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38', 'p1326'] },
        { bva: ['CEASA', 'AEROPORTO', 'HUMAITÁ', 'PARINTINS'], sentido: 'saida', grupo: 'mosca',
          normas: ['lei9712', 'dec24114', 'cp259', 'lei3097', 'dec36108', 'in28', 'in38', 'p1188', 'p776', 'p1675'] }
      ]
    },
    // Textos sugeridos (copiados do rascunho do sistema de TF); o fiscal pode editar no formulário.
    constatacao: {
      liberacao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado COM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.',
      apreensao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o produto foi apreendido.',
      rechaco: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo retornou à origem.'
    },
    // Constatação por BVA, produto e destino (o 1º modelo que casa vale; nos demais TFs, a constatacao acima). Casa quando a barreira
    // do TF é a BVA (ou uma da lista), há um dos produtos (sem lista: qualquer um), o destino contém o texto e o sentido é o da rota (se houver).
    // O enquadramento vem da tabela acima (liberação: em branco).
    modelos: [{
      bva: 'HUMAITÁ', produtos: ['LIMÃO', 'LARANJA', 'TANGERINA'], destino: 'MANAUS',     // entrada de citros pela BVA - HUMAITÁ
      constatacao: {
        liberacao: 'Após a inspeção do veículo acima mencionado e da carga de citros, não foram constatadas irregularidades na carga nem na documentação fitossanitária apresentada (PTV). Após os procedimentos o veículo foi liberado.',
        apreensao: 'Durante a fiscalização do veículo acima mencionado, os fiscais constataram a presença de restos vegetais na carga, incluindo folhas e ramos de plantas cítricas. Entretanto, na PTV apresentada, consta, nas declarações adicionais, que os frutos foram submetidos aos processos de escovação e beneficiamento, devendo estar totalmente isentos de folhas e ramos de plantas cítricas. Diante da não conformidade constatada entre as condições declaradas no documento e a situação encontrada na carga, o produto foi apreendido.',
        rechaco: 'Durante a fiscalização do veículo acima mencionado, os fiscais constataram a presença de restos vegetais na carga, incluindo folhas e ramos de plantas cítricas. Entretanto, na PTV apresentada, consta, nas declarações adicionais, que os frutos foram submetidos aos processos de escovação e beneficiamento, devendo estar totalmente isentos de folhas e ramos de plantas cítricas. Diante da não conformidade constatada entre as condições declaradas no documento e a situação encontrada na carga, o veículo retornou à origem.'
      }
    }, {
      bva: ['CEASA', 'AEROPORTO', 'PARINTINS'], produtos: ['LARANJA', 'LIMÃO', 'TANGERINA', 'POMELO'], sentido: 'entrada',   // citros entrando: cancro/HLB, sem a mosca
      constatacao: {
        liberacao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado COM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro do Cancro Cítrico e do HLB (Greening). Após os procedimentos o veículo foi liberado.',
        apreensao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro do Cancro Cítrico e do HLB (Greening). Após os procedimentos o produto foi apreendido.',
        rechaco: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro do Cancro Cítrico e do HLB (Greening). Após os procedimentos o veículo retornou à origem.'
      }
    }, {
      bva: 'HUMAITÁ',                                         // demais produtos e destinos em Humaitá: sem o texto da mosca (não é prioridade lá)
      constatacao: {
        liberacao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado COM a devida documentação fitossanitária obrigatória (PTV). Após os procedimentos o veículo foi liberado.',
        apreensao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV). Após os procedimentos o produto foi apreendido.',
        rechaco: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV). Após os procedimentos o veículo retornou à origem.'
      }
    }]
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
      'Seringueira', 'Hortaliças diversas', 'Soja', 'Algodão', 'Cana-de-açúcar',
      'Carambola', 'Goiaba', 'Manga', 'Acerola', 'Caju', 'Jaca', 'Pitanga', 'Jambo', 'Taperebá', 'Sapotilha', 'Abiu', 'Araçá-boi', 'Biribá', 'Fruta-pão', 'Tomate', 'Pimenta de cheiro'],
    pragas: ['Bactrocera carambolae', 'Schizotetranychus hindustanicus', 'Phakopsora pachyrhizi', 'HLB / Greening', 'Cancro Cítrico',
      'Fusarium R4T', 'Monilíase do Cacaueiro', 'Vassoura de Bruxa da Mandioca', 'Amaranthus palmeri', 'Diaphorina citri (vetor do HLB)',
      'Pinta Preta dos Citros', 'Leprose dos Citros'],
    // Cadastro de cítricos (CADASTRO DE IMÓVEIS DE PRODUÇÃO COMERCIAL DE CÍTRICOS; IN 21/2018 cancro cítrico, Portaria 317/2021 HLB): no levantamento,
    // o bloco "Cultura do citros" (um só, dentro de "Pragas e doenças") aparece quando há card de praga de citros (nome da lista abaixo ou "Outra"
    // digitada com um dos termos; sem acento/maiúsculas). Gravado na coluna "citros" (JSON) do levantamento; vira o Cadastro de citros (programa
    // "citros") e o Termo de Fiscalização da visita. Códigos (1º item de cada par) não mudam: vão para a planilha; o texto é só o rótulo.
    citros: {
      pragas: ['HLB / Greening', 'Cancro Cítrico', 'Schizotetranychus hindustanicus', 'Diaphorina citri (vetor do HLB)', 'Pinta Preta dos Citros', 'Leprose dos Citros'],
      termos: ['citr', 'cancro', 'hlb', 'greening', 'pinta preta', 'leprose', 'hindustan', 'diaphorina'],
      atividades: [['viveiro_mudas', 'Viveiro – produção de mudas'], ['viveiro_semorigem', 'Viveiro – fornecedor de material de propagação sem origem genética comprovada'],
        ['viveiro_portaenxerto', 'Viveiro – campos de produção de porta-enxerto'], ['viveiro_clonal', 'Viveiro – jardins clonais e borbulheiras'],
        ['frutos', 'Produção comercial de frutos'], ['outros', 'Outros (especificar)']],
      situacoes: [['proprietario', 'Proprietário'], ['arrendatario', 'Arrendatário'], ['cooperativa', 'Cooperativa'], ['outras', 'Outras (especificar)']],
      formasEntrega: [['saco', 'Saco'], ['caixa', 'Caixa'], ['granel', 'A granel']],
      compradores: [['atravessador', 'Atravessador'], ['supermercado', 'Supermercado'], ['feira', 'Feira'], ['cooperativa', 'Cooperativa'], ['outros', 'Outros']],
      materiais: [['muda', 'Muda'], ['borbulha', 'Borbulha'], ['cavalinho', 'Cavalinho'], ['semente', 'Semente']],
      delimitacao: [['pintapreta', 'Pinta Preta']],
      // levantamento de detecção: as três são obrigatórias (Ausência = "nao", Presença = "sim"); o nome é o do Termo (CONFIG.PCE.termo.pragas)
      deteccao: [['hlb', 'HLB'], ['acaro', 'Ácaro Hindustânico'], ['cancro', 'Cancro Cítrico']],
      // frases da "Descrição da ação" do Termo de Fiscalização (uma por doença; {praga} = nome acima; {culturas} = culturas de citros avaliadas)
      frases: { nao: 'Ausência de sintomas de {praga} nos frutos e folhas da cultura{culturas}.', sim: 'Presença de sintomas de {praga} nos frutos e folhas da cultura{culturas}.' },
      // O enquadramento legal do Termo de citros vem do catálogo (CONFIG.PCE.legislacao, planilha da GDV): sem texto próprio aqui.
      // card de praga com resultado "Detectada" → pré-marca "Presença" no item (só se o fiscal ainda não marcou). Diaphorina (vetor) não marca HLB.
      marcarPor: { cancro: ['cancro'], hlb: ['hlb', 'greening', 'liberibacter'], acaro: ['hindustan', 'schizotetranychus'], pintapreta: ['pinta preta', 'guignardia', 'phyllosticta'] },
      naoMarcar: ['diaphorina'],
      cultivares: ['Laranja Pera', 'Laranja Lima', 'Laranja Valência', 'Laranja Natal', 'Limão Tahiti', 'Limão Galego', 'Tangerina Ponkan', 'Tangerina Murcote',
        'Lima ácida', 'Pomelo'],                     // só sugestão (texto livre)
      maxCulturas: 20                                // linhas da tabela "Cultura do citros" (o servidor também corta em 20)
    },
    // Legislação por praga, para o "Enquadramento legal" do Termo. Fonte única: docs/modulos/pce-legislacao.csv (planilha da GDV); o teste pce_legislacao_test confere.
    legislacao: {
      'Monilíase do Cacaueiro': 'IN 112 DE 11/12/2020; SDA Nº 703 DE 21/11/2022; PORTARIA Nº 337/23 DE 11 DE AGOSTO DE 2023; PORTARIA Nº 263/2024; MAPA 818/2025',
      'HLB / Greening': 'Portaria SDA/MAPA nº 1.326, de 4 de julho de 2025; IN SDA/MAPA nº 38',
      'Cancro Cítrico': 'IN MAPA nº 21/2018; IN SDA/MAPA nº 38',
      'Schizotetranychus hindustanicus': 'IN MAPA nº 8/2012; IN SDA/MAPA nº 38, de 1º de outubro de 2018',
      'Bactrocera carambolae': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA n° 1.545; PORTARIA SDA/MAPA nº 1.569, de 13 de março de 2026; Portaria SDA/MAPA n° 1.675 de 26 de agosto de 2026; Portaria MAPA n° 855, de 7 de novembro de 2025; Portaria MAPA nº 627, de 10 de novembro de 2023; Portaria SDA/MAPA n° 859, de 19 de julho de 2023; Portaria SDA/MAPA nº 780, de 06 de abril de 2023',
      'Phakopsora pachyrhizi': 'Portaria SDA/MAPA nº 1.124, de 25 de junho de 2024; Portaria SDA/MAPA nº 1.579, de 9 de abril de 2026',
      'Amaranthus palmeri': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA nº 1.119',
      'Vassoura de Bruxa da Mandioca': 'Instrução Normativa SDA/MAPA nº 38; Portaria SDA/MAPA nº 1.257; Portaria MAPA nº 769',
      'Fusarium R4T': 'Portaria SDA/MAPA nº 1.291, de 22 de maio de 2025; Instrução Normativa SDA/MAPA nº 131 de 27 de junho de 2019; Instrução Normativa SDA/MAPA nº 30 de 05 de junho de 2020'
    },
    // Restrição praga x cultura (fontes em docs/modulos/pce-hospedeiros.md): praga listada aqui só é oferecida nas culturas e famílias dela e nas
    // ligadas a ela no catálogo. Praga fora da lista e "Outra" digitada não têm restrição.
    hospedeiros: {
      'Bactrocera carambolae': { familias: ['Citros'], culturas: ['Carambola', 'Goiaba', 'Manga', 'Acerola', 'Caju', 'Jaca', 'Pitanga', 'Jambo', 'Taperebá', 'Sapotilha', 'Abiu', 'Araçá-boi', 'Biribá', 'Fruta-pão', 'Tomate', 'Pimenta de cheiro', 'Mamão', 'Maracujá'] },
      'Schizotetranychus hindustanicus': { familias: ['Citros'], culturas: ['Coco'] },
      'HLB / Greening': { familias: ['Citros'] }, 'Cancro Cítrico': { familias: ['Citros'] }, 'Diaphorina citri (vetor do HLB)': { familias: ['Citros'] },
      'Pinta Preta dos Citros': { familias: ['Citros'] }, 'Leprose dos Citros': { familias: ['Citros'] },
      'Phakopsora pachyrhizi': { familias: ['Soja'] }, 'Amaranthus palmeri': { familias: ['Soja'], culturas: ['Milho', 'Algodão'] },
      'Fusarium R4T': { familias: ['Bananeira'] }, 'Moko da Bananeira': { familias: ['Bananeira'] }, 'Sigatoka Negra': { familias: ['Bananeira'] },
      'Monilíase do Cacaueiro': { familias: ['Cacau e cupuaçu'] }, 'Vassoura de Bruxa da Mandioca': { familias: ['Mandioca'] }
    },
    // Cadastros por programa, como os modelos de papel (um formulário e um PDF por modelo; numeração própria por programa). Citros e monilíase têm
    // código e modelo próprios; estes usam o formulário genérico. Culturas sem família caem no cadastro geral ("propriedade").
    // tipo: texto | num | sn (sim/não) | opcao (uma) | varios | tabela. se: {k, v} = só aparece com aquela resposta. Códigos vão para a planilha: não mudam.
    // deteccao: resposta "tem" (sim/não) vem do resultado no levantamento (Detectada ou Suspeita = sim); o resto se pergunta aqui.
    // reaproveita: campos copiados do cadastro mais recente da mesma propriedade, de qualquer programa, ao abrir um cadastro novo.
    // Marcas do modelo (o que a ficha de papel tem além de "campos"): telefone (telefone do produtor), rt (responsável técnico e nº do conselho),
    // amostra (colheita de amostras sim/não e tipo de material; vem do levantamento), comercial (propriedade comercial? sim/não e, se não, o tipo;
    // nada é escondido nem dispensado quando "não": a ficha de banana manda preencher "apenas os itens 1, 4 e 5" mas só tem os itens 1 a 3).
    // rotulos: nome curto do programa (lista, painel). culturaModelo: cultura → modelo, só para quando o aparelho ainda não recebeu o catálogo
    // (com o catálogo, vale a família da cultura); cultura que não está aqui nem no catálogo cai no cadastro geral ("propriedade").
    cadastros: {
      rotulos: { moniliase: 'Monilíase', citros: 'Citros', banana: 'Banana', mandioca: 'Mandioca', soja: 'Soja', propriedade: 'Propriedade' },
      culturaModelo: { 'Laranja': 'citros', 'Limão': 'citros', 'Tangerina': 'citros', 'Banana': 'banana', 'Cacau': 'moniliase', 'Cupuaçu': 'moniliase', 'Herrania': 'moniliase',
        'Cacauí': 'moniliase', 'Cupuí': 'moniliase', 'Macambo': 'moniliase', 'Mandioca': 'mandioca', 'Soja': 'soja' },
      reaproveita: ['situacao', 'situacaoOutras', 'rt', 'viaAcesso', 'viaOutra', 'origemMaterial', 'destino'],
      propriedade: { nome: 'Cadastro geral da propriedade', modelo: 'pce-cadastro-propriedade.html', telefone: true, rt: true, campos: [
        { k: 'viaAcesso', rot: 'Principal via de acesso', tipo: 'opcao', ops: [['fluvial', 'Fluvial'], ['terrestre', 'Terrestre'], ['outra', 'Outra']] },
        { k: 'viaOutra', rot: 'Outra via (qual)', tipo: 'texto', se: { k: 'viaAcesso', v: 'outra' } },
        { k: 'situacao', rot: 'Situação fundiária', tipo: 'opcao', ops: 'situacoes' },
        { k: 'situacaoOutras', rot: 'Outras (especificar)', tipo: 'texto', se: { k: 'situacao', v: 'outras' } },
        { k: 'areaTotal', rot: 'Área total da propriedade (ha)', tipo: 'num' }, { k: 'areaAgricola', rot: 'Área agrícola da propriedade (ha)', tipo: 'num' },
        { k: 'sementes', rot: 'Sementes e mudas?', tipo: 'sn' }, { k: 'sementesTipo', rot: 'Tipo', tipo: 'texto', se: { k: 'sementes', v: 'sim' } },
        { k: 'tipos', rot: 'Tipo de cultura', tipo: 'varios', ops: [['abacaxi', 'Abacaxi'], ['acerola', 'Acerola'], ['acai', 'Açaí'], ['arroz', 'Arroz'], ['banana', 'Banana'],
          ['cana', 'Cana-de-açúcar'], ['coco', 'Coco'], ['goiaba', 'Goiaba'], ['hortalicas', 'Hortaliças'], ['maracuja', 'Maracujá'], ['milho', 'Milho'], ['outros', 'Outros']] },
        { k: 'tiposOutros', rot: 'Outras culturas (quais)', tipo: 'texto', se: { k: 'tipos', v: 'outros' } },
        { k: 'culturas', rot: 'Área plantada', tipo: 'tabela', colunas: [['cultura', 'Cultura'], ['area', 'Área (ha)'], ['producao', 'Produção (t/ano ou sacas/ha/ano)']] },
        { k: 'destino', rot: 'Destino da produção', tipo: 'texto' },
        { k: 'ocorrencia', rot: 'Há ocorrência de pragas na(s) cultura(s)?', tipo: 'sn' }, { k: 'ocorrenciaQuais', rot: 'Quais', tipo: 'texto', se: { k: 'ocorrencia', v: 'sim' } },
        { k: 'manipula', rot: 'Produz e/ou manipula produtos de origem vegetal para fins comerciais?', tipo: 'sn' },
        { k: 'natureza', rot: 'Natureza operativa do estabelecimento', tipo: 'varios', ops: [['natura', 'In natura'], ['doces', 'Doces/geleias'], ['outros', 'Outros']], se: { k: 'manipula', v: 'sim' } },
        { k: 'naturezaOutros', rot: 'Outros (quais)', tipo: 'texto', se: { k: 'natureza', v: 'outros' } },
        { k: 'instalacoes', rot: 'Existem instalações próprias?', tipo: 'sn' }, { k: 'instalacoesTipos', rot: 'Quais tipos', tipo: 'texto', se: { k: 'instalacoes', v: 'sim' } }
      ] },
      banana: { nome: 'Cadastro de banana', modelo: 'pce-cadastro-banana.html', comercial: true, rt: true, campos: [
        { k: 'culturas', rot: 'Dados da cultura', tipo: 'tabela', colunas: [['cultivar', 'Cultivar'], ['area', 'Área (ha)'], ['idade', 'Idade do plantio (ano)'], ['plantas', 'Quantidade (plantas)'], ['producao', 'Produção (t/ano)']] },
        { k: 'compradores', rot: 'Com quem comercializa', tipo: 'varios', ops: 'compradores' },
        { k: 'origemMaterial', rot: 'Origem do material genético', tipo: 'texto' }, { k: 'destino', rot: 'Destino da produção', tipo: 'texto' }
      ], deteccao: [{ k: 'moko', praga: 'Moko da Bananeira', rot: 'Moko da Bananeira', extra: ['tempo', 'controle', 'qual'] }, { k: 'sigatoka', praga: 'Sigatoka Negra', rot: 'Sigatoka Negra', extra: ['tempo', 'controle', 'qual'] }] },
      mandioca: { nome: 'Cadastro de mandioca', modelo: 'pce-cadastro-mandioca.html', telefone: true, amostra: true, campos: [
        { k: 'situacao', rot: 'Situação fundiária', tipo: 'opcao', ops: 'situacoes' }, { k: 'situacaoOutras', rot: 'Outras (especificar)', tipo: 'texto', se: { k: 'situacao', v: 'outras' } },
        { k: 'culturas', rot: 'Cultura da mandioca', tipo: 'tabela', colunas: [['cultivar', 'Cultivar/variedade'], ['area', 'Área (ha)'], ['espacamento', 'Espaçamento'], ['producao', 'Estimativa de produção (t/ano ou sacas/ha/ano)']] },
        { k: 'estagio', rot: 'Estágio da planta', tipo: 'opcao', ops: [['plantio', 'Plantio e emergência (15-30 dias)'], ['vegetativo', 'Desenvolvimento vegetativo (60-90 dias)'],
          ['raizes', 'Formação e desenvolvimento de raízes (90-180 dias)'], ['maturacao', 'Maturação das raízes (180-270 dias)'], ['colheita', 'Colheita (270-360 dias)']] },
        { k: 'destino', rot: 'Destino da produção', tipo: 'texto' },
        { k: 'materialDe', rot: 'Origem do material de propagação', tipo: 'opcao', ops: [['proprio', 'Próprio'], ['terceiros', 'Terceiros']] }, { k: 'origemMaterial', rot: 'Origem', tipo: 'texto' },
        { k: 'assistencia', rot: 'Assistência técnica?', tipo: 'sn' }, { k: 'assistenciaEmpresa', rot: 'Nome da empresa', tipo: 'texto', se: { k: 'assistencia', v: 'sim' } },
        { k: 'limpeza', rot: 'Limpeza realizada dos utensílios/ferramentas?', tipo: 'sn' }, { k: 'limpezaForma', rot: 'De que forma', tipo: 'texto', se: { k: 'limpeza', v: 'sim' } }
      ], deteccao: [{ k: 'vassoura', praga: 'Vassoura de Bruxa da Mandioca', rot: 'Vassoura-de-bruxa da mandioca', extra: ['tempo'] }] },
      soja: { nome: 'Cadastro de soja', modelo: 'pce-cadastro-soja.html', telefone: true, rt: true, campos: [
        { k: 'situacao', rot: 'Situação fundiária', tipo: 'opcao', ops: 'situacoes' }, { k: 'situacaoOutras', rot: 'Outras (especificar)', tipo: 'texto', se: { k: 'situacao', v: 'outras' } },
        { k: 'culturas', rot: 'Cultura da soja', tipo: 'tabela', colunas: [['cultivar', 'Cultivar'], ['area', 'Área (ha)'], ['espacamento', 'Espaçamento'], ['producao', 'Produção (t/ano ou sacas/ha/ano)']] },
        { k: 'destino', rot: 'Destino da produção', tipo: 'texto' },
        { k: 'maquinario', rot: 'Maquinário oriundo ou se desloca para outra UF?', tipo: 'sn' }, { k: 'maquinarioLocal', rot: 'Local', tipo: 'texto', se: { k: 'maquinario', v: 'sim' } },
        { k: 'limpeza', rot: 'Limpeza realizada no maquinário antes do uso?', tipo: 'sn' }, { k: 'limpezaForma', rot: 'De que forma', tipo: 'texto', se: { k: 'limpeza', v: 'sim' } },
        { k: 'fornecedor', rot: 'Fornecedor das sementes', tipo: 'texto' }
      ], deteccao: [{ k: 'ferrugem', praga: 'Phakopsora pachyrhizi', rot: 'Ferrugem asiática', extra: ['tempo'] }, { k: 'amaranthus', praga: 'Amaranthus palmeri', rot: 'Amaranthus palmeri', extra: ['qual'] }] }
    },
    // dados gerais da visita (opcionais): comercial (sim/não), tipo de local e origem da visita. "Outro" abre um campo para digitar.
    // Comercial é pergunta à parte: o tipo de local não diz se é comercial (quintal pode ser comercial). Registros antigos guardam o texto da lista anterior.
    tiposLocal: ['Propriedade rural', 'Quintal', 'Área urbana', 'Sítio', 'Residência', 'Plantio abandonado', 'Vegetação espontânea', 'Área pública',
      'Viveiro', 'Feira / ponto de venda', 'Floricultura', 'Unidade de Produção (UP)', 'Unidade de Consolidação (UC)', 'Outro'],
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
    // Cadastro de imóvel (1x por propriedade e programa) e Termo de Fiscalização do PCE (1 por programa em cada visita; não é o TF de Barreira), dos modelos de papel
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


// BVAs cadastradas pela gerência no painel (aba BVAs da planilha; chegam no sync e no painelDados): somam-se às de CONFIG.bvas acima
// e mudam (município, endereço, placa obrigatória, Ficha de Campo) ou desativam as de lá pelo nome. A lista CONFIG.bvas é trocada no
// lugar, então todas as telas usam a mesma.
CONFIG.bvasBase = CONFIG.bvas.map(b => ({ ...b }));
CONFIG.aplicarBvas = function (cadastro) {
  if (!Array.isArray(cadastro)) return CONFIG.bvas;
  const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lista = CONFIG.bvasBase.map(b => ({ ...b })), novas = [];
  cadastro.forEach(c => {
    if (!c || !c.nome) return;
    const i = lista.findIndex(b => k(b.nome) === k(c.nome));
    const esc = c.escalaRegime ? { regime: c.escalaRegime, dias: Number(c.escalaDias) || 0, troca: !!Number(c.escalaTroca) } : i >= 0 ? lista[i].escala : null;
    const b = { nome: i >= 0 ? lista[i].nome : c.nome, placa: !!Number(c.placa), ficha: !!Number(c.ficha), endereco: c.endereco || '', municipio: c.municipio || '', escala: esc || { regime: 'ajustavel' } };
    if (Number(c.ativo) === 0) { if (i >= 0) lista.splice(i, 1); return; }
    if (i >= 0) lista[i] = b; else novas.push(b);
  });
  novas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  CONFIG.bvas.length = 0; lista.concat(novas).forEach(b => CONFIG.bvas.push(b));
  return CONFIG.bvas;
};

/** Regime da escala de plantão da BVA ({regime, dias}); sem cadastro: período ajustável. */
CONFIG.regimeEscala = function (bva) {
  const k = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = CONFIG.bvas.find(x => k(x.nome) === k(bva)), e = (b && b.escala) || {};
  return CONFIG.REGIMES_ESCALA[e.regime] ? { regime: e.regime, dias: Number(e.dias) || 0, troca: e.regime === 'dias' && !!e.troca } : { regime: 'ajustavel', dias: 0, troca: false };
};
/** Fim sugerido para um período que começa em `inicio` (AAAA-MM-DD) na BVA; '' = o coordenador escolhe (período ajustável). */
CONFIG.fimEscala = function (bva, inicio) {
  const r = CONFIG.regimeEscala(bva), d = (x, n) => new Date(Date.parse(x + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inicio || ''))) return '';
  if (r.regime === 'dias' && r.dias > 0) return d(inicio, r.dias - 1);
  if (r.regime === '12x36' || r.regime === '8h') return inicio;
  return '';
};
/** Início sugerido do próximo período depois de `ultima` ({inicio, fim}) na BVA: 12×36 = 2 dias depois do início; troca no último
 *  dia = o próprio fim; os demais, o dia seguinte ao fim. */
CONFIG.proximoInicioEscala = function (bva, ultima) {
  const d = (x, n) => new Date(Date.parse(x + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10), r = CONFIG.regimeEscala(bva);
  return r.regime === '12x36' ? d(ultima.inicio, 2) : r.troca && ultima.fim > ultima.inicio ? ultima.fim : d(ultima.fim, 1);
};
/** Períodos de `inicio` até `ate` pelo regime da BVA (só "N dias", "12×36" e "8 h"; ajustável: nenhum). Até 120. */
CONFIG.gerarPeriodosEscala = function (bva, inicio, ate) {
  const out = []; let ini = inicio;
  if (CONFIG.regimeEscala(bva).regime === 'ajustavel') return out;
  while (ini && ini <= ate && out.length < 120) {
    const fim = CONFIG.fimEscala(bva, ini); if (!fim) break;
    out.push({ inicio: ini, fim }); const prox = CONFIG.proximoInicioEscala(bva, { inicio: ini, fim });
    if (prox <= ini) break; ini = prox;
  }
  return out;
};
/** Dois períodos se sobrepõem? Encostar só no dia da troca (um acaba no dia em que o outro começa) não conta. */
CONFIG.sobrepoeEscala = function (a, b) {
  if (!(a.inicio <= b.fim && b.inicio <= a.fim)) return false;
  const encosta = (x, y) => x.fim === y.inicio && x.inicio < x.fim && y.inicio < y.fim;
  return !(encosta(a, b) || encosta(b, a));
};
/** Texto do regime para as telas ("Período de 10 dias", "Plantão de 12 h × 36 h de descanso"…). */
CONFIG.textoRegimeEscala = function (bva) {
  const r = CONFIG.regimeEscala(bva);
  return r.regime === 'dias' ? `Período de ${r.dias} dias${r.troca ? ' (troca no último dia)' : ''}` : CONFIG.REGIMES_ESCALA[r.regime];
};

/* Relatório da equipe (prestação de contas do convênio, etapa 1.10): textos padrão por BVA (o responsável pela equipe edita; o próximo
   relatório da mesma BVA começa com os do último salvo). Chave = nome da BVA sem "BVA" (sem acento, minúsculas). */
CONFIG.RELEQUIPE = {
  convenio: '00991272/2025',
  etapa: '1.10 – FISCALIZAÇÃO DO TRÂNSITO INTERESTADUAL DE VEGETAIS EM POSTOS FIXOS',
  obs: 'Anexo Termos de Fiscalização.',
  porBva: {
    jundia: {
      local: 'Barreira de Vigilância Agropecuária – BVA/ Jundiá/RR',
      objetivo: 'Executar Ações de Fiscalização do Trânsito na Barreira Conjunta entre ADAF/AM e ADERR/RR, visando coibir a entrada de Pragas Quarentenárias Ausentes no Estado do Amazonas.',
      deslocamento: 'Manaus/AM x Presidente Figueiredo/AM x Rorainópolis/RR (BVA do Jundiá)',
      intro: 'Foram realizadas as seguintes ações de fiscalização do trânsito na BVA conjunta entre ADAF/AM e ADERR/RR:',
      repasseLocal: 'BR 174 KM 75 PVA Jundiá/RR', repasseOrgao: 'ADERR'      // Termo de Repasse: local (antes da data) e órgão que recebe
    },
    // na CEASA os produtos apreendidos vão para destruição: "Termo de Destruição", no aterro sanitário de Manaus
    ceasa: { termo: 'Destruição', repasseLocal: 'Aterro Sanitário de Manaus', repasseOrgao: '' }
  }
};
/** Textos padrão do relatório da equipe da BVA ({local, objetivo, deslocamento, intro, obs, termo, repasseLocal, repasseOrgao}); termo = tipo do
    termo dos produtos apreendidos ("Repasse" ou "Destruição"). */
CONFIG.textosRelEquipe = function (bva) {
  const k = String(bva || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^bva/, '');
  const p = CONFIG.RELEQUIPE.porBva[k] || {}, nome = String(bva || '').trim();
  return { local: p.local || `Barreira de Vigilância Agropecuária – ${nome}`,
    objetivo: p.objetivo || `Executar Ações de Fiscalização do Trânsito na ${nome}, visando coibir a entrada de Pragas Quarentenárias Ausentes no Estado do Amazonas.`,
    deslocamento: p.deslocamento || '', intro: p.intro || `Foram realizadas as seguintes ações de fiscalização do trânsito na ${nome}:`, obs: CONFIG.RELEQUIPE.obs,
    termo: p.termo || 'Repasse', repasseLocal: p.repasseLocal || nome, repasseOrgao: p.repasseOrgao || '' };
};
