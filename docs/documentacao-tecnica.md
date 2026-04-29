# Ongoing Dashboard — Documentação Técnica

## 1. O que é

Dashboard web para o Time Ongoing da Kyte que centraliza:
- **Métricas do Azure DevOps** — quantidade de cards criados por dia, tags por tema e versão, evolução mensal
- **Gestão de incidentes** — contador de dias sem incêndio, registro de incêndios e lançamentos, recorde do time

**Link de acesso:** https://ongoing-dashboard.onrender.com

---

## 2. Por que foi criado

Antes desse dashboard, não havia uma forma visual e centralizada de acompanhar:
- Quantos cards o time recebe por dia/semana/mês
- Quais os temas mais recorrentes (estoque, fiado, pagamentos, etc.)
- A evolução da demanda ao longo do tempo
- Quanto tempo estamos sem incidentes críticos

Agora tanto o time de Ongoing quanto os outros times podem visualizar essas informações de forma rápida, sem precisar entrar no Azure DevOps e montar filtros manuais.

---

## 3. Funcionalidades

### Dashboard Azure DevOps
- **KPIs** — Total de cards, média por dia, pico em um dia, tags distintas
- **Cards criados por dia** — Gráfico de barras com filtro de período (7, 15, 30 dias ou personalizado, máximo 31 dias)
- **Tags por quantidade** — Duas visões:
  - **Tema** — Tags "Ongoing" (geral, estoque, fiado, variantes, etc.) + "Sem tag"
  - **Versão** — Tags de versão do app (4.0.1, 3.5.0, etc.)
- **Evolução mensal** — Gráfico dos últimos 12 meses com:
  - Clique na barra para ver as 3 principais tags do mês
  - Emoji de incidente (🔥/🚀) nos meses que tiveram ocorrências
- **Atualização automática** a cada 5 minutos

### Gestão de Incidentes
- **Contador de dias** sem incêndio (no header, sempre visível)
- **Recorde do time** — mostra o maior intervalo sem incêndios
- **Emoji de confete** (🎉) quando estamos batendo o recorde
- **Dois tipos de incidente:**
  - 🔥 **Incêndio** — problemas críticos (reseta o contador)
  - 🚀 **Lançamento** — releases que geram impacto nos cards (NÃO reseta o contador)
- **Edição** — pode criar sem data de fim e editar depois quando o incidente acabar
- **Histórico** completo com período (de/até)

### Filtros
- Cards são filtrados pela **Area Path `Ongoing\Kyte`**
- Cards com a palavra **"teste"** no título são desconsiderados
- Período máximo de filtro: **31 dias**

---

## 4. Stack Técnica e Decisões

### Frontend: HTML + CSS + JavaScript puro
**Por que:** Simplicidade. Não há necessidade de framework (React, Vue, etc.) para um dashboard com poucas telas. Menos complexidade = mais fácil de manter e entender.

**Prós:**
- Zero configuração de build
- Carregamento rápido
- Qualquer desenvolvedor consegue editar

**Contras:**
- Se o projeto crescer muito, pode ficar difícil de organizar
- Sem componentização (tudo em um arquivo)

---

### Backend: Node.js + Express
**Por que:** É a stack mais simples para criar uma API REST com JavaScript. O time já trabalha com JavaScript no frontend, então mantém a linguagem unificada.

**Prós:**
- Rápido de desenvolver
- Grande ecossistema de pacotes (npm)
- Mesmo idioma do frontend
- Hospedagem gratuita fácil de encontrar

**Contras:**
- Não é ideal para processamento pesado (não é o nosso caso)

---

### Banco de dados: Turso (SQLite na nuvem)
**Por que:** O projeto começou com SQLite local (para aprendizado de SQL). Para hospedar na nuvem, o SQLite local não persiste em plataformas como Render. O Turso resolve isso: é um SQLite hospedado, com a mesma sintaxe SQL, gratuito e fácil de migrar.

**Prós:**
- Gratuito (até 9GB de armazenamento)
- Mesma sintaxe SQL do SQLite (curva de aprendizado zero)
- Dados persistem mesmo se o servidor reiniciar
- Latência baixa (servidor na AWS)

**Contras:**
- Dependência de serviço externo
- Se o Turso sair do ar, os dados de incidentes ficam indisponíveis (os dados do Azure continuam funcionando)

**Alternativas consideradas:**
- SQLite local — não persiste no Render
- PostgreSQL (Supabase/Neon) — mais complexo, desnecessário para o volume de dados
- MongoDB — não-relacional, não atende ao objetivo de aprender SQL

---

### Hospedagem: Render (plano gratuito)
**Por que:** Gratuito, simples de configurar, integra direto com GitHub. Cada push no repositório faz deploy automático.

**Prós:**
- Gratuito
- Deploy automático via GitHub
- HTTPS incluso
- Fácil de escalar se necessário

**Contras:**
- No plano gratuito, o servidor "dorme" após 15 min sem uso (demora ~30s para acordar)
- Se precisar de alta disponibilidade, seria necessário o plano pago (US$7/mês)

**Alternativas consideradas:**
- Vercel — não suporta servidor Node.js contínuo
- GitHub Pages — só hospeda sites estáticos (sem backend)
- Azure App Service — mais complexo de configurar, mas seria uma opção interna

---

### API do Azure DevOps
**Por que:** É onde o time já gerencia os cards. A API REST é gratuita (inclusa no plano) e permite buscar work items com filtros avançados (WIQL).

**Prós:**
- Sem custo adicional
- Até 200 requisições/minuto
- Dados em tempo real

**Contras:**
- Depende de um Personal Access Token (PAT) que expira e precisa ser renovado
- Se a estrutura dos boards mudar, pode precisar de ajustes nos filtros

---

## 5. Arquitetura

```
[Navegador] → [Render (Node.js/Express)] → [Azure DevOps API]
                       ↕
                  [Turso (SQLite)]
```

- O **navegador** acessa o dashboard via HTTPS
- O **servidor** (Render) serve o frontend e faz chamadas à API do Azure DevOps
- Os **incidentes** são salvos no Turso (banco de dados na nuvem)
- Os **dados dos cards** vêm direto da API do Azure (não são armazenados)

---

## 6. Segurança

- **Tokens e credenciais** ficam em variáveis de ambiente (`.env` local, Environment Variables no Render). Nunca são commitados no código.
- **`.gitignore`** protege: `.env`, `fire-counter.db`, `node_modules/`
- O repositório no GitHub é **público**, mas não contém nenhum dado sensível

---

## 7. Custos

| Serviço | Custo | Limite |
|---|---|---|
| Render (hospedagem) | Gratuito | Dorme após 15min sem uso |
| Turso (banco de dados) | Gratuito | Até 9GB |
| Azure DevOps API | Gratuito | 200 req/min (incluso no plano) |
| **Total** | **R$ 0** | — |

---

## 8. Como rodar localmente

```bash
# Clonar o repositório
git clone https://github.com/eduarda-bueno/ongoing-dashboard.git
cd ongoing-dashboard

# Instalar dependências
npm install

# Configurar variáveis de ambiente
# Criar arquivo .env com:
# AZURE_PAT=<seu token>
# AZURE_ORG=KyteLand
# AZURE_PROJECT=Ongoing
# TURSO_URL=<url do banco>
# TURSO_TOKEN=<token do banco>

# Rodar
node server.js
# Acessar http://localhost:3000
```

---

## 9. Manutenção

### Renovar o PAT do Azure
O token expira periodicamente. Para renovar:
1. Acesse https://dev.azure.com/KyteLand/_usersSettings/tokens
2. Crie um novo token com permissão de Code (Read)
3. Atualize a variável `AZURE_PAT` no Render (Dashboard → Environment)

### Atualizar o código
1. Faça as alterações localmente
2. Commit e push para o GitHub
3. O Render faz deploy automático

### Monitorar
- Render: https://dashboard.render.com
- Turso: https://turso.tech (dashboard)

---

## 10. Possíveis evoluções futuras

- Autenticação (login) para proteger o dashboard
- Mais métricas: tempo médio de resolução, SLA, cards por pessoa
- Notificações (Slack/email) quando atingir recorde ou registrar incêndio
- Integração com API da Anthropic (Claude) para análise inteligente dos dados
- Exportação de relatórios (PDF/CSV)
