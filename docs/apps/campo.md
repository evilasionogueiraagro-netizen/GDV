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
- Pessoas por veículo: digitadas pelo fiscal (educação sanitária), sem sugestão.
- Origem e destino opcionais, só UF (`Veiculos.ufOrigem`/`ufDestino`).
- Volante de educação sanitária: `Turnos.soPessoas = 1`, contador `Turnos.pessoasEducacao`, sem veículos; marcado em `CONFIG.volantesSoPessoas` (hoje TABATINGA). Conta em VIGIFITO, painel, relatório, dashboard e convênio (1.9).
- Excluir é lógico. "Limpar histórico" só remove turnos encerrados e enviados.
- BVAs: `CONFIG.bvas` + as cadastradas no painel (aba `BVAs`, `bvas.gs`; sync `bvas`, `CONFIG.aplicarBvas`); nome fixo, desativar esconde.
- Cancelar turno: só o dono, sem TF. Fica na planilha (`cancelado = 1`, veículos excluídos), fora de tudo (`lerLeitura_`); não volta.
- Ficha: 50 veículos por folha (`CONFIG.linhasFicha`); o Termo conta todos.

## Acesso
- Só matrícula e senha (`entrar`, app `campo`). Internet só para entrar, trocar a senha e sair. Token `u.…` em `gdv.key`, usuário em `gdv.usuario`, `gdv.nome` é o Fiscal 1; vale offline até sair ou ser revogado. Credencial sem token `u.` (versão antiga) é apagada e pede login.
- `trocarSenha: 1` (em qualquer chamada): nada abre nem sobe até trocar a senha (`gdv.revogado = 'senha'`, mínimo 8).
- Servidor recusou ("revogado", "inválido", "Entre com sua matrícula e senha."): `gdv.revogado = '1'` e pede o login; os pendentes ficam no IndexedDB e sobem depois dele.
- Módulo sem permissão some do menu; o pendente dele fica guardado.
- Sair: não com turno aberto; tenta enviar e confirma se sobrar pendente. Pendente é de quem o fez: outra pessoa não o envia (meta `retidos`).

## Código
- `web/js/` (`login.js`: Entrar, Trocar senha, Sair; `sync.js`: sessão). Testes: `login_campo_test`, `permissoes_campo_test`; contas em `tests/lib/usuarios.js`.

## Envio
- Android: sobe com o app fechado (`gdv-enviar`). iPhone: só com o app aberto e internet. Reenvio é seguro (id idempotente). Sessão revogada: o envio para e o app pede o login ao abrir.
