'use strict';
/* Contract entity extraction (engine.contract.js entitiesFromPrompt) decides
 * what every build stage is told to build. Confirmed live: for "build a todo
 * list app with projects, due dates, and comments" the contract had entities
 * [project, comment] — NO todo — so the generated apps had project/comment
 * endpoints and no todo items at all. "build a todo app" got the generic
 * placeholder `item`, and "manage recipes and ingredients" lost `ingredient`.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    document: { createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    fetch: async () => { throw new Error('network blocked'); }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['vendor/acorn.js', 'engine.js', 'engine.contract.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  }
  win.Engine.Proj.create('entities', 'saas-dashboard');
  return win;
}

module.exports = async function (t) {
  const win = load();
  const derive = (p) => win.Engine.Contract.deriveFromPrompt(p, { useLLM: false });
  const names = (c) => (c.entities || []).map((e) => e.name);

  const live = await derive('build a todo list app with projects, due dates, and comments');
  t.ok('the live prompt now has a todo entity (it had none)', names(live).includes('todo'));
  t.ok('and keeps project and comment', names(live).includes('project') && names(live).includes('comment'));
  const todo = live.entities.find((e) => e.name === 'todo');
  t.ok('a todo is a work item: title + done', todo.fields.some((f) => f.name === 'title') && todo.fields.some((f) => f.name === 'done'));
  t.ok('"due dates" became a dueDate FIELD on the todo', todo.fields.some((f) => f.name === 'dueDate' && f.type === 'timestamp'));
  t.ok('"dates" did not become a bogus entity', !names(live).includes('date'));
  t.ok('projects do not wrongly belong to todos', !live.entities.find((e) => e.name === 'project').fields.some((f) => f.name === 'todoId'));

  t.equal('"build a todo app" yields todo, not the generic `item`', names(await derive('build a todo app')).join(','), 'todo');
  t.ok('"to-do" is recognised too', names(await derive('a simple to-do list')).includes('todo'));
  t.ok('"things to do" is not a todo entity', !names(await derive('a travel guide app with things to do in each city')).includes('todo'));

  const recipes = names(await derive('an app to manage recipes and ingredients'));
  t.ok('a coordinated list after "manage" keeps every noun (recipe AND ingredient)', recipes.includes('recipe') && recipes.includes('ingredient'));
  const orders = names(await derive('a tool to track orders, payments and refunds'));
  t.ok('a three-item list is fully captured', orders.includes('order') && orders.includes('payment') && orders.includes('refund'));

  // regressions other suites rely on
  t.equal('a task tracker still yields task', names(await derive('a task tracker with tags')).join(','), 'task');
  const pm = names(await derive('Build a project management tool with tasks, projects, and comments, with user accounts and admin roles'));
  t.ok('the project-management prompt still yields project, task, comment', ['project', 'task', 'comment'].every((n) => pm.includes(n)));
  const noDue = (await derive('a task tracker with tags')).entities.find((e) => e.name === 'task');
  t.ok('no dueDate field when the prompt never mentions one', !noDue.fields.some((f) => f.name === 'dueDate'));
};
