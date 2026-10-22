# Banco (planilha como banco relacional)

**Proposta para aprovação (22/10/2026).** Cada aba é uma tabela; nome completo, sem abreviação; chave primária na
primeira coluna; ligação entre abas sempre pelo id (`<aba>Id`), nunca pelo nome digitado. Colunas completas:
`TABELAS` no `Code.gs`. Decisões: [decisoes/modelo.md](decisoes/modelo.md) e [decisoes/acesso.md](decisoes/acesso.md).

## Regras do esquema

- **3ª forma normal**: um fato fica em um lugar só. Lista dentro de célula (JSON) vira aba própria quando é consultada
  ou contada; JSON só para configuração (`Convenios`, `ConfiguracaoDoVigifito`) e respostas de formulário que não se
  consultam separado (`dados` do cadastro no programa).
- **Exceção permitida**: documento emitido (termos) guarda cópia dos dados da pessoa do momento da emissão (documento
  legal não muda quando o cadastro muda).
- **Quem fez**: toda aba de dados tem `criadoPor` e `atualizadoPor` (= `Usuarios.id`), além de `criadoEm`/`atualizadoEm`.
- **Nada se apaga**: `excluido = 1`. As abas antigas ficam congeladas depois da migração, como cópia.

## Abas

| Aba nova | Vem de | Chave | Liga a |
|---|---|---|---|
| `Usuarios` | `Fiscais`, `Administrativo` | `id`; `matricula` única | |
| `PermissoesDosUsuarios` | `Permissoes`, `Fiscais.perfil` | `usuarioId` + `permissao` | `Usuarios` |
| `SessoesDosUsuarios` | `AdmSessoes`, `Fiscais.token` | `id` (só o hash do token) | `Usuarios`, `Aparelhos` |
| `HistoricoDeAlteracoes` | `AdmHistorico` | `id` | `Usuarios` |
| `Aparelhos` | `Aparelhos` | `id` | `Usuarios` |
| `Pessoas` | `Pessoas` | `id` = CPF/CNPJ | |
| `Placas` | `Placas` | `id` = placa | `Pessoas` |
| `Propriedades` | `Propriedades` | `id` | `Pessoas` (dono) |
| `Barreiras` | `Barreiras` | `id` | |
| `SequenciasDeNumeracao` | `Numeracao` | `id` = tipo, barreira ou unidade, ano | |
| `Turnos` | `Turnos` | `id` | `Barreiras` |
| `FiscaisDosTurnos` | `Turnos.fiscal` (nomes digitados) | `turnoId` + `usuarioId` | `Turnos`, `Usuarios` |
| `VeiculosAbordados` | `Veiculos` | `id` | `Turnos`, `Placas` |
| `TermosDeFiscalizacaoDeBarreira` | `TFs` | `id`; barreira + ano + número único | `Turnos`, `VeiculosAbordados`, `Pessoas` |
| `ProdutosDosTermosDeBarreira` | `TFs.produtos` (JSON) | `termoId` + ordem | `TermosDeFiscalizacaoDeBarreira` |
| `TermosEmPreenchimento` | `Andamento` | `id` | `Turnos`, `Usuarios` |
| `ConsultasDePessoasEPlacas` | `Consultas` | `id` | `Usuarios` |
| `Programas` | `PROGRAMAS_PCE` (código) | `id` | |
| `Doencas` | `CONFIG.PCE.pragas` (código) | `id` | `Programas` |
| `CadastrosNosProgramas` | `CadastrosPCE` | `id`; propriedade + programa único | `Propriedades`, `Programas` |
| `Levantamentos` | `Levantamentos` (a visita) | `id` | `Propriedades` |
| `DoencasDosLevantamentos` | `Levantamentos.pragas` (JSON) | `levantamentoId` + `doencaId` | `Levantamentos`, `Doencas` |
| `CulturasDosLevantamentos` | `Levantamentos.pragas` (culturas) | `id` | `DoencasDosLevantamentos` |
| `TermosDeFiscalizacaoDoPCE` | `TermosPCE` | `id`; um por doença achada | `Levantamentos`, `Doencas`, `CadastrosNosProgramas` |
| `TermosDeColheitaDeAmostras` | `Colheitas` | `id` | `Levantamentos` |
| `ResultadosDeLaboratorio` | `Colheitas.laboratorio` (JSON) | `termoDeColheitaId` | `TermosDeColheitaDeAmostras` |
| `Arquivos` | `Arquivos` + listas `fotos`/`assinaturas`/`pdfs` das outras abas | `id` | qualquer aba (`tabela` + `registroId`) |
| `Convenios` | `Convenios` | `id` | |
| `LancamentosFisicosDosConvenios` | `ConvLancamentos` | `id` | `Convenios` |
| `LancamentosFinanceirosDosConvenios` | `ConvFinanceiro` | `id` | `Convenios` |
| `RelatoriosMensaisDosConvenios` | `ConvRelatorios` | `convenioId` + mês | `Convenios` |
| `TextosDosRelatoriosGDV` | `RelGdvTextos` | `id` = tipo, ano, mês | |
| `LancamentosDosRelatoriosGDV` | `RelGdvLancamentos` | ano + mês + linha | |
| `ConfiguracaoDoVigifito` | `VigConfig` | `id` | |
| `LancamentosDoVigifito` | `VigLancamentos` | período + posto + indicador | |

## Migração

1. Backup da planilha. 2. Script cria as abas novas e copia os dados (repetir não duplica). 3. Confere contagens.
4. As abas antigas ficam congeladas. 5. Testado antes numa cópia da planilha de produção.

O app de campo continua mandando os dados no formato de hoje; o servidor separa nas abas novas (celular com versão
antiga não quebra).
