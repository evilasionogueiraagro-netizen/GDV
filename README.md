# GDV – Controle de Veículos (Barreiras Fitossanitárias)

App para registrar os veículos abordados em barreiras **fixas ou móveis**, por turno, e gerar o
**Termo de Fiscalização** e a **Ficha de Campo** (modelos HTML de `web/documentos/`).

## Como funciona

```
 Celular do fiscal (PWA, funciona SEM internet)          Google
 ┌─────────────────────────────────────────┐   quando há    ┌──────────────────────┐
 │ web/  → banco local (IndexedDB)          │   internet     │ apps-script/Code.gs  │
 │        registra, lista, resumo, PDFs     │ ─────────────► │ grava na planilha    │
 │        histórico e dashboard             │ ◄───────────── │ (Turnos / Veiculos)  │
 └─────────────────────────────────────────┘   sincroniza   └──────────────────────┘
```

- **Fluxo do fiscal:** abre o link → recebe as instruções para **instalar** (iOS/Android) → abre o app instalado e informa o **código de ativação** → cai na tela de **Módulos**, com dois cartões: **Controle de veículos** (turno, registro, lista, resumo, histórico, Termo e Ficha) e **Termo de Fiscalização de Barreira** (TF isolado). Dentro do controle de veículos também é possível lavrar o TF (botão *Lavrar TF neste turno* na tela do turno e *Lavrar TF* em cada veículo da lista), sem sair do módulo. O item *Módulos* do menu volta sempre para essa tela.
- **Offline primeiro:** tudo é salvo no aparelho. Ao voltar a conexão (ou a cada 60 s online) o app envia o que está pendente e baixa o que mudou. O selo no topo mostra 🟢 Online / 🔴 Offline e quantos registros aguardam envio.
- **Um fiscal por turno** lança os dados; vários aparelhos/barreiras podem usar a mesma planilha (cada registro tem ID único; em conflito vale a edição mais recente).
- **Horários do turno:** o início é o instante em que o fiscal toca em *Iniciar turno* e o fim, o instante de *Encerrar turno* (relógio do aparelho; mantenha data/hora automáticas). Ambos vão para o Termo. A letra do TF e o quadradinho da Ficha são deduzidos do início: 04:00–11:59 = A, demais = B. O Termo é liberado após encerrar. O encerramento é definitivo (não há como reabrir o turno).
- **Coordenadas:** ao iniciar e ao encerrar o turno o app grava latitude, longitude e precisão (m) do GPS do aparelho (funciona sem internet; o navegador pede permissão de localização na primeira vez). Se o GPS falhar ou for negado, o turno segue normalmente, sem coordenadas. No Termo, o campo *Coordenadas Geográficas* recebe a coordenada **final** (encerramento; se ela faltar, a do início). Ficam **ocultas no app**: são usadas só para preencher o Termo e para gravar na planilha (`Turnos`).
- **Excluir** apenas marca como excluído (some das telas e relatórios, permanece na planilha para auditoria).
- **Histórico/Dashboard** funcionam offline, a partir dos dados já sincronizados no aparelho. O botão **Limpar histórico deste aparelho** remove do celular os turnos já encerrados (não apaga a planilha, não afeta o turno em andamento e só funciona se tudo já tiver sido enviado).
- **Sincronização automática:** a cada minuto, ao voltar a internet, ao reabrir o app e após cada registro. Tocar no selo do topo força na hora. A tela *Status* só mostra o estado e permite desativar o aparelho / trocar de fiscal.
- **Fiscais:** dois campos de nome completo (nome e sobrenome); pelo menos um é obrigatório. No Termo e na Ficha aparecem como “Nome 1 e Nome 2”.
- A quantidade de **pessoas** é uma estimativa por tipo de veículo (padrões em `web/js/config.js`), editável em cada registro.

## Publicação (uma vez)

### 1. Banco de dados e API (Google)
1. Crie uma planilha no Google Sheets (ex.: “GDV – Banco de dados”).
2. **Extensões → Apps Script**. Cole `apps-script/Code.gs`; em *Configurações do projeto* ative “Mostrar arquivo de manifesto” e cole `apps-script/appsscript.json`.
3. Recarregue a planilha: aparece o menu **GDV** (na primeira vez ele pede autorização). *Opcional:* em **Configurações do projeto → Propriedades do script**, `ACCESS_KEY` = chave mestra de administrador (mantém aparelhos antigos funcionando; não é necessária para o código de ativação).
4. **Implantar → Nova implantação → App da Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copie a URL que termina em `/exec`.
   > O acesso é “qualquer pessoa” para o app funcionar sem login Google no campo; a proteção é a credencial de cada fiscal (ou a `ACCESS_KEY`). Ao alterar o `Code.gs`, cole o código novo e faça uma nova versão da implantação (Gerenciar implantações → lápis → Nova versão). As colunas novas são acrescentadas sozinhas na planilha existente.
   > O código de ativação é de 6 dígitos, uso único e vale 7 dias; após 10 tentativas erradas a ativação fica bloqueada por 15 minutos.

### 2. O app (GitHub Pages)
1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Faça merge na `main`; o workflow `.github/workflows/pages.yml` publica a pasta `web/`.
3. **Ativar cada fiscal (código de 6 dígitos, um por pessoa):**
   1. Na planilha: menu **GDV → Gerar código de ativação** e informe o **nome completo** do fiscal. O código aparece na tela (uso único, vale 7 dias). Os acessos ficam na aba `Fiscais`.
   2. Envie o código ao fiscal. No app, ele digita o código uma vez (precisa de internet só nesse momento). O aparelho passa a ter uma credencial própria, **vinculada ao nome**, e o campo *Fiscal 1* do turno já vem preenchido com ele.
   3. Para tirar o acesso (celular perdido, desligamento): **GDV → Revogar acesso de um fiscal**. O aparelho deixa de sincronizar e passa a pedir novo código.
   4. Para gerar outro acesso ao mesmo fiscal (novo celular), gere um novo código com o mesmo nome.
   - O endereço do servidor (`…/exec`, não é segredo) fica em `CONFIG.sync.url` (`web/js/config.js`); se estiver vazio, o app pede o endereço junto com o código.
   - A planilha registra em cada turno/veículo, na coluna `usuario`, quem sincronizou.
   - **Ordem no celular (iOS e Android):** 1) o app mostra primeiro as instruções para **adicionar à tela inicial** (e, no Android, o botão *Instalar agora*); 2) aberto pelo ícone, pede o **código de ativação**; 3) só depois libera o **início do turno**. Enquanto não estiver instalado, não aparece o campo do código. Há a saída *Continuar no navegador mesmo assim* para casos em que a instalação não é possível.
   - No iPhone, o app instalado guarda os dados separados do Safari, por isso a ativação é feita depois da instalação (o código é de uso único). Abra o app uma vez com internet para ele ser guardado no aparelho.

Para testar localmente: `cd web && python3 -m http.server 8080`.

## Termo de Fiscalização de Barreira (TF)

Dentro do mesmo app, no módulo **Termo de Fiscalização de Barreira** (menu *Módulos*): o fiscal preenche o TF digitalmente e imprime em **2 vias** (páginas separadas, uma via por folha A4) para assinatura. Pode ser usado **isolado** (módulo TF → *Novo TF*) ou **embutido no controle de veículos**: o botão **Lavrar TF neste turno** (tela do turno) e o botão **Lavrar TF** de cada veículo da lista abrem o mesmo formulário com o local do turno (e a placa, no caso do veículo), ligam o TF ao turno e, ao terminar, voltam para o controle de veículos. No **Termo do turno**, o campo “Termos de Barreira Lavrados” sai preenchido com os números dos TFs lavrados naquele turno.

**Numeração (uma sequência única por barreira e por ano, na planilha)**
- Formato `0012/2026 - BVA - CEASA` (o sufixo vem da aba `Barreiras`). **Não há faixas reservadas por celular**: o número é o *último usado na planilha + 1*.
- Ao tocar em **Gerar TF**, o app faz uma consulta rápida à planilha e abre um **popup com o número** (e o último TF usado na barreira), que o fiscal pode **editar** antes de gerar o PDF.
- Ao confirmar, a planilha **grava o TF só se o número ainda estiver livre**. Se outro fiscal usou o número nesse intervalo, o app avisa e sugere o próximo, **ainda antes do PDF**.
- **Auditoria:** cada TF guarda `numeroSugerido` (o que o sistema sugeriu), `numeroOrigem` (`sistema`, `editado` ou `provisorio`) e `emitidoEm` (quando a planilha o recebeu). TFs cancelados mantêm o número. Menu **GDV → Auditar numeração de TF** lista lacunas, números repetidos e números alterados à mão ou provisórios.
- **Sem internet:** o app propõe um número **provisório** (último nº conhecido + 1), avisa no popup e confere na planilha ao sincronizar. Se o número já tiver sido usado, o TF mais antigo vale e o outro fica com `conflito = 1` na planilha e com o aviso **“Número duplicado”** na lista do fiscal. Por isso, quando possível, gere o TF com internet.
- Para começar a usar no meio do ano: menu **GDV → Definir último nº de TF usado (barreira)** (aba `Numeracao`; o próximo será +1). As abas `Sequencias` e `Reservas` da versão anterior não são mais usadas e podem ser apagadas.
- **Barreiras:** aba `Barreiras` (`id`, `nome`, `sufixo`, `local`, `ativo`). Vem com `BVA-CEASA`; acrescente uma linha para cada barreira, fixa ou móvel.

**Cadastro de pessoas e placas, e reincidência**
- Ao gerar o TF, o fiscalizado é gravado em `Pessoas` (chave: CPF/CNPJ, só dígitos) e a placa em `Placas` (com o último fiscalizado). Ao digitar um CPF/CNPJ completo (ou a placa), o app **consulta o servidor**: preenche o cadastro e mostra o **histórico**; sem internet, consulta só o que o aparelho já conhece.
- **Reincidente** = já existe TF anterior (não cancelado) desse CPF/CNPJ com **apreensão, rechaço ou auto de infração**. O alerta lista os TFs anteriores (de todas as barreiras) e a informação é gravada no TF (`reincidente`, `tfsAnteriores`); não sai impressa no documento.
- **Cancelar TF** (motivo obrigatório na tela) mantém o número usado e o tira da contagem de reincidência.

**Dados pessoais (LGPD):** cada fiscal só baixa para o celular os **próprios** TFs; cadastros e históricos de outras pessoas chegam **apenas por consulta**, uma a uma. As consultas ficam registradas na aba `Consultas` (quem, quando, CPF/CNPJ mascarado). Limite o compartilhamento da planilha a quem precisa e defina um prazo de guarda.

**Impressão em uma folha por via:** os campos Constatação e Enquadramento Legal têm 40% menos altura que no rascunho e, se mesmo assim o conteúdo não couber numa folha A4 (muitos produtos, textos longos), o app ajusta sozinho, nesta ordem: tira a linha em branco extra dos produtos, compacta os espaçamentos, deixa os campos do tamanho do texto e só então reduz levemente a letra desses dois campos (mínimo 9 pt-equivalente, com zoom de até 78% em casos extremos). As duas vias saem iguais.

**Textos padrão** de constatação e enquadramento legal, lista de produtos e unidades ficam em `web/js/config.js` (`CONFIG.TF`); o fiscal pode editar o texto no formulário. O modelo impresso é `web/documentos/tf.html`.

**Para publicar:** atualize o `Code.gs` no Apps Script e crie uma **nova versão** da implantação (as abas novas são criadas automaticamente na primeira sincronização). Nos celulares, abra o app com internet para baixar a versão nova.

## Módulo PCE (Levantamento fitossanitário e Termo de Colheita de Amostras)

Fotos e assinaturas colhidas no app ficam no aparelho e, depois, sobem para o **Google Drive** do dono da planilha (pasta `GDV - Arquivos/PCE/<ano>/<levantamentos|colheitas>`, sem compartilhamento público); a aba `Arquivos` guarda o link. O Termo de Colheita tem numeração por unidade/ano, como o TF (menu **GDV → Definir último nº / Auditar numeração de Termo de Colheita**).

**Para publicar (uma vez):** o PCE usa o Drive, que exige uma **nova autorização**:
1. Atualize o `Code.gs` no Apps Script e recarregue a planilha.
2. Menu **GDV → Autorizar acesso ao Drive (fotos do PCE)** e aceite a permissão do Google Drive (cria a pasta `GDV - Arquivos`).
3. **Implantar → Gerenciar implantações → lápis → Nova versão → Implantar**. Enquanto isso não for feito, o envio das fotos falha com erro de autorização e elas ficam pendentes nos aparelhos (nada se perde).

## Painel do administrador (fora do app)

Painel web só para o administrador, lendo a própria planilha. Fica no mesmo projeto do Apps Script (arquivo `apps-script/Painel.html`), mas é aberto por uma **segunda implantação**, com acesso restrito.

**O que mostra** (filtros: período, local, posto e fiscal; todos os números comparam com o período anterior de mesmo tamanho):
- Veículos abordados, pessoas impactadas, **horas de barreira**, turnos (encerrados e em andamento), veículos e pessoas **por hora de barreira**, média de veículos por turno e horário de maior fluxo.
- Veículos, pessoas ou horas **por dia, semana ou mês**.
- **Fluxo por hora do dia**, **mapa de calor** (dia da semana × hora) e **fluxo ao longo do turno** (média de veículos em cada hora decorrida desde o início, turnos A × B).
- Veículos por tipo, **mapa** das barreiras (ponto final do turno), tabelas por local e por fiscal, placas recorrentes, alertas (turno que ficou aberto, sem veículos, duração incomum, sem coordenadas) e lista de turnos, com CSV de turnos e de veículos.
- *Horas de barreira* = soma da duração (fim − início, atravessando a meia-noite quando preciso) dos turnos **encerrados**. Cada gráfico tem a versão em tabela (botão *Tabela*).

**Como publicar** (usa a **mesma implantação** dos aparelhos; não há segunda implantação)
1. No projeto do Apps Script: atualize o `Code.gs` e crie um arquivo **HTML** chamado `Painel` (sem `.html`) com o conteúdo de `apps-script/Painel.html`.
2. **Implantar → Gerenciar implantações → lápis → Nova versão → Implantar** (a URL `/exec` não muda).
3. Recarregue a planilha e use o menu **GDV → Gerar código de administrador (painel)** (informe o nome). O código de 6 dígitos é de uso único e vale 7 dias.
4. Abra a URL do app seguida de `?p=painel` (`https://script.google.com/macros/s/…/exec?p=painel`), digite o código e salve nos favoritos. A sessão fica guardada no navegador; **Sair** encerra.

**Proteção:** a página do painel não contém dados; eles só são entregues a quem tem uma credencial de **administrador**, obtida com o código acima. Credenciais de fiscais não leem o painel, e códigos de administrador não ativam aparelhos de fiscais. Cada código é de uso único, e após 10 tentativas erradas a ativação fica bloqueada por 15 minutos. Para tirar um acesso: **GDV → Revogar acesso de um fiscal ou administrador** (a credencial deixa de valer na hora). A aba `Fiscais` lista todos os acessos (coluna `perfil` = `admin` para administradores). Ao alterar o `Code.gs` ou o `Painel.html`, crie uma nova versão da implantação.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `web/` | App (HTML/JS/CSS puro, sem build). `js/config.js` guarda unidade, tipos de veículo, turnos e pessoas estimadas |
| `web/documentos/` | Modelos HTML do Termo e da Ficha (impressos via “Salvar como PDF”) |
| `apps-script/` | API de sincronização que grava na planilha e o painel do administrador (`Painel.html`) |

## Limites conhecidos
- A **Ficha de Campo** tem 50 linhas; acima disso o app avisa e os excedentes ficam fora da ficha (o Termo conta todos).
- Em caso de relógios de aparelho muito errados, a regra “edição mais recente vence” pode escolher a edição errada; mantenha data/hora automáticas ativadas.
- Atualizações do app: a cada publicação o workflow troca `VERSAO` em `web/sw.js` pelo hash do commit; os aparelhos baixam a versão nova ao abrir com internet (sempre revalidando com o servidor) e, se o app estiver aberto, mostram a faixa “Nova versão disponível — Atualizar agora”.
