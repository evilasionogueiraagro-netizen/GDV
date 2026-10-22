# App de campo (fiscais nas barreiras)

App do fiscal (`web/`). Veja: [TF](../modulos/tf.md), [barreiras](../modulos/barreiras-ao-vivo.md), [acessos](../modulos/acessos.md).

## Regras
- Offline primeiro (IndexedDB). Sobe ao voltar a internet, após cada registro, a cada 20 s com turno aberto (1 min sem).
- Entre aparelhos vence o `atualizadoEm` mais novo; o encerramento sempre chega à planilha.
- Turno: horários do relógio do aparelho (data e hora automáticas); encerrado não reabre. Letra do TF: início 04:00–11:59 = A, demais = B.
- Fiscais: um dos dois campos de nome é obrigatório.
- GPS (`latIni`…`precFim`) é opcional; o Termo usa a final, ou a inicial.
- Localização: pedida ao entrar e depois só em turno (início/fim), posto volante e GPS do PCE; leitura de até 2 min é reaproveitada.
- Posto fixo: `CONFIG.bvas`. Volante: endereço da coordenada (Nominatim).
- Placa obrigatória só onde `placa: true` (hoje CEASA); senão `Turnos.semPlaca = 1`.
- Pessoas por veículo: estimativa por tipo em `CONFIG`, editável.
- Origem e destino opcionais, só UF (`Veiculos.ufOrigem`/`ufDestino`).
- Volante de educação sanitária: `Turnos.soPessoas = 1`, contador `Turnos.pessoasEducacao`, sem veículos; marcado em `CONFIG.volantesSoPessoas` (hoje TABATINGA). Conta em VIGIFITO, painel, relatório, dashboard e convênio (1.9).
- Excluir é lógico. "Limpar histórico" só remove turnos encerrados e enviados.
- Ficha: 50 veículos por folha (`CONFIG.linhasFicha`); o Termo conta todos.

## Acesso
- Entra com matrícula e senha (`entrar`, app `campo`, precisa de internet). Token `u.…` em `gdv.key`; usuário em `gdv.usuario`; `gdv.nome` vira o Fiscal 1. Depois funciona sem internet até sair ou ser revogado.
- `trocarSenha: 1` (no `entrar` ou em qualquer chamada): nada abre nem sobe até trocar a senha (`gdv.revogado = 'senha'`, mínimo 8).
- Servidor recusou ("revogado", "inválido", "Entre com sua matrícula e senha."): `gdv.revogado = '1'` e pede a entrada; os registros ficam no aparelho.
- Sair: precisa de internet, não com turno aberto; tenta enviar, e se sobrar pendente explica e confirma. Pendente é de quem o fez: quem entra depois não o envia (meta `retidos`); sobe quando a dona entrar de novo.
- Transição: aparelho ativado pelo código antigo (`ativar`, sem token `u.`) segue sem login. Desligados os acessos antigos, apagar o código do app (`gdv.semCodigo`, `#fAtivar`).

## Código
- `web/js/`: `app.js`, `login.js` (Entrar, Trocar senha, Sair), `campo.js`, `tf.js`, `pce.js`, `sync.js` (sessão), `envio.js` (também no `sw.js`; `retidosDeOutros`), `store.js`, `config.js`.
- `Code.gs`: actions `entrar`, `trocarSenha`, `sair`, `ativar`, `sync`. Teste: `login_campo_test`.

## Envio
- Android: sobe com o app fechado (`gdv-enviar`). iPhone: só com o app aberto e internet. Reenvio é seguro (id idempotente). Credencial revogada: o envio para e o app pede para entrar de novo ao abrir.
