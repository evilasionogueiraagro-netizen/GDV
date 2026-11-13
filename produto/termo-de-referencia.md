# TERMO DE REFERÊNCIA – SISTEMA e-GDV

Sistema de gestão da defesa vegetal da ADAF/AM: barreiras fitossanitárias, Termos de Fiscalização, PCE, escalas, relatórios e painel gerencial.

| Item | Descrição |
|---|---|
| Órgão | Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF/AM |
| Unidade responsável | Gerência de Defesa Vegetal – GDV |
| Produto | e-GDV (app de campo, painel gerencial, Portal do Administrativo, dashboard público e serviço de dados) |
| Versão do sistema descrita | 2026-11-09a |
| Versão deste Termo | 2.3, de 09/11/2026 |

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
- RF-04A. Aparelho da base usado por vários fiscais: cada login vê só os próprios registros e os dos turnos de que participa; os de outros ficam guardados e escondidos.

### 4.2. Turno na barreira e educação sanitária
- RF-05. Abertura de turno em posto fixo (BVA) ou volante, com número do Termo do turno, horário e localização (GPS) de início e fim.
- RF-06. Turno compartilhado: o colega entra no mesmo turno com o próprio login, por um código de 6 números ou, na BVA fixa com turno em andamento, com um toque (sem código); quem entrou por engano e não lançou nada sai do turno, pelo próprio fiscal ou por quem abriu o turno. Os TFs lavrados no turno ficam visíveis para todos os fiscais do turno.
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
- RF-20. PDF do TF em 2 vias, com QR code de verificação (desligado por decisão da gerência desde 09/11/2026; volta por configuração); cancelamento com motivo, mantendo o número.
- RF-21. Digitação de TFs antigos do papel. O TF de papel anterior ao 1º TF do aplicativo na barreira forma uma série própria, marcada "(papel)", sem conflitar com a numeração do aplicativo.
- RF-22. Página pública de verificação de autenticidade, sem dados pessoais.

### 4.4. Escalas de plantão e relatório da equipe
- RF-23. A coordenação monta a escala de cada BVA por período: fiscais, número da equipe e responsável. A escala passa de rascunho a publicada. A gerência também edita pelo painel.
- RF-24. O fiscal vê a própria escala na tela inicial. Na BVA fixa com escala publicada para o dia, só os fiscais escalados abrem ou entram em turno; a coordenação e a gerência não têm essa trava; BVA sem escala publicada fica livre.
- RF-25. Relatório da equipe (prestação de contas do convênio, etapa 1.10), com os números somados automaticamente de todos os turnos da equipe no período:
  - veículos abordados;
  - Termos de Fiscalização emitidos;
  - apreensões e quilos apreendidos;
  - rechaços;
  - medidas de educação sanitária.
- RF-26. O responsável pela equipe edita os textos, a correção de quilos e os termos de repasse; os demais integrantes consultam. O PDF traz a página de assinaturas de cada servidor.
- RF-26A. Termo de Repasse (na BVA - CEASA, Termo de Destruição, no Aterro Sanitário de Manaus) de produtos apreendidos, montado com os produtos das apreensões da equipe no período (nº do TF, produto, unidade e quantidade). O responsável pode editar os itens, o número, o local e data, o órgão que recebe e o enquadramento legal (no Termo de Destruição, já preenchido com a legislação da mosca-da-carambola). O PDF traz o total e as assinaturas da ADAF e do órgão que recebe. O número de termos de repasse do relatório vem preenchido (1 quando o termo tem itens).
- RF-27. O Portal do Administrativo acompanha as diárias (PCDP) de cada fiscal escalado.

### 4.5. PCE – Programa de Controle e Erradicação
- RF-28. Cadastro do produtor com uma ou várias propriedades (UF fixa AM), cada uma com os seus frutos (cultura, cultivar, área, espaçamento, idade, plantas, produção e destino), consultável sem internet com os dados baixados.
- RF-29. Visita ao produtor: o fiscal marca os frutos avaliados e, por fruto, as pragas do catálogo e o resultado, com coleta de amostra, fotos e assinaturas; as pragas de vigilância (Moko, Sigatoka, Fusariose etc.) vêm marcadas "Não tem" e entram no Termo como avaliadas. A visita gera um Termo de Fiscalização por programa, com numeração por unidade e ano, inclusive quando nada é detectado, e o PDF de cada um. No Termo, o resultado de cada praga sai em caixas Presença / Ausência / Suspeita, e o espaço de escrever fica para as observações do fiscal. Os levantamentos antigos continuam disponíveis para consulta e PDF.
- RF-29A. Termos de Fiscalização pela propriedade, sem nova visita: o fiscal marca os programas dos frutos da propriedade e confere data, hora, ações e local; sai um Termo por programa com os dados do cadastro e a mesma numeração, e só a descrição da ação muda.
- RF-29B. Novo termo a partir da aba Termos: busca do produtor ou da propriedade por texto, primeiro no aparelho e, com internet, na base central; sem internet, o sistema avisa que só o aparelho foi consultado.
- RF-29C. Relatório de atividades (levantamento) por período, município e programa, calculado dos Termos de Fiscalização, no modelo da prestação de contas do convênio: o mesmo documento para todos os programas, com hospedeiros, plantas inspecionadas, sintomas, coleta, educação sanitária e os números dos Termos emitidos; Termos e fichas do período podem ir anexos.
- RF-30. Termo de Colheita de Amostras, gerado na visita quando há coleta, com numeração por unidade e ano, e lançamento do resultado do laboratório no painel.
- RF-31. Fichas oficiais de cadastro (citros, banana, monilíase, mandioca, soja e propriedade), geradas do cadastro e da visita mais recente; cada uma sai com as seções, os campos e os textos do seu formulário de papel, e o sistema só pergunta o que for daquele modelo; não bloqueiam o Termo. Citros exige HLB, ácaro hindustânico e cancro cítrico.
- RF-32. Campo sem internet: baixa dos dados dos municípios da viagem, busca de produtor e visita sobre os dados baixados, com numeração provisória conferida ao sincronizar.
- RF-33. Via do produtor em PDF, enviada pelo celular.

### 4.6. Painel gerencial
- RF-34. Visão geral com alertas para decisão, mapa do Amazonas (com tela cheia) e barreiras em andamento atualizadas a cada 15 segundos.
- RF-35. Abas Barreiras, TF de Barreira, PCE, Escalas, Convênios, Relatórios, Usuários e Dashboard público, com filtros por período, fiscal, barreira e município.
- RF-36. Modo TV para a sala de situação (rotação de telas, 24 horas).
- RF-37. Cadastro de BVAs pela gerência; a BVA nova passa a ser barreira do TF. Cada BVA pode ter um ponto fixo (coordenadas): o turno da BVA fixa aparece nesse ponto no mapa, inclusive sem GPS, e o painel alerta o turno aberto a mais de 2 km da BVA.
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

8.2. O fiscal baixa os seus próprios TFs e os TFs dos turnos compartilhados de que participou; só quem lavrou altera ou cancela o TF, e cada leitura do TF de um colega fica registrada. Os dados de campo do PCE são apagados do aparelho ao fim da viagem.

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
| 1.3 | 02/11/2026 | 2026-11-02b | RF-26A: na BVA - CEASA o termo dos produtos apreendidos é de Destruição (Aterro Sanitário de Manaus) |
| 1.4 | 02/11/2026 | 2026-11-02c | RF-26A: enquadramento legal no Termo de Repasse/Destruição (na CEASA, o da mosca-da-carambola) |
| 1.5 | 03/11/2026 | 2026-11-03a | RF-06 e item 8.2: TFs do turno compartilhado visíveis para todos os fiscais do turno |
| 1.6 | 04/11/2026 | 2026-11-04a | RF-06: entrar com um toque no turno em andamento da BVA fixa, sem código |
| 1.7 | 04/11/2026 | 2026-11-04b | RF-21: série do papel para TFs anteriores ao aplicativo na barreira |
| 1.8 | 04/11/2026 | 2026-11-04c | RF-06: tirar do turno compartilhado o fiscal que entrou por engano |
| 1.9 | 04/11/2026 | 2026-11-04d | Turno em BVA fixa só para os fiscais da escala de plantão publicada do dia |
| 2.0 | 07/11/2026 | 2026-11-07a | RF-06: o fiscal que entrou no turno do colega continua nele mesmo se a resposta da entrada se perder |
| 2.1 | 09/11/2026 | 2026-11-07a | RF-04A: aparelho com vários logins mostra a cada um só os próprios registros e os dos turnos de que participa |
| 2.2 | 09/11/2026 | 2026-11-09a | RF-04A: o que o servidor manda a um login é sempre visível para ele, mesmo com o nome da conta alterado |
| 2.3 | 09/11/2026 | 2026-11-09a | RF-20: QR code e endereço de verificação desligados no TF de Barreira |
