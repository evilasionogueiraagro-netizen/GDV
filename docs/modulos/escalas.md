# Escalas de plantão

A coordenação de barreira e trânsito monta no app a equipe de cada BVA por período; a gerência vê e edita no painel (aba Escalas).

- Permissão `coordenacaoBarreiras` (módulo `escala`). Aba `Escalas`: BVA, início e fim livres, `fiscais` JSON `[{id, nome}]`.
- Rascunho → publicada (só a publicada chega ao fiscal). Excluir é lógico; tudo em `HistoricoDeAlteracoes`. Avisos sem bloqueio: fiscal em duas BVAs, período sobreposto.
- Actions: `escalaDados`/`escalaSalvar`/`escalaExcluir` (app) e `painelEscalas`/`painelEscalaSalvar`/`painelEscalaExcluir` (gravar: gerência).
- Sync: `minhasEscalas` → aviso na tela inicial e BVA proposta no turno. Painel: escala de hoje × turnos ("fora da escala").
- Código: `escalas.gs`, `escala.js`, `painel-escalas.js`.
