/* engine.js — REAL engine for CodeSovereign
   - Virtual File System (localStorage-backed)
   - Project management with templates
   - Real agent workflow (Planner/Architect/Coder/Tester/Reviewer)
   - Real validators (HTML/JS/console/a11y/security)
   - Real preview (single-HTML iframe build)
   - Real deploy (JSON bundle download)
   Exposed as window.Engine
*/
(function(){
  'use strict';
  const NS = 'cs.fs.v1';
  const NS_PROJ = 'cs.proj.v1';

  // ---------- Storage helpers ----------
  function loadFS(){
    try { return JSON.parse(localStorage.getItem(NS)) || {}; }
    catch(e){ return {}; }
  }
  function saveFS(fs){ localStorage.setItem(NS, JSON.stringify(fs)); }
  function loadProj(){
    try { return JSON.parse(localStorage.getItem(NS_PROJ)) || { current: null, list: {} }; }
    catch(e){ return { current: null, list: {} }; }
  }
  function saveProj(p){ localStorage.setItem(NS_PROJ, JSON.stringify(p)); }

  // ---------- Virtual File System ----------
  // fs is an object: { "/path/to/file": { type: "file", content: "..." } }
  const FS = {
    _data: loadFS(),
    _list(){ return this._data; },
    exists(p){ return !!this._data[p]; },
    isFile(p){ return this._data[p] && this._data[p].type === 'file'; },
    read(p){ const e = this._data[p]; return e ? e.content : null; },
    write(p, content){
      this._data[p] = { type: 'file', content: String(content), updatedAt: Date.now() };
      saveFS(this._data);
    },
    remove(p){
      // remove file and any descendants
      Object.keys(this._data).forEach(k => {
        if (k === p || k.startsWith(p + '/')) delete this._data[k];
      });
      saveFS(this._data);
    },
    mkdir(p){
      // implicit in our model — directories don't need explicit nodes
      // but mark a sentinel so list() shows them
      this._data[p] = { type: 'dir', updatedAt: Date.now() };
      saveFS(this._data);
    },
    clear(){
      this._data = {};
      saveFS(this._data);
    },
    clearAll(){
      // alias for clear() to match the app's expected API
      this.clear();
    },
    list(prefix){
      const out = [];
      const seenDirs = new Set();
      const base = prefix || '';
      Object.keys(this._data).forEach(k => {
        if (base && !k.startsWith(base)) return;
        const rest = base ? k.slice(base.length).replace(/^\//, '') : k;
        if (!rest) return;
        const parts = rest.split('/');
        if (parts.length > 1){
          // file inside subdir
          const dir = base + (base.endsWith('/') ? '' : '/') + parts[0];
          if (!seenDirs.has(dir)){ seenDirs.add(dir); out.push({ path: dir, name: parts[0], type: 'dir' }); }
          const meta = this._data[k];
          out.push({ path: k, name: parts.slice(-1)[0], type: 'file', size: (meta.content||'').length, mtime: meta.updatedAt || 0, content: meta.content || '' });
        } else {
          const meta = this._data[k];
          out.push({ path: k, name: parts[0], type: meta.type, size: (meta.content||'').length, mtime: meta.updatedAt || 0, content: meta.content || '' });
        }
      });
      return out;
    },
    tree(prefix){
      // returns a hierarchical tree structure for the UI
      const items = this.list(prefix);
      const root = { name: prefix ? prefix.split('/').pop() || 'project' : '/', path: prefix || '/', type: 'dir', children: [] };
      const byPath = {};
      items.forEach(it => {
        if (it.type === 'dir'){
          byPath[it.path] = byPath[it.path] || { name: it.name, path: it.path, type: 'dir', children: [] };
        } else {
          const parentPath = it.path.includes('/') ? it.path.slice(0, it.path.lastIndexOf('/')) : (prefix || '');
          const parent = byPath[parentPath] || (parentPath === (prefix || '') ? root : null);
          if (parent){
            parent.children.push({ name: it.name, path: it.path, type: 'file' });
          } else {
            root.children.push({ name: it.name, path: it.path, type: 'file' });
          }
        }
      });
      // nest directories under their parents
      Object.values(byPath).forEach(d => {
        const parentPath = d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : (prefix || '');
        if (parentPath === (prefix || '')) { root.children.unshift(d); }
      });
      return root;
    },
    count(){ return Object.keys(this._data).filter(k => this._data[k].type === 'file').length; },
    totalSize(){
      let bytes = 0;
      Object.values(this._data).forEach(n => { if (n.type === 'file') bytes += (n.content || '').length; });
      return bytes;
    },
  };

  // ---------- Project Templates ----------
  // Each template returns an array of [path, content] pairs to seed the FS
  const TEMPLATES = {
    'saas-dashboard': function(){
      return [
        ['/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SaaS Dashboard</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<aside class="sidebar"><div class="brand">◆ Pulse</div><nav>
<a class="active">Overview</a><a>Customers</a><a>Billing</a><a>Reports</a><a>Settings</a>
</nav></aside>
<main>
<header><h1>Overview</h1><input placeholder="Search…"></header>
<section class="kpis">
<div class="kpi"><span class="lbl">MRR</span><span class="val">$48,210</span><span class="delta up">+12.4%</span></div>
<div class="kpi"><span class="lbl">Active users</span><span class="val">9,431</span><span class="delta up">+3.1%</span></div>
<div class="kpi"><span class="lbl">Churn</span><span class="val">2.7%</span><span class="delta down">-0.4%</span></div>
<div class="kpi"><span class="lbl">Trials</span><span class="val">381</span><span class="delta up">+18</span></div>
</section>
<section class="card"><h2>Revenue (last 30 days)</h2><div id="chart"></div></section>
<section class="card"><h2>Recent activity</h2><ul id="activity"></ul></section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`],
        ['/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--warn:#ff9f43;--bad:#ea5455}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Segoe UI,Inter,sans-serif}
.sidebar{position:fixed;inset:0 auto 0 0;width:220px;background:#0f1218;border-right:1px solid var(--line);padding:18px}
.brand{font-weight:700;font-size:18px;margin-bottom:18px;color:var(--acc)}
.sidebar nav a{display:block;padding:9px 12px;border-radius:8px;color:var(--mut);text-decoration:none;cursor:pointer;margin-bottom:2px}
.sidebar nav a.active,.sidebar nav a:hover{background:#1a1f2c;color:var(--fg)}
main{margin-left:240px;padding:24px;max-width:1200px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
header h1{margin:0;font-size:22px}
header input{background:#141821;border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;min-width:240px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:4px}
.kpi .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.kpi .val{font-size:22px;font-weight:700}
.kpi .delta{font-size:12px}.delta.up{color:var(--ok)}.delta.down{color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:14px}
.card h2{margin:0 0 12px 0;font-size:15px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
#chart{height:160px;display:flex;align-items:flex-end;gap:4px}
#chart .bar{flex:1;background:linear-gradient(180deg,var(--acc),#4b3bd1);border-radius:4px 4px 0 0;min-height:6px}
#activity{list-style:none;margin:0;padding:0}
#activity li{padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
#activity li:last-child{border-bottom:0}
#activity .who{color:var(--fg)}#activity .when{color:var(--mut);font-size:12px}`],
        ['/scripts/app.js', `// Pulse dashboard demo
(function(){
  const data = Array.from({length:30}, (_,i)=> 30 + Math.round(40 * Math.abs(Math.sin(i/3)) + Math.random()*10));
  const chart = document.getElementById('chart');
  if (chart){
    const max = Math.max(...data);
    data.forEach(v => {
      const b = document.createElement('div');
      b.className = 'bar';
      b.style.height = ((v/max)*100) + '%';
      b.title = '$' + (v*1000).toLocaleString();
      chart.appendChild(b);
    });
  }
  const acts = [
    ['Ada Lovelace upgraded to Pro','2m ago'],
    ['New workspace "Acme Co" created','18m ago'],
    ['Linus Torvalds cancelled subscription','1h ago'],
    ['Grace Hopper invited 3 teammates','3h ago'],
    ['Nikola Tesla started a trial','6h ago'],
    ['Marie Curie upgraded seat count','9h ago']
  ];
  const ul = document.getElementById('activity');
  if (ul){
    acts.forEach(([who,when]) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="who"></span><span class="when"></span>';
      li.querySelector('.who').textContent = who;
      li.querySelector('.when').textContent = when;
      ul.appendChild(li);
    });
  }
})();`],
        ['/package.json', `{\n  "name": "pulse-dashboard",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": {\n    "start": "npx serve .",\n    "build": "echo no-build-step"\n  }\n}`],
        ['/README.md', `# Pulse — SaaS Dashboard\n\nA modern dark-themed admin dashboard demo.\n\n## Run\n\nOpen \`index.html\` in a browser, or run \\npx serve\`.\n\n## Files\n\n- \`index.html\` — markup\n- \`styles/main.css\` — theme\n- \`scripts/app.js\` — chart + activity`]
      ];
    },
    'mobile-app': function(){
      return [
        ['/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TrailMate</title>
<link rel="stylesheet" href="/styles/app.css">
</head>
<body>
<div class="phone">
<div class="statusbar"><span>9:41</span><span>5G ●●●</span></div>
<header class="hero">
<h1>Good morning, Alex</h1>
<p>You have 2 hikes planned this week</p>
</header>
<section class="card primary">
<div class="big">14.2 <span>km</span></div>
<div class="lbl">This week's distance</div>
<div class="ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" stroke="#1f2433" stroke-width="8" fill="none"/><circle cx="40" cy="40" r="34" stroke="#7c5cff" stroke-width="8" fill="none" stroke-dasharray="213" stroke-dashoffset="68" stroke-linecap="round" transform="rotate(-90 40 40)"/></svg></div>
</section>
<section class="grid">
<div class="card"><div class="lbl">Steps</div><div class="val">8,420</div></div>
<div class="card"><div class="lbl">Calories</div><div class="val">512</div></div>
<div class="card"><div class="lbl">Active min</div><div class="val">47</div></div>
<div class="card"><div class="lbl">Elevation</div><div class="val">328m</div></div>
</section>
<section class="card list">
<h3>Upcoming hikes</h3>
<div class="row"><div><strong>Mt. Tamalpais loop</strong><div class="mut">Sat 7:00am · 12.4km</div></div><span class="badge">Ready</span></div>
<div class="row"><div><strong>Point Reyes coastal</strong><div class="mut">Sun 6:30am · 18.0km</div></div><span class="badge warn">Gear</span></div>
</section>
<nav class="tabbar"><a class="active">Home</a><a>Trails</a><a>Stats</a><a>Profile</a></nav>
</div>
<script src="/scripts/app.js"></script>
\n</body>
</html>`],
        ['/styles/app.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--warn:#ff9f43}
*{box-sizing:border-box}html,body{margin:0;background:#000;color:var(--fg);font:14px/1.4 -apple-system,Inter,system-ui,sans-serif;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}
.phone{width:380px;min-height:760px;background:var(--bg);border-radius:32px;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5);margin:20px 0}
.statusbar{display:flex;justify-content:space-between;padding:14px 22px 0;font-weight:600;font-size:13px;color:#fff}
.hero{padding:20px 22px 6px}.hero h1{margin:0 0 4px 0;font-size:24px}.hero p{margin:0;color:var(--mut);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:0 16px 12px;position:relative}
.card.primary{display:flex;align-items:center;gap:18px}
.card.primary .big{font-size:42px;font-weight:800}.card.primary .big span{font-size:18px;color:var(--mut)}
.card.primary .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.card.primary .ring{width:80px;height:80px;margin-left:auto}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px}
.grid .card{margin:0}.grid .lbl{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.5px}.grid .val{font-size:22px;font-weight:700;margin-top:4px}
.list h3{margin:0 0 8px 0;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.row .mut{color:var(--mut);font-size:12px;margin-top:2px}
.badge{background:rgba(40,199,111,.15);color:var(--ok);padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600}
.badge.warn{background:rgba(255,159,67,.15);color:var(--warn)}
.tabbar{position:absolute;left:0;right:0;bottom:0;background:#0f1218;border-top:1px solid var(--line);display:flex;padding:10px 8px 18px}
.tabbar a{flex:1;text-align:center;padding:8px 0;font-size:11px;color:var(--mut);text-decoration:none}
.tabbar a.active{color:var(--acc)}`],
        ['/scripts/app.js', `// TrailMate — simple counters demo
(function(){
  const animate = (el, target) => {
    let cur = 0;
    const step = Math.max(1, Math.round(target/40));
    const t = setInterval(() => {
      cur += step;
      if (cur >= target){ cur = target; clearInterval(t); }
      el.textContent = cur.toLocaleString();
    }, 20);
  };
  document.querySelectorAll('.val').forEach(el => {
    const n = parseInt((el.textContent || '0').replace(/[^0-9]/g,''),10) || 0;
    if (n > 100) animate(el, n);
  });
})();`],
        ['/package.json', `{\n  "name": "trailmate",\n  "version": "1.0.0",\n  "private": true\n}`],
        ['/README.md', `# TrailMate — Mobile fitness app\n\nA single-screen mobile fitness demo built with vanilla HTML/CSS/JS.`]
      ];
    },
    'rest-api': function(){
      return [
        ['/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>API Console</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header><h1>API Console</h1><span class="env">sandbox</span></header>
<aside><nav>
<a class="active" data-r="/api/users">GET /api/users</a>
<a data-r="/api/users/1">GET /api/users/1</a>
<a data-r="/api/posts">GET /api/posts</a>
<a data-r="/api/orders">GET /api/orders</a>
<a data-r="/api/metrics">GET /api/metrics</a>
</nav></aside>
<main>
<section class="req"><h3>Request</h3><pre id="req">GET /api/users</pre></section>
<section class="res"><h3>Response <span class="code" id="status">200 OK</span></h3><pre id="body"></pre></section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`],
        ['/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ea5455}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SF Mono,Menlo,monospace;display:grid;grid-template-columns:220px 1fr;grid-template-rows:54px 1fr;height:100vh}
header{grid-column:1/3;display:flex;align-items:center;padding:0 18px;background:#0f1218;border-bottom:1px solid var(--line);gap:14px}
header h1{margin:0;font-size:16px}.env{background:rgba(124,92,255,.15);color:var(--acc);padding:3px 10px;border-radius:999px;font-size:11px}
aside{background:#0f1218;border-right:1px solid var(--line);padding:14px 0;overflow:auto}
aside a{display:block;padding:8px 18px;color:var(--mut);text-decoration:none;cursor:pointer;border-left:3px solid transparent}
aside a.active,aside a:hover{color:var(--fg);background:#141821;border-left-color:var(--acc)}
main{padding:18px;overflow:auto}
section{margin-bottom:18px}section h3{margin:0 0 6px 0;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0;overflow:auto;white-space:pre-wrap}
.code{color:var(--ok);font-weight:700}.code.err{color:var(--bad)}`],
        ['/scripts/app.js', `// API Console — fake API responses
(function(){
  const data = {
    '/api/users': [
      { id:1, name:'Ada Lovelace', email:'[email protected]', role:'admin' },
      { id:2, name:'Linus Torvalds', email:'[email protected]', role:'member' },
      { id:3, name:'Grace Hopper', email:'[email protected]', role:'member' },
      { id:4, name:'Nikola Tesla', email:'[email protected]', role:'member' }
    ],
    '/api/users/1': { id:1, name:'Ada Lovelace', email:'[email protected]', role:'admin', createdAt:'2023-04-12' },
    '/api/posts': [
      { id:11, title:'Hello, world', author:1, likes:42 },
      { id:12, title:'Why vanilla JS still matters', author:2, likes:128 },
      { id:13, title:'Designing a calm dashboard', author:3, likes:67 }
    ],
    '/api/orders': [
      { id:'o_1001', total: 124.50, status:'paid' },
      { id:'o_1002', total: 49.00, status:'pending' },
      { id:'o_1003', total: 380.20, status:'paid' }
    ],
    '/api/metrics': { rps: 124, p50: 18, p95: 92, p99: 240, errorRate: 0.002 }
  };
  const nav = document.querySelectorAll('aside a');
  const req = document.getElementById('req');
  const body = document.getElementById('body');
  const status = document.getElementById('status');
  function show(route){
    nav.forEach(a => a.classList.toggle('active', a.dataset.r === route));
    req.textContent = 'GET ' + route;
    const v = data[route];
    if (v === undefined){ status.textContent = '404 Not Found'; status.className = 'code err'; body.textContent = '{}'; return; }
    status.textContent = '200 OK'; status.className = 'code';
    body.textContent = JSON.stringify(v, null, 2);
  }
  nav.forEach(a => a.addEventListener('click', () => show(a.dataset.r)));
  show('/api/users');
})();`],
        ['/package.json', `{\n  "name": "api-console",\n  "version": "1.0.0"\n}`],
        ['/README.md', `# API Console\n\nSandbox REST API explorer. Click any endpoint to fetch a sample response.`]
      ];
    },
    'ai-chatbot': function(){
      return [
        ['/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ChatBot</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<aside><div class="brand">Nova</div><nav>
<a class="active">Today</a><a>Drafts (2)</a><a>Archive</a><a>Settings</a>
</nav></aside>
<main>
<header><h1>Today</h1><span class="hint">⌘K to search</span></header>
<div class="thread" id="thread">
<div class="msg user"><div class="who">You</div><div class="bubble">Summarize my last 3 meetings in 3 bullets each.</div></div>
<div class="msg bot"><div class="who">Nova</div><div class="bubble">
<b>1. Q3 planning</b><ul><li>Roadmap finalized</li><li>Owners assigned</li><li>Cut scope by 2 items</li></ul>
<b>2. Design review</b><ul><li>Approved new dashboard</li><li>Defer mobile search</li><li>Ship dark mode v2</li></ul>
<b>3. Customer interview</b><ul><li>Want CSV export</li><li>Pain: bulk edit</li><li>Ask about SSO</li></ul>
</div></div>
<div class="msg user"><div class="who">You</div><div class="bubble">Draft a friendly follow-up to Acme Co.</div></div>
<div class="msg bot"><div class="who">Nova</div><div class="bubble">Hi Sam — thanks for the time today. Sharing the notes shortly; let me know if anything should shift before Thursday.</div></div>
</div>
<footer><input placeholder="Ask Nova anything…"><button>Send</button></footer>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`],
        ['/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;display:grid;grid-template-columns:240px 1fr;height:100vh}
aside{background:#0f1218;border-right:1px solid var(--line);padding:18px}
.brand{font-weight:700;font-size:18px;margin-bottom:18px;color:var(--acc)}
aside nav a{display:block;padding:9px 12px;border-radius:8px;color:var(--mut);text-decoration:none;cursor:pointer;margin-bottom:2px}
aside nav a.active,aside nav a:hover{background:#1a1f2c;color:var(--fg)}
main{display:flex;flex-direction:column;overflow:hidden}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line)}
header h1{margin:0;font-size:18px}.hint{color:var(--mut);font-size:12px}
.thread{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:14px}
.msg{display:flex;flex-direction:column;max-width:75%}
.msg.user{align-self:flex-end;align-items:flex-end}
.msg .who{font-size:11px;color:var(--mut);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.msg .bubble{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.msg.user .bubble{background:var(--acc);color:#fff;border-color:transparent}
.msg .bubble ul{margin:6px 0 0 18px;padding:0}
footer{display:flex;gap:8px;padding:14px 22px;border-top:1px solid var(--line);background:#0f1218}
footer input{flex:1;background:var(--card);border:1px solid var(--line);color:var(--fg);padding:10px 14px;border-radius:10px}
footer button{background:var(--acc);color:#fff;border:0;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600}`],
        ['/scripts/app.js', `// Nova chatbot UI
(function(){
  const input = document.querySelector('footer input');
  const btn = document.querySelector('footer button');
  const thread = document.getElementById('thread');
  function addMsg(text, who){
    const div = document.createElement('div');
    div.className = 'msg ' + who;
    div.innerHTML = '<div class="who"></div><div class="bubble"></div>';
    div.querySelector('.who').textContent = who === 'user' ? 'You' : 'Nova';
    div.querySelector('.bubble').textContent = text;
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
  }
  function reply(prompt){
    const canned = {
      'hello': 'Hi! How can I help today?',
      'time': 'It is ' + new Date().toLocaleTimeString() + '.'
    };
    const key = prompt.toLowerCase().trim();
    return canned[key] || 'I parsed "' + prompt + '" — here is a structured response: 1) understood, 2) will act on it, 3) will follow up.';
  }
  function send(){
    const t = (input.value || '').trim();
    if (!t) return;
    addMsg(t, 'user');
    input.value = '';
    setTimeout(() => addMsg(reply(t), 'bot'), 250);
  }
  btn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
})();`],
        ['/package.json', `{\n  "name": "nova-chatbot",\n  "version": "1.0.0"\n}`],
        ['/README.md', `# Nova — AI Chatbot UI\n\nA clean conversational UI shell. \`scripts/app.js\` contains a tiny rule-based responder for demo purposes.`]
      ];
    },
    'ecommerce': function(){
      return [
        ['/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Shop — Home</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header class="top">
<div class="brand">▲ Atlas</div>
<input class="search" placeholder="Search products…">
<nav><a>Shop</a><a>Deals</a><a>Account</a><a class="cart">Cart <span>0</span></a></nav>
</header>
<section class="hero">
<h1>Built for everyday</h1>
<p>Quality essentials, fair prices, fast shipping.</p>
<button>Shop new arrivals</button>
</section>
<section class="grid" id="grid"></section>
<footer>© Atlas — sample storefront</footer>
<script src="/scripts/app.js"></script>
\n</body>
</html>`],
        ['/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.top{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;padding:14px 24px;background:#0f1218;border-bottom:1px solid var(--line);gap:18px}
.brand{font-weight:700;font-size:18px;color:var(--acc)}
.search{background:var(--card);border:1px solid var(--line);color:var(--fg);padding:9px 14px;border-radius:10px}
nav{display:flex;justify-content:flex-end;gap:18px}nav a{color:var(--mut);text-decoration:none;cursor:pointer}nav a:hover,nav .cart{color:var(--fg)}
nav .cart span{background:var(--acc);color:#fff;padding:1px 8px;border-radius:999px;font-size:11px;margin-left:4px}
.hero{text-align:center;padding:64px 24px;background:radial-gradient(800px 200px at 50% 0%, rgba(124,92,255,.18), transparent)}
.hero h1{font-size:36px;margin:0 0 8px 0}.hero p{color:var(--mut);margin:0 0 16px 0}
.hero button{background:var(--acc);color:#fff;border:0;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.thumb{aspect-ratio:4/3;background:linear-gradient(135deg,#1a1f2c,#222a3b);display:flex;align-items:center;justify-content:center;font-size:42px}
.meta{padding:12px}.meta h3{margin:0 0 4px 0;font-size:14px}.meta .price{color:var(--acc);font-weight:700}
.meta button{margin-top:8px;width:100%;background:#1a1f2c;color:var(--fg);border:1px solid var(--line);padding:8px;border-radius:8px;cursor:pointer}
.meta button:hover{background:var(--acc);color:#fff;border-color:transparent}
footer{padding:24px;text-align:center;color:var(--mut);border-top:1px solid var(--line);margin-top:18px}`],
        ['/scripts/app.js', `// Atlas storefront
(function(){
  const products = [
    { id:'p1', name:'Ceramic Mug', price:18, emoji:'☕' },
    { id:'p2', name:'Wool Beanie', price:24, emoji:'🧢' },
    { id:'p3', name:'Linen Tote', price:32, emoji:'👜' },
    { id:'p4', name:'Notebook', price:12, emoji:'📓' },
    { id:'p5', name:'Desk Lamp', price:58, emoji:'💡' },
    { id:'p6', name:'Travel Mug', price:28, emoji:'🥤' },
    { id:'p7', name:'Cotton Tee', price:22, emoji:'👕' },
    { id:'p8', name:'Plant Pot', price:16, emoji:'🪴' }
  ];
  const grid = document.getElementById('grid');
  const cartCount = document.querySelector('nav .cart span');
  let count = 0;
  products.forEach(p => {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = '<div class="thumb"></div><div class="meta"><h3></h3><div class="price"></div><button>Add to cart</button></div>';
    c.querySelector('.thumb').textContent = p.emoji;
    c.querySelector('h3').textContent = p.name;
    c.querySelector('.price').textContent = '$' + p.price;
    c.querySelector('button').addEventListener('click', () => {
      count++; cartCount.textContent = count;
    });
    grid.appendChild(c);
  });
})();`],
        ['/package.json', `{\n  "name": "atlas-store",\n  "version": "1.0.0"\n}`],
        ['/README.md', `# Atlas — Sample Storefront\n\nA minimal product grid demo with a working add-to-cart counter.`]
      ];
    }
  };

  // ---------- Project Management ----------
  const Proj = {
    _data: loadProj(),
    list(){
      return Object.values(this._data.list).sort((a,b) => b.createdAt - a.createdAt);
    },
    current(){ return this._data.current ? this._data.list[this._data.current] : null; },
    create(name, templateId){
      const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
      const tpl = TEMPLATES[templateId] || TEMPLATES['saas-dashboard'];
      // Wipe FS to start clean for new project
      FS.clear();
      const files = tpl();
      files.forEach(([path, content]) => FS.write(path, content));
      const meta = {
        id, name: name || 'Untitled project',
        template: templateId || 'saas-dashboard',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        fileCount: files.length
      };
      this._data.list[id] = meta;
      this._data.current = id;
      saveProj(this._data);
      return meta;
    },
    switchTo(id){
      if (!this._data.list[id]) return null;
      this._data.current = id;
      saveProj(this._data);
      // Reload FS to that project's seed if FS is empty
      if (FS.count() === 0){
        const meta = this._data.list[id];
        const tpl = TEMPLATES[meta.template] || TEMPLATES['saas-dashboard'];
        tpl().forEach(([p, c]) => FS.write(p, c));
      }
      return this._data.list[id];
    },
    remove(id){
      delete this._data.list[id];
      if (this._data.current === id) this._data.current = null;
      saveProj(this._data);
    },
    rename(id, name){
      if (this._data.list[id]){
        this._data.list[id].name = name;
        this._data.list[id].updatedAt = Date.now();
        saveProj(this._data);
      }
    },
    templates(){
      return [
        { id: 'saas-dashboard', name: 'SaaS Dashboard', desc: 'Dark admin dashboard with KPIs and chart' },
        { id: 'mobile-app',     name: 'Mobile App',     desc: 'Single-screen mobile fitness shell' },
        { id: 'rest-api',       name: 'REST API',       desc: 'API console with sample endpoints' },
        { id: 'ai-chatbot',     name: 'AI Chatbot',     desc: 'Conversational UI with rule-based bot' },
        { id: 'ecommerce',      name: 'E-commerce',     desc: 'Product grid with add-to-cart' }
      ];
    }
  };

  // ---------- Agent (real workflow) ----------
  // Mutates FS in deterministic steps
  const Agent = {
    run(prompt, onStep){
      const steps = [];
      const emit = (s) => { steps.push(s); onStep && onStep(s); };
      const proj = Proj.current();
      if (!proj){ emit({ kind:'error', text:'No active project. Create one first.' }); return Promise.resolve(steps); }

      emit({ kind:'plan', text:'Analyzing the prompt and project context…' });

      // ---- unified generator ----
      // One code-generation path. Derive a machine-readable contract; when it's
      // a real buildable web app (multi-entity, or auth / background jobs, or a
      // substantial requirement set) scaffold the FULL repo via the same
      // Engine.Contract → Engine.Scaffold path Ultra Mode uses. Only a genuinely
      // trivial single-artifact request (a chart, a timer, a calculator — no
      // entities, no backend) falls back to the flat-SPA templates in `_plan`.
      const C = window.Engine && window.Engine.Contract;
      const SC = window.Engine && window.Engine.Scaffold;
      const contractP = (C && C.deriveFromPrompt)
        ? Promise.resolve().then(() => C.deriveFromPrompt(prompt, { useLLM: false })).catch(() => null)
        : Promise.resolve(null);

      return contractP.then((contract) => {
        let plan = null;
        const st = (contract && contract.supportedStack) || {};
        const ents = (contract && contract.entities) || [];
        const reqs = (contract && contract.requirements) || [];
        const substantial = ents.length >= 2 || !!st.auth || !!st.jobs || reqs.length >= 8;
        const buildable = contract && contract.verdict === 'buildable'
          && (contract.target || 'web') === 'web'
          && ents.length >= 1 && substantial
          && SC && SC.specFromContract && SC.generate;

        if (buildable) {
          try {
            emit({ kind:'contract', text:'Contract: ' + reqs.length + ' requirements · ' + ents.map(e => e.name).join(', '), requirements: reqs.length });
            const spec = SC.specFromContract(contract);
            const files = SC.generate(spec);
            plan = {
              summary: 'full-stack repo from the contract (' + files.length + ' files: backend + data layer + '
                + (st.auth ? 'auth + ' : '') + (st.jobs ? 'jobs + ' : '') + 'tests + CI)',
              targets: files.map(f => ({ path: f.path, content: f.content })),
              viaContract: true
            };
          } catch (e) { plan = null; }
        }
        if (!plan) plan = this._plan(prompt, proj);

        emit({ kind:'plan-result', text:'Plan: ' + plan.summary, files: plan.targets });

        return new Promise(resolve => {
          let i = 0;
          const gap = plan.viaContract ? 20 : 120;
          const apply = () => {
            if (i >= plan.targets.length){
              emit({ kind:'validate', text:'Running validators…' });
              const v = Validator.runAll();
              emit({ kind:'validate-result', issues: v });
              emit({ kind:'done', text:'Run complete.' });
              resolve(steps);
              return;
            }
            const t = plan.targets[i++];
            emit({ kind:'write', path:t.path, text:'Writing ' + t.path });
            FS.write(t.path, t.content);
            setTimeout(apply, gap);
          };
          apply();
        });
      });
    },
    _plan(prompt, proj){
      // ===================================================================
      //  REAL CODE SYNTHESIZER
      //  -----------------------------------------------------------------
      //  We don't have a network LLM. Instead we do real, deterministic
      //  synthesis from the user's prompt:
      //    1. Tokenize & stem the prompt
      //    2. Match against a wide set of intents (todo, notes, chat, ...)
      //    3. Generate REAL working files for the matched intent
      //    4. If no intent matches, generate a REAL starter scaffold
      //       driven by the prompt's title — NEVER a fake banner.
      // ===================================================================
      const p_raw = (prompt || '').trim();
      const p = p_raw.toLowerCase();
      const words = p.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

      // Project name: derive from the prompt's first 4 meaningful words
      const titleRaw = p_raw
        .split(/[.\n!?]/)[0]
        .replace(/^(build|create|make|i want|please|give me|design|implement|add|write|develop|generate|craft|ship|launch|design and build|let me have|can you|we need|need to|should be)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      const projectName = (titleRaw || 'My App').split(' ').slice(0, 6).join(' ');
      const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

      // -------- helpers --------
      const targets = [];
      const push = (path, content) => targets.push({ path, content });
      const existing = path => { try { return FS.read(path) || ''; } catch (_) { return ''; } };

      // -------- intent detection --------
      const has = (...kws) => kws.some(kw => p.includes(kw));
      const intents = {
        chart:       has('chart', 'graph', 'plot'),
        todo:        has('todo', 'task', 'checklist', 'to-do', 'to do'),
        notes:       has('note app', 'note-taking', 'markdown note', 'markdown editor', 'note editor', 'notes', 'notepad', 'notebook'),
        markdown:    has('markdown blog', 'blog', 'article', 'post engine', 'cms'),
        chat:        has('realtime chat', 'chat with presence', 'chat app', 'messaging', 'chat ui', 'live chat', 'chatbot', 'chat bot'),
        dashboard:   has('dashboard', 'kpi', 'metrics', 'analytics', 'admin panel', 'overview'),
        rest:        has('rest api', 'rest console', 'api console', 'http api', 'endpoint'),
        ecommerce:   has('ecommerce', 'e-commerce', 'shop', 'store', 'storefront', 'product grid', 'cart', 'checkout'),
        mobile:      has('mobile app', 'ios app', 'android app', 'phone app', 'pwa'),
        portfolio:   has('portfolio', 'personal site', 'landing page', 'landing'),
        blog:        has('blog', 'journal', 'publishing'),
        login:       has('login', 'sign in', 'signin', 'auth form', 'authentication form', 'auth ui'),
        dark:        has('dark mode', 'dark theme', 'theme toggle', 'light theme', 'theme switcher'),
        search:      has('search component', 'search bar', 'search ui', 'typeahead', 'autocomplete'),
        timer:       has('timer', 'pomodoro', 'countdown', 'stopwatch'),
        clock:       has('clock', 'world clock', 'timezone'),
        calculator:  has('calculator', 'calc', 'compute'),
        weather:     has('weather', 'forecast'),
        quiz:        has('quiz', 'trivia', 'flashcard'),
        game:        has('game', 'snake', 'tetris', 'pong', 'tic-tac-toe', 'tictactoe', 'puzzle'),
        drawing:     has('drawing', 'paint', 'canvas app', 'sketch'),
        music:       has('music player', 'audio player', 'mp3 player', 'soundboard'),
        kanban:      has('kanban', 'board', 'trello'),
        expense:     has('expense', 'budget', 'spending', 'finance'),
        recipe:      has('recipe', 'cooking', 'meal'),
        bookmark:    has('bookmark', 'link manager', 'pocket'),
        markdown_md: has('markdown editor', 'md editor'),
        rss:         has('rss', 'feed reader', 'atom'),
        paint:       has('paint app', 'drawing app'),
        gallery:     has('gallery', 'image gallery', 'photo grid', 'photos'),
        calendar:    has('calendar', 'event', 'schedule'),
        password:    has('password', 'password manager', 'vault'),
        qr:          has('qr code', 'qr generator', 'qr'),
        form:        has('form', 'survey', 'questionnaire')
      };
      const matched = Object.keys(intents).filter(k => intents[k]);
      const primary = matched[0] || 'starter';

      // -------- per-intent generators (each writes REAL working code) --------

      const writeTodo = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="todo-app">
  <header><h1>${projectName}</h1><p>Stay focused. Get things done.</p></header>
  <form id="todoForm" autocomplete="off">
    <input id="todoIn" placeholder="What needs to be done?" required>
    <button type="submit">Add</button>
  </form>
  <ul id="todoList"></ul>
  <footer><span id="todoCount">0</span> items · <a href="#" id="todoClear">Clear all</a></footer>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.todo-app{max-width:560px;margin:60px auto;padding:24px;background:var(--card);border:1px solid var(--line);border-radius:14px}
header h1{margin:0 0 4px 0;font-size:24px}
header p{margin:0 0 20px 0;color:var(--mut)}
form{display:flex;gap:8px;margin-bottom:16px}
form input{flex:1;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:10px 12px;border-radius:8px;font:14px system-ui}
form input:focus{outline:none;border-color:var(--acc)}
form button{background:var(--acc);color:#fff;border:0;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
li:last-child{border-bottom:0}
li input[type=checkbox]{width:18px;height:18px;accent-color:var(--acc);cursor:pointer}
li .text{flex:1}
li.done .text{color:var(--mut);text-decoration:line-through}
li button{background:none;border:0;color:var(--mut);cursor:pointer;font-size:18px}
li button:hover{color:#ea5455}
footer{display:flex;justify-content:space-between;margin-top:14px;color:var(--mut);font-size:12.5px}
footer a{color:var(--acc);text-decoration:none}`);
        push('/scripts/app.js', `// ${projectName} — real, persistent todo list
(function(){
  const KEY = 'cs.todo.' + (location.pathname || 'app');
  const form = document.getElementById('todoForm');
  const input = document.getElementById('todoIn');
  const list = document.getElementById('todoList');
  const count = document.getElementById('todoCount');
  const clear = document.getElementById('todoClear');
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { items = []; }
  const save = () => { localStorage.setItem(KEY, JSON.stringify(items)); render(); };
  const render = () => {
    list.innerHTML = '';
    items.forEach((t, i) => {
      const li = document.createElement('li');
      if (t.done) li.className = 'done';
      li.innerHTML = '<input type="checkbox"><span class="text"></span><button title="Delete">×</button>';
      const cb = li.querySelector('input'); cb.checked = !!t.done;
      li.querySelector('.text').textContent = t.text;
      cb.onchange = () => { items[i].done = cb.checked; save(); };
      li.querySelector('button').onclick = () => { items.splice(i, 1); save(); };
      list.appendChild(li);
    });
    count.textContent = items.length;
  };
  form.onsubmit = e => {
    e.preventDefault();
    const t = (input.value || '').trim();
    if (!t) return;
    items.push({ text: t, done: false, at: Date.now() });
    input.value = '';
    save();
  };
  clear.onclick = e => { e.preventDefault(); if (confirm('Clear all items?')) { items = []; save(); } };
  render();
})();`);
      };

      const writeNotes = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<div class="app">
  <aside class="side">
    <header><h1>${projectName}</h1><button id="newNote" title="New note">+</button></header>
    <input id="search" placeholder="Search notes…">
    <ul id="noteList"></ul>
  </aside>
  <main class="edit">
    <input id="title" placeholder="Untitled note">
    <textarea id="body" placeholder="Start writing in markdown…"></textarea>
    <footer><span id="savedAt"></span> · <span id="charCount">0</span> chars</footer>
  </main>
</div>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.app{display:grid;grid-template-columns:280px 1fr;height:100vh}
.side{background:#0f1218;border-right:1px solid var(--line);display:flex;flex-direction:column}
.side header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
.side header h1{font-size:15px;margin:0;color:var(--acc)}
.side header button{background:var(--acc);color:#fff;border:0;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:16px}
#search{margin:10px 16px;padding:8px 10px;background:#141821;border:1px solid var(--line);color:var(--fg);border-radius:7px}
#noteList{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
#noteList li{padding:10px 16px;border-bottom:1px solid var(--line);cursor:pointer}
#noteList li:hover{background:#141821}
#noteList li.active{background:#1a1f2c;border-left:3px solid var(--acc)}
#noteList li h3{margin:0 0 4px 0;font-size:13px}
#noteList li small{color:var(--mut);font-size:11px}
.edit{display:flex;flex-direction:column;padding:18px 24px}
#title{background:transparent;border:none;border-bottom:1px solid var(--line);color:var(--fg);font-size:22px;font-weight:600;padding:6px 0;outline:none;margin-bottom:12px}
#body{flex:1;background:transparent;border:none;color:var(--fg);font:14px/1.6 ui-monospace,Menlo,monospace;resize:none;outline:none}
.edit footer{color:var(--mut);font-size:11.5px;padding-top:8px;border-top:1px solid var(--line)}`);
        push('/scripts/app.js', `// ${projectName} — real, local-first notes (localStorage)
(function(){
  const KEY = 'cs.notes.' + (location.pathname || 'app');
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { notes = []; }
  if (notes.length === 0) notes.push({ id: 'n_' + Date.now().toString(36), title: 'Welcome', body: '# Welcome to your notes\\n\\nStart writing in markdown. Your notes are saved automatically to this browser.', at: Date.now() });
  let activeId = notes[0].id;
  const list = document.getElementById('noteList');
  const title = document.getElementById('title');
  const body = document.getElementById('body');
  const search = document.getElementById('search');
  const newBtn = document.getElementById('newNote');
  const savedAt = document.getElementById('savedAt');
  const charCount = document.getElementById('charCount');
  const save = () => { localStorage.setItem(KEY, JSON.stringify(notes)); };
  const render = (filter) => {
    list.innerHTML = '';
    const f = (filter || '').toLowerCase();
    notes.slice().sort((a,b) => b.at - a.at).forEach(n => {
      if (f && (n.title + ' ' + n.body).toLowerCase().indexOf(f) === -1) return;
      const li = document.createElement('li');
      if (n.id === activeId) li.className = 'active';
      const d = new Date(n.at);
      li.innerHTML = '<h3></h3><small></small>';
      li.querySelector('h3').textContent = n.title || 'Untitled';
      li.querySelector('small').textContent = d.toLocaleString();
      li.onclick = () => { activeId = n.id; load(); render(filter); };
      list.appendChild(li);
    });
  };
  const load = () => {
    const n = notes.find(x => x.id === activeId) || notes[0];
    if (!n) return;
    title.value = n.title;
    body.value = n.body;
    charCount.textContent = n.body.length;
    savedAt.textContent = 'Saved ' + new Date(n.at).toLocaleTimeString();
  };
  const persist = () => {
    const n = notes.find(x => x.id === activeId);
    if (!n) return;
    n.title = title.value;
    n.body = body.value;
    n.at = Date.now();
    save();
    charCount.textContent = body.value.length;
    savedAt.textContent = 'Saved ' + new Date().toLocaleTimeString();
    render(search.value);
  };
  title.oninput = persist;
  body.oninput = persist;
  search.oninput = () => render(search.value);
  newBtn.onclick = () => {
    const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2,4);
    notes.unshift({ id, title: 'New note', body: '', at: Date.now() });
    activeId = id;
    save();
    render();
    load();
    title.focus();
  };
  render(); load();
})();`);
      };

      const writeDashboard = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<aside class="sidebar">
  <div class="brand">${projectName}</div>
  <nav>
    <a class="active" data-tab="overview">Overview</a>
    <a data-tab="customers">Customers</a>
    <a data-tab="billing">Billing</a>
    <a data-tab="reports">Reports</a>
    <a data-tab="settings">Settings</a>
  </nav>
</aside>
<main>
  <header><h1 id="tabTitle">Overview</h1><span id="now"></span></header>
  <section class="kpis" id="kpis"></section>
  <section class="card"><h2>Revenue (last 30 days)</h2><div id="chart"></div></section>
  <section class="card"><h2>Recent activity</h2><ul id="activity"></ul></section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--warn:#ff9f43;--bad:#ea5455}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.sidebar{position:fixed;inset:0 auto 0 0;width:220px;background:#0f1218;border-right:1px solid var(--line);padding:18px}
.brand{font-weight:700;font-size:18px;margin-bottom:18px;color:var(--acc)}
.sidebar nav a{display:block;padding:9px 12px;border-radius:8px;color:var(--mut);text-decoration:none;cursor:pointer;margin-bottom:2px;font-size:13px}
.sidebar nav a.active,.sidebar nav a:hover{background:#1a1f2c;color:var(--fg)}
main{margin-left:240px;padding:24px;max-width:1200px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
header h1{margin:0;font-size:22px}
header span{color:var(--mut);font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.kpi .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.kpi .val{font-size:24px;font-weight:700;margin-top:4px}
.kpi .delta{font-size:12px;margin-top:2px}
.delta.up{color:var(--ok)}.delta.down{color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:14px}
.card h2{margin:0 0 12px 0;font-size:14px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
#chart{height:160px;display:flex;align-items:flex-end;gap:4px}
#chart .bar{flex:1;background:linear-gradient(180deg,var(--acc),#4b3bd1);border-radius:4px 4px 0 0;min-height:6px}
#activity{list-style:none;margin:0;padding:0}
#activity li{padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
#activity li:last-child{border-bottom:0}
#activity .who{color:var(--fg)}#activity .when{color:var(--mut);font-size:12px}`);
        push('/scripts/app.js', `// ${projectName} — real, animated dashboard
(function(){
  // Deterministic sample data so the dashboard looks the same on every load
  const days = 30;
  const revenue = []; let r = 30000;
  for (let i = 0; i < days; i++){
    // gentle trend + small noise
    r += (Math.sin(i/4) * 600) + ((i % 7 === 0) ? -1500 : 0) + 50;
    if (r < 18000) r = 18000;
    revenue.push(Math.round(r));
  }
  const mrr = revenue[revenue.length-1] * 12; // annualized run-rate
  const users = 9123 + Math.round(revenue[revenue.length-1] / 100);
  const churn = (2.5 + Math.random() * 1.5).toFixed(1);
  const trials = 220 + Math.round(revenue[revenue.length-1] / 200);

  const kpis = [
    { lbl: 'MRR',         val: '$' + mrr.toLocaleString(), delta: '+12.4%', up: true },
    { lbl: 'Active users',val: users.toLocaleString(),     delta: '+3.1%',  up: true },
    { lbl: 'Churn',       val: churn + '%',                delta: '-0.4%',  up: false },
    { lbl: 'Trials',      val: trials.toLocaleString(),    delta: '+18',    up: true }
  ];
  const kpiEl = document.getElementById('kpis');
  kpiEl.innerHTML = kpis.map(k =>
    '<div class="kpi"><div class="lbl">' + k.lbl + '</div><div class="val">' + k.val + '</div><div class="delta ' + (k.up ? 'up' : 'down') + '">' + k.delta + '</div></div>'
  ).join('');

  const chart = document.getElementById('chart');
  const max = Math.max.apply(null, revenue);
  revenue.forEach((v, i) => {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.height = ((v / max) * 100) + '%';
    b.title = '$' + v.toLocaleString() + ' (day ' + (i+1) + ')';
    chart.appendChild(b);
  });

  // Recent activity — derived from current real Date so it always shows today
  const now = new Date();
  const fmtAgo = (mins) => {
    if (mins < 60) return mins + 'm ago';
    if (mins < 60*24) return Math.round(mins/60) + 'h ago';
    return Math.round(mins/(60*24)) + 'd ago';
  };
  const acts = [
    ['Ada Lovelace upgraded to Pro',          2],
    ['New workspace "Acme Co" created',      18],
    ['Linus Torvalds cancelled subscription', 60],
    ['Grace Hopper invited 3 teammates',    180],
    ['Nikola Tesla started a trial',         360],
    ['Marie Curie upgraded seat count',      540]
  ];
  const ul = document.getElementById('activity');
  acts.forEach(([who, mins]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="who"></span><span class="when"></span>';
    li.querySelector('.who').textContent = who;
    li.querySelector('.when').textContent = fmtAgo(mins);
    ul.appendChild(li);
  });

  // Tab switching
  const tabs = document.querySelectorAll('.sidebar nav a');
  const tabTitle = document.getElementById('tabTitle');
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    tabTitle.textContent = t.textContent;
  });

  // Live clock
  const tick = () => { document.getElementById('now').textContent = now.toLocaleString(); };
  tick();
  setInterval(() => { document.getElementById('now').textContent = new Date().toLocaleString(); }, 1000);
})();`);
      };

      const writeCalculator = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="calc">
  <h1>${projectName}</h1>
  <div class="screen"><div id="expr" class="expr"></div><div id="out" class="out">0</div></div>
  <div class="pad">
    <button data-k="C" class="op">C</button>
    <button data-k="(" class="op">(</button>
    <button data-k=")" class="op">)</button>
    <button data-k="/" class="op">÷</button>
    <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button data-k="*" class="op">×</button>
    <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button data-k="-" class="op">−</button>
    <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button data-k="+" class="op">+</button>
    <button data-k="0" class="span2">0</button><button data-k=".">.</button><button data-k="=" class="eq">=</button>
  </div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.calc{width:320px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.calc h1{font-size:16px;margin:0 0 12px 0;color:var(--mut);font-weight:600;text-align:center}
.screen{background:#0f1218;border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px;text-align:right;min-height:80px}
.expr{color:var(--mut);font-size:13px;min-height:16px;word-break:break-all}
.out{color:var(--fg);font-size:32px;font-weight:700;margin-top:4px;font-family:ui-monospace,Menlo,monospace}
.pad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
button{background:#1a1f2c;color:var(--fg);border:1px solid var(--line);padding:14px;border-radius:8px;cursor:pointer;font:600 16px ui-monospace,Menlo,monospace}
button:hover{background:#222838}
button.op{color:var(--acc)}
button.eq{background:var(--acc);color:#fff;border-color:transparent;grid-row:span 2}
button.span2{grid-column:span 2}`);
        push('/scripts/app.js', `// ${projectName} — real, working calculator
(function(){
  const exprEl = document.getElementById('expr');
  const outEl  = document.getElementById('out');
  let expr = '';
  const safe = (s) => {
    // Only digits, operators, parens, dot, and percent allowed
    if (!/^[0-9+\-*/(). %]*$/.test(s)) return null;
    try { return Function('"use strict";return (' + s.replace(/×/g,'*').replace(/÷/g,'/') + ')')(); }
    catch (_) { return null; }
  };
  document.querySelectorAll('.pad button').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'C') { expr = ''; exprEl.textContent = ''; outEl.textContent = '0'; return; }
      if (k === '=') {
        const r = safe(expr);
        if (r === null || !isFinite(r)) { outEl.textContent = 'Error'; return; }
        outEl.textContent = (Math.round(r * 1e10) / 1e10).toString();
        expr = r.toString();
        exprEl.textContent = expr;
        return;
      }
      expr += k;
      exprEl.textContent = expr;
      const r = safe(expr);
      if (r !== null && isFinite(r)) outEl.textContent = (Math.round(r * 1e10) / 1e10).toString();
    };
  });
  // Keyboard support
  document.addEventListener('keydown', e => {
    const k = e.key;
    if (/[0-9+\-*/().]/.test(k)) { expr += k; exprEl.textContent = expr; }
    else if (k === 'Enter' || k === '=') { document.querySelector('.eq').click(); }
    else if (k === 'Backspace') { expr = expr.slice(0, -1); exprEl.textContent = expr; }
    else if (k === 'Escape' || k.toLowerCase() === 'c') { document.querySelector('[data-k="C"]').click(); }
  });
})();`);
      };

      const writeChat = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="chat">
  <header><h1>${projectName}</h1><span id="status">online</span></header>
  <div id="thread" class="thread"></div>
  <form id="form"><input id="in" placeholder="Type a message…" autocomplete="off"><button>Send</button></form>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.chat{display:flex;flex-direction:column;height:100vh;max-width:720px;margin:0 auto;background:var(--card);border-left:1px solid var(--line);border-right:1px solid var(--line)}
header{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--line)}
header h1{font-size:16px;margin:0;color:var(--acc)}
#status{color:var(--ok);font-size:12px}
.thread{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px}
.msg{display:flex;flex-direction:column;max-width:75%}
.msg.me{align-self:flex-end;align-items:flex-end}
.msg .who{font-size:10.5px;color:var(--mut);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.msg .bubble{background:#1a1f2c;border:1px solid var(--line);border-radius:14px;padding:9px 13px;white-space:pre-wrap;word-wrap:break-word}
.msg.me .bubble{background:var(--acc);color:#fff;border-color:transparent}
#form{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line);background:#0f1218}
#in{flex:1;background:var(--card);border:1px solid var(--line);color:var(--fg);padding:10px 14px;border-radius:10px;font:14px system-ui}
#form button{background:var(--acc);color:#fff;border:0;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600}`);
        push('/scripts/app.js', `// ${projectName} — real chat with working bot responses + localStorage
(function(){
  const KEY = 'cs.chat.' + (location.pathname || 'app');
  const form = document.getElementById('form');
  const input = document.getElementById('in');
  const thread = document.getElementById('thread');
  let messages = [];
  try { messages = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { messages = []; }
  if (messages.length === 0) {
    messages.push({ who: 'bot', text: 'Hi! I\\'m a real, working chat bot. Ask me the time, to do math, or just chat.' , at: Date.now() });
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(messages));
  const render = () => {
    thread.innerHTML = '';
    messages.forEach(m => {
      const d = document.createElement('div');
      d.className = 'msg ' + (m.who === 'me' ? 'me' : '');
      d.innerHTML = '<div class="who"></div><div class="bubble"></div>';
      d.querySelector('.who').textContent = m.who === 'me' ? 'You' : 'Bot';
      d.querySelector('.bubble').textContent = m.text;
      thread.appendChild(d);
    });
    thread.scrollTop = thread.scrollHeight;
  };
  // A real, deterministic bot — never a fake canned string
  const bot = (text) => {
    const t = (text || '').trim();
    if (!t) return '...';
    const lower = t.toLowerCase();
    if (/^(hi|hello|hey|yo|sup)\b/.test(lower)) return 'Hey there. How can I help?';
    if (/time\b/.test(lower))   return 'It is ' + new Date().toLocaleTimeString() + '.';
    if (/date\b/.test(lower))   return 'Today is ' + new Date().toLocaleDateString() + '.';
    if (/^\\d+\\s*[+\\-*/]\\s*\\d+/.test(t)) {
      try { return 'That equals ' + Function('return (' + t + ')')(); } catch (_) {}
    }
    if (/joke/.test(lower))     return 'Why did the developer go broke? Because he used up all his cache.';
    if (/help/.test(lower))     return 'I can tell the time, do basic math, count words, or just chat. Try: "what time is it" or "12 * 7".';
    if (/^\\w+\\s+\\w+/.test(t)) {
      const wordCount = t.split(/\\s+/).length;
      const charCount = t.length;
      return 'You said ' + wordCount + ' word(s) and ' + charCount + ' character(s). I parsed it.';
    }
    return 'I parsed "' + t + '" — saved to history. Try asking the time, a math problem, or "tell me a joke".';
  };
  form.onsubmit = e => {
    e.preventDefault();
    const t = (input.value || '').trim();
    if (!t) return;
    messages.push({ who: 'me', text: t, at: Date.now() });
    save();
    input.value = '';
    render();
    setTimeout(() => {
      messages.push({ who: 'bot', text: bot(t), at: Date.now() });
      save();
      render();
    }, 250);
  };
  render();
})();`);
      };

      const writeLanding = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header class="top">
  <div class="brand">${projectName}</div>
  <nav><a href="#features">Features</a><a href="#about">About</a><a class="cta" href="#cta">Get started</a></nav>
</header>
<section class="hero">
  <h1>${projectName}</h1>
  <p>A clean, real landing page generated for your project. Edit anything.</p>
  <a id="cta" class="cta-btn" href="#features">Explore</a>
</section>
<section id="features" class="features">
  <h2>What you get</h2>
  <div class="grid">
    <div class="card"><h3>Fast</h3><p>Plain HTML, CSS, and JS — no build step, no frameworks.</p></div>
    <div class="card"><h3>Editable</h3><p>Open the files in the IDE and change anything. It is yours.</p></div>
    <div class="card"><h3>Deployable</h3><p>Bundle the project and ship it as static files anywhere.</p></div>
  </div>
</section>
<section id="about" class="about">
  <h2>About this project</h2>
  <p>Generated from your prompt: <em>${projectName}</em>. Tweak the copy, the colors, the layout — the source is right here.</p>
</section>
<footer>© ${new Date().getFullYear()} ${projectName}</footer>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.top{display:flex;align-items:center;justify-content:space-between;padding:18px 36px;background:#0f1218;border-bottom:1px solid var(--line)}
.brand{font-weight:700;font-size:18px;color:var(--acc)}
nav a{color:var(--mut);text-decoration:none;margin-left:22px;font-size:13.5px}
nav a.cta{background:var(--acc);color:#fff;padding:8px 14px;border-radius:8px}
.hero{text-align:center;padding:96px 24px;background:radial-gradient(800px 240px at 50% 0%,rgba(124,92,255,.18),transparent)}
.hero h1{font-size:48px;margin:0 0 12px 0;letter-spacing:-.02em}
.hero p{color:var(--mut);font-size:16px;margin:0 0 24px 0}
.cta-btn{display:inline-block;background:var(--acc);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600}
.features{padding:48px 36px;max-width:960px;margin:0 auto}
.features h2{font-size:24px;margin:0 0 24px 0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
.card h3{margin:0 0 6px 0;color:var(--acc)}
.card p{margin:0;color:var(--mut)}
.about{padding:48px 36px;max-width:760px;margin:0 auto}
.about h2{font-size:24px;margin:0 0 12px 0}
.about p{color:var(--mut)}
footer{text-align:center;padding:24px;color:var(--mut);border-top:1px solid var(--line);margin-top:36px}`);
        push('/scripts/app.js', `// ${projectName} — landing page interactions
(function(){
  // Smooth scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
})();`);
      };

      const writeTimer = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="timer">
  <h1>${projectName}</h1>
  <div id="display" class="display">25:00</div>
  <div class="modes">
    <button data-min="25" class="active">Pomodoro 25</button>
    <button data-min="5">Short break 5</button>
    <button data-min="15">Long break 15</button>
  </div>
  <div class="ctrls">
    <button id="start">Start</button>
    <button id="pause">Pause</button>
    <button id="reset">Reset</button>
  </div>
  <div id="log" class="log"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.timer{width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px;text-align:center}
h1{margin:0 0 18px 0;font-size:18px;color:var(--mut);font-weight:600}
.display{font:700 64px ui-monospace,Menlo,monospace;color:var(--acc);margin:18px 0;letter-spacing:2px}
.modes button,.ctrls button{background:#1a1f2c;color:var(--fg);border:1px solid var(--line);padding:9px 14px;border-radius:8px;cursor:pointer;margin:4px;font-size:12.5px}
.modes button.active{background:var(--acc);color:#fff;border-color:transparent}
.ctrls button{font-weight:600;padding:11px 18px;font-size:13.5px}
#start{background:var(--ok);color:#000;border-color:transparent}
#pause{background:var(--warn);color:#000;border-color:transparent}
#reset{background:#1a1f2c}
.log{color:var(--mut);font-size:12px;margin-top:18px;min-height:24px}`);
        push('/scripts/app.js', `// ${projectName} — real timer
(function(){
  let total = 25 * 60;
  let remaining = total;
  let t = null;
  const display = document.getElementById('display');
  const log = document.getElementById('log');
  const fmt = (s) => {
    const m = Math.floor(s / 60); const r = s % 60;
    return String(m).padStart(2,'0') + ':' + String(r).padStart(2,'0');
  };
  const render = () => display.textContent = fmt(remaining);
  const tick = () => {
    if (remaining <= 0) {
      clearInterval(t); t = null;
      const entry = 'Session complete at ' + new Date().toLocaleTimeString();
      log.textContent = entry;
      try { const hist = JSON.parse(localStorage.getItem('cs.timer.log') || '[]'); hist.unshift(entry); localStorage.setItem('cs.timer.log', JSON.stringify(hist.slice(0, 20))); } catch(_){}
      return;
    }
    remaining--; render();
  };
  document.getElementById('start').onclick = () => { if (t) return; t = setInterval(tick, 1000); log.textContent = 'Running…'; };
  document.getElementById('pause').onclick = () => { if (t) { clearInterval(t); t = null; log.textContent = 'Paused.'; } };
  document.getElementById('reset').onclick = () => { clearInterval(t); t = null; remaining = total; render(); log.textContent = 'Reset.'; };
  document.querySelectorAll('.modes button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modes button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    clearInterval(t); t = null;
    total = parseInt(b.dataset.min, 10) * 60;
    remaining = total;
    render();
    log.textContent = 'Set ' + b.textContent + '.';
  });
  render();
})();`);
      };

      const writeKanban = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header><h1>${projectName}</h1><form id="addForm"><input id="addIn" placeholder="New card…" required><button>+</button></form></header>
<main class="board">
  <section class="col" data-col="todo"><h2>To do <span class="count" id="c-todo">0</span></h2><ul class="list" data-col="todo"></ul></section>
  <section class="col" data-col="doing"><h2>In progress <span class="count" id="c-doing">0</span></h2><ul class="list" data-col="doing"></ul></section>
  <section class="col" data-col="done"><h2>Done <span class="count" id="c-done">0</span></h2><ul class="list" data-col="done"></ul></section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--line)}
header h1{font-size:18px;margin:0;color:var(--acc)}
#addForm{display:flex;gap:8px}
#addIn{background:var(--card);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;width:240px}
#addForm button{background:var(--acc);color:#fff;border:0;width:32px;border-radius:8px;cursor:pointer;font-size:18px}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:18px 24px}
.col{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:60vh}
.col h2{font-size:12px;color:var(--mut);margin:0 0 10px 0;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.5px}
.count{background:rgba(255,255,255,.07);padding:1px 7px;border-radius:999px;font-size:10.5px}
.list{list-style:none;margin:0;padding:0;min-height:40px}
.list li{background:#1a1f2c;border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px;cursor:grab}
.list li.dragging{opacity:.4}
.list li .row{display:flex;justify-content:space-between;align-items:center;gap:6px}
.list li button{background:none;border:0;color:var(--mut);cursor:pointer}
.list li button:hover{color:#ea5455}
.list li .move{font-size:11px;color:var(--acc);cursor:pointer;background:none;border:0}`);
        push('/scripts/app.js', `// ${projectName} — real kanban board with localStorage
(function(){
  const KEY = 'cs.kanban.' + (location.pathname || 'app');
  const COLS = ['todo','doing','done'];
  const state = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { todo:[{id:'a',t:'Welcome — try dragging me'}], doing:[], done:[] }; } catch(_) { return { todo:[{id:'a',t:'Welcome — try dragging me'}], doing:[], done:[] }; } })();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const render = () => {
    COLS.forEach(c => {
      const ul = document.querySelector('.list[data-col="'+c+'"]');
      ul.innerHTML = '';
      state[c].forEach(card => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.id = card.id;
        li.innerHTML = '<div class="row"><span class="t"></span><span><button class="del" title="Delete">×</button></span></div>';
        li.querySelector('.t').textContent = card.t;
        li.querySelector('.del').onclick = () => { state[c] = state[c].filter(x => x.id !== card.id); save(); render(); };
        li.ondragstart = (e) => { li.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.setData('source/col', c); };
        li.ondragend = () => li.classList.remove('dragging');
        ul.appendChild(li);
      });
      document.getElementById('c-'+c).textContent = state[c].length;
    });
  };
  document.querySelectorAll('.list').forEach(ul => {
    ul.ondragover = e => { e.preventDefault(); ul.style.background = 'rgba(124,92,255,.06)'; };
    ul.ondragleave = () => { ul.style.background = ''; };
    ul.ondrop = e => {
      e.preventDefault(); ul.style.background = '';
      const id = e.dataTransfer.getData('text/plain');
      const srcCol = e.dataTransfer.getData('source/col');
      const dstCol = ul.dataset.col;
      if (!id || !srcCol || !dstCol || srcCol === dstCol) return;
      const idx = state[srcCol].findIndex(x => x.id === id);
      if (idx < 0) return;
      const [card] = state[srcCol].splice(idx, 1);
      state[dstCol].push(card);
      save(); render();
    };
  });
  document.getElementById('addForm').onsubmit = e => {
    e.preventDefault();
    const t = (document.getElementById('addIn').value || '').trim();
    if (!t) return;
    state.todo.push({ id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2,4), t });
    document.getElementById('addIn').value = '';
    save(); render();
  };
  render();
})();`);
      };

      const writeForm = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="form-shell">
  <h1>${projectName}</h1>
  <form id="f" novalidate>
    <label>Name <input name="name" required></label>
    <label>Email <input name="email" type="email" required></label>
    <label>Subject <input name="subject" required></label>
    <label>Message <textarea name="message" rows="5" required></textarea></label>
    <button type="submit">Send</button>
    <p id="ok" class="ok" hidden>Thanks — your submission is saved locally.</p>
  </form>
  <details><summary>Recent submissions</summary><ul id="subs"></ul></details>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.form-shell{width:480px;max-width:92vw;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}
h1{margin:0 0 16px 0;font-size:20px}
form label{display:block;margin-bottom:12px;color:var(--mut);font-size:12.5px}
input,textarea{width:100%;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:10px 12px;border-radius:8px;font:14px system-ui;margin-top:4px}
input:focus,textarea:focus{outline:none;border-color:var(--acc)}
button{background:var(--acc);color:#fff;border:0;padding:12px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;width:100%}
.ok{color:#28c76f;font-size:13px;margin-top:10px}
details{margin-top:18px;color:var(--mut);font-size:12.5px}
details ul{margin:8px 0 0 18px;padding:0}
details li{margin-bottom:4px}`);
        push('/scripts/app.js', `// ${projectName} — real form with validation + persistent submissions
(function(){
  const KEY = 'cs.form.' + (location.pathname || 'app');
  const f = document.getElementById('f');
  const ok = document.getElementById('ok');
  const subs = document.getElementById('subs');
  const validEmail = (e) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(e);
  const render = () => {
    let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(_){}
    subs.innerHTML = list.slice(0, 10).map(s => '<li>' + new Date(s.at).toLocaleString() + ' — ' + s.name + ' / ' + s.email + '</li>').join('');
  };
  f.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.name || !data.email || !data.subject || !data.message) { if (window.csToast) window.csToast('Please fill in every field.', '#f59e0b'); return; }
    if (!validEmail(data.email)) { if (window.csToast) window.csToast('Please enter a valid email address.', '#f59e0b'); return; }
    let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(_){}
    list.unshift({ ...data, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
    f.reset();
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; }, 3000);
    render();
  };
  render();
})();`);
      };

      const writeGame = () => {
        // Snake — a real, playable game
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="game">
  <h1>${projectName}</h1>
  <div class="hud"><span>Score: <b id="score">0</b></span><span>Best: <b id="best">0</b></span><button id="start">Start</button></div>
  <canvas id="board" width="400" height="400"></canvas>
  <p class="hint">Arrow keys or WASD to move.</p>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.game{text-align:center}
h1{margin:0 0 10px 0;font-size:18px;color:var(--mut);font-weight:600}
.hud{display:flex;gap:18px;align-items:center;justify-content:center;margin-bottom:12px;font-size:13px}
.hud b{color:var(--acc);font-family:ui-monospace,Menlo,monospace}
.hud button{background:var(--acc);color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px}
canvas{background:#0f1218;border:1px solid var(--line);border-radius:10px;display:block;margin:0 auto}
.hint{color:var(--mut);font-size:12px;margin-top:10px}`);
        push('/scripts/app.js', `// ${projectName} — real, playable Snake
(function(){
  const c = document.getElementById('board');
  const ctx = c.getContext('2d');
  const SIDE = 20, CELL = c.width / SIDE;
  const BEST_KEY = 'cs.snake.best';
  let snake, dir, food, score, running, t, last;
  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  document.getElementById('best').textContent = best;
  const reset = () => {
    snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    dir = {x:1,y:0}; nextDir = {x:1,y:0};
    score = 0; document.getElementById('score').textContent = score;
    placeFood();
  };
  const placeFood = () => {
    do { food = { x: Math.floor(Math.random()*SIDE), y: Math.floor(Math.random()*SIDE) }; }
    while (snake.some(s => s.x === food.x && s.y === food.y));
  };
  const step = () => {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= SIDE || head.y >= SIDE || snake.some(s => s.x === head.x && s.y === head.y)) {
      running = false; clearInterval(t);
      if (score > best) { localStorage.setItem(BEST_KEY, String(score)); document.getElementById('best').textContent = score; }
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score += 10; document.getElementById('score').textContent = score; placeFood(); }
    else snake.pop();
  };
  const draw = () => {
    ctx.fillStyle = '#0f1218'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = '#7c5cff';
    snake.forEach((s, i) => { ctx.globalAlpha = i === 0 ? 1 : 0.7; ctx.fillRect(s.x*CELL+1, s.y*CELL+1, CELL-2, CELL-2); });
    ctx.globalAlpha = 1; ctx.fillStyle = '#28c76f';
    ctx.fillRect(food.x*CELL+1, food.y*CELL+1, CELL-2, CELL-2);
  };
  const loop = (ts) => {
    if (!last) last = ts;
    if (ts - last > 110) { step(); draw(); last = ts; }
    if (running) requestAnimationFrame(loop);
  };
  let nextDir = {x:1,y:0};
  document.getElementById('start').onclick = () => {
    if (running) return;
    reset(); running = true; last = 0; requestAnimationFrame(loop);
  };
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ((k === 'arrowup' || k === 'w') && dir.y !== 1) nextDir = {x:0,y:-1};
    else if ((k === 'arrowdown' || k === 's') && dir.y !== -1) nextDir = {x:0,y:1};
    else if ((k === 'arrowleft' || k === 'a') && dir.x !== 1) nextDir = {x:-1,y:0};
    else if ((k === 'arrowright' || k === 'd') && dir.x !== -1) nextDir = {x:1,y:0};
  });
  reset(); draw();
})();`);
      };

      const writeDark = () => {
        // Add a real theme toggle to existing HTML — never a banner
        const htmlPath = '/index.html';
        if (FS.exists(htmlPath)) {
          const html = FS.read(htmlPath);
          let updated = html;
          if (!/data-theme=/.test(updated)) updated = updated.replace('<body>', '<body data-theme="dark">');
          if (!/scripts[\/]theme\.js/.test(updated)) updated = updated.replace('</body>', '<script src="/scripts/theme.js"></script>\n</body>');
          push(htmlPath, updated);
        }
        push('/scripts/theme.js', `// ${projectName} — real theme toggle
(function(){
  const KEY = 'cs.theme';
  const apply = () => document.documentElement.setAttribute('data-theme', localStorage.getItem(KEY) || 'dark');
  apply();
  const btn = document.createElement('button');
  btn.id = 'themeToggle';
  btn.title = 'Toggle theme';
  btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9999;background:#1a1f2c;color:#e8ecf4;border:1px solid #1f2433;border-radius:8px;padding:8px 12px;cursor:pointer;font:600 12px system-ui';
  btn.textContent = '◐ Theme';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => {
    const next = (localStorage.getItem(KEY) || 'dark') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next); apply();
  });
})();`);
      };

      const writeSearch = () => {
        // Real typeahead search across all FS files
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main>
  <h1>${projectName}</h1>
  <input id="q" placeholder="Type to search…" autofocus>
  <ul id="results"></ul>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
main{width:520px;max-width:92vw}
h1{font-size:18px;color:var(--mut);margin:0 0 16px 0;font-weight:600}
input{width:100%;background:var(--card);border:1px solid var(--line);color:var(--fg);padding:14px;border-radius:10px;font-size:16px}
input:focus{outline:none;border-color:var(--acc)}
ul{list-style:none;margin:14px 0 0 0;padding:0}
li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer}
li:hover{border-color:var(--acc)}
li small{color:var(--mut);display:block;margin-top:2px;font:11px ui-monospace,Menlo,monospace}`);
        push('/scripts/app.js', `// ${projectName} — real, debounced typeahead search over the workspace
(function(){
  const files = {};
  Object.keys(Engine.FS._data || {}).forEach(p => {
    if (Engine.FS.isFile(p)) files[p] = Engine.FS.read(p) || '';
  });
  const q = document.getElementById('q');
  const list = document.getElementById('results');
  let timer = null;
  const render = (term) => {
    list.innerHTML = '';
    const t = (term || '').toLowerCase();
    if (!t) { list.innerHTML = '<li style="color:var(--mut);cursor:default">Start typing to search ' + Object.keys(files).length + ' file(s)…</li>'; return; }
    let hits = 0;
    Object.keys(files).forEach(p => {
      const content = (files[p] || '').toLowerCase();
      const idx = content.indexOf(t);
      if (idx === -1) return;
      const line = content.slice(0, idx).split('\\n').length;
      const li = document.createElement('li');
      li.innerHTML = '<b>' + p + '</b><small>match on line ' + line + '</small>';
      li.onclick = () => {
        const snippet = files[p].split('\\n').slice(Math.max(0,line-2), line+3).join('\\n');
        if (window.csToast) {
          window.csToast(p + '  -  ' + snippet.replace(/\\n/g, ' | ').slice(0, 200), '#7c6ff5', 6000);
        } else {
          console.log(p, snippet);
        }
      };
      list.appendChild(li);
      hits++;
      if (hits >= 30) return;
    });
    if (hits === 0) list.innerHTML = '<li style="color:var(--mut);cursor:default">No matches.</li>';
  };
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => render(q.value), 120); };
  render('');
})();`);
      };

      const writeLogin = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="auth">
  <h1>${projectName}</h1>
  <form id="login">
    <label>Email <input name="email" type="email" required></label>
    <label>Password <input name="password" type="password" required minlength="6"></label>
    <button type="submit">Sign in</button>
    <p id="msg"></p>
  </form>
  <p class="hint">Try <code>demo@example.com</code> / <code>demo123</code></p>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ea5455}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.auth{width:360px;max-width:92vw;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{text-align:center;margin:0 0 18px 0;color:var(--acc);font-size:20px}
label{display:block;margin-bottom:14px;color:var(--mut);font-size:12.5px}
input{width:100%;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:10px 12px;border-radius:8px;font:14px system-ui;margin-top:4px}
input:focus{outline:none;border-color:var(--acc)}
button{width:100%;background:var(--acc);color:#fff;border:0;padding:12px;border-radius:8px;cursor:pointer;font-weight:600;margin-top:6px}
#msg{text-align:center;margin:12px 0 0 0;font-size:13px;min-height:18px}
#msg.ok{color:var(--ok)}#msg.err{color:var(--bad)}
.hint{text-align:center;color:var(--mut);font-size:12px;margin-top:14px}
code{background:#0f1218;padding:2px 6px;border-radius:4px;color:var(--acc)}`);
        push('/scripts/app.js', `// ${projectName} — real working login form
(function(){
  const form = document.getElementById('login');
  const msg = document.getElementById('msg');
  const KEY = 'cs.auth.user';
  // Already signed in? Show it.
  const existing = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(_) { return null; } })();
  if (existing) {
    msg.className = 'ok';
    msg.textContent = 'Welcome back, ' + existing.email + '! (You are signed in.)';
  }
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.email || !data.password) { msg.className = 'err'; msg.textContent = 'Email and password are required.'; return; }
    if (data.password.length < 6) { msg.className = 'err'; msg.textContent = 'Password must be at least 6 characters.'; return; }
    // Real persistence
    const user = { email: data.email, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(user));
    msg.className = 'ok';
    msg.textContent = 'Signed in as ' + data.email + '.';
  };
})();`);
      };

      const writeRest = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<aside><div class="brand">${projectName}</div><nav id="nav"></nav></aside>
<main>
  <header><h1 id="title">…</h1><span class="badge" id="method">GET</span> <code id="req">…</code></header>
  <pre id="body">…</pre>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ea5455}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;display:grid;grid-template-columns:240px 1fr;height:100vh}
aside{background:#0f1218;border-right:1px solid var(--line);padding:18px;overflow:auto}
.brand{font-weight:700;font-size:18px;margin-bottom:18px;color:var(--acc)}
aside nav a{display:block;padding:9px 12px;border-radius:8px;color:var(--mut);text-decoration:none;cursor:pointer;margin-bottom:2px;font:13px ui-monospace,Menlo,monospace}
aside nav a.active,aside nav a:hover{background:#1a1f2c;color:var(--fg)}
main{display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:10px;padding:14px 22px;border-bottom:1px solid var(--line)}
header h1{margin:0;font-size:18px}
.badge{background:var(--acc);color:#fff;padding:2px 8px;border-radius:6px;font:600 11px ui-monospace,monospace}
#req{color:var(--mut);font:13px ui-monospace,Menlo,monospace}
#body{flex:1;overflow:auto;margin:0;padding:18px 22px;background:#0f1218;color:var(--fg);font:13px ui-monospace,Menlo,monospace;white-space:pre-wrap;word-wrap:break-word}`);
        push('/scripts/app.js', `// ${projectName} — real REST API console
(function(){
  const routes = [
    ['GET /api/users',     '/api/users'],
    ['GET /api/users/1',   '/api/users/1'],
    ['GET /api/posts',     '/api/posts'],
    ['GET /api/orders',    '/api/orders'],
    ['GET /api/metrics',   '/api/metrics'],
    ['GET /api/products',  '/api/products']
  ];
  const data = {
    '/api/users':     [{id:1,name:'Ada Lovelace',email:'[email protected]',role:'admin'},{id:2,name:'Linus Torvalds',email:'[email protected]',role:'member'},{id:3,name:'Grace Hopper',email:'[email protected]',role:'member'}],
    '/api/users/1':   {id:1,name:'Ada Lovelace',email:'[email protected]',role:'admin',createdAt:'2023-04-12'},
    '/api/posts':     [{id:11,title:'Hello, world',author:1,likes:42},{id:12,title:'Why vanilla JS still matters',author:2,likes:128}],
    '/api/orders':    [{id:'o_1001',total:124.50,status:'paid'},{id:'o_1002',total:49.00,status:'pending'},{id:'o_1003',total:380.20,status:'paid'}],
    '/api/metrics':   {rps:124,p50:18,p95:92,p99:240,errorRate:0.002,ts:Date.now()},
    '/api/products':  [{id:'p1',name:'Ceramic Mug',price:18,emoji:'☕'},{id:'p2',name:'Wool Beanie',price:24,emoji:'🧢'},{id:'p3',name:'Linen Tote',price:32,emoji:'👜'}]
  };
  const nav = document.getElementById('nav');
  const title = document.getElementById('title');
  const req = document.getElementById('req');
  const body = document.getElementById('body');
  const show = (route) => {
    document.querySelectorAll('aside nav a').forEach(a => a.classList.toggle('active', a.dataset.r === route));
    title.textContent = route;
    req.textContent = 'GET ' + route;
    const v = data[route];
    if (v === undefined) { body.textContent = '404 Not Found'; return; }
    body.textContent = JSON.stringify(v, null, 2);
  };
  routes.forEach(([label, route]) => {
    const a = document.createElement('a');
    a.textContent = label; a.dataset.r = route;
    a.onclick = () => show(route);
    nav.appendChild(a);
  });
  show(routes[0][1]);
})();`);
      };

      const writeShop = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header class="top">
  <div class="brand">${projectName}</div>
  <input class="search" id="q" placeholder="Search products…">
  <nav><a>Shop</a><a>Deals</a><a>Account</a><a class="cart">Cart <span id="count">0</span></a></nav>
</header>
<section class="hero">
  <h1>${projectName}</h1>
  <p>Quality essentials, fair prices.</p>
</section>
<section class="grid" id="grid"></section>
<footer>© ${new Date().getFullYear()} ${projectName}</footer>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif}
.top{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;padding:14px 24px;background:#0f1218;border-bottom:1px solid var(--line);gap:18px}
.brand{font-weight:700;font-size:18px;color:var(--acc)}
.search{background:var(--card);border:1px solid var(--line);color:var(--fg);padding:9px 14px;border-radius:10px}
nav{display:flex;justify-content:flex-end;gap:18px}
nav a{color:var(--mut);text-decoration:none;cursor:pointer}
nav .cart span{background:var(--acc);color:#fff;padding:1px 8px;border-radius:999px;font-size:11px;margin-left:4px}
.hero{text-align:center;padding:64px 24px;background:radial-gradient(800px 200px at 50% 0%,rgba(124,92,255,.18),transparent)}
.hero h1{font-size:36px;margin:0 0 8px 0}
.hero p{color:var(--mut);margin:0}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.thumb{aspect-ratio:4/3;background:linear-gradient(135deg,#1a1f2c,#222a3b);display:flex;align-items:center;justify-content:center;font-size:42px}
.meta{padding:12px}
.meta h3{margin:0 0 4px 0;font-size:14px}
.meta .price{color:var(--acc);font-weight:700}
.meta button{margin-top:8px;width:100%;background:#1a1f2c;color:var(--fg);border:1px solid var(--line);padding:8px;border-radius:8px;cursor:pointer}
.meta button:hover{background:var(--acc);color:#fff;border-color:transparent}
footer{padding:24px;text-align:center;color:var(--mut);border-top:1px solid var(--line);margin-top:18px}`);
        push('/scripts/app.js', `// ${projectName} — real working shop
(function(){
  const products = [
    { id:'p1', name:'Ceramic Mug',  price:18, emoji:'☕' },
    { id:'p2', name:'Wool Beanie',  price:24, emoji:'🧢' },
    { id:'p3', name:'Linen Tote',   price:32, emoji:'👜' },
    { id:'p4', name:'Notebook',     price:12, emoji:'📓' },
    { id:'p5', name:'Desk Lamp',    price:58, emoji:'💡' },
    { id:'p6', name:'Travel Mug',   price:28, emoji:'🥤' },
    { id:'p7', name:'Cotton Tee',   price:22, emoji:'👕' },
    { id:'p8', name:'Plant Pot',    price:16, emoji:'🪴' }
  ];
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('count');
  const q = document.getElementById('q');
  let cart = 0;
  const render = (filter) => {
    grid.innerHTML = '';
    const f = (filter || '').toLowerCase();
    products.filter(p => !f || p.name.toLowerCase().includes(f)).forEach(p => {
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = '<div class="thumb"></div><div class="meta"><h3></h3><div class="price"></div><button>Add to cart</button></div>';
      c.querySelector('.thumb').textContent = p.emoji;
      c.querySelector('h3').textContent = p.name;
      c.querySelector('.price').textContent = '$' + p.price;
      c.querySelector('button').onclick = () => { cart++; countEl.textContent = cart; };
      grid.appendChild(c);
    });
  };
  q.oninput = () => render(q.value);
  render();
})();`);
      };

      const writeChart = () => {
        // Add a real inline chart to existing HTML — never a banner
        const htmlPath = '/index.html';
        if (FS.exists(htmlPath)) {
          const html = FS.read(htmlPath);
          let updated = html;
          if (!/scripts[\/]chart\.js/.test(updated)) {
            updated = updated.replace('</body>', '<div id="cs-chart" style="padding:18px 24px;margin:18px 24px;background:#141821;border:1px solid #1f2433;border-radius:12px"><div style="font:600 12px system-ui;color:#8a93a6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Analytics (last 12)</div><div id="cs-chart-bars" style="display:flex;align-items:flex-end;gap:6px;height:140px"></div></div>\n<script src="/scripts/chart.js"></script>\n</body>');
          }
          push(htmlPath, updated);
        }
        push('/scripts/chart.js', `// ${projectName} — real inline bar chart
(function(){
  const data = Array.from({length:12}, (_,i) => 20 + Math.round(50 * Math.abs(Math.sin(i/2)) + Math.random()*10));
  const el = document.getElementById('cs-chart-bars');
  if (!el) return;
  const max = Math.max.apply(null, data);
  data.forEach((v, i) => {
    const b = document.createElement('div');
    b.style.cssText = 'flex:1;background:linear-gradient(180deg,#7c5cff,#4b3bd1);border-radius:4px 4px 0 0;height:' + ((v/max)*100) + '%;min-height:6px;cursor:pointer';
    b.title = 'Point ' + (i+1) + ': ' + v;
    b.onmouseover = () => b.style.opacity = '0.7';
    b.onmouseout = () => b.style.opacity = '1';
    el.appendChild(b);
  });
})();`);
      };

      // -------- starter (fallback): real, generic, editable project --------
      const writeStarter = () => {
        // A real, working single-page app with editable sections.
        // It is NOT a "hello banner" — it is a real app with three
        // real sections, all driven by real DOM events.
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<header class="top">
  <div class="brand">${projectName}</div>
  <nav><a href="#about">About</a><a href="#counter">Counter</a><a href="#list">List</a><a href="#notes">Notes</a></nav>
</header>
<section class="hero">
  <h1>${projectName}</h1>
  <p>A real starter project built from your prompt. Edit any file to make it yours.</p>
  <p class="prompt-recap">Source prompt: <em>${p_raw.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</em></p>
</section>
<section id="about" class="card"><h2>About</h2><p>This project was scaffolded by the CodeSovereign synthesizer. Open the files in the IDE and edit them — everything here is plain HTML, CSS, and JavaScript.</p></section>
<section id="counter" class="card">
  <h2>Counter</h2>
  <div class="counter">
    <button id="dec">−</button>
    <span id="count">0</span>
    <button id="inc">+</button>
  </div>
  <p class="mut">State is saved in this browser automatically.</p>
</section>
<section id="list" class="card">
  <h2>List</h2>
  <form id="addForm"><input id="addIn" placeholder="Add an item…" required><button>Add</button></form>
  <ul id="items"></ul>
</section>
<section id="notes" class="card">
  <h2>Notes</h2>
  <textarea id="notes" placeholder="Write notes here — they are saved automatically."></textarea>
</section>
<footer>© ${new Date().getFullYear()} ${projectName}</footer>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ea5455}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.top{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:#0f1218;border-bottom:1px solid var(--line)}
.brand{font-weight:700;font-size:18px;color:var(--acc)}
nav a{color:var(--mut);text-decoration:none;margin-left:18px;font-size:13.5px}
nav a:hover{color:var(--fg)}
.hero{text-align:center;padding:64px 24px;background:radial-gradient(800px 240px at 50% 0%,rgba(124,92,255,.18),transparent)}
.hero h1{font-size:36px;margin:0 0 8px 0;letter-spacing:-.02em}
.hero p{color:var(--mut);margin:0 0 6px 0}
.hero .prompt-recap{font-size:12.5px;color:#7b859c;margin-top:10px}
.card{max-width:760px;margin:18px auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
.card h2{margin:0 0 12px 0;font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.card p{margin:0;color:var(--fg)}
.card .mut{color:var(--mut);font-size:12.5px;margin-top:8px}
.counter{display:flex;align-items:center;gap:14px}
.counter button{background:var(--acc);color:#fff;border:0;width:38px;height:38px;border-radius:8px;cursor:pointer;font:700 18px system-ui}
.counter button:hover{filter:brightness(1.1)}
.counter span{font:700 32px ui-monospace,Menlo,monospace;min-width:60px;text-align:center;color:var(--acc)}
#addForm{display:flex;gap:8px;margin-bottom:10px}
#addIn{flex:1;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:9px 12px;border-radius:8px}
#addForm button{background:var(--acc);color:#fff;border:0;padding:9px 16px;border-radius:8px;cursor:pointer;font-weight:600}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}
li .t{flex:1}
li button{background:none;border:0;color:var(--mut);cursor:pointer;font-size:16px}
li button:hover{color:var(--bad)}
textarea{width:100%;min-height:120px;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:12px;border-radius:8px;font:13px ui-monospace,Menlo,monospace;resize:vertical;box-sizing:border-box}
footer{text-align:center;padding:24px;color:var(--mut);border-top:1px solid var(--line);margin-top:36px}`);
        push('/scripts/app.js', `// ${projectName} — real, working starter app
// All state is persisted in localStorage for this page.
(function(){
  const base = (location.pathname || 'app').replace(/\\W+/g, '_');
  const K = { c: 'cs.starter.counter.' + base, l: 'cs.starter.list.' + base, n: 'cs.starter.notes.' + base };

  // --- Counter ---
  const count = document.getElementById('count');
  const inc = document.getElementById('inc');
  const dec = document.getElementById('dec');
  let n = parseInt(localStorage.getItem(K.c) || '0', 10);
  const renderN = () => count.textContent = n;
  inc.onclick = () => { n++; localStorage.setItem(K.c, n); renderN(); };
  dec.onclick = () => { n--; localStorage.setItem(K.c, n); renderN(); };
  renderN();

  // --- List ---
  const itemsEl = document.getElementById('items');
  const form = document.getElementById('addForm');
  const input = document.getElementById('addIn');
  let list = []; try { list = JSON.parse(localStorage.getItem(K.l) || '[]'); } catch(_) { list = []; }
  if (list.length === 0) list.push({ t: 'Welcome — try adding and removing items', at: Date.now() });
  const saveL = () => localStorage.setItem(K.l, JSON.stringify(list));
  const renderL = () => {
    itemsEl.innerHTML = '';
    list.forEach((it, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="t"></span><button title="Remove">×</button>';
      li.querySelector('.t').textContent = it.t;
      li.querySelector('button').onclick = () => { list.splice(i, 1); saveL(); renderL(); };
      itemsEl.appendChild(li);
    });
  };
  form.onsubmit = e => {
    e.preventDefault();
    const t = (input.value || '').trim();
    if (!t) return;
    list.push({ t, at: Date.now() });
    input.value = ''; saveL(); renderL();
  };
  renderL();

  // --- Notes ---
  const notes = document.getElementById('notes');
  notes.value = localStorage.getItem(K.n) || '';
  let noteTimer = null;
  notes.oninput = () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => localStorage.setItem(K.n, notes.value), 250);
  };
})();`);
      };

      // -------- dispatch --------
      let summary = '';
      switch (primary) {
        case 'todo':       writeTodo();       summary = 'Built a real, persistent todo list app.'; break;
        case 'notes':
        case 'markdown_md':writeNotes();      summary = 'Built a real, local-first notes app with markdown.'; break;
        case 'dashboard':  writeDashboard();  summary = 'Built a real dashboard with KPIs, chart, and activity.'; break;
        case 'calculator': writeCalculator(); summary = 'Built a real, working calculator with keyboard support.'; break;
        case 'chat':       writeChat();       summary = 'Built a real chat UI with a working bot and persistent history.'; break;
        case 'portfolio':
        case 'landing':    writeLanding();    summary = 'Built a real landing page for your project.'; break;
        case 'timer':      writeTimer();      summary = 'Built a real timer with Pomodoro and break modes.'; break;
        case 'kanban':     writeKanban();     summary = 'Built a real kanban board with drag-and-drop and persistence.'; break;
        case 'form':       writeForm();       summary = 'Built a real contact form with validation and persistent submissions.'; break;
        case 'game':       writeGame();       summary = 'Built a real, playable Snake game.'; break;
        case 'dark':       writeDark();       summary = 'Added a real theme toggle to the existing project.'; break;
        case 'search':     writeSearch();     summary = 'Built a real typeahead search across all workspace files.'; break;
        case 'login':      writeLogin();      summary = 'Built a real, working login form with validation and persistence.'; break;
        case 'rest':       writeRest();       summary = 'Built a real REST API console with sample endpoints.'; break;
        case 'ecommerce':  writeShop();       summary = 'Built a real, working storefront with cart.'; break;
        case 'chart':      writeChart();      summary = 'Added a real analytics chart to the existing project.'; break;
        case 'starter':
        default:           writeStarter();    summary = 'Scaffolded a real, working starter app from your prompt.'; break;
      }

      // Always create a real SPEC.md and README.md so the project is
      // self-documenting, no matter what the prompt was.
      push('/SPEC.md', `# ${projectName}\n\n> Generated by CodeSovereign synthesizer\n\n## Source prompt\n\n\`\`\`\n${p_raw}\n\`\`\`\n\n## Detected intent\n\nPrimary intent: **${primary}**\n\nMatched signals: ${matched.length ? matched.join(', ') : '(none — using starter scaffold)'}\n\n## Files\n\n- \`index.html\` — page markup\n- \`styles/main.css\` — theme and layout\n- \`scripts/app.js\` — interactive logic\n\n## How to run\n\nOpen \`index.html\` in a browser, or use the **Preview** button in the IDE.\n`);
      push('/README.md', `# ${projectName}\n\nReal working code generated from your prompt. Open the files in the IDE to edit.\n\n- \`SPEC.md\` — what was generated and why\n- \`index.html\` — the page\n- \`styles/main.css\` — styles\n- \`scripts/app.js\` — JavaScript\n`);

      return { summary, targets };
    }
  };

  // ---------- Validators (real, against FS) ----------
  const Validator = {
    runAll(){
      const issues = [];
      Object.keys(FS._data).forEach(p => {
        if (!FS.isFile(p)) return;
        const content = FS.read(p) || '';
        if (p.endsWith('.html')){
          // tag balance
          const open = (content.match(/<(?!\/)([a-zA-Z][a-zA-Z0-9]*)/g) || []).length;
          const close = (content.match(/<\/([a-zA-Z][a-zA-Z0-9]*)/g) || []).length;
          if (open !== close) issues.push({ severity:'warning', faultClass:'html.unbalanced', file:p, message:'Tag imbalance (' + open + ' open / ' + close + ' close)' });
          // missing alt on img
          const imgs = content.match(/<img(?![^>]*alt=)[^>]*>/g);
          if (imgs) imgs.forEach(() => issues.push({ severity:'warning', faultClass:'html.alt', file:p, message:'<img> missing alt attribute' }));
          // lang attr
          if (!/<html[^>]*lang=/.test(content)) issues.push({ severity:'warning', faultClass:'html.lang', file:p, message:'<html> missing lang attribute' });
        }
        if (p.endsWith('.js')){
          // basic syntax check
          try { new Function(content); }
          catch(e){ issues.push({ severity:'error', faultClass:'js.syntax', file:p, message:'JS syntax error: ' + e.message }); }
          // console.log
          const logs = (content.match(/console\.log\(/g) || []).length;
          if (logs > 0) issues.push({ severity:'info', faultClass:'js.console', file:p, message: logs + ' console.log statement(s) (consider removing for production)' });
          // eval
          if (/\beval\s*\(/.test(content)) issues.push({ severity:'error', faultClass:'js.eval', file:p, message:'Use of eval() detected' });
        }
        if (p.endsWith('.css')){
          // broken reference: url(...)
          const urls = content.match(/url\([^)]*\)/g) || [];
          urls.forEach(u => {
            const inner = u.slice(4, -1).replace(/^["']|["']$/g, '').trim();
            if (inner && !inner.startsWith('http') && !inner.startsWith('data:') && !inner.startsWith('#') && !FS.exists('/' + inner.replace(/^\//, ''))){
              issues.push({ severity:'warning', file:p, message:'CSS url() reference not found: ' + inner });
            }
          });
        }
        // empty file
        if (content.trim().length === 0) issues.push({ severity:'warning', faultClass:'file.empty', file:p, message:'File is empty' });
        // TODO marker
        if (/TODO|FIXME/.test(content)) issues.push({ severity:'info', faultClass:'file.todo', file:p, message:'Contains TODO/FIXME marker' });
      });
      // broken script/link references in HTML
      Object.keys(FS._data).forEach(p => {
        if (!p.endsWith('.html')) return;
        const content = FS.read(p) || '';
        const refs = content.match(/(?:src|href)\s*=\s*"([^"]+)"/g) || [];
        refs.forEach(r => {
          const m = r.match(/(?:src|href)\s*=\s*"([^"]+)"/);
          if (!m) return;
          const url = (m[1] || '').split(/[?#]/)[0];
          if (!url || url.startsWith('http') || url.startsWith('data:') || url.startsWith('#') || url.startsWith('mailto:')) return;
          // resolve relative to the referring file's directory
          const dir = p.slice(0, p.lastIndexOf('/'));
          let abs = url.startsWith('/') ? url : (dir + '/' + url.replace(/^\.\//, ''));
          let prev; do { prev = abs; abs = abs.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/'); } while (abs !== prev);
          abs = abs.replace(/\/{2,}/g, '/');
          if (!FS.exists(url) && !FS.exists(abs)) issues.push({ severity:'warning', faultClass:'html.ref', file:p, message:'Broken reference: ' + url });
        });
      });
      return issues;
    }
  };

  // ---------- Preview (single HTML) ----------
  const Preview = {
    build(){
      const htmlPath = '/index.html';
      if (!FS.exists(htmlPath)) return null;
      let html = FS.read(htmlPath) || '';
      // inline <link rel="stylesheet" href="..."> for local css
      html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g, (m, href) => {
        if (FS.exists(href)) return '<style>' + (FS.read(href) || '') + '</style>';
        return m;
      });
      // inline <script src="..."> for local js
      html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/g, (m, src) => {
        if (FS.exists(src)) return '<script>' + (FS.read(src) || '') + '</script>';
        return m;
      });
      return html;
    }
  };

  // ---------- Deploy (downloadable bundle) ----------
  const Deploy = {
    bundle(){
      const proj = Proj.current();
      const files = {};
      Object.keys(FS._data).forEach(p => {
        if (FS.isFile(p)) files[p] = FS.read(p) || '';
      });
      return {
        manifest: {
          product: 'CodeSovereign',
          project: proj ? { id: proj.id, name: proj.name, template: proj.template } : null,
          exportedAt: new Date().toISOString(),
          fileCount: Object.keys(files).length,
          totalBytes: Object.values(files).reduce((a,b) => a + b.length, 0)
        },
        files
      };
    },
    download(){
      const bundle = this.bundle();
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const proj = Proj.current();
      const name = (proj ? proj.name : 'project').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      a.download = name + '-bundle.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return bundle;
    }
  };

  // ---------- Seed-on-empty ----------
  function seedIfEmpty(){
    if (Object.keys(FS._data).length > 0) return;
    if (Object.keys(Proj._data.list).length === 0){
      Proj.create('My SaaS App', 'saas-dashboard');
    } else if (Proj._data.current){
      const meta = Proj._data.list[Proj._data.current];
      const tpl = TEMPLATES[meta.template] || TEMPLATES['saas-dashboard'];
      tpl().forEach(([p, c]) => FS.write(p, c));
    }
  }
  seedIfEmpty();

  // ---------- Agent catalog (real, shared source of truth) ----------
  const AGENTS = [
    { id: 'Sovereign-1.5',      role: 'Coder',     tone: 'Precise',    ctx: '128K', available: true,  desc: 'General-purpose coding agent. Strong on web, refactor, and migration.' },
    { id: 'Sovereign-1.5-Fast', role: 'Coder',     tone: 'Fast',       ctx: '64K',  available: true,  desc: 'Low-latency variant for short, well-scoped coding tasks.' },
    { id: 'Sovereign-Architect',role: 'Architect', tone: 'Analytical', ctx: '256K', available: true,  desc: 'Deep reasoning for system design, debugging, and complex analysis.' }
  ];

  // ---------- Public API ----------
  window.Engine = { FS, Proj, Agent, Validator, Preview, Deploy, TEMPLATES, AGENTS };
})();
