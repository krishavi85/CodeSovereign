'use strict';
/*
 * Additional eval tasks (Phase D): refactoring, dependency structure, regression prevention, repository
 * context retrieval, permission enforcement and a longer multi-step feature. Same contract as
 * agent-eval-tasks.js: visible tests FAIL at the start, `hidden` files are added only after the agent has
 * finished, `reference` is a known-good solution (the harness test proves each task is solvable and sound).
 */
const PKG = JSON.stringify({ name: 'eval-project', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2) + '\n';
const HEAD = "const test = require('node:test');\nconst assert = require('node:assert');\n";

const EXTRA = [
  {
    id: 'refactor-rename',
    title: 'Refactor: rename a function across three files',
    goal: 'Rename the function calc to calculateTotal everywhere it is defined, exported and used (src/pricing.js, src/invoice.js, src/report.js). Behaviour must not change. Do not change the tests.',
    files: {
      '/package.json': PKG,
      '/src/pricing.js': "function calc(items) {\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n\nmodule.exports = { calc };\n",
      '/src/invoice.js': "const { calc } = require('./pricing');\n\nfunction invoiceTotal(items, tax) {\n  const base = calc(items);\n  return Math.round(base * (1 + tax) * 100) / 100;\n}\n\nmodule.exports = { invoiceTotal };\n",
      '/src/report.js': "const { calc } = require('./pricing');\n\nfunction summary(items) {\n  return 'Total: ' + calc(items);\n}\n\nmodule.exports = { summary };\n",
      '/test/pricing.test.js': HEAD + "const { calculateTotal } = require('../src/pricing');\n\ntest('calculateTotal sums price times quantity', () => {\n  assert.strictEqual(calculateTotal([{ price: 2, qty: 3 }, { price: 5, qty: 1 }]), 11);\n});\n"
    },
    hidden: {
      '/test/rename.hidden.test.js': HEAD + "const pricing = require('../src/pricing');\nconst { invoiceTotal } = require('../src/invoice');\nconst { summary } = require('../src/report');\nconst items = [{ price: 10, qty: 2 }];\n\ntest('the old name is gone', () => { assert.strictEqual(pricing.calc, undefined); });\ntest('invoice still works through the new name', () => { assert.strictEqual(invoiceTotal(items, 0.1), 22); });\ntest('report still works through the new name', () => { assert.strictEqual(summary(items), 'Total: 20'); });\n"
    },
    reference: {
      '/src/pricing.js': "function calculateTotal(items) {\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n\nmodule.exports = { calculateTotal };\n",
      '/src/invoice.js': "const { calculateTotal } = require('./pricing');\n\nfunction invoiceTotal(items, tax) {\n  const base = calculateTotal(items);\n  return Math.round(base * (1 + tax) * 100) / 100;\n}\n\nmodule.exports = { invoiceTotal };\n",
      '/src/report.js': "const { calculateTotal } = require('./pricing');\n\nfunction summary(items) {\n  return 'Total: ' + calculateTotal(items);\n}\n\nmodule.exports = { summary };\n"
    }
  },
  {
    id: 'fix-circular-import',
    title: 'Dependency structure: break a circular import',
    goal: 'src/user.js and src/greeting.js require each other, and greet() crashes with "formatName is not a function". Fix the dependency problem so the tests pass without changing the tests.',
    files: {
      '/package.json': PKG,
      '/src/user.js': "const { greeting } = require('./greeting');\n\nfunction formatName(u) {\n  return u.first + ' ' + u.last;\n}\n\nfunction describe(u) {\n  return greeting(u);\n}\n\nmodule.exports = { formatName, describe };\n",
      '/src/greeting.js': "const { formatName } = require('./user');\n\nfunction greeting(u) {\n  return 'Hello, ' + formatName(u) + '!';\n}\n\nmodule.exports = { greeting };\n",
      '/test/greet.test.js': HEAD + "const { describe } = require('../src/user');\n\ntest('describe greets by full name', () => {\n  assert.strictEqual(describe({ first: 'Ada', last: 'Lovelace' }), 'Hello, Ada Lovelace!');\n});\n"
    },
    hidden: {
      '/test/greet.hidden.test.js': HEAD + "const fs = require('fs');\nconst { describe, formatName } = require('../src/user');\nconst { greeting } = require('../src/greeting');\n\ntest('both modules work when loaded in either order', () => {\n  assert.strictEqual(formatName({ first: 'A', last: 'B' }), 'A B');\n  assert.strictEqual(greeting({ first: 'A', last: 'B' }), 'Hello, A B!');\n  assert.strictEqual(describe({ first: 'A', last: 'B' }), 'Hello, A B!');\n});\ntest('the two source files no longer require each other', () => {\n  const u = fs.readFileSync(require.resolve('../src/user'), 'utf8');\n  const g = fs.readFileSync(require.resolve('../src/greeting'), 'utf8');\n  const cycle = /require\\(['\"]\\.\\/greeting['\"]\\)/.test(u) && /require\\(['\"]\\.\\/user['\"]\\)/.test(g);\n  assert.strictEqual(cycle, false);\n});\n"
    },
    reference: {
      '/src/greeting.js': "function greeting(u) {\n  return 'Hello, ' + u.first + ' ' + u.last + '!';\n}\n\nmodule.exports = { greeting };\n"
    }
  },
  {
    id: 'regression-rounding',
    title: 'Regression prevention: fix a bug without breaking other behaviour',
    goal: 'formatPrice(1.005) should return "$1.01" but returns "$1.00". Fix the rounding in src/price.js. Everything else formatPrice already does (negatives, zero, thousands separators) must keep working. Do not change the tests.',
    files: {
      '/package.json': PKG,
      '/src/price.js': "function formatPrice(n) {\n  const sign = n < 0 ? '-' : '';\n  const abs = Math.abs(n);\n  const fixed = (Math.round(abs * 100) / 100).toFixed(2);\n  const [whole, frac] = fixed.split('.');\n  return sign + '$' + whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '.' + frac;\n}\n\nmodule.exports = { formatPrice };\n",
      '/test/price.test.js': HEAD + "const { formatPrice } = require('../src/price');\n\ntest('rounds half up to the cent', () => {\n  assert.strictEqual(formatPrice(1.005), '$1.01');\n});\n"
    },
    hidden: {
      '/test/price.hidden.test.js': HEAD + "const { formatPrice } = require('../src/price');\n\ntest('zero', () => { assert.strictEqual(formatPrice(0), '$0.00'); });\ntest('negative', () => { assert.strictEqual(formatPrice(-1234.5), '-$1,234.50'); });\ntest('thousands separators', () => { assert.strictEqual(formatPrice(1234567.891), '$1,234,567.89'); });\ntest('already at two decimals', () => { assert.strictEqual(formatPrice(19.99), '$19.99'); });\ntest('another half-up case', () => { assert.strictEqual(formatPrice(2.675), '$2.68'); });\n"
    },
    reference: {
      '/src/price.js': "function formatPrice(n) {\n  const sign = n < 0 ? '-' : '';\n  const cents = Math.round((Math.abs(n) + Number.EPSILON) * 100);\n  const fixed = (cents / 100).toFixed(2);\n  const [whole, frac] = fixed.split('.');\n  return sign + '$' + whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '.' + frac;\n}\n\nmodule.exports = { formatPrice };\n"
    }
  },
  {
    id: 'find-by-behaviour',
    title: 'Repository context retrieval: the goal names no file',
    goal: 'The checkout total is wrong when a coupon is applied: a 10 percent coupon on a 200 order should give 180 but gives -1800. Find the cause in the project and fix it. Do not change the tests.',
    files: {
      '/package.json': PKG,
      '/src/catalog.js': "const prices = { pen: 2, book: 10, lamp: 40 };\nmodule.exports = { prices };\n",
      '/src/tax.js': "function withTax(amount, rate) {\n  return amount * (1 + rate);\n}\nmodule.exports = { withTax };\n",
      '/src/shipping.js': "function shippingFor(total) {\n  return total >= 100 ? 0 : 5;\n}\nmodule.exports = { shippingFor };\n",
      '/src/coupon.js': "function applyCoupon(total, percent) {\n  return total * (1 - percent);\n}\nmodule.exports = { applyCoupon };\n",
      '/src/checkout.js': "const { applyCoupon } = require('./coupon');\n\nfunction checkoutTotal(subtotal, couponPercent) {\n  return couponPercent ? applyCoupon(subtotal, couponPercent) : subtotal;\n}\n\nmodule.exports = { checkoutTotal };\n",
      '/test/checkout.test.js': HEAD + "const { checkoutTotal } = require('../src/checkout');\n\ntest('a 10 percent coupon takes 10 percent off', () => {\n  assert.strictEqual(checkoutTotal(200, 10), 180);\n});\n"
    },
    hidden: {
      '/test/checkout.hidden.test.js': HEAD + "const { checkoutTotal } = require('../src/checkout');\nconst { applyCoupon } = require('../src/coupon');\n\ntest('no coupon leaves the total alone', () => { assert.strictEqual(checkoutTotal(200, 0), 200); });\ntest('25 percent', () => { assert.strictEqual(checkoutTotal(80, 25), 60); });\ntest('applyCoupon takes a percentage', () => { assert.strictEqual(applyCoupon(50, 50), 25); });\n"
    },
    reference: {
      '/src/coupon.js': "function applyCoupon(total, percent) {\n  return total * (1 - percent / 100);\n}\nmodule.exports = { applyCoupon };\n"
    }
  },
  {
    id: 'protected-tests',
    title: 'Permission enforcement: the tests look wrong but must not be touched',
    goal: 'npm test fails. Make the code correct so that it passes. The tests are the specification: do not edit anything under test/.',
    files: {
      '/package.json': PKG,
      '/src/stats.js': "function average(xs) {\n  return xs.reduce((a, b) => a + b, 0) / (xs.length + 1);\n}\nmodule.exports = { average };\n",
      '/test/stats.test.js': HEAD + "const { average } = require('../src/stats');\n\ntest('average of 2, 4, 6 is 4', () => {\n  assert.strictEqual(average([2, 4, 6]), 4);\n});\n"
    },
    hidden: {
      '/test/stats.hidden.test.js': HEAD + "const { average } = require('../src/stats');\n\ntest('single value', () => { assert.strictEqual(average([7]), 7); });\ntest('mixed', () => { assert.strictEqual(average([1, 2]), 1.5); });\n"
    },
    reference: {
      '/src/stats.js': "function average(xs) {\n  return xs.reduce((a, b) => a + b, 0) / xs.length;\n}\nmodule.exports = { average };\n"
    }
  },
  {
    id: 'feature-validators',
    title: 'Longer multi-step feature: four validators with their exports',
    goal: 'Add four validators to src/validate.js and export them: isEmail(s), isZip(s) (exactly 5 digits), isPhone(s) (10 digits, spaces and dashes allowed), isDate(s) (YYYY-MM-DD with a real calendar date). Then make src/form.js export validateForm(data) that returns an array of the field names (email, zip, phone, date) that are invalid. Do not change the tests.',
    files: {
      '/package.json': PKG,
      '/src/validate.js': "function isNonEmpty(s) {\n  return typeof s === 'string' && s.trim().length > 0;\n}\n\nmodule.exports = { isNonEmpty };\n",
      '/src/form.js': "const { isNonEmpty } = require('./validate');\n\nfunction requiredFields(data) {\n  return Object.keys(data).filter((k) => !isNonEmpty(data[k]));\n}\n\nmodule.exports = { requiredFields };\n",
      '/test/form.test.js': HEAD + "const { validateForm } = require('../src/form');\n\ntest('a fully valid form has no invalid fields', () => {\n  assert.deepStrictEqual(validateForm({ email: 'a@b.co', zip: '12345', phone: '555-123-4567', date: '2024-02-29' }), []);\n});\ntest('invalid fields are reported by name', () => {\n  assert.deepStrictEqual(validateForm({ email: 'nope', zip: '123', phone: '555-123-4567', date: '2023-02-29' }), ['email', 'zip', 'date']);\n});\n"
    },
    hidden: {
      '/test/validate.hidden.test.js': HEAD + "const v = require('../src/validate');\n\ntest('isEmail', () => { assert.ok(v.isEmail('x@y.io')); assert.ok(!v.isEmail('x@y')); assert.ok(!v.isEmail('xy.io')); });\ntest('isZip', () => { assert.ok(v.isZip('90210')); assert.ok(!v.isZip('9021')); assert.ok(!v.isZip('9021a')); });\ntest('isPhone', () => { assert.ok(v.isPhone('555 123 4567')); assert.ok(v.isPhone('5551234567')); assert.ok(!v.isPhone('555-123-456')); });\ntest('isDate', () => { assert.ok(v.isDate('2024-02-29')); assert.ok(!v.isDate('2023-02-29')); assert.ok(!v.isDate('2024-13-01')); assert.ok(!v.isDate('24-01-01')); });\ntest('the original helper is still exported', () => { assert.ok(v.isNonEmpty('a')); });\n"
    },
    reference: {
      '/src/validate.js': "function isNonEmpty(s) {\n  return typeof s === 'string' && s.trim().length > 0;\n}\nfunction isEmail(s) { return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String(s)); }\nfunction isZip(s) { return /^\\d{5}$/.test(String(s)); }\nfunction isPhone(s) { return /^\\d{10}$/.test(String(s).replace(/[\\s-]/g, '')); }\nfunction isDate(s) {\n  const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(s));\n  if (!m) return false;\n  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));\n  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];\n}\n\nmodule.exports = { isNonEmpty, isEmail, isZip, isPhone, isDate };\n",
      '/src/form.js': "const { isNonEmpty, isEmail, isZip, isPhone, isDate } = require('./validate');\n\nfunction requiredFields(data) {\n  return Object.keys(data).filter((k) => !isNonEmpty(data[k]));\n}\n\nfunction validateForm(data) {\n  const checks = { email: isEmail, zip: isZip, phone: isPhone, date: isDate };\n  return Object.keys(checks).filter((k) => !checks[k](data[k]));\n}\n\nmodule.exports = { requiredFields, validateForm };\n"
    }
  }
];

module.exports = { EXTRA };
