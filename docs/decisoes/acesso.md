# Decisões: controle de acesso

Modelo em [../arquitetura.md](../arquitetura.md#1-acesso-proposta-a-implementar). Situação: decidido, a implementar.

## Decidido

| Data | Decisão | Por quê |
|---|---|---|
| 16/10/2026 | Uma pessoa = uma conta. Perfis, aparelhos e códigos ficam pendurados nela; código é forma de entrar, nunca conta nova | contas duplicadas (por perfil, aparelho ou grafia do nome) são difíceis de unificar depois |
| 16/10/2026 | CPF é a chave única da conta, em texto na planilha; dígitos conferidos na entrada, CPF repetido recusado, mascarado nas telas | MVP; a planilha já guarda muitos CPFs e o acesso a ela é restrito |
| 16/10/2026 | O gerente concede e revoga tudo, inclusive outros gerentes | é ele quem responde pela equipe |
| 16/10/2026 | A chave mestra `ACCESS_KEY` sai; o dev entra como gerente | uma credencial a menos fora do controle do gerente |
| 16/10/2026 | O encerramento automático do turno em 12 h continua separado do login | é regra de negócio, não de sessão |
| 22/10/2026 | Gerente entra com **usuário e senha**; os demais com **código de 6 dígitos** | o gerente vê tudo e precisa de proteção maior; no campo o código é mais simples |
| 20/10/2026 | Um código por pessoa vale em todos os apps; não expira; o gerente revoga e gera outro | expirar não faz sentido no uso da ADAF |
| 22/10/2026 | O gerente tem acesso a tudo, inclusive às telas do app de campo | precisa acompanhar e substituir qualquer função |
| 22/10/2026 | Permissão **por app**: `campo`, `painel`, `administrativo`. Sem permissão por barreira nem por módulo do campo | o agente roda entre barreiras; os módulos do campo não precisam de restrição |
| 22/10/2026 | O dashboard continua público, sem login | já foi feito para isso (dados mascarados) |
| 22/10/2026 | Toda tentativa de acesso consulta a planilha no servidor; nada de permissão guardada só no aparelho | revogar ou mudar permissão vale na hora |
| 22/10/2026 | Senha esquecida: comando no menu da planilha gera senha provisória, com troca obrigatória e linha de auditoria | só quem edita a planilha consegue; não depende de outro gerente estar disponível |
| 22/10/2026 | Abas novas `Usuarios`, `Acessos`, `Sessoes`, `Auditoria` substituem `Fiscais`, `Permissoes`, `Administrativo`, `AdmSessoes` (que ficam congeladas) | uma pessoa numa linha só; hoje a mesma pessoa aparece em várias abas, ligada pela grafia do nome |
| 20/10/2026 | Código e token guardados só como hash; limite de tentativas por código e geral; sessão por aparelho, revogável sozinha | quem lê a planilha não consegue se passar por outro |
| 16/10/2026 | Toda ação identifica quem fez: registros ganham `usuarioId`; autor separado de quem editou por último | regra de negócio e LGPD (art. 37) |

## Rejeitado

| Data | Opção | Por quê |
|---|---|---|
| 16/10/2026 | Login com Google | o Google Cloud pediu cadastro de cobrança com CPF/CNPJ |
| 16/10/2026 | Usuário e senha para todo mundo | cadastro trabalhoso para o campo (continua só para o gerente) |
| 16/10/2026 | CPF guardado só como HMAC | recusado para o MVP; volta no projeto final (ver abaixo) |

## Para o projeto final (lembrar quando começar o porte para o Sistema_Adaf)

- Retirar os tokens antigos em texto da aba `Fiscais` depois de um prazo de transição.
- Proteger os CPFs: o da conta e os de terceiros em `Pessoas`, `Propriedades` e nos registros do PCE.

## Em aberto

- **TV da sala**: proposta é ser uma sessão do painel com `app = tv`, aberta pelo gerente e revogável sozinha, sem
  conta própria (uma TV não tem CPF).
- **Digitar do papel**: hoje vem bloqueado por padrão porque um número de TF maior faz a sequência da barreira pular.
  Sem módulos no campo, fica liberado para todos do campo. Confirmar.
- **Migração**: juntar numa conta só as variações de nome de uma mesma pessoa nas abas antigas (uma vez, na migração).
- **Último gerente**: o sistema não deixa desativar o último gerente ativo.
