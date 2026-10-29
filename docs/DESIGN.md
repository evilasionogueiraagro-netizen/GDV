# Design system do e-GDV

Um visual só para todas as telas: app de campo, painel e Modo TV, Portal do Administrativo, dashboard público, página
inicial, manual e verificação de TF. Os modelos de documento impressos (`web/documentos/`) ficam de fora. A base é a do
painel. Vale para pessoas e agentes: tela nova ou mudança de tela segue isto.

## Princípios

- **Sem emojis.** Nenhum emoji em interface, documento gerado, código ou texto. O teste `tests/sem_emoji_test.js` falha se
  aparecer um em `web/` (fora de `vendor/`). Símbolos tipográficos de texto (✓ ✕ ☐ ☑ ❚) são permitidos.
- **Ícones: uma biblioteca só: Lucide, versão 1.52.0, guardada em `web/js/icones.js`** (licença ISC em
  `web/vendor/lucide/LICENSE`). Cópia fiel dos desenhos, sem CDN (o app de campo funciona sem internet). Nenhum ícone
  desenhado à mão: sem correspondente exato, use o mais próximo da Lucide.
- **Texto sempre junto.** O ícone ajuda a achar, o texto diz o que é. Estado nunca só por cor nem só por ícone
  (ex.: "Pendente" escrito ao lado do relógio).
- **Claro e escuro** em todas as telas, pelos tokens. Nunca cor fixa em CSS de tela.
- **Toque.** No celular o alvo tem pelo menos 44 px: a classe `toque` no `<body>` (app de campo, manual, verificação)
  liga a densidade de toque (controles e botões maiores, letra de 16 px).
- **Contraste.** Texto e ícone legíveis nos dois temas. O azul da marca some no escuro: use `--destaque` e `--link`,
  que já trocam para o azul claro.
- **Modo TV.** Letras e espaços em `vh`/`vw`, definidos no próprio `painel.css` (`body.tv`); 1080p e 4K sem rolagem.

## Onde ficam as regras

`web/css/design.css` é a base de todas as telas e **vem antes** de qualquer outro CSS no `<head>`. O CSS de cada tela só tem
o arranjo próprio (grades, mapa, gráficos, menu, Modo TV) e usa os tokens. Não redefina cor, tipografia nem componente
numa tela: se faltar algo, acrescente em `design.css`. O `tests/design_test.js` confere que toda tela carrega o
`design.css` primeiro, que ele está nos `ARQUIVOS` dos service workers (`web/sw.js` e `web/painel/sw.js`), que nenhum
outro arquivo redefine os tokens de cor e que não há `<svg>` à mão.

Tela nova: `<link rel="stylesheet" href="…/css/design.css">` antes do CSS dela; se precisar funcionar offline, o arquivo
já está nos `ARQUIVOS`.

## Tokens (todos em `:root` de `design.css`, com versão clara e escura)

- **Marca e ação:** `--marca`, `--marca2`, `--acao` (+ `--acao-hover`), `--destaque` (texto de destaque), `--link`.
- **Superfície e texto:** `--pg` (fundo), `--sf` e `--sf2` (superfícies), `--sel` (selecionado), `--ink`, `--ink2`, `--mut`
  (texto), `--grade` e `--base` (linhas), `--borda`, `--sombra`, `--sombra-alta`.
- **Status:** `--bom`, `--atencao`, `--serio`, `--critico`, `--sucesso`, `--perigo`, `--bom-txt`, `--atencao-txt`.
  **Gráficos e mapas:** `--s1` a `--s8`, `--q1` a `--q5`, `--mapa-*`.
- **Tipografia:** `--fonte`, `--fonte-mono`, escala `--t-xs` (12) a `--t-2xl` (26), pesos `--peso-medio`/`--peso-forte`.
- **Espaçamento, raio, foco:** `--e1` a `--e5` (4 a 24 px), `--r-sm` a `--r-pill`, `--foco` (anel de 3 px em todo
  `:focus-visible`).
- **Tamanho de controle:** `--ctl-*`, `--btn-*`, `--alvo`; a classe `toque` troca para a densidade de toque.

## Componentes (classe canônica; os apelidos antigos de cada tela usam a mesma regra)

| Componente | Canônica | Apelidos |
|---|---|---|
| Botão secundário / principal / perigo / confirmação / compacto | `.btn` / `.btn-prim` / `.btn-perigo` / `.btn-ok` / `.btn-mini` | `.pn-btn`, `.pn-btn-prim`, `.pn-botao`, `.botao`, `.botao.sec`, `.mini`, `.editar`, `.excluir`, `.tfbtn` |
| Campo de texto, lista, área | `input`, `select`, `textarea` (estilo base automático) | sem classe |
| Rótulo sobre o campo / caixa de seleção | `.campo` / `.chk` | `label` dentro de `.toque` |
| Cartão | `.cartao` | `.pn-cartao`, `.card`, `.item`, `.pn-kpi` |
| Tabela | `.tabela` | `.pn-tab table` |
| Aviso | `.aviso` (atenção), `.aviso-ok`, `.aviso-erro`, `.aviso-info` | `.tf-novo`, `.tf-ok`, `.tf-alerta`, `.pn-erro` |
| Mensagem rápida | `.toast` (`.erro`) | `#toast`, `.pn-toast` |
| Selo de situação | `.selo` (`.critico`, `.serio`, `.atencao`, `.bom`, `.info`) | `.pn-selo` |
| Barra do topo | `.barra-topo` (`.barra-topo-grande` nas páginas públicas) | `.pn-topo` |

Código novo usa a classe canônica. Botão e campo: ao lado do texto vai um ícone, nunca emoji.

## Como usar os ícones

```js
icone('salvar')                         // decorativo (aria-hidden): o texto ao lado diz o que é
icone('fechar', { rotulo: 'Fechar' })   // ícone é o único rótulo: role="img" + <title>
icone('carro', { tamanho: 28 })         // tamanho em px (padrão 1.25em, acompanha a fonte)
```

- Em template literal: `` `<button>${icone('salvar')} Salvar</button>` ``.
- Em HTML estático: `<span data-icone="sincronizar"></span>` (o módulo troca pelo SVG ao carregar).
- Em CSS (pseudo-elemento): `mask: var(--ico-check)`.
- A página que usa ícone carrega `js/icones.js` (ou `../js/icones.js`) antes dos scripts que o usam.
- Alinhamento com o texto: classe `.ico` (em `design.css`).

**Nomes disponíveis** (em português; cada um aponta para um ícone da Lucide, citado no comentário da linha em
`icones.js`): administrativo, alerta, amostra, anexo, assinatura, baixar, bloqueio, broto, busca, camera, caminhao,
caminhao-bau, carro, celular, check, chave, citros, compartilhar, dica, documento, editar, enviar, externo, fechar,
formulario, historico, imprimir, info, inicio, lista, lixeira, local, manual, mapa, mais, moto, offline, ok, online,
onibus, parar, pausa, pendente, pessoa, praga, proibido, propriedade, publico, resumo, rota, sair-tela-cheia, salvar,
seta-baixo, seta-cima, sincronizar, status, sugerir, tela-cheia, telefone, utilitario, voltar.

**Ícone novo:** escolha em <https://lucide.dev/icons>, copie os elementos do SVG da **mesma versão** para
`web/js/icones.js` (ordem alfabética, nome em português, nome da Lucide no comentário) e acrescente o nome acima. Trocar de
versão: baixe `lucide-static` (`npm pack lucide-static@X`, versão com pelo menos 2 semanas), atualize `icones.js`,
`web/vendor/lucide/LICENSE` e esta página; o `design_test` confere que as três dizem a mesma versão.

## Não fazer

- Emoji, inclusive em `alert()`, título de página, PDF ou mensagem copiada para WhatsApp.
- Ícone desenhado à mão, imagem de ícone, fonte de ícone, CDN ou segunda biblioteca.
- Ícone sem texto quando o significado não é universal (fechar e voltar podem ser só ícone, com `rotulo`).
- Cor fixa (`#0B3A82`) ou token redefinido em CSS de tela; botão, campo ou cartão com estilo próprio duplicado.
- Alvo de toque abaixo de 44 px no celular.
