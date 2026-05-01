const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const regexPage = loadPageScript('regex/index.html', {
  elementIds: ['regexInput', 'buildBtn', 'output'],
}).context;

const nfaDfaPage = loadPageScript('nfa-dfa/index.html', {
  elementIds: ['nfaInput', 'convertBtn', 'output'],
}).context;

const dfaMinPage = loadPageScript('dfa-min/index.html', {
  elementIds: ['dfaInput', 'minBtn', 'output'],
}).context;
const AutomataCore = nfaDfaPage.ParseLabAutomataCore;
const RegexCore = regexPage.ParseLabRegexCore;

function serializeNFA(nfa) {
  return [
    `start: ${nfa.start}`,
    `accept: ${nfa.accept}`,
    ...nfa.edges.map(edge => `${edge.from} ${edge.sym} ${edge.to}`),
  ].join('\n');
}

function minimizeRegex(pattern) {
  const nfa = RegexCore.buildRegexNFA(pattern);
  const nfaText = serializeNFA(nfa);

  const parsedNfa = AutomataCore.parseNFA(nfaText);
  const dfa = AutomataCore.subsetConstruction(parsedNfa);
  const dfaText = AutomataCore.toDFAText(dfa);

  const parsedDfa = AutomataCore.parseDFA(dfaText);
  const reachableDfa = AutomataCore.removeUnreachableStates(parsedDfa);
  const completeDfa = AutomataCore.makeCompleteDFA(reachableDfa);
  const fill = AutomataCore.tableFillMinimization(completeDfa);
  const equivClasses = AutomataCore.findEquivalentClasses(fill.stateArr, fill.n, fill.marked);
  const minDfa = AutomataCore.buildMinimizedDFA(completeDfa, equivClasses);

  return { nfa, dfa, minDfa, completeDfa, fill, equivClasses };
}

function runMinDfa(minDfa, input) {
  let state = minDfa.start;
  for (const sym of input) {
    const edge = minDfa.edges.find(candidate => candidate.from === state && candidate.sym === sym);
    if (!edge) return false;
    state = edge.to;
  }
  return minDfa.accepts.has(state);
}

function cartesianWords(alphabet, maxLength) {
  const words = [''];
  let frontier = [''];

  for (let len = 1; len <= maxLength; len++) {
    const next = [];
    for (const prefix of frontier) {
      for (const sym of alphabet) next.push(prefix + sym);
    }
    words.push(...next);
    frontier = next;
  }

  return words;
}

function assertRegexLanguage(pattern, alphabet, maxLength, expectedStateCount) {
  const { nfa, dfa, minDfa, fill } = minimizeRegex(pattern);
  const jsRegex = new RegExp(`^(?:${pattern})$`);

  for (const word of cartesianWords(alphabet, maxLength)) {
    assert.equal(
      runMinDfa(minDfa, word),
      jsRegex.test(word),
      `language mismatch for pattern ${pattern} on input "${word}"`
    );
  }

  if (expectedStateCount !== undefined) {
    assert.equal(minDfa.states.size, expectedStateCount, `unexpected minimized state count for ${pattern}`);
  }

  const rerun = AutomataCore.tableFillMinimization({
    ...minDfa,
    trans: new Map(
      [...minDfa.states].map(state => [
        state,
        new Map(minDfa.edges.filter(edge => edge.from === state).map(edge => [edge.sym, edge.to])),
      ])
    ),
  });

  for (let i = 0; i < rerun.n; i++) {
    for (let j = i + 1; j < rerun.n; j++) {
      assert.ok(rerun.marked[i][j], `minimized DFA still has equivalent states for ${pattern}`);
    }
  }

  assert.ok(nfa.edges.length > 0, `empty NFA for ${pattern}`);
  assert.ok(dfa.states.length > 0, `empty DFA for ${pattern}`);
  assert.ok(fill.n > 0, `empty minimization table for ${pattern}`);
}

test('regex -> nfa-dfa -> dfa-min preserves language for (a|b)*abb', () => {
  assertRegexLanguage('(a|b)*abb', ['a', 'b'], 5, 4);
});

test('regex -> nfa-dfa -> dfa-min preserves language for a+b?c*', () => {
  assertRegexLanguage('a+b?c*', ['a', 'b', 'c'], 5, 3);
});

test('regex -> nfa-dfa -> dfa-min preserves language for (ab|cd)*', () => {
  assertRegexLanguage('(ab|cd)*', ['a', 'b', 'c', 'd'], 4, 3);
});
