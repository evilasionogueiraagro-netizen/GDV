/* ---------- Relatório da equipe (prestação de contas do convênio, etapa 1.10) ----------
 * Um relatório por escala publicada: a equipe (nº, fiscais e responsável, da escala), o período e a BVA, e os números de todos os
 * turnos da equipe no período (veículos, TFs de barreira, apreensões, kg apreendidos, rechaços, educação sanitária). Os números
 * vêm da planilha a cada leitura; o que se edita (local, objetivo, deslocamento, kg corrigido, termos de repasse, OBS e o Termo de
 * Repasse de produtos apreendidos: nº, local e data, órgão que recebe e itens) fica na aba
 * RelatoriosEquipe (id = id da escala). Veem: os fiscais da escala, a coordenação e o painel. Editam: o responsável da equipe,
 * a coordenação (permissão escala) e a gerência. Toda gravação vai para HistoricoDeAlteracoes.
 */
const REL_EQUIPE_DIAS_ = 120;                         // lista: escalas publicadas que acabaram há até 120 dias (e as em andamento)
const REL_EQUIPE_CAMPOS_ = { local: 200, objetivo: 1500, deslocamento: 300, intro: 500, kg: 20, repasse: 6, obs: 1500,
                            repasseNumero: 20, repasseLocalData: 200, repasseOrgao: 60 };
const REL_EQUIPE_ITENS_ = 120;                        // itens do Termo de Repasse (nº do TF, produto, unidade, quantidade)

/** Chave da BVA para comparar turno, TF (barreira) e escala: apelido → nome da BVA (localCanon_), só letras e números, sem o "BVA". */
function chaveBvaRel_(v) { return normPub_(localCanon_(v)).replace(/ /g, '').replace(/^bva/, ''); }

/** Quem pode ver/editar o relatório da escala `e`. painel = objeto do usuário do painel (gerência: gravar). */
function relEquipeAcesso_(e, painel) {
  if (painel) return { ver: true, editar: !!painel.gravar };
  const eu = USUARIO_ATUAL_ || {}, coord = !!(eu.modulos && eu.modulos.escala === 1);
  const membro = e.fiscais.some(function (f) { return (f.id && f.id === eu.id) || nomeChave_(f.nome) === nomeChave_(eu.nome); });
  const resp = !!e.responsavel && (e.responsavel === eu.id || e.responsavel === 'nome:' + nomeChave_(eu.nome));
  return { ver: membro || coord, editar: resp || coord, responsavel: resp };
}

/**
 * Números da equipe no período: turnos (não cancelados) da BVA com data no período em que um fiscal da escala esteve (dono ou colega
 * pelo código); TFs não cancelados desses turnos e os sem turno da BVA no período lavrados por um fiscal da escala.
 */
function relEquipeApurar_(e) {
  const bva = chaveBvaRel_(e.bva), noPer = function (d) { d = String(d || '').slice(0, 10); return d >= e.inicio && d <= e.fim; };
  const nomes = {}; e.fiscais.forEach(function (f) { nomes[nomeChave_(f.nome)] = 1; });
  const colegas = {};
  lerLeitura_('Pareamentos').forEach(function (p) { if (p.turnoId && p.colega && p.entrouEm) (colegas[p.turnoId] = colegas[p.turnoId] || []).push(p.colega); });
  const daEquipe = function (t) {
    const quem = [t.usuario].concat(String(t.fiscal || '').split(/\s+e\s+|,|;|\//), lerJSONSeguro_(t.colegas, []), colegas[t.id] || []);
    return quem.some(function (n) { return nomes[nomeChave_(n)]; });
  };
  const turnos = {}, out = { turnos: 0, veiculos: 0, educacao: 0, tfs: 0, apreensoes: 0, rechacos: 0, liberacoes: 0, kg: 0, outras: {}, numerosTF: [], apreendidos: [] };
  lerLeitura_('Turnos').forEach(function (t) {
    if (!t.id || t.cancelado === 1 || !noPer(t.data) || chaveBvaRel_(t.local) !== bva || !daEquipe(t)) return;
    turnos[t.id] = 1; out.turnos++; out.educacao += Number(t.pessoasEducacao) || 0;
  });
  lerLeitura_('Veiculos').forEach(function (v) {
    if (!v.id || v.excluido === 1 || !turnos[v.turnoId]) return;
    out.veiculos++; out.educacao += Number(v.pessoas) || 0;                     // educação sanitária: pessoas orientadas (como no motor)
  });
  const barreiras = {}; lerLeitura_('Barreiras').forEach(function (b) { if (b.id) barreiras[b.id] = b; });
  const daBva = function (f) { const b = barreiras[f.barreira] || {}; return [f.barreira, b.nome, b.sufixo].some(function (x) { return x && chaveBvaRel_(x) === bva; }); };
  lerLeitura_('TFs').forEach(function (f) {
    if (!f.id || f.cancelado === 1) return;
    if (!(f.turnoId && turnos[f.turnoId]) && !(!f.turnoId && noPer(f.data) && daBva(f) && (nomes[nomeChave_(f.usuario)] || nomes[nomeChave_(f.fiscal)]))) return;
    out.tfs++; if (f.numeroTxt) out.numerosTF.push(String(f.numeroTxt));
    if (f.procedimento === 'liberacao') out.liberacoes++;
    if (f.procedimento === 'rechaco') out.rechacos++;
    if (f.procedimento !== 'apreensao') return;
    out.apreensoes++;
    produtosTF_(f.produtos).forEach(function (pr) {                            // kg: Kg e Ton (× 1000); as outras unidades à parte
      if (pr.quantidade === null) return;
      out.apreendidos.push({ tf: String(f.numero || f.numeroTxt || ''), p: pr.produto, u: pr.unidade, q: pr.quantidade });   // Termo de Repasse
      const t = toneladas_(pr.quantidade, pr.unidade);
      if (t !== null) out.kg += t * 1000; else { const u = pr.unidade || 'sem unidade'; out.outras[u] = (out.outras[u] || 0) + pr.quantidade; }
    });
  });
  out.kg = Math.round(out.kg * 100) / 100;
  out.numerosTF.sort();
  out.apreendidos.sort(function (a, b) { return (Number(a.tf) || 0) - (Number(b.tf) || 0) || a.tf.localeCompare(b.tf); });
  return out;
}

/** Escala de um relatório (publicada, não excluída) com o nº da equipe e o responsável. */
function relEquipeEscala_(id) {
  id = String(id || '').trim();
  if (!id || id.length > 64) throw new Error('Escala não informada.');
  const e = escalasVivas_().filter(function (x) { return x.id === id; })[0];
  if (!e || e.situacao !== 'publicada') throw new Error('Esta escala não está publicada (ou foi excluída). Atualize a tela.');
  return e;
}
const relEquipeSalvo_ = function (id) { return lerLeitura_('RelatoriosEquipe').filter(function (r) { return r.id === id; })[0] || null; };

/** Escalas publicadas (em andamento ou que acabaram há até 120 dias) cujo relatório quem chama pode ver. */
function relEquipeLista_(painel) {
  const hoje = hojeManaus_(), de = somarDias_(hoje, -REL_EQUIPE_DIAS_), salvos = {};
  lerLeitura_('RelatoriosEquipe').forEach(function (r) { if (r.id) salvos[r.id] = r; });
  const escalas = escalasVivas_().filter(function (e) { return e.situacao === 'publicada' && e.fim >= de && e.inicio <= hoje && relEquipeAcesso_(e, painel).ver; })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio) || a.bva.localeCompare(b.bva, 'pt-BR'); }).slice(0, 60)
    .map(function (e) { const a = relEquipeAcesso_(e, painel), s = salvos[e.id];
      return { id: e.id, bva: e.bva, inicio: e.inicio, fim: e.fim, equipeNumero: e.equipeNumero, editar: a.editar, salvoEm: s ? Number(s.atualizadoEm) || 0 : 0 }; });
  return { ok: true, hoje: hoje, escalas: escalas };
}

/** Relatório de uma escala: a escala, os números, o que foi salvo e, sem nada salvo, os textos do último relatório da mesma BVA. */
function relEquipe_(req, painel) {
  const e = relEquipeEscala_(req.escalaId), a = relEquipeAcesso_(e, painel);
  if (!a.ver) throw new Error('Este relatório é só da equipe da escala.');
  const s = relEquipeSalvo_(e.id);
  let anterior = null;
  if (!s) {
    const ids = {}; escalasVivas_().forEach(function (x) { if (chaveBvaRel_(x.bva) === chaveBvaRel_(e.bva) && x.inicio < e.inicio) ids[x.id] = x.inicio; });
    const ult = lerLeitura_('RelatoriosEquipe').filter(function (r) { return ids[r.id]; }).sort(function (x, y) { return ids[y.id].localeCompare(ids[x.id]); })[0];
    if (ult) { const d = lerJSONSeguro_(ult.dados, {}); anterior = { local: d.local || '', objetivo: d.objetivo || '', deslocamento: d.deslocamento || '', intro: d.intro || '' }; }
  }
  return { ok: true, escala: e, numeros: relEquipeApurar_(e), dados: s ? lerJSONSeguro_(s.dados, {}) : null, anterior: anterior,
           salvoEm: s ? Number(s.atualizadoEm) || 0 : 0, salvoPor: s ? String(s.atualizadoPor || '') : '', editar: a.editar };
}

/** Grava os campos editáveis (só o responsável da equipe, a coordenação ou a gerência). */
function relEquipeSalvar_(req, quem, painel) {
  const e = relEquipeEscala_(req.escalaId), a = relEquipeAcesso_(e, painel);
  if (!a.editar) throw new Error('Só o responsável pela equipe (ou a coordenação) edita este relatório.');
  const d = req.dados && typeof req.dados === 'object' ? req.dados : {}, dados = {};
  Object.keys(REL_EQUIPE_CAMPOS_).forEach(function (k) { dados[k] = textoAutor_(String(d[k] == null ? '' : d[k]).replace(/\r/g, '').trim()).slice(0, REL_EQUIPE_CAMPOS_[k]); });
  if (dados.kg && !/^\d{1,9}([.,]\d{1,3})?$/.test(dados.kg)) throw new Error('Quantidade apreendida (kg): use só números (ex.: 125,5).');
  if (dados.repasse && !/^\d{1,4}$/.test(dados.repasse)) throw new Error('Termos de repasse: use um número inteiro.');
  // itens do Termo de Repasse: [{tf, p, u, q}] (sem itens = os produtos das apreensões, montados na tela)
  if (Array.isArray(d.repasseItens)) {
    if (d.repasseItens.length > REL_EQUIPE_ITENS_) throw new Error('Termo de repasse: itens demais (até ' + REL_EQUIPE_ITENS_ + ').');
    dados.repasseItens = d.repasseItens.map(function (x) {
      const t = function (v, n) { return textoAutor_(String(v == null ? '' : v).replace(/\s+/g, ' ').trim()).slice(0, n); };
      const it = { tf: t(x && x.tf, 20), p: t(x && x.p, 80), u: t(x && x.u, 20), q: t(x && x.q, 12).replace(',', '.') };
      if (it.q && !/^\d{1,9}(\.\d{1,3})?$/.test(it.q)) throw new Error('Termo de repasse: quantidade inválida em "' + (it.p || 'item') + '" (use números, ex.: 2,5).');
      return it;
    }).filter(function (x) { return x.p || x.q; });
  }
  return comLock_(function () {
    const atual = lerLinhas_('RelatoriosEquipe').filter(function (r) { return r.id === e.id; })[0], agora = Date.now();
    const reg = { escalaId: e.id, dados: JSON.stringify(dados), atualizadoEm: agora, atualizadoPor: textoAutor_(quem) };
    if (atual) atualizar_('RelatoriosEquipe', atual._linha, reg);
    else inserir_('RelatoriosEquipe', [Object.assign({ id: e.id, criadoEm: agora, criadoPor: textoAutor_(quem) }, reg)]);
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: 'salvar relatório da equipe',
      tabela: 'RelatoriosEquipe', registroId: e.id, antes: atual ? String(atual.dados || '') : '', depois: reg.dados }]);
    return { ok: true, salvoEm: agora, salvoPor: reg.atualizadoPor };
  });
}

/* app de campo (key) */
function relEquipeAcao_(req, usuario) {
  if (req.action === 'relEquipeLista') return relEquipeLista_(null);
  if (req.action === 'relEquipe') return relEquipe_(req, null);
  return relEquipeSalvar_(req, usuario, null);
}
/* painel (token): ver quem abre o painel; gravar só a gerência */
function painelRelEquipe(token, req) {
  const quem = adminDoToken_(token), podeGravar = (function () { try { adminDoToken_(token, true); return true; } catch (e) { return false; } })();
  const p = { nome: quem, gravar: podeGravar };
  if (req.action === 'painelRelEquipeLista') return relEquipeLista_(p);
  if (req.action === 'painelRelEquipe') return relEquipe_(req, p);
  return relEquipeSalvar_(req, adminDoToken_(token, true), p);
}
