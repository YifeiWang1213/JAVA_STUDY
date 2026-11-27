(function () {
  const CFG = window.SITE_CONFIG || {};
  const app = document.getElementById('app');
  const PAGE_SIZE = 10;
  let POSTS = [];
  const mdCache = {};

  // ---------- 工具函数 ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const diffClass = d => ({ '简单': 'easy', '中等': 'medium', '困难': 'hard' }[d] || '');

  function stripFrontMatter(text) {
    return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  function slugifyHeading(text, used) {
    let id = text.trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'section';
    let n = 1, base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  }

  function readingTime(words) {
    return Math.max(1, Math.round(words / 400));
  }

  // ---------- 组件 ----------
  function postCard(p) {
    return `
      <article class="card post-card">
        <a class="post-card-link" href="#/post/${enc(p.slug)}">
          <div class="post-card-meta">
            <span class="badge badge-${p.category === '刷题' ? 'algo' : 'note'}">${esc(p.category)}</span>
            ${p.difficulty ? `<span class="badge diff ${diffClass(p.difficulty)}">${esc(p.difficulty)}</span>` : ''}
            ${p.pinned ? '<span class="badge pin">置顶</span>' : ''}
            <span class="muted">${esc(p.date)}</span>
            <span class="muted">· 约 ${readingTime(p.words)} 分钟</span>
          </div>
          <h2 class="post-card-title">${esc(p.title)}</h2>
          <p class="post-card-summary">${esc(p.summary)}</p>
        </a>
        <div class="tag-list">${p.tags.map(t => `<a class="tag" href="#/tag/${enc(t)}">#${esc(t)}</a>`).join('')}</div>
      </article>`;
  }

  function pagination(total, page, base) {
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return '';
    let html = '<div class="pagination">';
    for (let i = 1; i <= pages; i++) {
      html += `<a class="${i === page ? 'active' : ''}" href="${base}${i === 1 ? '' : (base.includes('?') ? '&' : '?') + 'page=' + i}">${i}</a>`;
    }
    return html + '</div>';
  }

  function tagCounts() {
    const map = {};
    POSTS.forEach(p => p.tags.forEach(t => (map[t] = (map[t] || 0) + 1)));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function sidebar() {
    const notes = POSTS.filter(p => p.category === '笔记').length;
    const algos = POSTS.filter(p => p.category === '刷题');
    const diff = { '简单': 0, '中等': 0, '困难': 0 };
    algos.forEach(p => { if (p.difficulty in diff) diff[p.difficulty]++; });
    const total = algos.length || 1;
    const roadmap = CFG.roadmap || [];
    const done = roadmap.filter(r => r.done).length;

    return `
      <aside class="sidebar">
        <div class="card profile">
          <div class="avatar">${esc(CFG.avatar || '☕')}</div>
          <div class="profile-name">${esc(CFG.author || '')}</div>
          <p class="muted profile-bio">${esc(CFG.bio || '')}</p>
          <div class="stats">
            <a href="#/category/笔记"><b>${notes}</b><span>笔记</span></a>
            <a href="#/category/刷题"><b>${algos.length}</b><span>题解</span></a>
            <a href="#/tags"><b>${tagCounts().length}</b><span>标签</span></a>
          </div>
        </div>

        <div class="card">
          <h3 class="side-title">刷题进度</h3>
          ${['简单', '中等', '困难'].map(d => `
            <div class="bar-row">
              <span class="diff ${diffClass(d)}">${d}</span>
              <div class="bar"><div class="bar-fill ${diffClass(d)}" style="width:${(diff[d] / total) * 100}%"></div></div>
              <span class="muted">${diff[d]}</span>
            </div>`).join('')}
        </div>

        ${roadmap.length ? `
        <div class="card">
          <h3 class="side-title">学习路线 <span class="muted">${done}/${roadmap.length}</span></h3>
          <ul class="roadmap">
            ${roadmap.map(r => `<li class="${r.done ? 'done' : ''}">${r.done ? '✅' : '⬜'} ${esc(r.name)}</li>`).join('')}
          </ul>
        </div>` : ''}

        <div class="card">
          <h3 class="side-title">热门标签</h3>
          <div class="tag-cloud">
            ${tagCounts().slice(0, 20).map(([t, c]) => `<a class="tag" href="#/tag/${enc(t)}">${esc(t)} <sup>${c}</sup></a>`).join('')}
          </div>
        </div>
      </aside>`;
  }

  function listLayout(title, list, page, base, extra = '') {
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return `
      <div class="layout">
        <section class="main-col">
          ${title ? `<h1 class="page-title">${title}</h1>` : ''}
          ${extra}
          ${slice.length ? slice.map(postCard).join('') : '<div class="card empty">这里还没有文章，快去写一篇吧 ✍️</div>'}
          ${pagination(list.length, page, base)}
        </section>
        ${sidebar()}
      </div>`;
  }

  // ---------- 页面 ----------
  function renderHome(q) {
    const page = +q.page || 1;
    const hero = page === 1 ? `
      <div class="hero card">
        <h1>${esc(CFG.title)}</h1>
        <p>${esc(CFG.bio)}</p>
      </div>` : '';
    app.innerHTML = listLayout('', POSTS, page, '#/', hero);
  }

  function renderCategory(cat, q) {
    let list = POSTS.filter(p => p.category === cat);
    const diff = q.diff || '';
    let filters = '';
    if (cat === '刷题') {
      if (diff) list = list.filter(p => p.difficulty === diff);
      filters = `<div class="filters">
        ${['', '简单', '中等', '困难'].map(d => `<a class="chip ${d === diff ? 'active' : ''}" href="#/category/${enc(cat)}${d ? '?diff=' + enc(d) : ''}">${d || '全部'}</a>`).join('')}
      </div>`;
    }
    const base = `#/category/${enc(cat)}${diff ? '?diff=' + enc(diff) : ''}`;
    app.innerHTML = listLayout(`${cat === '刷题' ? '🧩 刷题思路' : '📒 学习笔记'} <span class="muted">(${list.length})</span>`, list, +q.page || 1, base, filters);
  }

  function renderTag(tag, q) {
    const list = POSTS.filter(p => p.tags.includes(tag));
    app.innerHTML = listLayout(`# ${esc(tag)} <span class="muted">(${list.length})</span>`, list, +q.page || 1, `#/tag/${enc(tag)}`);
  }

  function renderTags() {
    const tags = tagCounts();
    const max = Math.max(1, ...tags.map(t => t[1]));
    app.innerHTML = `
      <div class="card narrow">
        <h1 class="page-title">🏷️ 全部标签 <span class="muted">(${tags.length})</span></h1>
        <div class="tag-cloud big">
          ${tags.map(([t, c]) => `<a class="tag" style="font-size:${0.9 + (c / max) * 0.7}rem" href="#/tag/${enc(t)}">${esc(t)} <sup>${c}</sup></a>`).join('')}
        </div>
      </div>`;
  }

  function renderArchive() {
    const groups = {};
    [...POSTS].sort((a, b) => b.date.localeCompare(a.date)).forEach(p => {
      const ym = p.date.slice(0, 7);
      (groups[ym] = groups[ym] || []).push(p);
    });
    app.innerHTML = `
      <div class="card narrow">
        <h1 class="page-title">🗂️ 归档 <span class="muted">共 ${POSTS.length} 篇</span></h1>
        <div class="timeline">
          ${Object.entries(groups).map(([ym, list]) => `
            <h2 class="timeline-month">${ym}</h2>
            <ul>
              ${list.map(p => `
                <li>
                  <span class="muted">${p.date.slice(5)}</span>
                  <span class="badge badge-${p.category === '刷题' ? 'algo' : 'note'}">${esc(p.category)}</span>
                  <a href="#/post/${enc(p.slug)}">${esc(p.title)}</a>
                </li>`).join('')}
            </ul>`).join('')}
        </div>
      </div>`;
  }

  function renderAbout() {
    const roadmap = CFG.roadmap || [];
    app.innerHTML = `
      <div class="card narrow about">
        <div class="avatar big">${esc(CFG.avatar || '☕')}</div>
        <h1>${esc(CFG.author)}</h1>
        <p>${esc(CFG.bio)}</p>
        <p class="links">
          ${CFG.github ? `<a href="${esc(CFG.github)}" target="_blank" rel="noopener">GitHub</a>` : ''}
          ${CFG.email ? `<a href="mailto:${esc(CFG.email)}">Email</a>` : ''}
        </p>
        ${roadmap.length ? `<h2>学习路线</h2><ul class="roadmap">${roadmap.map(r => `<li class="${r.done ? 'done' : ''}">${r.done ? '✅' : '⬜'} ${esc(r.name)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  async function renderPost(slug) {
    const idx = POSTS.findIndex(p => p.slug === slug);
    const p = POSTS[idx];
    if (!p) return renderNotFound();

    if (!mdCache[slug]) {
      const res = await fetch(`posts/${enc(slug)}.md`, { cache: 'no-cache' });
      if (!res.ok) return renderNotFound();
      mdCache[slug] = stripFrontMatter(await res.text());
    }

    const html = marked.parse(mdCache[slug]);
    const newer = POSTS[idx - 1], older = POSTS[idx + 1];

    app.innerHTML = `
      <div class="post-layout">
        <article class="card post">
          <header class="post-header">
            <h1>${esc(p.title)}</h1>
            <div class="post-card-meta">
              <span class="badge badge-${p.category === '刷题' ? 'algo' : 'note'}">${esc(p.category)}</span>
              ${p.difficulty ? `<span class="badge diff ${diffClass(p.difficulty)}">${esc(p.difficulty)}</span>` : ''}
              <span class="muted">📅 ${esc(p.date)}</span>
              <span class="muted">📝 ${p.words} 字 · 约 ${readingTime(p.words)} 分钟</span>
              ${p.source ? `<a class="source-link" href="${esc(p.source)}" target="_blank" rel="noopener">🔗 原题链接</a>` : ''}
            </div>
            <div class="tag-list">${p.tags.map(t => `<a class="tag" href="#/tag/${enc(t)}">#${esc(t)}</a>`).join('')}</div>
          </header>
          <div class="markdown-body" id="post-body">${html}</div>
          <nav class="post-nav">
            ${newer ? `<a href="#/post/${enc(newer.slug)}">← ${esc(newer.title)}</a>` : '<span></span>'}
            ${older ? `<a href="#/post/${enc(older.slug)}">${esc(older.title)} →</a>` : '<span></span>'}
          </nav>
        </article>
        <aside class="toc-wrap"><div class="card toc" id="toc"></div></aside>
      </div>`;

    enhancePost();
    document.title = `${p.title} | ${CFG.title}`;
  }

  function enhancePost() {
    const body = document.getElementById('post-body');

    body.querySelectorAll('pre code').forEach(block => {
      const lang = (block.className.match(/language-(\w+)/) || [])[1];
      if (lang) hljs.highlightElement(block);
      else block.classList.add('hljs');
      const pre = block.parentElement;
      const bar = document.createElement('div');
      bar.className = 'code-bar';
      bar.innerHTML = `<span>${esc(lang || 'text')}</span><button>复制</button>`;
      bar.querySelector('button').onclick = e => {
        navigator.clipboard.writeText(block.innerText).then(() => {
          e.target.textContent = '已复制 ✓';
          setTimeout(() => (e.target.textContent = '复制'), 1500);
        });
      };
      pre.prepend(bar);
    });

    body.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });

    const used = new Set();
    const heads = [...body.querySelectorAll('h2, h3')];
    heads.forEach(h => (h.id = slugifyHeading(h.textContent, used)));
    const toc = document.getElementById('toc');
    if (!heads.length) { toc.parentElement.remove(); return; }
    toc.innerHTML = '<div class="side-title">目录</div>' + heads.map(h =>
      `<a class="toc-${h.tagName.toLowerCase()}" data-id="${h.id}">${esc(h.textContent)}</a>`).join('');
    toc.querySelectorAll('a').forEach(a => {
      a.onclick = () => document.getElementById(a.dataset.id).scrollIntoView({ behavior: 'smooth' });
    });

    const links = [...toc.querySelectorAll('a')];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          links.forEach(l => l.classList.toggle('active', l.dataset.id === en.target.id));
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    heads.forEach(h => observer.observe(h));
  }

  function renderNotFound() {
    app.innerHTML = `<div class="card narrow empty"><h1>404</h1><p>文章不存在 😢</p><a href="#/">返回首页</a></div>`;
  }

  // ---------- 路由 ----------
  function parseHash() {
    const raw = location.hash.slice(1) || '/';
    const [p, qs = ''] = raw.split('?');
    const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
    const q = Object.fromEntries(new URLSearchParams(qs));
    return { parts, q };
  }

  function route() {
    const { parts, q } = parseHash();
    const [name, arg] = parts;
    document.title = CFG.title;
    document.querySelectorAll('.nav a').forEach(a => {
      const key = a.dataset.nav;
      a.classList.toggle('active',
        (key === 'home' && !name) || key === name || (name === 'category' && key === arg));
    });
    document.querySelector('.nav').classList.remove('open');

    if (!name) renderHome(q);
    else if (name === 'post') renderPost(arg);
    else if (name === 'category') renderCategory(arg, q);
    else if (name === 'tag') renderTag(arg, q);
    else if (name === 'tags') renderTags();
    else if (name === 'archive') renderArchive();
    else if (name === 'about') renderAbout();
    else renderNotFound();

    window.scrollTo(0, 0);
  }

  // ---------- 搜索 ----------
  const mask = document.getElementById('search-mask');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  function openSearch() { mask.hidden = false; input.value = ''; results.innerHTML = ''; input.focus(); }
  function closeSearch() { mask.hidden = true; }

  function highlight(text, kw) {
    const i = text.toLowerCase().indexOf(kw.toLowerCase());
    if (i === -1) return esc(text.slice(0, 80));
    const start = Math.max(0, i - 30);
    return (start ? '…' : '') + esc(text.slice(start, i)) + '<mark>' + esc(text.slice(i, i + kw.length)) + '</mark>' + esc(text.slice(i + kw.length, i + kw.length + 50)) + '…';
  }

  input.addEventListener('input', () => {
    const kw = input.value.trim();
    if (!kw) { results.innerHTML = ''; return; }
    const k = kw.toLowerCase();
    const hits = POSTS.filter(p =>
      p.title.toLowerCase().includes(k) ||
      p.tags.some(t => t.toLowerCase().includes(k)) ||
      p.text.toLowerCase().includes(k));
    results.innerHTML = hits.length ? hits.map(p => `
      <a class="search-item" href="#/post/${enc(p.slug)}">
        <div class="search-title">${highlight(p.title, kw)}</div>
        <div class="muted">${highlight(p.text, kw)}</div>
      </a>`).join('') : '<div class="muted search-empty">没有找到相关内容</div>';
    results.querySelectorAll('a').forEach(a => (a.onclick = closeSearch));
  });

  mask.addEventListener('click', e => { if (e.target === mask) closeSearch(); });
  document.getElementById('search-btn').onclick = openSearch;
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });

  // ---------- 主题 / 杂项 ----------
  function applyHlTheme() {
    document.getElementById('hl-theme').href =
      document.documentElement.dataset.theme === 'dark' ? 'vendor/hl-dark.css' : 'vendor/hl-light.css';
  }
  document.getElementById('theme-btn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    localStorage.setItem('theme', t);
    applyHlTheme();
  };
  document.getElementById('menu-btn').onclick = () => document.querySelector('.nav').classList.toggle('open');

  const backTop = document.getElementById('back-top');
  window.addEventListener('scroll', () => backTop.classList.toggle('show', scrollY > 400));
  backTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // ---------- 启动 ----------
  async function init() {
    applyHlTheme();
    document.getElementById('site-title').textContent = CFG.title;
    document.getElementById('footer-text').innerHTML =
      `© ${CFG.since || ''}${CFG.since && CFG.since < new Date().getFullYear() ? ' - ' + new Date().getFullYear() : ''} ${esc(CFG.author)} · 持续学习，持续记录`;
    marked.setOptions({ gfm: true, breaks: false });
    try {
      const res = await fetch('posts.json', { cache: 'no-cache' });
      POSTS = await res.json();
    } catch (e) {
      app.innerHTML = '<div class="card empty">无法加载 posts.json，请先运行 <code>npm run build</code>，并通过 <code>npm run dev</code> 启动（不要直接双击打开 html）。</div>';
      return;
    }
    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
