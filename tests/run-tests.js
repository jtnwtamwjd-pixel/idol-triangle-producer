// ロジックの自動テスト + バランスのシミュレーション
//   node tests/run-tests.js          … テスト
//   node tests/run-tests.js --sim    … 方針の違うAIで多数回プレイして結果分布を表示
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, JSON, Date });
for (const f of ['constants', 'rng', 'data', 'idols', 'score', 'music', 'game', 'ending']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const G = (expr) => vm.runInContext(expr, ctx);
const C = G('C');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

// ---------- 自動プレイ ----------
function playThrough(seed, policy) {
  const s = G('newGameState')(seed);
  const run = (fn, ...a) => G(fn)(s, ...a);
  const resolveScenes = (scenes) => {
    for (const sc of scenes) if (sc.choices) sc.choices[policy.choiceIdx || 0].apply(s);
  };
  let finalScore = 0;
  while (s.week <= C.YEARS * C.WEEKS_PER_YEAR) {
    if (s.phase === 'scout') {
      if (s.unit.length === 0) run('formUnit', s.candidates.slice(0, 3).map((c) => c.id), 'テスト');
      else run('finishScouting');
    }
    const li = G('liveIndexOfWeek')(s.week);
    if (li >= 0) {
      const setup = run('liveSetup');
      const center = policy.center(s);
      const lctx = G('buildLiveContext')(s, center, setup);
      const song = G('generateSong')(setup.songSeed, { liveIndex: li });
      const chart = G('generateChart')(song, C.CHART_DENSITY[li]);
      const r = G('simulateAuto')(lctx, chart, setup.songSeed);
      const out = G('applyLiveResult')(s, setup, center, r);
      resolveScenes(out.scenes);
      if (setup.isFinal) { finalScore = r.total; break; }
    } else {
      // 投資
      for (const k of ['lesson', 'pr', 'staff', 'dorm', 'studio']) if (s.money > 250000 && G('canInvest')(s, k).ok) G('buyInvest')(s, k);
      const [act, opts] = policy.action(s);
      G('doAction')(s, act, opts);
      resolveScenes(G('endWeek')(s));
    }
    G('advanceWeek')(s);
  }
  const ev = G('evaluateEnding')(s, finalScore);
  return { s, ev, finalScore };
}

const balanced = {
  center: (s) => s.unit[s.liveResults.length % 3].id,
  action: (s) => {
    const tired = s.unit.some((i) => i.stamina < 35);
    if (tired) return ['rest', {}];
    if (s.money < 30000) return ['work', { target: 'president' }];
    const w = s.week % 8;
    const stat = ['tech', 'sense', 'visual'][s.week % 3];
    if (w === 1 || w === 5) return ['sns', { target: 'unit' }];
    if (w === 3) return ['work', { target: 'unit' }];
    if (w === 6) { const low = s.unit.reduce((m, i) => (i.affection < m.affection ? i : m)); return ['outing', { target: low.id }]; }
    return ['lesson', { target: 'unit', stat }];
  },
};
const favor = {
  center: (s) => s.unit[0].id,
  action: (s) => {
    if (s.unit.some((i) => i.stamina < 35)) return ['rest', {}];
    if (s.money < 30000) return ['work', { target: 'president' }];
    const id = s.unit[0].id;
    const w = s.week % 6;
    if (w === 1) return ['sns', { target: id }];
    if (w === 2) return ['outing', { target: id }];
    if (w === 4) return ['work', { target: id }];
    return ['lesson', { target: w === 3 ? 'unit' : id, stat: ['tech', 'sense', 'visual'][s.week % 3] }];
  },
};
const lazy = {
  center: (s) => s.unit[0].id,
  choiceIdx: 1,
  action: (s) => (s.week % 3 === 0 ? ['rest', {}] : ['work', { target: s.week % 2 ? 'president' : 'unit' }]),
};

if (process.argv.includes('--sim')) {
  for (const [name, pol] of Object.entries({ balanced, favor, lazy })) {
    const dist = {}; let fans = 0, score = 0, bond = 0, wins = 0; const N = 150;
    for (let i = 0; i < N; i++) {
      const r = playThrough('sim' + i, pol);
      dist[r.ev.id] = (dist[r.ev.id] || 0) + 1;
      fans += r.s.fans; score += r.finalScore; bond += r.s.bond; wins += r.s.liveResults.filter((x) => x.win).length;
    }
    console.log(`[${name}] 平均ファン ${Math.round(fans / N)} / 決勝スコア ${Math.round(score / N)} / 絆 ${Math.round(bond / N)} / 勝利数 ${(wins / N).toFixed(1)}/7`);
    console.log('   エンディング分布', JSON.stringify(dist));
  }
  const one = playThrough('sim0', balanced);
  console.log('ライブ詳細(balanced, sim0):', one.s.liveResults.map((l) => `${l.score}/${l.rival}`).join(' '));
  return;
}

console.log('== 候補生の生成 ==');
test('同じシードなら同じ候補生', () => {
  const a = G('generateCandidates')('abc', 1, 0, []), b = G('generateCandidates')('abc', 1, 0, []);
  assert(JSON.stringify(a) === JSON.stringify(b));
});
test('候補生は6〜9人、名前の重複なし', () => {
  for (let i = 0; i < 50; i++) {
    const a = G('generateCandidates')('s' + i, 1, 0, []);
    assert(a.length >= 6 && a.length <= 9, 'count ' + a.length);
    assert(new Set(a.map((x) => x.name)).size === a.length, 'dup name');
  }
});
test('関係タイプごとの初期親愛度', () => {
  const a = G('generateCandidates')('rel', 1, 0, []);
  for (const i of a) assert(i.affection === C.AFFECTION_INIT[i.relation]);
});

console.log('== 週の進行 ==');
test('レッスンで能力が上がり体力が減る/絆が上がる', () => {
  const s = G('newGameState')('t1');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  const before = s.unit.map((i) => [i.stats.tech, i.stamina]); const bond = s.bond;
  G('doAction')(s, 'lesson', { target: 'unit', stat: 'tech' });
  s.unit.forEach((i, k) => { assert(i.stats.tech > before[k][0]); assert(i.stamina < before[k][1]); });
  assert(s.bond > bond);
});
test('休みで体力が回復する', () => {
  const s = G('newGameState')('t2');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  s.unit.forEach((i) => (i.stamina = 20));
  G('doAction')(s, 'rest', {});
  s.unit.forEach((i) => assert(i.stamina > 20));
});
test('年が変わると候補生フェーズになる', () => {
  const s = G('newGameState')('t3');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  s.week = C.WEEKS_PER_YEAR;
  assert(G('advanceWeek')(s) === 'scout' && s.candidates.length >= 6);
});
test('親愛度がしきい値を超えるとエピソード解放(最大3つ)', () => {
  const s = G('newGameState')('t4');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  s.unit[0].affection = 100;
  const sc = G('checkEpisodes')(s, s.unit[0]);
  assert(sc.length === 3 && s.unit[0].episodesSeen === 3);
  assert(sc[2].choices && sc[2].choices.length === 2, '本音イベントに選択肢');
  sc[2].choices[0].apply(s);
  assert(s.unit[0].honne === true);
});

console.log('== スコア計算式 ==');
function mkCtx(powers, center) {
  return { members: powers.map((p, i) => ({ power: p, coef: i === center ? C.POSITION_COEF.center : 1 })), scoreUp: 0, judgeBuffs: 0, feverMult: 1.5, voltageMul: 1, studio: 0, songwriter: 0, bond: 50, avgCondition: 0 };
}
test('センターに強い子を置くとスコアが上がる', () => {
  const jc = Object.assign(G('newJudgeCounter')(100), { perfect: 100, maxCombo: 100 });
  const a = G('computeLiveScore')(mkCtx([300, 100, 100], 0), jc).total;
  const b = G('computeLiveScore')(mkCtx([300, 100, 100], 1), jc).total;
  assert(a > b, `${a} <= ${b}`);
});
test('式の分解:基礎点 = Σ × スケール × コンボ補正', () => {
  const jc = Object.assign(G('newJudgeCounter')(200), { perfect: 150, good: 30, miss: 20, maxCombo: 50 });
  const r = G('computeLiveScore')(mkCtx([200, 200, 200], 0), jc);
  const sigma = 200 * 1.5 + 200 + 200;
  assert(Math.abs(r.base - sigma * C.STAT_SCORE_SCALE * (1 + C.COMBO_BONUS_MAX * 0.5)) < 1);
  assert(r.judgeBonus === 150 * C.JUDGE_BONUS.perfect + 30 * C.JUDGE_BONUS.good);
});
test('フィーバー中のノーツは加点される', () => {
  const base = Object.assign(G('newJudgeCounter')(100), { perfect: 100, maxCombo: 100 });
  const fev = Object.assign({}, base, { feverPerfect: 30 });
  const ctx2 = mkCtx([200, 200, 200], 0);
  assert(G('computeLiveScore')(ctx2, fev).total > G('computeLiveScore')(ctx2, base).total);
});
test('ミスが多くても、育成十分なら基礎点が大半を占める', () => {
  const jc = Object.assign(G('newJudgeCounter')(200), { perfect: 60, good: 60, miss: 80, maxCombo: 20 });
  const r = G('computeLiveScore')(mkCtx([450, 450, 450], 0), jc);
  assert(r.base / r.total > 0.7, 'base ratio ' + (r.base / r.total));
});
test('おまかせも同じ式(computeLiveScore)を通る', () => {
  const song = G('generateSong')('x', {}); const chart = G('generateChart')(song, 0.7);
  const ctx2 = mkCtx([200, 150, 150], 0);
  const r = G('simulateAuto')(ctx2, chart, 'x');
  const again = G('computeLiveScore')(ctx2, r.judge);
  assert(r.total === again.total);
});

console.log('== 楽曲と譜面 ==');
test('同じシードなら同じ曲・同じ譜面', () => {
  const a = G('generateSong')('seedA', { liveIndex: 2 }), b = G('generateSong')('seedA', { liveIndex: 2 });
  assert(JSON.stringify(a) === JSON.stringify(b));
  assert(JSON.stringify(G('generateChart')(a, 0.7)) === JSON.stringify(G('generateChart')(b, 0.7)));
});
test('ノーツは8分音符グリッドに乗り、時刻 = 拍 × 60/BPM', () => {
  for (let i = 0; i < 20; i++) {
    const song = G('generateSong')('g' + i, { liveIndex: i % 7 }); const ch = G('generateChart')(song, 0.8);
    for (const n of ch.notes) {
      assert(Math.abs(n.beat * 2 - Math.round(n.beat * 2)) < 1e-9, 'off-grid ' + n.beat);
      assert(Math.abs(n.time - n.beat * 60 / song.bpm) < 1e-9);
      assert(n.lane >= 0 && n.lane <= 3);
      assert(n.time < song.duration);
    }
    assert(ch.notes.length > 60, 'notes ' + ch.notes.length);
  }
});

console.log('== エンディング判定順 ==');
function endState(o) {
  const s = G('newGameState')('e');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  s.fans = o.fans; s.bond = o.bond;
  s.unit.forEach((i, k) => { i.focus = o.focus[k]; i.honne = !!o.honne; });
  return G('evaluateEnding')(s, o.score).id;
}
const E = C.ENDING;
test('絆0 → Bad', () => assert(endState({ fans: 1e6, bond: 0, focus: [10, 10, 10], score: 1e6 }) === 'bad'));
test('足切り未満 → Bad', () => assert(endState({ fans: 1e6, bond: 90, focus: [10, 10, 10], score: E.CUTOFF_SCORE - 1 }) === 'bad'));
test('偏り → Individual(True条件を満たしていても優先)', () => assert(endState({ fans: E.FANS_TARGET, bond: 100, focus: [50, 5, 5], score: 1e6, honne: true }) === 'individual'));
test('本音3人 + True条件 → Secret', () => assert(endState({ fans: E.FANS_TARGET, bond: E.BOND_TRUE, focus: [10, 10, 10], score: E.TRUE_SCORE, honne: true }) === 'secret'));
test('True', () => assert(endState({ fans: E.FANS_TARGET, bond: E.BOND_TRUE, focus: [10, 10, 10], score: E.TRUE_SCORE }) === 'true'));
test('ファン不足 → Normal', () => assert(endState({ fans: E.FANS_TARGET - 1, bond: 100, focus: [10, 10, 10], score: 1e6 }) === 'normal'));
test('偏りがあってもファン不足ならIndividualにならない', () => assert(endState({ fans: 10, bond: 100, focus: [50, 1, 1], score: E.TRUE_SCORE }) === 'normal'));

console.log('== 素材の割り振り ==');
test('素材が空ならSVGのまま(charId なし)', () => {
  const s = G('newGameState')('a0');
  assert(s.candidates.every((c) => !c.charId));
  assert(G('avatarSVG')(s.candidates[0], 50).startsWith('<svg'));
});
test('素材があれば重複なく割り振り、ユニット外の候補生とも重ならない', () => {
  G(`globalThis.ASSET_CHARACTERS = Array.from({ length: 12 }, (_, k) => ({ id: 'c' + k, image: 'img' + k + '.jpg', videos: k % 2 ? ['a.mp4', 'b.mp4'] : [] }))`);
  const s = G('newGameState')('a1');
  const ids = s.candidates.map((c) => c.charId);
  assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'dup in candidates');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  s.week = C.WEEKS_PER_YEAR; G('advanceWeek')(s);
  const unitIds = new Set(s.unit.map((i) => i.charId));
  assert(s.candidates.every((c) => !c.charId || !unitIds.has(c.charId)), 'overlap with unit');
  assert(G('avatarSVG')(s.unit[0], 50).startsWith('<img'));
});
test('性格指定のある素材は、その性格に優先して割り振る', () => {
  G(`globalThis.ASSET_CHARACTERS = Object.keys(PERSONALITIES).map((p) => ({ id: 'p_' + p, image: p + '.jpg', personality: p }))`);
  const s = G('newGameState')('a2');
  const first = {};
  for (const c of s.candidates) if (!first[c.personality]) first[c.personality] = c;
  for (const c of Object.values(first)) assert(c.charId === 'p_' + c.personality, c.personality + ' -> ' + c.charId);
});
test('エピソード・ギャップには動画マーカーが付く', () => {
  const s = G('newGameState')('a3');
  G('formUnit')(s, s.candidates.slice(0, 3).map((c) => c.id), 'U');
  const sc = G('episodeScene')(s, s.unit[0], 0);
  assert(sc.video === s.unit[0].id && sc.kind === 'episode');
  G('globalThis.ASSET_CHARACTERS = []');
});

console.log('== 通しプレイ ==');
test('3つの方針で最後まで遊べる', () => {
  for (const p of [balanced, favor, lazy]) { const r = playThrough('full', p); assert(r.s.liveResults.length === 7, 'lives ' + r.s.liveResults.length); }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
