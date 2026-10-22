# Modelo do sistema (diagrama de classes)

Cada classe é uma aba da planilha (`TABELAS` no `Code.gs`); os atributos mostram só as chaves e os campos que ligam
uma aba à outra. Colunas completas: `TABELAS`. O GitHub desenha os diagramas (Mermaid).

## 1. Acesso (proposta, a implementar)

Decisões em [decisoes/acesso.md](decisoes/acesso.md). Substitui as abas `Fiscais`, `Permissoes`, `Administrativo` e
`AdmSessoes`, que ficam congeladas depois da migração (nada é apagado).

```mermaid
classDiagram
  direction LR
  class Usuario {
    +String id
    +String cpf
    +String nome
    +Bool gerente
    +String senhaHash
    +Bool senhaProvisoria
    +String codigoHash
    +Bool ativo
    +Data criadoEm
    +String criadoPor
    +podeAcessar(recurso) Bool
  }
  class Acesso {
    +String usuarioId
    +String recurso
    +Data liberadoEm
    +String liberadoPor
    +Data revogadoEm
    +String revogadoPor
  }
  class Sessao {
    +String id
    +String usuarioId
    +String hash
    +String app
    +String aparelhoId
    +Data criadoEm
    +Data ultimoUso
    +Data revogadoEm
    +String revogadoPor
    +valida() Bool
  }
  class Aparelho {
    +String id
    +String versao
    +Data ultimoSinal
  }
  class Auditoria {
    +Data em
    +String usuarioId
    +String acao
    +String alvo
    +String antes
    +String depois
  }
  Usuario "1" --> "*" Acesso : tem
  Usuario "1" --> "*" Sessao : entra por
  Sessao "*" --> "1" Aparelho : roda em
  Usuario "1" --> "*" Auditoria : fez
```

| Campo | Regra |
|---|---|
| `Usuario.cpf` | único (bloqueia conta duplicada), dígitos conferidos, mascarado nas telas e exportações |
| `Usuario.gerente` | 1 = acesso a tudo, inclusive ao app de campo; entra com usuário e senha |
| `Usuario.senhaHash` | só gerente; `senhaProvisoria = 1` obriga a troca no primeiro acesso (conferido no servidor) |
| `Usuario.codigoHash` | os demais: código de 6 dígitos, não expira, o gerente revoga e gera outro |
| `Acesso.recurso` | `campo`, `painel` ou `administrativo`; o dashboard é público e fica fora |
| `Sessao.app` | `campo`, `painel`, `tv` ou `administrativo`; revogar uma sessão derruba só aquele aparelho |
| `Auditoria` | toda mudança de acesso: quem, quando, o quê, antes e depois |

**A cada chamada** o servidor faz: token → `Sessao` (hash existe e não foi revogada) → `Usuario` ativo → `gerente = 1`
ou uma linha de `Acesso` com o recurso do app, sem `revogadoEm`. Falhou um passo: "sem acesso". O app de campo
funciona sem internet, então lá a checagem acontece no envio; registro de quem perdeu o acesso volta recusado.

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
    class TF {
      +String id
      +String barreira
      +Int numero
      +String turnoId
      +String veiculoId
      +String doc
    }
    class Andamento {
      +String turnoId
      +String placa
    }
  }
  namespace Cadastros {
    class Pessoa {
      +String id_cpf_cnpj
      +String nome
    }
    class Placa {
      +String id_placa
      +String doc
    }
  }
  namespace Programas {
    class Propriedade {
      +String id
      +String codigo
      +String doc
    }
    class Levantamento {
      +String id
      +String codigoPropriedade
    }
    class Colheita {
      +String id
      +String levantamentoId
    }
    class Programa {
      +String id
    }
    class PCE {
      +String id
      +String programa
      +String propriedadeId
      +JSON dados
    }
    class TermoPCE {
      +String id
      +String propriedadeId
      +String cadastroId
    }
  }
  class Arquivo {
    +String dono
    +String donoId
    +String driveId
  }
  Barreira "1" --> "*" Numeracao : por ano
  Barreira "1" --> "*" TF : numera
  Turno "1" --> "*" Veiculo : registra
  Turno "1" --> "*" TF : lavrado em
  Veiculo "1" --> "0..1" TF : gera
  Turno "1" --> "*" Andamento : TF em preenchimento
  TF "*" --> "1" Pessoa : fiscalizado
  Placa "*" --> "1" Pessoa : dono
  Propriedade "1" --> "*" Levantamento : visita
  Levantamento "1" --> "*" Colheita : amostra
  Propriedade "1" --> "*" PCE : inscrita em
  Programa "1" --> "*" PCE : inscreve
  PCE "1" --> "*" TermoPCE : visita
  Propriedade "*" --> "1" Pessoa : produtor
  TF "1" --> "*" Arquivo : fotos e PDFs
  Levantamento "1" --> "*" Arquivo : fotos
```

`PCE` = aba `CadastrosPCE`: a ligação de uma propriedade com um programa, no máximo uma por par (o cadastro do
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

Hoje todo registro guarda `usuario` = o **nome** digitado, e `gravar_` sobrescreve com quem sincronizou por último.
Com o acesso novo, cada aba de dados ganha `usuarioId` (coluna no fim) ligado a `Usuario.id`, e o autor fica separado
de quem editou por último (regra de rastreabilidade e LGPD).
