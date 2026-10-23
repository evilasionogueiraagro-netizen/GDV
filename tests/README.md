# Testes automáticos do GDV

Dois tipos: o `Code.gs` real no Node (`fakegas.js`) e as telas no Chromium (`playwright-core`). Os `*_server_test.js` só falam HTTP com o fakegas (são rápidos). O que cada área faz: [docs/README.md](../docs/README.md).

## fakegas.js
Roda `apps-script/Code.gs` **real** numa VM do Node, com `SpreadsheetApp`, `LockService`, `CacheService`, `PropertiesService`, `Utilities`, `DriveApp`, `ScriptApp`, `MailApp`, `Session`, `HtmlService` e `UrlFetchApp` falsos, em memória.
- API (`doPost` e rotas `/__*`) na porta **8082** (`GDV_PORTA_API`); `web/` na **8081** (`GDV_PORTA_WEB`).
- `Utilities.computeDigest` (SHA-256) é o real. O Cache ignora a validade: `put(k, v, segundos)` guarda para sempre.
- Rotas úteis: `/__aba?nome=` (linhas cruas), `/__planilhas`, `/__tudo` (todas as abas), `/__tokeninfo` e `/__fetches` (login Google simulado). As demais, no fim do arquivo.
- Serviço Google novo no `Code.gs` precisa existir aqui ([PORTABILIDADE.md](../docs/PORTABILIDADE.md)).
- À mão: `node fakegas.js` num terminal e `node tv_test.js` em outro (só um fakegas por vez nas mesmas portas).

## Rodar
Node 20+ e `python3` com `pypdf` (`pip install pypdf`); sem ele falham `tf_paginas`, `convenio_test`, `convfin_test`, `relgdv_test` e `vigifito_test`. `convenio_test` usa `python-docx` e, se houver, `soffice`. Para não mexer no Python do sistema, use um venv e ponha o `bin/` dele no `PATH`.

```sh
cd tests
npm ci                                # playwright-core fixo em 1.54.2
npx playwright-core install chromium  # Linux novo: install --with-deps chromium
node run.js --paralelo 4              # tudo em 4 partes ao mesmo tempo (portas 8081/8082 a 8087/8088)
node run.js                           # tudo em fila (~11 min)
node run.js tv_test painel_test       # só alguns (com ou sem .js)
node run.js -v tf_e2e                 # mostra a saída ao vivo
node run.js --lista                   # lista os testes (respeita --parte)
node run.js --parte 2/3               # 2ª de 3 partes equilibradas (o CI usa --parte N/4 --tentativas 2)
```

Opções:
- `--paralelo N` (`-j N`): N partes ao mesmo tempo, cada uma com seu fakegas. Sai com código 1 se algo falhar. Rode antes de cada push.
- `--parte i/n`: a parte `i` de `n`, dividida pelo `PESO` (abaixo).
- `--tentativas N` (ou `GDV_TENTATIVAS`, padrão 1): repete quem falhou; o resumo marca os instáveis.
- `-v`: saída ao vivo. Variáveis: `GDV_TIMEOUT` (360 s por teste), `GDV_PORTA_WEB` / `GDV_PORTA_API`, `CHROMIUM_PATH`.

Um teste falha se sair com código ≠ 0, se imprimir `✗` ou se imprimir `FALHOU=N` com N > 0.

Saída em `tests/saida/` (fora do git): capturas, PDFs e `logs/`. Para copiar as capturas de uma área: `GDV_SAIDA_<AREA>=<pasta>`, com `ADM`, `CITROS`, `CONVENIO`, `CONVFIN`, `MONILIASE`, `PUBLICO`, `RELGDV` ou `VIGIFITO`. `GDV_RELGDV_SO_SERVIDOR=1` roda só o servidor do Relatório GDV.

## Testes por área
Principais (a lista completa é `node run.js --lista`):
- `arquivo_test`: arquivamento anual (planilhas `e-GDV – Arquivo AAAA`).
- `tf_anexos_test`: fotos, assinatura, PDF e QR code do TF; reincidência; permissões.
- `pce_campo_test`: PCE em campo (download por município, consulta sem internet, mapa).
- `pce_moniliase_test`: PCE de monilíase (papel, termos, PDFs, relatório).
- `pce_citros_test`: citros e a visita completa (cadastro, termo, PDF).
- `pce_laudo_test`: resultado de laboratório, no app e no painel (`painelPceLaudo`).
- `publico_test`: dashboard público (`web/dashboard/`).
- `convenio_test`: aba Convênios (`painelConv*`), relatório em PDF e Word.
- `convfin_test`: importação da planilha de movimentação (`painelConvFinImportar`).
- `relgdv_test`: Relatório GDV (`painelRelGdv*`).
- `vigifito_test`: VIGIFITO, central de relatórios e app de campo.
- `adm_test`: Portal do Administrativo (`adm*`, `painelAdm*`).
- `lib/portal.js`: libera uma pessoa no portal e abre a sessão (usado pelos testes do portal).
- `lib/usuarios.js`: cria contas (`fiscal`, `criar`), troca permissões, revoga sessões e semeia o navegador com o login (substitui os códigos de ativação).

## Escrever um teste novo
1. Crie `tests/<nome>_test.js` (o `run.js` pega todo `.js` da pasta, exceto `fakegas.js` e `run.js`). Comece com `const amb = require('./lib/amb');`:
   - `amb.API` (sem barra final), `amb.APP`, `amb.PAINEL`, `amb.ORIGEM`, em vez de `localhost:8081/8082`;
   - `const b = await amb.lancar();` para o Chromium. Na página, a API está em `window.__GDV_API`;
   - `amb.saida('arquivo.png')` para capturas e PDFs; `amb.RAIZ` para o repositório.
2. Imprima `  ✓ mensagem` ou `  ✗ mensagem` por verificação; termine com `process.exitCode = 1` se algo falhar.
3. Não dependa da data de hoje: use `Date.now()` (Manaus = UTC−4) e o ano corrente. Dia fixo do mês: `// gdv:relogio dia=15 hora=10:00` no topo (fakegas, teste e navegador usam esse dia). Para avançar o tempo na página: `page.clock`.
4. O fakegas já traz a linha de turno `antigo-1` (3 dias atrás) e o fiscal "Antigo Fiscal".
5. Confira pelas actions (HTTP): é o que o porte também roda. Com `/__aba`, ache a coluna pelo nome em `TABELAS`, não por índice. O que só existe no Google (Drive, gatilhos, `LockService`) fica em teste ou trecho separado, para o porte marcar "não se aplica".
6. Demorou ou mudou muito de tempo? Atualize o `PESO`.

## PESO (run.js)
Objeto `PESO` em `tests/run.js`: segundos aproximados de cada teste, medidos no CI, só para dividir as partes de forma equilibrada (`--parte`, `--paralelo`). Teste sem entrada conta 60 s.

## CI
`testes.yml` roda 4 partes (`--parte N/4 --tentativas 2`) em cada PR e push para a `main`. Branch sem PR: Actions → Testes automáticos → Run workflow. O back só é publicado se as 4 partes passam ([PUBLICACAO-BACK.md](../docs/PUBLICACAO-BACK.md)).
