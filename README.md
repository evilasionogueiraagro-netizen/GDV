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
- **Horários do turno:** o início é o instante em que o fiscal toca em *Iniciar turno* e o fim, o instante de *Encerrar turno* (relógio do aparelho; mantenha data/hora automáticas). Ambos vão para o Termo. Na Ficha de Campo, o campo *Turno* traz esses horários reais (das HH:MM às HH:MM). A letra do TF é deduzida do início: 04:00–11:59 = A, demais = B. O Termo é liberado após encerrar. O encerramento é definitivo (não há como reabrir o turno).
- **Coordenadas:** ao iniciar e ao encerrar o turno o app grava latitude, longitude e precisão (m) do GPS do aparelho (funciona sem internet; o navegador pede permissão de localização na primeira vez). Se o GPS falhar ou for negado, o turno segue normalmente, sem coordenadas. No Termo, o campo *Coordenadas Geográficas* recebe a coordenada **final** (encerramento; se ela faltar, a do início). Ficam **ocultas no app**: são usadas só para preencher o Termo e para gravar na planilha (`Turnos`).
- **Excluir** apenas marca como excluído (some das telas e relatórios, permanece na planilha para auditoria).
- **Histórico/Dashboard** funcionam offline, a partir dos dados já sincronizados no aparelho. O botão **Limpar histórico deste aparelho** remove do celular os turnos já encerrados (não apaga a planilha, não afeta o turno em andamento e só funciona se tudo já tiver sido enviado).
- **Sincronização automática:** a cada minuto, ao voltar a internet, ao reabrir o app e após cada registro. Tocar no selo do topo força na hora. A tela *Status* só mostra o estado e permite desativar o aparelho / trocar de fiscal.
- **Fiscais:** dois campos de nome completo (nome e sobrenome); pelo menos um é obrigatório. No Termo e na Ficha aparecem como “Nome 1 e Nome 2”.
- **Local / Posto:** com posto **Fixa**, o fiscal escolhe a BVA numa lista (`CONFIG.bvas` em `web/js/config.js`: BVA - CEASA, BVA - JUNDIÁ, BVA - AEROPORTO). Com posto **Volante (móvel)**, o local é preenchido pelo endereço da coordenada do GPS (OpenStreetMap/Nominatim; botão *Atualizar pela localização*) e pode ser editado. **Placa do veículo:** obrigatória só onde a BVA exige (`placa: true` — hoje só a CEASA); nas demais BVAs e no volante é opcional e o veículo conta normalmente (a lista mostra "sem placa"). Coluna `semPlaca` na aba `Turnos`.
- **Ficha de Campo:** 50 veículos por folha; acima disso o app acrescenta folhas com a numeração continuando (51, 52…) e "FOLHA 1/2" no título.
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
   1. Na planilha: menu **GDV → Gerar código de ativação** e informe o **nome completo** do fiscal. O código aparece na tela (uso único, vale 7 dias). Os acessos ficam na aba `Fiscais`. Também dá para gerar pelo **painel do administrador**, aba **Servidores → Gerar chave de ativação** (com botões para copiar a mensagem ou enviar pelo WhatsApp).
   2. Envie o código ao fiscal. No app, ele digita o código uma vez (precisa de internet só nesse momento). O aparelho passa a ter uma credencial própria, **vinculada ao nome**, e o campo *Fiscal 1* do turno já vem preenchido com ele.
   3. Para tirar o acesso (celular perdido, desligamento): **GDV → Revogar acesso de um fiscal** (ou **Revogar** na aba Servidores do painel). O aparelho deixa de sincronizar e passa a pedir novo código.
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

## Painel gerencial do administrador

**App separado só para o administrador — "GDV Painel"**: **https://evilasionogueiraagro-netizen.github.io/GDV/painel/** (pasta `web/painel/`: `index.html`, `js/painel*.js`, `css/painel.css`, bibliotecas locais em `vendor/`, malha municipal do AM em `dados/`, manifesto, ícone e service worker próprios). Pode ser instalado no celular ou no computador ("Adicionar à tela inicial" / "Instalar app") independentemente do app de campo, que não mostra nem guarda nada do painel. Lê a planilha pela mesma API (actions `painelAtivar`, `painelDados`, `painelSair` e, na aba Servidores, `painelGerarCodigo`, `painelAcessos` e `painelRevogar` do `Code.gs`) e precisa de internet para os dados.

**Filtros globais:** período (Hoje, 7 dias, 30 dias, Mês atual, Ano ou personalizado, até 366 dias), fiscal/servidor e barreira ou município. Datas e horas sempre no horário de Manaus, mesmo com o computador em outro fuso. Atualiza sozinho a cada minuto (pausa com a aba do navegador oculta): em períodos de até 7 dias recarrega tudo; em períodos maiores, de minuto em minuto só as barreiras em andamento (consulta leve) e o período inteiro a cada 10 minutos ou no botão **Atualizar**. O filtro de fiscal compara o nome exato. Cada módulo tem a sua aba:
- **Visão geral:** indicadores consolidados, **alertas para decisão** (novo foco de praga no município, barreira aberta há mais de 14 h ou sem sinal há mais de 30 min, conflitos/lacunas/números editados na numeração de TF e de Termo de Colheita, municípios sem levantamento PCE há 90 dias, reincidentes com nova apreensão), cartões das barreiras em andamento e atividade por município.
- **Mapa do Amazonas** (62 municípios, também filtrado em cada aba): barreiras em andamento em tempo real (verde; cinza = sem sinal; vermelho = aberta há mais de 14 h; documento vermelho piscando "TF" = TF em preenchimento / apreensão em andamento), barreiras realizadas (círculo violeta, tamanho = nº de veículos), levantamentos PCE (laranja com anel = praga detectada, azul = sem praga — as mesmas cores dos gráficos do PCE), termos de colheita (losango verde), **mapa de calor de detecções** (filtro de praga e cultura) e coroplético por município (detecções, levantamentos, veículos, TFs por origem…). A legenda mostra o mesmo marcador do mapa. A roda do mouse só dá zoom depois de clicar no mapa; no celular, um dedo rola a página e a pinça de dois dedos move/amplia o mapa.
- **Barreiras:** turnos, horas (turno esquecido aberto há mais de 14 h conta 14 h, com aviso no indicador), veículos, pessoas, veículos por hora, veículos por dia (pela data de início do turno, fecha com o total), fluxo por hora do dia, dia da semana × hora, tipos, barreiras, produtividade por fiscal, turno A × B, tabelas de turnos e veículos.
- **TF de Barreira:** TFs por procedimento, autos, reincidentes, cancelados, produtos apreendidos/rechaçados com quantidades, rotas origem → destino, por barreira e fiscal, desempenho por barreira (TFs agrupados pelo local do turno em que foram lavrados, junto com os veículos), **auditoria da numeração** e lista de TFs.
- **PCE:** levantamentos, propriedades, área, taxa de detecção, amostras, termos, detecções por praga, culturas × pragas, focos novos × recorrentes, **cobertura municipal**, tabelas de levantamentos e termos (com auditoria da numeração).
- **Servidores** (não depende do período nem dos filtros, que somem nessa aba; não aparece no Modo TV): **Gerar chave de ativação** do app de campo — digite o nome completo do servidor (nome e sobrenome, só letras, até 80 caracteres) e o painel mostra o código grande (`123 456`), a validade (7 dias, horário de Manaus) e os passos para o fiscal (abrir o link do app, instalar, digitar o código), com os botões **Copiar mensagem** (texto pronto com o link `https://evilasionogueiraagro-netizen.github.io/GDV/`, o código e a validade) e **Enviar pelo WhatsApp** (abre o WhatsApp com a mensagem, para escolher o contato). Abaixo, a lista **Acessos dos servidores** (busca por nome, filtro por situação — *Aguardando ativação*, *Ativo*, *Código vencido*, *Revogado* —, CSV): quando foi gerado, validade do código, quando foi ativado e **quem gerou** (nome do administrador do painel ou "Planilha (menu)"). O código só aparece enquanto aguarda ativação (botão **Reenviar** monta a mensagem de novo); credenciais nunca saem do servidor. **Revogar** (com confirmação) tira na hora todos os aparelhos e códigos daquele fiscal — o app dele passa a pedir novo código. Códigos e revogação de **administradores** (painel/TV) continuam só pelo menu da planilha (marque *Mostrar administradores* para vê-los na lista, só com nome e situação), para ninguém derrubar o próprio acesso ou a TV pelo painel. O menu **GDV → Gerar código de ativação / Revogar acesso** continua funcionando igual.
- Todas as tabelas baixam **CSV** (abre direto no Excel; texto que começa com `=`, `+`, `-` ou `@` recebe um apóstrofo para não virar fórmula). CPF/CNPJ aparecem mascarados; o painel não recebe telefone, e-mail, endereço, RG nem fotos.

**Como usar**
1. Publique o `Code.gs`: na planilha, **Extensões → Apps Script**, substitua todo o conteúdo de `Code.gs` pelo deste repositório, salve, apague o arquivo `Painel.html` do projeto se ainda existir, e crie uma nova versão da implantação (**Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**; a URL `/exec` não muda e continua em `web/js/config.js`). Publique também a pasta `web/` no GitHub Pages (push na branch publicada).
2. Na planilha: **GDV → Gerar código de administrador (painel)** (informe o nome). O código de 6 dígitos é de uso único e vale 7 dias.
3. Abra o endereço do painel, digite o código e salve nos favoritos. A sessão fica guardada no navegador; **Sair** revoga a credencial no servidor (cópias dela deixam de valer) e pede um novo código para entrar de novo. (O endereço antigo `…/exec?p=painel` só mostra um link para o novo.) Para usar outro endereço, defina a propriedade do script `PAINEL_URL`.

**Proteção:** a página não contém dados; eles só são entregues a quem tem uma credencial de **administrador** (ou a chave mestra `ACCESS_KEY`). Credenciais de fiscais recebem "Acesso restrito ao administrador", e códigos de administrador não ativam aparelhos de fiscais. Após 5 códigos de administrador errados o painel fica bloqueado por 15 minutos (10 para a ativação dos aparelhos; os contadores são separados, então erros no painel não travam os fiscais). Para tirar um acesso: **GDV → Revogar acesso de um fiscal ou administrador** (a credencial deixa de valer na hora). A aba `Fiscais` lista todos os acessos (coluna `perfil` = `admin` para administradores; coluna `geradoPor`, acrescentada sozinha no fim, = administrador que gerou o código pelo painel ou `planilha` quando veio do menu). As actions da aba Servidores exigem credencial de administrador (fiscal recebe "Acesso restrito ao administrador"): `painelGerarCodigo {key, nome}` → `{ok, nome, codigo, expiraEm}` (só códigos de fiscal), `painelAcessos {key}` → `{ok, acessos: [{nome, perfil, situacao, criadoEm, expiraEm, ativadoEm, geradoPor, codigo?}]}` (sem token; `codigo` só para fiscal aguardando ativação; administradores só com nome e situação) e `painelRevogar {key, nome}` → `{ok, revogados}` (só acessos de fiscal).

### Alerta "TF em preenchimento / Apreensão em andamento"

**O que dispara:** quando um fiscal abre o formulário do **TF de Barreira** no app (novo ou rascunho restaurado), o aparelho avisa o servidor (action `tfAndamento`, aba nova **`Andamento`** na planilha: placa, procedimento, local/barreira, turno e GPS — sem CPF nem nome do fiscalizado). O aviso é repetido ao mudar o procedimento ou a placa e a cada 2 min ("batimento") enquanto o formulário estiver aberto. Ao **gerar** o TF (emitido ou salvo offline), **descartar** ou **sair do formulário** sem gerar (o rascunho continua salvo; ao reabrir, o alerta volta), o aparelho manda "fim". Sem batimento há mais de 10 min o TF é considerado encerrado.

**No painel:** a barreira (turno aberto) com TF em preenchimento deixa o verde e passa a **piscar vermelho**, com marcador próprio em forma de documento escrito **"TF"** (não depende só da cor) e o rótulo **"TF em preenchimento"** — ou **"Apreensão em andamento"** quando o procedimento marcado é apreensão. TF lavrado sem turno aberto ganha um marcador vermelho próprio na coordenada do aparelho (sem GPS: só no aviso e nos alertas). Ao terminar (ou expirar), a barreira volta ao estado normal (verde, sem sinal ou aberta > 14 h). Também aparece: item **crítico** nos "Alertas para decisão", cartão vermelho no topo de "Barreiras em andamento agora" e um **aviso vermelho** no canto da tela (barreira/local, fiscal, procedimento, placa e há quanto tempo) que fica até o TF terminar ou ser **Dispensado**. TF novo (ainda não visto nesta sessão do painel) ou que passou a ser apreensão toca um **som curto** e, se o navegador permitir, mostra uma **notificação do sistema** (botão discreto **Ativar notificações** no topo; o painel nunca pede a permissão sozinho). No **Modo TV**: faixa vermelha grande no topo enquanto houver TF em preenchimento, e quando surge um novo a rotação pula para a tela **Ao vivo** e fica nela por dois períodos.

**Tempo de reação:** o painel consulta as barreiras ao vivo a cada minuto; enquanto houver TF em preenchimento, a cada 25 s (consulta leve). Na prática o vermelho aparece em até ~1 min depois de o fiscal abrir o TF e some em até ~25 s depois de gerar/descartar.

**Limites:** é melhor esforço. Sem internet no celular do fiscal **não há alerta** (nada fica em fila para depois; nenhum erro aparece para o fiscal) — e, se a internet cair com o formulário aberto, o vermelho só some quando o batimento expira (10 min). O sinal nunca atrasa a geração do TF. **Som:** navegadores bloqueiam áudio até alguém clicar na página; no painel normal basta um clique em qualquer lugar (ou no botão de notificações). Na TV em modo quiosque, inclua a flag que libera o som sem clique:
```
chrome --kiosk --autoplay-policy=no-user-gesture-required "https://evilasionogueiraagro-netizen.github.io/GDV/painel/?tv=1"
```
Requer publicar o `Code.gs` novo (nova versão da implantação) e o `web/` atualizado; a aba `Andamento` é criada sozinha no primeiro aviso.

### Modo TV — Sala de Situação (TV da sala da gerência)

Painel em tela cheia, sem rolagem e sem controles, para ficar aberto 24 h numa TV de 50" (1920×1080 ou 4K) e ser lido a 3–5 m. Topo com relógio e data de Manaus e "Atualizado às HH:MM"; telas em rotação: **Ao vivo — Barreiras (hoje)** (mapa do AM com ≈60% da largura e a altura toda da tela, o estado inteiro no quadro, com as barreiras em andamento, rótulo com nome + veículos de hoje e a situação escrita — `! 27 h` aberta há mais de 14 h, `? sem sinal` há mais de 30 min —; na coluna da direita, os indicadores de hoje — **Barreiras ativas** e **Veículos hoje** (com o horário de pico) em destaque, Pessoas, TFs e Apreensões menores — e, abaixo, os cartões de cada barreira), **Alertas para decisão**, **Barreiras — 7 dias**, **TF — 30 dias** e **PCE — 30 dias**; a tela ao vivo volta a cada duas telas e fica mais tempo no ar (padrão: 60 s em cada passagem pela Ao vivo e 10 s nas demais, ≈ 86% do tempo na Ao vivo). Os números são os mesmos das abas do painel.

**Como montar a TV da sala**
1. **Aparelho:** um computador ou mini PC ligado na TV pelo HDMI (o mais estável: Chrome em modo quiosque, ver abaixo), **ou** uma Smart TV / Android TV / TV box com navegador (Chrome, Edge ou o navegador da TV) — abra o endereço e use a opção de tela cheia do navegador. Ligue a TV/PC na tomada sem desligamento automático e desative a proteção de tela/suspensão do sistema (o painel também pede ao navegador para manter a tela acesa — Screen Wake Lock — quando suportado).
2. **Credencial própria da TV:** na planilha, **GDV → Gerar código de administrador (painel)** com um nome só dela, ex.: `TV Sala da Gerência`. Não use o código do gerente: assim cada um pode ser revogado sem derrubar o outro. A credencial de administrador **não expira** sozinha (só o código de 6 dígitos, que vale 7 dias até ser usado); ela vale até ser revogada.
3. **Abrir em modo quiosque** (Windows/Linux, atalho na inicialização do sistema):
   ```
   chrome --kiosk --autoplay-policy=no-user-gesture-required "https://evilasionogueiraagro-netizen.github.io/GDV/painel/?tv=1"
   ```
   (`--autoplay-policy=no-user-gesture-required` deixa a TV tocar o som do alerta de TF em preenchimento sem ninguém clicar.)
   (no Windows: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "…/painel/?tv=1"`; coloque o atalho em `shell:startup`). Sem quiosque, aperte **F11** (tela cheia do navegador). Use o quiosque ou o F11 e não só o botão "Tela cheia" da página: o painel recarrega sozinho a cada 6 h e quando sai uma versão nova, e o navegador sai da tela cheia da página a cada recarga (nesse caso aparece uma faixa fixa "clique em qualquer lugar para voltar à tela cheia").
4. Na primeira vez a TV pede o código: digite o código gerado no passo 2. O aparelho lembra o modo TV (`gdv.painel.tv`) e a credencial: depois de reiniciar, volta sozinho às telas.

**Parâmetros na URL** (opcionais, combináveis com `&`): `rotacao=15` (segundos em cada uma das demais telas — Alertas, Barreiras, TF, PCE; padrão 10, mínimo 10), `rotacaoAoVivo=90` (segundos em cada passagem pela tela Ao vivo; padrão 60, mínimo 10), `tema=claro` (padrão `escuro` na TV; o claro é melhor em sala muito iluminada), `telas=aovivo,alertas,pce` (quais telas e em que ordem; nomes: `aovivo`, `alertas`, `barreiras`, `tf`, `pce`). Ex.: `…/painel/?tv=1&rotacao=20&rotacaoAoVivo=90&telas=aovivo,alertas,aovivo,pce`. A barra no rodapé mostra quanto falta da tela atual. Quando um fiscal começa a preencher um TF, a TV pula para a Ao vivo e fica nela pelo menos um período inteiro dela. `?tv=0` desliga e esquece o modo TV naquele aparelho.

**Na TV:** mexer o mouse mostra **Tela cheia** e **Sair do modo TV** (o cursor some após 3 s); teclado: ← → trocam de tela, espaço pausa ("Pausado"), Esc sai do modo TV (não faz logout). O botão Sair (logout) fica escondido no modo TV. No computador do gerente há o botão **Modo TV** no topo do painel (telas com 900 px ou mais).

**Operação 24 h:** barreiras ao vivo a cada minuto e o período inteiro a cada 10 min. Sem internet a TV mantém os últimos dados (as durações e as situações "sem sinal"/"> 14 h" continuam sendo recalculadas pelo relógio), mostra a faixa âmbar **"Sem conexão — exibindo dados de HH:MM"** após 3 min e tenta de novo com espera crescente (até 5 min; uma requisição sem resposta é abandonada após 90 s). Falha de rede nunca mostra a tela de login.

**Revogar a TV:** **GDV → Revogar acesso de um fiscal ou administrador** com o nome (`TV Sala da Gerência`). Na atualização seguinte (até 1 min) a TV mostra **"Sessão encerrada — Gere um novo código de administrador e digite aqui"** com o campo do código (continua assim mesmo se a página recarregar); gere um novo código e digite na TV, com um teclado ou pelo controle.

### Gerente pelo celular (app em qualquer lugar)

O GDV Painel é um app instalável, separado do app de campo:
- **Android (Chrome):** abra **https://evilasionogueiraagro-netizen.github.io/GDV/painel/**; na primeira abertura aparece a dica **Instalar app** (ou menu ⋮ → **Instalar app** / **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o mesmo endereço no Safari → botão **Compartilhar** → **Adicionar à Tela de Início**.
- Gere um código de administrador com o nome do gerente (ex.: `Gerente — celular`) e digite no app. No celular o painel abre sempre na **Visão geral**, com **Barreiras em andamento agora** no topo, antes do mapa. A dica de instalação pode ser fechada no ✕ e não volta.
- Perdeu o celular? Revogue só essa credencial pelo nome (a da TV continua funcionando).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `web/` | App (HTML/JS/CSS puro, sem build). `js/config.js` guarda unidade, tipos de veículo, turnos e pessoas estimadas |
| `web/documentos/` | Modelos HTML do Termo e da Ficha (impressos via “Salvar como PDF”) |
| `apps-script/` | API de sincronização que grava na planilha e entrega os dados do painel gerencial |
| `web/painel/` | App "GDV Painel" do administrador (`index.html`, `js/painel*.js`, `css/painel.css`, `vendor/`, `dados/`, `manifest.webmanifest`, `sw.js`) |

## Limites conhecidos
- A **Ficha de Campo** tem 50 linhas; acima disso o app avisa e os excedentes ficam fora da ficha (o Termo conta todos).
- Em caso de relógios de aparelho muito errados, a regra “edição mais recente vence” pode escolher a edição errada; mantenha data/hora automáticas ativadas.
- Atualizações do app: a cada publicação o workflow troca `VERSAO` em `web/sw.js` pelo hash do commit; os aparelhos baixam a versão nova ao abrir com internet (sempre revalidando com o servidor) e, se o app estiver aberto, mostram a faixa “Nova versão disponível — Atualizar agora”.
