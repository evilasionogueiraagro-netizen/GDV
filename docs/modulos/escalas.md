# Escalas de plantão

A coordenação monta no app a equipe de cada BVA por período; a gerência vê e edita no painel.

- Permissão `coordenacaoBarreiras` (módulo `escala`). Aba `Escalas`: BVA, início e fim livres, `fiscais` JSON `[{id, nome}]`.
- Rascunho → publicada (só esta vale). Excluir lógico; `HistoricoDeAlteracoes`. Avisa (sem bloquear) fiscal em duas BVAs e período sobreposto.
- Actions: `escala*` (app) e `painelEscala*` (gravar: gerência).
- Sync: `minhasEscalas` → aviso na tela inicial e BVA proposta no turno. Painel: escala de hoje × turnos ("fora da escala").
- Portal: cada fiscal da escala publicada fica pendente de diárias até a PCDP concluída (`EscalaPcdp`, `admEscalas`/`admEscalaPcdp`).
- Código: `escalas.gs`, `escala.js`, `painel-escalas.js`, `adm-escalas.js`.
