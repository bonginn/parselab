const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('cyk/index.html', {
  elementIds: ['grammarInput', 'stringInput', 'parseBtn', 'output'],
});
const GrammarCore = context.ParseLabGrammarCore;

test('cyk accepts a simple CNF member string', () => {
  const grammar = `S -> A B
A -> a
B -> b`;
  const { nts, prods } = GrammarCore.parseMapGrammar(grammar);
  const result = GrammarCore.runCYK(nts, prods, ['a', 'b']);

  assert.equal(result.accepted, true);
  assert.ok(result.dp[0][2].has('S'));
});

test('cyk rejects a non-member string', () => {
  const grammar = `S -> A B
A -> a
B -> b`;
  const { nts, prods } = GrammarCore.parseMapGrammar(grammar);
  const result = GrammarCore.runCYK(nts, prods, ['a', 'a']);

  assert.equal(result.accepted, false);
});

test('cyk handles empty string with epsilon start production', () => {
  const parsed = GrammarCore.parseMapGrammar(`S ->`);
  const result = GrammarCore.runCYK(parsed.nts, parsed.prods, []);
  assert.equal(result.accepted, true);
  assert.equal(result.dp, null);
});
