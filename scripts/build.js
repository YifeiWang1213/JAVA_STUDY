// 扫描 posts/ 下的 Markdown，生成 posts.json 索引
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUTPUT = path.join(ROOT, 'posts.json');

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return v.replace(/^['"]|['"]$/g, '');
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key) meta[key] = parseValue(line.slice(idx + 1));
  }
  return { meta, body: text.slice(match[0].length) };
}

function toPlainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function build() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = files.map(file => {
    const text = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { meta, body } = parseFrontMatter(text);
    const plain = toPlainText(body);
    const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
    return {
      slug: file.replace(/\.md$/, ''),
      title: meta.title || file.replace(/\.md$/, ''),
      date: meta.date || fs.statSync(path.join(POSTS_DIR, file)).mtime.toISOString().slice(0, 10),
      category: meta.category || '笔记',
      tags,
      difficulty: meta.difficulty || '',
      source: meta.source || '',
      summary: meta.summary || plain.slice(0, 120),
      pinned: meta.pinned === 'true',
      draft: meta.draft === 'true',
      words: body.replace(/\s/g, '').length,
      text: plain.slice(0, 3000),
    };
  }).filter(p => !p.draft);

  posts.sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  fs.writeFileSync(OUTPUT, JSON.stringify(posts, null, 2));
  console.log(`[build] 已生成 posts.json，共 ${posts.length} 篇文章`);
  return posts;
}

module.exports = { build, parseFrontMatter };

if (require.main === module) build();
