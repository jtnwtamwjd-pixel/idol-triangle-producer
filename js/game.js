// ============================================================
// ゲーム進行ロジック(DOMに依存しない。テストからも読み込む)
//
// 複数ユニット制:
//   ・毎年1週目に候補生が入所し、新しいユニットを1つ結成する(2〜5人)
//   ・ユニットの活動期間は3年。3年目の16週目に卒業ライブ(グランプリ決勝)を行い、
//     そのユニットのエンディングを判定して卒業する。ゲームはその後も続く
//   ・毎週、活動中のユニットごとに1つずつ行動を選ぶ
//   ・通常のライブは、出場するユニットを毎回選ぶ
// ============================================================

// ---------- 状態 ----------
function newGameState(seed, meta) {
  meta = meta || defaultMeta();
  const loopStack = Math.min(meta.loops, C.LOOP.MAX_STACK);
  const s = {
    version: 2,
    seed: String(seed),
    week: 1,
    phase: 'scout',     // scout(結成)/ home(週の計画)
    stage: 'plan',      // plan → live(ライブ待ち)→ ending(エンディング表示待ち)
    money: C.START_MONEY + loopStack * C.LOOP.MONEY_BONUS,
    fame: C.START_FAME,
    units: [],
    alumni: [],         // 卒業・解散したユニットの記録
    candidates: [],
    plan: {},           // { unitId: { action, opts } }
    liveUnitId: null,   // 今週の通常ライブに出るユニット
    pendingEnding: null,
    nextUnitNo: 1,
    invest: { lesson: 0, pr: 0, dorm: 0, staff: 0, studio: 0 },
    items: { drink: 0, charm: 0, gift: 0, camp: 0, supple: 0 },
    costumes: Array.from(new Set(['school'].concat(meta.costumes || []))),
    log: [],
    loop: meta.loops,
    usedNames: [],
    seenEvents: {},
    _metaLoopBonus: loopStack * C.LOOP.STAT_BONUS,
  };
  s.candidates = generateCandidates(s.seed, 1, s._metaLoopBonus, s.usedNames);
  ensureCharacters(s);
  return s;
}

function defaultMeta() {
  return { loops: 0, costumes: [], endings: [], bestFinal: 0, episodes: 0 };
}

const yearOf = (week) => Math.floor((week - 1) / C.WEEKS_PER_YEAR) + 1;
const weekInYear = (week) => ((week - 1) % C.WEEKS_PER_YEAR) + 1;

// ---------- ユニット ----------
function allIdols(state) { return state.units.flatMap((u) => u.members); }
function findIdol(state, id) {
  return allIdols(state).find((i) => i.id === id) || state.candidates.find((c) => c.id === id) || null;
}
function findUnit(state, id) { return state.units.find((u) => u.id === id) || null; }
function unitOfIdol(state, idolId) { return state.units.find((u) => u.members.some((i) => i.id === idolId)) || null; }
// ユニットの何年目か(1〜3)
function careerYear(unit, week) { return yearOf(week) - unit.startYear + 1; }
function unitSizeLimits(candidateCount) {
  return { min: C.UNIT_MIN, max: Math.max(C.UNIT_MIN, Math.min(C.UNIT_MAX, candidateCount - C.UNIT_SIZE_OFFSET)) };
}
function unitLabel(unit) { return `${unit.gen}期生「${unit.name}」`; }

// ---------- ライブの予定 ----------
function liveWeeksOfYear(year) { return C.LIVE_WEEKS_BY_YEAR[year] || C.LIVE_WEEKS_BY_YEAR.default; }
// その年に卒業するユニット(3年目の最終週に決勝)
function graduatingUnit(state, year) {
  return state.units.find((u) => year - u.startYear + 1 === C.CAREER_YEARS) || null;
}
// 戻り値:null / { type: 'regular' } / { type: 'final', unitId }
function liveOfWeek(state, week) {
  const y = yearOf(week), w = weekInYear(week);
  if (!liveWeeksOfYear(y).includes(w)) return null;
  if (w === C.WEEKS_PER_YEAR) {
    const g = graduatingUnit(state, y);
    if (g) return { type: 'final', unitId: g.id };
  }
  return { type: 'regular' };
}
function nextLive(state) {
  for (let w = state.week; w < state.week + C.WEEKS_PER_YEAR * 2; w++) {
    const l = liveOfWeek(state, w);
    if (l) return Object.assign({ week: w, inWeeks: w - state.week }, l);
  }
  return null;
}
// 今週ライブに出るユニット(未定なら null)
function liveUnitThisWeek(state) {
  const l = liveOfWeek(state, state.week);
  if (!l) return null;
  return findUnit(state, l.type === 'final' ? l.unitId : state.liveUnitId);
}

// ---------- 事務所 ----------
function officeScale(state) {
  return 1 + Object.values(state.invest).reduce((a, b) => a + b, 0);
}
function officeRankIndex(state) {
  const sc = officeScale(state);
  let idx = 0;
  C.OFFICE_RANKS.forEach((r, i) => { if (sc >= r.min) idx = i; });
  return idx;
}
const officeRankName = (state) => C.OFFICE_RANKS[officeRankIndex(state)].name;
const totalFans = (state) => state.units.reduce((a, u) => a + u.fans, 0);

function pushLog(state, text) {
  state.log.unshift(`[${yearOf(state.week)}年目${weekInYear(state.week)}週] ${text}`);
  if (state.log.length > 60) state.log.length = 60;
}
function weekRng(state, tag) { return makeRng(state.seed + ':w' + state.week + ':' + tag); }

// ---------- 値の増減ヘルパー ----------
function addStamina(idol, v) { idol.stamina = clamp(Math.round(idol.stamina + v), 0, idol.staminaMax); }
function addCondition(idol, v) { idol.condition = clamp(idol.condition + v, -2, 2); }
function addBond(unit, v) { unit.bond = clamp(Math.round(unit.bond + v), 0, C.BOND_MAX); }
function addFame(state, v) { state.fame = clamp(state.fame + v * (1 + state.invest.pr * INVESTMENTS.pr.effect), 0, C.FAME_MAX); }
function addFans(state, unit, v) {
  const gain = v > 0 ? v * (1 + state.invest.pr * INVESTMENTS.pr.effect) : v;
  unit.fans = Math.max(0, Math.round(unit.fans + gain));
  return Math.round(gain);
}
function addStat(idol, stat, v) { idol.stats[stat] = clamp(Math.round((idol.stats[stat] + v) * 10) / 10, 0, C.STAT_MAX); }

function affectionMul(idol, kind) {
  if (idol.relation === 'loyal') return C.AFFECTION_MUL.loyal;
  if (idol.relation === 'tsundere') return idol.accepted ? C.AFFECTION_MUL.tsundereAccepted : C.AFFECTION_MUL.tsundere;
  return kind === 'outing' ? C.AFFECTION_MUL.accomplice * C.ACCOMPLICE_OUTING_MUL : C.AFFECTION_MUL.accomplice;
}
function addAffection(idol, base, kind) {
  const v = base > 0 ? base * affectionMul(idol, kind) : base;
  idol.affection = clamp(Math.round((idol.affection + v) * 10) / 10, 0, C.AFFECTION_MAX);
}

// 体力が低いほど失敗しやすい
function failChance(idol) {
  if (idol.stamina >= C.LOW_STAMINA) return 0;
  return C.LOW_STAMINA_FAIL_MAX * (1 - idol.stamina / C.LOW_STAMINA);
}

// ---------- 台詞の組み立て ----------
// lines: [[who, text], ...] → [{speaker, text}]。who は 'i'(idol)/'p'/'n' か idol.id
function makeScene(title, idol, raw, choices) {
  return {
    title,
    lines: raw.map(([who, text]) => ({
      speaker: who === 'i' ? (idol ? idol.id : 'n') : who,
      text: fillName(text, idol),
    })),
    choices: choices || null,
  };
}

// イベント動画の対象にする(実際に流すかは UI 側で素材と設定を見て決める)
function withVideo(scene, idol, kind) {
  if (C.VIDEO_EVENT_KINDS.includes(kind)) { scene.video = idol.id; scene.kind = kind; }
  return scene;
}

// ---------- 結成 ----------
function formUnit(state, ids, unitName) {
  const lim = unitSizeLimits(state.candidates.length);
  if (ids.length < lim.min || ids.length > lim.max) throw new Error(`${lim.min}〜${lim.max}人で結成してください`);
  const year = yearOf(state.week);
  const unit = {
    id: 'u' + state.nextUnitNo,
    gen: state.nextUnitNo,
    name: unitName || UNIT_NAME_SUGGEST[(state.nextUnitNo - 1) % UNIT_NAME_SUGGEST.length],
    members: ids.map((id) => state.candidates.find((c) => c.id === id)),
    startYear: year,
    bond: C.START_BOND,
    fans: C.START_FANS,
    liveResults: [],
    venue: 0,
    lastSetLv: 0,
    songs: [],
    songCount: 0,
  };
  state.nextUnitNo++;
  state.units.push(unit);
  for (let k = 0; k < C.SONGS_AT_FORMATION; k++) addSong(state, unit, k === 0 ? 'デビュー曲' : 'カップリング');
  state.usedNames = state.usedNames.concat(state.candidates.map((c) => c.name));
  state.candidates = [];
  state.phase = 'home';
  pushLog(state, `${unitLabel(unit)}を結成した!(${unit.members.length}人)`);
  return unit;
}

// ---------- 週の計画と実行 ----------
// opts: { target: 'unit' | idolId | 'president', stat: 'tech'|'sense'|'visual' }
function setPlan(state, unitId, action, opts) { state.plan[unitId] = { action, opts: opts || {} }; }
function setLiveUnit(state, unitId) {
  state.liveUnitId = unitId;
  delete state.plan[unitId];
}
// 行動が必要なユニット(今週ライブに出るユニット以外)
function actingUnits(state) {
  const lu = liveUnitThisWeek(state);
  return state.units.filter((u) => !lu || u.id !== lu.id);
}
function canRunWeek(state) {
  const l = liveOfWeek(state, state.week);
  if (l && l.type === 'regular' && !findUnit(state, state.liveUnitId)) return { ok: false, why: 'ライブに出るユニットを選んでください' };
  const missing = actingUnits(state).filter((u) => !state.plan[u.id]);
  if (missing.length) return { ok: false, why: `${missing.map((u) => u.name).join('、')}の行動を選んでください` };
  return { ok: true };
}
// 各ユニットの行動を実行。ライブがあれば stage を 'live' にする
function runActions(state) {
  const results = [];
  for (const u of actingUnits(state)) {
    const p = state.plan[u.id];
    results.push(doAction(state, u, p.action, p.opts));
  }
  state.plan = {};
  state.stage = liveUnitThisWeek(state) ? 'live' : 'plan';
  return results;
}
// 週末処理をして次の週へ。戻り値:再生するシーン
function finishWeek(state) {
  const scenes = endWeek(state);
  advanceWeek(state);
  return scenes;
}

function doAction(state, unit, action, opts) {
  opts = opts || {};
  const rng = weekRng(state, 'act:' + unit.id);
  const res = { action, unitId: unit.id, title: '', lines: [], log: [] };
  const fns = { lesson: actLesson, work: actWork, sns: actSns, outing: actOuting, rest: actRest };
  fns[action](state, unit, opts, rng, res);
  res.title = `${unit.name}|${res.title}`;
  res.log.forEach((l) => pushLog(state, `${unit.name}:${l}`));
  return res;
}

function lessonGain(state, idol, stat, mul, rng) {
  const L = C.LESSON;
  let g = L.UNIT_GAIN * mul;
  g *= C.CONDITION_LESSON_MOD[idol.condition + 2];
  g *= 1 + state.invest.lesson * INVESTMENTS.lesson.effect;
  if (PERF_SPECIALTIES[idol.perf].stat === stat) g *= L.SPECIALTY_MUL;
  if (idol.personality === 'pro') g *= 1.1;
  g *= 0.85 + rng() * 0.3;
  const failed = rng() < failChance(idol);
  if (failed) g *= L.FAIL_MUL;
  return { gain: Math.round(g * 10) / 10, failed };
}

function actLesson(state, unit, opts, rng, res) {
  const L = C.LESSON;
  if (opts.stat === 'song') return actSongPractice(state, unit, opts, rng, res);
  const stat = opts.stat || 'tech';
  res.title = `${STAT_NAMES[stat]}レッスン`;
  const solo = opts.target && opts.target !== 'unit';
  for (const idol of unit.members) {
    if (solo && idol.id !== opts.target) {
      addStamina(idol, L.SOLO_OTHERS_RECOVER);
      continue;
    }
    const { gain, failed } = lessonGain(state, idol, stat, solo ? L.SOLO_MUL : 1, rng);
    addStat(idol, stat, gain);
    if (!solo) for (const k of ['tech', 'sense', 'visual']) if (k !== stat) addStat(idol, k, L.UNIT_SUB_GAIN);
    const drain = (solo ? L.SOLO_STAMINA : L.UNIT_STAMINA) * (idol.personality === 'pro' ? 1.15 : 1);
    addStamina(idol, -drain);
    if (failed) addCondition(idol, -1);
    if (solo) idol.focus += L.SOLO_FOCUS;
    res.lines.push({ speaker: idol.id, text: failed ? idolLine(idol, 'tired', rng) : idolLine(idol, 'lesson', rng) });
    res.log.push(`${idol.name}の${STAT_NAMES[stat]} +${gain}${failed ? '(体力不足で失敗気味)' : ''}`);
  }
  if (!solo) {
    addBond(unit, L.UNIT_BOND);
    res.log.push(`絆 +${L.UNIT_BOND}`);
  }
}

// 持ち歌練習:ユニット全員で1曲を練習して曲の経験値を上げる(能力は少しだけ上がる)
function actSongPractice(state, unit, opts, rng, res) {
  const L = C.LESSON;
  const song = findSong(unit, opts.songId) || unit.songs[0];
  res.title = `持ち歌練習「${song.title}」`;
  for (const idol of unit.members) {
    for (const k of ['tech', 'sense', 'visual']) addStat(idol, k, L.UNIT_SUB_GAIN);
    addStamina(idol, -L.UNIT_STAMINA);
    res.lines.push({ speaker: idol.id, text: idolLine(idol, 'lesson', rng) });
  }
  const up = addSongExp(song, C.SONG_EXP_PRACTICE);
  addBond(unit, L.UNIT_BOND);
  res.log.push(`「${song.title}」の経験値 +${C.SONG_EXP_PRACTICE}${up ? `(Lv${song.level}にアップ!)` : `(Lv${song.level})`}`, `絆 +${L.UNIT_BOND}`);
}

function workMoneyMul(state) {
  return (1 + state.invest.staff * INVESTMENTS.staff.effect) * (1 + state.fame * C.WORK.FAME_MONEY_MUL);
}

function actWork(state, unit, opts, rng, res) {
  const W = C.WORK;
  if (opts.target === 'president') {
    const job = rng.pick(PRESIDENT_JOBS);
    const money = Math.round(W.PRESIDENT_MONEY * (1 + (officeScale(state) - 1) * W.PRESIDENT_SCALE_MUL) * (0.9 + rng() * 0.2));
    state.money += money;
    unit.members.forEach((i) => addStamina(i, W.PRESIDENT_IDOL_RECOVER));
    res.title = '社長の仕事:' + job;
    res.lines.push({ speaker: 'p', text: `今週は俺が稼ぐ番だ。「${job}」に行ってくる。` });
    res.log.push(`社長の仕事で ¥${money.toLocaleString()} を稼いだ。メンバーは自主練(体力 +${W.PRESIDENT_IDOL_RECOVER})`);
    return;
  }
  const solo = opts.target && opts.target !== 'unit';
  const job = rng.pick(JOBS);
  res.title = 'お仕事:' + job.name;
  const members = solo ? [findIdol(state, opts.target)] : unit.members;
  let money = (solo ? W.SOLO_MONEY : W.UNIT_MONEY) * workMoneyMul(state);
  let fans = solo ? W.SOLO_FANS : W.UNIT_FANS;
  let matched = false;
  for (const idol of members) {
    const failed = rng() < failChance(idol) + (idol.condition < 0 ? 0.1 : 0);
    if (job.spec && idol.off === job.spec) matched = true;
    addStat(idol, 'talk', W.TALK_GAIN * (failed ? 0.5 : 1));
    addStat(idol, rng.pick(['tech', 'sense', 'visual']), 1);
    addStamina(idol, -(solo ? W.SOLO_STAMINA : W.UNIT_STAMINA));
    if (failed) { addCondition(idol, -1); money *= 0.8; } else if (rng() < 0.3) addCondition(idol, 1);
    if (solo) { idol.focus += W.SOLO_FOCUS; addAffection(idol, W.SOLO_AFFECTION); }
    fans += idol.stats.talk * 2 * (solo ? 1 : 3 / unit.members.length);
    res.lines.push({ speaker: idol.id, text: failed ? idolLine(idol, 'tired', rng) : idolLine(idol, 'work', rng) });
  }
  if (matched) {
    money *= W.SPECIALTY_MUL; fans *= W.SPECIALTY_MUL;
    res.log.push('得意分野にぴったりの仕事だった!(報酬 ×1.5)');
  }
  if (job.spec === 'culture' && matched) addFame(state, W.FAME);
  money = Math.round(money * (0.9 + rng() * 0.2));
  state.money += money;
  const gotFans = addFans(state, unit, fans * (1 + state.fame / 50));
  addFame(state, W.FAME);
  res.log.push(`報酬 ¥${money.toLocaleString()}、ファン +${gotFans}`);
}

function actSns(state, unit, opts, rng, res) {
  const S = C.SNS;
  const solo = opts.target && opts.target !== 'unit';
  const members = solo ? [findIdol(state, opts.target)] : unit.members;
  res.title = solo ? `SNS:${members[0].name}の投稿` : 'SNS:ユニット投稿';
  let fans = solo ? S.SOLO_FANS : S.UNIT_FANS;
  const avgVisual = members.reduce((a, i) => a + i.stats.visual, 0) / members.length;
  fans *= 1 + avgVisual / S.VISUAL_DIV * 2;
  let flame = false;
  for (const idol of members) {
    if (idol.off === 'variety') fans *= 1 + 0.3 / members.length * (solo ? 1 : 2);
    if (idol.personality === 'azatoi') fans *= 1 + 0.2 / members.length * (solo ? 1 : 2);
    const fc = (S.FLAME_CHANCE + (idol.condition < 0 ? S.FLAME_LOW_COND_CHANCE : 0)) / (solo ? 1 : Math.sqrt(members.length));
    if (rng() < fc) flame = true;
    addStamina(idol, -S.STAMINA);
    if (solo) idol.focus += S.SOLO_FOCUS;
    addAffection(idol, solo ? S.SOLO_AFFECTION : S.UNIT_AFFECTION);
    res.lines.push({ speaker: idol.id, text: idolLine(idol, 'sns', rng) });
  }
  if (flame) {
    const loss = Math.round(unit.fans * S.FLAME_FAN_LOSS);
    unit.fans -= loss;
    members.forEach((i) => addCondition(i, -1));
    res.lines.push({ speaker: 'n', text: '投稿の一部が切り取られて、ちょっとした炎上に…!' });
    res.log.push(`炎上してファン -${loss}、調子ダウン`);
  } else {
    fans *= 1 + state.fame / S.FAME_FAN_DIV;
    const got = addFans(state, unit, fans * (0.8 + rng() * 0.4));
    addFame(state, S.FAME);
    res.log.push(`ファン +${got}、知名度アップ`);
  }
}

function actOuting(state, unit, opts, rng, res) {
  const O = C.OUTING;
  const solo = opts.target && opts.target !== 'unit';
  if (solo) {
    const idol = findIdol(state, opts.target);
    res.title = `${idol.name}とお出かけ`;
    state.money -= O.SOLO_COST;
    addAffection(idol, O.SOLO_AFFECTION, 'outing');
    addCondition(idol, 1);
    addStamina(idol, -O.STAMINA);
    idol.focus += O.SOLO_FOCUS;
    res.lines.push({ speaker: idol.id, text: idolLine(idol, 'outing', rng) });
    const R = RELATIONS[idol.relation];
    if (idol.relation === 'tsundere') res.lines.push({ speaker: idol.id, text: idol.accepted ? R.reactOutingAccepted[0] : R.reactOuting[0] });
    else if (idol.relation === 'accomplice') R.reactOuting.forEach((t) => res.lines.push({ speaker: idol.id, text: t }));
    else res.lines.push({ speaker: idol.id, text: R.reactOuting[0] });
    res.log.push(`${idol.name}の親愛度と調子が上がった(-¥${O.SOLO_COST.toLocaleString()})`);
  } else {
    res.title = 'みんなでお出かけ';
    const cost = Math.round(O.UNIT_COST * unit.members.length / 3);
    state.money -= cost;
    unit.members.forEach((i) => {
      addAffection(i, O.UNIT_AFFECTION, 'outing'); addCondition(i, 1); addStamina(i, -O.STAMINA);
      res.lines.push({ speaker: i.id, text: idolLine(i, 'outing', rng) });
    });
    addBond(unit, O.UNIT_BOND);
    res.log.push(`全員の親愛度・調子、絆 +${O.UNIT_BOND}(-¥${cost.toLocaleString()})`);
  }
}

function actRest(state, unit, opts, rng, res) {
  const R = C.REST;
  res.title = 'お休み';
  const rec = R.STAMINA + state.invest.dorm * INVESTMENTS.dorm.effect;
  unit.members.forEach((i) => {
    addStamina(i, rec);
    if (rng() < R.COND_UP_CHANCE) addCondition(i, 1);
    res.lines.push({ speaker: i.id, text: idolLine(i, 'rest', rng) });
  });
  state.money += R.PRESIDENT_MONEY;
  res.log.push(`全員の体力 +${rec}。社長は事務作業で ¥${R.PRESIDENT_MONEY.toLocaleString()}`);
}

// ---------- 週末処理 ----------
function endWeek(state) {
  const rng = weekRng(state, 'end');
  const scenes = [];
  for (const idol of allIdols(state)) {
    const dormStab = state.invest.dorm * 0.03;
    let down = C.CONDITION_DRIFT.down - dormStab + (idol.stamina < C.LOW_STAMINA ? C.CONDITION_LOW_STAMINA_DOWN : 0);
    let up = C.CONDITION_DRIFT.up + idol.affection / 500;
    if (idol.personality === 'mypace') { down *= 0.6; up *= 0.6; }
    const x = rng();
    if (x < down) addCondition(idol, -1);
    else if (x > 1 - up) addCondition(idol, 1);
  }
  scenes.push(...checkRelationEvents(state));
  // ランダムイベント(ユニットごとに抽選)
  for (const unit of state.units) {
    if (rng() < C.RANDOM_EVENT_CHANCE) {
      const ev = pickRandomEvent(state, unit, rng);
      if (ev) scenes.push(ev);
    }
  }
  return scenes;
}

// ツンデレの「認める」と、エピソード解放
function checkRelationEvents(state) {
  const scenes = [];
  for (const idol of allIdols(state)) {
    if (!idol.accepted && idolTotalStats(idol) >= C.TSUNDERE_ACCEPT_STATS) scenes.push(acceptScene(state, idol));
    scenes.push(...checkEpisodes(state, idol));
  }
  return scenes;
}

function acceptScene(state, idol) {
  idol.accepted = true;
  addAffection(idol, 5);
  pushLog(state, `${idol.name}が社長を認めた!(親愛度が上がりやすくなった)`);
  return withVideo(makeScene(`${idol.name}:才能を認めた日`, idol, RELATIONS.tsundere.acceptScene), idol, 'accept');
}

function checkEpisodes(state, idol) {
  const scenes = [];
  while (idol.episodesSeen < 3 && idol.affection >= C.EPISODE_THRESHOLDS[idol.episodesSeen]) {
    const n = idol.episodesSeen;
    idol.episodesSeen++;
    idol.focus += 3;
    pushLog(state, `${idol.name}のエピソード${n + 1}が解放された`);
    scenes.push(episodeScene(state, idol, n));
  }
  return scenes;
}

function episodeScene(state, idol, n) {
  const P = PERSONALITIES[idol.personality];
  if (n < 2) return withVideo(makeScene(`${idol.name} エピソード${n + 1}`, idol, P.episodes[n]), idol, 'episode');
  const raw = HONNE_TEMPLATES[idol.relation](P.honneCore);
  return withVideo(makeScene(`${idol.name} エピソード3「本音」`, idol, raw, [
    {
      label: '黙って、最後まで受け止める',
      apply: (st) => {
        const i = findIdol(st, idol.id) || idol;
        const u = unitOfIdol(st, i.id);
        if (!i.honne) { i.honne = true; addAffection(i, 5); if (u) addBond(u, 3); }
        return `${i.name}の本音を受け止めた。(本音イベント回収)`;
      },
    },
    {
      label: '「らしくないな」と冗談で返す',
      apply: () => `${idol.name}は少し笑って、いつもの顔に戻った。(あとでアイドルの詳細から見直せる)`,
    },
  ]), idol, 'honne');
}

// ---------- ランダムイベント(u = 対象ユニット) ----------
const RANDOM_EVENTS = [
  {
    id: 'snack', weight: 3,
    make: (s, u, r) => {
      const i = r.pick(u.members);
      addAffection(i, 3);
      return makeScene('差し入れ', i, [['n', '{name}が、手作りのおにぎりを持ってきてくれた。'], ['i', idolLine(i, 'greet', r)], ['n', `${i.name}の親愛度が上がった。`]]);
    },
  },
  {
    id: 'rain', weight: 2,
    make: (s, u) => makeScene(`突然の雨(${u.name})`, null, [['n', `レッスン帰り、突然の土砂降り。${u.name}のみんなで軒下に駆け込んだ。`]], [
      { label: 'みんなで雨宿りしながら話す', apply: () => { addBond(u, 5); return '他愛ない話で盛り上がった。(絆 +5)'; } },
      { label: 'タクシー代を出す(¥10,000)', apply: (st) => { st.money -= 10000; u.members.forEach((i) => addCondition(i, 1)); return '濡れずに帰れた。(全員の調子 +1)'; } },
    ]),
  },
  {
    id: 'rival', weight: 2,
    make: (s, u) => {
      const rival = (C.VENUES[(u.venue || 0) + 1] || C.FINAL).rival;
      return makeScene(`ライバルの挑発(${u.name})`, null, [['n', `テレビ局の廊下で「${rival}」とすれ違った。`], ['n', '「弱小事務所は、せいぜい頑張ってね」']], [
        { label: '「受けて立つ」と言い返す', apply: () => { u.members.forEach((i) => addCondition(i, 1)); addBond(u, 3); return '全員の目に火がついた!(調子 +1、絆 +3)'; } },
        { label: '笑って受け流す', apply: (st) => { addFame(st, 2); return '大人の対応が記者の目に留まった。(知名度 +2)'; } },
      ]);
    },
  },
  {
    id: 'scandal', weight: 1, cond: (s, u) => u.fans > 3000,
    make: (s, u, r) => {
      const i = r.pick(u.members);
      return makeScene('熱愛疑惑!?', i, [['n', '週刊誌に{name}の「熱愛疑惑」が載った。相手は…実のお兄さんだ。']], [
        { label: '正直に説明する', apply: () => { addAffection(i, 6); const l = Math.round(u.fans * 0.01); u.fans -= l; return `誤解はすぐに解けた。${i.name}は社長への信頼を深めた。(ファン -${l})`; } },
        { label: 'ノーコメントを貫く', apply: (st) => { const l = Math.round(u.fans * 0.04); u.fans -= l; addFame(st, 3); return `話題にはなったが、ファンは減った。(ファン -${l}、知名度 +3)`; } },
      ]);
    },
  },
  {
    id: 'interview', weight: 2,
    make: (s, u) => { addFame(s, 4); const g = addFans(s, u, 500); return makeScene('取材依頼', null, [['n', `地元のWebメディアから${u.name}に取材が来た!`], ['n', `知名度 +4、ファン +${g}`]]); },
  },
  {
    id: 'sick', weight: 2,
    make: (s, u, r) => {
      const i = r.pick(u.members);
      addStamina(i, -20);
      return makeScene('体調不良', i, [['n', '{name}が少し熱っぽいようだ。(体力 -20)'], ['i', idolLine(i, 'tired', r)]], [
        { label: '病院に連れて行く(¥8,000)', apply: (st) => { st.money -= 8000; addStamina(i, 15); addAffection(i, 3); return `${i.name}はすぐに元気を取り戻した。(体力 +15)`; } },
        { label: '本人に任せる', apply: () => { addCondition(i, -1); return `${i.name}は無理をして、調子を崩した。`; } },
      ]);
    },
  },
  {
    id: 'quarrel', weight: 2, cond: (s, u) => u.bond < 50,
    make: (s, u, r) => {
      const [a, b] = r.shuffle(u.members);
      return makeScene(`ユニット内のケンカ(${u.name})`, a, [['n', `${a.name}と${b.name}が、振り付けのことで言い争っている。`]], [
        { label: '間に入って話を聞く', apply: () => { addBond(u, 6); return '本音をぶつけ合って、前より仲良くなった。(絆 +6)'; } },
        { label: '二人に任せて見守る', apply: (st) => { const ok = makeRng(st.seed + st.week + u.id + 'q')() < 0.5; addBond(u, ok ? 8 : -5); return ok ? '二人だけで仲直りできた!(絆 +8)' : 'わだかまりが残った…(絆 -5)'; } },
      ]);
    },
  },
  {
    id: 'letter', weight: 2,
    make: (s, u) => { u.members.forEach((i) => addAffection(i, 2)); const g = addFans(s, u, 200); return makeScene('ファンレター', null, [['n', `${u.name}宛てに、段ボール一箱分のファンレターが届いた!`], ['n', `全員の親愛度 +2、ファン +${g}`]]); },
  },
  {
    id: 'oldfriend', weight: 1,
    make: (s, u) => makeScene('社長の昔なじみ', null, [['n', '昔の仕事仲間から「ちょっとした頼みごと」の電話が来た。']], [
      { label: '引き受ける', apply: (st) => { st.money += 50000; return '謝礼として ¥50,000 をもらった。'; } },
      { label: `${u.name}を売り込む`, apply: (st) => { addFame(st, 3); addFans(st, u, 300); return 'ユニットを紹介してもらえた。(知名度 +3、ファン +300)'; } },
    ]),
  },
  {
    id: 'nightpractice', weight: 2,
    make: (s, u, r) => {
      const i = r.pick(u.members);
      const st0 = r.pick(['tech', 'sense', 'visual']);
      return makeScene('深夜の自主練', i, [['n', '夜遅く、スタジオに{name}が一人で残っている。']], [
        { label: '止めて帰らせる', apply: () => { addAffection(i, 3); return `${i.name}は少しむくれながらも帰っていった。(親愛度 +3)`; } },
        { label: 'とことん付き合う', apply: () => { addStat(i, st0, 5); addStamina(i, -10); addAffection(i, 2); i.focus += 1; return `${i.name}の${STAT_NAMES[st0]} +5(体力 -10)`; } },
      ]);
    },
  },
  {
    id: 'unitdinner', weight: 2,
    make: (s, u) => makeScene(`ごはん会(${u.name})`, null, [['n', `${u.name}のメンバーから「みんなでごはん行きたい!」と提案があった。`]], [
      { label: '社長のおごりで行く(¥20,000)', apply: (st) => { st.money -= 20000; addBond(u, 6); u.members.forEach((i) => addAffection(i, 2)); return '焼肉で大いに盛り上がった。(絆 +6、親愛度 +2)'; } },
      { label: '今回は見送る', apply: () => '「また今度ね」と、少し寂しそうだった。' },
    ]),
  },
  {
    id: 'senpai', weight: 2, cond: (s, u) => s.units.some((o) => o.startYear < u.startYear),
    make: (s, u, r) => {
      const senpaiUnit = r.pick(s.units.filter((o) => o.startYear < u.startYear));
      const sp = r.pick(senpaiUnit.members), kh = r.pick(u.members);
      return makeScene('先輩と後輩', sp, [['n', `${senpaiUnit.name}の{name}が、後輩の${kh.name}の練習を見てくれている。`], ['i', idolLine(sp, 'lesson', r)]], [
        { label: 'そのまま任せる', apply: () => { addStat(kh, r.pick(['tech', 'sense', 'visual']), 4); addAffection(sp, 2); return `${kh.name}の能力が上がった。先輩の${sp.name}もうれしそうだ。`; } },
        { label: '合同練習に切り替える', apply: () => { addBond(u, 3); addBond(senpaiUnit, 3); return `2つのユニットの絆がそれぞれ +3`; } },
      ]);
    },
  },
];

function gapEventFor(state, unit, rng) {
  const cands = unit.members.filter((i) => !i.gapRevealed);
  if (!cands.length) return null;
  const i = rng.pick(cands);
  i.gapRevealed = true;
  addAffection(i, 5);
  i.focus += 1;
  pushLog(state, `${i.name}の意外な一面を知った`);
  const raw = PERSONALITIES[i.personality].gapScene.concat([['n', `【ギャップ】${PERSONALITIES[i.personality].gap}(親愛度 +5)`]]);
  return withVideo(makeScene(`${i.name}の意外な一面`, i, raw), i, 'gap');
}

function pickRandomEvent(state, unit, rng) {
  if (rng() < C.GAP_EVENT_CHANCE) {
    const g = gapEventFor(state, unit, rng);
    if (g) return g;
  }
  const pool = RANDOM_EVENTS.filter((e) => !e.cond || e.cond(state, unit));
  const ev = rng.weighted(pool, (e) => e.weight);
  state.seenEvents[ev.id] = (state.seenEvents[ev.id] || 0) + 1;
  return ev.make(state, unit, rng);
}

// 週を進める
function advanceWeek(state) {
  state.week++;
  state.plan = {};
  state.liveUnitId = null;
  state.stage = 'plan';
  if (weekInYear(state.week) === 1) {
    for (const u of state.units) {
      for (let k = 0; k < C.SONG_EACH_YEAR; k++) {
        const song = addSong(state, u, '周年シングル');
        if (song) pushLog(state, `${u.name}に周年シングル「${song.title}」が届いた`);
      }
    }
    state.candidates = generateCandidates(state.seed, yearOf(state.week), state._metaLoopBonus || 0, state.usedNames);
    ensureCharacters(state);
    state.phase = 'scout';
  } else {
    state.phase = 'home';
  }
  return state.phase;
}

// ---------- ショップ ----------
function investCost(state, key) {
  return Math.round(INVESTMENTS[key].baseCost * Math.pow(C.INVEST_COST_GROWTH, state.invest[key]) / 1000) * 1000;
}
function canInvest(state, key) {
  const inv = INVESTMENTS[key];
  if (state.invest[key] >= C.INVEST_MAX_LV) return { ok: false, why: '最大レベル' };
  if (officeRankIndex(state) < inv.unlockRank) return { ok: false, why: `事務所規模「${C.OFFICE_RANKS[inv.unlockRank].name}」で解放` };
  if (state.money < investCost(state, key)) return { ok: false, why: '資金不足' };
  return { ok: true };
}
function buyInvest(state, key) {
  const c = canInvest(state, key);
  if (!c.ok) return c;
  state.money -= investCost(state, key);
  state.invest[key]++;
  pushLog(state, `${INVESTMENTS[key].name}に投資した(Lv${state.invest[key]})。事務所規模:${officeRankName(state)}`);
  return { ok: true };
}
function buyItem(state, key) {
  const it = ITEMS[key];
  if (state.money < it.price) return { ok: false, why: '資金不足' };
  state.money -= it.price;
  state.items[key]++;
  return { ok: true };
}
function costumePrice(state, key) {
  const p = COSTUMES[key].price;
  if (p == null) return null;
  const designer = allIdols(state).some((i) => i.off === 'design');
  return designer ? Math.round(p * 0.8) : p;
}
function buyCostume(state, key) {
  const p = costumePrice(state, key);
  if (p == null) return { ok: false, why: '非売品' };
  if (state.costumes.includes(key)) return { ok: false, why: '所持済み' };
  if (state.money < p) return { ok: false, why: '資金不足' };
  state.money -= p;
  state.costumes.push(key);
  pushLog(state, `衣装「${COSTUMES[key].name}」を購入した`);
  return { ok: true };
}
function equipCostume(state, idolId, key) {
  const idol = findIdol(state, idolId);
  if (idol && state.costumes.includes(key)) idol.costume = key;
}
// target: アイテムが idol 向けなら idolId、unit 向けなら unitId
function useItem(state, key, target) {
  if (!state.items[key]) return { ok: false };
  const idol = ITEMS[key].target === 'idol' ? findIdol(state, target) : null;
  const unit = ITEMS[key].target === 'unit' ? findUnit(state, target) : null;
  if (!idol && !unit) return { ok: false };
  switch (key) {
    case 'drink': addStamina(idol, 30); break;
    case 'charm': addCondition(idol, 1); break;
    case 'gift': addAffection(idol, 6); break;
    case 'camp': addBond(unit, 6); break;
    case 'supple': unit.members.forEach((i) => addStamina(i, 15)); break;
  }
  state.items[key]--;
  pushLog(state, `${ITEMS[key].name}を使った(${idol ? idol.name : unit.name})`);
  return { ok: true, scenes: idol ? checkEpisodes(state, idol) : [] };
}

// ---------- 持ち歌 ----------
function songLevelFromExp(exp) {
  let lv = 1;
  C.SONG_LV_EXP.forEach((need, i) => { if (exp >= need) lv = i + 1; });
  return Math.min(lv, C.SONG_LV_MAX);
}
function addSong(state, unit, label) {
  if (unit.songs.length >= C.SONG_MAX) return null;
  const n = (unit.songCount || 0) + 1;
  unit.songCount = n;
  const seed = state.seed + ':rep:' + unit.id + ':' + n;
  const g = generateSong(seed, { liveIndex: Math.min(6, Math.floor(n / 2)) });
  const song = { id: unit.id + 's' + n, songNo: n, seed, title: g.title, bpm: g.bpm, mode: g.mode, level: 1, exp: 0, plays: 0, label: label || '' };
  unit.songs.push(song);
  return song;
}
function findSong(unit, id) { return unit.songs.find((x) => x.id === id) || null; }
function addSongExp(song, v) {
  const before = song.level;
  song.exp += v;
  song.level = songLevelFromExp(song.exp);
  return song.level > before;
}
function newSongCost(state, unit) {
  return unit.members.some((i) => i.off === 'songwriting') ? Math.round(C.NEW_SONG_COST / 2) : C.NEW_SONG_COST;
}
function buyNewSong(state, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, why: 'ユニットがありません' };
  if (unit.songs.length >= C.SONG_MAX) return { ok: false, why: `持ち歌は${C.SONG_MAX}曲まで` };
  const cost = newSongCost(state, unit);
  if (state.money < cost) return { ok: false, why: '資金不足' };
  state.money -= cost;
  const song = addSong(state, unit, '新曲');
  pushLog(state, `${unit.name}の新曲「${song.title}」が完成した`);
  return { ok: true, song };
}

// ---------- ライブ ----------
const venueOf = (unit) => C.VENUES[unit.venue || 0];
// 次の箱(最上位なら null)
function nextVenue(unit) { return C.VENUES[(unit.venue || 0) + 1] || null; }

function liveSetup(state, unit) {
  const l = liveOfWeek(state, state.week);
  const isFinal = !!(l && l.type === 'final' && l.unitId === unit.id);
  const V = isFinal ? C.FINAL : venueOf(unit);
  const songSeed = state.seed + ':live:' + state.week + ':' + unit.id;
  const rngR = makeRng(songSeed + ':rival');
  const rivalPerSong = Math.round(V.rivalScore * (1 - C.RIVAL_VARIANCE + rngR() * C.RIVAL_VARIANCE * 2));
  const maxSongs = Math.min(isFinal ? C.FINAL.songs : V.maxSongs, unit.songs.length);
  const minSongs = isFinal ? maxSongs : 1;
  return {
    unitId: unit.id, isFinal, venue: unit.venue || 0, venueName: isFinal ? C.FINAL.name : V.name, cap: V.cap || null,
    liveNo: unit.liveResults.length + 1, rival: V.rival, rivalPerSong, maxSongs, minSongs, density: V.density, fanMul: V.fanMul, money: V.money, songSeed,
  };
}

// 1曲ぶんの楽曲と譜面(持ち歌のシードから生成するので、同じ曲はいつも同じ曲・同じ譜面)
function songChart(song, setup) {
  const g = generateSong(song.seed, { liveIndex: Math.min(6, Math.floor((song.songNo || 0) / 2)) });
  return { song: g, chart: generateChart(g, setup.density) };
}

// results: 曲ごとの computeLiveScore の戻り値、setlist: 演奏した持ち歌のID(同じ順)
function applyLiveResult(state, unit, setup, centerId, results, setlist) {
  const total = results.reduce((x, r) => x + r.total, 0);
  const rivalTotal = setup.rivalPerSong * results.length;
  const win = total >= rivalTotal;
  const rewards = [];
  const fanGain = addFans(state, unit, total * (win ? C.LIVE_FANS_WIN_RATE : C.LIVE_FANS_LOSE_RATE) * setup.fanMul);
  rewards.push(`ファン +${fanGain.toLocaleString()}`);
  const money = Math.round(setup.money * (win ? 1 : C.LIVE_MONEY_LOSE_RATE));
  state.money += money;
  rewards.push(`¥${money.toLocaleString()}`);
  addBond(unit, win ? C.LIVE_BOND_WIN : C.LIVE_BOND_LOSE);
  rewards.push(`絆 +${win ? C.LIVE_BOND_WIN : C.LIVE_BOND_LOSE}`);
  addFame(state, win ? 5 : 2);
  const center = findIdol(state, centerId);
  center.focus += C.LIVE_FOCUS_CENTER;
  unit.members.forEach((i) => { addStamina(i, -C.LIVE_STAMINA_PER_SONG * results.length); addAffection(i, win ? 3 : 1); });
  // 演奏した曲の経験値
  const lvUps = [];
  setlist.forEach((id, k) => {
    const song = findSong(unit, id);
    if (!song) return;
    song.plays++;
    const up = addSongExp(song, C.SONG_EXP_PLAY + (results[k].total >= setup.rivalPerSong ? C.SONG_EXP_WIN : 0));
    if (up) lvUps.push(`「${song.title}」Lv${song.level}`);
  });
  if (lvUps.length) rewards.push('曲レベルアップ:' + lvUps.join('、'));
  // 箱レベル:ファン数と、今回の演奏曲レベルの合計で判定
  const setLv = setlist.reduce((x, id) => x + ((findSong(unit, id) || {}).level || 0), 0);
  unit.lastSetLv = setLv;
  let venueUp = null;
  const nv = nextVenue(unit);
  if (!setup.isFinal && nv && unit.fans >= nv.needFans && setLv >= nv.needSongLv) {
    unit.venue = (unit.venue || 0) + 1;
    venueUp = nv.name;
    rewards.push(`箱が「${nv.name}」にレベルアップ!`);
    pushLog(state, `${unit.name}の箱が「${nv.name}」(${nv.cap.toLocaleString()}人)になった`);
  }
  const scenes = [];
  const reward = C.LIVE_COSTUME_REWARD[setup.venue];
  if (!setup.isFinal && win && reward && !state.costumes.includes(reward)) {
    state.costumes.push(reward);
    rewards.push(`衣装「${COSTUMES[reward].name}」`);
  }
  if (win && !center.accepted) scenes.push(acceptScene(state, center));
  unit.liveResults.push({ week: state.week, venue: setup.venue, venueName: setup.venueName, songs: results.length, score: total, rival: rivalTotal, win, center: centerId, final: setup.isFinal, setLv });
  pushLog(state, `${unit.name} ${setup.venueName}(${results.length}曲):${total.toLocaleString()}点 vs ${setup.rival} ${rivalTotal.toLocaleString()}点 → ${win ? '勝利!' : '敗北…'}`);
  scenes.push(...checkRelationEvents(state));
  return { win, total, rivalTotal, rewards, scenes, venueUp, setLv };
}

// 決勝のあと:エンディングを判定し、ユニットを卒業させる
function graduateUnit(state, unit, finalScore) {
  const ev = evaluateEnding(unit, finalScore);
  const record = {
    gen: unit.gen, name: unit.name, ending: ev.id, finalScore, fans: unit.fans, bond: unit.bond,
    week: state.week, members: unit.members.map((i) => ({ ...i, stats: { ...i.stats }, look: { ...i.look } })),
    wins: unit.liveResults.filter((l) => l.win).length, losses: unit.liveResults.filter((l) => !l.win).length,
    bias: ev.bias, venue: unit.venue || 0, venueName: C.VENUES[unit.venue || 0].name,
  };
  state.alumni.push(record);
  state.units = state.units.filter((u) => u !== unit);
  pushLog(state, `${unitLabel(unit)}が卒業した(${ENDINGS[ev.id].name})`);
  return { ev, record };
}
