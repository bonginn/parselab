(function(global) {
  const EPS = 'ε';
  const ANY = '·';

  const lit  = c     => ({ t: 'lit',  c });
  const eps  = ()    => ({ t: 'eps' });
  const cat  = (l,r) => ({ t: 'cat',  l, r });
  const alt  = (l,r) => ({ t: 'alt',  l, r });
  const star = x     => ({ t: 'star', x });
  const plus = x     => ({ t: 'plus', x });
  const opt  = x     => ({ t: 'opt',  x });

  let nextId = 0;
  const alloc = () => nextId++;
  const resetIds = () => { nextId = 0; };

  function fromAST(node) {
    switch (node.t) {
      case 'lit': {
        const [start, accept] = [alloc(), alloc()];
        return { start, accept, edges: [{ from: start, sym: node.c, to: accept }] };
      }
      case 'eps': {
        const [start, accept] = [alloc(), alloc()];
        return { start, accept, edges: [{ from: start, sym: EPS, to: accept }] };
      }
      case 'cat': {
        const left = fromAST(node.l);
        const right = fromAST(node.r);
        const remap = state => (state === right.start ? left.accept : state);
        return {
          start: left.start,
          accept: right.accept,
          edges: [
            ...left.edges,
            ...right.edges.map(edge => ({ from: remap(edge.from), sym: edge.sym, to: remap(edge.to) })),
          ],
        };
      }
      case 'alt': {
        const start = alloc();
        const left = fromAST(node.l);
        const right = fromAST(node.r);
        const accept = alloc();
        return {
          start,
          accept,
          edges: [
            { from: start, sym: EPS, to: left.start },
            { from: start, sym: EPS, to: right.start },
            ...left.edges,
            ...right.edges,
            { from: left.accept, sym: EPS, to: accept },
            { from: right.accept, sym: EPS, to: accept },
          ],
        };
      }
      case 'star': {
        const start = alloc();
        const inner = fromAST(node.x);
        const accept = alloc();
        return {
          start,
          accept,
          edges: [
            { from: start, sym: EPS, to: inner.start },
            { from: start, sym: EPS, to: accept },
            ...inner.edges,
            { from: inner.accept, sym: EPS, to: inner.start },
            { from: inner.accept, sym: EPS, to: accept },
          ],
        };
      }
      case 'plus': {
        const inner = fromAST(node.x);
        const accept = alloc();
        return {
          start: inner.start,
          accept,
          edges: [
            ...inner.edges,
            { from: inner.accept, sym: EPS, to: inner.start },
            { from: inner.accept, sym: EPS, to: accept },
          ],
        };
      }
      case 'opt': {
        const start = alloc();
        const inner = fromAST(node.x);
        const accept = alloc();
        return {
          start,
          accept,
          edges: [
            { from: start, sym: EPS, to: inner.start },
            { from: start, sym: EPS, to: accept },
            ...inner.edges,
            { from: inner.accept, sym: EPS, to: accept },
          ],
        };
      }
      default:
        throw new Error(`Unknown AST node: ${node.t}`);
    }
  }

  function renumberNFA(nfa) {
    const { start, accept, edges } = nfa;
    const active = new Set([start, accept]);
    for (const edge of edges) {
      active.add(edge.from);
      active.add(edge.to);
    }

    const sorted = [...active].sort((a, b) => a - b);
    const acceptIdx = sorted.indexOf(accept);
    sorted.splice(acceptIdx, 1);
    sorted.push(accept);

    const map = new Map(sorted.map((state, idx) => [state, idx]));
    return {
      start: map.get(start),
      accept: map.get(accept),
      edges: edges.map(edge => ({ from: map.get(edge.from), sym: edge.sym, to: map.get(edge.to) })),
    };
  }

  function parseRegex(pattern) {
    const state = { s: pattern, i: 0 };
    const ast = parseExpr(state);
    if (state.i < state.s.length) {
      throw new Error(`Unexpected '${state.s[state.i]}' at position ${state.i + 1}`);
    }
    return ast;
  }

  function buildRegexNFA(pattern) {
    resetIds();
    const ast = parseRegex(pattern);
    return renumberNFA(fromAST(ast));
  }

  function parseExpr(state) {
    let node = parseTerm(state);
    while (state.i < state.s.length && state.s[state.i] === '|') {
      state.i++;
      node = alt(node, parseTerm(state));
    }
    return node;
  }

  function parseTerm(state) {
    const parts = [];
    while (state.i < state.s.length && state.s[state.i] !== ')' && state.s[state.i] !== '|') {
      parts.push(parseFactor(state));
    }
    return parts.length === 0 ? eps() : parts.reduce(cat);
  }

  function parseFactor(state) {
    let node = parseAtom(state);
    if (state.i < state.s.length) {
      const c = state.s[state.i];
      if (c === '*') { state.i++; node = star(node); }
      else if (c === '+') { state.i++; node = plus(node); }
      else if (c === '?') { state.i++; node = opt(node); }
    }
    return node;
  }

  function parseAtom(state) {
    if (state.i >= state.s.length) throw new Error('Unexpected end of expression');
    const c = state.s[state.i];

    if (c === '(') {
      state.i++;
      const node = parseExpr(state);
      if (state.i >= state.s.length || state.s[state.i] !== ')') throw new Error('Missing closing parenthesis');
      state.i++;
      return node;
    }
    if (c === ')') throw new Error(`Unexpected ')' at position ${state.i + 1}`);
    if (c === '*' || c === '+' || c === '?') throw new Error(`'${c}' at position ${state.i + 1} has nothing to quantify`);
    if (c === '\\') {
      state.i++;
      if (state.i >= state.s.length) throw new Error('Trailing backslash');
      return lit(state.s[state.i++]);
    }
    if (c === '.') {
      state.i++;
      return lit(ANY);
    }
    state.i++;
    return lit(c);
  }

  global.ParseLabRegexCore = {
    EPS,
    ANY,
    parseRegex,
    buildRegexNFA,
    renumberNFA,
  };
})(globalThis);
