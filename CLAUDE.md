# Ongoing Dashboard

## Sobre o projeto
Dashboard BI para o Time Ongoing (Kyte) com:
- **Dashboard Azure DevOps** — cards criados por dia, tags por tema/versão, evolução mensal (12 meses)
- **Gestão de Incidentes** — contador de dias sem incêndio, registro de incêndios (🔥) e lançamentos (🚀), recorde de dias, histórico com edição
- Integração com Azure DevOps API (projeto `Ongoing`, Area Path `Ongoing\Kyte`)
- Cards com "teste" no título são desconsiderados
- Filtros de período: 7, 15, 30 dias ou personalizado (máx 31 dias)
- Atualização automática a cada 5 minutos

Usuária iniciante em programação - explicar conceitos quando necessário.

## Stack
- **Frontend:** HTML + CSS + JavaScript (em `public/index.html`)
- **Backend:** Node.js + Express (`server.js`)
- **Banco de dados:** SQLite via better-sqlite3 (`fire-counter.db`)
- **API externa:** Azure DevOps REST API (PAT no `.env`)

## Como rodar
```bash
node server.js
```
Acesse http://localhost:3000

## Configuração
Arquivo `.env` na raiz com:
```
AZURE_PAT=<token>
AZURE_ORG=KyteLand
AZURE_PROJECT=Ongoing
```

## Cores da Kyte
- Verde: `#3FC7A3` (cor principal, destaques, botões)
- Azul escuro: `#363F4E` (fundo da página)
- Cinza claro: `#F5F5F5` (textos)

## Estrutura do banco (SQLite)
Tabela `incidents`:
- `id` INTEGER PRIMARY KEY
- `cause` TEXT — descrição do incidente
- `created_at` TEXT — data de início
- `ended_at` TEXT — data de fim (pode ser null se em andamento)
- `type` TEXT — 'fire' (incêndio) ou 'launch' (lançamento)

## Regras
- Sempre escrever textos em português com acentos corretos
- Manter o visual alinhado com as cores da Kyte
- Manter o código simples e comentado quando necessário
- Recorde de dias conta apenas incêndios (🔥), não lançamentos (🚀)
- Tags "Ongoing" = por tema, tags com padrão numérico (X.Y.Z) = por versão
- "Sem tag" aparece por último na lista de tags por tema
