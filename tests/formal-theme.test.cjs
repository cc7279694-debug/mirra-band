'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PAGES, PALETTE, contrast, checkSourcePage, checkCompiledPage } = require('../scripts/check-formal-theme.cjs');
const root = path.resolve(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const simplePage = `<template><div class="page"><text class="title">标题</text><div class="primary"><text class="on-primary">开始</text></div><div class="secondary"><text class="secondary-label">返回</text></div></div></template><style>
.page { background-color: #FFFFFF; }.title { color: #181A1D; }.primary { background-color: #386FBE; }.on-primary { color: #FFFFFF; }.secondary { background-color: #F2F4F7; }.secondary-label { color: #181A1D; }
</style>`;

test('formal palette text pairs exceed 4.5 contrast, including disabled buttons', () => {
  for (const [foreground, background] of [[PALETTE.primary, PALETTE.background], [PALETTE.secondary, PALETTE.background],
    [PALETTE.primary, PALETTE.surface], [PALETTE.secondary, PALETTE.surface], [PALETTE.blue, PALETTE.background],
    [PALETTE.onBlue, PALETTE.blue]]) assert(contrast(foreground, background) >= 4.5, foreground + ' on ' + background);
});

test('source checker rejects a white-on-white mix rather than trusting the manifest', () => {
  const good = checkSourcePage(simplePage);
  assert.equal(good.status, 'PASS', good.errors.join('\n'));
  const mixed = checkSourcePage(simplePage.replace('.title { color: #181A1D; }', '.title { color: #FFFFFF; }'));
  assert.equal(mixed.status, 'FAIL'); assert(mixed.errors.some(error => /contrast 1.00/.test(error)));
  assert(mixed.errors.some(error => /white text requires blue/.test(error)));
});

test('source checker fails on omitted or unresolved page styles and unknown inheritance', () => {
  const missing = checkSourcePage(simplePage.replace('.page { background-color: #FFFFFF; }', ''));
  assert.equal(missing.status, 'FAIL'); assert(missing.errors.some(error => /root background missing/.test(error)));
  const noText = checkSourcePage(simplePage.replace('.title { color: #181A1D; }', ''));
  assert.equal(noText.status, 'FAIL'); assert(noText.errors.some(error => /missing\/nonformal text color/.test(error)));
  assert.throws(() => checkSourcePage(simplePage.replace('.page { background-color: #FFFFFF; }', "@import './missing.css';")), /Unresolved import/);
});

test('source checker keeps disabled foreground/background bindings correlated', () => {
  const page = simplePage.replace('class="primary"', 'class="primary" style="background-color: {{primaryEnabled ? \'#386FBE\' : \'#F2F4F7\'}};"')
    .replace('class="on-primary"', 'class="on-primary" style="color: {{primaryEnabled ? \'#FFFFFF\' : \'#626873\'}};"');
  const result = checkSourcePage(page);
  assert.equal(result.status, 'PASS', result.errors.join('\n'));
  assert(result.combinations.some(combo => combo.foreground === '#FFFFFF' && combo.background === '#386FBE'));
  assert(result.combinations.some(combo => combo.foreground === '#626873' && combo.background === '#F2F4F7'));
  const broken = checkSourcePage(page.replace("primaryEnabled ? '#FFFFFF' : '#626873'", "primaryEnabled ? '#FFFFFF' : '#FFFFFF'"));
  assert.equal(broken.status, 'FAIL');
});

test('later class declarations can reintroduce white text and are checked in stylesheet order', () => {
  const late = simplePage.replace('</style>', '.title { color: #FFFFFF; }</style>');
  const result = checkSourcePage(late);
  assert.equal(result.status, 'FAIL'); assert(result.errors.some(error => /contrast 1.00/.test(error)));
  const repaired = checkSourcePage(late.replace('</style>', '.title { color: #181A1D; }</style>'));
  assert.equal(repaired.status, 'PASS', repaired.errors.join('\n'));
});

test('compiled checker reads actual stylesheet and dynamic inline bindings rather than source CSS', () => {
  function compiled(disabledColor) {
    return `export default function(a,b,c,out) { out.entry = function(entry) { entry.default = {
      style: [[[[0,"page"]],{backgroundColor:"#ffffff"}],[[[0,"primary"]],{backgroundColor:"#386fbe"}],[[[0,"on-primary"]],{color:"#ffffff"}]],
      template: function() { const e=this; return aiot.__ce__("div",{__opts__:{classList:["page"]}},[
        aiot.__ce__("div",{__opts__:{classList:["primary"],style:function(){return {backgroundColor:e.primaryEnabled?"#386FBE":"#F2F4F7"}}}},[
          aiot.__ce__("text",{__opts__:{classList:["on-primary"],style:function(){return {color:e.primaryEnabled?"#FFFFFF":"${disabledColor}"}}}},[])
        ])
      ]) }
    } } }`;
  }
  const good = checkCompiledPage(compiled('#626873'));
  assert.equal(good.status, 'PASS', good.errors.join('\n'));
  const bad = checkCompiledPage(compiled('#FFFFFF'));
  assert.equal(bad.status, 'FAIL'); assert(bad.errors.some(error => /white text requires blue/.test(error)));
});

test('retained 0.4.0 companion source reproduces a formal palette mismatch without changing historical source', () => {
  for (const name of ['Home', 'Detail', 'Control', 'Connection']) {
    const source = read('pages/' + name + '/index.ux');
    const result = checkSourcePage(source, name, relative => read(path.posix.normalize('pages/' + name + '/' + relative)));
    assert.equal(result.status, 'FAIL', name); assert(result.errors.some(error => /root must explicitly use #FFFFFF/.test(error)));
    assert(result.errors.some(error => /missing\/nonformal text color/.test(error)));
  }
});

test('formal transform fails closed on an unknown page, missing style block or unexpanded imports', () => {
  const { transformFormalPage } = require('../scripts/formal-theme.cjs');
  assert.throws(() => transformFormalPage(simplePage, 'Other'), /Unknown formal page/);
  assert.throws(() => transformFormalPage('<template><div></div></template>', 'Mode'), /Missing formal page styles/);
  const unknown = simplePage.replace('<style>', '<style>@import "../../common/missing.css";');
  assert.throws(() => transformFormalPage(unknown, 'Mode'), /Unresolved formal style import/);
  const imported = read('pages/Detail/index.ux');
  assert.throws(() => transformFormalPage(imported, 'Detail', () => '@import "nested.css";'), /Unresolved formal style import/);
});

test('formal stylesheet is admitted only by the live profile, retaining Demo and experiment source sheets', () => {
  const { sourceFilter } = require('../scripts/source-profile.cjs');
  const formalSheet = path.join(root, 'common/formal-theme.css');
  assert.equal(sourceFilter(root, 'live')(formalSheet), true);
  for (const profile of ['demo', 'local-session', 'probe', 'probe-upgrade', 'click-probe']) assert.equal(sourceFilter(root, profile)(formalSheet), false, profile);
  assert.equal(sourceFilter(root, 'demo')(path.join(root, 'common/theme.css')), true);
  assert.equal(sourceFilter(root, 'local-session')(path.join(root, 'common/local-theme.css')), true);
  assert.equal(sourceFilter(root, 'live')(path.join(root, 'common/theme.css')), false);
});

for (const page of PAGES) test('formal transform gives ' + page + ' every text/button an explicit readable combination without changing scripts or click handlers', () => {
  const { transformFormalPage } = require('../scripts/formal-theme.cjs');
  const source = read('pages/' + page + '/index.ux');
  const transformed = transformFormalPage(source, page);
  const result = checkSourcePage(transformed, page);
  assert.equal(result.status, 'PASS', result.errors.join('\n'));
  assert(result.textNodesPerFixture > 0); assert(result.combinations.length > 0);
  assert.equal(transformed.match(/<script\b[^>]*>[\s\S]*?<\/script>/)[0], source.match(/<script\b[^>]*>[\s\S]*?<\/script>/)[0]);
  assert.deepEqual([...transformed.matchAll(/onclick="([^"]*)"/g)].map(match => match[1]), [...source.matchAll(/onclick="([^"]*)"/g)].map(match => match[1]));
  assert.doesNotMatch(transformed.match(/<style\b[^>]*>([\s\S]*?)<\/style>/)[1], /@import/);
  assert(result.combinations.every(combo => combo.contrast >= 4.5));
});
