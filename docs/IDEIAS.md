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
