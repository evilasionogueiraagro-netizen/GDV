// Configurações do posto. Ajuste aqui o que for fixo da unidade.
const CONFIG = {
  unidadePadrao: 'MANAUS',          // unidade que aparece no Termo; pode ser alterada a cada turno
  localPadrao: '',                  // sugestão de local (ex.: 'Barreira Porto CEASA'); vazio = digitar a cada turno
  postos: ['Fixa', 'Móvel'],
  turnos: {
    A: { rotulo: '04h às 12h', inicio: '04:00', fim: '12:00' },
    B: { rotulo: '12h às 20h', inicio: '12:00', fim: '20:00' },
    X: { rotulo: 'Outro horário', inicio: '', fim: '' }   // barreiras móveis / horários especiais
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
  linhasFicha: 50
};
