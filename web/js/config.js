// Configurações do posto. Ajuste aqui o que for fixo da unidade.
const CONFIG = {
  // Sincronização embutida (OPCIONAL). Se preencher aqui, todos os aparelhos já nascem ativados.
  // ATENÇÃO: este arquivo é público (site e repositório). Quem abrir o app consegue ler a chave e
  // acessar/gravar na planilha. Prefira o LINK DE ATIVAÇÃO (ativar.html), que não expõe a chave no código.
  sync: { url: '', key: '' },
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
  linhasFicha: 50
};

const letraDoTurno = hora => { const h = parseInt(hora, 10); return h >= 4 && h < 12 ? 'A' : 'B'; };
