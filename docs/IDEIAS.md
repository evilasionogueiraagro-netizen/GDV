# Ideias guardadas (para depois)

Decisões já tomadas sobre estes temas: [decisoes/anteriores.md](decisoes/anteriores.md).

Ideias combinadas com a gerência, ainda não feitas.

---

## 1. Página da BVA no PC + QR code (check-in, turno e impressão do TF)

*Em espera, por decisão do gestor. Discutida em 12/10/2026, com a planilha de TF do Aeroporto (`TERMOS BVA.xlsm`).*
Decisões: [TF e página da BVA](decisoes/anteriores.md#tf-e-página-da-bva)

Falta, nesta ordem:
1. Antes da página:
   - Gerência no TF (GDV, GDA, GIPOA), cada uma com a sua lista de produtos. GDV: 34 vegetais. GDA: aves, bovinos, equinos, peixes vivos, pescado, ovinos. GIPOA: couro bovino, ovos, produtos cárneos, sebo bovino, mel de abelha.
   - Constatação e enquadramento sugeridos por produto × procedimento (liberação, apreensão, rechaço), abas V, A e I da planilha.
   - Dados do fiel depositário no TF e no PDF: nome, RG, CPF, endereço, telefone.
   - Importar cadastros de transportadores (placa, nome, CPF, endereço, município, UF, telefone) da planilha maior do gestor.
   - Numeração central do e-GDV, com auditoria de lacunas e duplicidades (a planilha só soma 1 no próprio arquivo).
2. Página da BVA: QR dinâmico, check-in (quem, onde, hora, GPS), início do turno e pareamento. Lista dos TFs da BVA, com impressão de 2 vias ou PDF.
   - Check-out opcional pelo QR.
3. Salvar cada PDF automaticamente na pasta TERMOS_EMITIDOS do PC.

Com o login por matrícula e senha (22/10/2026), o QR deixa de identificar a pessoa e passa a provar só a **presença**:
- **Identidade:** quem é a pessoa vem do login do celular. O QR prova que ela está na BVA, junto com o GPS. O check-in grava o `usuarioId`, e não um nome digitado.
- **PC da BVA:** cada BVA tem um usuário próprio, como a TV, com uma permissão nova da página da barreira. Ele só mostra o QR e os TFs daquela BVA, e o gerente revoga quando quiser.
- **QR:** é assinado pelo servidor e muda a cada ~30 s. Sem internet no celular, o app guarda a leitura com hora e GPS e o servidor valida no envio, pela janela de validade do QR.
- **Fiscais do turno:** cada fiscal lê o QR com o próprio login e entra em `FiscaisDosTurnos`, o que acaba com o "Fiscal 2" digitado.
- **Aba nova prevista:** `CheckinsNasBarreiras` (usuarioId, barreiraId, turnoId, em, lat, lon).

---

## 2. PCE em campo: propriedade cadastrada e vários levantamentos por visita

*Em andamento. Levantamento no campo, mapa, rota e cadastro de imóvel já feitos.*
Feito: veja [modulos/pce.md](modulos/pce.md).
Decisões: [PCE em campo](decisoes/anteriores.md#pce-em-campo)

Falta:
- Cadastros dos programas banana, mandioca, soja e propriedade geral (a aba `CadastrosPCE` já tem `programa` e `dados` em JSON).
- Fotos no termo e no cadastro (a coluna `fotos` existe, sem tela).
- Relatório no app com os termos de outros servidores (hoje usa os do aparelho; o painel usa todos).
- Via do produtor por link ou QR do documento (o PDF já sai por "Enviar ao produtor").

---

## 3. Convênios: armadilhas, controle e convênios novos

*Feito em 14/10/2026 (metas, execução financeira e relatório mensal no painel). Armadilhas e ações de controle: em espera, por decisão do gestor ("não agora").*
Feito: veja [modulos/convenio.md](modulos/convenio.md).
Decisões: [Convênio MAPA/ADAF](decisoes/anteriores.md#convênio-mapaadaf)

Falta:
- Registro de armadilhas (mosca-da-carambola, etapa 1.3) e de ações de controle (supressão de monilíase, etapa 1.5) no app de campo. Hoje entram por lançamento manual no painel. Quando existirem, a apuração pode ser automática, como a 1.4.
- Criar convênio novo: hoje é copiar a linha da aba `Convenios` e ajustar o JSON.

---

## 4. Relatório GDV: próximos passos

*Feito em 14/10/2026 (mensal e anual) e em 16/10/2026 (carga na barreira). Em espera, por decisão do gestor ("não fazer agora"): por ora, entram como linha manual.*
Feito: veja [modulos/relatorios.md](modulos/relatorios.md) e, para a carga na barreira, [modulos/vigifito.md](modulos/vigifito.md).
Decisões: [Relatório GDV](decisoes/anteriores.md#relatório-gdv)

Falta:
- Medida aplicada com quantidade (medida fitossanitária, área controlada, poda drástica, destruição), por visita. Hoje: linhas "Medida fitossanitária" e "Área controlada" e coluna "Poda drástica", no painel.
- Vazio sanitário da soja. Hoje: coluna "Fiscalizações do vazio sanitário" por município.
- Educação sanitária no app (ações, público atingido). Hoje: tabela da Seção V no painel. A linha de veículos orientados já é automática.
- Importação de CFO/CFOC, PTV e UP/UC (CSV dos sistemas de certificação). Hoje: tabelas das Seções III e IV no painel.
- Armadilhas (mosca-da-carambola e Diaphorina citri). Hoje: coluna "Monitoramento de armadilhas" e linha "Armadilhas para Diaphorina citri" (Seção VI).
- Madeira (m³) na carga, hoje manual (ver item 6).
- Avisos de consistência: coordenadas fora do município informado (exige a malha no servidor); importação dos relatórios dos meses anteriores ao e-GDV.

---

## 5. BVAs e portos a confirmar

*Aguardando o gestor confirmar os nomes antes de cadastrar em `CONFIG.bvas`.*
Decisões: [Relatório GDV](decisoes/anteriores.md#relatório-gdv)

Falta:
- Confirmar e cadastrar: Humaitá, Guajará, Parintins, Porto de Tabatinga, Porto de Benjamin Constant, AM-070 (volante) e os portos volantes.
- Enquanto isso, a correspondência posto do VIGIFITO → BVA fica em "Postos do VIGIFITO" (painel → Relatórios). Turnos sem posto aparecem como "não mapeados" (a BVA - CEASA tem posto próprio desde 28/10/2026).

---

## 6. Relatórios, VIGIFITO e Portal do Administrativo: pendências

*Feito em 16/10/2026: central de relatórios, motor de indicadores e Portal do Administrativo com login Google.*
Feito: veja [modulos/relatorios.md](modulos/relatorios.md) e [apps/administrativo.md](apps/administrativo.md).
Decisões: [VIGIFITO e Portal do Administrativo](decisoes/anteriores.md#vigifito-e-portal-do-administrativo)

Falta:
- Carga: madeira em m³ no próprio registro (hoje manual); "auto de destruição" como campo do TF (hoje, TF de apreensão: "apreensão p/ destruição" no e-GDV); conversão de caixas e sacos para t por produto (tabela de pesos médios), hoje listados à parte.
- Planilha VIGIFITO antiga (secundária): só o histórico de 2025, antes do e-GDV.
- Histórico do Jundiá por período de 10 dias: a importação já lê a aba "JUNDIÁ" da planilha de controle. Falta o modelo do gestor com o histórico completo dos anos anteriores.
- Metas SUASA: aguardando o plano de metas SUASA. Quando chegar, configurar no motor de metas do convênio (etapas, apuração pelos indicadores ou lançamento no portal, esperado pelo tempo, físico × financeiro).
- Client ID do Google: criar no Google Cloud Console e colar em `CONFIG.adm.googleClientId` e na propriedade `GOOGLE_CLIENT_ID` (passo a passo em [apps/administrativo.md](apps/administrativo.md)). Até lá, o portal entra por código de ativação.

## 7. Assinatura na tela (desligada temporariamente)

- **Situação:** desde 28/10/2026 a assinatura com o dedo na tela (TF de Barreira e PCE) está desligada por decisão da gerência; os documentos saem com as linhas em branco para assinar no papel. No TF fica só a marcação "Fiscalizado se recusou a assinar".
- **Para retomar:** `assinaturaNaTela: true` em `web/js/config.js`. O código e os testes continuam (os testes ligam a chave para conferir).
