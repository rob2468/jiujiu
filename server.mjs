import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const index = process.argv.indexOf('--port');
const rawPort = index >= 0 ? process.argv[index + 1] : (process.env.PORT || '5173');
const port = Number(rawPort);
if (!/^\d+$/.test(rawPort || '') || !Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('请选择 1024–65535 之间的端口，例如：node server.mjs --port 5174');
  process.exit(1);
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/core.js', ['core.js', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  const file = files.get(path);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const bytes = await readFile(fileURLToPath(new URL(`./dist/${file[0]}`, import.meta.url)));
    res.writeHead(200, {
      'Content-Type': file[1],
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(500); res.end('无法读取应用文件，请重新解压完整源码包。');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已占用。请运行：node server.mjs --port ${port < 65535 ? port + 1 : 5173}`
    : `启动失败：${error.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`九九小课堂已在本机启动：http://127.0.0.1:${port}`);
  console.log('用浏览器打开上面的地址。按 Ctrl+C 停止。此服务仅接受本机连接。');
});
