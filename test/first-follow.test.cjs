const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('first-follow/index.html', {
  elementIds: ['input', 'startSymbol', 'results'],
});
const GrammarCore = context.ParseLabGrammarCore;

test('FIRST/FOLLOW computes standard arithmetic grammar sets', () => {
  const grammar = `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | id`;

  const parsed = GrammarCore.parseGrammar(grammar);
  const first = GrammarCore.computeFirst(parsed.productions, parsed.nonTerminals, parsed.order);
  const follow = GrammarCore.computeFollow(parsed.productions, first, parsed.nonTerminals, parsed.order, 'E');

  assert.deepEqual([...first.E].sort(), ['(', 'id']);
  assert.deepEqual([...first["E'"]].sort(), ['+', 'ε']);
  assert.deepEqual([...first.T].sort(), ['(', 'id']);
  assert.deepEqual([...follow.E].sort(), ['$', ')']);
  assert.deepEqual([...follow.T].sort(), ['$', ')', '+']);
  assert.deepEqual([...follow.F].sort(), ['$', ')', '*', '+']);
});

test('FIRST/FOLLOW parser rejects invalid left-hand side symbols', () => {
  assert.throws(
    () => GrammarCore.parseGrammar('Expr List -> id'),
    /LHS must be a single symbol/
  );
});
