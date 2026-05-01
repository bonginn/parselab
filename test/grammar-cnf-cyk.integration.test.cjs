const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const grammarPage = loadPageScript('grammar/index.html', {
  elementIds: ['grammarInput', 'doLR', 'doLF', 'transformBtn', 'exampleBtn', 'output'],
}).context;

const cnfPage = loadPageScript('cnf/index.html', {
  elementIds: ['grammarInput', 'convertBtn', 'output'],
}).context;

const cykPage = loadPageScript('cyk/index.html', {
  elementIds: ['grammarInput', 'stringInput', 'parseBtn', 'output'],
}).context;
const GrammarCore = grammarPage.ParseLabGrammarCore;

function convertToCnfFromGrammar(grammar) {
  const parsed = GrammarCore.parseTransformGrammar(grammar);
  assert.equal(parsed.errs.length, 0);

  let nts = parsed.nts;
  let prods = parsed.prods;

  const lr = GrammarCore.eliminateLeftRecursion(nts, prods);
  nts = lr.nts;
  prods = lr.prods;

  const lf = GrammarCore.leftFactor(nts, prods);
  nts = lf.nts;
  prods = lf.prods;

  let cnfNts = nts;
  let cnfProds = prods;
  for (const step of [GrammarCore.stepSTART, GrammarCore.stepDEL, GrammarCore.stepUNIT, GrammarCore.stepTERM, GrammarCore.stepBIN]) {
    const result = step(cnfNts, cnfProds);
    if (result.changed) {
      cnfNts = result.nts;
      cnfProds = result.prods;
    }
  }

  return { nts: cnfNts, prods: cnfProds };
}

test('grammar -> cnf -> cyk accepts and rejects expected strings', () => {
  const originalGrammar = `S -> a S b | a b`;

  const { nts, prods } = convertToCnfFromGrammar(originalGrammar);

  const accepted = GrammarCore.runCYK(nts, prods, ['a', 'a', 'b', 'b']);
  const rejected = GrammarCore.runCYK(nts, prods, ['a', 'b', 'b']);

  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
});
