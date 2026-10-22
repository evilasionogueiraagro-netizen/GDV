# Roteiro: levar o e-GDV para a conta institucional

Leva planilha, Apps Script, fotos e backups da conta pessoal para uma conta institucional (ex.: `egdv@adaf.am.gov.br`), sem perder dados nem trocar chave dos fiscais. Dura ~1 h, com pouca barreira aberta. Para sair do Google: [PORTABILIDADE.md](PORTABILIDADE.md).

## O que muda
- Dados (turnos, veículos, TFs, PCE, servidores, permissões): vão na cópia; a numeração segue de onde parou.
- Chaves dos fiscais e do painel/TV: continuam (aba `Fiscais`, que vai na cópia).
- Link do app e do painel: não muda. Endereço da API (`/exec`): **muda**, no passo 8.
- Fotos e PDFs antigos ficam em `GDV - Arquivos` (conta antiga, com Editor para a nova); as novas, em pasta nova.
- Backups, relatório mensal e rotinas automáticas: ativar de novo na conta nova.

## Antes de começar
- Peça à TI que libere Apps Script como "Qualquer pessoa" (o app não faz login Google). Se bloqueado: Google Admin, política do Apps Script e compartilhamento do Drive.
- Avise os fiscais: no horário, o app pode mostrar "pendente"; nada se perde.

## Passo a passo
1. (conta antiga) Painel, aba Visão geral: nenhuma barreira "aguardando envio". Ideal: nenhum turno aberto.
2. (conta antiga) **e-GDV → Fazer backup agora**.
3. (conta antiga) Compartilhe a planilha e as pastas `GDV - Arquivos` e `GDV - Backups` com a conta institucional como **Editor**.
4. (conta institucional) Planilha → **Arquivo → Fazer uma cópia** → "e-GDV – Banco de dados". A cópia leva o Apps Script.
5. (conta institucional, na cópia) **Extensões → Apps Script**:
   - confira se o `Code.gs` é o mais recente (na dúvida, cole de novo);
   - **Configurações do projeto → Propriedades do script**: recrie só as usadas: `ACCESS_KEY` (opcional), `RELATORIO_EMAILS` (ou depois, **Definir e-mails do relatório mensal**), `PAINEL_URL` (só se o painel mudar de endereço);
   - não crie `SHEET_ID`, `PASTA_ARQUIVOS` nem `PASTA_BACKUPS`: o script acha a planilha e cria as pastas.
6. Na cópia, recarregue (aparece o menu **e-GDV**) e rode, aceitando: **Autorizar acesso ao Drive (fotos do PCE)** e **Ativar rotinas automáticas**.
7. **Implantar → Nova implantação → App da Web**, executar como **Eu**, acesso **Qualquer pessoa**. Copie a URL que termina em `/exec`.
8. Mande a URL ao responsável pelo código, que troca o endereço em `web/js/config.js`, roda os testes e publica. Painel e TV pegam o novo ao recarregar (Ctrl+Shift+R); cada celular, ao abrir com internet, envia o pendente à planilha nova.
9. (conta antiga) Com todos os celulares no painel novo (aba Servidores, "último sinal"): **e-GDV → Desativar rotinas automáticas**. **Não apague a planilha antiga por pelo menos 30 dias.**

Até o passo 9, um celular atrasado pode enviar à planilha antiga. Um modo "mudou de endereço" nela (ainda não existe) pode ser pedido antes do passo 4: recusa envios com "Atualize o app".

## Fotos antigas
- Os links gravados continuam válidos: os arquivos não se movem.
- Mesmo domínio: transfira a propriedade de `GDV - Arquivos`. Domínios diferentes: o Google não transfere; a pasta antiga fica como histórico. Copiar gera IDs novos e quebra os links da aba `Arquivos`.

## Conferência final
- [ ] Painel mostra os dados de ontem; um turno de teste de fiscal aparece nele.
- [ ] Um TF de teste gera número na sequência certa (depois cancele).
- [ ] Uma foto do PCE ou do TF aparece em `GDV - Arquivos` da conta nova; no dia seguinte, há backup em `GDV - Backups`.
- [ ] Rotinas da conta antiga desativadas.
