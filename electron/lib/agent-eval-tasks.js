'use strict';
/*
 * Eval tasks for the native agent. Each is a small real project whose visible
 * tests FAIL at the start. `hidden` files are added only after the agent has
 * finished, so passing the visible tests is not enough to count as success.
 * `reference` is a known-good solution used to prove the task is solvable and
 * the judge is sound (see test/native-agent-eval-harness.test.js).
 */
const PKG = JSON.stringify({ name: 'eval-project', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2) + '\n';

const TASKS = [
  {
    id: 'bugfix-range',
    title: 'Fix an off-by-one bug',
    goal: 'The range(start, end) function in src/range.js should include the end value (range(1, 3) is [1, 2, 3]). It currently leaves it out. Fix it so the tests pass.',
    files: {
      '/package.json': PKG,
      '/src/range.js': "function range(start, end) {\n  const out = [];\n  for (let i = start; i < end; i++) out.push(i);\n  return out;\n}\n\nmodule.exports = { range };\n",
      '/test/range.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { range } = require('../src/range');\n\ntest('includes the end', () => assert.deepStrictEqual(range(1, 3), [1, 2, 3]));\ntest('single value', () => assert.deepStrictEqual(range(5, 5), [5]));\n"
    },
    hidden: {
      '/test/range.hidden.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { range } = require('../src/range');\n\ntest('negative numbers', () => assert.deepStrictEqual(range(-2, 1), [-2, -1, 0, 1]));\ntest('empty when start is after end', () => assert.deepStrictEqual(range(3, 1), []));\n"
    },
    reference: { '/src/range.js': "function range(start, end) {\n  const out = [];\n  for (let i = start; i <= end; i++) out.push(i);\n  return out;\n}\n\nmodule.exports = { range };\n" }
  },
  {
    id: 'feature-slugify',
    title: 'Add a function and use it from another file',
    goal: 'Add a slugify(text) function to src/text.js and export it: it lowercases the text, trims it, and replaces each run of non-alphanumeric characters with a single hyphen (no leading or trailing hyphens), so slugify("  Hello, World! ") is "hello-world". Then make makeUrl(title) in src/format.js return "/posts/" followed by the slug of the title. The tests in test/ must pass.',
    files: {
      '/package.json': PKG,
      '/src/text.js': "function capitalize(s) {\n  return s.charAt(0).toUpperCase() + s.slice(1);\n}\n\nmodule.exports = { capitalize };\n",
      '/src/format.js': "const { capitalize } = require('./text');\n\nfunction heading(title) {\n  return capitalize(title);\n}\n\nfunction makeUrl(title) {\n  return '/posts/' + title;\n}\n\nmodule.exports = { heading, makeUrl };\n",
      '/test/format.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { makeUrl, heading } = require('../src/format');\n\ntest('makeUrl slugifies the title', () => assert.strictEqual(makeUrl('Hello World'), '/posts/hello-world'));\ntest('heading capitalises', () => assert.strictEqual(heading('intro'), 'Intro'));\n"
    },
    hidden: {
      '/test/text.hidden.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { slugify } = require('../src/text');\n\ntest('trims and collapses', () => assert.strictEqual(slugify('  Hello,   World! '), 'hello-world'));\ntest('keeps digits', () => assert.strictEqual(slugify('Top 10 Tips'), 'top-10-tips'));\ntest('no edge hyphens', () => assert.strictEqual(slugify('--a--'), 'a'));\n"
    },
    reference: {
      '/src/text.js': "function capitalize(s) {\n  return s.charAt(0).toUpperCase() + s.slice(1);\n}\n\nfunction slugify(text) {\n  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n\nmodule.exports = { capitalize, slugify };\n",
      '/src/format.js': "const { capitalize, slugify } = require('./text');\n\nfunction heading(title) {\n  return capitalize(title);\n}\n\nfunction makeUrl(title) {\n  return '/posts/' + slugify(title);\n}\n\nmodule.exports = { heading, makeUrl };\n"
    }
  },
  {
    id: 'bugfix-crossfile',
    title: 'Find a bug that spans two files',
    goal: 'cartTotal() in src/cart.js returns NaN for the items in src/catalog.js. Find the cause and fix it so the tests pass. Do not change the tests.',
    files: {
      '/package.json': PKG,
      '/src/catalog.js': "const items = [\n  { name: 'pen', price: 2, quantity: 3 },\n  { name: 'book', price: 10, quantity: 1 }\n];\n\nmodule.exports = { items };\n",
      '/src/cart.js': "function cartTotal(items) {\n  let total = 0;\n  for (const item of items) total += item.price * item.qty;\n  return total;\n}\n\nmodule.exports = { cartTotal };\n",
      '/test/cart.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { cartTotal } = require('../src/cart');\nconst { items } = require('../src/catalog');\n\ntest('totals the catalog', () => assert.strictEqual(cartTotal(items), 16));\ntest('empty cart', () => assert.strictEqual(cartTotal([]), 0));\n"
    },
    hidden: {
      '/test/cart.hidden.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { cartTotal } = require('../src/cart');\n\ntest('uses quantity', () => assert.strictEqual(cartTotal([{ price: 5, quantity: 2 }]), 10));\n"
    },
    reference: { '/src/cart.js': "function cartTotal(items) {\n  let total = 0;\n  for (const item of items) total += item.price * item.quantity;\n  return total;\n}\n\nmodule.exports = { cartTotal };\n" }
  }
];

// refactoring, dependency structure, regression prevention, context retrieval, permissions, a longer feature
TASKS.push(...require('./agent-eval-tasks-extra').EXTRA);

module.exports = { TASKS, byId: (id) => TASKS.filter((t) => t.id === id)[0] };
