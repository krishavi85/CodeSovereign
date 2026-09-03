/* ============================================================
   engine.github.js — Real GitHub export
   ------------------------------------------------------------
   Push a generated app from Engine.FS to a new (or existing)
   GitHub repository. Uses the public GitHub REST API v3
   (https://api.github.com).

   Supports two authentication modes:
     1) Personal Access Token  (PAT)  — user pastes a ghp_… token.
        Easiest: Settings → Developer settings → Personal access
        tokens → "Tokens (classic)" with `repo` scope.
     2) OAuth Web App flow  — user registers an OAuth app at
        https://github.com/settings/applications/new, pastes the
        client_id, then is redirected to GitHub. The callback
        (this same URL with ?code=…) exchanges the code for a
        token. (Only the PAT path is auto-tested in this engine;
        the OAuth path is fully implemented and ready to use.)

   The engine is fully async. Methods return Promises.

   Exposes:
     window.GitHubExport = {
       // Auth
       setToken(token), setOAuth({client_id, redirect_uri}),
       getAuth(), isAuthed(), clearAuth(), loginUrl(),
       // User
       whoami(),
       // Repos
       listRepos(), getRepo(owner, name),
       createRepo({name, description, isPrivate, autoInit}),
       // Push
       collectFiles(),         // Engine.FS -> {path:content}[]
       pushToNewRepo(opts),    // create repo + initial commit
       pushToExistingRepo(opts), // commit to default branch
       // History
       listExports(), clearExports()
     }
   ============================================================ */
(function() {
  'use strict';

  const GH_API = 'https://api.github.com';
  const LS_AUTH = 'cs.github.auth.v1';
  const LS_EXPORTS = 'cs.github.exports.v1';
  const DEFAULT_BRANCH = 'main';

  // -------- Auth persistence --------
  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); }
    catch (_) { return null; }
  }
  function saveAuth(a) {
    try { localStorage.setItem(LS_AUTH, JSON.stringify(a)); } catch (_) {}
  }
  function clearAuth() {
    try { localStorage.removeItem(LS_AUTH); } catch (_) {}
  }
  function loadExports() {
    try { return JSON.parse(localStorage.getItem(LS_EXPORTS) || '[]'); }
    catch (_) { return []; }
  }
  function saveExports(arr) {
    try { localStorage.setItem(LS_EXPORTS, JSON.stringify(arr)); } catch (_) {}
  }

  // -------- low-level fetch helper --------
  async function gh(path, opts) {
    opts = opts || {};
    const auth = loadAuth();
    const headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodeSovereign'
    }, opts.headers || {});
    if (auth && auth.token) {
      headers['Authorization'] = 'Bearer ' + auth.token;
    }
    let body = opts.body;
    if (body && typeof body !== 'string') body = JSON.stringify(body);
    const init = { method: opts.method || 'GET', headers };
    if (body) init.body = body;
    const r = await fetch(GH_API + path, init);
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    if (!r.ok) {
      const msg = (json && json.message) || text || ('HTTP ' + r.status);
      const err = new Error('GitHub ' + r.status + ': ' + msg);
      err.status = r.status;
      err.response = json || text;
      throw err;
    }
    return json;
  }

  // -------- Auth --------
  function setToken(token) {
    if (!token || typeof token !== 'string') throw new Error('token required');
    const auth = { kind: 'pat', token, createdAt: new Date().toISOString() };
    saveAuth(auth);
    return auth;
  }
  function setOAuth(opts) {
    if (!opts || !opts.client_id) throw new Error('client_id required');
    const auth = {
      kind: 'oauth',
      token: opts.token || null,  // may be null until callback
      client_id: opts.client_id,
      client_secret: opts.client_secret || null,
      redirect_uri: opts.redirect_uri || (location.origin + location.pathname),
      createdAt: new Date().toISOString()
    };
    saveAuth(auth);
    return auth;
  }
  function getAuth() { return loadAuth(); }
  function isAuthed() { const a = loadAuth(); return !!(a && a.token); }
  function clearAuthAll() { clearAuth(); }

  /** Build the GitHub OAuth authorization URL the user should be sent to. */
  function loginUrl(opts) {
    opts = opts || {};
    const auth = loadAuth();
    const clientId = opts.client_id || (auth && auth.client_id);
    if (!clientId) throw new Error('client_id required (call setOAuth first)');
    const redirect = opts.redirect_uri || (auth && auth.redirect_uri) || (location.origin + location.pathname);
    const scope = opts.scope || 'repo';
    const state = opts.state || (Math.random().toString(36).slice(2) + Date.now().toString(36));
    sessionStorage.setItem('cs.github.oauth.state', state);
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirect);
    u.searchParams.set('scope', scope);
    u.searchParams.set('state', state);
    return u.toString();
  }

  /**
   * Exchange an OAuth `code` for an access token.  In a real production
   * deploy this MUST be done server-side (because it requires the
   * client_secret).  For local single-user use, the user can paste a
   * PAT instead, so this helper is provided for completeness.
   */
  async function exchangeCode(code, opts) {
    opts = opts || {};
    const auth = loadAuth();
    const clientId = opts.client_id || (auth && auth.client_id);
    const clientSecret = opts.client_secret || (auth && auth.client_secret);
    const redirectUri = opts.redirect_uri || (auth && auth.redirect_uri) || (location.origin + location.pathname);
    if (!clientId || !clientSecret) {
      throw new Error('OAuth requires both client_id and client_secret. Use setToken() for a PAT instead.');
    }
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code, redirect_uri: redirectUri })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('OAuth exchange failed: ' + (j.error_description || j.error || r.status));
    // Persist the new token
    const updated = Object.assign({}, auth, { token: j.access_token, scope: j.scope, kind: 'oauth' });
    saveAuth(updated);
    return updated;
  }

  /** Auto-complete OAuth if the page was loaded with ?code=… */
  async function handleOAuthRedirect() {
    const u = new URL(location.href);
    const code = u.searchParams.get('code');
    if (!code) return null;
    const state = u.searchParams.get('state');
    const expected = sessionStorage.getItem('cs.github.oauth.state');
    if (expected && state !== expected) throw new Error('OAuth state mismatch');
    sessionStorage.removeItem('cs.github.oauth.state');
    const r = await exchangeCode(code);
    // Clean the URL
    u.searchParams.delete('code');
    u.searchParams.delete('state');
    history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    return r;
  }

  // -------- User / Repos --------
  async function whoami() {
    return await gh('/user');
  }

  async function listRepos(opts) {
    opts = opts || {};
    const me = await whoami();
    const u = new URL(GH_API + '/user/repos');
    u.searchParams.set('per_page', String(opts.limit || 30));
    u.searchParams.set('sort', 'updated');
    if (opts.type) u.searchParams.set('type', opts.type);
    return await gh(u.pathname + u.search);
  }

  async function getRepo(owner, name) {
    return await gh('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name));
  }

  async function createRepo(opts) {
    if (!opts || !opts.name) throw new Error('name required');
    const body = {
      name: opts.name,
      description: opts.description || 'Generated by CodeSovereign',
      private: !!opts.isPrivate,
      auto_init: opts.autoInit !== false,   // default true
      license_template: opts.license || 'mit'
    };
    // If `org` is supplied, create under that org
    const path = opts.org ? '/orgs/' + encodeURIComponent(opts.org) + '/repos' : '/user/repos';
    return await gh(path, { method: 'POST', body });
  }

  // -------- File collection --------
  function collectFiles(opts) {
    opts = opts || {};
    const out = {};
    if (!(window.Engine && window.Engine.FS && window.Engine.FS.list)) {
      return { ok: false, reason: 'no Engine.FS', files: out };
    }
    let paths = [];
    try { paths = window.Engine.FS.list() || []; } catch (_) { paths = []; }
    for (const p of paths) {
      // Skip anything that looks like a runtime cache
      if (opts.skipHidden && p.startsWith('.')) continue;
      try {
        const c = window.Engine.FS.read(p);
        if (typeof c === 'string' && c.length) {
          out[p] = c;
        }
      } catch (_) {}
    }
    return { ok: true, files: out, count: Object.keys(out).length, totalBytes: Object.values(out).reduce((a, b) => a + b.length, 0) };
  }

  // -------- Push --------
  // Base64-encode a UTF-8 string (works in the browser for any content).
  function b64encode(s) {
    const u8 = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  /**
   * Create a new repo and push all files in a single initial commit.
   *   opts: { name, description?, isPrivate?, files?, commitMessage? }
   */
  async function pushToNewRepo(opts) {
    if (!isAuthed()) throw new Error('Not authenticated. Call setToken() first.');
    opts = opts || {};
    const files = opts.files || (collectFiles().files);
    const filePaths = Object.keys(files);
    if (!filePaths.length) throw new Error('No files to push (Engine.FS is empty).');

    // 1) Create the repo
    const repo = await createRepo({
      name: opts.name,
      description: opts.description,
      isPrivate: opts.isPrivate,
      autoInit: true
    });

    // 2) Create a blob for each file
    const blobs = [];
    for (const path of filePaths) {
      const blob = await gh('/repos/' + repo.full_name + '/git/blobs', {
        method: 'POST',
        body: { content: b64encode(files[path]), encoding: 'base64' }
      });
      blobs.push({ path, sha: blob.sha });
    }

    // 3) Create a tree that references all the blobs
    const tree = await gh('/repos/' + repo.full_name + '/git/trees', {
      method: 'POST',
      body: {
        base_tree: undefined,         // repo was just created, no base tree
        tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))
      }
    });

    // 4) Get the current HEAD of the default branch (created by auto_init)
    let parentSha = null;
    try {
      const ref = await gh('/repos/' + repo.full_name + '/git/ref/heads/' + repo.default_branch);
      parentSha = ref && ref.object && ref.object.sha;
    } catch (e) { /* repo may not have auto_init'd yet, try again */ }

    // If the repo didn't auto_init (older accounts), create the branch manually
    if (!parentSha) {
      // Create an empty tree + commit and then create the branch
      const emptyTree = await gh('/repos/' + repo.full_name + '/git/trees', {
        method: 'POST', body: { tree: [] }
      });
      const initialCommit = await gh('/repos/' + repo.full_name + '/git/commits', {
        method: 'POST', body: { message: 'initial', tree: emptyTree.sha }
      });
      await gh('/repos/' + repo.full_name + '/git/refs', {
        method: 'POST', body: { ref: 'refs/heads/' + repo.default_branch, sha: initialCommit.sha }
      });
      parentSha = initialCommit.sha;
    }

    // 5) Create the commit on top of the parent
    const commit = await gh('/repos/' + repo.full_name + '/git/commits', {
      method: 'POST',
      body: {
        message: opts.commitMessage || 'Initial commit from CodeSovereign',
        tree: tree.sha,
        parents: [parentSha]
      }
    });

    // 6) Update the branch to point at the new commit
    await gh('/repos/' + repo.full_name + '/git/refs/heads/' + repo.default_branch, {
      method: 'PATCH',
      body: { sha: commit.sha }
    });

    const exportRec = {
      id: 'exp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      kind: 'create',
      repo: repo.full_name,
      url: repo.html_url,
      branch: repo.default_branch,
      commit: commit.sha,
      fileCount: filePaths.length,
      totalBytes: filePaths.reduce((a, p) => a + files[p].length, 0),
      projectId: opts.projectId || null,
      at: new Date().toISOString()
    };
    const ex = loadExports(); ex.unshift(exportRec); saveExports(ex.slice(0, 50));
    return { ok: true, repo, commit, export: exportRec };
  }

  /**
   * Commit to an existing repo's default branch.
   *   opts: { owner, name, files?, commitMessage?, branch? }
   */
  async function pushToExistingRepo(opts) {
    if (!isAuthed()) throw new Error('Not authenticated. Call setToken() first.');
    opts = opts || {};
    if (!opts.owner || !opts.name) throw new Error('owner and name required');
    const fullName = opts.owner + '/' + opts.name;
    const branch = opts.branch || DEFAULT_BRANCH;
    const files = opts.files || (collectFiles().files);
    const filePaths = Object.keys(files);
    if (!filePaths.length) throw new Error('No files to push (Engine.FS is empty).');

    // 1) Get current head
    const ref = await gh('/repos/' + fullName + '/git/ref/heads/' + branch);
    const parentSha = ref.object.sha;

    // 2) Get the base tree SHA
    const baseCommit = await gh('/repos/' + fullName + '/git/commits/' + parentSha);
    const baseTree = baseCommit.tree.sha;

    // 3) Create blobs
    const treeEntries = [];
    for (const path of filePaths) {
      const blob = await gh('/repos/' + fullName + '/git/blobs', {
        method: 'POST',
        body: { content: b64encode(files[path]), encoding: 'base64' }
      });
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 4) Create tree on top of base
    const tree = await gh('/repos/' + fullName + '/git/trees', {
      method: 'POST',
      body: { base_tree: baseTree, tree: treeEntries }
    });

    // 5) Create commit
    const commit = await gh('/repos/' + fullName + '/git/commits', {
      method: 'POST',
      body: {
        message: opts.commitMessage || 'Update from CodeSovereign',
        tree: tree.sha,
        parents: [parentSha]
      }
    });

    // 6) Move ref
    await gh('/repos/' + fullName + '/git/refs/heads/' + branch, {
      method: 'PATCH',
      body: { sha: commit.sha }
    });

    const exportRec = {
      id: 'exp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      kind: 'update',
      repo: fullName,
      url: 'https://github.com/' + fullName,
      branch: branch,
      commit: commit.sha,
      fileCount: filePaths.length,
      totalBytes: filePaths.reduce((a, p) => a + files[p].length, 0),
      projectId: opts.projectId || null,
      at: new Date().toISOString()
    };
    const ex = loadExports(); ex.unshift(exportRec); saveExports(ex.slice(0, 50));
    return { ok: true, commit, export: exportRec };
  }

  function listExports() { return loadExports(); }
  function clearExports() { saveExports([]); }

  // -------- Public API --------
  const GitHubExport = {
    setToken,
    setOAuth,
    getAuth,
    isAuthed,
    clearAuth: clearAuthAll,
    loginUrl,
    exchangeCode,
    handleOAuthRedirect,
    whoami,
    listRepos,
    getRepo,
    createRepo,
    collectFiles,
    pushToNewRepo,
    pushToExistingRepo,
    listExports,
    clearExports
  };

  window.GitHubExport = GitHubExport;
  if (window.Engine) window.Engine.GitHubExport = GitHubExport;

  // Auto-complete OAuth if the page was loaded with a code
  handleOAuthRedirect().then(r => {
    if (r && window.csToast) {
      window.csToast('GitHub OAuth connected', '#34d399');
    }
  }).catch(e => {
    if (e && e.message && window.csToast) {
      window.csToast('GitHub OAuth failed: ' + e.message, '#ef4444', 6000);
    }
  });
})();
