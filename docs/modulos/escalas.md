# Escalas de plantão

A coordenação monta no app a equipe de cada BVA por período; a gerência vê e edita no painel.

- Permissão `coordenacaoBarreiras` (módulo `escala`). Aba `Escalas`: BVA, início, fim, `fiscais` JSON `[{id, nome}]`.
- Fim sugerido pelo regime da BVA (N dias, com ou sem troca no último dia; 12×36; 8 h; ajustável). "Gerar períodos" cria rascunhos até o fim do convênio. Fiscal sem login: `{nome, semLogin}`.
- Rascunho → publicada (só esta vale). Excluir lógico; `HistoricoDeAlteracoes`. Avisa (sem bloquear) fiscal em duas BVAs e período sobreposto.
- Actions: `escala*` (app) e `painelEscala*` (gravar: gerência). App: lista abre da meta `escalaDados`.
- Sync: `minhasEscalas` → aviso na tela inicial e BVA proposta no turno. `escalasDaBva` (sem nomes): BVA fixa com escala do dia só aceita turno (abrir, entrar) de quem está nela; coordenação e gerência livres. Painel: escala de hoje × turnos ("fora da escala").
- Portal: cada fiscal da escala publicada fica pendente de diárias até a PCDP concluída (`EscalaPcdp`, `admEscalas`/`admEscalaPcdp`).
- Equipe: `equipeNumero` e `responsavel` (id ou `nome:…`). Relatório da equipe (convênio 1.10, `relatorio-equipe.gs`, aba `RelatoriosEquipe`): turnos da BVA no período com alguém da escala. Veem equipe e coordenação; editam responsável, coordenação, gerência. PDF `rel-equipe.html`; Termo de Repasse `termo-repasse.html`.
