# Publicação inicial e acessos

Login por matrícula e senha para todos (decisões em [../decisoes/acesso.md](../decisoes/acesso.md); abas em [../banco.md](../banco.md)).
Passo a passo para o gerente: [web/painel/manual.html](../../web/painel/manual.html). Veja também: [publicação do back](../PUBLICACAO-BACK.md), [rotinas](rotinas.md).

## Montar do zero (uma vez)
1. Planilha nova. Extensões → Apps Script: cole os `apps-script/*.gs` e o manifesto `apps-script/appsscript.json`.
2. Recarregue a planilha (menu e-GDV) e crie o primeiro gerente: e-GDV → Criar o primeiro gerente.
3. Implantar → Nova implantação → App da Web: executar como Eu, acesso Qualquer pessoa. A URL `/exec` vai em `CONFIG.sync.url` (`web/js/config.js`); não é segredo.
4. Depois disso, o back publica sozinho a cada merge na `main` que mude o `VERSAO_CODIGO` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)).
5. GitHub: Settings → Pages → Source: GitHub Actions (o merge na `main` publica `web/`).
6. Com a conta dona da planilha: e-GDV → Ativar rotinas automáticas.

## Contas e sessões (`apps-script/usuarios.gs`)
- Primeiro gerente: menu da planilha, só quando não há gerente ativo. As demais contas: a gerência, no painel (aba Usuários), com senha provisória.
- Senha provisória: troca obrigatória no primeiro acesso, conferida no servidor. Senha com pelo menos 8 caracteres; só o hash com sal fica na planilha.
- Senha esquecida: a gerência gera outra provisória (encerra as sessões da pessoa). Gerente: outro gerente ou e-GDV → Redefinir senha de gerente.
- Tentativas: 10 erros por matrícula ou 50 no total em 15 min bloqueiam a entrada por 15 min.
- Sessão por aparelho, até sair, ser encerrada pela gerência ou a conta ser desativada. Toda chamada confere a conta na planilha.
- Nunca se desativa nem se tira a gerência do último gerente ativo.

## Permissões
- Por app: `campo`, `painel` (só leitura), `administracao` (Portal do Administrativo). Módulos do campo: `fiscalizacaoDeTransito`,
  `termoDeBarreira`, `pce`, `digitarDoPapel` (exige `pce`). `gerencia` vale como todas e libera contas e permissões.
- O servidor aplica (`exigirModulo_`, `MODULO_DA_ACAO`): o `sync` recusa o módulo não liberado (volta em `recusados`); actions de TF/PCE
  respondem `semPermissao`. No app, o módulo sem permissão some do menu; o que já foi feito fica no aparelho e sobe quando liberar.
- TV da sala: usuário próprio só com `painel`.

## Registro
- Criar conta, mudar permissão, gerar senha, encerrar sessão e desativar ficam em `HistoricoDeAlteracoes`, com quem fez.
- As abas antigas (`Fiscais`, `Administrativo`, `AdmSessoes`, `Permissoes`) ficam só como histórico.
