/* ---------- Documentos do sistema no Drive (Termo de Referência do e-GDV) ----------
 * A cada merge na main que muda produto/, o GitHub gera o Word (.github/workflows/documentos.yml) e envia aqui (action
 * docSistemaSalvar) com a chave DOC_SISTEMA_CHAVE (propriedade do script; menu e-GDV → Chave dos documentos do sistema; a mesma
 * vai no segredo do repositório). O arquivo fica no Drive do dono da planilha, na pasta "GDV - Documentos do sistema" (o link fixo é
 * o da pasta); a versão anterior vai para a subpasta "Versões anteriores", com a data no nome. Registro em HistoricoDeAlteracoes.
 */
const DOCS_SISTEMA_PASTA_ = 'GDV - Documentos do sistema', DOCS_SISTEMA_ANTERIORES_ = 'Versões anteriores';
const DOCS_SISTEMA_ = {                                  // nomes aceitos (nada além disso entra na pasta)
  'Termo_de_Referencia_e-GDV.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', max: 5 * 1024 * 1024 }
};

/** Pasta "GDV - Documentos do sistema" (id em PASTA_DOCS_SISTEMA; recriada se sumir). */
function pastaDocsSistema_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_DOCS_SISTEMA');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder(DOCS_SISTEMA_PASTA_);
  props.setProperty('PASTA_DOCS_SISTEMA', nova.getId());
  return nova;
}

/** Gera (e grava) a chave nova do envio; a anterior deixa de valer. Devolve a chave para o segredo DOC_SISTEMA_CHAVE do GitHub. */
function docSistemaChaveNova_() {
  const chave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('DOC_SISTEMA_CHAVE', chave);
  return chave;
}

/** Compara sem parar no primeiro caractere diferente (não dá pista do tamanho do acerto). */
function mesmaChave_(a, b) {
  a = String(a || ''); b = String(b || '');
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0 && a.length > 0;
}

/** Recebe o Word do GitHub: req = {chave, nome, versao, base64}. Guarda na pasta e move o anterior para "Versões anteriores". */
function docSistemaSalvar_(req) {
  const chave = PropertiesService.getScriptProperties().getProperty('DOC_SISTEMA_CHAVE');
  if (!chave) throw new Error('Envio de documentos do sistema não configurado (menu e-GDV → Chave dos documentos do sistema).');
  if (!mesmaChave_(req.chave, chave)) throw new Error('Chave inválida.');
  const nome = String(req.nome || ''), cfg = DOCS_SISTEMA_[nome];
  if (!cfg) throw new Error('Documento não aceito.');
  const versao = textoAutor_(String(req.versao || '').replace(/[^\w .,/:-]/g, '')).slice(0, 40);
  let bytes;
  try { bytes = Utilities.base64Decode(String(req.base64 || '').replace(/\s/g, '')); } catch (e) { throw new Error('Arquivo inválido.'); }
  if (!bytes.length || bytes.length > cfg.max) throw new Error('Arquivo vazio ou grande demais.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error('Arquivo inválido (não é um .docx).');   // .docx = zip ("PK")
  return comLock_(function () {
    const pasta = pastaDocsSistema_(), agora = Date.now(), quando = Utilities.formatDate(new Date(agora), 'America/Manaus', 'yyyy-MM-dd HH-mm');
    const it = pasta.getFoldersByName(DOCS_SISTEMA_ANTERIORES_), anteriores = it.hasNext() ? it.next() : pasta.createFolder(DOCS_SISTEMA_ANTERIORES_);
    const velhos = pasta.getFilesByName(nome);
    while (velhos.hasNext()) { const v = velhos.next(); v.setName(quando + ' - ' + nome); v.moveTo(anteriores); }
    const arq = pasta.createFile(Utilities.newBlob(bytes, cfg.mime, nome));
    inserir_('HistoricoDeAlteracoes', [{ id: uuid_(), em: agora, usuarioId: 'GitHub (publicação automática)', acao: 'atualizar documento do sistema',
      tabela: 'Drive', registroId: arq.getId(), antes: '', depois: JSON.stringify({ nome: nome, versao: versao, bytes: bytes.length }) }]);
    return { ok: true, id: arq.getId(), pasta: pasta.getId() };
  });
}
