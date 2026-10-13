'use strict';

// This checks the small class/inline-style subset used by our Vela pages.
// It inspects declarations and compiled bindings, not firmware pixels/layout.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const PAGES = ['Mode', 'Home', 'Detail', 'Control', 'Connection', 'LocalSession'];
const PALETTE = { background: '#FFFFFF', surface: '#F2F4F7', primary: '#181A1D', secondary: '#626873', blue: '#386FBE', onBlue: '#FFFFFF' };
const FLAGS = ['primaryEnabled', 'secondaryEnabled', 'canWrite', 'noticeVisible', 'timerUnknown', 'canRetry', 'hasControl', 'controlBusy'];
const TEXT_TYPES = new Set(['text', 'input', 'textarea', 'button']);
const bindingContexts = new WeakMap();
const normalizeColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
const camel = value => value.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function contrast(foreground, background) {
  function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function declarations(css) {
  const result = {};
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) result[camel(declaration.slice(0, colon))] = declaration.slice(colon + 1).trim();
  }
  return result;
}

function sourceStyles(source, readImport) {
  let css = (source.match(/<style\b[^>]*>([\s\S]*?)<\/style>/) || [])[1];
  if (css === undefined) throw new Error('Missing style block');
  const seen = new Set();
  function expand(content) {
    return content.replace(/@import\s+['"]([^'"]+)['"]\s*;/g, (_, relative) => {
      if (typeof readImport !== 'function') throw new Error('Unresolved import ' + relative);
      if (seen.has(relative)) throw new Error('Repeated/cyclic import ' + relative);
      seen.add(relative); return expand(readImport(relative));
    });
  }
  css = expand(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1].trim().split(',')) {
      if (!/^\.[\w-]+$/.test(selector.trim())) throw new Error('Unsupported formal selector ' + selector.trim());
      rules.push({ className: selector.trim().slice(1), properties: declarations(match[2]) });
    }
  }
  if (!rules.length) throw new Error('Empty stylesheet');
  return rules;
}

function sourceTree(source) {
  const template = (source.match(/<template\b[^>]*>([\s\S]*?)<\/template>/) || [])[1];
  if (template === undefined) throw new Error('Missing template block');
  const roots = [], stack = [];
  // Quoted attributes may contain > (e.g. pendingCount > 0).
  const tags = /<(\/?)([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const match of template.matchAll(tags)) {
    if (match[1]) {
      const closed = stack.pop();
      if (!closed || closed.type !== match[2]) throw new Error('Unbalanced template ' + match[2]);
      continue;
    }
    const attrs = {};
    for (const attr of match[3].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]] = attr[2] ?? attr[3];
    const node = { type: match[2], attrs, children: [] };
    (stack.length ? stack.at(-1).children : roots).push(node);
    if (!/\/\s*$/.test(match[3])) stack.push(node);
  }
  if (stack.length) throw new Error('Unclosed template');
  return roots;
}

function fixtures() {
  const selected = { id: 'book', title: '书籍', text: '第一步', selected: true, height: 42, titleHeight: 36, textHeight: 36, startPageText: '第 1 页' };
  const cases = [];
  // Exhaust all actual colour/class flags; skip unrelated visibility branches
  // by rendering them all. This intentionally includes unavailable/error views.
  for (let bits = 0; bits < (1 << FLAGS.length); bits++) {
    const value = { formal: true, pendingCount: 1, titleClass: 'state state-small', timerClass: 'timer timer-long',
      bookChoices: [selected, { ...selected, selected: false }], actionChoices: [selected, { ...selected, selected: false }],
      bookRows: ['书名'], actionRows: ['第一步'], firstActionRows: ['第一步'], recoveryRows: ['恢复提示'], noticeRows: ['错误提示'],
      timerText: '休息时间已到', timerLong: true, $item: { ...selected, selected: !!(bits & 1) } };
    FLAGS.forEach((flag, index) => { value[flag] = !!(bits & (1 << index)); });
    cases.push(value);
  }
  return cases;
}

function evaluateBinding(value, scope) {
  if (!value.includes('{{')) return value;
  let record = bindingContexts.get(scope);
  if (!record) { record = { context: vm.createContext({ ...scope }), values: new Map() }; bindingContexts.set(scope, record); }
  return value.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => {
    // Tool-only bounded evaluation, matching the compiled factory allowance.
    // The old 100ms deadline timed out under concurrent CLI/test load; this
    // does not alter any wrist timer, persistence or communication deadline.
    if (!record.values.has(expression)) record.values.set(expression, String(vm.runInContext(expression, record.context, { timeout: 2000 })));
    return record.values.get(expression);
  });
}

function sourceNodes(tree, scope) {
  return tree.map(node => ({ type: node.type,
    classList: evaluateBinding(node.attrs.class || '', scope).trim().split(/\s+/).filter(Boolean),
    inline: declarations(evaluateBinding(node.attrs.style || '', scope)),
    children: sourceNodes(node.children, scope) }));
}

function compiledStyles(style) {
  if (!Array.isArray(style) || !style.length) throw new Error('Missing compiled stylesheet');
  return style.map(([selectors, properties]) => {
    if (selectors.length !== 1 || selectors[0].length !== 2 || selectors[0][0] !== 0)
      throw new Error('Unsupported compiled selector ' + JSON.stringify(selectors));
    return { className: selectors[0][1], properties };
  });
}

function inspectNodes(nodes, rules, label) {
  const errors = [], combinations = new Map();
  let texts = 0, buttons = 0;
  const allowed = new Set(Object.values(PALETTE));
  function walk(node, inheritedBackground, ancestors) {
    const style = {};
    for (const rule of rules) if (node.classList.includes(rule.className)) Object.assign(style, rule.properties);
    Object.assign(style, node.inline);
    const declaredBackground = style.backgroundColor;
    const background = declaredBackground === undefined ? inheritedBackground : normalizeColor(declaredBackground);
    const location = label + ': ' + node.type + '.' + node.classList.join('.');
    if (declaredBackground !== undefined && (!background || !allowed.has(background))) errors.push(location + ' invalid background ' + declaredBackground);
    if (!ancestors.length && background !== PALETTE.background) errors.push(location + ' root must explicitly use #FFFFFF');
    if (!ancestors.length && declaredBackground === undefined) errors.push(location + ' root background missing');
    if (TEXT_TYPES.has(node.type)) {
      texts++;
      const color = normalizeColor(style.color);
      if (!color || !allowed.has(color)) errors.push(location + ' missing/nonformal text color ' + style.color);
      if (!background) errors.push(location + ' no opaque background');
      if (color && background) {
        const ratio = contrast(color, background);
        combinations.set(node.classList.join(' ') + ':' + color + '/' + background, { classes: node.classList, foreground: color, background, contrast: Number(ratio.toFixed(3)) });
        if (ratio < 4.5) errors.push(location + ' contrast ' + ratio.toFixed(2) + ' ' + color + ' on ' + background);
        if (color === PALETTE.onBlue && background !== PALETTE.blue) errors.push(location + ' white text requires blue button background');
        if (color === PALETTE.onBlue && !ancestors.some(parent => /(?:button|primary|retry|control-link|confirm)/.test(parent.classList.join(' '))))
          errors.push(location + ' white text is outside an explicit primary action');
      }
      if (node.classList.some(name => /secondary-label|mode-secondary-label/.test(name)) && color !== PALETTE.primary && color !== PALETTE.secondary)
        errors.push(location + ' secondary button must have primary/disabled text');
    }
    if (node.classList.some(name => /button|secondary|retry|control-link|digit-key/.test(name)) && !TEXT_TYPES.has(node.type)) buttons++;
    node.children.forEach(child => walk(child, background, [...ancestors, node]));
  }
  nodes.forEach(node => walk(node, null, []));
  return { errors: [...new Set(errors)], texts, buttons, combinations: [...combinations.values()] };
}

function combineReports(reports, label) {
  const errors = [...new Set(reports.flatMap(report => report.errors))];
  const combinations = new Map();
  reports.forEach(report => report.combinations.forEach(combo => combinations.set(JSON.stringify(combo), combo)));
  return { page: label, status: errors.length ? 'FAIL' : 'PASS', errors, branchFixtures: reports.length,
    textNodesPerFixture: Math.max(...reports.map(report => report.texts)), buttonNodesPerFixture: Math.max(...reports.map(report => report.buttons)), combinations: [...combinations.values()] };
}

function checkSourcePage(source, label = 'source', readImport) {
  const rules = sourceStyles(source, readImport), tree = sourceTree(source);
  return combineReports(fixtures().map(scope => inspectNodes(sourceNodes(tree, scope), rules, label)), label);
}

function checkCompiledPage(code, label = 'compiled') {
  const aiot = {
    __ce__(type, boundary, children) { return { type, options: boundary.__opts__, children: (children || []).flat(Infinity) }; },
    __ci__(_boundary, render) { return render(); },
    __cf__(boundary, render) { const items = boundary.__opts__.exp(); return (Array.isArray(items) ? items : []).map((item, index) => render(index, item)).flat(Infinity); }
  };
  const runtime = { setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() {},
    $translateStyle$: declarations, $app_require$() { return {}; } };
  const factory = vm.runInNewContext('(' + code.replace(/^export default\s*/, '') + ')', { aiot, console, Date, $app_require$: runtime.$app_require$ }, { timeout: 2000 });
  const exports = {}; factory(runtime, runtime, runtime, exports, {});
  const entry = {}; exports.entry(entry);
  const definition = entry.default, rules = compiledStyles(definition.style);
  function convert(nodes) {
    return [nodes].flat(Infinity).filter(Boolean).map(node => {
      const options = node.options;
      const classes = typeof options.classList === 'function' ? options.classList() : options.classList || [];
      const inline = typeof options.style === 'function' ? options.style() : options.style || {};
      return { type: node.type, classList: [classes].flat(Infinity).filter(Boolean).flatMap(value => String(value).split(/\s+/)), inline,
        children: convert(node.children) };
    });
  }
  return combineReports(fixtures().map(scope => {
    const view = Object.assign({}, definition, definition.data, definition.private, scope);
    return inspectNodes(convert(definition.template.call(view)), rules, label);
  }), label);
}

async function checkRpk(file) {
  const toolkit = createRequire(require.resolve('aiot-toolkit/package.json'));
  const pack = createRequire(toolkit.resolve('@aiot-toolkit/aiotpack/package.json'));
  const JSZip = pack('jszip');
  const { verifyBuffer } = require('./inspect-rpk.cjs');
  const raw = fs.readFileSync(file), signature = verifyBuffer(raw);
  const zip = await JSZip.loadAsync(raw, { checkCRC32: true });
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  if (manifest.package !== 'com.guanyi.mirra' || manifest.display.backgroundColor !== PALETTE.background) throw new Error('Not a formal white Mirra artifact');
  const pages = [];
  for (const page of PAGES) {
    const resource = zip.file('pages/' + page + '/index.js');
    if (!resource) throw new Error('Missing compiled page ' + page);
    pages.push(checkCompiledPage(await resource.async('string'), page));
  }
  return { status: pages.every(page => page.status === 'PASS') ? 'PASS' : 'FAIL', boundary: 'Signed compiled declarations and native bindings in Node fixtures; no firmware pixels/layout proof',
    versionName: manifest.versionName, versionCode: manifest.versionCode, certificate: signature.certificate.fingerprint256, pages };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/check-formal-theme.cjs FORMAL_RPK');
  checkRpk(path.resolve(file)).then(report => { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exitCode = report.status === 'PASS' ? 0 : 1; })
    .catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
}
module.exports = { PAGES, PALETTE, contrast, checkSourcePage, checkCompiledPage, checkRpk };
