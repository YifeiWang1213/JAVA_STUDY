// 用法：
//   npm run new -- note "HashMap 底层原理"
//   npm run new -- algo "两数之和" 简单 https://leetcode.cn/problems/two-sum/
const fs = require('fs');
const path = require('path');

const [type, title, difficulty = '中等', source = ''] = process.argv.slice(2);
if (!['note', 'algo'].includes(type) || !title) {
  console.log('用法：npm run new -- note "标题"');
  console.log('      npm run new -- algo "题目名" [简单|中等|困难] [题目链接]');
  process.exit(1);
}

const today = new Date();
const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
  .map(n => String(n).padStart(2, '0')).join('-');
const slug = `${date}-${title.replace(/[\\/:*?"<>|\s]+/g, '-')}`;
const file = path.join(__dirname, '..', 'posts', `${slug}.md`);

if (fs.existsSync(file)) {
  console.log(`文件已存在：${file}`);
  process.exit(1);
}

const note = `---
title: ${title}
date: ${date}
category: 笔记
tags: [Java基础]
summary:
---

## 核心概念

## 代码示例

\`\`\`java

\`\`\`

## 常见面试题

## 小结
`;

const algo = `---
title: ${title}
date: ${date}
category: 刷题
tags: [数组]
difficulty: ${difficulty}
source: ${source}
summary:
---

## 题目描述

## 思路

## 代码

\`\`\`java
class Solution {

}
\`\`\`

## 复杂度分析

- 时间复杂度：O()
- 空间复杂度：O()

## 反思 / 易错点
`;

fs.writeFileSync(file, type === 'note' ? note : algo);
console.log(`已创建：posts/${slug}.md`);
