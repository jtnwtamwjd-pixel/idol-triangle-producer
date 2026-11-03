const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const ctx = vm.createContext({ console, window: { addEventListener() {} } });
for (const name of ['constants', 'rng', 'data', 'idols', 'score', 'music', 'game', 'ending', 'ui']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
}
const run = (code) => vm.runInContext(code, ctx);
run(`var testState = newGameState('stage-preview'); var testUnit = formUnit(testState, testState.candidates.slice(0, 3).map(i => i.id), '<Stage>');`);
const before = run('JSON.stringify(testState)');
for (const action of ['lesson', 'work', 'sns', 'outing', 'rest']) {
  const html = run(`actionPreview(testState, testUnit, '${action}', { stat: '${action === 'lesson' ? 'tech' : ''}', target: 'unit' }, true)`);
  assert(html.includes('ACTION PREVIEW'));
  assert(!html.includes('NaN') && !html.includes('undefined'));
}
assert.equal(run('JSON.stringify(testState)'), before, 'preview must not mutate game state');
run('testUnit.members[0].stamina = 5');
assert(run("weeklyTip(testUnit)").includes('体力'));
assert(run("actionPreview(testState, testUnit, 'lesson', {stat:'tech', target:'unit'}, true)").includes('体力に注意'));
run('testState.money = 0');
assert(run("actionPreview(testState, testUnit, 'outing', {target:'unit'}, true)").includes('資金不足'));
assert(run("actionPreview(testState, testUnit, 'lesson', {}, false)").includes('選ぶと'));
assert(run("actionPreview(testState, testUnit, 'lesson', {stat:'song', songId:testUnit.songs[0].id}, true)").includes('経験値'));
assert(run("actionPreview(testState, testUnit, 'work', {target:'president'}, true)").includes('社長の報酬'));
console.log('Preview checks passed: all actions, no mutations, low stamina, insufficient funds, incomplete selection, songs, president.');

// Real asset manifest: new portraits participate in scouting and existing identities stay fixed.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'manifest.js'), 'utf8'), ctx);
const assetList = run('assetChars()');
assert.equal(assetList.length, 12);
for (const asset of assetList) assert(fs.existsSync(path.join(__dirname, '..', asset.image)), asset.image);
const seen = new Set();
for (let seed = 0; seed < 30; seed++) {
  run(`var assetState = newGameState('portraits-' + ${seed});`);
  run('assetState.candidates').forEach(i => seen.add(i.charId));
}
for (const id of ['char10', 'char11', 'char12']) assert(seen.has(id), id + ' must appear in scouting');
run("var stableState = newGameState('stable-portraits'); var stableUnit = formUnit(stableState, stableState.candidates.slice(0, 2).map(i => i.id), 'Test');");
const identities = run('JSON.stringify(stableUnit.members.map(i => i.charId))');
run('ensureCharacters(stableState)');
assert.equal(run('JSON.stringify(stableUnit.members.map(i => i.charId))'), identities);
console.log('Asset checks passed: 12 valid portraits, all new portraits used, saved identities preserved.');
