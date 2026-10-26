/* =====================================================================
 * app.chat.task.js  —  task modes for the IDE chat panel: Plan, Agent, Auto
 *
 * Connects the chat panel (app.chat.js) to the native agent runtime
 * (Engine.NativeAgent, engine.nagent.js). A task is plan -> approval ->
 * execute -> verify -> repair; the panel shows each step as it happens:
 *   - every model turn and tool call as its own row (with the phase)
 *   - a task card: state, plan checklist, the file being edited, repair
 *     attempts, the latest verification
 *   - the plan approval (Agent mode), command approvals, Stop / Resume
 *   - the final evidence-based report, and per-file hunk review of what
 *     changed through the editor's existing review dock
 *   - Revert: every applied change is undone from the workspace journal
 *
 * Registers itself with the extension points CSChat._x.ext exposes.
 * ===================================================================== */
(function () {
  'use strict';
  var w = typeof window !== 'undefined' ? window : globalThis;
  if (!w.CSChat || !w.CSChat._x) return;
  var x = w.CSChat._x, state = x.state, ext = x.ext, esc = x.esc;

  var task = null;          // the live (or most recently finished) task
  var interrupted = null;   // a stored run the app lost while it was working

  function NA() { return w.Engine && w.Engine.NativeAgent; }
  function Engine() { return w.Engine || {}; }

  try {
    var rec = NA() && NA().loadRun(x.agentEnv().store);
    if (rec && rec.state === 'BLOCKED' && rec.resumable && rec.goal) interrupted = rec;
  } catch (_) { /* no stored run */ }

  function snapshot() {
    var E = Engine();
    try { return E.Review && E.Review.snapshot && E.FS ? E.Review.snapshot(E.FS) : null; } catch (_) { return null; }
  }

  var STATE_LABEL = { IDLE: 'Starting', PLANNING: 'Planning', WAITING_APPROVAL: 'Needs your OK', EXECUTING: 'Working', VERIFYING: 'Verifying', REPAIRING: 'Repairing',
    COMPLETED: 'Done', BLOCKED: 'Blocked', FAILED: 'Failed', CANCELLED: 'Cancelled' };
  var RESULT_LABEL = { verified: 'Verified', unverified: 'Done · not verified', blocked: 'Blocked', failed: 'Failed', cancelled: 'Cancelled', planned: 'Plan ready', 'no-changes': 'No changes' };

  function verifyLine(v) {
    if (!v.ran) return 'Verification: ' + (v.note || 'nothing to run');
    return 'Verification ' + (v.ok === true ? 'passed' : v.ok === false ? 'FAILED' : 'inconclusive') + ' — ' + v.results.map(function (r) {
      return r.label + ' (exit ' + r.code + (r.pass != null ? ', ' + r.pass + ' pass / ' + r.fail + ' fail' : '') + ')';
    }).join('; ');
  }

  /* ------------------------------------------------------------- running */

  function begin(mode, o) {
    var Nat = NA(), t = o.t, AI = o.AI;
    if (!Nat) { x.pushNote(t, 'The agent runtime is not loaded.'); x.mount(); return Promise.resolve(null); }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var before = snapshot();
    task = { goal: o.goal, mode: mode, state: 'IDLE', plan: o.resume && o.resume.plan ? o.resume.plan.map(function (p) { return Object.assign({}, p); }) : [], ctrl: ctrl, before: before, report: null, awaitingPlan: null, attempts: [], lastVerify: null,
      reg: null, changes: [], finished: false, file: null };
    interrupted = null;
    state.busy = true; state.ctrl = ctrl; state.lastTool = null;
    var hk = x.loopHooks(t);
    x.saveStore(); x.mount();

    var finish = function () {
      state.busy = false; state.ctrl = null; state.lastTool = null; x.settleApprovals(false);
      if (task.awaitingPlan) { task.awaitingPlan.resolve(false); task.awaitingPlan = null; }
      task.finished = true;
      x.saveStore(); x.mount();
      return t.messages[t.messages.length - 1];
    };

    return Nat.runTask({
      goal: o.goal, mode: mode, env: x.agentEnv(), signal: ctrl && ctrl.signal, resumeFrom: o.resume || null,
      chatStream: function (m, co) { return AI.chatStream(m, co); }, chatOptions: x.chatOptions(), toolset: x.toolset(),
      hooks: {
        onTurnStart: hk.onTurnStart, onText: hk.onText, onTurnEnd: hk.onTurnEnd, onNoTools: hk.onNoTools,
        onToolStart: hk.onToolStart,
        onToolDone: function (c, res) {
          if (res.staged === 'applied' && c.args && c.args.path) task.file = x.normPath(c.args.path);
          hk.onToolDone(c, res);
        },
        onState: function (s, run) { task.state = s; task.run = run; x.saveStore(); x.mount(); },
        onPlan: function (p) { task.plan = p; x.mount(); },
        approvePlan: function (p, info) {
          return new Promise(function (resolve) { task.awaitingPlan = { resolve: resolve, info: info || {} }; x.mount(); });
        },
        approve: x.askApproval,
        onVerify: function (v) { task.lastVerify = v; x.pushNote(t, verifyLine(v)); x.saveStore(); x.mount(); },
        onAttempt: function (a) { task.attempts.push(a); x.pushNote(t, 'Repair attempt ' + a.n + ': fixing the failing tests…'); x.mount(); }
      }
    }).then(function (res) {
      task.report = res.report; task.reg = res.registry; task.changes = res.changes || []; task.state = res.run.state;
      t.messages.push({ id: x.uid(), role: 'assistant', content: res.report.text, report: true, status: res.report.status, error: res.report.status === 'failed', at: Date.now() });
      var last = finish();
      if (task.changes.length) {
        try { if (w.beginAgentReview && before) w.beginAgentReview(before); } catch (_) {}
        if (w.renderAll) w.renderAll();
      }
      return last;
    }, function (e) {
      t.messages.push({ id: x.uid(), role: 'assistant', content: 'The agent run failed: ' + String((e && e.message) || e), error: true, at: Date.now() });
      return finish();
    });
  }

  function send(mode) {
    return function (o) { return begin(mode, { t: o.t, AI: o.AI, goal: o.text }); };
  }
  ext.modeSend.plan = send('plan');
  ext.modeSend.agent = send('agent');
  ext.modeSend.auto = send('auto');

  function resume() {
    var rec = interrupted;
    var AI = Engine().AI;
    if (!rec || state.busy) return;
    if (!AI || !AI.ready || !AI.ready()) { x.toast('Connect a model to resume', '#f59e0b'); return; }
    begin(rec.mode === 'plan' ? 'agent' : rec.mode, { t: x.thread(), AI: AI, goal: rec.goal, resume: rec });
  }

  function revertAll() {
    if (!task || !task.reg) return;
    var E = Engine(), S = w.S || {}, t = x.thread();
    // an open hunk review would keep showing the agent's text: close it first
    try { if (w.CSEditor && w.CSEditor.reviewing && w.CSEditor.reviewing()) w.CSEditor.endReview('replaced'); } catch (_) {}
    var r = task.reg.ws.revertAll();
    var n = r.reverted.length;
    Promise.resolve(E.FS && E.FS.__flush ? E.FS.__flush() : null).then(function () {
      if (S.ideFile && E.FS) { S.ideBuffer = E.FS.read(S.ideFile) || ''; S.ideDirty = false; if (!E.FS.isFile(S.ideFile)) S.ideFile = null; }
      task.changes = [];
      x.pushNote(t, 'Reverted ' + n + ' file' + (n === 1 ? '' : 's') + ' to how they were before the task.');
      x.saveStore(); x.mount();
      if (w.renderReviewDock) { try { w.renderReviewDock(); } catch (_) {} }
      if (w.renderAll) w.renderAll();
    });
  }

  /* ------------------------------------------------------------------ UI */

  var CSS =
    '.csc-task{flex:none;border-top:1px solid rgba(124,111,245,.4);background:rgba(124,111,245,.06);padding:8px 12px;font-size:12px;color:#dfe3ee;max-height:230px;overflow:auto}' +
    '.csc-task-h{display:flex;gap:8px;align-items:center;margin-bottom:4px}' +
    '.csc-task-st{font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:999px;background:rgba(124,111,245,.3);color:#e6e0ff;white-space:nowrap}' +
    '.csc-task.s-COMPLETED .csc-task-st.ok{background:rgba(52,211,153,.25);color:#a7f3d0}.csc-task.s-FAILED .csc-task-st,.csc-task .csc-task-st.bad{background:rgba(248,113,113,.25);color:#fecaca}' +
    '.csc-task.s-BLOCKED .csc-task-st,.csc-task.s-WAITING_APPROVAL .csc-task-st{background:rgba(245,158,11,.28);color:#fde68a}.csc-task.s-CANCELLED .csc-task-st{background:rgba(255,255,255,.1);color:#aab2c7}' +
    '.csc-task-goal{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c9d1e0}' +
    '.csc-task ol{margin:2px 0 4px;padding:0;list-style:none}.csc-task li{padding:1px 0;color:#9aa3b8}.csc-task li.done{color:#7ee0b5;text-decoration:line-through;text-decoration-color:rgba(126,224,181,.4)}' +
    '.csc-task li.in_progress{color:#e6e0ff;font-weight:600}.csc-task li.blocked{color:#fca5a5}' +
    '.csc-task li::before{content:"○ ";color:#5f6980}.csc-task li.done::before{content:"✓ ";color:#34d399}.csc-task li.in_progress::before{content:"● ";color:#a78bfa}.csc-task li.blocked::before{content:"✕ ";color:#f87171}' +
    '.csc-task-meta{color:#8b93a7;font-size:11px;margin:2px 0}' +
    '.csc-task-act{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap}' +
    '.csc-task-act button{cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#e6e9f2;border-radius:6px;padding:3px 11px;font:600 11px Inter}' +
    '.csc-task-act button.primary{background:#5b4de8;border-color:#5b4de8}.csc-task-act button.danger{color:#fca5a5}' +
    '.csc-row-file{color:#a78bfa;font-size:10.5px;margin-left:6px}';

  function ensureStyle() {
    if (typeof document === 'undefined' || !document.getElementById || !document.createElement || document.getElementById('csTaskStyle')) return;
    var s = document.createElement('style'); s.id = 'csTaskStyle'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function taskHtml() {
    ensureStyle();
    if (!task) {
      if (!interrupted) return '';
      return '<div class="csc-task s-BLOCKED"><div class="csc-task-h"><span class="csc-task-st">Interrupted</span><span class="csc-task-goal" title="' + esc(interrupted.goal) + '">' + esc(interrupted.goal) + '</span></div>' +
        '<div class="csc-task-meta">This run was cut off when the app closed. Its plan and everything it already changed are kept.</div>' +
        '<div class="csc-task-act"><button type="button" class="primary" data-cs-task="resume">Resume</button><button type="button" data-cs-task="dismiss">Dismiss</button></div></div>';
    }
    var st = task.state, res = task.report && task.report.status;
    var label = st === 'COMPLETED' && res ? (RESULT_LABEL[res] || 'Done') : (STATE_LABEL[st] || st);
    var cls = st === 'COMPLETED' ? (res === 'verified' ? 'ok' : res === 'unverified' || res === 'no-changes' ? '' : 'bad') : '';
    var h = '<div class="csc-task s-' + esc(st) + '"><div class="csc-task-h"><span class="csc-task-st ' + cls + '">' + esc(label).toUpperCase() + '</span>' +
      '<span class="csc-task-goal" title="' + esc(task.goal) + '">' + esc(task.goal) + '</span></div>';
    if (task.plan.length) h += '<ol>' + task.plan.map(function (p) { return '<li class="' + esc(p.status) + '">' + esc(p.text) + '</li>'; }).join('') + '</ol>';
    var meta = [];
    if (task.file && (st === 'EXECUTING' || st === 'REPAIRING')) meta.push('editing ' + task.file);
    if (task.attempts.length) meta.push('repair attempt' + (task.attempts.length === 1 ? '' : 's') + ': ' + task.attempts.length);
    if (task.lastVerify && task.lastVerify.ran) meta.push('last check: ' + (task.lastVerify.ok === true ? 'passed' : task.lastVerify.ok === false ? 'failed' : 'inconclusive'));
    if (task.finished && task.changes.length) meta.push(task.changes.length + ' file' + (task.changes.length === 1 ? '' : 's') + ' changed');
    if (meta.length) h += '<div class="csc-task-meta">' + esc(meta.join(' · ')) + '</div>';
    var act = '';
    if (task.awaitingPlan) {
      var v = (task.awaitingPlan.info && task.awaitingPlan.info.verify) || [];
      h += '<div class="csc-task-meta">Approve this plan to let the agent change files in this project' + (v.length ? ' and run: ' + esc(v.join(', ')) : '') + '. Every change can be reverted.</div>';
      act = '<button type="button" class="primary" data-cs-task="approve">Approve and run</button><button type="button" data-cs-task="cancel">Cancel</button>';
    } else if (task.finished) {
      if (task.changes.length && task.reg) act += '<button type="button" class="danger" data-cs-task="revert">Revert all changes</button>';
      if (st === 'BLOCKED' && task.run && task.run.resumable && !state.busy) { interrupted = interrupted || task.run; act += '<button type="button" class="primary" data-cs-task="resume">Resume</button>'; }
    }
    return h + (act ? '<div class="csc-task-act">' + act + '</div>' : '') + '</div>';
  }
  ext.tray.push(taskHtml);

  ext.click.push(function (tgt) {
    var b = tgt.closest && tgt.closest('[data-cs-task]');
    if (!b) return false;
    var a = b.getAttribute('data-cs-task');
    if (a === 'approve' || a === 'cancel') {
      var pa = task && task.awaitingPlan;
      if (pa) { task.awaitingPlan = null; pa.resolve(a === 'approve'); x.mount(); }
    } else if (a === 'revert') revertAll();
    else if (a === 'resume') { if (!interrupted && task && task.run) interrupted = task.run; resume(); }
    else if (a === 'dismiss') {
      interrupted = null;
      try { x.agentEnv().store.set(NA().RUN_KEY, ''); } catch (_) {}
      x.mount();
    }
    return true;
  });

  ext.stop.push(function () {
    if (task && task.awaitingPlan) { var pa = task.awaitingPlan; task.awaitingPlan = null; pa.resolve(false); }
  });

  w.CSChat.task = { current: function () { return task; }, interrupted: function () { return interrupted; }, resume: resume, revertAll: revertAll, verifyLine: verifyLine };
})();
