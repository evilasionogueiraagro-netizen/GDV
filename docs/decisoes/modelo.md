# Decisões: modelo de dados

Como o domínio é entendido. O desenho está em [../arquitetura.md](../arquitetura.md). Situação: definido; o PCE segue
[pce-simplificado.md](pce-simplificado.md).

## Decidido

| Data | Decisão | Por quê |
|---|---|---|
| 22/10/2026 | TF de Barreira (irregularidade na barreira, `tf.html`) e Termo de Fiscalização de ação (fim do turno, fiscalização de propriedade) são documentos diferentes, com templates diferentes | os nomes parecidos confundem; contam e numeram de formas diferentes |
| 22/10/2026 | Todo proprietário é pessoa, mas nem toda pessoa é proprietária (quem só passa na barreira é só pessoa). Chave: CPF/CNPJ | contar quantos TFs uma pessoa levou |
| 22/10/2026 | O PCE é o programa (monilíase, citros, banana, mandioca, soja...), com várias doenças (praga ou doença) | o trabalho é organizado por programa |
| 22/10/2026 | Identificação e contagem no PCE são sempre por doença | é o que a vigilância precisa saber |
| 22/10/2026 | O cadastro do imóvel (`Cadastro`, aba `CadastrosPCE`) é a ligação de uma propriedade com um programa, no máximo um por par | já é assim no código |
| 22/10/2026 | Substituída em 06/11/2026 ([pce-simplificado](pce-simplificado.md)): a visita é o Termo, um por programa, inclusive sem detecção | o levantamento deixou de ser criado |
| 22/10/2026 | A planilha funciona como banco relacional: abas com nome completo e sem abreviação (todas renomeadas agora), 3ª forma normal, ligação sempre por id ([banco.md](../banco.md)) | o sistema só funciona direito com os dados sem repetição |
| 22/10/2026 | Documento emitido (termos) guarda cópia dos dados da pessoa do momento; é a única repetição permitida | documento legal não muda quando o cadastro muda |

## Em aberto


- **Contagem de TFs por pessoa**: só TF de Barreira (como a reincidência hoje) ou também os Termos do PCE do proprietário?
- **Levar o PCE ao modelo por doença**: o Termo é por programa, com as pragas em `culturas`. Falta decidir se vale
  separar por doença (ver [banco.md](../banco.md)).
