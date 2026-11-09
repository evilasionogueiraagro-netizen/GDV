# Decisões: PCE simplificado

O PCE passa a ser produtor, frutos e Termos. Regras em [../modulos/pce.md](../modulos/pce.md). Situação: no código.

| Data | Decisão | Por quê |
|---|---|---|
| 06/11/2026 | O PCE é só cadastro do produtor, frutos da propriedade e Termos. A visita é o Termo, um por programa; todo Termo tem número e PDF | o Termo é o documento que importa; o levantamento repetia as mesmas perguntas |
| 06/11/2026 | O levantamento deixa de ser criado. Os antigos (e a pendência offline) continuam valendo, só para leitura | nada do que está em produção se perde |
| 06/11/2026 | Relatórios somam levantamentos antigos e Termos novos (`visitaId`), sem data de corte; Termo antigo sem `visitaId` não conta como visita | não há dupla contagem nem salto no número |
| 06/11/2026 | Um modelo único de ficha (`pce-ficha.html`) e um de Termo (`pce-termo.html`), no mesmo estilo; registros antigos abrem por adaptadores | seis fichas e dois Termos repetiam estrutura e divergiam em detalhes |
| 06/11/2026 | Documentos A4 com rodapé na base de toda folha | sai no papel como em editor de texto |
| 06/11/2026 | Saem Perto de mim, Rota e laudo no app; o laudo continua no painel | fora do escopo: produtor, frutos e Termos |
