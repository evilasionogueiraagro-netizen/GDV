# Fluxo do Git: branches, commits e pull requests

Várias pessoas e agentes de IA mexem no e-GDV. Este padrão existe para que o histórico responda, sem depender de memória
de ninguém: **quem mudou o quê, por quê e a pedido de quem**. Vale igual para pessoas e agentes. Regras do código ficam
no [AGENTS.md](../AGENTS.md).

## Áreas

A mesma lista serve para o nome da branch e para o título do commit e do PR.

| Branch       | Título do commit          | O que cobre                                  |
|--------------|---------------------------|----------------------------------------------|
| `campo`      | App                       | app das barreiras (fiscal)                   |
| `tf`         | TF                        | Termo de Fiscalização de Barreira            |
| `pce`        | PCE                       | levantamentos e cadastros do PCE             |
| `painel`     | Painel                    | painel gerencial                             |
| `adm`        | Portal do Administrativo  | Portal do Administrativo                     |
| `dashboard`  | Dashboard                 | dashboard público                            |
| `convenio`   | Convênio                  | convênios (metas físicas e financeiras)      |
| `vigifito`   | VIGIFITO                  | VIGIFITO                                     |
| `relatorios` | Relatórios                | relatórios (mensal, consolidado, central)    |
| `servidor`   | Servidor                  | `Code.gs` sem área específica                |
| `testes`     | Testes                    | `tests/`                                     |
| `ci`         | CI                        | `.github/workflows/`                         |
| `docs`       | Docs                      | documentação                                 |

## Branches

- **`main` = produção.** Merge com mudança em `web/**` publica o front no GitHub Pages na hora; se o `VERSAO_CODIGO` do
  `Code.gs` mudou, o back vai para o Apps Script depois dos testes ([PUBLICACAO-BACK.md](PUBLICACAO-BACK.md)).
- Nunca commit nem push direto na `main`. Nunca `git push --force`, em branch nenhuma.
- Uma branch por tarefa, curta (entra em 1 a 3 dias), criada da `origin/main` atualizada:

  ```sh
  git fetch origin
  git switch -c claude/pce-coluna-citros origin/main
  ```

- Nome: `claude/<area>-<assunto>`, em kebab-case, sem acento. Ex.: `claude/pce-coluna-citros`,
  `claude/adm-sessao-30-dias`. O prefixo `claude/` é exigido pelo Claude Code para enviar a branch.
- Sessões do Claude na web criam nomes automáticos (ex.: `claude/focused-volta-gmu6j1`). Renomeie antes do primeiro push
  quando a ferramenta permitir (`git branch -m claude/<area>-<assunto>`); se não der, o título do PR segue o padrão.
- Depois do merge, não reaproveite a branch para outra tarefa: crie outra da `origin/main`. Se precisar mesmo continuar
  nela, traga a `main` antes (`git merge origin/main`).
- Branches mergeadas **não são apagadas**: ficam como registro.

## Commits

- Título: `<Área>: <o que muda>`, até ~72 caracteres, no presente, sem ponto final, com a área por extenso (tabela
  acima). Ex.: `PCE: coluna citros no levantamento (servidor)`,
  `Portal do Administrativo: sessão de 30 dias sem uso (era 12 h)`.
- Corpo, depois de uma linha em branco: o porquê e o que muda para quem usa. Mexeu no `Code.gs`: cite o
  `VERSAO_CODIGO` novo.
- Uma mudança lógica por commit. Adicione os arquivos pelo nome (`git add web/js/pce.js`), não `git add -A` nem
  `git add .`. Confira `git status` (e `git diff --staged`) antes de cada commit.
- **Autor = a pessoa responsável pela mudança**, com `user.name` e `user.email` reais no `git config`. Nada de conta
  genérica nem da conta de outra pessoa.
- Ferramenta de IA não entra como autor nem coautor (`Co-authored-by` é só para pessoas): quem responde pela mudança é a
  pessoa do `git config` e a conta do GitHub que abre o PR.
- Quem pediu a mudança vai no corpo ou no PR, pelo setor ou cargo (ex.: "pedido da gerência da GDV"). Nenhum outro dado
  pessoal: o histórico é público.

Exemplo:

```text
Portal do Administrativo: sessão de 30 dias sem uso (era 12 h)

Com 12 h, o administrativo precisava entrar de novo todo dia. Agora a sessão renova a cada uso e só
cai depois de 30 dias parada, no Sair ou se o gerente revogar.
VERSAO_CODIGO 2026-10-20c.
```

## Pull requests

- Título no mesmo padrão do commit (`<Área>: <o que muda>`).
- Corpo pelo modelo [`.github/pull_request_template.md`](../.github/pull_request_template.md) (o GitHub preenche sozinho
  ao abrir o PR).
- Antes de abrir o PR e de novo antes do merge, traga a `main` para a branch:

  ```sh
  git fetch origin
  git merge origin/main
  ```

  Se os dois lados mudaram o `Code.gs`, escolha um `VERSAO_CODIGO` novo, maior que o da `main`. O git não avisa quando
  as duas branches escolheram o mesmo valor (não dá conflito), e com a versão igual à do ar o back não é publicado.
- Rode localmente os testes da área (seção "Testes" do [AGENTS.md](../AGENTS.md)); de preferência a suíte inteira
  (`node run.js`), para o CI não falhar depois do push.
- Merge só com o CI verde, pelo botão **Create a merge commit** (não "Squash" nem "Rebase"): o commit
  "Merge pull request #N" liga o código ao PR e à discussão dele.

## Agentes em paralelo

- Cada agente na sua branch e no seu worktree (ex.: `git worktree add ../gdv-citros -b claude/pce-citros origin/main`).
- Não edite a mesma área de outro PR aberto ao mesmo tempo (`gh pr list` mostra os abertos). Se não tiver jeito,
  combine a ordem e traga a `main` depois do primeiro merge.
- Portas de teste diferentes por agente, para dois fakegas não brigarem:
  `GDV_PORTA_WEB=8181 GDV_PORTA_API=8182 node run.js pce_server_test`.
- Commits de checkpoint durante o trabalho são ok, mas o PR deve contar uma história clara. Reorganizar commits só
  antes do primeiro push; depois, sem `--force`, o que foi enviado fica.
- **Agente não faz merge** sem o ok explícito de uma pessoa para aquele PR.
