# Ideias guardadas (para depois)

Ideias discutidas com a gerência que ainda **não** foram implementadas. Cada uma traz o que já foi decidido, para retomar sem refazer a conversa.

---

## 1. Página da BVA no PC + QR code (check-in, turno e impressão do TF)

*Discutida em 12/10/2026, a partir da planilha de TF do Aeroporto (`TERMOS BVA.xlsm`, gerências GDV/GDA/GIPOA). Situação: **em espera**, por decisão do gestor.*

### A ideia
- Cada BVA tem um **PC com uma página web do e-GDV** aberta, ativada uma vez com um código, como a TV da sala. A página mostra:
  - um **QR code da barreira**;
  - a **lista dos TFs lavrados ali**.
- O fiscal chega e **escaneia o QR pelo app**. Isso serve ao mesmo tempo para:
  - **check-in**: quem, onde, a que horas e com GPS;
  - **início do turno**: BVA e unidade preenchidas sozinhas;
  - **pareamento** do celular com a BVA.
- O fiscal **lavra o TF no celular**, como hoje, inclusive sem internet. O TF aparece na lista do PC da BVA, onde ele **imprime as 2 vias** ou **baixa o PDF**.
- **Check-out** opcional: encerrar o turno escaneando o QR de novo.

### Decisões já tomadas
- **Numeração:** um número só, a sequência da BVA. Muda apenas o sufixo conforme a gerência: "Nº 4/2026 - GDV", "Nº 5/2026 - GDA"…
- **Quem lavra TF de GDA e GIPOA:** os mesmos fiscais das barreiras.
- **PCs das BVAs:** têm internet, usam Chrome e têm impressora.
- **Cadastros:** o gestor tem outra planilha, com muito mais dados, para alimentar o banco do e-GDV (pessoas e placas). Importar quando for retomar.

### Sugestões técnicas (já avaliadas)
- **QR que muda a cada ~30 s**, e não a cada 12 h, para evitar check-in por foto enviada no WhatsApp. O app também confere o **GPS**: só aceita perto da BVA. O **pareamento** é que dura o turno (até 12 h, ou até encerrar).
- **Salvar na pasta "TERMOS_EMITIDOS"** do PC: no Chrome, o operador escolhe a pasta uma vez e a página salva cada PDF com o mesmo nome da planilha ("T.F. Nº 4 CARAMBOLA_ACEROLA GDA.pdf"). O TF continua guardado na planilha e as fotos no Drive.
- **Sem internet no PC:** o fiscal lavra no celular normalmente e o TF aparece no PC quando a conexão voltar.

### O que trazer da planilha do Aeroporto para o TF do app (fazer antes da página da BVA)
1. **Gerência no TF** (GDV / GDA / GIPOA), cada uma com sua lista de produtos:
   - GDV: 34 vegetais;
   - GDA: 6 (aves, bovinos, equinos, peixes vivos, pescado, ovinos);
   - GIPOA: 5 (couro bovino, ovos, produtos cárneos, sebo bovino, mel de abelha).
2. **Constatação e enquadramento legal sugeridos por produto × procedimento** (liberação / apreensão / rechaço). As tabelas estão nas abas V, A e I da planilha.
3. **Dados do fiel depositário** no TF e no PDF: nome, RG, CPF, endereço, telefone ("Sob a guarda e responsabilidade do(a) Sr.(a)…").
4. **Importar os cadastros de transportadores** (placa, nome, CPF, endereço, município, UF, telefone) da planilha maior que o gestor vai enviar.
5. Manter a **numeração central** do e-GDV, com auditoria de lacunas e duplicidades. A planilha só soma 1 no próprio arquivo.

### Ordem proposta
1. Gerências, textos por produto, fiel depositário e importação dos cadastros.
2. Página da BVA: QR dinâmico, check-in e abertura do turno, lista de TFs com imprimir/baixar.
3. Salvar automaticamente na pasta do PC e check-out pelo QR.

---

## 2. PCE em campo: propriedade cadastrada + vários levantamentos por visita, sem papel repetido

*Contexto passado pelo gestor em 12/10/2026. Situação: **aguardando** a ficha de levantamento impressa e o cadastro de propriedade usados hoje (o gestor vai mostrar).*

- **Na visita**, o fiscal vai a uma **propriedade já cadastrada** e só faz o levantamento, ou **cadastra uma nova** e faz o levantamento.
- **Na mesma viagem**, levanta **várias pragas/doenças da lista**. As principais hoje:
  - mosca-da-carambola;
  - monilíase;
  - vassoura-de-bruxa da mandioca;
  - todas as doenças dos **citros**.
- **Problema hoje:**
  - preenchem **à mão uma folha por praga**, repetindo os mesmos dados (produtor, propriedade…);
  - tudo em **duas vias**, porque uma fica com o produtor;
  - não há **impressora em campo**.
- **A pensar quando chegarem os modelos:**
  - escolher a propriedade cadastrada sem redigitar nada;
  - registrar várias pragas numa só visita (o módulo já tem um cartão por praga);
  - a **via do produtor sem impressora**: PDF por WhatsApp ou e-mail, link ou QR do documento, impressão depois no escritório.

### 2b. Cadastro de imóvel (monilíase), Termo de Fiscalização do PCE e Relatório de atividades
*Modelos enviados pelo gestor (cadastros .docx e o relatório real de Autazes, jul/2026). **Implementado** em 13/10/2026 ([modulos/pce-moniliase.md](modulos/pce-moniliase.md)): cadastro 1x por propriedade, termo por visita ligado ao cadastro, digitação do papel, numeração própria e relatório de prestação de contas (app e painel).*
- **Ainda a fazer:** cadastros dos outros programas (banana, citros, mandioca, soja, propriedade geral) — a aba `CadastrosPCE` já tem `programa` e `dados` (JSON) para isso; fotos no termo/cadastro (a coluna `fotos` existe, sem tela); relatório no app com os termos de outros servidores (hoje usa os do aparelho; o painel usa todos).

### 2a. Dados do município no celular (sem internet) + mapa e rota das propriedades
*Ideia do gestor (12/10/2026). **Implementado** em 12/10/2026 ([modulos/pce-campo.md](modulos/pce-campo.md)): dados do município no aparelho, busca por CPF/nome/código sem internet, mapa "Perto de mim", rota no Google Maps e "📤 Enviar ao produtor" (PDF gerado no aparelho). Os campos novos da ficha e do cadastro de propriedade, quando chegarem, já vêm no download (todas as colunas da planilha).*
- **"Baixar dados para o campo"**: antes de sair, com internet, o servidor escolhe o(s) **município(s)** e o app baixa os **produtores e propriedades** cadastrados neles: nome, CPF, código, coordenadas, situação fundiária e último levantamento.
  - Sem internet, a pesquisa por CPF, nome ou código funciona e completa a ficha.
  - O app mostra a data dos dados e atualiza sozinho quando houver internet.
  - Só para quem tem o módulo PCE (LGPD). Opção de apagar os dados do celular ao voltar.
- **Mapa "propriedades perto de mim"**: GPS do servidor e propriedades baixadas, coloridas pelo último levantamento ou pendência. Lista por distância e botão "Fazer levantamento aqui", que abre a ficha preenchida.
  - Sem internet: contornos dos municípios e os pontos, sem o fundo de ruas.
- **Rota**: o servidor marca as propriedades, o app sugere a ordem pela menor distância e abre o trajeto no **Google Maps** com as paradas. O Google Maps funciona sem internet se o mapa da região tiver sido baixado nele antes; colocar isso no manual.

## 3. Convênios no painel (metas físicas, execução financeira e relatório mensal)
*Pedido do gestor (13/10/2026) para o Convênio SUASA nº 991272/2025 – MAPA/ADAF. **Implementado** em 14/10/2026 ([modulos/convenio.md](modulos/convenio.md)): aba Convênios do painel com as metas por etapa (apuração automática das etapas 1.4, 1.9 e 1.10 a partir do e-GDV; lançamento manual das demais e ajustes com justificativa), esperado pelo tempo e alertas, execução financeira (plano de aplicação × executado) e relatório circunstancial mensal em Word (.docx) e PDF.*
- **Decisões do gestor:** 1.4 conta municípios levantados e, em cada um, as propriedades; meta da 1.10 = 18.000 veículos (as 1.800 do plano são diárias); relatórios mensais; financeiro incluído.
- **Ainda a fazer (por decisão do gestor, "não agora"):** registros de **armadilhas** (monitoramento de mosca-da-carambola, etapa 1.3) e de **ações de controle** (supressão de monilíase, etapa 1.5) no app de campo — hoje essas etapas entram por lançamento manual no painel. Quando existirem, a apuração delas pode passar a automática como a 1.4.
- Outros convênios: a aba `Convenios` já guarda um JSON por convênio (o seletor existe), mas criar um convênio novo ainda é à mão (copiar a linha e ajustar).

## 4. Relatório GDV (mensal e anual): próximos passos
*Pedido do gestor (14/10/2026). **Implementado** em 14/10/2026 ([modulos/relatorios.md](modulos/relatorios.md)): aba Relatórios do painel com o relatório técnico parcial (mensal) e consolidado (anual) em Word e PDF; tipo de local e origem da visita no levantamento; resultado de laboratório no Termo de Colheita. O que ficou para depois, por decisão do gestor ("não fazer agora"), entra por enquanto como **linha manual** do relatório:*
- **Medida aplicada com quantidade** (medida fitossanitária, área controlada, poda drástica, destruição) registrada no app, por visita — hoje: linhas "Medida fitossanitária", "Área controlada" e a coluna "Poda drástica" por município, lançadas no painel.
- **Vazio sanitário da soja** (fiscalização com resultado) — hoje: coluna "Fiscalizações do vazio sanitário" por município (soma no quadro PCE).
- **Registro de educação sanitária** (ações, público atingido) no app — hoje: tabela da Seção V lançada no painel; a linha "barreiras: medidas de educação sanitária (veículos orientados)" já é automática.
- **Importação de CFO/CFOC, PTV e UP/UC** (CSV dos sistemas de certificação) — hoje: tabelas das Seções III e IV lançadas no painel (o quadro PCE soma os documentos).
- ~~**Carga na barreira**~~ — **implementado** em 16/10/2026: carga registrada no veículo (app de campo) → partidas, inspeção, cargas para outros estados, internalização/importação/exportação (t) e medida fitossanitária apurados pelo e-GDV. Madeira (m³) segue manual.
- **Armadilhas** (mosca-da-carambola e Diaphorina citri) — hoje: coluna "Monitoramento de armadilhas" por município e linha "Armadilhas para Diaphorina citri" (Seção VI).
- **BVAs/portos a confirmar** (o gestor precisa confirmar os nomes antes de cadastrar em `CONFIG.bvas`): Humaitá, Guajará, Porto de Tabatinga, Porto de Benjamin Constant, AM-070 (volante). Até lá, turnos nesses locais entram como volantes ou na BVA mais próxima, conforme o fiscal registrar.
- Avisos de consistência que podem vir depois: coordenadas fora do município informado (exige a malha no servidor) e importação dos relatórios dos meses anteriores ao e-GDV.

---

## 5. Relatórios separados, Portal do Administrativo e VIGIFITO: pendências

*Implementado em 16/10/2026 (central de relatórios PCE / VIGIFITO / Convênio / Metas SUASA / Consolidado, motor de indicadores, Portal do Administrativo com login Google). Ficou para depois:*

- **Carga no registro do veículo:** feita e depois simplificada (10/2026, pedido do gestor): o veículo guarda só UF de origem/destino (opcional); educação sanitária = pessoas a bordo; medida fitossanitária, partidas, inspeção, documentos, internalização e exportação saem dos TFs (com UF de origem/destino). Próximos passos possíveis: madeira em m³ no próprio registro (hoje manual); "auto de destruição" como campo próprio do TF (hoje = TFs de apreensão, que no e-GDV já é "apreensão p/ destruição"); conversão de caixas/sacos para t por produto (tabela de pesos médios), hoje listados à parte.
- **Importação da planilha VIGIFITO antiga:** passou a ser secundária — serve para o histórico de 2025 (meses anteriores ao e-GDV), gravando as linhas automáticas como substituição com justificativa automática. A partir do uso da carga no app, os números saem do sistema.
- **Histórico do Jundiá por período de 10 dias:** a importação já lê a aba de períodos (como "JUNDIÁ") da planilha de controle; falta o modelo do gestor com o histórico completo dos anos anteriores para importar.
- **Metas SUASA:** a central mostra "aguardando o plano de metas SUASA". Quando o documento chegar, configurar as metas reaproveitando o motor de metas do convênio (etapas, metas, apuração automática pelos mesmos indicadores do PCE/VIGIFITO ou lançamento no portal, esperado pelo tempo, físico × financeiro).
- **BVAs/portos novos a confirmar** com o gestor (Parintins, Humaitá e os portos volantes): não foram cadastrados em `CONFIG.bvas`. A correspondência posto do VIGIFITO → BVA/município do e-GDV fica em "Postos do VIGIFITO" (painel → Relatórios); turnos sem posto (ex.: BVA - CEASA) aparecem como "não mapeados".
- **Client ID do Google:** criar no Google Cloud Console e colar em `CONFIG.adm.googleClientId` e na propriedade `GOOGLE_CLIENT_ID` (passo a passo em [apps/administrativo.md](apps/administrativo.md)); até lá o portal entra por código de ativação.
