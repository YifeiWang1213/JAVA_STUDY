// 扫描 posts/ 下的 Markdown，生成 posts.json 索引
const fs = require('fs');
const path = require('path');
const { makeEntry, sortPosts } = require('../assets/postmeta');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUTPUT = path.join(ROOT, 'posts.json');

function build() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = files.map(file => {
    const full = path.join(POSTS_DIR, file);
    const mtime = fs.statSync(full).mtime.toISOString().slice(0, 10);
    return makeEntry(file.replace(/\.md$/, ''), fs.readFileSync(full, 'utf8'), mtime);
  }).filter(p => !p.draft);

  sortPosts(posts);
  fs.writeFileSync(OUTPUT, JSON.stringify(posts, null, 2));
  console.log(`[build] 已生成 posts.json，共 ${posts.length} 篇文章`);
  return posts;
}

module.exports = { build };

if (require.main === module) build();
