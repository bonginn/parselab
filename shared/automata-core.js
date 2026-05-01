(function(global) {
  const EPS = 'ε';
  const DEAD = '∅';

  function parseNFA(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    let start = null;
    const accepts = new Set();
    const edges = [];
    const states = new Set();
    const errors = [];

    for (const line of lines) {
      if (/^start\s*:/i.test(line)) {
        start = line.replace(/^start\s*:\s*/i, '').trim();
        states.add(start);
        continue;
      }
      if (/^accept\s*:/i.test(line)) {
        line.replace(/^accept\s*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean)
          .forEach(state => { accepts.add(state); states.add(state); });
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 3) {
        errors.push(`Cannot parse: "${line}"`);
        continue;
      }

      const from = parts[0];
      const to = parts[parts.length - 1];
      const sym = parts.slice(1, -1).join(' ');
      const normalized = /^(ε|eps|epsilon)$/i.test(sym) ? EPS : sym;
      edges.push({ from, sym: normalized, to });
      states.add(from);
      states.add(to);
    }

    if (errors.length) throw new Error(errors.join('\n'));
    if (!start) throw new Error('Missing "start: <state>" declaration.');
    if (!accepts.size) throw new Error('Missing "accept: <state>" declaration.');
    if (!states.has(start)) throw new Error(`Start state "${start}" is not referenced in any transition.`);

    return { start, accepts, edges, states };
  }

  function epsilonClosure(stateSet, edges) {
    const closure = new Set(stateSet);
    const stack = [...stateSet];
    while (stack.length) {
      const state = stack.pop();
      for (const edge of edges) {
        if (edge.from === state && edge.sym === EPS && !closure.has(edge.to)) {
          closure.add(edge.to);
          stack.push(edge.to);
        }
      }
    }
    return closure;
  }

  function move(stateSet, sym, edges) {
    const result = new Set();
    for (const state of stateSet) {
      for (const edge of edges) {
        if (edge.from === state && edge.sym === sym) result.add(edge.to);
      }
    }
    return result;
  }

  function subsetConstruction(nfa) {
    const { start, accepts, edges } = nfa;
    const symbols = [...new Set(edges.map(edge => edge.sym).filter(sym => sym !== EPS))].sort();
    const stateKey = stateSet => [...stateSet].sort().join('\0');

    const dfaStates = [];
    const dfaMap = new Map();
    const transitions = [];

    function getOrCreate(stateSet) {
      const key = stateKey(stateSet);
      if (!dfaMap.has(key)) {
        const id = dfaStates.length;
        const isAccept = [...stateSet].some(state => accepts.has(state));
        const dfaState = { id, nfaStates: new Set(stateSet), isAccept, key };
        dfaStates.push(dfaState);
        dfaMap.set(key, dfaState);
      }
      return dfaMap.get(key);
    }

    const init = getOrCreate(epsilonClosure(new Set([start]), edges));
    const queue = [init];
    const done = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (done.has(current.key)) continue;
      done.add(current.key);

      for (const sym of symbols) {
        const moved = move(current.nfaStates, sym, edges);
        if (!moved.size) continue;
        const closed = epsilonClosure(moved, edges);
        const next = getOrCreate(closed);
        transitions.push({ from: current.id, sym, to: next.id });
        if (!done.has(next.key)) queue.push(next);
      }
    }

    return { start: init.id, states: dfaStates, transitions, symbols };
  }

  function toDFAText(dfa) {
    const { start, states, transitions } = dfa;
    const accepts = states.filter(state => state.isAccept).map(state => `D${state.id}`);
    return [
      `start: D${start}`,
      `accept: ${accepts.join(', ')}`,
      ...transitions.map(transition => `D${transition.from} ${transition.sym} D${transition.to}`)
    ].join('\n');
  }

  function parseDFA(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    let start = null;
    const accepts = new Set();
    const rawEdges = [];
    const states = new Set();
    const errors = [];

    for (const line of lines) {
      if (/^start\s*:/i.test(line)) {
        start = line.replace(/^start\s*:\s*/i, '').trim();
        states.add(start);
        continue;
      }
      if (/^accept\s*:/i.test(line)) {
        line.replace(/^accept\s*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean)
          .forEach(state => { accepts.add(state); states.add(state); });
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 3) {
        errors.push(`Cannot parse: "${line}"`);
        continue;
      }
      const from = parts[0];
      const to = parts[parts.length - 1];
      const sym = parts.slice(1, -1).join(' ');
      rawEdges.push({ from, sym, to });
      states.add(from);
      states.add(to);
    }

    if (errors.length) throw new Error(errors.join('\n'));
    if (!start) throw new Error('Missing "start: <state>" declaration.');
    if (!accepts.size) throw new Error('Missing "accept: <state>" declaration.');

    const trans = new Map();
    for (const state of states) trans.set(state, new Map());
    for (const { from, sym, to } of rawEdges) {
      if (trans.get(from).has(sym)) errors.push(`Non-deterministic transition from "${from}" on "${sym}" — DFA must be deterministic.`);
      else trans.get(from).set(sym, to);
    }
    if (errors.length) throw new Error(errors.join('\n'));

    const symbols = [...new Set(rawEdges.map(edge => edge.sym))].sort();
    return { start, accepts, states, trans, symbols };
  }

  function removeUnreachableStates(dfa) {
    const { start, trans, symbols } = dfa;
    const reachable = new Set([start]);
    const queue = [start];

    while (queue.length) {
      const state = queue.shift();
      for (const sym of symbols) {
        const next = trans.get(state)?.get(sym);
        if (next && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    return {
      ...dfa,
      states: new Set([...dfa.states].filter(state => reachable.has(state))),
      trans: new Map([...dfa.trans].filter(([state]) => reachable.has(state))),
      accepts: new Set([...dfa.accepts].filter(state => reachable.has(state))),
    };
  }

  function makeCompleteDFA(dfa) {
    const { states, trans, symbols } = dfa;
    let needed = false;
    const newTrans = new Map([...trans].map(([state, map]) => [state, new Map(map)]));

    for (const state of states) {
      if (!newTrans.has(state)) newTrans.set(state, new Map());
      for (const sym of symbols) {
        if (!newTrans.get(state).has(sym)) {
          newTrans.get(state).set(sym, DEAD);
          needed = true;
        }
      }
    }

    if (needed) {
      newTrans.set(DEAD, new Map());
      for (const sym of symbols) newTrans.get(DEAD).set(sym, DEAD);
      return { ...dfa, states: new Set([...states, DEAD]), trans: newTrans };
    }

    return dfa;
  }

  function tableFillMinimization(dfa) {
    const { states, accepts, trans, symbols } = dfa;
    const stateArr = [...states];
    const n = stateArr.length;
    const idx = new Map(stateArr.map((state, i) => [state, i]));
    const marked = Array.from({ length: n }, () => new Array(n).fill(false));
    const info = Array.from({ length: n }, () => new Array(n).fill(null));

    function isMarked(a, b) {
      if (a === b) return false;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return marked[lo][hi];
    }

    function mark(i, j, step, sym) {
      const [lo, hi] = i < j ? [i, j] : [j, i];
      if (marked[lo][hi]) return false;
      marked[lo][hi] = true;
      info[lo][hi] = { step, sym };
      return true;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (accepts.has(stateArr[i]) !== accepts.has(stateArr[j])) mark(i, j, 0, null);
      }
    }

    let changed = true;
    let step = 1;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (marked[i][j]) continue;
          for (const sym of symbols) {
            const pi = trans.get(stateArr[i])?.get(sym);
            const pj = trans.get(stateArr[j])?.get(sym);
            if (pi === pj) continue;
            let distinguishable = false;
            if (pi === undefined || pj === undefined) {
              distinguishable = accepts.has(pi ?? pj);
            } else {
              const ii = idx.get(pi);
              const jj = idx.get(pj);
              if (ii !== undefined && jj !== undefined) distinguishable = isMarked(ii, jj);
            }
            if (distinguishable) {
              changed = mark(i, j, step, sym);
              break;
            }
          }
        }
      }
      step++;
    }

    return { stateArr, n, marked, info, accepts };
  }

  function findEquivalentClasses(stateArr, n, marked) {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = x => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (x, y) => {
      const px = find(x);
      const py = find(y);
      if (px !== py) parent[px] = py;
    };

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!marked[i][j]) union(i, j);
      }
    }

    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(stateArr[i]);
    }
    return [...groups.values()];
  }

  function buildMinimizedDFA(dfa, equivClasses) {
    const { start, accepts, trans, symbols } = dfa;
    const rep = new Map();
    for (const cls of equivClasses) for (const state of cls) rep.set(state, cls[0]);

    const minStart = rep.get(start);
    const minAccepts = new Set(equivClasses.filter(cls => cls.some(state => accepts.has(state))).map(cls => cls[0]));
    const classes = equivClasses.filter(cls => cls[0] !== DEAD && !cls.every(state => state === DEAD));
    const states = new Set(classes.map(cls => cls[0]));
    const edges = [];
    const seen = new Set();

    for (const cls of classes) {
      const representative = cls[0];
      for (const sym of symbols) {
        const dest = trans.get(representative)?.get(sym);
        if (!dest || dest === DEAD) continue;
        const minDest = rep.get(dest);
        if (!minDest || minDest === DEAD) continue;
        const key = `${representative}\0${sym}\0${minDest}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ from: representative, sym, to: minDest });
        }
      }
    }

    return { start: minStart, accepts: minAccepts, states, edges, symbols, equivClasses: classes };
  }

  global.ParseLabAutomataCore = {
    EPS,
    DEAD,
    parseNFA,
    epsilonClosure,
    move,
    subsetConstruction,
    toDFAText,
    parseDFA,
    removeUnreachableStates,
    makeCompleteDFA,
    tableFillMinimization,
    findEquivalentClasses,
    buildMinimizedDFA,
  };
})(globalThis);
