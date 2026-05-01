(function(global) {
  const EPS = 'ε';
  const END = '$';

  function parseGrammar(text) {
    const productions = [];
    const order = [];
    const lhsSet = new Set();
    const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

    if (!lines.length) throw new Error('Empty grammar');

    for (const line of lines) {
      const match = line.match(/^(.+?)\s*(?:->|→|::=)\s*(.*)$/);
      if (!match) throw new Error(`Missing "->" in: ${line}`);

      const lhs = match[1].trim();
      if (!lhs) throw new Error(`Empty LHS in: ${line}`);
      if (lhs.includes(' ')) throw new Error(`LHS must be a single symbol: ${lhs}`);

      if (!lhsSet.has(lhs)) {
        lhsSet.add(lhs);
        order.push(lhs);
      }

      for (const alt of match[2].split('|')) {
        const tokens = alt.trim().split(/\s+/).filter(Boolean);
        const rhs = !tokens.length || tokens.every(token => /^(ε|eps|epsilon)$/i.test(token))
          ? []
          : tokens.filter(token => !/^(ε|eps|epsilon)$/i.test(token));
        productions.push({ lhs, rhs });
      }
    }

    const nonTerminals = new Set(order);
    const terminals = new Set();
    for (const production of productions) {
      for (const symbol of production.rhs) {
        if (!nonTerminals.has(symbol)) terminals.add(symbol);
      }
    }

    return { productions, order, nonTerminals, terminals };
  }

  function prodToStr(prod) {
    return prod.length ? prod.join(' ') : EPS;
  }

  function cloneGrammarMap(prods) {
    const cloned = new Map();
    for (const [nt, productions] of prods) cloned.set(nt, productions.map(prod => [...prod]));
    return cloned;
  }

  function freshNT(base, all) {
    let name = base + "'";
    while (all.has(name)) name += "'";
    return name;
  }

  function freshIndexedNT(base, all) {
    let i = 1;
    let name = `${base}_${i}`;
    while (all.has(name)) name = `${base}_${++i}`;
    return name;
  }

  function grammarToText(nts, prods) {
    return nts
      .map(nt => {
        const productions = prods.get(nt);
        return productions ? `${nt} -> ${productions.map(prodToStr).join(' | ')}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  function parseMapGrammar(text, options = {}) {
    const {
      allowSlashComments = false,
      strictSingleLhs = true,
      requireNonEmptyRhs = false,
    } = options;

    const nts = [];
    const prods = new Map();
    const errors = [];

    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !(allowSlashComments && line.startsWith('//')));

    if (!lines.length) throw new Error(options.emptyMessage || 'Empty grammar');

    for (const line of lines) {
      const match = line.match(/^(.+?)\s*(?:->|→)\s*(.*)$/);
      if (!match) {
        errors.push(`Cannot parse: "${line}"`);
        continue;
      }

      const lhs = match[1].trim();
      const rhsText = match[2].trim();

      if (!lhs) {
        errors.push(`Empty LHS in: "${line}"`);
        continue;
      }
      if (strictSingleLhs && lhs.includes(' ')) {
        errors.push(`Invalid LHS: "${lhs}"`);
        continue;
      }
      if (requireNonEmptyRhs && !rhsText) {
        errors.push(`Empty RHS in: "${line}"`);
        continue;
      }

      if (!prods.has(lhs)) {
        nts.push(lhs);
        prods.set(lhs, []);
      }

      for (const alt of match[2].split('|')) {
        const tokens = alt.trim().split(/\s+/).filter(Boolean);
        if (requireNonEmptyRhs && !tokens.length) {
          errors.push(`Empty alt in: "${line}"`);
          continue;
        }
        const rhs = !tokens.length || tokens.every(token => /^(ε|eps|epsilon)$/i.test(token))
          ? []
          : tokens.map(token => (/^(ε|eps|epsilon)$/i.test(token) ? EPS : token));
        prods.get(lhs).push(rhs);
      }
    }

    if (errors.length) throw new Error(errors.join('\n'));
    return { nts, prods };
  }

  function parseTransformGrammar(text) {
    const nts = [];
    const prods = new Map();
    const errs = [];
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));

    for (const line of lines) {
      let lhs;
      let rhs;
      const arrow = line.indexOf('->');
      if (arrow !== -1) {
        lhs = line.slice(0, arrow).trim();
        rhs = line.slice(arrow + 2).trim();
      } else {
        const uniArrow = line.indexOf('→');
        if (uniArrow !== -1) {
          lhs = line.slice(0, uniArrow).trim();
          rhs = line.slice(uniArrow + 1).trim();
        } else {
          errs.push(`Cannot parse: "${line}"`);
          continue;
        }
      }

      if (!lhs) {
        errs.push(`Empty LHS in: "${line}"`);
        continue;
      }
      if (!rhs) {
        errs.push(`Empty RHS in: "${line}"`);
        continue;
      }

      if (!prods.has(lhs)) {
        nts.push(lhs);
        prods.set(lhs, []);
      }

      for (const alt of rhs.split('|')) {
        const tokens = alt.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) {
          errs.push(`Empty alt in: "${line}"`);
          continue;
        }
        prods.get(lhs).push(tokens.map(token => (/^(eps|epsilon|ε)$/i.test(token) ? EPS : token)));
      }
    }

    return { nts, prods, errs };
  }

  function firstOfSequence(seq, first, nonTerminals) {
    const result = new Set();
    if (!seq.length) {
      result.add(EPS);
      return result;
    }

    let allNullable = true;
    for (const symbol of seq) {
      if (!nonTerminals.has(symbol)) {
        result.add(symbol);
        allNullable = false;
        break;
      }

      const symbolFirst = first[symbol] || new Set();
      for (const entry of symbolFirst) if (entry !== EPS) result.add(entry);
      if (!symbolFirst.has(EPS)) {
        allNullable = false;
        break;
      }
    }

    if (allNullable) result.add(EPS);
    return result;
  }

  function computeFirst(productions, nonTerminals, order) {
    const first = {};
    for (const nt of order) first[nt] = new Set();

    let changed = true;
    while (changed) {
      changed = false;
      for (const { lhs, rhs } of productions) {
        for (const entry of firstOfSequence(rhs, first, nonTerminals)) {
          if (!first[lhs].has(entry)) {
            first[lhs].add(entry);
            changed = true;
          }
        }
      }
    }

    return first;
  }

  function computeFollow(productions, first, nonTerminals, order, start) {
    const follow = {};
    for (const nt of order) follow[nt] = new Set();
    follow[start].add(END);

    let changed = true;
    while (changed) {
      changed = false;
      for (const { lhs, rhs } of productions) {
        for (let i = 0; i < rhs.length; i++) {
          const current = rhs[i];
          if (!nonTerminals.has(current)) continue;

          const tailFirst = firstOfSequence(rhs.slice(i + 1), first, nonTerminals);
          for (const entry of tailFirst) {
            if (entry !== EPS && !follow[current].has(entry)) {
              follow[current].add(entry);
              changed = true;
            }
          }

          if (tailFirst.has(EPS)) {
            for (const entry of follow[lhs]) {
              if (!follow[current].has(entry)) {
                follow[current].add(entry);
                changed = true;
              }
            }
          }
        }
      }
    }

    return follow;
  }

  function buildLL1Table(productions, first, follow, nonTerminals, order) {
    const table = {};
    const nts = order || [...nonTerminals];
    for (const nt of nts) table[nt] = {};

    for (const production of productions) {
      const firstAlpha = firstOfSequence(production.rhs, first, nonTerminals);
      for (const terminal of firstAlpha) {
        if (terminal === EPS) continue;
        if (!table[production.lhs][terminal]) table[production.lhs][terminal] = [];
        table[production.lhs][terminal].push(production);
      }

      if (firstAlpha.has(EPS)) {
        for (const terminal of follow[production.lhs]) {
          if (!table[production.lhs][terminal]) table[production.lhs][terminal] = [];
          table[production.lhs][terminal].push(production);
        }
      }
    }

    return table;
  }

  function eliminateLeftRecursion(nts, prods) {
    const steps = [];
    const result = cloneGrammarMap(prods);
    const all = new Set([...result.keys()]);
    const order = [...nts];

    for (let i = 0; i < nts.length; i++) {
      const Ai = nts[i];
      for (let j = 0; j < i; j++) {
        const Aj = nts[j];
        const nextProductions = [];
        for (const prod of result.get(Ai)) {
          if (prod[0] === Aj) {
            for (const derived of result.get(Aj)) {
              const tail = prod.slice(1);
              nextProductions.push(derived[0] === EPS ? (tail.length ? [...tail] : [EPS]) : [...derived, ...tail]);
            }
          } else {
            nextProductions.push([...prod]);
          }
        }
        result.set(Ai, nextProductions);
      }

      const recursive = result.get(Ai).filter(prod => prod[0] === Ai);
      const nonRecursive = result.get(Ai).filter(prod => prod[0] !== Ai);
      if (!recursive.length) continue;

      const newNT = freshNT(Ai, all);
      all.add(newNT);
      order.push(newNT);

      const before = result.get(Ai).map(prodToStr);
      const newAi = nonRecursive.map(prod => (prod.length === 1 && prod[0] === EPS ? [newNT] : [...prod, newNT]));
      const newAux = [
        ...recursive.map(prod => {
          const tail = prod.slice(1);
          return tail.length ? [...tail, newNT] : [newNT];
        }),
        [EPS],
      ];

      result.set(Ai, newAi);
      result.set(newNT, newAux);
      steps.push({ nt: Ai, newNT, before, afterMain: newAi.map(prodToStr), afterNew: newAux.map(prodToStr) });
    }

    return { nts: order, prods: result, steps };
  }

  function findLCP(prods) {
    let len = 0;
    const min = Math.min(...prods.map(prod => prod.length));
    while (len < min && prods.every(prod => prod[len] === prods[0][len])) len++;
    return prods[0].slice(0, len);
  }

  function findFactor(prods) {
    const byFirst = new Map();
    for (const prod of prods) {
      if (prod[0] === EPS) continue;
      if (!byFirst.has(prod[0])) byFirst.set(prod[0], []);
      byFirst.get(prod[0]).push(prod);
    }
    for (const group of byFirst.values()) {
      if (group.length < 2) continue;
      const prefix = findLCP(group);
      if (!prefix.length) continue;
      return { prefix, matching: group, others: prods.filter(prod => !group.includes(prod)) };
    }
    return null;
  }

  function leftFactor(nts, prods) {
    const steps = [];
    const result = cloneGrammarMap(prods);
    const all = new Set([...result.keys()]);
    const order = [...nts];
    let changed = true;
    let guard = 0;

    while (changed && guard++ < 200) {
      changed = false;
      for (const nt of [...order]) {
        const prodsForNt = result.get(nt);
        if (!prodsForNt) continue;
        const factor = findFactor(prodsForNt);
        if (!factor) continue;

        const { prefix, matching, others } = factor;
        const newNT = freshNT(nt, all);
        all.add(newNT);
        order.push(newNT);

        const before = prodsForNt.map(prodToStr);
        const remainders = matching.map(prod => {
          const rest = prod.slice(prefix.length);
          return rest.length ? rest : [EPS];
        });
        const next = [...others, [...prefix, newNT]];

        result.set(nt, next);
        result.set(newNT, remainders);
        steps.push({
          nt,
          newNT,
          prefix: prefix.join(' '),
          before,
          afterMain: next.map(prodToStr),
          afterNew: remainders.map(prodToStr),
        });
        changed = true;
        break;
      }
    }

    return { nts: order, prods: result, steps };
  }

  function isEps(prod) {
    return prod.length === 0;
  }

  function isUnit(prod, ntSet) {
    return prod.length === 1 && ntSet.has(prod[0]);
  }

  function stepSTART(nts, prods) {
    const start = nts[0];
    const appearsOnRHS = [...prods.values()].some(productions => productions.some(prod => prod.includes(start)));
    if (!appearsOnRHS) return { nts, prods, changed: false };

    const all = new Set(nts);
    let newStart = start + '0';
    while (all.has(newStart)) newStart += '0';

    const newProds = cloneGrammarMap(prods);
    newProds.set(newStart, [[start]]);

    return { nts: [newStart, ...nts], prods: newProds, changed: true, added: [`${newStart} → ${start}`] };
  }

  function findNullable(prods, ntSet) {
    const nullable = new Set();
    for (const [nt, productions] of prods) if (productions.some(isEps)) nullable.add(nt);

    let changed = true;
    while (changed) {
      changed = false;
      for (const [nt, productions] of prods) {
        if (nullable.has(nt)) continue;
        if (productions.some(prod => prod.length > 0 && prod.every(sym => nullable.has(sym)))) {
          nullable.add(nt);
          changed = true;
        }
      }
    }

    return nullable;
  }

  function stepDEL(nts, prods) {
    const ntSet = new Set(nts);
    const nullable = findNullable(prods, ntSet);
    const start = nts[0];
    const hasEps = [...prods.values()].some(productions => productions.some(isEps));
    if (!hasEps) return { nts, prods, changed: false };

    const removedEps = [];
    const addedRules = [];
    const newProds = new Map();

    for (const [nt, productions] of prods) {
      const seen = new Set();
      const nextProductions = [];

      for (const prod of productions) {
        if (isEps(prod)) {
          removedEps.push(`${nt} → ${EPS}`);
          continue;
        }

        const nullablePos = prod.reduce((acc, sym, i) => (nullable.has(sym) ? [...acc, i] : acc), []);
        for (let mask = 0; mask < (1 << nullablePos.length); mask++) {
          const drop = new Set(nullablePos.filter((_, bit) => (mask >> bit) & 1));
          const nextProd = prod.filter((_, i) => !drop.has(i));
          if (!nextProd.length) continue;
          const key = JSON.stringify(nextProd);
          if (!seen.has(key)) {
            seen.add(key);
            nextProductions.push(nextProd);
          }
        }
      }

      newProds.set(nt, nextProductions);
    }

    if (nullable.has(start)) newProds.get(start).push([]);

    for (const [nt, productions] of newProds) {
      const original = new Set((prods.get(nt) || []).map(prod => JSON.stringify(prod)));
      for (const prod of productions) {
        if (!original.has(JSON.stringify(prod))) addedRules.push(`${nt} → ${prodToStr(prod)}`);
      }
    }

    return { nts, prods: newProds, changed: true, nullable: [...nullable].sort(), removedEps, addedRules };
  }

  function stepUNIT(nts, prods) {
    const ntSet = new Set(nts);
    const hasUnit = [...prods.values()].some(productions => productions.some(prod => isUnit(prod, ntSet)));
    if (!hasUnit) return { nts, prods, changed: false };

    const unitOf = new Map();
    for (const nt of nts) unitOf.set(nt, new Set([nt]));

    let changed = true;
    while (changed) {
      changed = false;
      for (const [nt, reach] of unitOf) {
        for (const other of [...reach]) {
          for (const prod of prods.get(other) || []) {
            if (isUnit(prod, ntSet) && !reach.has(prod[0])) {
              reach.add(prod[0]);
              changed = true;
            }
          }
        }
      }
    }

    const removedUnit = [];
    const addedRules = [];
    const newProds = new Map();

    for (const nt of nts) {
      const seen = new Set();
      const nextProductions = [];
      for (const other of unitOf.get(nt)) {
        for (const prod of prods.get(other) || []) {
          if (isUnit(prod, ntSet)) continue;
          const key = JSON.stringify(prod);
          if (!seen.has(key)) {
            seen.add(key);
            nextProductions.push([...prod]);
          }
        }
      }
      newProds.set(nt, nextProductions);
    }

    for (const [nt, productions] of prods) {
      for (const prod of productions) {
        if (isUnit(prod, ntSet)) removedUnit.push(`${nt} → ${prod[0]}`);
      }
    }
    for (const [nt, productions] of newProds) {
      const original = new Set((prods.get(nt) || []).map(prod => JSON.stringify(prod)));
      for (const prod of productions) {
        if (!original.has(JSON.stringify(prod))) addedRules.push(`${nt} → ${prodToStr(prod)}`);
      }
    }

    return { nts, prods: newProds, changed: true, removedUnit, addedRules };
  }

  const SYM_NAMES = {
    '+': 'PLUS', '-': 'MINUS', '*': 'TIMES', '/': 'DIV', '(': 'LP', ')': 'RP',
    '[': 'LB', ']': 'RB', ',': 'COMMA', '.': 'DOT', ';': 'SEMI', ':': 'COLON',
    '=': 'EQ', '<': 'LT', '>': 'GT', '!': 'NOT', '&': 'AND', '|': 'OR',
    '$': 'DOLLAR', '#': 'HASH', '@': 'AT', '%': 'MOD', '?': 'QUEST', '~': 'TILDE', '^': 'HAT'
  };

  function termName(sym) {
    return 'T_' + sym.split('').map(c => SYM_NAMES[c] || c.toUpperCase()).join('').slice(0, 8);
  }

  function stepTERM(nts, prods) {
    const ntSet = new Set(nts);
    const allNames = new Set(nts);
    const termMap = new Map();
    const newNTs = [...nts];
    const newProds = cloneGrammarMap(prods);
    const addedNTs = [];
    const modifiedRules = [];

    for (const [nt, productions] of prods) {
      const nextProductions = productions.map(prod => {
        if (prod.length <= 1) return [...prod];
        let modified = false;
        const nextProd = prod.map(sym => {
          if (ntSet.has(sym)) return sym;
          if (!termMap.has(sym)) {
            let name = termName(sym);
            while (allNames.has(name)) name += "'";
            allNames.add(name);
            termMap.set(sym, name);
            newNTs.push(name);
            newProds.set(name, [[sym]]);
            addedNTs.push(`${name} → ${sym}`);
          }
          modified = true;
          return termMap.get(sym);
        });
        if (modified) modifiedRules.push({ before: `${nt} → ${prodToStr(prod)}`, after: `${nt} → ${prodToStr(nextProd)}` });
        return nextProd;
      });
      newProds.set(nt, nextProductions);
    }

    if (!termMap.size) return { nts, prods, changed: false };
    return { nts: newNTs, prods: newProds, changed: true, addedNTs, modifiedRules };
  }

  function stepBIN(nts, prods) {
    const allNames = new Set(nts);
    const newNTs = [...nts];
    const result = new Map();
    const splitRules = [];
    const addedRules = [];
    let anyChange = false;
    const bodyCache = new Map();

    function ensureAux(baseName, body) {
      const key = JSON.stringify(body);
      if (bodyCache.has(key)) return bodyCache.get(key);
      const name = freshIndexedNT(baseName, allNames);
      allNames.add(name);
      newNTs.push(name);
      result.set(name, [body]);
      bodyCache.set(key, name);
      addedRules.push(`${name} → ${body.join(' ')}`);
      return name;
    }

    function binarize(baseName, syms) {
      if (syms.length <= 2) return [...syms];
      const tail = syms.slice(syms.length - 2);
      const aux = ensureAux(baseName, tail);
      return binarize(baseName, [...syms.slice(0, syms.length - 2), aux]);
    }

    for (const [nt, productions] of prods) {
      result.set(nt, []);
      for (const prod of productions) {
        if (prod.length <= 2) {
          result.get(nt).push([...prod]);
          continue;
        }
        anyChange = true;
        splitRules.push(`${nt} → ${prodToStr(prod)}`);
        result.get(nt).push(binarize(nt, prod));
      }
    }

    if (!anyChange) return { nts, prods, changed: false };
    return { nts: newNTs, prods: result, changed: true, splitRules, addedRules };
  }

  function runCYK(nts, prods, tokens) {
    const n = tokens.length;
    const ntSet = new Set(nts);
    const start = nts[0];

    if (n === 0) {
      const accepted = (prods.get(start) || []).some(prod => prod.length === 0);
      return { accepted, dp: null, n };
    }

    const dp = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => new Set()));

    for (let i = 0; i < n; i++) {
      for (const [nt, productions] of prods) {
        for (const prod of productions) {
          if (prod.length === 1 && !ntSet.has(prod[0]) && prod[0] === tokens[i]) dp[i][1].add(nt);
        }
      }
    }

    for (let len = 2; len <= n; len++) {
      for (let i = 0; i <= n - len; i++) {
        for (let k = 1; k < len; k++) {
          for (const [nt, productions] of prods) {
            if (dp[i][len].has(nt)) continue;
            for (const prod of productions) {
              if (
                prod.length === 2 &&
                ntSet.has(prod[0]) &&
                ntSet.has(prod[1]) &&
                dp[i][k].has(prod[0]) &&
                dp[i + k][len - k].has(prod[1])
              ) {
                dp[i][len].add(nt);
                break;
              }
            }
          }
        }
      }
    }

    return { accepted: dp[0][n].has(start), dp, n };
  }

  global.ParseLabGrammarCore = {
    EPS,
    END,
    parseGrammar,
    parseMapGrammar,
    parseTransformGrammar,
    prodToStr,
    cloneGrammarMap,
    freshNT,
    freshIndexedNT,
    grammarToText,
    firstOfSequence,
    computeFirst,
    computeFollow,
    buildLL1Table,
    eliminateLeftRecursion,
    leftFactor,
    findNullable,
    stepSTART,
    stepDEL,
    stepUNIT,
    stepTERM,
    stepBIN,
    runCYK,
  };
})(globalThis);
