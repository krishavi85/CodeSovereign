/* =====================================================================
   engine.pybackend.js  —  Engine.PyBackend   (blueprint §14 — non-Node backend)

   A real Python backend for the same entity model. Pure standard library
   (`http.server` + `sqlite3` + `hashlib` + `unittest`) so it runs and is
   verified anywhere Python 3.10+ is present — no pip install, no network.
   The handler shape is FastAPI-compatible: swap to FastAPI by adding a
   `requirements.txt` and moving the route table into `@app.get/@app.post`.

   `runEvidence()` runs the generated `package.json` scripts, which shell out:
     test    -> python -m unittest discover -s tests
     build   -> python -m compileall app
     lint    -> python -m py_compile <every app/*.py>
     migrate -> python -m app.db

   window.Engine.PyBackend
     generate(spec)  -> { 'app/…': content, 'tests/…': content, 'package.json': … }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var PY_COL = { id: 'INTEGER PRIMARY KEY AUTOINCREMENT', text: 'TEXT', longtext: 'TEXT', int: 'INTEGER', float: 'REAL', bool: 'INTEGER', timestamp: 'TEXT', ref: 'INTEGER' };

  function resources(s) { return (s.entities || []).filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; }); }
  function tbl(e) { return e.table || (e.name + 's'); }

  function dbPy(s) {
    var stmts = [];
    if (s.auth) {
      stmts.push('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "member", created_at TEXT)');
      stmts.push('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, created_at TEXT)');
    }
    resources(s).forEach(function (e) {
      var cols = ['id ' + PY_COL.id, 'created_at TEXT'];
      (e.fields || []).forEach(function (f) {
        if (['id', 'createdAt', 'updatedAt'].indexOf(f.name) >= 0) return;
        cols.push(snake(f.name) + ' ' + (PY_COL[f.type] || 'TEXT') + (f.required ? ' NOT NULL' : ''));
      });
      stmts.push('CREATE TABLE IF NOT EXISTS ' + tbl(e) + ' (' + cols.join(', ') + ')');
    });
    return [
      '"""SQLite data layer — standard library only."""',
      'import os, sqlite3, datetime',
      '',
      'DB_PATH = os.environ.get("DB_PATH", os.path.join(os.environ.get("DATA_DIR", "."), "app.db"))',
      '',
      'def conn():',
      '    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)',
      '    c = sqlite3.connect(DB_PATH)',
      '    c.row_factory = sqlite3.Row',
      '    c.execute("PRAGMA foreign_keys = ON")',
      '    return c',
      '',
      'SCHEMA = [',
      stmts.map(function (x) { return '    ' + JSON.stringify(x) + ','; }).join('\n'),
      ']',
      '',
      'def migrate():',
      '    c = conn()',
      '    for stmt in SCHEMA:',
      '        c.execute(stmt)',
      '    c.commit(); c.close()',
      '    return [s.split()[5] for s in SCHEMA]',
      '',
      'def reset():',
      '    try:',
      '        os.remove(DB_PATH)',
      '    except FileNotFoundError:',
      '        pass',
      '',
      'def now():',
      '    return datetime.datetime.utcnow().isoformat() + "Z"',
      '',
      'def insert(table, data):',
      '    data = dict(data); data["created_at"] = now()',
      '    keys = list(data.keys())',
      '    c = conn()',
      '    cur = c.execute("INSERT INTO %s (%s) VALUES (%s)" % (table, ",".join(keys), ",".join("?" * len(keys))), [data[k] for k in keys])',
      '    row = c.execute("SELECT * FROM %s WHERE id = ?" % table, (cur.lastrowid,)).fetchone()',
      '    c.commit(); c.close()',
      '    return dict(row)',
      '',
      'def listing(table, where=None, limit=100, offset=0):',
      '    where = where or {}',
      '    cond = " AND ".join("%s = ?" % k for k in where)',
      '    sql = "SELECT * FROM %s%s ORDER BY id DESC LIMIT ? OFFSET ?" % (table, (" WHERE " + cond) if cond else "")',
      '    c = conn()',
      '    rows = c.execute(sql, list(where.values()) + [min(int(limit), 500), int(offset)]).fetchall()',
      '    total = c.execute("SELECT count(*) FROM %s%s" % (table, (" WHERE " + cond) if cond else ""), list(where.values())).fetchone()[0]',
      '    c.close()',
      '    return {"total": total, "rows": [dict(r) for r in rows]}',
      '',
      'def get(table, _id):',
      '    c = conn(); r = c.execute("SELECT * FROM %s WHERE id = ?" % table, (_id,)).fetchone(); c.close()',
      '    return dict(r) if r else None',
      '',
      'def delete(table, _id):',
      '    c = conn(); cur = c.execute("DELETE FROM %s WHERE id = ?" % table, (_id,)); c.commit(); n = cur.rowcount; c.close()',
      '    return n > 0',
      '',
      'if __name__ == "__main__":',
      '    print("migrated:", ", ".join(migrate()))',
      ''
    ].join('\n');
  }

  function authPy() {
    return [
      '"""Password hashing (scrypt, stdlib) + opaque session tokens."""',
      'import hashlib, os, secrets',
      'from . import db',
      '',
      'def hash_pw(password: str) -> str:',
      '    salt = os.urandom(16)',
      '    dk = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)',
      '    return "scrypt$" + salt.hex() + "$" + dk.hex()',
      '',
      'def verify_pw(password: str, stored: str) -> bool:',
      '    try:',
      '        _, salt_hex, dk_hex = stored.split("$")',
      '        dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=16384, r=8, p=1, dklen=32)',
      '        return secrets.compare_digest(dk.hex(), dk_hex)',
      '    except Exception:',
      '        return False',
      '',
      'def register(email: str, password: str):',
      '    if not email or not password or len(password) < 8:',
      '        raise ValueError("email and an 8+ char password are required")',
      '    c = db.conn()',
      '    first = c.execute("SELECT count(*) FROM users").fetchone()[0] == 0',
      '    c.close()',
      '    user = db.insert("users", {"email": email, "password_hash": hash_pw(password), "role": "admin" if first else "member"})',
      '    return _issue(user)',
      '',
      'def login(email: str, password: str):',
      '    c = db.conn(); row = c.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone(); c.close()',
      '    if not row or not verify_pw(password, row["password_hash"]):',
      '        raise ValueError("invalid credentials")',
      '    return _issue(dict(row))',
      '',
      'def _issue(user):',
      '    token = secrets.token_urlsafe(24)',
      '    db.insert("sessions", {"token": token, "user_id": user["id"]})',
      '    return {"token": token, "user": {"id": user["id"], "email": user["email"], "role": user["role"]}}',
      '',
      'def user_from_token(token: str):',
      '    if not token:',
      '        return None',
      '    c = db.conn()',
      '    row = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token,)).fetchone()',
      '    c.close()',
      '    return dict(row) if row else None',
      '',
      'def logout(token: str):',
      '    c = db.conn(); c.execute("DELETE FROM sessions WHERE token = ?", (token,)); c.commit(); c.close()',
      '    return {"ok": True}',
      ''
    ].join('\n');
  }

  function servicePy(e, s) {
    var owned = (e.fields || []).some(function (f) { return f.type === 'ref' && f.ref === 'user'; });
    var editable = (e.fields || []).filter(function (f) { return ['id', 'createdAt', 'updatedAt'].indexOf(f.name) < 0 && !(f.type === 'ref' && f.ref === 'user'); });
    return [
      '"""' + e.name + ' service."""',
      'from .. import db',
      '',
      'TABLE = ' + JSON.stringify(tbl(e)),
      'FIELDS = ' + JSON.stringify(editable.map(function (f) { return snake(f.name); })),
      '',
      'def list_(query, user):',
      '    where = {}',
      owned ? '    if user and user["role"] != "admin":\n        where["owner_id"] = user["id"]' : '    # public listing',
      '    return db.listing(TABLE, where, query.get("limit", 100), query.get("offset", 0))',
      '',
      'def create(data, user):',
      '    row = {k: data.get(k) for k in FIELDS if k in data}',
      owned ? '    row["owner_id"] = user["id"] if user else None' : '',
      '    missing = [f for f in FIELDS if f not in row]',
      '    return db.insert(TABLE, row)',
      '',
      'def get(_id):',
      '    return db.get(TABLE, _id)',
      '',
      'def remove(_id, user):',
      '    row = db.get(TABLE, _id)',
      '    if not row:',
      '        return False',
      owned ? '    if user and user["role"] != "admin" and row.get("owner_id") not in (None, user["id"]):\n        raise PermissionError("forbidden")' : '',
      '    return db.delete(TABLE, _id)',
      ''
    ].filter(function (l) { return l !== ''; }).join('\n');
  }

  function mainPy(s) {
    var res = resources(s);
    return [
      '"""' + s.name + ' — a pure-stdlib Python HTTP API (FastAPI-compatible route shape).',
      '',
      'Run:  python -m app.main   (serves on $PORT or 4319)',
      'Test: python -m unittest discover -s tests',
      '"""',
      'import json, os, re',
      'from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer',
      'from . import db',
      s.auth ? 'from . import auth' : '',
      res.map(function (e) { return 'from .services import ' + e.name + ' as svc_' + e.name; }).join('\n'),
      '',
      'PORT = int(os.environ.get("PORT", 4319))',
      'PUBLIC = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public")',
      'MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json"}',
      '',
      'ROUTES = {',
      res.map(function (e) { return '    ' + JSON.stringify(tbl(e)) + ': svc_' + e.name; }).join(',\n'),
      '}',
      '',
      'class Handler(BaseHTTPRequestHandler):',
      '    protocol_version = "HTTP/1.1"',
      '    def log_message(self, *a): pass',
      '',
      '    def _send(self, code, body, ctype="application/json"):',
      '        data = body if isinstance(body, (bytes, bytearray)) else (body if isinstance(body, str) else json.dumps(body)).encode()',
      '        self.send_response(code)',
      '        self.send_header("content-type", ctype)',
      '        self.send_header("content-length", str(len(data)))',
      '        self.end_headers()',
      '        self.wfile.write(data)',
      '',
      '    def _body(self):',
      '        n = int(self.headers.get("content-length", 0) or 0)',
      '        raw = self.rfile.read(n) if n else b""',
      '        try:',
      '            return json.loads(raw or b"{}")',
      '        except Exception:',
      '            return {}',
      '',
      s.auth ? '    def _user(self):\n        h = self.headers.get("authorization", "")\n        return auth.user_from_token(h[7:]) if h.lower().startswith("bearer ") else None\n' : '',
      '    def _route(self, method):',
      '        from urllib.parse import urlparse, parse_qs',
      '        u = urlparse(self.path)',
      '        seg = [s for s in u.path.split("/") if s]',
      '        q = {k: v[0] for k, v in parse_qs(u.query).items()}',
      '        try:',
      s.auth ? '            if seg[:2] == ["api", "auth"]:\n                if seg[2:3] == ["register"] and method == "POST":\n                    b = self._body(); return self._send(201, auth.register(b.get("email"), b.get("password")))\n                if seg[2:3] == ["login"] and method == "POST":\n                    b = self._body(); return self._send(200, auth.login(b.get("email"), b.get("password")))\n                if seg[2:3] == ["logout"] and method == "POST":\n                    h = self.headers.get("authorization", ""); return self._send(200, auth.logout(h[7:]))\n                if seg[2:3] == ["me"] and method == "GET":\n                    u2 = self._user(); return self._send(200, {"user": {"id": u2["id"], "email": u2["email"], "role": u2["role"]} if u2 else None})\n                return self._send(404, {"error": "not found"})\n' : '',
      '            if seg[:1] == ["api"] and len(seg) >= 2 and seg[1] in ROUTES:',
      '                svc = ROUTES[seg[1]]',
      '                user = ' + (s.auth ? 'self._user()' : 'None'),
      '                _id = seg[2] if len(seg) > 2 else None',
      '                if not _id and method == "GET":',
      '                    return self._send(200, svc.list_(q, user))',
      '                if not _id and method == "POST":',
      s.auth ? '                    if not user:\n                        return self._send(401, {"error": "unauthorized"})' : '',
      '                    return self._send(201, svc.create(self._body(), user))',
      '                if _id and method == "GET":',
      '                    row = svc.get(_id); return self._send(200 if row else 404, row or {"error": "not found"})',
      '                if _id and method == "DELETE":',
      s.auth ? '                    if not user:\n                        return self._send(401, {"error": "unauthorized"})' : '',
      '                    return self._send(200, {"ok": svc.remove(_id, user)})',
      '                return self._send(405, {"error": "method not allowed"})',
      '            if seg[:1] == ["api"]:',
      '                return self._send(404, {"error": "unknown resource"})',
      '            # static files',
      '            rel = "/index.html" if u.path == "/" else u.path',
      '            fp = os.path.normpath(os.path.join(PUBLIC, rel.lstrip("/")))',
      '            if fp.startswith(PUBLIC) and os.path.isfile(fp):',
      '                ext = os.path.splitext(fp)[1]',
      '                with open(fp, "rb") as f:',
      '                    return self._send(200, f.read(), MIME.get(ext, "text/plain"))',
      '            return self._send(404, {"error": "not found"})',
      '        except PermissionError as e:',
      '            return self._send(403, {"error": str(e)})',
      '        except ValueError as e:',
      '            return self._send(400, {"error": str(e)})',
      '        except Exception as e:',
      '            return self._send(500, {"error": str(e)})',
      '',
      '    def do_GET(self): self._route("GET")',
      '    def do_POST(self): self._route("POST")',
      '    def do_DELETE(self): self._route("DELETE")',
      '',
      'def make_server(port=None):',
      '    db.migrate()',
      '    return ThreadingHTTPServer(("127.0.0.1", port if port is not None else PORT), Handler)',
      '',
      'if __name__ == "__main__":',
      '    srv = make_server()',
      '    print("%s on http://localhost:%d" % (' + JSON.stringify(s.name) + ', srv.server_address[1]))',
      '    srv.serve_forever()',
      ''
    ].filter(function (l) { return l !== ''; }).join('\n');
  }

  function testPy(s) {
    var e = resources(s)[0];
    var editable = e ? (e.fields || []).filter(function (f) { return ['id', 'createdAt'].indexOf(f.name) < 0 && !(f.type === 'ref' && f.ref === 'user'); }) : [];
    var sample = {};
    editable.forEach(function (f) { sample[snake(f.name)] = (f.type === 'int' || f.type === 'float') ? 7 : 'x'; });
    return [
      '"""End-to-end test: real server, real HTTP, real sqlite."""',
      'import json, os, tempfile, threading, unittest, urllib.request',
      'os.environ["DATA_DIR"] = tempfile.mkdtemp()',
      'from app import db',
      'from app.main import make_server',
      '',
      '',
      'def req(method, path, body=None, token=None):',
      '    url = "http://127.0.0.1:%d%s" % (PORT, path)',
      '    data = json.dumps(body).encode() if body is not None else None',
      '    r = urllib.request.Request(url, data=data, method=method)',
      '    r.add_header("content-type", "application/json")',
      '    if token:',
      '        r.add_header("authorization", "Bearer " + token)',
      '    try:',
      '        with urllib.request.urlopen(r, timeout=5) as resp:',
      '            return resp.status, json.loads(resp.read() or b"{}")',
      '    except urllib.error.HTTPError as ex:',
      '        return ex.code, json.loads(ex.read() or b"{}")',
      '',
      '',
      'PORT = 0',
      '',
      '',
      'class ApiTest(unittest.TestCase):',
      '    @classmethod',
      '    def setUpClass(cls):',
      '        global PORT',
      '        db.reset()',
      '        cls.srv = make_server(0)',
      '        PORT = cls.srv.server_address[1]',
      '        cls.t = threading.Thread(target=cls.srv.serve_forever, daemon=True)',
      '        cls.t.start()',
      '',
      '    @classmethod',
      '    def tearDownClass(cls):',
      '        cls.srv.shutdown()',
      '',
      '    def test_migrate_and_crud(self):',
      s.auth
        ? '        code, reg = req("POST", "/api/auth/register", {"email": "t@e.co", "password": "password12"})\n' +
          '        self.assertEqual(code, 201)\n' +
          '        self.assertIn("token", reg)\n' +
          '        tok = reg["token"]\n' +
          (e ? '        code, created = req("POST", "/api/' + tbl(e) + '", ' + JSON.stringify(sample) + ', tok)\n' +
               '        self.assertEqual(code, 201, created)\n' +
               '        self.assertTrue(created["id"] > 0)\n' +
               '        code, listed = req("GET", "/api/' + tbl(e) + '", None, tok)\n' +
               '        self.assertEqual(code, 200)\n' +
               '        self.assertEqual(len(listed["rows"]), 1)\n' +
               '        code, _ = req("POST", "/api/' + tbl(e) + '", {}, None)\n' +
               '        self.assertEqual(code, 401, "mutation without auth is rejected")\n' : '')
        : (e ? '        code, created = req("POST", "/api/' + tbl(e) + '", ' + JSON.stringify(sample) + ')\n' +
               '        self.assertEqual(code, 201, created)\n' : ''),
      '        code, missing = req("GET", "/api/nope")',
      '        self.assertEqual(code, 404)',
      '',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      ''
    ].filter(function (l) { return l !== ''; }).join('\n');
  }

  function meta(s) {
    return {
      'package.json': JSON.stringify({
        name: s.name, version: '0.1.0', private: true,
        description: 'Generated by CodeSovereign — Python (stdlib) HTTP API.',
        scripts: {
          dev: 'python -m app.main',
          start: 'python -m app.main',
          test: 'python -m unittest discover -s tests -t . -v',
          build: 'python -m compileall -q app',
          lint: 'python -m compileall -q app && echo lint clean',
          migrate: 'python -m app.db'
        }
      }, null, 2) + '\n',
      'requirements.txt': '# The generated app is pure standard library — no runtime deps.\n# To move to FastAPI: uncomment and `pip install -r requirements.txt`.\n# fastapi>=0.110\n# uvicorn>=0.29\n# sqlmodel>=0.0.16\n',
      'Dockerfile.py': 'FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nENV PORT=4319 DATA_DIR=/data\nRUN python -m compileall -q app && mkdir -p /data\nEXPOSE 4319\nHEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(\'http://localhost:4319/\').status==200 else 1)" || exit 1\nCMD ["python", "-m", "app.main"]\n',
      'app/__init__.py': '',
      'app/services/__init__.py': '',
      '.gitignore': '__pycache__/\n*.pyc\n.data/\napp.db\n'
    };
  }

  function snake(x) { return String(x).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); }

  function generate(spec) {
    var s = spec || {};
    var out = {
      'app/db.py': dbPy(s),
      'app/main.py': mainPy(s),
      'tests/__init__.py': '',
      'tests/test_api.py': testPy(s)
    };
    if (s.auth) out['app/auth.py'] = authPy();
    resources(s).forEach(function (e) { out['app/services/' + e.name + '.py'] = servicePy(e, s); });
    var m = meta(s);
    Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    return out;
  }

  Engine.PyBackend = { generate: generate };
  console.info('[PyBackend] Python (stdlib) backend generator ready — Engine.PyBackend');
})();
