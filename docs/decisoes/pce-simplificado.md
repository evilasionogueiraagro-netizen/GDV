# Decisões: PCE simplificado

O PCE passa a ser produtor, frutos e Termos. Regras em [../modulos/pce.md](../modulos/pce.md). Situação: no código.

| Data | Decisão | Por quê |
|---|---|---|
| 06/11/2026 | O PCE é só cadastro do produtor, frutos da propriedade e Termos. A visita é o Termo, um por programa; todo Termo tem número e PDF | o Termo é o documento que importa; o levantamento repetia as mesmas perguntas |
| 06/11/2026 | O levantamento deixa de ser criado. Os antigos (e a pendência offline) continuam valendo, só para leitura | nada do que está em produção se perde |
| 06/11/2026 | Relatórios somam levantamentos antigos e Termos novos (`visitaId`), sem data de corte; Termo antigo sem `visitaId` não conta como visita | não há dupla contagem nem salto no número |
| 06/11/2026 | Um modelo único de ficha (`pce-ficha.html`) e um de Termo (`pce-termo.html`), no mesmo estilo; registros antigos abrem por adaptadores | seis fichas e dois Termos repetiam estrutura e divergiam em detalhes |
| 06/11/2026 | Documentos A4 com rodapé na base de toda folha | sai no papel como em editor de texto |
| 09/11/2026 | Cada ficha imprime só o que o seu `.docx` tem (seções, campos, colunas, textos), com código central; visual do papel (11 pt, quadros, folha cheia até as vias) | "o mais similar possível, mas centralizando cadastros e termos" |
| 09/11/2026 | Constatação do Termo novo em caixas Presença / Ausência / Suspeita, em todos os programas | o resultado de cada praga se lê sem texto escrito |
| 06/11/2026 | Saem Perto de mim, Rota e laudo no app; o laudo continua no painel | fora do escopo: produtor, frutos e Termos |
| 09/11/2026 | Praga opcional do catálogo deixa de ser campo em branco: vem marcada "Não tem" e a pessoa só troca para "Tem"; conta como avaliada no Termo do programa | a visita só de banana saía sem caixa de praga marcada e sem enquadramento legal |
| 12/11/2026 | Cadastro por programa com base herdada: produtor, propriedades (várias, UF fixa AM) e culturas são digitados uma vez; cada programa guarda só o que é dele | a prestação de contas é por programa; cadastro único não resolve, repetir dado gera inconsistência |
| 12/11/2026 | Programa das culturas da propriedade é obrigatório na visita; pular exige justificativa, que vira alerta no painel. Fusariose pede resposta explícita | propriedade com a cultura tem de ter o Termo do programa |
| 12/11/2026 | Seção 2 do Termo deixa de copiar o papel e vira quadro padronizado | padronizar primeiro; ajustes depois |
| 12/11/2026 | "Novo termo" na aba Termos: busca no aparelho e depois na planilha, por texto; sem internet, avisa | em campo o fiscal parte do Termo, não do cadastro |
| 10/11/2026 | Termos de Fiscalização gerados pela propriedade, sem nova visita: um por programa dos frutos do cadastro, com os mesmos dados e a mesma numeração; só a "Descrição da ação" muda (`CONFIG.PCE.termo.programas`) | o cadastro já tem tudo; repetir a visita só para emitir o Termo é trabalho dobrado |
