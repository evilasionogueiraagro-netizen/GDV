# TERMO DE REFERÊNCIA – SISTEMA e-GDV

Sistema de gestão da defesa vegetal da ADAF/AM: barreiras fitossanitárias, Termos de Fiscalização, PCE, escalas, relatórios e painel gerencial.

| Item | Descrição |
|---|---|
| Órgão | Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF/AM |
| Unidade responsável | Gerência de Defesa Vegetal – GDV |
| Produto | e-GDV (app de campo, painel gerencial, Portal do Administrativo, dashboard público e serviço de dados) |
| Versão do sistema descrita | 2026-11-02b |
| Versão deste Termo | 1.2, de 02/11/2026 |

## 1. Objeto

1.1. Sistema de informação para registro, controle e acompanhamento das ações de defesa vegetal da ADAF/AM. O sistema é usado nas Barreiras de Vigilância Agropecuária (BVAs), nas ações volantes, no Programa de Controle e Erradicação de pragas (PCE) e na gestão da GDV.

1.2. O produto compreende:
- aplicativo de campo para os fiscais, instalável no celular e no computador, que funciona sem internet;
- painel gerencial para a gerência, com Modo TV para a sala de situação;
- Portal do Administrativo, para os lançamentos que não vêm do campo;
- dashboard público, com números agregados e sem dados pessoais;
- página pública de verificação de autenticidade do Termo de Fiscalização;
- serviço de dados (back-end), com rotinas automáticas, cópia de segurança e arquivamento anual.

## 2. Justificativa

2.1. A fiscalização do trânsito de vegetais e as ações do PCE eram registradas em papel e planilhas avulsas. Isso causava:
- retrabalho na digitação;
- numeração de termos sem controle;
- demora para consolidar os relatórios exigidos pelo convênio com o MAPA e pelo VIGIFITO;
- pouca visibilidade, para a gerência, do que acontece nas barreiras em tempo real.

2.2. O e-GDV registra a informação uma única vez, no local e no momento da ação, mesmo sem internet. Ele gera os documentos oficiais (Termo de Fiscalização, Auto de Infração, Termo de Colheita e outros) e consolida automaticamente os indicadores e os relatórios de prestação de contas.

2.3. O sistema atende às metas do Convênio SUASA nº 991272/2025 (MAPA/ADAF/AM) e às exigências de transparência e de proteção de dados pessoais (Lei nº 13.709/2018 – LGPD).

## 3. Descrição da solução

3.1. Visão geral

| Componente | Usuário | Função |
|---|---|---|
| App de campo | Fiscais e coordenação | Turno na barreira, veículos, educação sanitária, TF de Barreira, Auto de Infração, PCE, escalas e relatório da equipe |
| Painel gerencial | Gerência e consulta | Barreiras ao vivo, alertas, mapa, TFs, PCE, escalas, convênio, relatórios, usuários e Modo TV |
| Portal do Administrativo | Equipe administrativa | Desembolso e execução física do convênio, linhas dos relatórios, VIGIFITO, diárias das escalas |
| Dashboard público | Sociedade | Números agregados e mapa, sem dados pessoais, ligado pela gerência |
| Verificação de TF | Qualquer pessoa | Confere número, data, barreira e situação de um TF pelo QR code |
| Serviço de dados | Sistema | Um único ponto de entrada, banco em planilha (uma aba por tabela), arquivos no Drive, rotinas automáticas |

3.2. Princípios
- **Offline primeiro:** o registro de campo não depende de internet e é enviado sozinho quando a conexão volta.
- **Um registro, vários usos:** o mesmo dado alimenta o documento, o painel, o VIGIFITO, o Relatório GDV e o convênio.
- **Rastreabilidade:** toda gravação registra quem fez e quando; exclusão é lógica (nada é apagado).
- **Datas de negócio no horário de Manaus.**

## 4. Requisitos funcionais

### 4.1. Acesso e permissões
- RF-01. Entrada por matrícula e senha, com senha provisória e troca obrigatória no primeiro acesso.
- RF-02. Permissões por aplicativo (campo, painel, administração) e por módulo do campo: fiscalização de trânsito, TF de Barreira, PCE e digitar do papel. Há ainda a coordenação de barreiras e a gerência.
- RF-03. A gerência cria contas, gera senha provisória, encerra sessões e desativa contas pelo painel. Cada ação fica registrada com quem fez.
- RF-04. Bloqueio temporário após tentativas de senha erradas.

### 4.2. Turno na barreira e educação sanitária
- RF-05. Abertura de turno em posto fixo (BVA) ou volante, com número do Termo do turno, horário e localização (GPS) de início e fim.
- RF-06. Turno compartilhado: o colega entra no mesmo turno com o próprio login, por um código de 6 números.
- RF-07. Registro de cada veículo: placa (obrigatória onde a BVA exige), tipo, origem e destino, e quantas pessoas receberam educação sanitária.
- RF-08. Alerta de cuidado na placa (abordagem com risco), visto por outros fiscais em qualquer BVA e avisado à gerência.
- RF-09. Aviso de placa com TF anterior na mesma BVA, também sem internet.
- RF-10. Encerramento do turno, encerramento automático após 12 horas e encerramento pela gerência.
- RF-11. Termo de Fiscalização do turno e Ficha de Campo em PDF. O Termo traz os números dos TFs de Barreira lavrados no turno (inclusive pelos colegas) e as medidas tomadas.
- RF-12. Recuperação dos turnos do próprio login a partir da planilha, para uso em outro aparelho.
- RF-13. Volante só de educação sanitária (sem registro de veículos), com contador de pessoas orientadas.
- RF-14. Digitação de turnos antigos do papel, com o PDF escaneado anexado.

### 4.3. Termo de Fiscalização de Barreira (TF) e Auto de Infração
- RF-15. Lavratura do TF, isolado ou a partir do veículo do turno:
  - dados do fiscalizado e do veículo;
  - produtos e quantidades, origem e destino;
  - documentos apresentados;
  - procedimento (liberação, apreensão ou rechaço), fiel depositário e advertência;
  - fotos e assinaturas na tela.
- RF-16. Numeração por barreira e ano conferida na planilha. Sem internet, o número é provisório, com tratamento de conflito.
- RF-17. Consulta do cadastro do fiscalizado e da placa, e aviso de reincidência.
- RF-18. Constatação e enquadramento legal sugeridos pela BVA, pelo sentido da rota (entrada ou saída, pela origem e destino) e pelo produto, conforme a tabela de enquadramentos da GDV. O fiscal pode editar os textos.
- RF-19. Auto de Infração no próprio TF, com numeração própria por barreira e ano e PDF em 3 vias.
- RF-20. PDF do TF em 2 vias, com QR code de verificação; cancelamento com motivo, mantendo o número.
- RF-21. Digitação de TFs antigos do papel.
- RF-22. Página pública de verificação de autenticidade, sem dados pessoais.

### 4.4. Escalas de plantão e relatório da equipe
- RF-23. A coordenação monta a escala de cada BVA por período: fiscais, número da equipe e responsável. A escala passa de rascunho a publicada. A gerência também edita pelo painel.
- RF-24. O fiscal vê a própria escala na tela inicial.
- RF-25. Relatório da equipe (prestação de contas do convênio, etapa 1.10), com os números somados automaticamente de todos os turnos da equipe no período:
  - veículos abordados;
  - Termos de Fiscalização emitidos;
  - apreensões e quilos apreendidos;
  - rechaços;
  - medidas de educação sanitária.
- RF-26. O responsável pela equipe edita os textos, a correção de quilos e os termos de repasse; os demais integrantes consultam. O PDF traz a página de assinaturas de cada servidor.
- RF-26A. Termo de Repasse de produtos apreendidos, montado com os produtos das apreensões da equipe no período (nº do TF, produto, unidade e quantidade). O responsável pode editar os itens, o número, o local e data e o órgão que recebe. O PDF traz o total e as assinaturas da ADAF e do órgão que recebe. O número de termos de repasse do relatório vem preenchido (1 quando o termo tem itens).
- RF-27. O Portal do Administrativo acompanha as diárias (PCDP) de cada fiscal escalado.

### 4.5. PCE – Programa de Controle e Erradicação
- RF-28. Levantamento fitossanitário por praga e cultura, com resultado, coleta de amostra, fotos e PDF por praga.
- RF-29. Termo de Colheita de Amostras, com numeração por unidade e ano, e lançamento do resultado do laboratório.
- RF-30. Monilíase: Cadastro de imóvel, Termo de Fiscalização da visita e Relatório de atividades.
- RF-31. Citros: Cadastro de imóvel de produção comercial e Termo de Fiscalização de citros (HLB, cancro cítrico, ácaro hindustânico).
- RF-32. Campo sem internet: baixa dos dados dos municípios da viagem, mapa "Perto de mim" e rota de visitas.
- RF-33. Via do produtor em PDF, enviada pelo celular.

### 4.6. Painel gerencial
- RF-34. Visão geral com alertas para decisão, mapa do Amazonas (com tela cheia) e barreiras em andamento atualizadas a cada 15 segundos.
- RF-35. Abas Barreiras, TF de Barreira, PCE, Escalas, Convênios, Relatórios, Usuários e Dashboard público, com filtros por período, fiscal, barreira e município.
- RF-36. Modo TV para a sala de situação (rotação de telas, 24 horas).
- RF-37. Cadastro de BVAs pela gerência; a BVA nova passa a ser barreira do TF.
- RF-38. Exportação em CSV, com proteção contra fórmulas.

### 4.7. Relatórios e indicadores
- RF-39. Relatório GDV mensal e anual, VIGIFITO por posto (mensal, 10 dias, semestral e anual, também em planilha) e relatório do convênio. Saída em Word e PDF.
- RF-40. Um único motor de indicadores para todos os relatórios, com lançamentos manuais justificados e marcados.
- RF-41. Acompanhamento das metas físicas e financeiras do convênio, com projeção e alertas.

### 4.8. Portal do Administrativo
- RF-42. Lançamento e importação de planilhas:
  - desembolso do convênio;
  - execução física;
  - linhas dos relatórios;
  - VIGIFITO;
  - relatório de plantão.
- RF-43. Histórico de cada lançamento, com quem fez e quando.

### 4.9. Dashboard público
- RF-44. Números agregados por período, ligados pela gerência, com ocultação de números pequenos e coordenadas generalizadas.

### 4.10. Rotinas automáticas
- RF-45. Encerramento automático de turnos esquecidos, cópia de segurança diária (30 últimas), relatório mensal por e-mail e arquivamento anual.

## 5. Requisitos não funcionais

| Código | Requisito |
|---|---|
| RNF-01 | Funcionamento sem internet no app de campo (dados guardados no aparelho, envio automático, reenvio seguro) |
| RNF-02 | Compatibilidade com Android (Chrome), iPhone (Safari) e computador; instalável como aplicativo (PWA) |
| RNF-03 | Impressão e PDF dos documentos no celular e no computador, no modelo oficial da ADAF (cabeçalho, rodapé e vias) |
| RNF-04 | Segurança: senha só em hash com sal, sessão por aparelho, bloqueio por tentativas, permissão conferida no servidor a cada chamada |
| RNF-05 | Rastreabilidade: quem fez e quando em toda gravação; exclusão lógica; histórico de alterações |
| RNF-06 | LGPD: nada público expõe CPF, nome completo, placa inteira ou coordenada exata; registro de quem leu dados pessoais |
| RNF-07 | Disponibilidade: cópia de segurança diária e arquivamento anual sem perda de dados |
| RNF-08 | Usabilidade: interface em português, ícones padronizados, letras e botões legíveis no celular, sem emoji |
| RNF-09 | Portabilidade: acesso ao Google isolado numa camada própria, permitindo o porte para servidor próprio (PostgreSQL) sem mudar o app |
| RNF-10 | Qualidade: suíte de testes automáticos executada antes de cada publicação; publicação só com os testes aprovados |

## 6. Arquitetura e tecnologia

6.1. Front-end em HTML, CSS e JavaScript, sem etapa de compilação, publicado no GitHub Pages. Os dados ficam no aparelho (IndexedDB) e o service worker permite abrir o app sem internet.

6.2. Back-end em Google Apps Script, com um único ponto de entrada. O banco é uma planilha Google (uma aba por tabela) e os arquivos (fotos, assinaturas, PDFs) ficam no Google Drive.

6.3. Publicação contínua: cada alteração aprovada na branch principal publica o app e o serviço de dados automaticamente, depois da suíte de testes.

6.4. Porte previsto para Hono + PostgreSQL, mantendo o mesmo contrato de API e o mesmo app.

## 7. Perfis de usuário

| Perfil | Acesso |
|---|---|
| Fiscal | App de campo, nos módulos liberados (fiscalização de trânsito, TF, PCE, digitar do papel) |
| Responsável pela equipe | Fiscal escalado que edita o relatório da equipe do período |
| Coordenação de barreiras | Monta e publica as escalas e edita os relatórios das equipes |
| Gerência | Painel completo, contas e permissões, escalas, relatórios, BVAs, encerramento de turnos e dashboard público |
| Consulta (TV) | Painel só leitura, Modo TV |
| Administrativo | Portal do Administrativo |
| Público | Dashboard público e verificação de TF |

## 8. Dados e proteção de dados pessoais

8.1. Dados pessoais (CPF/CNPJ, nome, endereço, telefone do fiscalizado e do produtor) são usados só nos documentos oficiais e na consulta de reincidência. No painel aparecem mascarados.

8.2. O fiscal baixa apenas os seus próprios TFs. Os dados de campo do PCE são apagados do aparelho ao fim da viagem.

8.3. Publicações externas (dashboard, verificação de TF, relatório mensal) não levam dados pessoais.

## 9. Implantação, treinamento e documentação

9.1. A implantação é feita uma única vez (planilha, serviço de dados, primeiro gerente e rotinas automáticas). As contas são criadas pela gerência no painel.

9.2. Manuais integrados: Manual do fiscal (no app), manual do gerente (painel) e manual do Portal do Administrativo. A documentação técnica fica no repositório do sistema.

9.3. O treinamento é feito pela GDV, com o manual do fiscal e o modo de teste sem internet.

## 10. Manutenção e evolução

10.1. Melhorias são feitas a pedido da GDV, cada uma com teste automático, revisão e publicação automática.

10.2. Critério de aceite de cada versão: suíte de testes aprovada, documentação atualizada e versão do serviço de dados registrada.

10.3. Este Termo é atualizado a cada melhoria que muda o que o sistema faz. O histórico fica na seção 11. A cada atualização publicada, o Word é gerado e guardado automaticamente na pasta "GDV - Documentos do sistema" do Drive da planilha do sistema; as versões anteriores ficam numa subpasta.

## 11. Histórico de versões deste Termo

| Versão | Data | Versão do sistema | Alterações |
|---|---|---|---|
| 1.0 | 02/11/2026 | 2026-11-01a | Primeira versão: objeto, justificativa, solução, requisitos funcionais e não funcionais, arquitetura, perfis, LGPD, implantação e manutenção |
| 1.1 | 02/11/2026 | 2026-11-02a | RF-26A: Termo de Repasse de produtos apreendidos no relatório da equipe; termos de repasse preenchidos automaticamente |
| 1.2 | 02/11/2026 | 2026-11-02b | Word do Termo gerado e guardado automaticamente no Drive a cada atualização (item 10.3) |
