# Roteiro — levar o e-GDV para a conta institucional

Hoje a planilha, o Apps Script, as fotos (Drive) e os backups ficam na conta pessoal de quem montou o sistema. Este roteiro passa tudo para uma conta da instituição (ex.: `egdv@adaf.am.gov.br` ou uma conta de setor), **sem perder dados e sem os fiscais precisarem de chave nova**.

Tempo estimado: 1 h, num horário com pouca barreira aberta (ex.: domingo de manhã).

Este roteiro é de uma conta Google para outra. Para sair do Google (servidor próprio), veja
[PORTABILIDADE.md](PORTABILIDADE.md).

## O que muda e o que não muda

| Item | Depois da migração |
|---|---|
| Dados (turnos, veículos, TFs, PCE, servidores, permissões, numeração) | Vão junto com a cópia da planilha. A numeração dos TFs e termos continua de onde parou. |
| Chaves dos fiscais e do painel/TV | **Continuam valendo**: as credenciais ficam na aba `Fiscais`, que vai na cópia. |
| Link do app e do painel (GitHub Pages) | Não muda. |
| Endereço da API (`/exec`) | **Muda**: o app e o painel passam a usar o endereço novo depois de uma atualização do site. |
| Fotos e PDFs já enviados | Ficam na pasta antiga (`GDV - Arquivos`), compartilhada com a conta nova. As fotos novas vão para uma pasta nova na conta institucional. |
| Backups, relatório mensal, encerramento automático | Precisam ser ativados de novo na conta nova (1 clique). |

## Antes de começar (verificar com a TI)

1. **A conta institucional pode publicar Apps Script como "Qualquer pessoa"?** Em muitos domínios do Google Workspace o administrador bloqueia isso e só deixa "Qualquer pessoa do domínio". O app dos fiscais **não faz login no Google**, então precisa de "Qualquer pessoa". Se estiver bloqueado, peça à TI a liberação para essa conta (Console do Google Admin → Apps → Google Workspace → Drive e Documentos → Configurações de compartilhamento, e a política do Apps Script).
2. A conta precisa de **Google Drive** com espaço (fotos) e de **Gmail** (relatório mensal).
3. Avise os fiscais: “domingo, das 8h às 9h, o app pode mostrar ‘pendente’; continuem registrando normalmente, nada se perde”.

## Passo a passo

**1. Garanta que os celulares enviaram tudo.** No painel, aba Visão geral, confira que não há barreira com “aguardando envio”. O ideal é não haver turno aberto.

**2. Faça um backup manual** (conta antiga): menu **e-GDV → Fazer backup agora**.

**3. Compartilhe com a conta nova** (conta antiga): a planilha e as pastas `GDV - Arquivos` e `GDV - Backups` como **Editor** para a conta institucional.

**4. Copie a planilha** (logado na conta **institucional**): abra a planilha → **Arquivo → Fazer uma cópia** → nome “e-GDV – Banco de dados”. A cópia já leva o Apps Script junto.

**5. Configure o script** (conta institucional, na cópia): **Extensões → Apps Script**.
   - Confira que o `Code.gs` é o mais recente do repositório (se tiver dúvida, cole de novo).
   - **Configurações do projeto (engrenagem) → Propriedades do script**: as propriedades **não** vão na cópia. Recrie só se usava:
     - `ACCESS_KEY` (chave mestra, opcional);
     - `RELATORIO_EMAILS` (ou use depois o menu *Definir e-mails do relatório mensal*);
     - `PAINEL_URL` (só se o painel estiver num endereço diferente do padrão).
   - Não crie `SHEET_ID`, `PASTA_ARQUIVOS` nem `PASTA_BACKUPS`: o script descobre a planilha sozinho e cria as pastas novas na conta institucional.

**6. Autorize e ative as rotinas** (na planilha copiada, recarregue a página para aparecer o menu):
   - **e-GDV → Autorizar acesso ao Drive** e aceite;
   - **e-GDV → Ativar rotinas automáticas** e aceite.

**7. Publique a API nova**: no Apps Script, **Implantar → Nova implantação → App da Web**, executar como **Eu**, acesso **Qualquer pessoa**. Copie a URL que termina em `/exec`.

**8. Me mande a URL nova.** Eu troco o endereço no `web/js/config.js` (app e painel usam o mesmo arquivo), rodo os testes e publico. A partir daí:
   - o painel e a TV pegam o endereço novo ao recarregar (Ctrl+Shift+R);
   - cada celular pega o endereço novo na próxima vez que abrir o app com internet, e envia para a planilha nova o que estiver pendente.

**9. Desligue a planilha antiga** (conta antiga), depois que todos os celulares tiverem aparecido no painel novo (aba Servidores, coluna “último sinal”):
   - **e-GDV → Desativar rotinas automáticas** (senão a conta antiga continua fazendo backup e encerrando turnos);
   - não apague a planilha antiga por pelo menos 30 dias: ela é a garantia se algo der errado.

> Durante a troca (passos 4 a 9), um celular que ainda não atualizou pode mandar dados para a planilha antiga. Para não ficar nada para trás, antes do passo 4 eu posso colocar na planilha antiga um **modo “mudou de endereço”**. Nesse modo, ela recusa os envios com a mensagem “Atualize o app”. O celular guarda os dados como pendentes e os envia para a planilha nova assim que atualizar. Peça esse ajuste quando for marcar a data.

## Fotos antigas

Os links das fotos e PDFs já enviados continuam funcionando, porque os arquivos ficam onde estão e a conta nova tem acesso de Editor. Para tirar tudo da conta pessoal:

- Se a conta pessoal e a institucional forem do **mesmo domínio**, dá para **transferir a propriedade** da pasta `GDV - Arquivos` (Compartilhar → transferir propriedade).
- Se forem de **domínios diferentes** (Gmail → gov.br), o Google não transfere. Nesse caso, mantenha a pasta antiga compartilhada como arquivo histórico. Copiar os arquivos geraria IDs novos e quebraria os links gravados na aba `Arquivos`.

## Conferência final

- [ ] Painel abre e mostra os dados de ontem.
- [ ] Um fiscal abre o app, inicia e encerra um turno de teste, e o turno aparece no painel.
- [ ] Um TF de teste gera número na sequência certa (depois cancele).
- [ ] Uma foto do PCE ou do TF aparece na pasta nova `GDV - Arquivos` da conta institucional.
- [ ] No dia seguinte, existe um backup em `GDV - Backups` da conta nova.
- [ ] Rotinas da conta antiga desativadas.
