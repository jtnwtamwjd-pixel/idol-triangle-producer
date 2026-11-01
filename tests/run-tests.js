// ロジックの自動テスト + バランスのシミュレーション
//   node tests/run-tests.js          … テスト
//   node tests/run-tests.js --sim    … 方針の違うAIで多数回プレイして、卒業したユニットのエンディング分布を表示
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, JSON, Date });
for (const f of ['constants', 'rng', 'data', 'idols', 'score', 'music', 'game', 'ending']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const G = (expr) => vm.runInContext(expr, ctx);
const C = G('C');
const W = C.WEEKS_PER_YEAR;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const call = (fn, ...a) => G(fn)(...a);

// ---------- 自動プレイ ----------
// years 年分プレイし、卒業したユニットの記録を返す
function playThrough(seed, policy, years) {
  const s = call('newGameState', seed);
  const resolve = (scenes) => { for (const sc of scenes) if (sc.choices) sc.choices[policy.choiceIdx || 0].apply(s); };
  const graduated = [];
  while (call('yearOf', s.week) <= years) {
    if (s.phase === 'scout') {
      const lim = call('unitSizeLimits', s.candidates.length);
      const size = Math.max(lim.min, Math.min(lim.max, policy.size ? policy.size(lim) : 3));
      call('formUnit', s, s.candidates.slice(0, size).map((c) => c.id), 'U' + s.nextUnitNo);
    }
    for (const k of ['lesson', 'pr', 'staff', 'dorm', 'studio']) if (s.money > 300000 && call('canInvest', s, k).ok) call('buyInvest', s, k);
    const live = call('liveOfWeek', s, s.week);
    if (live && live.type === 'regular') call('setLiveUnit', s, policy.liveUnit(s).id);
    for (const u of call('actingUnits', s)) { const [a, o] = policy.action(s, u); call('setPlan', s, u.id, a, o); }
    assert(call('canRunWeek', s).ok, 'cannot run week');
    call('runActions', s);
    const lu = call('liveUnitThisWeek', s);
    if (lu) {
      const setup = call('liveSetup', s, lu);
      const center = policy.center(s, lu);
      const lctx = call('buildLiveContext', s, lu, center, setup);
      const song = call('generateSong', setup.songSeed, { liveIndex: setup.tier });
      const chart = call('generateChart', song, C.CHART_DENSITY[setup.tier]);
      const r = call('simulateAuto', lctx, chart, setup.songSeed);
      resolve(call('applyLiveResult', s, lu, setup, center, r).scenes);
      if (setup.isFinal) graduated.push(call('graduateUnit', s, lu, r.total).record);
    }
    resolve(call('finishWeek', s));
  }
  return { s, graduated };
}

const pickTired = (u) => u.members.some((i) => i.stamina < 35);
const balanced = {
  liveUnit: (s) => s.units.reduce((m, u) => (u.livesDone < m.livesDone ? u : m)),
  center: (s, u) => u.members[u.livesDone % u.members.length].id,
  action: (s, u) => {
    if (pickTired(u)) return ['rest', {}];
    if (s.money < 30000) return ['work', { target: 'president' }];
    const w = s.week % 8;
    if (w === 1 || w === 5) return ['sns', { target: 'unit' }];
    if (w === 3) return ['work', { target: 'unit' }];
    if (w === 6) { const low = u.members.reduce((m, i) => (i.affection < m.affection ? i : m)); return ['outing', { target: low.id }]; }
    return ['lesson', { target: 'unit', stat: ['tech', 'sense', 'visual'][s.week % 3] }];
  },
};
const favor = {
  liveUnit: balanced.liveUnit,
  center: (s, u) => u.members[0].id,
  action: (s, u) => {
    if (pickTired(u)) return ['rest', {}];
    if (s.money < 30000) return ['work', { target: 'president' }];
    const id = u.members[0].id;
    const w = s.week % 6;
    if (w === 1) return ['sns', { target: id }];
    if (w === 2) return ['outing', { target: id }];
    if (w === 4) return ['work', { target: id }];
    return ['lesson', { target: w === 3 ? 'unit' : id, stat: ['tech', 'sense', 'visual'][s.week % 3] }];
  },
};
const lazy = {
  liveUnit: (s) => s.units[0],
  center: (s, u) => u.members[0].id,
  choiceIdx: 1,
  action: (s) => (s.week % 3 === 0 ? ['rest', {}] : ['work', { target: s.week % 2 ? 'president' : 'unit' }]),
};
const big = Object.assign({}, balanced, { size: (lim) => lim.max });
const small = Object.assign({}, balanced, { size: (lim) => lim.min });

if (process.argv.includes('--sim')) {
  const N = 60, YEARS = 5;
  for (const [name, pol] of Object.entries({ balanced, favor, lazy, big, small })) {
    const dist = {}; let fans = 0, score = 0, cnt = 0, money = 0;
    for (let i = 0; i < N; i++) {
      const r = playThrough('sim' + i, pol, YEARS);
      for (const g of r.graduated) { dist[g.ending] = (dist[g.ending] || 0) + 1; fans += g.fans; score += g.finalScore; cnt++; }
      money += r.s.money;
    }
    console.log(`[${name}] 卒業 ${cnt}組 / 平均ファン ${Math.round(fans / cnt)} / 決勝 ${Math.round(score / cnt)} / ${YEARS}年後の資金 ${Math.round(money / N)}`);
    console.log('   エンディング分布', JSON.stringify(dist));
  }
  const one = playThrough('sim0', balanced, 3);
  console.log('1期生のライブ(balanced, sim0):', one.graduated[0].members.length + '人', one.s.alumni[0] && JSON.stringify(one.s.alumni[0].ending));
  return;
}

const newUnitState = (seed, size) => {
  const s = call('newGameState', seed);
  call('formUnit', s, s.candidates.slice(0, size || 3).map((c) => c.id), 'U');
  return s;
};

console.log('== 候補生とユニット ==');
test('同じシードなら同じ候補生', () => {
  const a = call('generateCandidates', 'abc', 1, 0, []), b = call('generateCandidates', 'abc', 1, 0, []);
  assert(JSON.stringify(a) === JSON.stringify(b));
});
test('候補生は6〜9人、名前の重複なし', () => {
  for (let i = 0; i < 50; i++) {
    const a = call('generateCandidates', 's' + i, 1, 0, []);
    assert(a.length >= 6 && a.length <= 9, 'count ' + a.length);
    assert(new Set(a.map((x) => x.name)).size === a.length, 'dup name');
  }
});
test('人数の上限 = 候補生の数 − 3(最大5、下限2)', () => {
  const lim = (n) => call('unitSizeLimits', n);
  assert(lim(6).max === 3 && lim(7).max === 4 && lim(8).max === 5 && lim(9).max === 5);
  assert(lim(6).min === 2);
});
test('上限を超える人数・下限未満では結成できない', () => {
  const s = call('newGameState', 'lim');
  const lim = call('unitSizeLimits', s.candidates.length);
  let threw = false;
  try { call('formUnit', s, s.candidates.slice(0, lim.max + 1).map((c) => c.id), 'X'); } catch (e) { threw = true; }
  assert(threw || lim.max + 1 > s.candidates.length, 'too many allowed');
  threw = false;
  try { call('formUnit', s, s.candidates.slice(0, 1).map((c) => c.id), 'X'); } catch (e) { threw = true; }
  assert(threw, 'too few allowed');
});
test('2年目は入れ替えではなく、新しいユニットを結成する', () => {
  const s = newUnitState('y2');
  s.week = W; call('advanceWeek', s);
  assert(s.phase === 'scout');
  call('formUnit', s, s.candidates.slice(0, 2).map((c) => c.id), 'Kouhai');
  assert(s.units.length === 2 && s.units[1].gen === 2 && s.units[0].members.length === 3);
});

console.log('== 週の進行(ユニットごとに行動) ==');
test('全ユニットの行動を選ぶまで週を進められない', () => {
  const s = newUnitState('p1');
  s.week = W; call('advanceWeek', s);
  call('formUnit', s, s.candidates.slice(0, 2).map((c) => c.id), 'K');
  call('setPlan', s, s.units[0].id, 'rest', {});
  assert(!call('canRunWeek', s).ok);
  call('setPlan', s, s.units[1].id, 'lesson', { target: 'unit', stat: 'tech' });
  assert(call('canRunWeek', s).ok);
  const before = s.units[1].members.map((i) => i.stats.tech);
  const res = call('runActions', s);
  assert(res.length === 2);
  s.units[1].members.forEach((i, k) => assert(i.stats.tech > before[k]));
});
test('絆とファンはユニットごとに別管理', () => {
  const s = newUnitState('p2');
  s.week = W; call('advanceWeek', s);
  call('formUnit', s, s.candidates.slice(0, 3).map((c) => c.id), 'K');
  const b0 = s.units[0].bond, b1 = s.units[1].bond;
  call('setPlan', s, s.units[0].id, 'lesson', { target: 'unit', stat: 'tech' });
  call('setPlan', s, s.units[1].id, 'rest', {});
  call('runActions', s);
  assert(s.units[0].bond > b0 && s.units[1].bond === b1);
});
test('通常ライブは出場ユニットを選ぶ。選ばれたユニットは行動しない', () => {
  const s = newUnitState('p3');
  s.week = 8;
  assert(call('liveOfWeek', s, 8).type === 'regular');
  assert(!call('canRunWeek', s).ok);
  call('setLiveUnit', s, s.units[0].id);
  assert(call('actingUnits', s).length === 0 && call('canRunWeek', s).ok);
  call('runActions', s);
  assert(s.stage === 'live');
});
test('1期生の3年間でライブは全7回、最後(3年目16週)が1期生の決勝', () => {
  const s = newUnitState('p4');
  let lives = [];
  for (let w = 1; w <= W * 3; w++) { const l = call('liveOfWeek', s, w); if (l) lives.push([w, l.type]); }
  assert(lives.length === 7, 'lives ' + lives.length);
  assert(lives[6][0] === 48 && lives[6][1] === 'final');
  assert(call('liveOfWeek', s, 48).unitId === s.units[0].id);
});
test('親愛度がしきい値を超えるとエピソード解放(最大3つ)', () => {
  const s = newUnitState('t4');
  const i = s.units[0].members[0];
  i.affection = 100;
  const sc = call('checkEpisodes', s, i);
  assert(sc.length === 3 && i.episodesSeen === 3);
  sc[2].choices[0].apply(s);
  assert(i.honne === true);
});

console.log('== スコア計算式 ==');
function mkCtx(powers, center, size) {
  return { members: powers.map((p, i) => ({ power: p, coef: i === center ? C.POSITION_COEF.center : 1 })), sizeMul: C.SIZE_SCORE_MUL[size || powers.length], scoreUp: 0, judgeBuffs: 0, feverMult: 1.5, voltageMul: 1, studio: 0, songwriter: 0, bond: 50, avgCondition: 0 };
}
test('センターに強い子を置くとスコアが上がる', () => {
  const jc = Object.assign(call('newJudgeCounter', 100), { perfect: 100, maxCombo: 100 });
  assert(call('computeLiveScore', mkCtx([300, 100, 100], 0), jc).total > call('computeLiveScore', mkCtx([300, 100, 100], 1), jc).total);
});
test('式の分解:基礎点 = Σ × 人数補正 × スケール × コンボ補正', () => {
  const jc = Object.assign(call('newJudgeCounter', 200), { perfect: 150, good: 30, miss: 20, maxCombo: 50 });
  const r = call('computeLiveScore', mkCtx([200, 200, 200], 0), jc);
  const sigma = (200 * 1.5 + 200 + 200) * C.SIZE_SCORE_MUL[3];
  assert(Math.abs(r.base - sigma * C.STAT_SCORE_SCALE * (1 + C.COMBO_BONUS_MAX * 0.5)) < 1);
  assert(r.judgeBonus === 150 * C.JUDGE_BONUS.perfect + 30 * C.JUDGE_BONUS.good);
});
test('人数補正:同じ能力なら2〜5人で基礎点の差が±25%以内', () => {
  const jc = Object.assign(call('newJudgeCounter', 100), { perfect: 100, maxCombo: 100 });
  const base3 = call('computeLiveScore', mkCtx([200, 200, 200], 0), jc).base;
  for (const n of [2, 4, 5]) {
    const b = call('computeLiveScore', mkCtx(Array(n).fill(200), 0), jc).base;
    assert(Math.abs(b / base3 - 1) < 0.25, n + '人: ' + (b / base3).toFixed(2));
  }
});
test('ミスが多くても、育成十分なら基礎点が大半を占める', () => {
  const jc = Object.assign(call('newJudgeCounter', 200), { perfect: 60, good: 60, miss: 80, maxCombo: 20 });
  const r = call('computeLiveScore', mkCtx([450, 450, 450], 0), jc);
  assert(r.base / r.total > 0.7, 'base ratio ' + (r.base / r.total));
});
test('おまかせも同じ式(computeLiveScore)を通る', () => {
  const song = call('generateSong', 'x', {}); const chart = call('generateChart', song, 0.7);
  const c2 = mkCtx([200, 150, 150], 0);
  const r = call('simulateAuto', c2, chart, 'x');
  assert(r.total === call('computeLiveScore', c2, r.judge).total);
});

console.log('== 楽曲と譜面 ==');
test('同じシードなら同じ曲・同じ譜面', () => {
  const a = call('generateSong', 'seedA', { liveIndex: 2 }), b = call('generateSong', 'seedA', { liveIndex: 2 });
  assert(JSON.stringify(a) === JSON.stringify(b));
  assert(JSON.stringify(call('generateChart', a, 0.7)) === JSON.stringify(call('generateChart', b, 0.7)));
});
test('ノーツは8分音符グリッドに乗り、時刻 = 拍 × 60/BPM', () => {
  for (let i = 0; i < 20; i++) {
    const song = call('generateSong', 'g' + i, { liveIndex: i % 7 }); const ch = call('generateChart', song, 0.8);
    for (const n of ch.notes) {
      assert(Math.abs(n.beat * 2 - Math.round(n.beat * 2)) < 1e-9, 'off-grid ' + n.beat);
      assert(Math.abs(n.time - n.beat * 60 / song.bpm) < 1e-9);
      assert(n.lane >= 0 && n.lane <= 3 && n.time < song.duration);
    }
    assert(ch.notes.length > 60, 'notes ' + ch.notes.length);
  }
});

console.log('== エンディング判定順 ==');
function endUnit(o) {
  const s = newUnitState('e', o.size || 3);
  const u = s.units[0];
  u.fans = o.fans; u.bond = o.bond;
  u.members.forEach((i, k) => { i.focus = o.focus[k]; i.honne = !!o.honne; });
  return call('evaluateEnding', u, o.score).id;
}
const E = C.ENDING;
test('絆0 → Bad', () => assert(endUnit({ fans: 1e6, bond: 0, focus: [10, 10, 10], score: 1e6 }) === 'bad'));
test('足切り未満 → Bad', () => assert(endUnit({ fans: 1e6, bond: 90, focus: [10, 10, 10], score: E.CUTOFF_SCORE - 1 }) === 'bad'));
test('偏り → Individual(True条件を満たしていても優先)', () => assert(endUnit({ fans: E.FANS_TARGET, bond: 100, focus: [50, 5, 5], score: 1e6, honne: true }) === 'individual'));
test('本音全員 + True条件 → Secret', () => assert(endUnit({ fans: E.FANS_TARGET, bond: E.BOND_TRUE, focus: [10, 10, 10], score: E.TRUE_SCORE, honne: true }) === 'secret'));
test('True', () => assert(endUnit({ fans: E.FANS_TARGET, bond: E.BOND_TRUE, focus: [10, 10, 10], score: E.TRUE_SCORE }) === 'true'));
test('ファン不足 → Normal', () => assert(endUnit({ fans: E.FANS_TARGET - 1, bond: 100, focus: [10, 10, 10], score: 1e6 }) === 'normal'));
test('2人組:均等(50%)は偏りにならない', () => assert(endUnit({ size: 2, fans: E.FANS_TARGET, bond: E.BOND_TRUE, focus: [20, 20], score: E.TRUE_SCORE }) === 'true'));

console.log('== 素材の割り振り ==');
test('素材が空ならSVGのまま', () => {
  const s = call('newGameState', 'a0');
  assert(s.candidates.every((c) => !c.charId) && call('avatarSVG', s.candidates[0], 50).startsWith('<svg'));
});
test('素材があれば、活動中の全メンバー・候補生で重複なく割り振る', () => {
  G(`globalThis.ASSET_CHARACTERS = Array.from({ length: 30 }, (_, k) => ({ id: 'c' + k, image: 'img' + k + '.jpg', videos: k % 2 ? ['a.mp4', 'b.mp4'] : [] }))`);
  const s = newUnitState('a1');
  s.week = W; call('advanceWeek', s);
  call('formUnit', s, s.candidates.slice(0, 2).map((c) => c.id), 'K');
  s.week = W * 2; call('advanceWeek', s);
  const ids = s.units.flatMap((u) => u.members).concat(s.candidates).map((i) => i.charId);
  assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'dup');
  G('globalThis.ASSET_CHARACTERS = []');
});

console.log('== 通しプレイ ==');
test('5年間遊べて、3年目から毎年1組ずつ卒業する(1期生が最初)', () => {
  for (const p of [balanced, favor, lazy, big, small]) {
    const r = playThrough('full', p, 5);
    assert(r.graduated.length === 3, 'graduated ' + r.graduated.length);
    assert(r.graduated[0].gen === 1 && r.graduated[1].gen === 2 && r.graduated[2].gen === 3);
    assert(r.s.units.length === 2, 'active ' + r.s.units.length); // 卒業直後は後輩2組
  }
});
test('1期生の卒業時、後輩ユニットが2組いる', () => {
  const r = playThrough('jr', balanced, 3);
  assert(r.graduated.length === 1 && r.s.units.length === 2 && r.s.units.every((u) => u.gen > 1));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
