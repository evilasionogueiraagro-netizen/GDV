# Design system do e-GDV

Regras visuais comuns ao app de campo, ao painel, ao Portal do Administrativo e às páginas públicas. Vale para pessoas e
agentes: tela nova ou mudança de tela segue isto.

## Princípios

- **Sem emojis.** Nenhum emoji em interface, documento gerado, código ou texto. O teste `tests/sem_emoji_test.js` falha se
  aparecer um em `web/` (fora de `vendor/`). Símbolos tipográficos de texto (✓ ✕ ☐ ☑ ❚) são permitidos.
- **Ícone só do módulo de ícones** (`web/js/icones.js`): SVG de traço, grade 24x24, sem preenchimento, traço 2,
  pontas arredondadas, cor herdada do texto (`currentColor`). Nada de imagem de ícone, fonte de ícone nem CDN.
- **Texto sempre junto.** O ícone ajuda a achar, o texto diz o que é. Estado nunca só por cor nem só por ícone
  (ex.: "Pendente" escrito ao lado do relógio).
- **Claro e escuro.** Use os tokens de cor (abaixo), nunca cor fixa. Confira as duas versões.
- **Toque.** No app de campo, alvo de toque com pelo menos 44px de altura (o fiscal usa no sol, em pé, às vezes com luva).
- **Contraste.** Texto e ícone com contraste suficiente nos dois temas (azul da marca some no fundo escuro: no escuro use
  o azul claro da paleta).

## Como usar os ícones

```js
icone('salvar')                         // decorativo (aria-hidden): o texto ao lado diz o que é
icone('fechar', { rotulo: 'Fechar' })   // ícone é o único rótulo: role="img" + <title>
icone('carro', { tamanho: 28 })         // tamanho em px (padrão 1.25em, acompanha a fonte)
```

- Em template literal: `` `<button>${icone('salvar')} Salvar</button>` ``.
- Em HTML estático: `<span data-icone="sincronizar"></span>` (o módulo troca pelo SVG ao carregar).
- Em CSS (pseudo-elemento): `mask: var(--ico-check)`.
- Páginas que carregam o módulo: `web/index.html`, `web/painel/index.html`, `web/administrativo/index.html`,
  `web/verificar.html`, `web/manual.html`. Página nova que usa ícone: inclua `js/icones.js` (ou `../js/icones.js`) antes
  dos scripts que o usam e, se precisar funcionar offline, na lista `ARQUIVOS` do service worker.
- Alinhamento: classe `.ico` (em `web/css/app.css` e `web/painel/css/painel.css`).

**Ícones disponíveis:** alerta, amostra, anexo, assinatura, baixar, bloqueio, broto, busca, camera, caminhao,
caminhao-bau, carro, celular, check, chave, citros, compartilhar, dica, documento, editar, enviar, externo, fechar,
formulario, historico, imprimir, info, inicio, lista, lixeira, local, manual, mapa, mais, moto, offline, ok, online,
onibus, parar, pausa, pendente, pessoa, praga, proibido, propriedade, resumo, rota, salvar, seta-baixo, seta-cima,
sincronizar, status, sugerir, telefone, utilitario, voltar.

**Ícone novo:** desenhe na grade 24x24 só com traço (paths simples, sem `fill`), acrescente em `web/js/icones.js` em ordem
alfabética e nesta lista.

## Cores (tokens)

- App de campo: variáveis em `:root` de `web/css/app.css` (ex.: `--azul`, `--azul2`), com o tema escuro no mesmo arquivo.
- Painel, portal, dashboard e página inicial: variáveis em `:root` de `web/painel/css/painel.css` (ex.: `--marca`,
  `--marca2`, `--sf`, `--ink`, `--ink2`, `--mut`, `--borda`, `--critico`), claro e escuro.
- Não crie paleta nova numa tela: se faltar uma cor, acrescente o token no arquivo de tokens com as duas versões.

## Não fazer

- Emoji, inclusive em `alert()`, título de página, PDF ou mensagem copiada para WhatsApp.
- Ícone sem texto quando o significado não é universal (fechar e voltar podem ser só ícone, com `rotulo`).
- Cor fixa (`#0B3A82`) em CSS de tela: use o token.
- Biblioteca de ícones externa ou fonte de ícones.
