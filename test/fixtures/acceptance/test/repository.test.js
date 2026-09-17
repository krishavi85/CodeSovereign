'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { listTasks, addTask, reset } = require('../src/repository');

test('repository: add + list', async () => {
  await reset();
  assert.deepEqual(await listTasks(), []);
  const t = await addTask('write the report');
  assert.equal(t.title, 'write the report');
  assert.equal(t.done, false);
  const all = await listTasks();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, t.id);
  await reset();
});

test('repository: ids increment', async () => {
  await reset();
  const a = await addTask('a');
  const b = await addTask('b');
  assert.equal(b.id, a.id + 1);
  await reset();
});
