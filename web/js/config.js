// Configurações do posto. Ajuste aqui o que for fixo da unidade.
const CONFIG = {
  // Endereço do servidor (Apps Script, termina em /exec). Não é segredo: sem uma credencial de fiscal
  // o servidor recusa tudo. Com ele preenchido, o fiscal só digita o código de 6 dígitos.
  sync: { url: 'https://script.google.com/macros/s/AKfycbx58-TObty08Aqc5Vft30r_G_zzLPq_agJReOqJcFgXRKkVXoqb4vFPowi3kDKo3q7p/exec' },
  unidadePadrao: 'MANAUS',          // unidade que aparece no Termo; pode ser alterada a cada turno
  localPadrao: '',                  // sugestão de local (ex.: 'Barreira Porto CEASA'); vazio = digitar a cada turno
  postos: ['Fixa', 'Móvel'],
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

  // Termo de Fiscalização de Barreira (TF)
  TF: {
    reserva: 3,                                   // quantos números cada aparelho mantém reservados (funciona sem internet)
    vias: ['1ª via', '2ª via'],                   // impressas em páginas separadas, para assinatura
    relacoes: ['Transportador', 'Proprietário', 'Motorista', 'Responsável Técnico', 'Outro'],
    unidades: ['Kg', 'Ton', 'Caixas', 'Sacos', 'Unidades', 'Mudas'],
    produtos: ['ABIU', 'ACEROLA', 'AJURU', 'AMEIXA ROXA', 'ARAÇÁ BOI', 'BACUPARI', 'BIRIBÁ', 'CAJU', 'CARAMBOLA', 'CASTANHOLA', 'COCO',
               'FRUTA-PÃO', 'GOIABA', 'GOMUTO', 'JACA', 'JAMBO', 'JUJUBA', 'LARANJA', 'LICANIA', 'LIMÃO', 'LIMÃO CAYENA', 'MANGA',
               'MURUCI', 'PIMENTA DE CHEIRO', 'PIMENTA PICANTE', 'PITANGA', 'POMELO', 'SAPOTILHA', 'TANGERINA', 'TAPEREBÁ', 'TOMATE',
               'MUDAS', 'MUDAS-BANANEIRA', 'MAMÃO', 'OUTROS'],
    procedimentos: { liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' },
    textoLegal: 'Lei Federal 9.712 de 20/11/1998; Dec. Federal nº 24.114 de 12/04/1934; Artigo 259 do Código Penal Brasileiro;\n' +
      'Lei Estadual nº 3.097 de 27/11/2006; Dec. Estadual nº 36.108 de 06/08/2015; (Seção VIII, Art. 35, Grupo II, Alínea\n' +
      '"A"); IN nº 38 de 01/10/2018; PORTARIA SDA/MAPA Nº 1.503, DE 19 DE DEZEMBRO DE 2025.',
    // Textos sugeridos (copiados do rascunho do sistema de TF); o fiscal pode editar no formulário.
    constatacao: {
      liberacao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado COM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.',
      apreensao: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo foi liberado.',
      rechaco: 'Em abordagem ao veículo acima mencionado, foi constatado o trânsito do produto supracitado SEM a devida documentação fitossanitária obrigatória (PTV); o produto é potencial hospedeiro da Mosca-da-Carambola. Após os procedimentos o veículo retornou à origem.'
    }
  }
};

const letraDoTurno = hora => { const h = parseInt(hora, 10); return h >= 4 && h < 12 ? 'A' : 'B'; };
