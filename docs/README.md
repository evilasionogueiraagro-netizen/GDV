# Documentação do e-GDV (índice)

Cada assunto tem um arquivo. Ache a linha do que você quer saber ou mexer e leia só aquele arquivo.
Visão geral do sistema: [README.md](../README.md) da raiz. Regras do projeto para agentes e devs: [AGENTS.md](../AGENTS.md).

## Quero saber/mexer em... → leia

| Quero saber/mexer em... | Leia |
|---|---|
| App de campo: turno, registro de veículos, offline, sincronização, envio em segundo plano, Ficha de Campo | [apps/campo.md](apps/campo.md) |
| Painel do gestor: filtros, abas, mapa, aba Servidores, proteção do acesso, Modo TV, painel no celular | [apps/painel.md](apps/painel.md) |
| Portal do Administrativo: abas de lançamento, histórico, login Google ou código, Client ID | [apps/administrativo.md](apps/administrativo.md) |
| Dashboard público: o que mostra, como ligar, `publicoDados`, cache, LGPD | [apps/dashboard.md](apps/dashboard.md) |
| Montar do zero (planilha, Apps Script, Pages), ativar ou revogar fiscal, módulos por servidor (`Permissoes`) | [modulos/acessos.md](modulos/acessos.md) |
| TF de Barreira: numeração, reincidência, fotos e assinatura, UF, QR code, `verificar.html` | [modulos/tf.md](modulos/tf.md) |
| Barreiras em andamento: alerta de TF em preenchimento, encerrar turno pela gerência, sinal do aparelho | [modulos/barreiras-ao-vivo.md](modulos/barreiras-ao-vivo.md) |
| PCE: levantamento por praga, Termo de Colheita, citros, resultado de laboratório | [modulos/pce.md](modulos/pce.md) |
| PCE em campo: dados do município sem internet, Perto de mim, rota, enviar ao produtor | [modulos/pce-campo.md](modulos/pce-campo.md) |
| Monilíase: cadastro de imóvel, Termo de Fiscalização do PCE, relatório de atividades | [modulos/pce-moniliase.md](modulos/pce-moniliase.md) |
| Registro antigo (digitar do papel) | [modulos/pce-papel.md](modulos/pce-papel.md) |
| Convênio MAPA/ADAF: metas, financeiro, planilha de movimentação, relatório mensal | [modulos/convenio.md](modulos/convenio.md) |
| Relatório GDV (mensal e anual), central de relatórios, motor de indicadores | [modulos/relatorios.md](modulos/relatorios.md) |
| VIGIFITO por posto: indicadores, postos, período de 10 dias, lançamentos | [modulos/vigifito.md](modulos/vigifito.md) |
| Rotinas automáticas (encerramento de 12 h, backup, relatório por e-mail) e arquivamento anual | [modulos/rotinas.md](modulos/rotinas.md) |
| LGPD e dados pessoais | regras em [AGENTS.md](../AGENTS.md); o trecho LGPD de cada área: [tf](modulos/tf.md), [pce-campo](modulos/pce-campo.md), [convenio](modulos/convenio.md), [relatorios](modulos/relatorios.md), [administrativo](apps/administrativo.md), [dashboard](apps/dashboard.md) |
| Actions da API: autenticação, parâmetros e respostas | [API.md](API.md) |
| Publicação automática do back (clasp) e o que fazer quando o workflow falha | [PUBLICACAO-BACK.md](PUBLICACAO-BACK.md) |
| Camada de acesso ao Google e porte do back para servidor próprio | [PORTABILIDADE.md](PORTABILIDADE.md) |
| Passar planilha e script para a conta institucional | [MIGRACAO.md](MIGRACAO.md) |
| Ideias combinadas com a gerência e ainda não feitas | [IDEIAS.md](IDEIAS.md) |
| Testes automáticos: rodar, escrever um teste novo | [tests/README.md](../tests/README.md) |
| Branches, commits e PRs | [FLUXO-GIT.md](FLUXO-GIT.md) |
| Design system, ícones, sem emojis | [DESIGN.md](DESIGN.md) |

Funcionalidade nova ou mudada: atualize o arquivo da área (nunca o `README.md` da raiz). Arquivo com mais de ~300 linhas se divide.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `web/` | App (HTML/JS/CSS puro, sem build). `js/config.js` guarda unidade, tipos de veículo, turnos e pessoas estimadas; `js/anexos.js` = fotos e assinatura na tela (PCE e TF); `verificar.html` + `js/verificar.js` = página pública de autenticidade do TF |
| `web/vendor/` | Bibliotecas do app de campo, sem CDN: `qrcode.js` (qrcode-generator 1.4.4, MIT) para o QR code do TF; `html2canvas.min.js` (html2canvas 1.4.1, MIT) para o PDF gerado no aparelho (envio ao produtor) |
| `web/documentos/` | Modelos HTML do Termo e da Ficha (impressos via “Salvar como PDF”); `conv-docs.js` + `conv-relatorio.html` = apuração e relatório do convênio (aba Convênios do painel); `relgdv-docs.js` + `relgdv-relatorio.html` = Relatório GDV mensal/anual e relatório PCE (central de relatórios); `indicadores.js` = motor de indicadores (catálogo e regra e-GDV × lançado × substituído); `vigifito-docs.js` = relatório VIGIFITO (cálculo, Word/PDF e .xlsx) |
| `apps-script/` | API de sincronização que grava na planilha e entrega os dados do painel gerencial |
| `web/administrativo/` | Portal do Administrativo (`index.html`, `js/adm.js` = login/sessão/abas, `js/adm-convenio.js`, `js/adm-relatorios.js`, `js/adm-vigifito.js`, `js/vig-planilha.js` = leitura da planilha de controle VIGIFITO, `css/adm.css`; usa `../painel/css/painel.css`, `../painel/js/conv-planilha.js` e `../painel/vendor/xlsx/`) |
| `web/painel/` | App "e-GDV Painel" do administrador (`index.html`, `js/painel*.js`, `js/docx.js` = gerador do Word dos relatórios, `js/conv-planilha.js` = leitura da planilha de movimentação do convênio (usada pelo portal), `vendor/xlsx/` = SheetJS (carregada só no clique), `css/painel.css`, `vendor/`, `dados/`, `manifest.webmanifest`, `sw.js`) |
| `web/inicio/` | Página inicial com os atalhos (`index.html` só; usa `../painel/css/painel.css` e `../img/`) |
| `web/dashboard/` | Dashboard público sem login (`index.html`, `js/dashboard.js`, `css/dashboard.css`; usa `../painel/vendor`, `../painel/css` e `../painel/dados`) |
| `tests/` | Testes automáticos (`fakegas.js` roda o `Code.gs` real com Google falso; testes Playwright do app e do painel; `run.js`) |

## Testes automáticos

A pasta `tests/` tem a suíte de testes de ponta a ponta: o `tests/fakegas.js` executa o `apps-script/Code.gs` **real** em Node, com planilha, Drive, gatilhos, e-mail, cache e propriedades falsos em memória, e serve a pasta `web/`; os testes abrem o app do fiscal, o painel e o modo TV no Chromium (Playwright) e conferem planilha, telas e PDFs. Cada teste roda com um servidor novo. O workflow `.github/workflows/testes.yml` roda tudo a cada push/PR para `main` e `claude/**`; se algo falhar, os logs e screenshots ficam no artifact `saida-testes-*` da execução. Para rodar localmente: `cd tests && npm ci && npx playwright-core install chromium && node run.js` (ou `node run.js tv_test` para um teste só). Detalhes em [`tests/README.md`](../tests/README.md).

Para testar localmente: `cd web && python3 -m http.server 8080`.
