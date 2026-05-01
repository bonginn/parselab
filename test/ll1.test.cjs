const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('ll1/index.html', {
  elementIds: ['input', 'startSymbol', 'results'],
});
const GrammarCore = context.ParseLabGrammarCore;

test('LL(1) table has no conflicts for arithmetic grammar', () => {
  const grammar = `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | id`;

  const parsed = GrammarCore.parseGrammar(grammar);
  const first = GrammarCore.computeFirst(parsed.productions, parsed.nonTerminals, parsed.order);
  const follow = GrammarCore.computeFollow(parsed.productions, first, parsed.nonTerminals, parsed.order, 'E');
  const table = GrammarCore.buildLL1Table(parsed.productions, first, follow, parsed.nonTerminals, parsed.order);

  assert.equal(table.E['id'].length, 1);
  assert.equal(table.E['('].length, 1);
  assert.equal(table["E'"]['+'].length, 1);
  assert.equal(table["E'"]['$'].length, 1);
  assert.equal(table["T'"]['*'].length, 1);

  let conflicts = 0;
  for (const nt of parsed.order) {
    for (const cell of Object.values(table[nt])) {
      if (cell.length > 1) conflicts++;
    }
  }

  assert.equal(conflicts, 0);
});

test('LL(1) table detects conflict for classic dangling-else grammar', () => {
  const grammar = `S -> i E t S S' | a
S' -> e S | ε
E -> b`;

  const parsed = GrammarCore.parseGrammar(grammar);
  const first = GrammarCore.computeFirst(parsed.productions, parsed.nonTerminals, parsed.order);
  const follow = GrammarCore.computeFollow(parsed.productions, first, parsed.nonTerminals, parsed.order, 'S');
  const table = GrammarCore.buildLL1Table(parsed.productions, first, follow, parsed.nonTerminals, parsed.order);

  assert.ok(table["S'"].e);
  assert.equal(table["S'"].e.length, 2);
});
