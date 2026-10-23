# Publicação inicial e acessos

O acesso vai mudar: decisões em [../decisoes/acesso.md](../decisoes/acesso.md).

Montar do zero, fiscais, módulos por servidor e a aba Servidores. Veja também: [publicação do back](../PUBLICACAO-BACK.md), [rotinas](rotinas.md).

## Montar do zero (uma vez)
1. Planilha nova. Extensões → Apps Script: cole `apps-script/Code.gs` e o manifesto `apps-script/appsscript.json`.
2. Recarregue a planilha (menu e-GDV). Opcional: propriedade `ACCESS_KEY` (chave mestra de administrador).
3. Implantar → Nova implantação → App da Web: executar como Eu, acesso Qualquer pessoa. A URL `/exec` vai em `CONFIG.sync.url` (`web/js/config.js`); não é segredo.
4. Depois disso, o back publica sozinho a cada merge na `main` que mude o `VERSAO_CODIGO` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)).
5. GitHub: Settings → Pages → Source: GitHub Actions (o merge na `main` publica `web/`).
6. Com a conta dona da planilha: e-GDV → Ativar rotinas automáticas.

## Fiscais
- Gerar: e-GDV → Gerar código de ativação (nome completo), ou painel → Servidores. Código de 6 dígitos, uso único, vale 7 dias. Após 10 erros, bloqueio de 15 min. Outro celular do mesmo fiscal: novo código, mesmo nome.
- O fiscal digita o código uma vez, com internet, no app instalado na tela inicial. O aparelho ganha credencial própria, vinculada ao nome.
- Revogar: e-GDV → Revogar acesso (ou Revogar no painel). O aparelho para e pede novo código.
- Aba `Fiscais`: `nome`, `codigo`, `token`, `ativo`, `expiraEm`, `perfil` (`admin` = administrador), `geradoPor`, `oculto`.

## Módulos por servidor
- Aba `Permissoes`: `nome`, `veiculos` (Fiscalização), `tf`, `pce`, `antigo` (Papel). 1 = liberado; 0 = bloqueado. Sem linha ou célula vazia = liberado (padrão).
- Pelo menos um módulo; para tirar tudo, Revogar.
- Papel (`antigo`) vem desligado: só `1`, `sim` ou `true` liberam, e exige PCE (`antigo = 1` com `pce = 0` vale 0).
- Editar: painel → Servidores (salva na hora). O servidor aplica (`exigirModulo_`, `MODULO_DA_ACAO`): o `sync` recusa o bloqueado (volta em `recusados`); actions de TF/PCE respondem `semPermissao`.
- No app, o módulo bloqueado fica cinza. O que já foi feito sobe quando liberar.

## Aba Servidores do painel
- Gerar chave: nome completo (até 80 caracteres); código visível só até a ativação.
- Revogar: tira na hora aparelhos e códigos. Administradores: "Mostrar administradores". Seu próprio acesso não tem Revogar.
- Remover da lista (revogado ou vencido, sem aparelho ativo): só marca `oculto` em `Fiscais`; não apaga. Restaurar desfaz.
- Código de administrador: só pelo menu da planilha.
- Actions (parâmetros em [API](../API.md)): `painelGerarCodigo`, `painelAcessos`, `painelRevogar`, `painelRevogarAdmin`, `painelOcultarAcesso`, `painelRestaurarAcesso`, `painelPermissoes`.

## Proteção do painel
- Página sem dados; só administrador (ou `ACCESS_KEY`) os recebe. Fiscal vê "Acesso restrito ao administrador".
- 5 códigos de administrador errados: painel bloqueado por 15 min (contador próprio).
- Credenciais nunca saem do servidor.
