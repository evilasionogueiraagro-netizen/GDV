# Módulo PCE (Programa de Controle e Erradicação)

Levantamento, termos, citros, monilíase, laudo e campo sem internet; usado por fiscais e painel. Veja também: [acessos](acessos.md), [API](../API.md).

## Levantamento e Termo
- Dados gerais uma vez por visita; card por praga (`CONFIG.PCE.pragas` ou "Outra") com culturas (área, resultado, coleta, fotos).
- Limites: 20 pragas, 40 culturas, 60 fotos por levantamento; fotos e assinaturas até 4 MB (JPEG/PNG).
- Não salva: cultura sem praga ou resultado; praga ou cultura repetida; "Outra" sem nome; foto sem cultura.
- Produtor que não assina: foto dele com documento oficial com foto; sem ela, não salva.
- PDF: uma ficha por praga, só com suas culturas.
- Painel: detecção = Detectada ou Suspeita; sem nenhuma, levantamento negativo.
- Termo de Colheita: uma cultura, um termo por amostra; numeração por unidade e ano.
- Ao salvar, o levantamento atualiza `Pessoas` e `Propriedades` (CNPJ, empresa, endereço, UF).

## Citros
- Bloco "Cultura do citros" se houver praga de `CONFIG.PCE.citros.pragas` ou "Outra" com termo de `CONFIG.PCE.citros.termos`.
- Obrigatório: Ausência ou Presença de HLB, Ácaro Hindustânico e Cancro Cítrico (senão não salva). Diaphorina não marca HLB.
- Não comercial: só itens 1, 4 e 5 do papel.
- Cadastro e Termo de citros: `CONFIG.PCE.citros.frases` e `.enquadramento`.

## Laudo de laboratório
- Por termo: laboratório e resultado (`CONFIG.PCE.laboratorio.laboratorios`, `resultados`), datas, nº do laudo, praga (obrigatória se positivo), observação.
- Lança-se no app ou no painel (`painelPceLaudo`); PDF não muda.
- Sync: vale o `atualizadoEm` do resultado; reenvio sem ele não apaga o do painel.
- Alertas: positivo (crítico); sem resultado após `CONFIG.PCE.laboratorio.prazoDias` (30) dias.

## Campo sem internet
- **Dados para o campo** (`pcecampo`): municípios de `CONFIG.PCE.municipios` (62) por `pceBaixarMunicipio`, máx. 5.000 por chamada; traz `Propriedades` e `Pessoas`; cada download fica registrado em `Consultas`. Atualiza sozinho (com PCE; máx. 1x/6 h).
- **Apagar do aparelho** poupa pendente e produtor com levantamento ou termo não enviado.
- **Perto de mim** (`pcemapa`): vermelho = nunca ou último há mais de 180 dias; amarelo = último com detecção/suspeita; verde = sem detecção em 180 dias.
- **Rota** (`pcerota`, abre no Google Maps). **Enviar ao produtor**: PDF no aparelho.

## Monilíase
- Modelos: Cadastro de imóvel com hospedeiros (1 por propriedade), Termo de Fiscalização do PCE (1 por visita; não é o TF de Barreira), relatório do [convênio](convenio.md).
- Coordenadas fora do Amazonas: recusadas.
- Educação Sanitária: termos com a ação e folders/flyers digitados (nenhum = "não realizada").
- Numeração: Termo por unidade e ano, uma sequência para todas as pragas (`001.2026.AUTAZES`); Cadastro por programa, unidade e ano. Com internet: `pceDocNumero` + `pceDocRegistrar` (sob lock); sem: provisório (último + 1), `conflito = 1` se repetir.

## Registro antigo (papel)
- Permissão Papel (`antigo`; exige PCE; desligada por padrão); sem ela, fica pendente. Estagiário: chave só PCE+Papel; gerente: chave de fiscal com Papel.
- Vistoriador digitado; data e hora obrigatórias, sem futuro; coordenada só dentro do Amazonas (lat −10…+3, lon −74…−56).
- PDF escaneado: até 10 por registro, 10 MB cada, começando por `%PDF-`.
- Termo antigo: número do papel (`007/2026/MANAUS`); aceita número livre, recusa usado; sugestão = maior + 1.

## Dados
- `Levantamentos`: `pragas` (JSON: praga → culturas), `citros`, `tipoLocal` e `origemVisita` (opcionais), `cnpj` (14 dígitos ou vazio), `empresa`, `endereco`, `uf`, `registroAntigo`, `documentos`.
- `Colheitas`: `laboratorio` (JSON; `atualizadoEm`, `por`), `registroAntigo`, `documentos`.
- `Propriedades`: `cnpj`, `viaAcesso`, `comercial`, `tipoPropriedade`, `endereco`, `uf`, `empresa`.
- `CadastrosPCE` (`programa`, `dados`); `TermosPCE` (`cadastroId`, `propriedadeId`, `acoes`, `sintomas`).

## Código
- Front: `web/js/` (pce, citros, moniliase, campo, pdf, `config.js`, `CONFIG.PCE`); `web/painel/js/painel-pce.js`; `web/documentos/pce-*`.
- Back, `apps-script/Code.gs`: `MODULO_DA_ACAO`, `identLev_`; actions `pceConsultar`, `pceEmitir`, `pceProximoNumero`, `painelDados`, `arquivoEnviar`.
- Uma vez por planilha: menu **e-GDV → Autorizar acesso ao Drive (fotos do PCE)**. Publicar: automático pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)).

## LGPD
- Sem o módulo PCE (ou aparelho revogado), dados do campo são apagados no próximo sync.
- Fotos e PDFs: Drive `GDV - Arquivos/PCE/<ano>/...`, sem compartilhamento público.
- Painel: documento mascarado; `cadastrosPce` sem testemunhas e assinaturas.
