const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeElement(overrides = {}) {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    ...overrides,
  };
}

function extractInlineScripts(html) {
  const matches = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  return matches.map(match => match[1].trim()).filter(Boolean);
}

function extractLocalScriptSources(html) {
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*><\/script>/gi)];
  return matches
    .map(match => match[2])
    .filter(src => !/^https?:\/\//i.test(src));
}

function loadPageScript(relativePath, options = {}) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const pagePath = path.join(repoRoot, relativePath);
  const html = fs.readFileSync(pagePath, 'utf8');
  const scriptSources = extractLocalScriptSources(html);
  const scripts = extractInlineScripts(html);

  if (!scripts.length) {
    throw new Error(`No inline scripts found in ${relativePath}`);
  }

  const elements = new Map();
  const documentElementAttrs = new Map();
  const defaultElementIds = options.elementIds || [];

  for (const id of defaultElementIds) {
    elements.set(id, makeElement());
  }

  const document = {
    documentElement: {
      setAttribute(name, value) {
        documentElementAttrs.set(name, value);
      },
      getAttribute(name) {
        return documentElementAttrs.get(name) || null;
      },
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return makeElement({
        appendChild() {},
        insertAdjacentHTML() {},
        removeAttribute() {},
      });
    },
    body: {
      appendChild() {},
      removeChild() {},
    },
    execCommand() {
      return true;
    },
  };

  const context = {
    console,
    document,
    navigator: {
      clipboard: {
        async writeText() {}
      }
    },
    window: {
      matchMedia() {
        return { matches: false };
      }
    },
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    Viz: {
      instance() {
        return Promise.resolve({
          renderSVGElement() {
            return makeElement({
              style: {},
              removeAttribute() {},
            });
          },
        });
      },
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
  };

  context.global = context;
  context.globalThis = context;

  vm.createContext(context);
  for (const src of scriptSources) {
    const scriptPath = path.resolve(path.dirname(pagePath), src);
    const code = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(code, context, { filename: scriptPath });
  }
  vm.runInContext(scripts[scripts.length - 1], context, { filename: pagePath });

  return { context, elements };
}

module.exports = { loadPageScript };
