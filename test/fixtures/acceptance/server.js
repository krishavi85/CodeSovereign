'use strict';
// Backend: a dependency-free HTTP API + static file server for the task board.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { listTasks, addTask } = require('./src/repository');

const portArg = (process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1];
const PORT = process.env.PORT || portArg || 4319;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/tasks' && req.method === 'GET') {
      return send(res, 200, { tasks: await listTasks() });
    }
    if (req.url === '/api/tasks' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', async () => {
        try {
          const { title } = JSON.parse(raw || '{}');
          if (!title || typeof title !== 'string') return send(res, 400, { error: 'title required' });
          const task = await addTask(title.slice(0, 200));
          send(res, 201, { task });
        } catch (e) { send(res, 500, { error: String(e.message) }); }
      });
      return;
    }
    // static
    const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const file = path.join(PUBLIC, rel.replace(/\.\./g, ''));
    if (file.startsWith(PUBLIC) && fs.existsSync(file)) {
      return send(res, 200, fs.readFileSync(file, 'utf8'), MIME[path.extname(file)] || 'text/plain');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: String(e.message) }); }
});

if (require.main === module) {
  server.listen(PORT, () => console.log('task board on http://localhost:' + PORT));
}
module.exports = { server };
