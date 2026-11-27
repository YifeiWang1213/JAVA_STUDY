// 用法：
//   npm run new -- note "HashMap 底层原理"
//   npm run new -- algo "两数之和" 简单 https://leetcode.cn/problems/two-sum/
const fs = require('fs');
const path = require('path');
const { stringifyFrontMatter, today, makeSlug, TEMPLATES } = require('../assets/postmeta');

const [type, title, difficulty = '中等', source = ''] = process.argv.slice(2);
if (!['note', 'algo'].includes(type) || !title) {
  console.log('用法：npm run new -- note "标题"');
  console.log('      npm run new -- algo "题目名" [简单|中等|困难] [题目链接]');
  process.exit(1);
}

const date = today();
const slug = makeSlug(date, title);
const file = path.join(__dirname, '..', 'posts', `${slug}.md`);

if (fs.existsSync(file)) {
  console.log(`文件已存在：${file}`);
  process.exit(1);
}

const category = type === 'note' ? '笔记' : '刷题';
const meta = type === 'note'
  ? { title, date, category, tags: ['Java基础'] }
  : { title, date, category, tags: ['数组'], difficulty, source };

fs.writeFileSync(file, stringifyFrontMatter(meta, TEMPLATES[category]));
console.log(`已创建：posts/${slug}.md`);
