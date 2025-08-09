const fs = require('fs');
const path = require('path');
const axios = require('axios');

function cosine(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i=0;i<len;i+=1){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function cheapHashEmbed(text, dims = 256) {
  const v = new Array(dims).fill(0);
  for (const ch of text) { const i = ch.charCodeAt(0) % dims; v[i] += 1; }
  const norm = Math.sqrt(v.reduce((s,x)=>s+x*x,0)) || 1; return v.map(x=>x/norm);
}

async function openAiEmbed({ text, model = 'text-embedding-3-small', key = process.env.OPENAI_API_KEY }) {
  if (!key) return cheapHashEmbed(text);
  const res = await axios.post('https://api.openai.com/v1/embeddings', {
    model, input: text
  }, { headers: { Authorization: `Bearer ${key}` } });
  return res.data?.data?.[0]?.embedding || cheapHashEmbed(text);
}

class VectorStore {
  constructor({ file = path.join(process.cwd(), 'data', 'vectors.json') } = {}) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf-8') || '[]'); } catch { this.data = []; }
  }
  persist(){ try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8'); } catch {} }

  async add({ text, meta }) {
    const vector = await openAiEmbed({ text });
    const item = { id: String(Date.now())+Math.random().toString(36).slice(2), text, vector, meta };
    this.data.push(item); this.persist();
    return item;
  }

  async search({ query, topK = 5 }) {
    const qv = await openAiEmbed({ text: query });
    const scored = this.data.map((d)=>({ d, score: cosine(qv, d.vector) })).sort((a,b)=>b.score-a.score);
    return scored.slice(0, topK).map(s=>({ id: s.d.id, text: s.d.text, meta: s.d.meta, score: s.score }));
  }
}

module.exports = { VectorStore };


