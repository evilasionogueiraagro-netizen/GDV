# GDV – Gestão de Dados da Fazenda

Plataforma web em **Google Apps Script** com:

- **Entrada de dados**: Animais, Pesagens e Financeiro (formulários gerados a partir de `SCHEMA` em `Code.gs`)
- **Banco de dados**: Google Sheets (uma aba por tabela, criadas automaticamente)
- **Dashboard**: KPIs (animais, peso médio, GMD, receitas/despesas/saldo) e gráficos, com filtro de período
- **Relatórios**: Animais, GMD e Financeiro, com download em CSV e impressão/PDF

## Como publicar

### Opção A – Manual (mais simples)
1. Crie uma planilha no Google Sheets (ex.: "GDV – Banco de dados").
2. Menu **Extensões → Apps Script**.
3. Copie o conteúdo de `src/Code.gs` para `Code.gs`, crie um arquivo HTML chamado `Index` com `src/Index.html`, e em **Configurações do projeto** marque "Mostrar arquivo de manifesto" e cole `src/appsscript.json`.
4. **Implantar → Nova implantação → App da Web**: executar como *Eu*, acesso *Qualquer pessoa com conta Google* (ou restrinja ao seu domínio).
5. Autorize e abra a URL gerada.

### Opção B – Com clasp
```bash
npm i -g @google/clasp && clasp login
cd src && clasp create --type sheets --title "GDV"
clasp push && clasp deploy
```

## Controle de acesso
Opcional: em **Configurações do projeto → Propriedades do script**, crie `ALLOWED_EMAILS` com e-mails separados por vírgula.
Observação: o Google só informa o e-mail do visitante em contas do mesmo domínio Workspace; em contas Gmail pessoais a lista bloqueará o acesso. Nesse caso, mantenha a lista vazia e controle o acesso por quem recebe o link.

## Personalizar
Edite `SCHEMA` em `src/Code.gs` para adicionar campos ou tabelas (ex.: Vacinas, Lavoura); a interface se adapta sozinha. Para uma nova aba aparecer, o campo/tabela novo deve estar no `SCHEMA`; planilhas já criadas precisam ter a coluna adicionada manualmente na posição correspondente.
