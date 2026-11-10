# Módulo PCE (Programa de Controle e Erradicação)

Produtor, frutos, Termos por programa, citros, monilíase, laudo e campo sem internet; usado por fiscais e painel. Veja também: [acessos](acessos.md), [API](../API.md).

## Catálogo (pce-catalogo.gs, painel → PCE → Culturas / Doenças e pragas)
- Modelo em [arquitetura](../arquitetura.md): a praga é o programa; a família agrupa culturas e define o modelo de cadastro; pragas da cultura = as da família + as ligadas só a ela.
- Fonte única: abas `FamiliasDeCulturas`, `Culturas`, `Pragas`, `PragasDasFamilias`, `PragasDasCulturas`; vazias = base do código (`CATALOGO_PCE_BASE_`), copiada na 1ª gravação. Ids nascem do nome e não mudam.
- Lê quem tem `pce` (painel e app pelo sync); grava gerência + `pce`; ligação desfeita = `ativo` 0; tudo em `HistoricoDeAlteracoes`.

## Regras de negócio (cada uma tem teste)
- **Escopo:** o PCE é produtor, frutos e Termos. A visita é o Termo; levantamento não é mais criado.
- **Um Termo por programa:** a visita gera um Termo e um PDF por programa (campo `programa` do catálogo). Chave única (`visitaId`, `programaVisita`): o servidor recusa (`recusados.termosPce`) o segundo Termo ativo com outra `id`, e o app o cancela sem apagar. Termo cancelado ou excluído libera a chave. Com internet, `pceDocRegistrar` devolve `termoDaVisita` do que já existe.
- **Toda visita gera Termo, inclusive sem detecção** (vigilância negativa). Ficha oficial nunca bloqueia o Termo.
- **Numeração:** por unidade e ano, uma sequência para todos os programas (`001.2026.AUTAZES`). Online: `pceDocNumero` + `pceDocRegistrar` sob lock. Offline: provisório (último + 1) e `conflito = 1` se repetir.
- **Pragas:** as do catálogo pela regra de [hospedeiros](pce-hospedeiros.md). Opcionais (Fusariose, Moko, Sigatoka, Pinta Preta, Leprose, Diaphorina, Amaranthus): campo "Não tem" / "Tem" (`nao_detectada` / `detectada`), já marcado "Não tem"; em branco (rascunho ou registro antigo) vale "Não tem", e o servidor ainda aceita resultado vazio. Contam como avaliadas no Termo do programa do fruto (caixa do quadro, constatação, enquadramento), sem Termo próprio.
- **Citros:** HLB, ácaro hindustânico e cancro cítrico obrigatórios (senão não conclui). Diaphorina não marca HLB.
- **Constatação no Termo novo:** uma linha por praga avaliada (culturas juntas) com as caixas Presença / Ausência / Suspeita; Suspeita só em praga obrigatória (`opcional = 1` gravado na praga). As linhas de escrever ficam para o texto livre do fiscal (opcional, sem frase pronta). Termo antigo e Termo do papel imprimem o texto como antes.
- **Enquadramento legal:** como na [planilha da GDV](pce-legislacao.csv), sem texto próprio: das pragas detectadas ou suspeitas que têm texto; se nenhuma tiver, de todas as avaliadas do programa. Na banana vale só o da Fusariose, mesmo com Moko ou Sigatoka detectados (são registro e não têm texto na planilha).
- **Produtor que não assina:** foto dele com documento oficial com foto; sem ela não conclui.
- **Coordenada:** só dentro do Amazonas (lat −10…+3, lon −74…−56).
- **Frutos** (`Propriedades.frutos`, até 60 por propriedade, `id` e `cultura` obrigatórios): o sync salva a propriedade; no conflito vale o `atualizadoEm` maior; reenvio de aparelho desatualizado só insere `id` novos; fruto nunca some (remover = `excluido: 1`). Propriedade sem fruto recebe `frutosSugeridos` dos levantamentos antigos: só leitura, vira cadastro ao salvar, só insere e nunca sobrescreve. Nada vira Termo.
- **Levantamento antigo:** tabela e registros intactos; o app só o abre (leitura e PDF). O servidor ainda aceita o que o aparelho tinha pendente.
- **Contagem nos relatórios (sem data de corte):** levantamentos antigos + Termos do fluxo novo (`visitaId` e `culturas` preenchidos, nem cancelados nem excluídos; Termo sem `visitaId` nunca conta como visita). Total de visitas conta `visitaId` distinto; por programa, Termos. Vale para Relatório GDV, dashboard público, painel, TV e rotina (`visitasPce_`). A etapa 1.4 do [convênio](convenio.md) à parte: sempre soma levantamentos e todos os Termos, inclusive antigos.
- **Aparelho com vários logins:** as telas do PCE leem os registros por `Sync.visiveis`, só os do login atual.
- **Rastreabilidade:** toda ação registra quem fez; exclusão lógica.

## Termo e documentos
- Limites: 40 culturas por Termo, 25 pragas por cultura, 20 fotos por cultura, `culturas` até 45.000 caracteres; fotos e assinaturas até 4 MB (JPEG/PNG).
- Termo de Colheita nasce na visita, quando há coleta: uma cultura, um termo por amostra, mesma numeração.
- Painel: detecção = Detectada ou Suspeita; sem nenhuma, visita negativa.
- Fichas oficiais (citros, banana, monilíase, mandioca, soja, propriedade): modelo único `pce-ficha.html`, perguntas em `CONFIG.PCE.fichas`; uma por propriedade e modelo, gerada do cadastro e da visita mais recente. Termo: `pce-termo.html`. Cadastros e Termos antigos abrem por adaptadores em `pce-docs.js`, sem alterar o dado.
- Documentos A4 com rodapé na base de toda folha (`documento-base.js`).

## Laudo de laboratório
- Por termo: laboratório e resultado (`CONFIG.PCE.laboratorio`), datas, nº do laudo, praga (obrigatória se positivo). Lança-se só no painel (`painelPceLaudo`).
- Sync: vale o `atualizadoEm` do resultado; reenvio sem ele não apaga o do painel.
- Alertas: positivo (crítico); sem resultado após `prazoDias` (30) dias.

## Campo sem internet
- **Dados para o campo:** municípios de `CONFIG.PCE.municipios` (62) por `pceBaixarMunicipio`, máx. 5.000 por chamada; traz `Propriedades` (com `frutos`), `Pessoas` e cadastros; cada download fica em `Consultas`. Atualiza sozinho (máx. 1x/6 h). A busca de produtor funciona com o que foi baixado.
- **Apagar do aparelho** poupa pendente e produtor com Termo ou levantamento não enviado.
- Enviar ao produtor: PDF no aparelho.

## Monilíase
- Modelos: ficha de cadastro com hospedeiros (1 por propriedade), Termo de Fiscalização do PCE (não é o TF de Barreira), relatório do [convênio](convenio.md). Perguntas próprias da detecção ficam em `culturas[].dados` do Termo.
- Educação Sanitária: termos com a ação e folders/flyers digitados (nenhum = "não realizada").
- Numeração da ficha (`CadastrosPCE`): por programa, unidade e ano.

## Termo do papel
- Permissão Papel (`antigo`; exige PCE; desligada por padrão); sem ela, fica pendente. Estagiário: chave só PCE+Papel; gerente: chave de fiscal com Papel.
- Vistoriador digitado; data e hora obrigatórias, sem futuro; coordenada só no Amazonas.
- PDF escaneado: até 10 por registro, 10 MB cada, começando por `%PDF-`.
- Só Termo e Colheita se digitam; o levantamento do papel saiu. Número do papel (`007/2026/MANAUS`); aceita número livre, recusa usado; sugestão = maior + 1.

## Dados
- `Levantamentos` (antigo, não é mais criado): `pragas` (JSON: praga → culturas), `citros`, `tipoLocal`, `comercial`, `cnpj`, `empresa`, `endereco`, `uf`.
- `Colheitas`: `laboratorio` (JSON; `atualizadoEm`, `por`), `levantamentoId` (= `visitaId` nos novos), `registroAntigo`, `documentos`.
- `Propriedades`: `cnpj`, `viaAcesso`, `comercial`, `tipoPropriedade`, `endereco`, `uf`, `empresa`, `frutos` (JSON).
- `CadastrosPCE` (`programa`, `dados`); `TermosPCE` (`visitaId`, `programaVisita`, `culturas`, `cadastroId`, `propriedadeId`, `acoes`, `sintomas`, `amostra`, `plantasInspecionadas`; os três últimos derivados de `culturas`).

## Código
- Front: `web/js/` (pce, pce-cadastros, citros, moniliase, campo, pdf, `config.js`, `CONFIG.PCE`); `web/painel/js/painel-pce.js`; `web/documentos/pce-*`.
- Back: `Code.gs` (`MODULO_DA_ACAO`, `sync`), `pce.gs`, `pce-visita.gs` (Termo da visita, `visitasPce_`), `pce-frutos.gs`.
- Uma vez por planilha: menu **e-GDV → Autorizar acesso ao Drive (fotos do PCE)**. Publicar: automático pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)).

## LGPD
- Sem o módulo PCE (ou aparelho revogado), dados do campo são apagados no próximo sync.
- Fotos e PDFs: Drive `GDV - Arquivos/PCE/<ano>/...`, sem compartilhamento público.
- Painel: documento mascarado; `cadastrosPce` sem testemunhas e assinaturas.
