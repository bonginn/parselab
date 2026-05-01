const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('grammar/index.html', {
  elementIds: ['grammarInput', 'doLR', 'doLF', 'transformBtn', 'exampleBtn', 'output'],
});
const GrammarCore = context.ParseLabGrammarCore;

function prodSet(prods, nt) {
  return new Set((prods.get(nt) || []).map(prod => prod.join(' ')));
}

test('grammar transformer eliminates direct and indirect left recursion', () => {
  const grammar = `S -> A a | b
A -> S c | d`;

  const parsed = GrammarCore.parseTransformGrammar(grammar);
  assert.equal(parsed.errs.length, 0);

  const transformed = GrammarCore.eliminateLeftRecursion(parsed.nts, parsed.prods);

  for (const nt of transformed.nts) {
    for (const prod of transformed.prods.get(nt) || []) {
      assert.notEqual(prod[0], nt, `left recursion remained on ${nt} -> ${prod.join(' ')}`);
    }
  }

  assert.ok(transformed.steps.length > 0);
});

test('grammar transformer left factors common prefixes', () => {
  const grammar = `S -> i E t S | i E t S e S | a
E -> b`;

  const parsed = GrammarCore.parseTransformGrammar(grammar);
  assert.equal(parsed.errs.length, 0);

  const factored = GrammarCore.leftFactor(parsed.nts, parsed.prods);

  assert.ok(factored.steps.length > 0);
  const sRules = [...prodSet(factored.prods, 'S')];
  assert.ok(sRules.some(rule => rule.startsWith('i E t S ')), 'factored S production missing shared prefix');
});

test('grammar parser reports malformed productions', () => {
  const parsed = GrammarCore.parseTransformGrammar('S A B');
  assert.ok(parsed.errs.some(err => /Cannot parse/.test(err)));
});
