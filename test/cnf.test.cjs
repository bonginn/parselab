const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('cnf/index.html', {
  elementIds: ['grammarInput', 'convertBtn', 'output'],
});
const GrammarCore = context.ParseLabGrammarCore;

function isCNF(nts, prods) {
  const ntSet = new Set(nts);
  const start = nts[0];

  for (const [nt, productions] of prods) {
    for (const prod of productions) {
      if (prod.length === 0) {
        if (nt !== start) return false;
        continue;
      }
      if (prod.length === 1) {
        if (ntSet.has(prod[0])) return false;
        continue;
      }
      if (prod.length === 2) {
        if (!ntSet.has(prod[0]) || !ntSet.has(prod[1])) return false;
        continue;
      }
      return false;
    }
  }
  return true;
}

function toText(nts, prods) {
  return GrammarCore.grammarToText(nts, prods);
}

function convertToCNF(grammar) {
  let { nts, prods } = GrammarCore.parseMapGrammar(grammar);
  for (const step of [GrammarCore.stepSTART, GrammarCore.stepDEL, GrammarCore.stepUNIT, GrammarCore.stepTERM, GrammarCore.stepBIN]) {
    const result = step(nts, prods);
    if (result.changed) {
      nts = result.nts;
      prods = result.prods;
    }
  }
  return { nts, prods };
}

test('cnf conversion produces valid CNF for nullable grammar', () => {
  const { nts, prods } = convertToCNF(`S -> A B | ε
A -> a | ε
B -> b | ε`);

  assert.ok(isCNF(nts, prods), `not in CNF:\n${toText(nts, prods)}`);
  assert.ok((prods.get(nts[0]) || []).some(prod => prod.length === 0), 'nullable start lost ε production');
});

test('cnf conversion introduces fresh start symbol when start appears on RHS', () => {
  const parsed = GrammarCore.parseMapGrammar(`S -> A | a
A -> S | b`);
  const startStep = GrammarCore.stepSTART(parsed.nts, parsed.prods);

  assert.equal(startStep.changed, true);
  assert.notEqual(startStep.nts[0], 'S');
  assert.equal(JSON.stringify(startStep.prods.get(startStep.nts[0])), JSON.stringify([['S']]));
});

test('cnf conversion removes unit productions and long productions', () => {
  const { nts, prods } = convertToCNF(`S -> A | A B C
A -> a
B -> b
C -> c`);

  assert.ok(isCNF(nts, prods), `not in CNF:\n${toText(nts, prods)}`);

  const ntSet = new Set(nts);
  for (const [nt, productions] of prods) {
    for (const prod of productions) {
      assert.ok(!(prod.length === 1 && ntSet.has(prod[0])), `unit production survived: ${nt} -> ${prod[0]}`);
      assert.ok(prod.length <= 2, `long production survived: ${nt} -> ${prod.join(' ')}`);
    }
  }
});
