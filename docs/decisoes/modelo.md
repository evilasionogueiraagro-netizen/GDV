# Decisões: modelo de dados

Como o domínio é entendido. O desenho está em [../arquitetura.md](../arquitetura.md). Situação: definido; a parte do
PCE ainda não está no código.

## Decidido

| Data | Decisão | Por quê |
|---|---|---|
| 22/10/2026 | TF de Barreira (irregularidade na barreira, `tf.html`) e Termo de Fiscalização de ação (fim do turno, fiscalização de propriedade) são documentos diferentes, com templates diferentes | os nomes parecidos confundem; contam e numeram de formas diferentes |
| 22/10/2026 | Todo proprietário é pessoa, mas nem toda pessoa é proprietária (quem só passa na barreira é só pessoa). Chave: CPF/CNPJ | contar quantos TFs uma pessoa levou |
| 22/10/2026 | O PCE é o programa (monilíase, citros, banana, mandioca, soja...), com várias doenças (praga ou doença) | o trabalho é organizado por programa |
| 22/10/2026 | Identificação e contagem no PCE são sempre por doença | é o que a vigilância precisa saber |
| 22/10/2026 | O cadastro do imóvel (`Cadastro`, aba `CadastrosPCE`) é a ligação de uma propriedade com um programa, no máximo um por par | já é assim no código |
| 22/10/2026 | O levantamento é a visita ao proprietário e gera **0 ou vários** termos: **um por doença achada**, que valida o levantamento daquela doença (e não um termo por visita, como o código faz hoje). Sem doença achada = negativo, sem termo | regra do trabalho de campo; um termo por doença é mais claro |

## Em aberto


- **Contagem de TFs por pessoa**: só TF de Barreira (como a reincidência hoje) ou também os Termos do PCE do proprietário?
- **Levar o PCE do código para o modelo**: hoje `TermosPCE` tem um termo por visita com uma lista de pragas e não aponta
  para o levantamento. Quando e como migrar (prevista para depois do controle de acesso).
