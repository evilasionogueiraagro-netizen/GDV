/* ---------- Turno antigo (digitar do papel) ----------
 * Termo de Fiscalização do turno feito no papel (só o PDF): o fiscal com "Digitar do papel" digita no app o nº do Termo, a data, o
 * local, os fiscais, o horário e os totais do Termo (veículos fiscalizados e pessoas orientadas) e anexa o PDF escaneado. O servidor
 * grava o turno encerrado (registroAntigo = 1, pdfs) e um veículo sem placa por veículo do Termo (obs "Termo do papel"), para o turno
 * contar como os outros no painel, no VIGIFITO, no convênio e no Relatório GDV. As pessoas orientadas vão em pessoasEducacao.
 * A letra (A, B, C…) segue a ordem do nº (letrasDosTurnos_). Reenvio com o mesmo id não duplica.
 */
const PAPEL_MAX_VEICULOS = 2000, PAPEL_MAX_PESSOAS = 100000;
const RE_DATA_ = /^\d{4}-\d{2}-\d{2}$/;

function turnoPapelRegistrar_(req, usuario) {
  exigirAntigo_(usuario);
  const t = req.turno || {};
  const id = String(t.id || '').trim(), n = Math.floor(Number(t.numero)), data = String(t.data || '').trim();
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) throw new Error('Turno sem identificador válido.');
  if (!(n >= 1 && n <= 99999)) throw new Error('Informe o nº do Termo de Fiscalização.');
  if (!RE_DATA_.test(data) || isNaN(Date.parse(data + 'T12:00:00-04:00'))) throw new Error('Data inválida.');
  if (data > hojeManaus_()) throw new Error('A data do turno não pode ser no futuro.');
  const inicio = String(t.inicio || '').trim(), fim = String(t.fim || '').trim();
  if (!RE_HM_.test(inicio) || !RE_HM_.test(fim)) throw new Error('Informe o horário de início e de fim (HH:MM).');
  const local = textoCurto_(t.local, 120), unidade = textoCurto_(t.unidade || t.local, 120), posto = t.posto === 'Móvel' ? 'Móvel' : 'Fixa';
  if (!local) throw new Error('Informe o local (BVA) do turno.');
  const fiscais = String(t.fiscal || '').split(/\s+e\s+|,|;|\//).map(function (x) { return x.trim(); }).filter(Boolean).map(nomeServidor_);
  if (!fiscais.length) throw new Error('Informe o nome completo do fiscal.');
  const veic = Math.floor(Number(req.veiculos)), pes = Math.floor(Number(req.pessoas));
  if (!(veic >= 0 && veic <= PAPEL_MAX_VEICULOS)) throw new Error('Nº de veículos inválido (0 a ' + PAPEL_MAX_VEICULOS + ').');
  if (!(pes >= 0 && pes <= PAPEL_MAX_PESSOAS)) throw new Error('Nº de pessoas orientadas inválido.');
  const pdfs = (Array.isArray(t.pdfs) ? t.pdfs : lerJSONSeguro_(t.pdfs, [])).map(String).filter(function (x) { return /^[0-9a-f-]{20,64}$/i.test(x); }).slice(0, 10);
  return comLock_(function () {
    const ja = lerLeitura_('Turnos').filter(function (x) { return x.id === id; })[0];
    if (ja) return { ok: true, turno: ja, existente: true };                     // reenvio (resposta perdida): não duplica
    const agora = Date.now(), ano = data.slice(0, 4);
    const turno = { id: id, numeroTF: 'TF-' + String(n).padStart(3, '0') + '-A-' + ano, data: data, letra: 'A', inicio: inicio, fim: fim,
      fiscal: fiscais.join(' e '), local: local, unidade: unidade, posto: posto, encerrado: 1, criadoEm: agora, atualizadoEm: agora, srv_ts: agora,
      usuario: usuario, semPlaca: 1, pessoasEducacao: pes, soPessoas: 0, registroAntigo: 1, pdfs: JSON.stringify(pdfs) };
    letrasDosTurnos_([turno]);                                                   // A, B, C… pela ordem do nº na mesma BVA
    inserir_('Turnos', [turno]);
    const veiculos = [];
    for (let i = 0; i < veic; i++) veiculos.push({ id: uuid_(), turnoId: id, hora: '', placa: '', tipo: '', pessoas: 0, obs: 'Termo do papel', excluido: 0,
      criadoEm: agora, atualizadoEm: agora, srv_ts: agora, usuario: usuario, importacao: 'papel' });
    inserir_('Veiculos', veiculos);
    return { ok: true, turno: turno, veiculos: veic };
  });
}
