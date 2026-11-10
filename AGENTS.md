# e-GDV: mapa para agentes e devs

Sistema da ADAF (defesa agropecuária do Amazonas) para barreiras fitossanitárias e vigilância de campo. Português em
tudo: código, comentários, commits e interface.

```
web/ (HTML/JS/CSS, sem build) --POST JSON--> apps-script/*.gs --> Planilha Google (uma aba por tabela) + Drive
GitHub Pages                                 um endpoint (doPost, req.action)
```

Apps em `web/`: campo (raiz), `painel/`, `administrativo/`, `dashboard/` (público), `inicio/`. Back em `apps-script/`, um `.gs`
por área; `Code.gs` tem o `doPost`, `TABELAS` e `VERSAO_CODIGO`. Testes em `tests/`
(`fakegas.js` roda o `Code.gs` real no Node). Porte do back para Hono + PostgreSQL no repositório Sistema_Adaf.

## Onde achar

| Preciso de... | Leia |
|---|---|
| Qualquer área (apps, módulos, API, publicação, testes) | [docs/README.md](docs/README.md), depois só o arquivo da área |
| Regras completas | [docs/regras.md](docs/regras.md) |
| Interface: ícones Lucide, sem emoji, `design.css` | [docs/DESIGN.md](docs/DESIGN.md) |
| Modelo de dados (diagrama de classes) | [docs/arquitetura.md](docs/arquitetura.md) |
| Decisões tomadas e em aberto | [docs/decisoes/](docs/decisoes/README.md) |
| Ideias para depois | [docs/IDEIAS.md](docs/IDEIAS.md) |
| Termo de Referência do produto (atualize a cada função nova ou mudada; Word: `node produto/gerar-tr.js`) | [produto/termo-de-referencia.md](produto/termo-de-referencia.md) |
| Branches, commits e PRs | [docs/FLUXO-GIT.md](docs/FLUXO-GIT.md) |

## Regras que não podem ser quebradas (detalhes em docs/regras.md)

- Coluna nova só no fim de `TABELAS`; nunca renomear, reordenar ou remover.
- Mudou o `Code.gs`: mude o `VERSAO_CODIGO`.
- Gravação dentro do lock (`comLock_`); numeração sempre dentro dele.
- Google só pela camada de acesso ([docs/PORTABILIDADE.md](docs/PORTABILIDADE.md)); menu e gatilhos sem regra de negócio.
- Excluir é lógico (`excluido = 1`); nada é apagado da planilha.
- Datas de negócio em `America/Manaus` (`hojeManaus_()`).
- Repositório público: só dados fictícios. Nada público expõe CPF, nome completo, placa inteira ou coordenada exata. Preserve os nomes, CPFs e exemplos fictícios já padronizados em `tests/` (`Pessoa Ficticia *`, `Fulano Ficticio Teste`, `529.982.247-25`); nunca os substitua por valores de planilhas, prints ou conversas.
- Toda ação que muda dado ou acesso registra quem fez.
- Autoria de commit: todo commit deve identificar a pessoa real responsável (`git config user.name` e `user.email` nominais conferidos antes de commitar). `Co-authored-by` é permitido, mas é proibido commitar tendo apenas `Claude`, `noreply@anthropic.com` ou conta genérica sem identificar o humano responsável.
- Merge na `main` publica em produção: sempre branch + PR; suíte inteira antes do push.
- Sincronização de branches (base atualizada em 10/11/2026): trabalhe sempre a partir de clone atualizado e da `origin/main` após `git fetch --prune origin`. Nunca envie branch, commit ou cópia local anterior ou com histórico divergente (sem `--force`): crie a branch de novo a partir da `origin/main` e reaplique só os arquivos alterados.
- Doc não descreve tela; respeite os limites de tamanho (`node tests/lib/contexto.js`).

## Comandos

```sh
cd tests && npm ci && npx playwright-core install chromium   # uma vez
node run.js --paralelo 4     # suíte inteira, antes de cada push
node run.js tf_e2e           # um teste
node lib/contexto.js         # tamanho da documentação em tokens
```
