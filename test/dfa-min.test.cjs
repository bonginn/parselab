const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPageScript } = require('./helpers/load-page-script.cjs');

const { context } = loadPageScript('dfa-min/index.html', {
  elementIds: ['dfaInput', 'minBtn', 'output'],
});
const AutomataCore = context.ParseLabAutomataCore;

function runDfaLike(machine, input) {
  let state = machine.start;
  for (const sym of input) {
    const next = machine.trans
      ? machine.trans.get(state)?.get(sym)
      : machine.edges.find(edge => edge.from === state && edge.sym === sym)?.to;
    if (!next) return false;
    state = next;
  }
  return machine.accepts.has(state);
}

test('dfa minimization preserves language and removes unreachable states', () => {
  const text = `start: A
accept: C, D
A a B
A b E
B a C
B b F
C a G
C b A
D a E
D b H
E a H
E b E
F a F
F b G
G a G
G b G
H a G
H b C
Z a Z
Z b Z`;

  const parsed = AutomataCore.parseDFA(text);
  const reachable = AutomataCore.removeUnreachableStates(parsed);
  assert.ok(!reachable.states.has('Z'), 'unreachable state was not removed');

  const complete = AutomataCore.makeCompleteDFA(reachable);
  const fill = AutomataCore.tableFillMinimization(complete);
  const classes = AutomataCore.findEquivalentClasses(fill.stateArr, fill.n, fill.marked);
  const minDfa = AutomataCore.buildMinimizedDFA(complete, classes);

  assert.ok(minDfa.states.size < reachable.states.size);

  const samples = ['', 'a', 'b', 'aa', 'ab', 'ba', 'bbb', 'abba'];
  for (const sample of samples) {
    assert.equal(
      runDfaLike(complete, sample),
      runDfaLike(minDfa, sample),
      `language mismatch on "${sample}"`
    );
  }
});

test('dfa parser rejects nondeterministic transitions', () => {
  assert.throws(
    () => AutomataCore.parseDFA(`start: A
accept: B
A a B
A a C`),
    /Non-deterministic transition/
  );
});

test('makeComplete adds explicit dead state when needed', () => {
  const dfa = AutomataCore.parseDFA(`start: A
accept: B
A a B
B a B
A b A`);
  const complete = AutomataCore.makeCompleteDFA(dfa);

  assert.ok(complete.states.has('∅'));
  assert.equal(complete.trans.get('A').get('a'), 'B');
  assert.equal(complete.trans.get('B').get('a'), 'B');
  assert.equal(complete.trans.get('B').get('b'), AutomataCore.DEAD);
});
