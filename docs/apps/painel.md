# Painel gerencial do administrador

App do gestor (`web/painel/`), separado do app de campo. Acesso: [acessos](../modulos/acessos.md); manual do gerente: `web/painel/manual.html`. Veja: [barreiras](../modulos/barreiras-ao-vivo.md), [relatórios](../modulos/relatorios.md), [convênio](../modulos/convenio.md).

## Regras
- Abas: Visão geral (alertas, mapa do Amazonas, barreiras em andamento), Barreiras, TF de Barreira, PCE, Convênios, Relatórios, Usuários, Dashboard público.
- Filtros: período (máx. 366 dias), fiscal (nome exato), barreira ou município; horário de Manaus.
- Atualiza sozinho: barreiras ao vivo a cada 15 s; demais dados a cada 1 min (até 7 dias) ou 10 min.
- Alertas para decisão: novo foco de praga no município; barreira aberta há mais de 12 h (conta 12 h) ou sem sinal há mais de 30 min; conflito, lacuna ou número editado na numeração de TF e Termo de Colheita; município sem levantamento PCE no ano; reincidentes.
- Relatórios e Convênios ignoram o período e não aparecem no Modo TV; lançamentos ficam no [Portal do Administrativo](administrativo.md).
- CSV: texto que começa com `=`, `+`, `-` ou `@` recebe apóstrofo.
- BVA com nomes diferentes: unificada só na leitura (`BVA_APELIDOS_`, `Code.gs`).
- LGPD: CPF/CNPJ mascarados; sem telefone, e-mail, endereço, RG ou fotos.

## Modo TV
- Tela cheia, TV de 50" 24 h. Telas: Ao vivo, Alertas, Barreiras 7 dias, TF 30 dias, PCE 30 dias.
- Usuário próprio da TV, só com a permissão "Painel gerencial: só consulta"; fica conectada até sair ou a conta ser desativada.
- Abrir: `chrome --kiosk "https://evilasionogueiraagro-netizen.github.io/GDV/painel/?tv=1"` (ou F11). Parâmetros: `rotacao`, `rotacaoAoVivo`, `tema`, `telas`.
- Sem internet, mantém os últimos dados (aviso após 3 min).

## Celular
- Instalável (Adicionar à Tela de Início); entra com matrícula e senha.

## Publicação
- Automática pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)); outro endereço do painel: `PAINEL_URL`.
