# PCE: que praga vale em que cultura

Regra usada na escolha de pragas da visita: `CONFIG.PCE.hospedeiros` (web/js/config.js) e ligações do catálogo
(`CATALOGO_PCE_BASE_`). Praga listada só aparece nas culturas abaixo ou nas que a gerência ligar no painel. Registro antigo
fora da regra continua abrindo. Pesquisa de 03/11/2026; a [planilha da GDV](pce-legislacao.csv) prevalece sobre a pesquisa e é a fonte da legislação dos Termos. Ao mudar norma ou lista, atualize a tabela e a fonte.

| Praga | Culturas aceitas | Base |
|---|---|---|
| Mosca-da-carambola (*Bactrocera carambolae*) | carambola, goiaba, manga, acerola, caju, jaca, pitanga, jambo, taperebá, sapotilha, abiu, araçá-boi, biribá, fruta-pão, tomate, pimenta, mamão, maracujá, citros. **Banana não** | [EPPO](https://gd.eppo.int/taxon/BCTRCB/hosts): 110 hospedeiros, nenhum *Musa*; lista da barreira (`TF.grupos.mosca`); [New Hosts in Brazil](https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/989621/1/CPAFAP2014NewhostsofBactrocera.pdf) |
| Ácaro hindustânico | citros, coco | [IN MAPA 38/2018](https://idaf.es.gov.br/Media/idaf/Documentos/Legislação/GEDSIV/SDSV/Instrução%20Normativa%20MAPA%20n°%2038,%20de%201%20de%20outubro%20de%202018.pdf). Em campo na América do Sul, só citros ([Embrapa](https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1040968/1/CPAFRR2015ElisangelaOacarohindustanicodoscitros.pdf)) |
| HLB e Diaphorina citri | citros | [Portaria MAPA 317/2021](https://fpagropecuaria.org.br/2021/05/25/boletim-dou-25-de-maio-2/?pdf=33456) (também murta, que não é cultura do catálogo) |
| Cancro cítrico | citros | [Protocolo IPPC](https://assets.ippc.int/static/media/files/publication/es/2016/08/DP_06_2014_Es_2016-08-10_LRGreviewed.pdf): *Citrus*, *Fortunella*, *Poncirus* |
| Pinta preta e leprose | citros | modelo de papel do cadastro de citros |
| Fusariose R4T, Moko e Sigatoka negra | banana | modelo de papel; [Agrodefesa](https://goias.gov.br/agrodefesa/programa-de-banana/). Moko também em *Heliconia*, que não é cultura do catálogo |
| Monilíase | cacau, cupuaçu, herrania, cacauí, cupuí, macambo | [Manual PNPV](https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/sanidade-vegetal/planos-de-contingencia-pragas-ausentes/copy_of_ManualPNPVMonilasev1.32023.docx.pdf): *Theobroma* e *Herrania* |
| Vassoura-de-bruxa | mandioca | [Embrapa, via Notícias Agrícolas](https://www.noticiasagricolas.com.br/noticia/382886): sem outros hospedeiros no Brasil |
| Ferrugem asiática | soja | [planilha da GDV](pce-legislacao.csv) |
| *Amaranthus palmeri* | soja, milho, algodão | [planilha da GDV](pce-legislacao.csv). A [Portaria SDA 1.119/2024](https://adepara.pa.gov.br/sites/default/files/DDIV-DOCUMENTOS/DDIV-DOCUMENTOS_FEDERAIS/PORTARIA%20SDA_MAPA%20N%C2%BA%201.119%2C%20DE%2020%20DE%20MAIO%20DE%202024%20-%20Amarantus.pdf) fala em talhão de qualquer espécie: em outra cultura, usar "Outra" |

## A confirmar com a GDV

- A Portaria 776/2025 (mosca-da-carambola) não lista os hospedeiros no texto lido; a lista oficial é citada como Portaria 25/1999, não localizada.
- Os modelos de papel de citros ainda citam a Portaria 317/2021; a planilha da GDV usa a 1.326/2025.
- A Portaria 865/2023, citada no modelo de soja, não foi localizada.
