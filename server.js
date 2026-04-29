require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Config Azure DevOps
const AZURE_PAT = process.env.AZURE_PAT;
const AZURE_ORG = process.env.AZURE_ORG;
const AZURE_PROJECT = process.env.AZURE_PROJECT;
const AZURE_AUTH = Buffer.from(`:${AZURE_PAT}`).toString('base64');

// Banco de dados Turso (ou SQLite local como fallback)
const db = createClient({
  url: process.env.TURSO_URL || 'file:fire-counter.db',
  authToken: process.env.TURSO_TOKEN
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Criar tabela se não existir
async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cause TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      ended_at TEXT,
      type TEXT DEFAULT 'fire'
    )
  `);
}
initDB();

// === ROTAS DE INCIDENTES ===

app.get('/api/status', async (req, res) => {
  const result = await db.execute('SELECT * FROM incidents ORDER BY created_at ASC');
  const all = result.rows;
  const last = all.length > 0 ? all[all.length - 1] : null;
  if (!last) return res.json({ days: null, lastIncident: null, record: 0 });

  const fires = all.filter(i => i.type !== 'launch');
  const lastFire = fires.length > 0 ? fires[fires.length - 1] : null;

  const days = lastFire ? Math.floor((new Date() - new Date(lastFire.created_at)) / (1000 * 60 * 60 * 24)) : null;

  let record = days || 0;
  for (let i = 1; i < fires.length; i++) {
    const gap = Math.floor((new Date(fires[i].created_at) - new Date(fires[i-1].created_at)) / (1000 * 60 * 60 * 24));
    if (gap > record) record = gap;
  }

  res.json({ days, lastIncident: last, record, isRecord: days !== null && days >= record });
});

app.get('/api/incidents', async (req, res) => {
  const result = await db.execute('SELECT * FROM incidents ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/incidents', async (req, res) => {
  const { cause, ended_at, created_at, type } = req.body;
  if (!cause || !cause.trim()) return res.status(400).json({ error: 'Informe a causa do incidente' });

  const incType = type || 'fire';
  if (created_at) {
    await db.execute({
      sql: 'INSERT INTO incidents (cause, created_at, ended_at, type) VALUES (?, ?, ?, ?)',
      args: [cause.trim(), created_at, ended_at || null, incType]
    });
  } else {
    await db.execute({
      sql: 'INSERT INTO incidents (cause, ended_at, type) VALUES (?, ?, ?)',
      args: [cause.trim(), ended_at || null, incType]
    });
  }

  const last = await db.execute('SELECT * FROM incidents ORDER BY id DESC LIMIT 1');
  res.json({ incident: last.rows[0] });
});

app.put('/api/incidents/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: 'SELECT * FROM incidents WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Incidente não encontrado' });

  const old = existing.rows[0];
  const cause = req.body.cause?.trim() || old.cause;
  const created_at = req.body.created_at || old.created_at;
  const ended_at = req.body.ended_at !== undefined ? req.body.ended_at : old.ended_at;
  const type = req.body.type || old.type;

  await db.execute({
    sql: 'UPDATE incidents SET cause = ?, created_at = ?, ended_at = ?, type = ? WHERE id = ?',
    args: [cause, created_at, ended_at || null, type, id]
  });

  const updated = await db.execute({ sql: 'SELECT * FROM incidents WHERE id = ?', args: [id] });
  res.json({ incident: updated.rows[0] });
});

// === ROTA AZURE DEVOPS - DASHBOARD ===

async function fetchAzureWorkItems(dateFrom, dateTo) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const fromDate = new Date(dateFrom + 'T00:00:00');
  const toDate = new Date(dateTo + 'T00:00:00');
  const daysAgoFrom = Math.ceil((now - fromDate) / (1000 * 60 * 60 * 24));
  const daysAgoTo = Math.floor((now - toDate) / (1000 * 60 * 60 * 24));

  let dateFilter = `[System.CreatedDate] >= @today - ${daysAgoFrom}`;
  if (daysAgoTo > 0) {
    dateFilter += ` AND [System.CreatedDate] < @today - ${daysAgoTo - 1}`;
  }

  const query = `
    SELECT [System.Id], [System.CreatedDate], [System.WorkItemType]
    FROM WorkItems
    WHERE [System.TeamProject] = '${AZURE_PROJECT}'
      AND [System.AreaPath] UNDER 'Ongoing\\Kyte'
      AND NOT [System.Title] CONTAINS 'teste'
      AND ${dateFilter}
    ORDER BY [System.CreatedDate] DESC
  `;

  const wiqlRes = await fetch(
    `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/wiql?api-version=7.1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${AZURE_AUTH}`
      },
      body: JSON.stringify({ query })
    }
  );

  const wiqlData = await wiqlRes.json();
  const ids = wiqlData.workItems?.map(w => w.id) || [];

  if (ids.length === 0) return [];

  const allCards = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200).join(',');
    const detailRes = await fetch(
      `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems?ids=${batch}&fields=System.Title,System.WorkItemType,System.CreatedDate,System.State,System.Tags&api-version=7.1`,
      { headers: { 'Authorization': `Basic ${AZURE_AUTH}` } }
    );
    const detailData = await detailRes.json();
    allCards.push(...(detailData.value || []));
  }

  return allCards;
}

app.get('/api/azure/dashboard', async (req, res) => {
  try {
    const to = req.query.to || new Date().toISOString().substring(0, 10);

    let from = req.query.from;
    if (!from) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      from = d.toISOString().substring(0, 10);
    }

    const allCards = await fetchAzureWorkItems(from, to);

    const porDia = {};
    allCards.forEach(card => {
      const date = card.fields['System.CreatedDate'].substring(0, 10);
      if (!porDia[date]) porDia[date] = 0;
      porDia[date]++;
    });

    const porDiaArray = Object.entries(porDia)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const porTag = {};
    allCards.forEach(card => {
      const tagsStr = card.fields['System.Tags'] || '';
      const tags = tagsStr.split(';').map(t => t.trim()).filter(t => t.toLowerCase().startsWith('ongoing'));
      if (tags.length === 0) {
        porTag['Sem tag'] = (porTag['Sem tag'] || 0) + 1;
      } else {
        tags.forEach(tag => { porTag[tag] = (porTag[tag] || 0) + 1; });
      }
    });

    const porTagArray = Object.entries(porTag)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => {
        if (a.tag === 'Sem tag') return 1;
        if (b.tag === 'Sem tag') return -1;
        return b.count - a.count;
      });

    const porVersion = {};
    allCards.forEach(card => {
      const tagsStr = card.fields['System.Tags'] || '';
      const tags = tagsStr.split(';').map(t => t.trim()).filter(t => /^\d+\.\d+/.test(t));
      tags.forEach(tag => { porVersion[tag] = (porVersion[tag] || 0) + 1; });
    });

    const porVersionArray = Object.entries(porVersion)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ total: allCards.length, from, to, porDia: porDiaArray, porTag: porTagArray, porVersion: porVersionArray });
  } catch (err) {
    console.error('Erro Azure:', err);
    res.status(500).json({ error: 'Erro ao consultar Azure DevOps' });
  }
});

app.get('/api/azure/evolucao', async (req, res) => {
  try {
    const now = new Date();
    const incResult = await db.execute('SELECT * FROM incidents ORDER BY created_at DESC');
    const incidents = incResult.rows;

    const promises = [];

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = d.toISOString().substring(0, 7);
      const fromStr = key + '-01';
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const toStr = lastDay.toISOString().substring(0, 10);

      promises.push(
        fetchAzureWorkItems(fromStr, toStr).then(cards => {
          const tagCount = {};
          cards.forEach(card => {
            const tagsStr = card.fields['System.Tags'] || '';
            const tags = tagsStr.split(';').map(t => t.trim()).filter(t => t.toLowerCase().startsWith('ongoing'));
            tags.forEach(tag => { tagCount[tag] = (tagCount[tag] || 0) + 1; });
          });

          const topTags = Object.entries(tagCount)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

          const monthIncidents = incidents.filter(inc => inc.created_at.substring(0, 7) === key);

          return { month: key, count: cards.length, topTags, incidents: monthIncidents };
        })
      );
    }

    const results = await Promise.all(promises);
    results.sort((a, b) => a.month.localeCompare(b.month));

    res.json(results);
  } catch (err) {
    console.error('Erro Azure evolução:', err);
    res.status(500).json({ error: 'Erro ao consultar Azure DevOps' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
