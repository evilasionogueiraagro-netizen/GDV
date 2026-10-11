# Testes automáticos do GDV

- `fakegas.js`: executa o `apps-script/Code.gs` **real** numa VM do Node, com SpreadsheetApp, Lock, Cache, Properties, Utilities, Drive, ScriptApp, MailApp, Session e HtmlService falsos (tudo em memória). `Utilities.computeDigest` (SHA-256) é o real do Node; o Cache falso ignora o prazo de validade (`put(k, v, segundos)` guarda para sempre). Serve a API (`doPost` e as rotas de controle `/__*` usadas pelos testes) na porta **8082** e a pasta `web/` na **8081**.
- `*.js` (exceto `fakegas.js` e `run.js`): um teste cada. Os do app/painel/TV usam o Chromium via `playwright-core`; os `*_server_test.js` só falam HTTP com o fakegas.
- `tf_anexos_test.js`: fotos e assinatura na tela no TF (Drive falso em `GDV - Arquivos/TF/<ano>`), recusa, anexo fotográfico e PDF (precisa do `pypdf`, como o `tf_paginas`), QR code e `verificar.html`, índice de reincidência sem internet e permissões.
- `run.js`: executor. Roda os testes **um de cada vez**, cada um com um fakegas novo (planilha vazia).
- `lib/amb.js`: portas, URLs, pasta de saída e abertura do navegador (comum a todos os testes). `lib/relogio.js`: relógio deslocado para testes que dependem da data.
- `saida/` (fora do git): screenshots, PDFs, `logs/<teste>.log`, `logs/<teste>.fakegas.log` e `resumo.txt`.

## Rodar localmente

Precisa de Node 20+ e, para o `tf_paginas`, de `python3` com `pypdf` (`pip install pypdf`; o `tf_anexos_test` só pula a conferência das páginas do PDF sem ele).

```sh
cd tests
npm ci                                # instala o playwright-core (fixo em 1.54.2)
npx playwright-core install chromium  # baixa o Chromium dessa versão (em Linux novo: install --with-deps chromium)
node run.js                           # todos (~10 min)
node run.js tv_test painel_test       # só alguns (com ou sem .js)
node run.js -v tf_e2e                 # mostra a saída do teste ao vivo
node run.js --lista                   # lista os testes
node run.js --parte 2/3               # 2ª de 3 partes equilibradas (como no CI)
```

O executor imprime `OK`/`FALHOU` por teste, as últimas linhas da saída de quem falhou e um resumo; sai com código ≠ 0 se algum falhar. Um teste falha se terminar com código ≠ 0, imprimir uma linha com `✗` ou imprimir `FALHOU=N` com N > 0.

Variáveis de ambiente:

| Variável | Padrão | Para quê |
|---|---|---|
| `GDV_PORTA_WEB` / `GDV_PORTA_API` | 8081 / 8082 | portas do fakegas (os testes usam as mesmas) |
| `CHROMIUM_PATH` | Chromium do Playwright; senão `/opt/pw-browsers/chromium-*/chrome-linux/chrome` | navegador usado nos testes |
| `GDV_TIMEOUT` | 360 | tempo máximo de cada teste (s) |
| `GDV_TENTATIVAS` (ou `--tentativas N`) | 1 | repete quem falhar; o resumo aponta quem só passou na repetição |

Para usar o fakegas à mão (ex.: depurar um teste): `node fakegas.js` em um terminal e `node tv_test.js` em outro. Só pode haver um fakegas por vez nas mesmas portas.

## Escrever um teste novo

1. Crie `tests/<nome>_test.js` (o executor pega qualquer `.js` desta pasta). Comece com `const amb = require('./lib/amb');` e use:
   - `amb.API` (sem barra final), `amb.APP`, `amb.PAINEL`, `amb.ORIGEM` em vez de `localhost:8081/8082`;
   - `const b = await amb.lancar();` para abrir o Chromium. Nos scripts que rodam no navegador, o endereço da API é `window.__GDV_API` (ex.: `localStorage.setItem('gdv.url', window.__GDV_API)`);
   - `amb.saida('arquivo.png')` para screenshots/PDFs; `amb.RAIZ` para ler arquivos do repositório.
2. Imprima `  ✓ mensagem` / `  ✗ mensagem` por verificação e termine com código ≠ 0 se algo falhou (ex.: `process.exitCode = 1`).
3. Não dependa da data de hoje: monte datas a partir de `Date.now()` (horário de Manaus = UTC−4) e use o ano corrente. Se o teste precisar de um dia específico do mês, ponha no topo `// gdv:relogio dia=15 hora=10:00`: o executor desloca o relógio do fakegas, do teste e do navegador para esse dia do mês corrente (como faz o `rotinas_test`). Para avançar o tempo dentro de uma página, use `page.clock`.
4. O fakegas já traz a linha de turno `antigo-1` (3 dias atrás) e o fiscal "Antigo Fiscal"; as rotas `/__gerar`, `/__aba`, `/__fn`, `/__props`, `/__off`/`/__on` etc. estão no fim de `fakegas.js`.
5. Se o teste for demorado, acrescente o tempo aproximado em `PESO` no `run.js` (equilibra as partes do CI).
