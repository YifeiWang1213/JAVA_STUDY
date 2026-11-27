// 网页写作后台：本地预览时保存到 posts/，线上时通过 GitHub API 提交到仓库
(function () {
  const CFG = window.SITE_CONFIG || {};
  const PM = window.PostMeta;
  const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const TOKEN_KEY = 'blog-gh-token';
  const DRAFT_PREFIX = 'blog-draft:';
  const enc = encodeURIComponent;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 存储：UTF-8 / Base64 ----------
  const toB64 = str => btoa(unescape(encodeURIComponent(str)));
  const fromB64 = b64 => decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));

  const LocalStore = {
    async load(slug) {
      const res = await fetch(`posts/${enc(slug)}.md`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('文章不存在');
      return res.text();
    },
    async save(slug, content) {
      await LocalStore.call('POST', '/api/posts', { slug, content });
    },
    async remove(slug) {
      await LocalStore.call('DELETE', `/api/posts/${enc(slug)}`);
    },
    async uploadImage(name, b64) {
      await LocalStore.call('POST', '/api/images', { name, data: b64 });
      return `images/${name}`;
    },
    async call(method, url, body) {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
      return data;
    },
  };

  const GitHubStore = {
    token: () => localStorage.getItem(TOKEN_KEY),
    async api(path, options = {}) {
      const res = await fetch(`https://api.github.com/repos/${CFG.repo}/${path}`, {
        cache: 'no-store',
        ...options,
        headers: {
          Authorization: `Bearer ${GitHubStore.token()}`,
          Accept: 'application/vnd.github+json',
          ...(options.headers || {}),
        },
      });
      if (res.status === 404) return null;
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('登录已失效，请重新登录');
      if (!res.ok) throw new Error(data.message || `GitHub 请求失败（${res.status}）`);
      return data;
    },
    contentsPath: p => 'contents/' + p.split('/').map(enc).join('/'),
    async getFile(p) {
      const data = await GitHubStore.api(`${GitHubStore.contentsPath(p)}?ref=${enc(CFG.branch)}`);
      return data && { text: fromB64(data.content), sha: data.sha };
    },
    async putFile(p, b64, sha, message) {
      return GitHubStore.api(GitHubStore.contentsPath(p), {
        method: 'PUT',
        body: JSON.stringify({ message, content: b64, branch: CFG.branch, ...(sha ? { sha } : {}) }),
      });
    },
    async updateIndex(slug, entry, message) {
      const idx = await GitHubStore.getFile('posts.json');
      let list = idx ? JSON.parse(idx.text) : [];
      list = list.filter(p => p.slug !== slug);
      if (entry && !entry.draft) list.push(entry);
      PM.sortPosts(list);
      await GitHubStore.putFile('posts.json', toB64(JSON.stringify(list, null, 2)), idx && idx.sha, message);
    },
    async load(slug) {
      const f = await GitHubStore.getFile(`posts/${slug}.md`);
      if (!f) throw new Error('文章不存在');
      return f.text;
    },
    async save(slug, content, entry) {
      const p = `posts/${slug}.md`;
      const old = await GitHubStore.getFile(p);
      const msg = `${old ? '更新' : '新增'}文章：${entry.title}`;
      await GitHubStore.putFile(p, toB64(content), old && old.sha, msg);
      await GitHubStore.updateIndex(slug, entry, `更新索引：${entry.title}`);
    },
    async remove(slug) {
      const p = `posts/${slug}.md`;
      const old = await GitHubStore.getFile(p);
      if (old) {
        await GitHubStore.api(GitHubStore.contentsPath(p), {
          method: 'DELETE',
          body: JSON.stringify({ message: `删除文章：${slug}`, sha: old.sha, branch: CFG.branch }),
        });
      }
      await GitHubStore.updateIndex(slug, null, `更新索引：删除 ${slug}`);
    },
    async uploadImage(name, b64) {
      await GitHubStore.putFile(`images/${name}`, b64, null, `上传图片：${name}`);
      return `https://raw.githubusercontent.com/${CFG.repo}/${CFG.branch}/images/${enc(name)}`;
    },
    async verify(token) {
      const res = await fetch(`https://api.github.com/repos/${CFG.repo}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Token 无效' : `无法访问仓库 ${CFG.repo}`);
      const data = await res.json();
      if (!data.permissions || !data.permissions.push) throw new Error('该 Token 没有这个仓库的写入权限');
    },
  };

  const Store = IS_LOCAL ? LocalStore : GitHubStore;
  const canEdit = () => IS_LOCAL || !!GitHubStore.token();

  // 线上登录后直接从 GitHub 读取最新内容，避免 Pages 部署延迟
  async function freshText(p) {
    if (IS_LOCAL || !GitHubStore.token()) return null;
    try {
      const f = await GitHubStore.getFile(p);
      return f ? f.text : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- 提示 ----------
  function toast(msg, type = 'ok', ms = 3000) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = `toast show ${type}`;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = 'toast'), ms);
  }

  // ---------- 登录页 ----------
  function renderLogin(app, next) {
    const tokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=' + enc('博客写作');
    app.innerHTML = `
      <div class="card narrow login">
        <h1 class="page-title">✍️ 登录写作后台</h1>
        <p class="muted">文章会保存到 GitHub 仓库 <b>${esc(CFG.repo)}</b>。请粘贴一个有该仓库写入权限的 GitHub Token，它只保存在当前浏览器中。</p>
        <input id="token-input" type="password" class="field" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
        <div class="login-actions">
          <button class="btn primary" id="login-btn">登录</button>
          <a href="${tokenUrl}" target="_blank" rel="noopener">还没有 Token？点这里生成（勾选 repo）</a>
        </div>
        <p class="muted small">提示：只在你自己的设备上登录；不用时可以在写作页点击「退出登录」。</p>
      </div>`;
    const input = document.getElementById('token-input');
    const btn = document.getElementById('login-btn');
    const submit = async () => {
      const token = input.value.trim();
      if (!token) return;
      btn.disabled = true;
      btn.textContent = '验证中…';
      try {
        await GitHubStore.verify(token);
        localStorage.setItem(TOKEN_KEY, token);
        toast('登录成功');
        location.hash = next || '#/write';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false;
        btn.textContent = '登录';
      }
    };
    btn.onclick = submit;
    input.onkeydown = e => { if (e.key === 'Enter') submit(); };
    input.focus();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    toast('已退出登录');
    location.hash = '#/';
  }

  // ---------- 编辑器 ----------
  let cleanup = null;

  async function renderWrite(app, slug, ctx) {
    if (cleanup) cleanup();
    if (!canEdit()) return renderLogin(app, location.hash);

    const isNew = !slug;
    let meta = { title: '', date: PM.today(), category: '笔记', tags: [], difficulty: '', source: '', summary: '', pinned: '' };
    let body = PM.TEMPLATES['笔记'];

    if (!isNew) {
      app.innerHTML = '<div class="loading">加载文章中…</div>';
      try {
        const parsed = PM.parseFrontMatter(await Store.load(slug));
        meta = { ...meta, ...parsed.meta };
        if (!Array.isArray(meta.tags)) meta.tags = meta.tags ? [meta.tags] : [];
        body = parsed.body;
      } catch (e) {
        app.innerHTML = `<div class="card narrow empty">${esc(e.message)}</div>`;
        return;
      }
    }

    const draftKey = DRAFT_PREFIX + (slug || 'new');
    let restored = false;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (d && (d.body !== body || JSON.stringify(d.meta) !== JSON.stringify(meta))) {
        meta = d.meta;
        body = d.body;
        restored = true;
      }
    } catch (e) { /* 草稿损坏时忽略 */ }

    app.innerHTML = `
      <div class="editor-page">
        <div class="card editor-head">
          <div class="editor-titlebar">
            <input id="ed-title" class="ed-title" placeholder="文章标题" value="${esc(meta.title)}" />
            <div class="editor-actions">
              <span class="muted small" id="ed-status">${IS_LOCAL ? '💻 本地模式' : '☁️ 保存到 GitHub'}</span>
              ${!IS_LOCAL ? '<button class="btn" id="ed-logout">退出登录</button>' : ''}
              <a class="btn" href="${isNew ? '#/' : '#/post/' + enc(slug)}">取消</a>
              <button class="btn primary" id="ed-save">${isNew ? '发布' : '保存'}</button>
            </div>
          </div>
          ${restored ? `<div class="restore-tip">已恢复上次未保存的草稿。<a href="javascript:void 0" id="ed-discard">放弃草稿</a></div>` : ''}
          <div class="editor-meta">
            <label>分类
              <select id="ed-category" class="field">
                <option ${meta.category === '笔记' ? 'selected' : ''}>笔记</option>
                <option ${meta.category === '刷题' ? 'selected' : ''}>刷题</option>
              </select>
            </label>
            <label class="algo-only">难度
              <select id="ed-difficulty" class="field">
                ${['简单', '中等', '困难'].map(d => `<option ${meta.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </label>
            <label>日期 <input id="ed-date" type="date" class="field" value="${esc(meta.date)}" /></label>
            <label class="grow">标签 <input id="ed-tags" class="field" placeholder="用逗号分隔，如：集合, 面试" value="${esc(meta.tags.join(', '))}" /></label>
            <label class="grow algo-only">原题链接 <input id="ed-source" class="field" placeholder="https://leetcode.cn/problems/..." value="${esc(meta.source)}" /></label>
            <label class="grow full">摘要 <input id="ed-summary" class="field" placeholder="可留空，自动截取正文" value="${esc(meta.summary)}" /></label>
            <label class="check"><input id="ed-pinned" type="checkbox" ${meta.pinned === 'true' ? 'checked' : ''} /> 置顶</label>
          </div>
        </div>

        <div class="card editor-card">
          <div class="editor-toolbar">
            <button data-act="h2" title="二级标题">H2</button>
            <button data-act="h3" title="三级标题">H3</button>
            <button data-act="bold" title="加粗 ⌘B"><b>B</b></button>
            <button data-act="italic" title="斜体 ⌘I"><i>I</i></button>
            <button data-act="code" title="行内代码">&lt;/&gt;</button>
            <button data-act="codeblock" title="Java 代码块">{ }</button>
            <button data-act="link" title="链接">🔗</button>
            <button data-act="image" title="上传图片（也可直接粘贴或拖入）">🖼️</button>
            <button data-act="ul" title="无序列表">•</button>
            <button data-act="ol" title="有序列表">1.</button>
            <button data-act="task" title="任务列表">☑</button>
            <button data-act="quote" title="引用">❝</button>
            <button data-act="table" title="表格">▦</button>
            <span class="sep"></span>
            <button data-act="template" title="用当前分类的模板替换正文">📄 模板</button>
            <span class="grow"></span>
            <div class="view-switch">
              <button data-view="edit">编辑</button>
              <button data-view="split" class="active">分屏</button>
              <button data-view="preview">预览</button>
            </div>
          </div>
          <div class="editor-main split" id="ed-main">
            <textarea id="ed-body" spellcheck="false" placeholder="在这里用 Markdown 写正文…">${esc(body)}</textarea>
            <div class="markdown-body ed-preview" id="ed-preview"></div>
          </div>
          <div class="editor-foot muted small">
            <span id="ed-count"></span>
            <span>支持 Markdown · ⌘/Ctrl + S 保存 · 粘贴或拖入图片自动上传</span>
          </div>
          <input type="file" id="ed-file" accept="image/*" hidden />
        </div>
      </div>`;

    const $ = id => document.getElementById(id);
    const ta = $('ed-body');
    const preview = $('ed-preview');
    const catSel = $('ed-category');
    let dirty = restored;
    let saving = false;

    function readMeta() {
      const category = catSel.value;
      return {
        title: $('ed-title').value.trim(),
        date: $('ed-date').value || PM.today(),
        category,
        tags: $('ed-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        difficulty: category === '刷题' ? $('ed-difficulty').value : '',
        source: category === '刷题' ? $('ed-source').value.trim() : '',
        summary: $('ed-summary').value.trim(),
        pinned: $('ed-pinned').checked ? 'true' : '',
      };
    }

    function toggleAlgo() {
      document.querySelectorAll('.algo-only').forEach(el => (el.style.display = catSel.value === '刷题' ? '' : 'none'));
    }

    let previewTimer = null;
    function renderPreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        preview.innerHTML = marked.parse(ta.value);
        preview.querySelectorAll('pre code').forEach(b => {
          if (/language-\w+/.test(b.className)) hljs.highlightElement(b);
          else b.classList.add('hljs');
        });
        $('ed-count').textContent = `${ta.value.replace(/\s/g, '').length} 字`;
      }, 150);
    }

    let draftTimer = null;
    function markDirty() {
      dirty = true;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        localStorage.setItem(draftKey, JSON.stringify({ meta: readMeta(), body: ta.value, time: Date.now() }));
        $('ed-status').textContent = '草稿已自动保存在本机';
      }, 800);
    }

    // ---- 文本操作 ----
    function replaceSel(fn) {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const { text, selStart, selEnd } = fn(value.slice(s, e));
      ta.focus();
      ta.setRangeText(text, s, e, 'end');
      if (selStart !== undefined) ta.setSelectionRange(s + selStart, s + selEnd);
      ta.dispatchEvent(new Event('input'));
    }
    const wrap = (before, after, placeholder) => replaceSel(sel => {
      const inner = sel || placeholder;
      return { text: before + inner + after, selStart: before.length, selEnd: before.length + inner.length };
    });
    function linePrefix(prefix) {
      const v = ta.value;
      const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      let end = v.indexOf('\n', ta.selectionEnd);
      if (end === -1) end = v.length;
      const lines = v.slice(start, end).split('\n');
      const out = lines.map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l).join('\n');
      ta.focus();
      ta.setSelectionRange(start, end);
      ta.setRangeText(out, start, end, 'end');
      ta.dispatchEvent(new Event('input'));
    }
    function insertBlock(text) {
      const before = ta.value.slice(0, ta.selectionStart);
      const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
      replaceSel(() => ({ text: pad + text }));
    }

    const actions = {
      h2: () => linePrefix('## '),
      h3: () => linePrefix('### '),
      bold: () => wrap('**', '**', '加粗文字'),
      italic: () => wrap('*', '*', '斜体文字'),
      code: () => wrap('`', '`', 'code'),
      codeblock: () => replaceSel(sel => {
        const pre = '```java\n';
        const inner = sel || '';
        return { text: pre + inner + '\n```\n', selStart: pre.length, selEnd: pre.length + inner.length };
      }),
      link: () => wrap('[', '](https://)', '链接文字'),
      image: () => $('ed-file').click(),
      ul: () => linePrefix('- '),
      ol: () => linePrefix(i => `${i + 1}. `),
      task: () => linePrefix('- [ ] '),
      quote: () => linePrefix('> '),
      table: () => insertBlock('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n'),
      template: () => {
        if (ta.value.trim() && !confirm('用模板替换当前正文？')) return;
        ta.value = PM.TEMPLATES[catSel.value];
        ta.dispatchEvent(new Event('input'));
      },
    };

    document.querySelectorAll('.editor-toolbar [data-act]').forEach(b => (b.onclick = () => actions[b.dataset.act]()));
    document.querySelectorAll('.view-switch button').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.view-switch button').forEach(x => x.classList.toggle('active', x === b));
        $('ed-main').className = `editor-main ${b.dataset.view}`;
      };
    });

    // ---- 图片上传 ----
    async function uploadImages(files) {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        const name = `${PM.today()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const placeholder = `![上传中 ${name}]()`;
        replaceSel(() => ({ text: placeholder }));
        try {
          const b64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1]);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const url = await Store.uploadImage(name, b64);
          ta.value = ta.value.replace(placeholder, `![图片](${url})`);
          toast('图片已上传');
        } catch (e) {
          ta.value = ta.value.replace(placeholder, '');
          toast('图片上传失败：' + e.message, 'err');
        }
        ta.dispatchEvent(new Event('input'));
      }
    }
    $('ed-file').onchange = e => { uploadImages([...e.target.files]); e.target.value = ''; };
    ta.addEventListener('paste', e => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); uploadImages(files); }
    });
    ta.addEventListener('dragover', e => e.preventDefault());
    ta.addEventListener('drop', e => {
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) { e.preventDefault(); uploadImages(files); }
    });

    // ---- 键盘 ----
    ta.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Tab') {
        e.preventDefault();
        replaceSel(() => ({ text: '    ' }));
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault(); actions.bold();
      } else if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault(); actions.italic();
      }
    });
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    document.addEventListener('keydown', onKey);
    const onUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    cleanup = () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
      cleanup = null;
    };

    // ---- 保存 ----
    async function save() {
      if (saving) return;
      const m = readMeta();
      if (!m.title) { toast('请填写标题', 'err'); $('ed-title').focus(); return; }

      let target = slug;
      if (isNew) {
        target = PM.makeSlug(m.date, m.title);
        const taken = new Set(ctx.getPosts().map(p => p.slug));
        for (let i = 2; taken.has(target); i++) target = `${PM.makeSlug(m.date, m.title)}-${i}`;
      }
      const content = PM.stringifyFrontMatter(m, ta.value);
      const entry = PM.makeEntry(target, content, m.date);

      saving = true;
      const btn = $('ed-save');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        await Store.save(target, content, entry);
        localStorage.removeItem(draftKey);
        dirty = false;
        ctx.upsertPost(entry, PM.parseFrontMatter(content).body);
        toast(IS_LOCAL ? '已保存 ✓' : '已发布 ✓ 约 1 分钟后访客可见', 'ok', 4000);
        location.hash = `#/post/${enc(target)}`;
      } catch (e) {
        toast('保存失败：' + e.message, 'err', 5000);
        if (/登录已失效/.test(e.message)) localStorage.removeItem(TOKEN_KEY);
      } finally {
        saving = false;
        if (document.getElementById('ed-save')) {
          btn.disabled = false;
          btn.textContent = isNew ? '发布' : '保存';
        }
      }
    }

    $('ed-save').onclick = save;
    if ($('ed-logout')) $('ed-logout').onclick = () => { if (!dirty || confirm('有未保存的内容，确定退出？')) { dirty = false; logout(); } };
    if ($('ed-discard')) {
      $('ed-discard').onclick = () => {
        localStorage.removeItem(draftKey);
        dirty = false;
        renderWrite(app, slug, ctx);
      };
    }
    catSel.onchange = () => {
      toggleAlgo();
      if (isNew && (ta.value === PM.TEMPLATES['笔记'] || ta.value === PM.TEMPLATES['刷题'])) {
        ta.value = PM.TEMPLATES[catSel.value];
        renderPreview();
      }
      markDirty();
    };
    ta.addEventListener('input', () => { renderPreview(); markDirty(); });
    document.querySelectorAll('.editor-meta .field, #ed-title, #ed-pinned').forEach(el => el.addEventListener('input', markDirty));

    toggleAlgo();
    renderPreview();
    if (isNew && !restored) $('ed-title').focus();
  }

  async function deletePost(slug, ctx) {
    const p = ctx.getPosts().find(x => x.slug === slug);
    if (!confirm(`确定删除「${p ? p.title : slug}」？此操作不可恢复。`)) return;
    try {
      await Store.remove(slug);
      ctx.removePost(slug);
      toast('已删除');
      location.hash = '#/';
    } catch (e) {
      toast('删除失败：' + e.message, 'err', 5000);
    }
  }

  window.BlogEditor = { canEdit, renderWrite, renderLogin, deletePost, freshText, isLocal: IS_LOCAL, leave: () => cleanup && cleanup() };
})();
