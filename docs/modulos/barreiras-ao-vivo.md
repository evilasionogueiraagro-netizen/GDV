# Barreiras em andamento: alerta de TF, encerramento pela gerência e sinal

O que faz uma barreira aparecer (ou continuar) em andamento no painel. Veja também: [painel](../apps/painel.md).

## Regras
- Alerta de TF: o app avisa (`tfAndamento`) ao abrir o formulário, a cada 2 min e ao mudar procedimento ou placa. Fim: gerar, descartar ou sair. Sem aviso há mais de 10 min, o TF deixa de contar.
- Sem internet não há alerta; nada fica em fila.
- Encerrar turno (`painelEncerrarTurno`; só administrador; nunca no Modo TV): HH:MM de Manaus, sugerido pelo último veículo (ou agora). Antes do início = dia seguinte; mais de 2 h à frente = recusado.
- Encerramento da gerência não reabre: envio com `encerrado = 0` não muda turno nem fim. Veículos seguem.
- Sinal: cada aparelho envia em toda sincronização. Erro do servidor no envio: uma vez, `ping` com situacao = 'erro'.
- Último sinal da barreira: o maior entre turno, último veículo e sinal do aparelho.
- Alertas: sem sinal há mais de 30 min; turno aberto há mais de 12 h.
- Encerramento do fiscal só sai com internet e app aberto; sem sinal, fica no aparelho.
- TV em quiosque: Chrome com `--autoplay-policy=no-user-gesture-required` (som sem clique).

## Dados
- `Andamento`: `placa`, `procedimento`, `local`, `turnoId`, `lat`/`lon`, `estado`, `inicioTs`, `atualizadoTs`.
- `Turnos`: `encerradoPor`, `encerradoEm` (no fim).
- `Aparelhos`: `ultimoSinal`, `situacao` (`ok`/`erro`), `turnoAtual`, `turnosEncerradosPendentes`, `ultimoErro`; sem sinal (versão antiga) = `legado-…`.

## Código
- `web/js/tf.js`, `web/js/envio.js` (`Envio.sinal`); `web/painel/js/painel.js` (alertas, Encerrar turno).
- `Code.gs`: `tfAndamento`, `painelEncerrarTurno`, `painelDados`, `sync`, `ping`.

## LGPD
- `Andamento` não guarda CPF nem nome do fiscalizado.
