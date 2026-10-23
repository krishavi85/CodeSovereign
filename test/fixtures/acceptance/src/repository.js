'use strict';
// Data layer — a JSON-file "database" that honours the migration schema.
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', '.data', 'tasks.json');

function ensure() {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ tasks: [], seq: 0 }));
}
function read() { ensure(); return JSON.parse(fs.readFileSync(DB, 'utf8')); }
function write(d) { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); }

async function listTasks() {
  return read().tasks;
}

async function addTask(title) {
  const d = read();
  const task = { id: ++d.seq, title, done: false, createdAt: new Date().toISOString() };
  d.tasks.push(task);
  write(d);
  return task;
}

async function reset() { ensure(); write({ tasks: [], seq: 0 }); }

module.exports = { listTasks, addTask, reset };
