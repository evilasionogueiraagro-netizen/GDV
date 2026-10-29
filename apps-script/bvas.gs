/* ---------- Cadastro de BVAs (painel, gerência) ----------
 * A base é CONFIG.bvas do app (web/js/config.js). A aba BVAs acrescenta BVAs novas e muda as da base pelo nome (inclusive desativar):
 * os aparelhos recebem a lista no sync (bvas) e o painel no painelDados (bvasCadastro); cada front junta com CONFIG.aplicarBvas.
 * O nome não muda depois de criado (os turnos guardam o nome da BVA): para trocar, desative e cadastre outra. Tudo em HistoricoDeAlteracoes.
 */
/** Linhas da aba BVAs para os fronts: {id, nome, municipio, endereco, placa, ficha, ativo}. */
function bvasCadastro_() {
  return lerLeitura_('BVAs').filter(function (b) { return b.id && b.nome; }).map(function (b) {
    return { id: b.id, nome: b.nome, municipio: b.municipio || '', endereco: b.endereco || '', placa: Number(b.placa) === 1 ? 1 : 0, ficha: Number(b.ficha) === 1 ? 1 : 0,
             ativo: Number(b.ativo) === 0 ? 0 : 1, atualizadoEm: Number(b.atualizadoEm) || 0, atualizadoPor: b.atualizadoPor || '' };
  });
}
/** Nome no padrão do app: "BVA - NOME" em maiúsculas. */
function nomeBva_(v) {
  let n = String(v || '').trim().replace(/\s+/g, ' ').replace(/^bva\s*[-–]?\s*/i, '').toUpperCase();
  return n ? 'BVA - ' + n : '';
}
/** painelBvaSalvar {bva: {id?, nome, municipio, endereco, placa, ficha, ativo}}: cria ou altera (só a gerência). */
function painelBvaSalvar(token, req) {
  const quem = adminDoToken_(token, true), b = req && req.bva;
  if (!b || typeof b !== 'object') throw new Error('BVA não informada.');
  const texto = function (v, max) { return textoAutor_(String(v || '').trim().replace(/\s+/g, ' ')).slice(0, max); };
  const reg = { municipio: texto(b.municipio, 60), endereco: texto(b.endereco, 160), placa: b.placa ? 1 : 0, ficha: b.ficha ? 1 : 0, ativo: b.ativo === false || b.ativo === 0 ? 0 : 1 };
  return comLock_(function () {
    const linhas = lerLinhas_('BVAs'), id = String(b.id || '').trim(), atual = id ? linhas.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !atual) throw new Error('Esta BVA não existe mais. Atualize a tela.');
    const nome = atual ? atual.nome : nomeBva_(b.nome);
    if (!atual) {
      if (nome.length < 9 || nome.length > 60) throw new Error('Informe o nome da BVA (ex.: BVA - HUMAITÁ).');
      if (linhas.some(function (x) { return normPub_(x.nome) === normPub_(nome); })) throw new Error('Já existe a ' + nome + ' no cadastro: edite a que existe.');
    }
    if (!reg.municipio) throw new Error('Informe o município da BVA.');
    const agora = Date.now();
    Object.assign(reg, { atualizadoEm: agora, atualizadoPor: textoAutor_(quem) });
    let novoId = id;
    if (atual) atualizar_('BVAs', atual._linha, reg);
    else { novoId = uuid_(); inserir_('BVAs', [Object.assign({ id: novoId, nome: nome, criadoEm: agora, criadoPor: textoAutor_(quem) }, reg)]); }
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: (USUARIO_ATUAL_ && USUARIO_ATUAL_.id) || textoAutor_(quem), acao: atual ? 'alterar BVA' : 'cadastrar BVA',
      tabela: 'BVAs', registroId: novoId, antes: atual ? JSON.stringify({ municipio: atual.municipio, endereco: atual.endereco, placa: atual.placa, ficha: atual.ficha, ativo: atual.ativo }) : '',
      depois: JSON.stringify(Object.assign({ nome: nome }, reg)) }]);
    return { ok: true, bva: Object.assign({ id: novoId, nome: nome }, reg), bvas: bvasCadastro_() };
  });
}
