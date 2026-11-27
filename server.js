// 本地预览服务器：零依赖，启动时构建索引，posts/ 变化时自动重建
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('./scripts/build');

const ROOT = __dirname;
const PORT = process.env.PORT || 4000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

build();

let timer = null;
fs.watch(path.join(ROOT, 'posts'), () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { build(); } catch (e) { console.error('[build] 失败：', e.message); }
  }, 200);
});

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function postFile(slug) {
  if (!slug || /[\\/]|\.\./.test(slug)) return null;
  return path.join(ROOT, 'posts', `${slug}.md`);
}

function readJson(req, res, handler) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      handler(JSON.parse(body));
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
  });
}

function handleApi(req, res, urlPath) {
  if (req.method === 'POST' && urlPath === '/api/posts') {
    return readJson(req, res, ({ slug, content }) => {
      const file = postFile(slug);
      if (!file || typeof content !== 'string') return sendJson(res, 400, { error: '参数错误' });
      fs.writeFileSync(file, content);
      build();
      sendJson(res, 200, { ok: true });
    });
  }
  if (req.method === 'POST' && urlPath === '/api/images') {
    return readJson(req, res, ({ name, data }) => {
      if (!/^[\w.-]+\.(png|jpg|gif|webp|svg)$/.test(name || '') || typeof data !== 'string') {
        return sendJson(res, 400, { error: '参数错误' });
      }
      fs.mkdirSync(path.join(ROOT, 'images'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'images', name), Buffer.from(data, 'base64'));
      sendJson(res, 200, { ok: true });
    });
  }
  if (req.method === 'DELETE' && urlPath.startsWith('/api/posts/')) {
    const file = postFile(urlPath.slice('/api/posts/'.length));
    if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: '文章不存在' });
    fs.unlinkSync(file);
    build();
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: 'Not Found' });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApi(req, res, decodeURIComponent(req.url.split('?')[0]));
  }
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`博客已启动：http://localhost:${PORT}`);
});
