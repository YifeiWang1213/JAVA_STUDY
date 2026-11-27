// 文章元数据解析与模板：浏览器（编辑器）和 Node（构建脚本）共用
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PostMeta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
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

  function stringifyFrontMatter(meta, body) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
      lines.push(`${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
    }
    lines.push('---', '');
    return lines.join('\n') + body.replace(/^\n+/, '');
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

  function makeEntry(slug, text, fallbackDate) {
    const { meta, body } = parseFrontMatter(text);
    const plain = toPlainText(body);
    const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
    return {
      slug,
      title: meta.title || slug,
      date: meta.date || fallbackDate,
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
  }

  function sortPosts(posts) {
    return posts.sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  }

  function today() {
    const d = new Date();
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  }

  function makeSlug(date, title) {
    return `${date}-${title.trim().replace(/[\\/:*?"<>|#%\s]+/g, '-').replace(/^-+|-+$/g, '')}`;
  }

  const TEMPLATES = {
    笔记: `## 核心概念

## 代码示例

\`\`\`java

\`\`\`

## 常见面试题

## 小结
`,
    刷题: `## 题目描述

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
`,
  };

  return { parseFrontMatter, stringifyFrontMatter, toPlainText, makeEntry, sortPosts, today, makeSlug, TEMPLATES };
});
