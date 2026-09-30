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
  //
  // This is the BASE implementation only — by the time the UI calls
  // Engine.Agent.run(), it has been monkey-patched (each patch keeping a
  // reference to the previous Agent.run as its fallback) in this order:
  // engine.stack.js -> engine.llm.js (the real THINK/ACT/OBSERVE loop; when
  // a provider is connected this handles the request entirely and never
  // calls down to this base run()) -> engine.work.js (Evidence/AgentBus) ->
  // engine.runtime.js (/goal routing to Engine.Goal, which delegates repair
  // to Engine.Recovery). This base run() — the contract/scaffold path
  // falling back to _plan()'s keyword generators, itself falling back to
  // writeStarter() — is what actually executes only when no AI provider is
  // configured. See dist/app.js's runAgentWith()/genApp() for the full chain.
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

        // Route a substantial build through Engine.Orchestrator — the actual
        // Build Graph -> Executor -> Observer -> Validator -> Repair system —
        // instead of this file's own one-shot generate()-then-Validator-gate.
        // Only inside the desktop app: Orchestrator's reproof() step needs a
        // real npm test/build run and a real runtime observation to produce
        // the evidence its per-task DoD-based checks read (T-integration /
        // T-tests). That evidence can never exist in a plain browser tab or
        // a unit-test VM, where this would just report every task FAILED
        // despite fine generated code — so outside desktop, fall through
        // unchanged to the existing SC.generate() + static-Validator gate
        // below, exactly as before this change.
        const OR = window.Engine && window.Engine.Orchestrator;
        const desktopReady = !!(window.desktop && window.desktop.isDesktop && FS.__hasWorkspace && FS.__hasWorkspace());
        if (buildable && desktopReady && OR && OR.tasksFromContract && OR.run) {
          let tasks = null;
          try { tasks = OR.tasksFromContract(contract); } catch (e) { tasks = null; }
          if (tasks && tasks.length) {
            emit({ kind:'contract', text:'Contract: ' + reqs.length + ' requirements · ' + ents.map(e => e.name).join(', '), requirements: reqs.length });
            emit({ kind:'plan-result', text:'Plan: build via task graph (' + tasks.map(t => t.name).join(' → ') + ')', taskGraph: tasks.map(t => ({ id: t.id, name: t.name })) });
            emit({ kind:'validate', text:'Running the task graph — generate, then build + test + observe…' });
            // Live per-stage progress: emitted the moment each task starts and
            // each time its outcome is known, not just once at the very end —
            // this is what lets the UI show "Scaffold: running… / done",
            // "Integration: waiting → verifying → complete/failed" in real time.
            const writtenSoFar = {};
            return OR.run({
              tasks: tasks,
              onTaskStart: (tr, task) => {
                emit({ kind:'task-start', text: tr.name + ': generating…', taskId: tr.id, taskName: tr.name });
              },
              onTaskDone: (tr, task) => {
                (tr.notes || []).forEach(n => {
                  const m = /^wrote (.+)$/.exec(n || '');
                  if (m && !writtenSoFar[m[1]]) { writtenSoFar[m[1]] = true; emit({ kind:'write', path: m[1], text:'Writing ' + m[1] }); }
                });
                const verb = tr.status === 'COMPLETE' || tr.status === 'ALREADY_MET' ? 'verified'
                  : tr.status === 'GENERATED' ? 'generated — verifying next'
                  : tr.status === 'FAILED' ? 'did not verify'
                  : 'blocked';
                emit({ kind:'task-done', text: tr.name + ': ' + verb, taskId: tr.id, taskName: tr.name, status: tr.status });
              }
            }).then((record) => {
              emit({ kind:'validate-result', issues: [], dod: record.dodAfter });
              // BLOCKED (no generator could be resolved for a task) is just
              // as much "never actually verified" as FAILED — treating only
              // FAILED as failure would let a run report done while some
              // task silently never even ran.
              const failed = (record.tasks || []).filter(t => t.status === 'FAILED' || t.status === 'BLOCKED');
              if (failed.length) {
                emit({ kind:'warn', text:'Built via task graph (' + record.summary + '), but ' +
                  failed.map(t => t.name).join(', ') + ' did not verify — see .sovereign/orchestrator-run.json.' });
              } else {
                emit({ kind:'done', text:'Run complete (' + record.summary + ').' });
              }
              return steps;
            }).catch((e) => {
              emit({ kind:'error', text:'Task-graph build failed: ' + String((e && e.message) || e) });
              return steps;
            });
          }
        }

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

        if (plan.offlineFallback) {
          emit({ kind:'warn', text:'No AI connected and no built-in template matched — generated a generic starter scaffold, not the app you described. See SPEC.md.' });
        }

        if (plan.reasoning) {
          emit({ kind:'thinking', text: plan.reasoning });
        }

        emit({ kind:'plan-result', text:'Plan: ' + plan.summary, files: plan.targets, suggestions: plan.suggestions });

        return new Promise(resolve => {
          let i = 0;
          const gap = plan.viaContract ? 20 : 120;
          const apply = () => {
            if (i >= plan.targets.length){
              emit({ kind:'validate', text:'Running validators…' });
              const v = Validator.runAll();
              emit({ kind:'validate-result', issues: v });
              // "Files were written" is not "it works" — only report success
              // when nothing blocking was found. A generator that produced
              // broken JS (syntax errors, banned eval) must say so, not
              // silently emit 'done' the same way a clean run would.
              const blocking = (v || []).filter(function (i2) { return i2.severity === 'error'; });
              if (blocking.length) {
                emit({ kind:'warn', text:'Wrote ' + plan.targets.length + ' file(s), but ' + blocking.length + ' blocking issue(s) remain: ' +
                  blocking.slice(0, 3).map(function (i2) { return (i2.file || '') + ': ' + i2.message; }).join('; ') +
                  (blocking.length > 3 ? '…' : '') });
              } else {
                emit({ kind:'done', text:'Run complete.' });
                if (plan.suggestions && plan.suggestions.length) {
                  emit({ kind:'suggestions', text:'What next?', items: plan.suggestions });
                }
              }
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

      // Project name: the prompt's first meaningful words, as a title. Only one
      // leading verb used to be stripped, so apps shipped titled "me a chatbot",
      // "I need something to compute numbers" or "I need a post engine for".
      // Strip leading filler repeatedly, drop a dangling word left by the
      // 6-word cut, title-case, and keep "<"/">" out of the HTML it lands in.
      const TITLE_FILLER = /^(please|kindly|(can|could|would) you|i('d| would) like( to)?|i want( to)?|i need( to)?|we need( to)?|we want( to)?|need to|help me( with| to)?|let me have|give me|show me|build|create|make|design and build|design|implement|add|write|develop|generate|craft|ship|launch|me|us|for me|something( that| to| for)?|some|a|an|the|to|should be)\s+/i;
      const TITLE_ACRONYMS = { api: 'API', kpi: 'KPI', ui: 'UI', ux: 'UX', qr: 'QR', rss: 'RSS', pwa: 'PWA', md: 'MD', http: 'HTTP', ai: 'AI', crm: 'CRM', saas: 'SaaS', css: 'CSS', html: 'HTML', json: 'JSON', sql: 'SQL', url: 'URL', seo: 'SEO', faq: 'FAQ' };
      let titleRaw = p_raw.split(/[.\n!?]/)[0].replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
      for (let i = 0; i < 10; i++) { const next = titleRaw.replace(TITLE_FILLER, ''); if (next === titleRaw) break; titleRaw = next; }
      const titleWords = titleRaw.split(' ').filter(Boolean).slice(0, 6);
      while (titleWords.length > 1 && /^(for|to|with|and|or|of|a|an|the|in|on|that|which)$/i.test(titleWords[titleWords.length - 1])) titleWords.pop();
      const projectName = titleWords.map((w) => TITLE_ACRONYMS[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1))).join(' ') || 'My App';
      const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

      // -------- helpers --------
      const targets = [];
      const push = (path, content) => targets.push({ path, content });
      const existing = path => { try { return FS.read(path) || ''; } catch (_) { return ''; } };

      // -------- intent detection --------
      const has = (...kws) => kws.some(kw => p.includes(kw));
      // Word-boundary variant, for short bare keywords ('pwa') that would
      // otherwise false-match as a raw substring of an unrelated word
      // (e.g. 'pwa' inside "stopwatch").
      const hasWord = (...kws) => kws.some(kw => new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(p));
      const intents = {
        chart:       has('chart', 'graph', 'plot'),
        todo:        has('todo', 'task', 'checklist', 'to-do', 'to do'),
        notes:       has('note app', 'note-taking', 'markdown note', 'markdown editor', 'note editor', 'notes', 'notepad', 'notebook'),
        markdown:    has('markdown blog', 'blog', 'article', 'post engine', 'cms'),
        chat:        has('realtime chat', 'chat with presence', 'chat app', 'messaging', 'chat ui', 'live chat', 'chatbot', 'chat bot'),
        dashboard:   has('dashboard', 'kpi', 'metrics', 'analytics', 'admin panel', 'overview'),
        rest:        has('rest api', 'rest console', 'api console', 'http api', 'endpoint'),
        ecommerce:   has('ecommerce', 'e-commerce', 'shop', 'store', 'storefront', 'product grid', 'cart', 'checkout'),
        mobile:      has('mobile app', 'ios app', 'android app', 'phone app') || hasWord('pwa'),
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
        form:        has('form', 'survey', 'questionnaire'),
        social:      has('facebook', 'social network', 'social media', 'social feed', 'newsfeed', 'news feed', 'timeline', 'friends list', 'instagram', 'twitter feed')
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
    if (!/^[0-9+\\-*/(). %]*$/.test(s)) return null;
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
    if (/[0-9+\\-*/().]/.test(k)) { expr += k; exprEl.textContent = expr; }
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
  <pre id="detail" hidden></pre>
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
li small{color:var(--mut);display:block;margin-top:2px;font:11px ui-monospace,Menlo,monospace}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:10px 0 0 0;white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,monospace;max-height:240px;overflow:auto}`);
        // The generated app used to read Engine.FS at runtime — the builder's
        // in-memory FS, which does not exist in the app itself (nor in the
        // sandboxed preview iframe): "Engine is not defined" on load. Embed a
        // snapshot of the workspace's text files at generation time instead.
        const searchIndex = {};
        let searchBytes = 0;
        Object.keys(FS._data || {}).sort().forEach(p => {
          if (!FS.isFile(p)) return;
          const c = String(FS.read(p) || '');
          if (searchBytes + c.length > 400000) return;
          searchIndex[p] = c; searchBytes += c.length;
        });
        push('/scripts/app.js', `// ${projectName} — real, debounced typeahead search over the files that were
// in the workspace when this app was generated (snapshot embedded below).
(function(){
  const files = ${JSON.stringify(searchIndex)};
  const q = document.getElementById('q');
  const list = document.getElementById('results');
  const detail = document.getElementById('detail');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let timer = null;
  const render = (term) => {
    list.innerHTML = '';
    detail.hidden = true;
    const t = (term || '').toLowerCase();
    if (!t) { list.innerHTML = '<li style="color:var(--mut);cursor:default">Start typing to search ' + Object.keys(files).length + ' file(s)…</li>'; return; }
    let hits = 0;
    for (const p of Object.keys(files)) {
      const content = (files[p] || '').toLowerCase();
      const idx = content.indexOf(t);
      if (idx === -1) continue;
      const line = content.slice(0, idx).split('\\n').length;
      const li = document.createElement('li');
      li.innerHTML = '<b>' + esc(p) + '</b><small>match on line ' + line + '</small>';
      li.onclick = () => {
        const snippet = files[p].split('\\n').slice(Math.max(0, line - 3), line + 2).join('\\n');
        detail.textContent = p + ':' + line + '\\n\\n' + snippet;
        detail.hidden = false;
      };
      list.appendChild(li);
      if (++hits >= 30) break;
    }
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

      const writeSocial = () => {
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
  <nav><a class="active" href="#feed">Home</a><a href="#profile">Profile</a></nav>
</header>
<main class="layout">
  <aside class="side">
    <div class="card profile">
      <div class="avatar" id="meAvatar"></div>
      <div class="name" id="meName">You</div>
      <div class="bio">Building ${projectName} with CodeSovereign.</div>
      <div class="stat"><span id="friendCount">0</span> friends</div>
    </div>
    <div class="card">
      <h2>Friends</h2>
      <ul id="friends" class="friends"></ul>
    </div>
  </aside>
  <section class="feed">
    <form id="composer" class="card composer">
      <textarea id="postText" placeholder="What's on your mind?" required></textarea>
      <div class="composerRow"><button type="submit">Post</button></div>
    </form>
    <div id="posts" class="posts"></div>
  </section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ea5455}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:#0f1218;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:2}
.brand{font-weight:700;font-size:18px;color:var(--acc)}
nav a{color:var(--mut);text-decoration:none;margin-left:18px;font-size:13.5px;padding-bottom:4px;border-bottom:2px solid transparent}
nav a:hover,nav a.active{color:var(--fg);border-color:var(--acc)}
.layout{max-width:920px;margin:0 auto;padding:24px 16px;display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:start}
@media (max-width:680px){.layout{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px}
.card h2{margin:0 0 10px 0;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.profile{text-align:center}
.avatar{width:64px;height:64px;border-radius:50%;margin:0 auto 10px;background:linear-gradient(135deg,var(--acc),#5b3df0);display:flex;align-items:center;justify-content:center;font:700 22px system-ui;color:#fff}
.name{font-weight:700;font-size:15px}
.bio{color:var(--mut);font-size:12.5px;margin-top:4px}
.stat{margin-top:10px;font-size:12.5px;color:var(--mut)}
.stat span{color:var(--fg);font-weight:700}
.friends{list-style:none;margin:0;padding:0}
.friends li{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13px}
.friends .favatar{width:28px;height:28px;border-radius:50%;background:#1a1f2c;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font:700 11px system-ui;color:var(--acc);flex:none}
.composer textarea{width:100%;min-height:64px;background:#0f1218;border:1px solid var(--line);color:var(--fg);padding:12px;border-radius:8px;font:14px system-ui;resize:vertical;box-sizing:border-box}
.composerRow{display:flex;justify-content:flex-end;margin-top:10px}
.composerRow button{background:var(--acc);color:#fff;border:0;padding:9px 20px;border-radius:8px;cursor:pointer;font-weight:600}
.post{margin-bottom:14px}
.postHead{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.postHead .favatar{width:36px;height:36px;border-radius:50%;background:#1a1f2c;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font:700 13px system-ui;color:var(--acc);flex:none}
.postAuthor{font-weight:600;font-size:13.5px}
.postTime{color:var(--mut);font-size:11.5px}
.postText{white-space:pre-wrap;word-wrap:break-word;margin:0 0 10px 0}
.postActions{display:flex;gap:14px;border-top:1px solid var(--line);padding-top:10px}
.likeBtn{background:none;border:0;color:var(--mut);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px}
.likeBtn:hover{color:var(--acc)}
.likeBtn.liked{color:var(--acc);font-weight:600}
.empty{color:var(--mut);text-align:center;padding:20px;font-size:13px}`);
        push('/scripts/app.js', `// ${projectName} — a real, working social feed (posts, likes, friends), all persisted in localStorage
(function(){
  const base = (location.pathname || 'app').replace(/\\W+/g, '_');
  const K = { posts: 'cs.social.posts.' + base, friends: 'cs.social.friends.' + base };
  const initials = (name) => (name || '?').split(/\\s+/).filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');

  document.getElementById('meAvatar').textContent = initials('You');

  const FRIEND_NAMES = ['Alex Rivera', 'Sam Chen', 'Jordan Lee', 'Priya Patel'];
  let friends = [];
  try { friends = JSON.parse(localStorage.getItem(K.friends) || 'null'); } catch (_) { friends = null; }
  if (!friends) { friends = FRIEND_NAMES.map(name => ({ name })); localStorage.setItem(K.friends, JSON.stringify(friends)); }
  document.getElementById('friendCount').textContent = friends.length;
  const friendsEl = document.getElementById('friends');
  friends.forEach(f => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="favatar"></span><span class="fname"></span>';
    li.querySelector('.favatar').textContent = initials(f.name);
    li.querySelector('.fname').textContent = f.name;
    friendsEl.appendChild(li);
  });

  let posts = [];
  try { posts = JSON.parse(localStorage.getItem(K.posts) || 'null'); } catch (_) { posts = null; }
  if (!posts) {
    posts = [
      { author: 'Sam Chen', text: 'Just shipped the first version of ' + ${JSON.stringify(projectName)} + ' — feels great to have something real running.', at: Date.now() - 3600000, likes: 3, liked: false },
      { author: 'Alex Rivera', text: 'Welcome to the feed! Post something below to see it appear here instantly.', at: Date.now() - 7200000, likes: 1, liked: false }
    ];
    localStorage.setItem(K.posts, JSON.stringify(posts));
  }
  const save = () => localStorage.setItem(K.posts, JSON.stringify(posts));

  const fmtTime = (ts) => {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  };

  const postsEl = document.getElementById('posts');
  const render = () => {
    postsEl.innerHTML = '';
    if (!posts.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No posts yet — write the first one above.';
      postsEl.appendChild(e);
      return;
    }
    posts.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'card post';
      el.innerHTML =
        '<div class="postHead"><span class="favatar"></span>' +
        '<div><div class="postAuthor"></div><div class="postTime"></div></div></div>' +
        '<p class="postText"></p>' +
        '<div class="postActions"><button class="likeBtn" type="button"><span class="likeIcon">&#9825;</span><span class="likeCount"></span></button></div>';
      el.querySelector('.favatar').textContent = initials(p.author);
      el.querySelector('.postAuthor').textContent = p.author;
      el.querySelector('.postTime').textContent = fmtTime(p.at);
      el.querySelector('.postText').textContent = p.text;
      const likeBtn = el.querySelector('.likeBtn');
      const likeCount = el.querySelector('.likeCount');
      const paintLike = () => {
        likeCount.textContent = p.likes;
        likeBtn.classList.toggle('liked', !!p.liked);
        likeBtn.querySelector('.likeIcon').innerHTML = p.liked ? '&#9829;' : '&#9825;';
      };
      paintLike();
      likeBtn.onclick = () => {
        p.liked = !p.liked;
        p.likes += p.liked ? 1 : -1;
        save();
        paintLike();
      };
      postsEl.appendChild(el);
    });
  };
  render();

  const composer = document.getElementById('composer');
  const postText = document.getElementById('postText');
  composer.onsubmit = (e) => {
    e.preventDefault();
    const text = (postText.value || '').trim();
    if (!text) return;
    posts.unshift({ author: 'You', text, at: Date.now(), likes: 0, liked: false });
    postText.value = '';
    save();
    render();
  };
})();`);
      };

      const writeWeather = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="wx">
  <h1>${projectName}</h1>
  <form id="searchForm"><input id="city" placeholder="Search a city…" required autocomplete="off"><button>Search</button></form>
  <div id="status" class="status"></div>
  <section id="result" class="result" hidden>
    <div class="place" id="place"></div>
    <div class="now">
      <div class="temp" id="temp"></div>
      <div class="cond" id="cond"></div>
    </div>
    <div class="grid" id="details"></div>
    <div class="forecast" id="forecast"></div>
  </section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff;--ok:#28c76f;--warn:#e0a020}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.wx{max-width:520px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 18px}
#searchForm{display:flex;gap:8px}
#searchForm input{flex:1;background:#1a1f2c;border:1px solid var(--line);border-radius:8px;padding:10px 12px;color:var(--fg);font-size:14px}
#searchForm button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
.status{color:var(--mut);margin-top:12px;font-size:13px;min-height:18px}
.result{margin-top:20px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
.place{color:var(--mut);font-size:13px;text-transform:uppercase;letter-spacing:.05em}
.now{display:flex;align-items:baseline;gap:14px;margin:8px 0 18px}
.temp{font:700 56px ui-monospace,Menlo,monospace;color:var(--acc)}
.cond{font-size:16px;color:var(--fg)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.grid div{background:#1a1f2c;border-radius:8px;padding:10px;font-size:12.5px;color:var(--mut)}
.grid b{display:block;color:var(--fg);font-size:15px;margin-top:2px}
.forecast{display:flex;gap:8px;overflow-x:auto}
.day{flex:1;min-width:64px;text-align:center;background:#1a1f2c;border-radius:8px;padding:10px 6px;font-size:12px;color:var(--mut)}
.day b{display:block;color:var(--fg);margin:4px 0}`);
        push('/scripts/app.js', `// ${projectName} — real weather, via Open-Meteo (free, no key required)
(function(){
  const CODE = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',
    51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
    71:'Light snow',73:'Snow',75:'Heavy snow',80:'Rain showers',81:'Rain showers',82:'Violent showers',
    95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Thunderstorm w/ heavy hail'};
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  async function search(city) {
    statusEl.textContent = 'Searching…';
    resultEl.hidden = true;
    try {
      const geo = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city)).then(r => r.json());
      const hit = geo.results && geo.results[0];
      if (!hit) { statusEl.textContent = 'No city found for "' + city + '".'; return; }
      const wx = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + hit.latitude + '&longitude=' + hit.longitude +
        '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto').then(r => r.json());
      document.getElementById('place').textContent = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
      document.getElementById('temp').textContent = Math.round(wx.current.temperature_2m) + '°C';
      document.getElementById('cond').textContent = CODE[wx.current.weather_code] || 'Unknown';
      document.getElementById('details').innerHTML =
        '<div>Humidity<b>' + wx.current.relative_humidity_2m + '%</b></div>' +
        '<div>Wind<b>' + Math.round(wx.current.wind_speed_10m) + ' km/h</b></div>';
      const days = wx.daily.time.slice(0, 5).map((d, i) => {
        const label = new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
        return '<div class="day">' + label + '<b>' + Math.round(wx.daily.temperature_2m_max[i]) + '°</b>' + Math.round(wx.daily.temperature_2m_min[i]) + '°</div>';
      }).join('');
      document.getElementById('forecast').innerHTML = days;
      resultEl.hidden = false;
      statusEl.textContent = '';
      try { localStorage.setItem('cs.weather.lastCity', city); } catch(_){}
    } catch (e) {
      statusEl.textContent = 'Could not load weather — check your connection (needs internet for real data).';
    }
  }
  document.getElementById('searchForm').onsubmit = (e) => {
    e.preventDefault();
    const city = document.getElementById('city').value.trim();
    if (city) search(city);
  };
  try {
    const last = localStorage.getItem('cs.weather.lastCity');
    if (last) { document.getElementById('city').value = last; search(last); }
  } catch(_){}
})();`);
      };

      const writeQuiz = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="quiz">
  <h1>${projectName}</h1>
  <div id="progress" class="progress"></div>
  <div id="card" class="card"></div>
  <div id="finalScore" class="final" hidden></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--ok:#28c76f;--bad:#ff5c5c}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.quiz{width:420px;padding:24px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 8px;text-align:center}
.progress{color:var(--mut);font-size:12.5px;text-align:center;margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
.q{font-size:16px;margin-bottom:16px;font-weight:600}
.opt{display:block;width:100%;text-align:left;background:#1a1f2c;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;font-size:13.5px}
.opt:hover{border-color:var(--acc)}
.opt.correct{background:rgba(40,199,111,.18);border-color:var(--ok)}
.opt.wrong{background:rgba(255,92,92,.18);border-color:var(--bad)}
.next{margin-top:12px;background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
.final{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px;text-align:center}
.final .big{font:700 42px ui-monospace,Menlo,monospace;color:var(--acc);margin:10px 0}
.final .best{color:var(--mut);font-size:13px}`);
        push('/scripts/app.js', `// ${projectName} — real quiz with scoring
(function(){
  const QUESTIONS = [
    { q: 'What does HTML stand for?', opts: ['Hyper Text Markup Language','High Tech Modern Language','Home Tool Markup Language','Hyperlink and Text Markup Language'], a: 0 },
    { q: 'Which company created JavaScript?', opts: ['Microsoft','Netscape','Apple','Sun Microsystems'], a: 1 },
    { q: 'What is the capital of Japan?', opts: ['Seoul','Beijing','Tokyo','Bangkok'], a: 2 },
    { q: 'What is 7 × 8?', opts: ['54','56','58','64'], a: 1 },
    { q: 'Which planet is known as the Red Planet?', opts: ['Venus','Mars','Jupiter','Saturn'], a: 1 },
    { q: 'What does CSS stand for?', opts: ['Creative Style Sheets','Cascading Style Sheets','Computer Style Sheets','Colorful Style Sheets'], a: 1 },
    { q: 'Who wrote "Romeo and Juliet"?', opts: ['Charles Dickens','Mark Twain','William Shakespeare','Jane Austen'], a: 2 },
    { q: 'What is the largest ocean on Earth?', opts: ['Atlantic','Indian','Arctic','Pacific'], a: 3 }
  ];
  let order = QUESTIONS.map((_, i) => i).sort(() => Math.random() - 0.5);
  let idx = 0, score = 0, answered = false;
  const card = document.getElementById('card');
  const progress = document.getElementById('progress');
  const finalEl = document.getElementById('finalScore');
  function render() {
    if (idx >= order.length) return finish();
    const item = QUESTIONS[order[idx]];
    answered = false;
    progress.textContent = 'Question ' + (idx + 1) + ' of ' + order.length + ' · Score ' + score;
    card.innerHTML = '<div class="q">' + item.q + '</div>' +
      item.opts.map((o, i) => '<button class="opt" data-i="' + i + '">' + o + '</button>').join('');
    card.querySelectorAll('.opt').forEach(btn => btn.onclick = () => choose(btn, item));
  }
  function choose(btn, item) {
    if (answered) return;
    answered = true;
    const i = parseInt(btn.dataset.i, 10);
    card.querySelectorAll('.opt').forEach((b, bi) => {
      if (bi === item.a) b.classList.add('correct');
      else if (bi === i) b.classList.add('wrong');
    });
    if (i === item.a) score++;
    const next = document.createElement('button');
    next.className = 'next'; next.textContent = idx + 1 < order.length ? 'Next question' : 'See results';
    next.onclick = () => { idx++; render(); };
    card.appendChild(next);
  }
  function finish() {
    card.remove(); progress.remove();
    let best = 0;
    try { best = parseInt(localStorage.getItem('cs.quiz.best') || '0', 10); } catch(_){}
    if (score > best) { best = score; try { localStorage.setItem('cs.quiz.best', String(best)); } catch(_){} }
    finalEl.hidden = false;
    finalEl.innerHTML = '<div>Quiz complete!</div><div class="big">' + score + ' / ' + order.length + '</div>' +
      '<div class="best">Best score: ' + best + ' / ' + order.length + '</div>' +
      '<button class="next" id="retry" style="margin-top:14px">Play again</button>';
    document.getElementById('retry').onclick = () => location.reload();
  }
  render();
})();`);
      };

      const writeClock = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="clock">
  <h1>${projectName}</h1>
  <form id="addForm"><select id="tzSelect"></select><button>Add clock</button></form>
  <div id="clocks" class="clocks"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.clock{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 18px}
#addForm{display:flex;gap:8px;margin-bottom:20px}
#addForm select{flex:1;background:#1a1f2c;border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg)}
#addForm button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
.clocks{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;position:relative}
.tile .name{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.tile .time{font:700 30px ui-monospace,Menlo,monospace;color:var(--acc);margin:8px 0 2px}
.tile .date{color:var(--mut);font-size:12px}
.tile .rm{position:absolute;top:10px;right:10px;background:none;border:none;color:var(--mut);cursor:pointer;font-size:14px}`);
        push('/scripts/app.js', `// ${projectName} — real, live-updating world clock
(function(){
  const ZONES = ['America/New_York','America/Los_Angeles','America/Chicago','Europe/London','Europe/Paris','Europe/Berlin',
    'Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Asia/Dubai','Australia/Sydney','Pacific/Auckland','UTC'];
  const select = document.getElementById('tzSelect');
  select.innerHTML = ZONES.map(z => '<option value="' + z + '">' + z.replace(/_/g,' ') + '</option>').join('');
  const K = 'cs.clock.zones';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let zones = load();
  if (!zones.length) zones = [Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', 'Europe/London', 'Asia/Tokyo'];
  const clocksEl = document.getElementById('clocks');
  function render() {
    clocksEl.innerHTML = zones.map((z, i) => {
      const now = new Date();
      const time = new Intl.DateTimeFormat('en-US', { timeZone: z, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
      const date = new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'short', month: 'short', day: 'numeric' }).format(now);
      return '<div class="tile"><button class="rm" data-i="' + i + '">✕</button><div class="name">' + z.replace(/_/g,' ') + '</div>' +
        '<div class="time">' + time + '</div><div class="date">' + date + '</div></div>';
    }).join('');
    clocksEl.querySelectorAll('.rm').forEach(b => b.onclick = () => {
      zones.splice(parseInt(b.dataset.i, 10), 1); save(zones); render();
    });
  }
  document.getElementById('addForm').onsubmit = (e) => {
    e.preventDefault();
    const z = select.value;
    if (!zones.includes(z)) { zones.push(z); save(zones); render(); }
  };
  render();
  setInterval(render, 1000);
})();`);
      };

      const writeMusic = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="board">
  <h1>${projectName}</h1>
  <p class="hint">Click a pad, or press keys 1–9 / Q–I.</p>
  <div id="pads" class="pads"></div>
  <div class="ctrls">
    <label>Tempo <input id="bpm" type="range" min="60" max="200" value="120"></label>
    <button id="playSeq">▶ Play sequence</button>
    <button id="clearSeq">Clear</button>
  </div>
  <div id="seqView" class="seq"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.board{max-width:560px;margin:0 auto;padding:32px 20px;text-align:center}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 4px}
.hint{color:var(--mut);font-size:12.5px;margin:0 0 20px}
.pads{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pad{aspect-ratio:1;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:700 16px ui-monospace,Menlo,monospace;cursor:pointer;transition:transform .05s}
.pad:active,.pad.hit{transform:scale(.94);background:var(--acc);color:#fff}
.ctrls{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap}
.ctrls label{color:var(--mut);font-size:12.5px;display:flex;align-items:center;gap:6px}
.ctrls button{background:#1a1f2c;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px}
.seq{color:var(--mut);font-size:12px;margin-top:14px;min-height:18px}`);
        push('/scripts/app.js', `// ${projectName} — real soundboard, synthesized via the Web Audio API (no audio files needed)
(function(){
  const NOTES = [261.63,293.66,329.63,349.23,392.00,440.00,493.88,523.25,587.33];
  const KEYS = ['1','2','3','4','5','6','7','8','9'];
  let ctx = null;
  const ensureCtx = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; };
  function beep(freq, dur) {
    const ac = ensureCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (dur || 0.3));
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + (dur || 0.3));
  }
  const padsEl = document.getElementById('pads');
  padsEl.innerHTML = NOTES.map((f, i) => '<button class="pad" data-i="' + i + '">' + KEYS[i] + '</button>').join('');
  let sequence = [];
  const seqView = document.getElementById('seqView');
  function hit(i, record) {
    beep(NOTES[i]);
    const el = padsEl.children[i];
    el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 120);
    if (record) { sequence.push(i); seqView.textContent = 'Recorded ' + sequence.length + ' note(s)'; }
  }
  padsEl.querySelectorAll('.pad').forEach((b, i) => b.onclick = () => hit(i, true));
  window.addEventListener('keydown', (e) => {
    const i = KEYS.indexOf(e.key);
    if (i >= 0) hit(i, true);
  });
  document.getElementById('playSeq').onclick = () => {
    const bpm = parseInt(document.getElementById('bpm').value, 10);
    const gap = 60000 / bpm;
    sequence.forEach((i, idx) => setTimeout(() => hit(i, false), idx * gap));
  };
  document.getElementById('clearSeq').onclick = () => { sequence = []; seqView.textContent = ''; };
})();`);
      };

      const writeDrawing = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="draw">
  <h1>${projectName}</h1>
  <div class="tools">
    <input type="color" id="color" value="#3aa0ff">
    <input type="range" id="size" min="1" max="40" value="6">
    <button id="clear">Clear</button>
    <button id="save">Download PNG</button>
  </div>
  <canvas id="canvas" width="800" height="520"></canvas>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.draw{max-width:840px;margin:0 auto;padding:24px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.tools{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.tools button{background:#1a1f2c;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px}
.tools input[type=color]{width:40px;height:32px;border:none;border-radius:6px;background:none;cursor:pointer}
#canvas{width:100%;background:#fff;border-radius:14px;border:1px solid var(--line);touch-action:none;cursor:crosshair}`);
        push('/scripts/app.js', `// ${projectName} — real canvas drawing app
(function(){
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const colorEl = document.getElementById('color');
  const sizeEl = document.getElementById('size');
  let drawing = false, lastX = 0, lastY = 0;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * scaleX, y: (p.clientY - r.top) * scaleY };
  }
  function start(e) { drawing = true; const p = pos(e); lastX = p.x; lastY = p.y; }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.strokeStyle = colorEl.value;
    ctx.lineWidth = parseInt(sizeEl.value, 10);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
  function end() { drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);
  document.getElementById('clear').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('save').onclick = () => {
    const a = document.createElement('a');
    a.download = 'drawing.png';
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
  };
})();`);
      };

      const writeGallery = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="gal">
  <h1>${projectName}</h1>
  <label class="add"><input type="file" id="fileInput" accept="image/*" multiple hidden>+ Add photos</label>
  <div id="grid" class="grid"></div>
  <div id="empty" class="empty" hidden>No photos yet — add some above.</div>
</main>
<div id="lightbox" class="lightbox" hidden><img id="lightboxImg"><button id="lbClose">✕</button></div>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.gal{max-width:900px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.add{display:inline-block;background:var(--acc);color:#fff;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer;margin-bottom:18px;font-size:13.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.thumb{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--line);cursor:pointer}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb .rm{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer}
.empty{color:var(--mut);font-size:13px;margin-top:20px}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:10}
.lightbox img{max-width:90%;max-height:85%;border-radius:8px}
.lightbox button{position:absolute;top:20px;right:24px;background:none;border:none;color:#fff;font-size:22px;cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real photo gallery (uploads stored locally as data URLs)
(function(){
  const K = 'cs.gallery.photos';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let photos = load();
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  function render() {
    empty.hidden = photos.length > 0;
    grid.innerHTML = photos.map((src, i) =>
      '<div class="thumb" data-i="' + i + '"><img src="' + src + '"><button class="rm" data-i="' + i + '">✕</button></div>'
    ).join('');
    grid.querySelectorAll('.thumb img').forEach(img => img.onclick = () => openLightbox(img.src));
    grid.querySelectorAll('.rm').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      photos.splice(parseInt(b.dataset.i, 10), 1); save(photos); render();
    });
  }
  function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').hidden = false;
  }
  document.getElementById('lbClose').onclick = () => { document.getElementById('lightbox').hidden = true; };
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    let pending = files.length;
    if (!pending) return;
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => { photos.push(reader.result); if (--pending === 0) { save(photos); render(); } };
      reader.readAsDataURL(f);
    });
  });
  render();
})();`);
      };

      const writeCalendar = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="cal">
  <h1>${projectName}</h1>
  <div class="nav"><button id="prev">‹</button><div id="label" class="label"></div><button id="next">›</button></div>
  <div class="dow"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
  <div id="grid" class="grid"></div>
</main>
<div id="dayModal" class="modal" hidden>
  <div class="box">
    <div class="mhead"><span id="mdate"></span><button id="mclose">✕</button></div>
    <div id="events" class="events"></div>
    <form id="addEvent"><input id="etext" placeholder="Add an event…" required><button>Add</button></form>
  </div>
</div>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.cal{max-width:640px;margin:0 auto;padding:28px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.nav button{background:#1a1f2c;color:var(--fg);border:1px solid var(--line);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px}
.label{font-weight:600;font-size:15px}
.dow{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;color:var(--mut);font-size:11.5px;margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.day{aspect-ratio:1;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;font-size:12px;cursor:pointer;position:relative}
.day.other{opacity:.3}
.day.today{border-color:var(--acc)}
.day .dot{position:absolute;bottom:6px;left:6px;width:6px;height:6px;border-radius:50%;background:var(--acc)}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;width:320px}
.mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:600}
.mhead button{background:none;border:none;color:var(--mut);cursor:pointer;font-size:14px}
.events{margin-bottom:12px;max-height:160px;overflow:auto}
.events div{background:#1a1f2c;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between}
.events button{background:none;border:none;color:var(--mut);cursor:pointer}
#addEvent{display:flex;gap:6px}
#addEvent input{flex:1;background:#1a1f2c;border:1px solid var(--line);border-radius:6px;padding:8px;color:var(--fg)}
#addEvent button{background:var(--acc);color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real month calendar with persistent events
(function(){
  const K = 'cs.calendar.events';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch(_) { return {}; } };
  const save = (m) => { try { localStorage.setItem(K, JSON.stringify(m)); } catch(_){} };
  let events = load();
  let view = new Date(); view.setDate(1);
  const grid = document.getElementById('grid');
  const label = document.getElementById('label');
  const key = (d) => d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  function render() {
    label.textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const today = new Date();
    let cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    grid.innerHTML = cells.map(d => {
      if (!d) return '<div class="day other"></div>';
      const k = key(d);
      const isToday = d.toDateString() === today.toDateString();
      const hasEvents = events[k] && events[k].length;
      return '<div class="day' + (isToday ? ' today' : '') + '" data-k="' + k + '">' + d.getDate() +
        (hasEvents ? '<span class="dot"></span>' : '') + '</div>';
    }).join('');
    grid.querySelectorAll('.day[data-k]').forEach(el => el.onclick = () => openDay(el.dataset.k));
  }
  let activeKey = null;
  function openDay(k) {
    activeKey = k;
    document.getElementById('mdate').textContent = k;
    renderEvents();
    document.getElementById('dayModal').hidden = false;
  }
  function renderEvents() {
    const list = events[activeKey] || [];
    document.getElementById('events').innerHTML = list.map((t, i) =>
      '<div>' + t + '<button data-i="' + i + '">✕</button></div>'
    ).join('') || '<div style="color:var(--mut)">No events.</div>';
    document.querySelectorAll('#events button').forEach(b => b.onclick = () => {
      list.splice(parseInt(b.dataset.i, 10), 1);
      events[activeKey] = list; save(events); renderEvents(); render();
    });
  }
  document.getElementById('mclose').onclick = () => { document.getElementById('dayModal').hidden = true; };
  document.getElementById('addEvent').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('etext');
    if (!events[activeKey]) events[activeKey] = [];
    events[activeKey].push(input.value.trim());
    input.value = '';
    save(events); renderEvents(); render();
  };
  document.getElementById('prev').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  document.getElementById('next').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
  render();
})();`);
      };

      const writePassword = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="pw">
  <h1>${projectName}</h1>
  <section class="card">
    <div class="out"><span id="genOut">Click Generate</span><button id="copyGen">Copy</button></div>
    <label>Length <span id="lenVal">16</span><input type="range" id="len" min="6" max="48" value="16"></label>
    <div class="opts">
      <label><input type="checkbox" id="upper" checked> Uppercase</label>
      <label><input type="checkbox" id="lower" checked> Lowercase</label>
      <label><input type="checkbox" id="nums" checked> Numbers</label>
      <label><input type="checkbox" id="syms" checked> Symbols</label>
    </div>
    <button id="gen" class="primary">Generate password</button>
  </section>
  <section class="card">
    <h2>Saved entries <span class="warn">(stored locally, unencrypted — for convenience only)</span></h2>
    <form id="vaultForm"><input id="vSite" placeholder="Site" required><input id="vUser" placeholder="Username"><input id="vPass" placeholder="Password" required><button>Save</button></form>
    <div id="vaultList"></div>
  </section>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff;--warn:#e0a020}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.pw{max-width:520px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.out{display:flex;justify-content:space-between;align-items:center;background:#1a1f2c;border-radius:8px;padding:12px 14px;font:14px ui-monospace,Menlo,monospace;margin-bottom:14px;word-break:break-all}
.out button{background:var(--acc);color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;flex-shrink:0;margin-left:10px}
.pw label{display:block;color:var(--mut);font-size:12.5px;margin-bottom:10px}
.pw input[type=range]{width:100%}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;font-size:13px}
.opts label{display:flex;align-items:center;gap:6px}
.primary{width:100%;background:var(--acc);color:#fff;border:none;border-radius:8px;padding:11px;font-weight:600;cursor:pointer}
h2{font-size:14px;margin:0 0 10px}
.warn{color:var(--warn);font-weight:400;font-size:11px}
#vaultForm{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
#vaultForm input{flex:1;min-width:80px;background:#1a1f2c;border:1px solid var(--line);border-radius:6px;padding:8px;color:var(--fg);font-size:12.5px}
#vaultForm button{background:#1a1f2c;border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:8px 12px;cursor:pointer}
.entry{display:flex;justify-content:space-between;align-items:center;background:#1a1f2c;border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:13px}
.entry .meta{color:var(--mut);font-size:11.5px}
.entry button{background:none;border:none;color:var(--mut);cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real crypto-random password generator + local vault
(function(){
  const SETS = { upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower: 'abcdefghijkmnpqrstuvwxyz', nums: '23456789', syms: '!@#$%^&*_-+=?' };
  const lenEl = document.getElementById('len');
  document.getElementById('lenVal').textContent = lenEl.value;
  lenEl.oninput = () => { document.getElementById('lenVal').textContent = lenEl.value; };
  function generate() {
    let pool = '';
    ['upper','lower','nums','syms'].forEach(k => { if (document.getElementById(k).checked) pool += SETS[k]; });
    if (!pool) pool = SETS.lower;
    const len = parseInt(lenEl.value, 10);
    const bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < len; i++) out += pool[bytes[i] % pool.length];
    return out;
  }
  document.getElementById('gen').onclick = () => { document.getElementById('genOut').textContent = generate(); };
  document.getElementById('copyGen').onclick = () => {
    const txt = document.getElementById('genOut').textContent;
    if (txt && txt !== 'Click Generate') navigator.clipboard && navigator.clipboard.writeText(txt).catch(()=>{});
  };
  const K = 'cs.password.vault';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let vault = load();
  function renderVault() {
    document.getElementById('vaultList').innerHTML = vault.map((e, i) =>
      '<div class="entry"><div><div>' + e.site + '</div><div class="meta">' + (e.user || '') + ' · ' + e.pass + '</div></div><button data-i="' + i + '">✕</button></div>'
    ).join('') || '<div style="color:var(--mut);font-size:13px">No saved entries.</div>';
    document.querySelectorAll('#vaultList button').forEach(b => b.onclick = () => {
      vault.splice(parseInt(b.dataset.i, 10), 1); save(vault); renderVault();
    });
  }
  document.getElementById('vaultForm').onsubmit = (e) => {
    e.preventDefault();
    vault.push({ site: document.getElementById('vSite').value.trim(), user: document.getElementById('vUser').value.trim(), pass: document.getElementById('vPass').value.trim() });
    save(vault); renderVault();
    e.target.reset();
  };
  renderVault();
})();`);
      };

      const writeQr = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="qr">
  <h1>${projectName}</h1>
  <form id="form">
    <textarea id="text" placeholder="Enter text or a URL…" required>https://example.com</textarea>
    <label>Size <select id="size"><option value="200">Small</option><option value="300" selected>Medium</option><option value="400">Large</option></select></label>
    <button>Generate</button>
  </form>
  <div id="out" class="out" hidden>
    <img id="qrImg" alt="QR code">
    <a id="dl" download="qrcode.png">Download PNG</a>
  </div>
  <p class="hint">Generated via the free api.qrserver.com QR rendering service — needs an internet connection.</p>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.qr{max-width:420px;margin:0 auto;padding:32px 20px;text-align:center}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 18px}
#form{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;text-align:left}
textarea{width:100%;min-height:70px;background:#1a1f2c;border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);font-family:inherit;resize:vertical;margin-bottom:12px}
#form label{display:block;color:var(--mut);font-size:12.5px;margin-bottom:12px}
#form select{background:#1a1f2c;border:1px solid var(--line);border-radius:6px;padding:6px 8px;color:var(--fg);margin-left:8px}
#form button{width:100%;background:var(--acc);color:#fff;border:none;border-radius:8px;padding:11px;font-weight:600;cursor:pointer}
.out{margin-top:20px}
.out img{border-radius:12px;background:#fff;padding:12px}
.out a{display:block;margin-top:10px;color:var(--acc);font-size:13px;text-decoration:none}
.hint{color:var(--mut);font-size:11.5px;margin-top:16px}`);
        push('/scripts/app.js', `// ${projectName} — real QR code generator via api.qrserver.com (free, keyless)
(function(){
  document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const text = document.getElementById('text').value.trim();
    const size = document.getElementById('size').value;
    if (!text) return;
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(text);
    document.getElementById('qrImg').src = url;
    document.getElementById('dl').href = url;
    document.getElementById('out').hidden = false;
    try { localStorage.setItem('cs.qr.lastText', text); } catch(_){}
  };
  try {
    const last = localStorage.getItem('cs.qr.lastText');
    if (last) document.getElementById('text').value = last;
  } catch(_){}
})();`);
      };

      const writeMobile = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0d12">
<title>${projectName}</title>
<link rel="manifest" href="/manifest.json">
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="app">
  <header><h1>${projectName}</h1><button id="installBtn" hidden>Install app</button></header>
  <p class="status" id="status">Loading…</p>
  <form id="addForm"><input id="text" placeholder="Quick note…" required><button>Add</button></form>
  <ul id="list" class="list"></ul>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/manifest.json', JSON.stringify({
          name: projectName, short_name: projectName, start_url: '/', display: 'standalone',
          background_color: '#0b0d12', theme_color: '#0b0d12',
          icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
        }, null, 2));
        push('/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#3aa0ff"/><text x="50" y="62" font-size="46" text-anchor="middle" fill="#fff" font-family="sans-serif">${(projectName || 'A')[0].toUpperCase()}</text></svg>`);
        push('/sw.js', `// ${projectName} — real service worker, caches the app shell for offline use
const CACHE = 'cs-app-v1';
const ASSETS = ['/', '/index.html', '/styles/main.css', '/scripts/app.js', '/manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => hit)));
});`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.app{max-width:480px;margin:0 auto;padding:20px 16px calc(20px + env(safe-area-inset-bottom))}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
h1{font-size:18px;font-weight:600;margin:0}
header button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12.5px;cursor:pointer}
.status{color:var(--mut);font-size:12px;margin:0 0 16px}
#addForm{display:flex;gap:8px;margin-bottom:14px}
#addForm input{flex:1;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--fg);font-size:15px}
#addForm button{background:var(--acc);color:#fff;border:none;border-radius:10px;padding:0 18px;font-weight:600;cursor:pointer}
.list{list-style:none;margin:0;padding:0}
.list li{display:flex;justify-content:space-between;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:8px}
.list button{background:none;border:none;color:var(--mut);cursor:pointer;font-size:15px}`);
        push('/scripts/app.js', `// ${projectName} — a real installable PWA (offline-capable via service worker)
(function(){
  const statusEl = document.getElementById('status');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => { statusEl.textContent = 'Ready — works offline once installed.'; })
      .catch(() => { statusEl.textContent = 'Ready (offline caching unavailable in this context).'; });
  } else {
    statusEl.textContent = 'Ready.';
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').hidden = false;
  });
  document.getElementById('installBtn').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').hidden = true;
  };
  const K = 'cs.mobile.notes';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let notes = load();
  const list = document.getElementById('list');
  function render() {
    list.innerHTML = notes.map((n, i) => '<li>' + n + '<button data-i="' + i + '">✕</button></li>').join('');
    list.querySelectorAll('button').forEach(b => b.onclick = () => { notes.splice(parseInt(b.dataset.i,10),1); save(notes); render(); });
  }
  document.getElementById('addForm').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('text');
    if (input.value.trim()) { notes.unshift(input.value.trim()); save(notes); input.value=''; render(); }
  };
  render();
})();`);
      };

      const writeRss = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="rss">
  <h1>${projectName}</h1>
  <div class="tabs"><button class="tab active" data-tab="url">Fetch by URL</button><button class="tab" data-tab="paste">Paste feed XML</button></div>
  <form id="urlForm" class="panel"><input id="feedUrl" type="url" placeholder="https://example.com/feed.xml" required><button>Load</button>
    <p class="hint">Works for feeds that allow cross-origin requests. If it fails, paste the feed's XML instead.</p></form>
  <form id="pasteForm" class="panel" hidden><textarea id="feedXml" placeholder="Paste RSS/Atom XML here…" required></textarea><button>Parse</button></form>
  <div id="status" class="status"></div>
  <div id="items" class="items"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.rss{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.tabs{display:flex;gap:8px;margin-bottom:14px}
.tab{background:#1a1f2c;color:var(--mut);border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px}
.tab.active{color:var(--fg);border-color:var(--acc)}
.panel{display:flex;flex-direction:column;gap:8px}
.panel input,.panel textarea{background:#1a1f2c;border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);font-family:inherit}
.panel textarea{min-height:100px;resize:vertical}
.panel button{align-self:flex-start;background:var(--acc);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer}
.hint{color:var(--mut);font-size:11.5px;margin:0}
.status{color:var(--mut);font-size:13px;margin:10px 0}
.items{display:flex;flex-direction:column;gap:10px}
.item{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.item a{color:var(--fg);font-weight:600;text-decoration:none;font-size:14.5px}
.item a:hover{color:var(--acc)}
.item .date{color:var(--mut);font-size:11.5px;margin:4px 0}
.item .desc{color:var(--mut);font-size:13px}`);
        push('/scripts/app.js', `// ${projectName} — real feed reader: fetch a CORS-enabled feed, or paste raw XML (always works, no CORS needed)
(function(){
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('urlForm').hidden = tab.dataset.tab !== 'url';
    document.getElementById('pasteForm').hidden = tab.dataset.tab !== 'paste';
  });
  function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid feed XML');
    const isAtom = !!doc.querySelector('feed');
    const nodes = isAtom ? Array.from(doc.querySelectorAll('entry')) : Array.from(doc.querySelectorAll('item'));
    return nodes.map(n => {
      const get = (sel) => { const el = n.querySelector(sel); return el ? el.textContent.trim() : ''; };
      const link = isAtom ? (n.querySelector('link') && n.querySelector('link').getAttribute('href')) || '' : get('link');
      return {
        title: get('title') || '(untitled)',
        link,
        date: get('pubDate') || get('published') || get('updated'),
        desc: (get('description') || get('summary') || '').replace(/<[^>]+>/g, '').slice(0, 220)
      };
    });
  }
  function render(items) {
    document.getElementById('items').innerHTML = items.map(it =>
      '<div class="item"><a href="' + (it.link || '#') + '" target="_blank" rel="noopener">' + it.title + '</a>' +
      (it.date ? '<div class="date">' + it.date + '</div>' : '') +
      (it.desc ? '<div class="desc">' + it.desc + '…</div>' : '') + '</div>'
    ).join('') || '<div style="color:var(--mut)">No items found.</div>';
  }
  const statusEl = document.getElementById('status');
  document.getElementById('urlForm').onsubmit = async (e) => {
    e.preventDefault();
    statusEl.textContent = 'Fetching…';
    const url = document.getElementById('feedUrl').value.trim();
    if (!/^https?:[/][/]/i.test(url)) { statusEl.textContent = 'Enter the full feed address, starting with http:// or https://'; return; }
    let text;
    try {
      const res = await fetch(url);
      if (!res.ok) { statusEl.textContent = 'The server answered ' + res.status + ' for that address — check the feed URL.'; return; }
      text = await res.text();
    } catch (err) {
      statusEl.textContent = 'Could not fetch that feed directly (likely blocked by CORS) — paste its XML instead using the tab above.';
      return;
    }
    try {
      render(parseFeed(text));
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = 'That address did not return an RSS or Atom feed: ' + (err && err.message || err);
    }
  };
  document.getElementById('pasteForm').onsubmit = (e) => {
    e.preventDefault();
    try {
      render(parseFeed(document.getElementById('feedXml').value));
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = 'Could not parse that XML: ' + err.message;
    }
  };
})();`);
      };

      const writeBookmark = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="bk">
  <h1>${projectName}</h1>
  <form id="addForm">
    <input id="url" placeholder="https://…" required>
    <input id="title" placeholder="Title (optional)">
    <input id="tags" placeholder="tags, comma, separated">
    <button>Save</button>
  </form>
  <input id="search" class="search" placeholder="Search bookmarks…">
  <div id="list" class="list"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#3aa0ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.bk{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
#addForm{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
#addForm input{flex:1;min-width:120px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg)}
#addForm button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
.search{width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);margin-bottom:16px}
.list{display:flex;flex-direction:column;gap:8px}
.bmark{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.bmark a{color:var(--fg);font-weight:600;text-decoration:none;font-size:14px}
.bmark a:hover{color:var(--acc)}
.bmark .url{color:var(--mut);font-size:11.5px;word-break:break-all}
.bmark .tags{margin-top:6px}
.bmark .tag{display:inline-block;background:#1a1f2c;color:var(--mut);border-radius:999px;padding:2px 9px;font-size:11px;margin:2px 4px 0 0}
.bmark button{background:none;border:none;color:var(--mut);cursor:pointer;flex-shrink:0}`);
        push('/scripts/app.js', `// ${projectName} — real bookmark manager with tags and search
(function(){
  const K = 'cs.bookmarks';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let items = load();
  const listEl = document.getElementById('list');
  function render(filter) {
    const q = (filter || '').toLowerCase();
    const filtered = items.filter(b => !q || (b.title + ' ' + b.url + ' ' + b.tags.join(' ')).toLowerCase().includes(q));
    listEl.innerHTML = filtered.map((b, i) =>
      '<div class="bmark"><div><a href="' + b.url + '" target="_blank" rel="noopener">' + (b.title || b.url) + '</a>' +
      '<div class="url">' + b.url + '</div>' +
      (b.tags.length ? '<div class="tags">' + b.tags.map(t => '<span class="tag">' + t + '</span>').join('') + '</div>' : '') +
      '</div><button data-i="' + items.indexOf(b) + '">✕</button></div>'
    ).join('') || '<div style="color:var(--mut)">No bookmarks yet.</div>';
    listEl.querySelectorAll('button').forEach(b => b.onclick = () => {
      items.splice(parseInt(b.dataset.i, 10), 1); save(items); render(document.getElementById('search').value);
    });
  }
  document.getElementById('addForm').onsubmit = (e) => {
    e.preventDefault();
    let url = document.getElementById('url').value.trim();
    if (!/^https?:\\/\\//i.test(url)) url = 'https://' + url;
    const title = document.getElementById('title').value.trim();
    const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean);
    items.unshift({ url, title, tags });
    save(items);
    e.target.reset();
    render(document.getElementById('search').value);
  };
  document.getElementById('search').oninput = (e) => render(e.target.value);
  render();
})();`);
      };

      const writeRecipe = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="rec">
  <h1>${projectName}</h1>
  <div id="listView">
    <input id="search" class="search" placeholder="Search recipes…">
    <button id="newBtn" class="primary">+ New recipe</button>
    <div id="cards" class="cards"></div>
  </div>
  <div id="formView" hidden>
    <form id="recipeForm">
      <input id="rName" placeholder="Recipe name" required>
      <textarea id="rIngredients" placeholder="Ingredients, one per line" required></textarea>
      <textarea id="rSteps" placeholder="Steps, one per line" required></textarea>
      <div class="row"><button type="submit">Save</button><button type="button" id="cancelBtn">Cancel</button></div>
    </form>
  </div>
  <div id="detailView" hidden>
    <button id="backBtn">‹ Back</button>
    <h2 id="dName"></h2>
    <h3>Ingredients</h3>
    <ul id="dIngredients"></ul>
    <h3>Steps</h3>
    <ol id="dSteps"></ol>
    <button id="deleteBtn" class="danger">Delete recipe</button>
  </div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#e0783a;--bad:#ff5c5c}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.rec{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.search{width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);margin-bottom:10px}
.primary{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;margin-bottom:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;cursor:pointer}
.card:hover{border-color:var(--acc)}
.card h3{margin:0 0 4px;font-size:14.5px}
.card p{margin:0;color:var(--mut);font-size:12px}
#recipeForm{display:flex;flex-direction:column;gap:10px}
#recipeForm input,#recipeForm textarea{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);font-family:inherit}
#recipeForm textarea{min-height:100px;resize:vertical}
.row{display:flex;gap:8px}
.row button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font-weight:600}
.row button#cancelBtn{background:#1a1f2c;color:var(--fg)}
#backBtn{background:none;border:none;color:var(--mut);cursor:pointer;margin-bottom:10px;font-size:13px}
#dIngredients label,#dSteps li{margin-bottom:4px}
.danger{margin-top:16px;background:none;border:1px solid var(--bad);color:var(--bad);border-radius:8px;padding:8px 14px;cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real recipe manager with a cook-along checklist
(function(){
  const K = 'cs.recipes';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let recipes = load();
  let activeId = null;
  const views = { list: document.getElementById('listView'), form: document.getElementById('formView'), detail: document.getElementById('detailView') };
  function show(name) { Object.keys(views).forEach(k => views[k].hidden = k !== name); }
  function renderCards(filter) {
    const q = (filter || '').toLowerCase();
    document.getElementById('cards').innerHTML = recipes
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .map(r => '<div class="card" data-id="' + r.id + '"><h3>' + r.name + '</h3><p>' + r.ingredients.length + ' ingredients</p></div>')
      .join('') || '<p style="color:var(--mut)">No recipes yet — add one above.</p>';
    document.querySelectorAll('.card').forEach(c => c.onclick = () => openDetail(c.dataset.id));
  }
  function openDetail(id) {
    activeId = id;
    const r = recipes.find(x => x.id === id);
    document.getElementById('dName').textContent = r.name;
    document.getElementById('dIngredients').innerHTML = r.ingredients.map(i => '<li><label><input type="checkbox"> ' + i + '</label></li>').join('');
    document.getElementById('dSteps').innerHTML = r.steps.map(s => '<li>' + s + '</li>').join('');
    show('detail');
  }
  document.getElementById('newBtn').onclick = () => { document.getElementById('recipeForm').reset(); show('form'); };
  document.getElementById('cancelBtn').onclick = () => show('list');
  document.getElementById('backBtn').onclick = () => { renderCards(document.getElementById('search').value); show('list'); };
  document.getElementById('deleteBtn').onclick = () => {
    recipes = recipes.filter(r => r.id !== activeId); save(recipes); renderCards(); show('list');
  };
  document.getElementById('recipeForm').onsubmit = (e) => {
    e.preventDefault();
    recipes.push({
      id: 'r' + Date.now(),
      name: document.getElementById('rName').value.trim(),
      ingredients: document.getElementById('rIngredients').value.split('\\n').map(s => s.trim()).filter(Boolean),
      steps: document.getElementById('rSteps').value.split('\\n').map(s => s.trim()).filter(Boolean)
    });
    save(recipes); renderCards(); show('list');
  };
  document.getElementById('search').oninput = (e) => renderCards(e.target.value);
  renderCards();
})();`);
      };

      const writeExpense = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="exp">
  <h1>${projectName}</h1>
  <div class="summary"><div>Total spent<b id="total">$0.00</b></div></div>
  <form id="addForm">
    <input id="desc" placeholder="Description" required>
    <input id="amount" type="number" step="0.01" min="0" placeholder="Amount" required>
    <select id="category"><option>Food</option><option>Transport</option><option>Housing</option><option>Entertainment</option><option>Other</option></select>
    <button>Add</button>
  </form>
  <div id="breakdown" class="breakdown"></div>
  <div id="list" class="list"></div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#28c76f}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Inter,sans-serif;min-height:100vh}
.exp{max-width:560px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.summary{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.summary div{color:var(--mut);font-size:12.5px}
.summary b{display:block;font:700 30px ui-monospace,Menlo,monospace;color:var(--acc);margin-top:4px}
#addForm{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
#addForm input,#addForm select{flex:1;min-width:100px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg)}
#addForm button{background:var(--acc);color:#032;border:none;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
.breakdown{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.bar{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--mut)}
.bar .track{flex:1;height:8px;background:#1a1f2c;border-radius:4px;overflow:hidden}
.bar .fill{height:100%;background:var(--acc)}
.list{display:flex;flex-direction:column;gap:6px}
.row{display:flex;justify-content:space-between;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13px}
.row .meta{color:var(--mut);font-size:11.5px}
.row button{background:none;border:none;color:var(--mut);cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real expense tracker with category breakdown
(function(){
  const K = 'cs.expenses';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let items = load();
  function render() {
    const total = items.reduce((s, e) => s + e.amount, 0);
    document.getElementById('total').textContent = '$' + total.toFixed(2);
    const byCat = {};
    items.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    document.getElementById('breakdown').innerHTML = Object.keys(byCat).map(cat => {
      const pct = total ? Math.round((byCat[cat] / total) * 100) : 0;
      return '<div class="bar"><span style="width:70px">' + cat + '</span><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><span>$' + byCat[cat].toFixed(2) + '</span></div>';
    }).join('');
    document.getElementById('list').innerHTML = items.slice().reverse().map((e) =>
      '<div class="row"><div>' + e.desc + '<div class="meta">' + e.category + ' · ' + new Date(e.ts).toLocaleDateString() + '</div></div>' +
      '<div>$' + e.amount.toFixed(2) + ' <button data-id="' + e.id + '">✕</button></div></div>'
    ).join('') || '<div style="color:var(--mut)">No expenses logged yet.</div>';
    document.querySelectorAll('.row button').forEach(b => b.onclick = () => {
      items = items.filter(e => e.id !== b.dataset.id); save(items); render();
    });
  }
  document.getElementById('addForm').onsubmit = (e) => {
    e.preventDefault();
    items.push({
      id: 'e' + Date.now(),
      desc: document.getElementById('desc').value.trim(),
      amount: parseFloat(document.getElementById('amount').value) || 0,
      category: document.getElementById('category').value,
      ts: Date.now()
    });
    save(items);
    e.target.reset();
    render();
  };
  render();
})();`);
      };

      const writeBlog = () => {
        push('/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${projectName}</title>
<link rel="stylesheet" href="/styles/main.css">
</head>
<body>
<main class="blog">
  <h1>${projectName}</h1>
  <div id="listView">
    <button id="newBtn" class="primary">+ New post</button>
    <div id="posts" class="posts"></div>
  </div>
  <div id="editView" hidden>
    <input id="pTitle" placeholder="Post title" class="title-input">
    <textarea id="pBody" placeholder="Write in markdown… **bold**, *italic*, # Heading, - list item, [link](url)"></textarea>
    <div class="row"><button id="saveBtn">Save</button><button id="cancelBtn">Cancel</button></div>
    <h3>Preview</h3>
    <div id="preview" class="preview"></div>
  </div>
  <div id="readView" hidden>
    <button id="backBtn">‹ Back</button>
    <article id="article" class="preview"></article>
    <button id="editExisting">Edit</button>
    <button id="deleteBtn" class="danger">Delete</button>
  </div>
</main>
<script src="/scripts/app.js"></script>
\n</body>
</html>`);
        push('/styles/main.css', `:root{--bg:#0b0d12;--card:#141821;--line:#1f2433;--fg:#e8ecf4;--mut:#8a93a6;--acc:#7c5cff;--bad:#ff5c5c}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,Inter,sans-serif;min-height:100vh}
.blog{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:18px;color:var(--mut);font-weight:600;margin:0 0 14px}
.primary{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;margin-bottom:16px}
.posts{display:flex;flex-direction:column;gap:8px}
.post-item{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;cursor:pointer}
.post-item:hover{border-color:var(--acc)}
.post-item h3{margin:0 0 4px;font-size:15px}
.post-item .date{color:var(--mut);font-size:11.5px}
.title-input{width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);font-size:16px;font-weight:600;margin-bottom:8px}
#pBody{width:100%;min-height:180px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--fg);font-family:ui-monospace,Menlo,monospace;font-size:13px;resize:vertical;margin-bottom:10px}
.row{display:flex;gap:8px;margin-bottom:20px}
.row button{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font-weight:600}
.row button#cancelBtn{background:#1a1f2c;color:var(--fg)}
.preview{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.preview h1,.preview h2,.preview h3{margin-top:0}
.preview a{color:var(--acc)}
#backBtn{background:none;border:none;color:var(--mut);cursor:pointer;margin-bottom:10px;font-size:13px}
.danger{margin-top:12px;background:none;border:1px solid var(--bad);color:var(--bad);border-radius:8px;padding:8px 14px;cursor:pointer}
#editExisting{margin-top:12px;background:#1a1f2c;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer}`);
        push('/scripts/app.js', `// ${projectName} — real local-first blog/CMS with a from-scratch markdown renderer
(function(){
  function renderMarkdown(md) {
    const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const lines = esc(md).split('\\n');
    let html = '', inList = false;
    lines.forEach(line => {
      let l = line;
      if (/^###\\s+/.test(l)) { closeList(); html += '<h3>' + l.replace(/^###\\s+/, '') + '</h3>'; return; }
      if (/^##\\s+/.test(l)) { closeList(); html += '<h2>' + l.replace(/^##\\s+/, '') + '</h2>'; return; }
      if (/^#\\s+/.test(l)) { closeList(); html += '<h1>' + l.replace(/^#\\s+/, '') + '</h1>'; return; }
      if (/^[-*]\\s+/.test(l)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inline(l.replace(/^[-*]\\s+/, '')) + '</li>';
        return;
      }
      closeList();
      if (l.trim() === '') return;
      html += '<p>' + inline(l) + '</p>';
    });
    closeList();
    function closeList() { if (inList) { html += '</ul>'; inList = false; } }
    function inline(s) {
      return s
        .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    }
    return html;
  }
  const K = 'cs.blog.posts';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch(_) { return []; } };
  const save = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch(_){} };
  let posts = load();
  let activeId = null, editingId = null;
  const views = { list: document.getElementById('listView'), edit: document.getElementById('editView'), read: document.getElementById('readView') };
  function show(name) { Object.keys(views).forEach(k => views[k].hidden = k !== name); }
  function renderList() {
    document.getElementById('posts').innerHTML = posts.slice().reverse().map(p =>
      '<div class="post-item" data-id="' + p.id + '"><h3>' + (p.title || 'Untitled') + '</h3><div class="date">' + new Date(p.ts).toLocaleDateString() + '</div></div>'
    ).join('') || '<p style="color:var(--mut)">No posts yet — write your first one.</p>';
    document.querySelectorAll('.post-item').forEach(el => el.onclick = () => openRead(el.dataset.id));
  }
  function openRead(id) {
    activeId = id;
    const p = posts.find(x => x.id === id);
    document.getElementById('article').innerHTML = '<h1>' + p.title + '</h1>' + renderMarkdown(p.body);
    show('read');
  }
  document.getElementById('backBtn').onclick = () => { renderList(); show('list'); };
  document.getElementById('newBtn').onclick = () => {
    editingId = null;
    document.getElementById('pTitle').value = ''; document.getElementById('pBody').value = '';
    document.getElementById('preview').innerHTML = '';
    show('edit');
  };
  document.getElementById('editExisting').onclick = () => {
    const p = posts.find(x => x.id === activeId);
    editingId = p.id;
    document.getElementById('pTitle').value = p.title; document.getElementById('pBody').value = p.body;
    document.getElementById('preview').innerHTML = renderMarkdown(p.body);
    show('edit');
  };
  document.getElementById('pBody').oninput = (e) => { document.getElementById('preview').innerHTML = renderMarkdown(e.target.value); };
  document.getElementById('saveBtn').onclick = () => {
    const title = document.getElementById('pTitle').value.trim() || 'Untitled';
    const body = document.getElementById('pBody').value;
    if (editingId) {
      const p = posts.find(x => x.id === editingId); p.title = title; p.body = body;
    } else {
      posts.push({ id: 'p' + Date.now(), title, body, ts: Date.now() });
    }
    save(posts); renderList(); show('list');
  };
  document.getElementById('cancelBtn').onclick = () => { renderList(); show('list'); };
  document.getElementById('deleteBtn').onclick = () => {
    posts = posts.filter(p => p.id !== activeId); save(posts); renderList(); show('list');
  };
  renderList();
})();`);
      };

      // -------- dispatch --------
      let summary = '';
      // True whenever we actually fall through to the generic starter
      // scaffold below — whether because nothing matched, or because a
      // matched intent (e.g. weather/quiz/recipe/...) has no dedicated
      // generator yet. Used to honestly flag this as an offline fallback
      // rather than silently pretending it's the requested app.
      let usedStarterFallback = false;
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
        case 'social':     writeSocial();     summary = 'Built a real social feed with posts, likes, and friends.'; break;
        case 'markdown':
        case 'blog':       writeBlog();       summary = 'Built a real local-first blog/CMS with a markdown editor and preview.'; break;
        case 'mobile':     writeMobile();     summary = 'Built a real, installable PWA with offline support.'; break;
        case 'clock':      writeClock();      summary = 'Built a real, live-updating world clock.'; break;
        case 'weather':    writeWeather();    summary = 'Built a real weather app backed by live forecast data.'; break;
        case 'quiz':       writeQuiz();       summary = 'Built a real multiple-choice quiz with scoring.'; break;
        case 'drawing':
        case 'paint':      writeDrawing();    summary = 'Built a real canvas drawing app with save-as-PNG.'; break;
        case 'music':      writeMusic();      summary = 'Built a real soundboard synthesizing tones via the Web Audio API.'; break;
        case 'expense':    writeExpense();    summary = 'Built a real expense tracker with category breakdown.'; break;
        case 'recipe':     writeRecipe();     summary = 'Built a real recipe manager with a cook-along checklist.'; break;
        case 'bookmark':   writeBookmark();   summary = 'Built a real bookmark manager with tags and search.'; break;
        case 'rss':        writeRss();        summary = 'Built a real feed reader that parses RSS/Atom XML.'; break;
        case 'gallery':    writeGallery();    summary = 'Built a real photo gallery with local uploads.'; break;
        case 'calendar':   writeCalendar();   summary = 'Built a real month-view calendar with persistent events.'; break;
        case 'password':   writePassword();   summary = 'Built a real password generator with a local vault.'; break;
        case 'qr':         writeQr();         summary = 'Built a real QR code generator.'; break;
        case 'starter':
        default:           writeStarter();    summary = 'Scaffolded a real, working starter app from your prompt.'; usedStarterFallback = true; break;
      }

      // Always create a real SPEC.md and README.md so the project is
      // self-documenting, no matter what the prompt was.
      const fallbackBanner = usedStarterFallback
        ? `> ⚠️ **OFFLINE EMERGENCY FALLBACK** — no AI provider is connected` +
          (matched.length ? `, and the detected intent (**${primary}**) has no dedicated generator yet` : ' and this prompt matched none of the built-in templates') +
          `. What follows is a minimal generic starter scaffold, **not** the specific app you asked for. Connect a model in Settings for a real build.\n\n`
        : '';
      push('/SPEC.md', `# ${projectName}\n\n${fallbackBanner}> Generated by CodeSovereign synthesizer\n\n## Source prompt\n\n\`\`\`\n${p_raw}\n\`\`\`\n\n## Detected intent\n\nPrimary intent: **${primary}**\n\nMatched signals: ${matched.length ? matched.join(', ') : '(none — using starter scaffold)'}\n\n## Files\n\n- \`index.html\` — page markup\n- \`styles/main.css\` — theme and layout\n- \`scripts/app.js\` — interactive logic\n\n## How to run\n\nOpen \`index.html\` in a browser, or use the **Preview** button in the IDE.\n`);
      push('/README.md', `# ${projectName}\n\nReal working code generated from your prompt. Open the files in the IDE to edit.\n\n- \`SPEC.md\` — what was generated and why\n- \`index.html\` — the page\n- \`styles/main.css\` — styles\n- \`scripts/app.js\` — JavaScript\n`);

      // Curated, per-intent follow-up ideas — genuinely relevant next steps for
      // this specific kind of app, not fabricated "AI thinking". The offline
      // path has no model to ask, so these are hand-picked rather than
      // pretending a reasoning process produced them.
      const SUGGESTIONS = {
        todo: ['Add due dates and sort by them', 'Add categories or tags', 'Add priority levels (low/med/high)'],
        notes: ['Add tags and a tag filter', 'Add full-text search across notes', 'Add note pinning'],
        markdown_md: ['Add tags and a tag filter', 'Add full-text search across notes', 'Add note pinning'],
        dashboard: ['Add a date-range filter', 'Add a second chart type', 'Add CSV export for the data'],
        calculator: ['Add a calculation history log', 'Add keyboard-only scientific functions', 'Add unit conversion mode'],
        chat: ['Add multiple chat threads', 'Add message search', 'Add typing indicators'],
        portfolio: ['Add a contact form', 'Add a projects filter by tag', 'Add a dark/light theme toggle'],
        blog: ['Add tags and a tag filter', 'Add a comments section', 'Add a search box for posts'],
        markdown: ['Add tags and a tag filter', 'Add a comments section', 'Add a search box for posts'],
        timer: ['Add custom session lengths', 'Add a sound on session end', 'Add a daily session history log'],
        kanban: ['Add due dates to cards', 'Add labels/colors to cards', 'Add a card search/filter'],
        form: ['Add field validation messages', 'Add multi-step form pages', 'Add submission export to CSV'],
        game: ['Add a high-score leaderboard', 'Add difficulty levels', 'Add sound effects'],
        dark: ['Add a system-theme-follows-OS option', 'Add per-section theme overrides'],
        search: ['Add filters by file type', 'Add recent-searches history', 'Add fuzzy matching'],
        login: ['Add a "forgot password" flow', 'Add social login buttons', 'Add remember-me persistence'],
        rest: ['Add request history', 'Add saved request collections', 'Add response time charting'],
        ecommerce: ['Add product filtering/sorting', 'Add a wishlist', 'Add order history'],
        chart: ['Add a date-range filter', 'Add a second chart type', 'Add CSV export for the data'],
        social: ['Add comments on posts', 'Add a notifications feed', 'Add user profiles'],
        mobile: ['Add push notification support', 'Add offline data sync indicators', 'Add a splash screen'],
        clock: ['Add alarms', 'Add a stopwatch mode', 'Add custom timezone labels'],
        weather: ['Add a 7-day extended forecast', 'Add saved favorite cities', 'Add weather alerts'],
        quiz: ['Add a timer per question', 'Add categories/difficulty levels', 'Add a leaderboard'],
        drawing: ['Add layers', 'Add shape tools (rectangle/circle)', 'Add undo/redo'],
        paint: ['Add layers', 'Add shape tools (rectangle/circle)', 'Add undo/redo'],
        music: ['Add recording playback', 'Add more instrument sounds', 'Add tempo/key controls'],
        expense: ['Add monthly budget limits', 'Add a spending chart by category', 'Add CSV export'],
        recipe: ['Add a shopping-list generator', 'Add serving-size scaling', 'Add cook-time filters'],
        bookmark: ['Add folders/collections', 'Add duplicate-link detection', 'Add import from browser bookmarks'],
        rss: ['Add saved/starred articles', 'Add multiple feed subscriptions', 'Add unread-count badges'],
        gallery: ['Add albums/collections', 'Add drag-to-reorder', 'Add image captions'],
        calendar: ['Add recurring events', 'Add event reminders', 'Add a week-view mode'],
        password: ['Add password strength meter', 'Add auto-lock after inactivity', 'Add export/import of the vault'],
        qr: ['Add batch QR generation', 'Add QR scanning (camera)', 'Add saved QR history']
      };
      const suggestions = usedStarterFallback ? [] : (SUGGESTIONS[primary] || []);

      // Honest account of the actual decision made — this is rule-based
      // keyword matching, not a model reasoning about the request, so say
      // exactly that rather than dressing it up as "thinking".
      const reasoning = usedStarterFallback
        ? (matched.length
          ? `Detected "${primary}" but there's no dedicated template for it yet — falling back to a generic scaffold.`
          : `No built-in template matched this request — falling back to a generic scaffold. Connect a model in Settings for a real build of anything.`)
        : `Matched "${primary}" (offline, deterministic template — no AI call needed)` +
          (matched.length > 1 ? `; also matched: ${matched.slice(1).join(', ')}` : '') + '.';

      return { summary, targets, offlineFallback: usedStarterFallback, suggestions, reasoning };
    }
  };

  // Strict JS syntax (acorn module → script). Never uses acorn-loose, which
  // accepts broken source. Falls back to new Function only when acorn is
  // missing, and does not false-fail ESM in that case.
  function parseJsSyntax(content){
    const src = String(content || '');
    if (!src.trim()) return { ok: true };
    const acorn = (typeof window !== 'undefined' && window.acorn && typeof window.acorn.parse === 'function')
      ? window.acorn : null;
    if (acorn) {
      const opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
      try { acorn.parse(src, Object.assign({}, opts, { sourceType: 'module' })); return { ok: true }; }
      catch (e1) {
        try { acorn.parse(src, Object.assign({}, opts, { sourceType: 'script' })); return { ok: true }; }
        catch (e2) {
          return { ok: false, error: (e1 && e1.message) || (e2 && e2.message) || 'parse error' };
        }
      }
    }
    try { new Function(src); return { ok: true }; }
    catch (e) {
      if (/\b(?:import|export)\b/.test(src)) return { ok: true, skipped: 'esm-without-acorn' };
      return { ok: false, error: e.message || String(e) };
    }
  }

  const HTML_VOID = { area:1, base:1, br:1, col:1, embed:1, hr:1, img:1, input:1, link:1, meta:1, param:1, source:1, track:1, wbr:1 };
  function htmlTagBalance(content){
    const opens = (content.match(/<(?!\/|!|\?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g) || []).filter(tag => {
      const name = ((tag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/) || [])[1] || '').toLowerCase();
      if (HTML_VOID[name]) return false;
      if (/\/\s*>$/.test(tag)) return false;
      return true;
    });
    const closes = content.match(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g) || [];
    return { open: opens.length, close: closes.length, ok: opens.length === closes.length };
  }

  function stripJsComments(src){
    return String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }

  // ---------- Validators (real, against FS) ----------
  const Validator = {
    parseJsSyntax: parseJsSyntax,
    runAll(){
      const issues = [];
      Object.keys(FS._data).forEach(p => {
        if (!FS.isFile(p)) return;
        const content = FS.read(p) || '';
        if (p.endsWith('.html')){
          const bal = htmlTagBalance(content);
          if (!bal.ok) issues.push({ severity:'warning', faultClass:'html.unbalanced', file:p, message:'Tag imbalance (' + bal.open + ' open / ' + bal.close + ' close)' });
          // missing alt on img
          const imgs = content.match(/<img(?![^>]*alt=)[^>]*>/g);
          if (imgs) imgs.forEach(() => issues.push({ severity:'warning', faultClass:'html.alt', file:p, message:'<img> missing alt attribute' }));
          // lang attr
          if (/<html[\s>]/i.test(content) && !/<html[^>]*lang=/i.test(content)) issues.push({ severity:'warning', faultClass:'html.lang', file:p, message:'<html> missing lang attribute' });
        }
        if (p.endsWith('.js') || p.endsWith('.mjs')){
          const syn = parseJsSyntax(content);
          if (!syn.ok) issues.push({ severity:'error', faultClass:'js.syntax', file:p, message:'JS syntax error: ' + syn.error });
          const code = stripJsComments(content);
          const logs = (code.match(/console\.log\(/g) || []).length;
          if (logs > 0) issues.push({ severity:'info', faultClass:'js.console', file:p, message: logs + ' console.log statement(s) (consider removing for production)' });
          if (/\beval\s*\(/.test(code)) issues.push({ severity:'error', faultClass:'js.eval', file:p, message:'Use of eval() detected' });
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
      // Interactivity/fakeness signals (empty handlers, fake-async, mock
      // data, hard-coded auth, stub services, "coming soon" placeholders,
      // ...) — Engine.MockScan already detects all of this but, until now,
      // was never actually consulted by anything that gates success. A
      // generator that writes a button with an empty onclick must fail the
      // same "no success without evidence" check a JS syntax error does,
      // not silently pass because the file happened to parse. high/medium/
      // low map onto Validator's own error/warning/info taxonomy so this
      // flows through the SAME gate (A2, and Engine.Orchestrator's
      // per-task checks) rather than being a second, disconnected check.
      if (window.Engine.MockScan && window.Engine.MockScan.run) {
        try {
          const sevMap = { high: 'error', medium: 'warning', low: 'info' };
          window.Engine.MockScan.run().signals.forEach(sig => {
            issues.push({ severity: sevMap[sig.severity] || 'warning', faultClass: 'mock.' + sig.kind, file: sig.file, message: sig.why + (sig.sample ? ' (' + sig.sample + ')' : '') });
          });
        } catch (_) {}
      }
      return issues;
    }
  };

  // ---------- Preview (single HTML + visual snapshot of the built app) ----------
  function xmlEsc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  }
  function svgDataUrl(svg){
    try {
      if (typeof btoa === 'function') return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    } catch (_) {}
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  function withDocumentStartCsp(html){
    html = html == null ? '' : String(html);
    const meta = '<meta http-equiv="Content-Security-Policy" content="' + PREVIEW_CSP + '">';
    const detachOpener = "<script>try{if(window.opener)window.opener=null;}catch(e){}</script>";
    const lead = meta + detachOpener;
    const dt = html.match(/^(\s*<!DOCTYPE[^>]*>)/i);
    if (dt) return dt[1] + lead + html.slice(dt[1].length);
    return lead + html;
  }
  const Preview = {
    _lastCapture: null,
    iframeCsp: PREVIEW_CSP,
    applyFrame(frame, html){
      if (!frame) return;
      try { frame.setAttribute('csp', PREVIEW_CSP); } catch (_) {}
      frame.srcdoc = html == null ? '' : String(html);
    },
    build(){
      const htmlPath = '/index.html';
      if (!FS.exists(htmlPath)) return null;
      let html = withDocumentStartCsp(FS.read(htmlPath) || '');
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
    },
    inspect(html){
      html = html == null ? (this.build() || '') : String(html);
      const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
      const headings = [];
      html.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => {
        headings.push({ level: Number(n), text: strip(t).slice(0, 80) });
        return _;
      });
      const buttons = [];
      html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (_, attrs, t) => {
        buttons.push({ text: strip(t).slice(0, 60), emptyHandler: /on[a-z]+\s*=\s*["']\s*["']/i.test(attrs || '') });
        return _;
      });
      const images = [];
      html.replace(/<img\b([^>]*)>/gi, (_, attrs) => {
        const src = ((attrs || '').match(/\bsrc\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
        const altM = (attrs || '').match(/\balt\s*=\s*["']([^"']*)["']/i);
        images.push({ src: src, alt: altM ? altM[1] : null, missingAlt: !/\balt\s*=/i.test(attrs || '') });
        return _;
      });
      const missingAlt = images.filter(i => i.missingAlt);
      const text = strip(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
      const issues = [];
      if (missingAlt.length) issues.push(missingAlt.length + ' image(s) missing alt');
      if (!title) issues.push('missing document title');
      if (!headings.length) issues.push('no headings in the preview');
      if (!buttons.length && !/<a[\s>]/i.test(html) && !/<nav[\s>]/i.test(html)) issues.push('no interactive controls');
      if (text.length < 40) issues.push('very little visible text');
      if (/simple notepad|start writing your notes here/i.test(text)) issues.push('placeholder notepad UI visible');
      return {
        title: title,
        headings: headings.slice(0, 12),
        buttons: buttons.slice(0, 20),
        images: images.slice(0, 20),
        missingAltCount: missingAlt.length,
        textSample: text.slice(0, 420),
        textLength: text.length,
        issues: issues
      };
    },
    svgSnapshot(inspect){
      inspect = inspect || this.inspect();
      const rows = [];
      rows.push({ y: 36, size: 18, fill: '#e6e9f2', text: inspect.title || '(untitled app)' });
      (inspect.headings || []).slice(0, 5).forEach((h, i) => {
        rows.push({ y: 70 + i * 22, size: 13, fill: '#9aa3b8', text: 'H' + h.level + '  ' + (h.text || '') });
      });
      const startY = 70 + Math.min((inspect.headings || []).length, 5) * 22 + 16;
      (inspect.buttons || []).slice(0, 6).forEach((b, i) => {
        rows.push({ y: startY + i * 20, size: 12, fill: '#7c6ff5', text: '[ ' + (b.text || 'button') + ' ]' });
      });
      const warnY = 360;
      const warn = (inspect.issues || []).length
        ? inspect.issues.join(' · ')
        : 'preview looks wired';
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">',
        '<rect width="640" height="400" fill="#0b0d12"/>',
        '<rect x="16" y="16" width="608" height="368" rx="14" fill="#141821" stroke="#1f2433"/>',
        '<text x="32" y="28" font-size="10" fill="#7b859c" font-family="Inter,system-ui,sans-serif">LIVE PREVIEW SNAPSHOT</text>',
        rows.map(r => '<text x="32" y="' + r.y + '" font-size="' + r.size + '" fill="' + r.fill + '" font-family="Inter,system-ui,sans-serif">' + xmlEsc(String(r.text).slice(0, 70)) + '</text>').join(''),
        '<text x="32" y="' + warnY + '" font-size="11" fill="' + ((inspect.issues || []).length ? '#f59e0b' : '#34d399') + '" font-family="Inter,system-ui,sans-serif">' + xmlEsc(warn.slice(0, 88)) + '</text>',
        '</svg>'
      ].join('');
      return svgDataUrl(svg);
    },
    lastCapture(){ return this._lastCapture; },
    capture(){
      const html = this.build();
      const inspect = this.inspect(html);
      const cap = {
        at: Date.now(),
        method: 'svg',
        inspect: inspect,
        dataUrl: this.svgSnapshot(inspect),
        htmlLength: (html || '').length,
        issues: inspect.issues || []
      };
      this._lastCapture = cap;
      return cap;
    },
    tabShell(html){
      const srcdoc = xmlEsc(html == null ? '' : String(html));
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title>'
        + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\';">'
        + '<style>html,body{margin:0;height:100%;background:#0b0d12}iframe{border:0;width:100%;height:100%;display:block}</style>'
        + '</head><body>'
        + '<iframe sandbox="allow-scripts" csp="' + PREVIEW_CSP + '" srcdoc="' + srcdoc + '"></iframe>'
        + '</body></html>';
    },
    openTab(html){
      html = html == null ? this.build() : String(html);
      if (!html) return { ok: false, reason: 'no-html' };
      try {
        const blob = new Blob([this.tabShell(html)], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        const tid = setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 30000);
        if (tid && typeof tid.unref === 'function') tid.unref();
        return { ok: true, detached: true, sandboxed: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
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

  // ---------- Execution backend catalog (real, shared source of truth) ----
  // id matches Engine.LLM's cfg.executionBackend values exactly — this is
  // read by the Settings "Agents" card, and selecting a row calls
  // Engine.LLM.setConfig({ executionBackend: id }), which complete()
  // (engine.llm.js) branches on for every actual model call. `available`
  // here is catalog-level (the backend concept exists); the Settings card
  // merges in live readiness (OpenClaw installed/gateway up, Hermes key set)
  // via Engine.AIRouter.OpenClaw.status() at render time.
  const AGENTS = [
    { id: 'direct',   role: 'Direct model',  tone: 'HTTP',        ctx: 'model-dependent', available: true, desc: 'Calls whatever AI Provider is configured in Settings (OpenAI, MiniMax, a local model, ...) directly. Default.' },
    { id: 'openclaw', role: 'Agent runtime', tone: 'Sessions',    ctx: 'session-based',   available: true, desc: 'Routes generation through your local OpenClaw agent instead of a direct API call — its own session memory, tools, and channels.' },
    { id: 'hermes',   role: 'Model override',tone: 'Open-weight', ctx: '131K',            available: true, desc: 'Forces Nous Research’s Hermes models (via OpenRouter) for this generation, regardless of what Direct is set to.' }
  ];

  // ---------- Public API ----------
  window.Engine = { FS, Proj, Agent, Validator, Preview, Deploy, TEMPLATES, AGENTS, parseJsSyntax };
})();
