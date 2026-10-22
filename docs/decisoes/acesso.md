# Decisões: controle de acesso

Modelo em [../arquitetura.md](../arquitetura.md) e abas em [../banco.md](../banco.md). Situação: decidido, a implementar.

## Decidido

| Data | Decisão | Por quê |
|---|---|---|
| 16/10/2026 | Uma pessoa = uma conta | contas duplicadas são difíceis de unificar depois |
| 22/10/2026 | Todos entram com **matrícula e senha**, inclusive o gerente. A matrícula é única; quem não tem recebe uma gerada pelo sistema. A conta não guarda CPF | códigos de acesso cansaram; matrícula é o que todo servidor já tem |
| 22/10/2026 | O gerente libera o acesso: cria a conta com matrícula e **senha provisória**; a troca é obrigatória no primeiro acesso (conferida no servidor) | o gerente controla quem entra |
| 22/10/2026 | Senha esquecida: o gerente gera nova senha provisória e a pessoa troca no acesso seguinte. Senha de gerente: outro gerente ou o menu da planilha | sem depender de e-mail |
| 22/10/2026 | O primeiro gerente nasce pelo menu da planilha | alguém precisa começar |
| 22/10/2026 | Permissões: por app (`campo`, `painel`, `administracao`), por módulo do campo (`fiscalizacaoDeTransito`, `termoDeBarreira`, `pce`, `digitarDoPapel`) e `gerencia` (libera acessos). O gerente tem tudo | o gerente decide o que cada um faz |
| 22/10/2026 | Toda chamada consulta a planilha no servidor | revogar ou mudar permissão vale na hora |
| 22/10/2026 | Login salvo no aparelho até sair ou ser revogado; uma sessão por aparelho, revogável sozinha | o campo fica dias sem internet |
| 22/10/2026 | A TV da sala tem usuário próprio, só com `painel` | revoga sem derrubar ninguém e a TV não guarda a senha do gerente |
| 22/10/2026 | Transição: os códigos de hoje continuam até cada pessoa ter login; o gerente desliga quando todos estiverem cadastrados | ninguém é derrubado no dia |
| 22/10/2026 | O dashboard continua público, sem login | já mascara os dados |
| 16/10/2026 | A chave mestra `ACCESS_KEY` sai (hoje vale até nas actions do fiscal) | credencial fora do controle do gerente |
| 20/10/2026 | Senha e token só como hash com sal; limite de tentativas por matrícula e geral | quem lê a planilha não se passa por outro |
| 16/10/2026 | Toda ação registra quem fez (`criadoPor`, `atualizadoPor`); autor separado de quem editou por último | regra de negócio e LGPD (art. 37) |
| 16/10/2026 | O encerramento automático do turno em 12 h continua separado do login | é regra de negócio |
| 22/10/2026 | Nunca tirar o último gerente ativo | ninguém fica trancado fora |

## Rejeitado

| Data | Opção | Por quê |
|---|---|---|
| 16/10/2026 | Login com Google | o Google Cloud pediu cadastro de cobrança com CPF/CNPJ |
| 22/10/2026 | Código de acesso de 6 dígitos (para todos ou para o campo) | trabalhoso de manter; trocado por matrícula e senha |
| 22/10/2026 | CPF na conta | a matrícula basta como chave |

## Em aberto

- Tamanho mínimo da senha (proposta: 8 caracteres, sem outras regras).
