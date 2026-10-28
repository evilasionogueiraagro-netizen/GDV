# Modelo do sistema (diagrama de classes)

Cada classe é uma aba da planilha (`TABELAS` no `Code.gs`); os atributos mostram só as chaves e os campos que ligam
uma aba à outra. Colunas completas: `TABELAS`. O GitHub desenha os diagramas (Mermaid).

## 1. Acesso (proposta, a implementar)

Decisões em [decisoes/acesso.md](decisoes/acesso.md); abas em [banco.md](banco.md).

```mermaid
classDiagram
  direction LR
  class Usuario {
    +String id
    +String matricula
    +String nome
    +String senhaHash
    +Bool senhaProvisoria
    +Bool ativo
    +podeUsar(permissao) Bool
  }
  class Permissao {
    +String usuarioId
    +String permissao
    +Data concedidaEm
    +String concedidaPor
    +Data revogadaEm
  }
  class Sessao {
    +String id
    +String usuarioId
    +String tokenHash
    +String aplicativo
    +String aparelhoId
    +Data ultimoUso
    +Data encerradaEm
  }
  class Aparelho {
    +String id
    +Data ultimoSinal
  }
  class HistoricoDeAlteracoes {
    +Data em
    +String usuarioId
    +String acao
    +String tabela
    +String antes
    +String depois
  }
  Usuario "1" --> "*" Permissao : tem
  Usuario "1" --> "*" Sessao : entra por
  Sessao "*" --> "1" Aparelho : roda em
  Usuario "1" --> "*" HistoricoDeAlteracoes : fez
```

**A cada chamada** o servidor faz: token → `Sessao` (hash existe, não encerrada) → `Usuario` ativo e sem senha
provisória pendente → `Permissao` do app ou módulo, não revogada (`gerencia` vale tudo). Falhou um passo: "sem
acesso". O app de campo funciona sem internet: lá a checagem acontece no envio, e o registro de quem perdeu o
acesso volta recusado.

## 2. Dados do trabalho (o que existe hoje)

```mermaid
classDiagram
  direction TB
  namespace Fiscalizacao {
    class Barreira {
      +String id
      +String sufixo
    }
    class Numeracao {
      +String barreira
      +Int ano
      +Int ultimo
    }
    class Turno {
      +String id
      +String fiscal
      +String local
      +Bool encerrado
    }
    class Veiculo {
      +String id
      +String turnoId
      +String placa
    }
    class TFBarreira {
      +String id
      +String barreira
      +Int numero
      +String turnoId
      +String veiculoId
      +String doc
      +String procedimento
    }
    class TermoTurno {
      +String turnoId
    }
    class Andamento {
      +String turnoId
      +String placa
    }
  }
  namespace Cadastros {
    class Pessoa {
      +String id_cpf_cnpj
      +String tipo_PF_PJ
      +String nome
      +tfsRecebidos() Int
    }
    class Proprietario {
      +propriedades() Lista
    }
    class Placa {
      +String id_placa
      +String doc
    }
  }
  namespace PCE {
    class Propriedade {
      +String id
      +String codigo
      +String doc
    }
    class Levantamento {
      +String id
      +String propriedadeId
      +Data data
      +doencasAchadas() Lista
    }
    class Doenca {
      +String nome
      +String programa
    }
    class Colheita {
      +String id
      +String levantamentoId
    }
    class Programa {
      <<PCE>>
      +String id
      +doencas() Lista
    }
    class Cadastro {
      +String id
      +String programa
      +String propriedadeId
      +JSON dados
    }
    class TermoPCE {
      +String id
      +String levantamentoId
      +String doenca
      +String cadastroId
      +String doc
    }
  }
  class TermoAcao {
    <<abstract>>
    +String data
    +String servidor
  }
  class Arquivo {
    +String dono
    +String donoId
    +String driveId
  }
  Barreira "1" --> "*" Numeracao : por ano
  Barreira "1" --> "*" TFBarreira : numera
  Turno "1" --> "*" Veiculo : registra
  Turno "1" --> "*" TFBarreira : lavrado em
  Veiculo "1" --> "0..1" TFBarreira : irregularidade
  Turno "1" --> "*" Andamento : TF em preenchimento
  Turno "1" --> "0..1" TermoTurno : ao encerrar
  TFBarreira "*" --> "1" Pessoa : fiscalizado
  Placa "*" --> "1" Pessoa : dono
  Pessoa <|-- Proprietario
  TermoAcao <|-- TermoTurno
  TermoAcao <|-- TermoPCE
  Propriedade "1" --> "*" Levantamento : visita
  Levantamento "1" --> "*" Colheita : amostra
  Propriedade "1" --> "*" Cadastro : inscrita em
  Programa "1" --> "*" Cadastro : inscreve
  Programa "1" --> "*" Doenca : tem
  TermoPCE "*" --> "1" Doenca : de
  TermoPCE "0..*" --> "1" Levantamento : valida
  TermoPCE "*" --> "1" Cadastro : do cadastro
  TermoPCE "*" --> "1" Proprietario : fiscalizado
  Propriedade "*" --> "1" Proprietario : dono
  TFBarreira "1" --> "*" Arquivo : fotos e PDFs
  Levantamento "1" --> "*" Arquivo : fotos
```

**Dois documentos com nome parecido:**

| Documento | Quando | Template | Onde fica |
|---|---|---|---|
| TF de Barreira (`TFBarreira`) | irregularidade na barreira (liberação, apreensão, rechaço) | `web/documentos/tf.html` | aba `TFs`, numeração por barreira e ano |
| Termo de Fiscalização de ação (`TermoAcao`) | ao encerrar o turno (`TermoTurno`) ou na fiscalização de uma propriedade (`TermoPCE`) | `termo.html` (turno), `pce-termo.html` e `pce-termo-citros.html` (PCE) | turno: gerado dos dados do turno, sem aba; PCE: aba `TermosPCE` |

**Pessoa e proprietário:** todo proprietário é uma pessoa, mas nem toda pessoa é proprietária (quem só passa na
barreira é só `Pessoa`). Os dois ficam na aba `Pessoas` (id = CPF/CNPJ); proprietário é a pessoa que é `doc` de
alguma `Propriedade`. É pelo CPF/CNPJ que se conta quantos TFs uma pessoa levou (`tfsRecebidos`); a reincidência
de hoje olha só o TF de Barreira.

**PCE (modelo combinado em 22/10/2026):** o PCE é o **programa** (monilíase, citros...), com várias doenças (praga
ou doença: HLB, cancro cítrico, mosca-da-carambola...). O levantamento é a visita ao proprietário e gera **0 ou
vários** Termos de Fiscalização do PCE, **um por doença achada**; cada termo valida o levantamento daquela doença.
Visita sem doença achada = levantamento negativo, sem termo. Identificação e contagem são sempre **por doença**. **O código ainda difere:** `Levantamentos` já guarda várias pragas por visita (um cartão
e uma ficha por praga), mas `TermosPCE` tem um termo por visita com uma lista de pragas, sem apontar para o
levantamento. Decisões em
[decisoes/modelo.md](decisoes/modelo.md).

`Cadastro` = aba `CadastrosPCE`: a ligação de uma propriedade com um programa, no máximo uma por par (o cadastro do
imóvel naquele programa; `dados` guarda os campos do programa). `Programa` não é aba: é a lista `PROGRAMAS_PCE` do
`Code.gs` (monilíase, banana, citros, mandioca, soja, propriedade). `Arquivo` liga a qualquer registro por
`dono` (nome da aba) + `donoId`. `Consultas` (registro de consultas de CPF/placa) e `Aparelhos` (sinal) ficam fora do
desenho.

## 3. Gestão (painel e Portal do Administrativo)

```mermaid
classDiagram
  direction LR
  class Convenio {
    +String id
    +JSON config
  }
  class ConvLancamento {
    +String convenio
    +String etapa
    +String tipo
  }
  class ConvFinanceiro {
    +String convenio
    +String etapa
    +Num valor
  }
  class ConvRelatorio {
    +String convenio
    +String mes
  }
  class VigConfig {
    +String id
    +JSON config
  }
  class VigLancamento {
    +String periodo
    +String posto
    +String indicador
  }
  class RelGdvTexto {
    +String id
    +String tipo
  }
  class RelGdvLancamento {
    +String id
    +String chave
  }
  Convenio "1" --> "*" ConvLancamento : execução física
  Convenio "1" --> "*" ConvFinanceiro : execução financeira
  Convenio "1" --> "*" ConvRelatorio : relatório mensal
  VigConfig "1" --> "*" VigLancamento : postos
```

## Quem fez cada registro

Hoje todo registro guarda `usuario` = o **nome** do login (único). Nas abas com dono, só quem gravou altera; nos
cadastros comuns (pessoas, placas, propriedades), `gravar_` ainda sobrescreve com quem sincronizou por último.
Com o acesso novo, cada aba de dados ganha `usuarioId` (coluna no fim) ligado a `Usuario.id`, e o autor fica separado
de quem editou por último (regra de rastreabilidade e LGPD).
