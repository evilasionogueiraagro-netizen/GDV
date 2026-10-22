# App de campo (fiscais nas barreiras)

App do fiscal (`web/`). Veja: [TF](../modulos/tf.md), [barreiras](../modulos/barreiras-ao-vivo.md), [acessos](../modulos/acessos.md).

## Regras
- Offline primeiro (IndexedDB). Sobe ao voltar a internet, após cada registro, a cada 20 s com turno aberto (1 min sem).
- Entre aparelhos vence o `atualizadoEm` mais novo; o encerramento sempre chega à planilha.
- Turno: horários do relógio do aparelho (data e hora automáticas); encerrado não reabre. Letra do TF: início 04:00–11:59 = A, demais = B.
- Fiscais: um dos dois campos de nome é obrigatório.
- GPS (`latIni`…`precFim`) é opcional; o Termo usa a final, ou a inicial.
- Localização: pedida na ativação e depois só em turno (início/fim), posto volante e GPS do PCE; leitura de até 2 min é reaproveitada.
- Posto fixo: `CONFIG.bvas`. Volante: endereço da coordenada (Nominatim).
- Placa obrigatória só onde `placa: true` (hoje CEASA); senão `Turnos.semPlaca = 1`.
- Pessoas por veículo: estimativa por tipo em `CONFIG`, editável.
- Origem e destino opcionais, só UF (`Veiculos.ufOrigem`/`ufDestino`).
- Volante de educação sanitária: `Turnos.soPessoas = 1`, contador `Turnos.pessoasEducacao`, sem veículos; marcado em `CONFIG.volantesSoPessoas` (hoje TABATINGA). Conta em VIGIFITO, painel, relatório, dashboard e convênio (1.9).
- Excluir é lógico. "Limpar histórico" só remove turnos encerrados e enviados.
- Ficha: 50 veículos por folha (`CONFIG.linhasFicha`); o Termo conta todos.

## Código
- `web/js/`: `app.js`, `campo.js`, `tf.js`, `pce.js`, `sync.js`, `envio.js` (também no `sw.js`), `store.js`, `config.js`.
- `Code.gs`: actions `ativar`, `sync`.

## Envio
- Android: sobe com o app fechado (`gdv-enviar`). iPhone: só com o app aberto e internet. Reenvio é seguro (id idempotente). Credencial revogada: o envio para e o app pede novo código ao abrir.
