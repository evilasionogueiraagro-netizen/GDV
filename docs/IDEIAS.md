# Ideias guardadas (para depois)

Decisões já tomadas sobre estes temas: [decisoes/anteriores.md](decisoes/anteriores.md).

Ideias combinadas com a gerência, ainda não feitas.

---

## 1. Página da BVA no PC + QR code (check-in, turno e impressão do TF)

*Em espera, por decisão do gestor. Discutida em 12/10/2026, com a planilha de TF do Aeroporto (`TERMOS BVA.xlsm`).*
Decisões: [TF e página da BVA](decisoes/anteriores.md#tf-e-página-da-bva)

Falta, nesta ordem:
1. Antes da página:
   - Gerência no TF (GDV, GDA, GIPOA), cada uma com a sua lista de produtos.
   - Dados do fiel depositário no TF e no PDF: nome, RG, CPF, endereço, telefone.
   - Importar cadastros de transportadores da planilha maior do gestor.
2. Página da BVA: QR dinâmico, check-in (quem, onde, hora, GPS), turno e pareamento; TFs da BVA (2 vias ou PDF).
   - Check-out opcional pelo QR.
3. Salvar cada PDF automaticamente na pasta TERMOS_EMITIDOS do PC.

Com o login (22/10/2026), o QR prova só a **presença** (identidade vem do login; check-in grava o `usuarioId` e o GPS):
- **PC da BVA:** usuário próprio, só com o QR e os TFs da BVA. **QR:** assinado pelo servidor, muda a cada ~30 s.
- **Aba prevista:** `CheckinsNasBarreiras`.

---

## 2. PCE em campo: propriedade cadastrada e vários levantamentos por visita

*Em andamento. Levantamento no campo, mapa, rota e cadastro de imóvel já feitos.*
Feito: veja [modulos/pce.md](modulos/pce.md).
Decisões: [PCE em campo](decisoes/anteriores.md#pce-em-campo)

Falta:
- Cadastros dos programas banana, mandioca, soja e propriedade geral (a aba `CadastrosPCE` já tem `programa` e `dados` em JSON).
- Fotos no termo e no cadastro (a coluna `fotos` existe, sem tela).
- Relatório no app com os termos de outros servidores (hoje usa os do aparelho; o painel usa todos).
- Via do produtor por link ou QR.

---

## 3. Convênios: armadilhas, controle e convênios novos

*Feito em 14/10/2026 (metas, execução e relatório mensal). Armadilhas e controle: em espera (gestor).*
Feito: veja [modulos/convenio.md](modulos/convenio.md).
Decisões: [Convênio MAPA/ADAF](decisoes/anteriores.md#convênio-mapaadaf)

Falta:
- Armadilhas (1.3) e ações de controle (1.5) no app de campo; hoje, lançadas no painel.
- Convênio novo: hoje, copiar a linha da aba `Convenios`.

---

## 4. Relatório GDV: próximos passos

*Feito em 14 e 16/10/2026. Em espera (gestor): por ora, linha manual.*
Feito: veja [modulos/relatorios.md](modulos/relatorios.md) e, para a carga na barreira, [modulos/vigifito.md](modulos/vigifito.md).
Decisões: [Relatório GDV](decisoes/anteriores.md#relatório-gdv)

Falta:
- Medida aplicada com quantidade, por visita (hoje: linhas e coluna próprias no painel).
- Vazio sanitário da soja. Hoje: coluna "Fiscalizações do vazio sanitário" por município.
- Educação sanitária no app (ações, público). Hoje: Seção V no painel; veículos orientados já automáticos.
- Importação de CFO/CFOC, PTV e UP/UC (CSV dos sistemas de certificação). Hoje: tabelas das Seções III e IV no painel.
- Armadilhas (mosca-da-carambola e Diaphorina citri). Hoje: coluna e linha próprias no painel (Seção VI).
- Avisos de consistência: coordenada fora do município (exige a malha); importar relatórios anteriores ao e-GDV.

---

## 5. BVAs e portos a confirmar

- A gerência cadastra no painel (Cadastro de BVAs): Humaitá, Guajará, Parintins, Tabatinga, Benjamin Constant, AM-070.
- Depois, ligar cada BVA nova a um posto em "Postos do VIGIFITO" (painel → Relatórios).

---

## 6. Relatórios, VIGIFITO e Portal do Administrativo: pendências

*Feito em 16/10/2026: central de relatórios, motor de indicadores e Portal do Administrativo com login Google.*
Feito: veja [modulos/relatorios.md](modulos/relatorios.md) e [apps/administrativo.md](apps/administrativo.md).
Decisões: [VIGIFITO e Portal do Administrativo](decisoes/anteriores.md#vigifito-e-portal-do-administrativo)

Falta:
- Carga: madeira em m³ no registro; "auto de destruição" no TF; caixas e sacos em t por produto (pesos médios).
- Histórico do Jundiá por período de 10 dias: falta o modelo do gestor com os anos anteriores.
- Metas SUASA: aguardando o plano (motor de metas do convênio).

## 7. Assinatura na tela (desligada temporariamente)

- **Situação:** desde 28/10/2026 desligada (gerência): linhas em branco para assinar no papel.
- **Para retomar:** `assinaturaNaTela: true` em `web/js/config.js` (código e testes continuam).
