const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('regex/index.html', {
  elementIds: ['regexInput', 'buildBtn', 'output'],
});
const RegexCore = context.ParseLabRegexCore;

test('regex parser rejects malformed expressions', () => {
  assert.throws(() => RegexCore.buildRegexNFA('('), /Missing closing parenthesis/);
  assert.throws(() => RegexCore.buildRegexNFA('*a'), /has nothing to quantify/);
  assert.throws(() => RegexCore.buildRegexNFA('a\\'), /Trailing backslash/);
});

test('regex parser builds NFA for escaped metacharacters', () => {
  const nfa = RegexCore.buildRegexNFA('a\\*b');
  const labels = nfa.edges.map(edge => edge.sym);

  assert.ok(labels.includes('a'));
  assert.ok(labels.includes('*'));
  assert.ok(labels.includes('b'));
});
