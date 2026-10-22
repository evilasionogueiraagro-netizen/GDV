# Decisões: modelo de dados

Como o domínio é entendido. O desenho está em [../arquitetura.md](../arquitetura.md). Situação: definido; a parte do
PCE ainda não está no código.

## Decidido

| Data | Decisão | Por quê |
|---|---|---|
| 22/10/2026 | TF de Barreira (irregularidade na barreira, `tf.html`) e Termo de Fiscalização de ação (fim do turno, fiscalização de propriedade) são documentos diferentes, com templates diferentes | os nomes parecidos confundem; contam e numeram de formas diferentes |
| 22/10/2026 | Todo proprietário é pessoa, mas nem toda pessoa é proprietária (quem só passa na barreira é só pessoa). Chave: CPF/CNPJ | contar quantos TFs uma pessoa levou |
| 22/10/2026 | Programa (monilíase, citros, banana, mandioca, soja...) tem as suas pragas | o levantamento é sempre de uma praga de um programa |
| 22/10/2026 | O cadastro do imóvel (`PCE`) é a ligação de uma propriedade com um programa, no máximo um por par | já é assim no código |
| 22/10/2026 | No PCE, o levantamento é a visita e pode achar várias pragas; para cada praga sai **um** Termo de Fiscalização do PCE, que **valida** o levantamento daquela praga (e não um termo por visita, como o código faz hoje) | regra do trabalho de campo; um termo por praga é mais claro |

## Em aberto

- **Quando o levantamento está validado**: quando toda praga achada tem o seu termo? E praga não achada (levantamento
  negativo) também gera termo?

- **Contagem de TFs por pessoa**: só TF de Barreira (como a reincidência hoje) ou também os Termos do PCE do proprietário?
- **Levar o PCE do código para o modelo**: hoje `TermosPCE` tem um termo por visita com uma lista de pragas e não aponta
  para o levantamento. Quando e como migrar (prevista para depois do controle de acesso).
