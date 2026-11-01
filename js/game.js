// ============================================================
// ゲーム進行ロジック(DOMに依存しない。テストからも読み込む)
// ============================================================

// ---------- 状態 ----------
function newGameState(seed, meta) {
  meta = meta || defaultMeta();
  const loopStack = Math.min(meta.loops, C.LOOP.MAX_STACK);
  const s = {
    version: 1,
    seed: String(seed),
    week: 1,
    phase: 'scout',
    money: C.START_MONEY + loopStack * C.LOOP.MONEY_BONUS,
    fans: C.START_FANS,
    fame: C.START_FAME,
    bond: C.START_BOND,
    unitName: '',
    unit: [],
    candidates: [],
    invest: { lesson: 0, pr: 0, dorm: 0, staff: 0, studio: 0 },
    items: { drink: 0, charm: 0, gift: 0, camp: 0, supple: 0 },
    costumes: Array.from(new Set(['school'].concat(meta.costumes || []))),
    liveResults: [],
    log: [],
    loop: meta.loops,
    usedNames: [],
    seenEvents: {},
    ending: null,
    _metaLoopBonus: loopStack * C.LOOP.STAT_BONUS,
  };
  s.candidates = generateCandidates(s.seed, 1, s._metaLoopBonus, s.usedNames);
  return s;
}

function defaultMeta() {
  return { loops: 0, costumes: [], endings: [], bestFinal: 0, episodes: 0 };
}

const yearOf = (week) => Math.floor((week - 1) / C.WEEKS_PER_YEAR) + 1;
const weekInYear = (week) => ((week - 1) % C.WEEKS_PER_YEAR) + 1;
const totalWeeks = () => C.YEARS * C.WEEKS_PER_YEAR;
const liveIndexOfWeek = (week) => C.LIVE_WEEKS.indexOf(week);
function nextLive(state) {
  const idx = C.LIVE_WEEKS.findIndex((w) => w >= state.week);
  return idx < 0 ? null : { index: idx, week: C.LIVE_WEEKS[idx], inWeeks: C.LIVE_WEEKS[idx] - state.week };
}

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

function findIdol(state, id) { return state.unit.find((i) => i.id === id); }
function pushLog(state, text) {
  state.log.unshift(`[${yearOf(state.week)}年目${weekInYear(state.week)}週] ${text}`);
  if (state.log.length > 40) state.log.length = 40;
}
function weekRng(state, tag) { return makeRng(state.seed + ':w' + state.week + ':' + tag); }

// ---------- 値の増減ヘルパー ----------
function addStamina(idol, v) { idol.stamina = clamp(Math.round(idol.stamina + v), 0, idol.staminaMax); }
function addCondition(idol, v) { idol.condition = clamp(idol.condition + v, -2, 2); }
function addBond(state, v) { state.bond = clamp(Math.round(state.bond + v), 0, C.BOND_MAX); }
function addFame(state, v) { state.fame = clamp(state.fame + v * (1 + state.invest.pr * INVESTMENTS.pr.effect), 0, C.FAME_MAX); }
function addFans(state, v) {
  const gain = v > 0 ? v * (1 + state.invest.pr * INVESTMENTS.pr.effect) : v;
  state.fans = Math.max(0, Math.round(state.fans + gain));
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

// ---------- 候補生の選択 ----------
function formUnit(state, ids, unitName) {
  if (ids.length !== C.UNIT_SIZE) throw new Error('3人選んでください');
  state.unit = ids.map((id) => state.candidates.find((c) => c.id === id));
  state.unitName = unitName || UNIT_NAME_SUGGEST[0];
  state.usedNames = state.usedNames.concat(state.candidates.map((c) => c.name));
  state.candidates = [];
  state.phase = 'home';
  pushLog(state, `ユニット「${state.unitName}」を結成した!`);
}

function swapMember(state, outId, inId) {
  const idx = state.unit.findIndex((i) => i.id === outId);
  const cand = state.candidates.find((c) => c.id === inId);
  if (idx < 0 || !cand) return;
  const out = state.unit[idx];
  state.unit[idx] = cand;
  addBond(state, -15);
  pushLog(state, `${out.name}が卒業し、${cand.name}が加入した。(絆 -15)`);
}

function finishScouting(state) {
  state.usedNames = state.usedNames.concat(state.candidates.map((c) => c.name));
  state.candidates = [];
  state.phase = 'home';
}

// ---------- 週の行動 ----------
// opts: { target: 'unit' | idolId | 'president', stat: 'tech'|'sense'|'visual' }
function doAction(state, action, opts) {
  opts = opts || {};
  const rng = weekRng(state, 'act');
  const res = { action, title: '', lines: [], log: [] };
  const fns = { lesson: actLesson, work: actWork, sns: actSns, outing: actOuting, rest: actRest };
  fns[action](state, opts, rng, res);
  res.log.forEach((l) => pushLog(state, l));
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

function actLesson(state, opts, rng, res) {
  const L = C.LESSON;
  const stat = opts.stat || 'tech';
  res.title = `${STAT_NAMES[stat]}レッスン`;
  const solo = opts.target && opts.target !== 'unit';
  for (const idol of state.unit) {
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
    res.log.push(`${idol.name}:${STAT_NAMES[stat]} +${gain}${failed ? '(体力不足で失敗気味)' : ''}`);
  }
  if (!solo) {
    addBond(state, L.UNIT_BOND);
    res.log.push(`ユニットの絆 +${L.UNIT_BOND}`);
  }
}

function workMoneyMul(state) {
  return (1 + state.invest.staff * INVESTMENTS.staff.effect) * (1 + state.fame * C.WORK.FAME_MONEY_MUL);
}

function actWork(state, opts, rng, res) {
  const W = C.WORK;
  if (opts.target === 'president') {
    const job = rng.pick(PRESIDENT_JOBS);
    const money = Math.round(W.PRESIDENT_MONEY * (1 + (officeScale(state) - 1) * W.PRESIDENT_SCALE_MUL) * (0.9 + rng() * 0.2));
    state.money += money;
    state.unit.forEach((i) => addStamina(i, W.PRESIDENT_IDOL_RECOVER));
    res.title = '社長の仕事:' + job;
    res.lines.push({ speaker: 'p', text: `今週は俺が稼ぐ番だ。「${job}」に行ってくる。` });
    res.log.push(`社長の仕事で ¥${money.toLocaleString()} を稼いだ。アイドルたちは自主練(体力 +${W.PRESIDENT_IDOL_RECOVER})`);
    return;
  }
  const solo = opts.target && opts.target !== 'unit';
  const job = rng.pick(JOBS);
  res.title = 'お仕事:' + job.name;
  const members = solo ? [findIdol(state, opts.target)] : state.unit;
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
    fans += idol.stats.talk * 2;
    res.lines.push({ speaker: idol.id, text: failed ? idolLine(idol, 'tired', rng) : idolLine(idol, 'work', rng) });
  }
  if (matched) {
    money *= W.SPECIALTY_MUL; fans *= W.SPECIALTY_MUL;
    res.log.push('得意分野にぴったりの仕事だった!(報酬 ×1.5)');
  }
  if (job.spec === 'culture' && matched) addFame(state, W.FAME);
  money = Math.round(money * (0.9 + rng() * 0.2));
  state.money += money;
  const gotFans = addFans(state, fans * (1 + state.fame / 50));
  addFame(state, W.FAME);
  res.log.push(`報酬 ¥${money.toLocaleString()}、ファン +${gotFans}`);
}

function actSns(state, opts, rng, res) {
  const S = C.SNS;
  const solo = opts.target && opts.target !== 'unit';
  const members = solo ? [findIdol(state, opts.target)] : state.unit;
  res.title = solo ? `SNS:${members[0].name}の投稿` : 'SNS:ユニット投稿';
  let fans = solo ? S.SOLO_FANS : S.UNIT_FANS;
  let flame = false;
  for (const idol of members) {
    fans *= 1 + idol.stats.visual / S.VISUAL_DIV;
    if (idol.off === 'variety') fans *= 1.3;
    if (idol.personality === 'azatoi') fans *= 1.2;
    const fc = S.FLAME_CHANCE + (idol.condition < 0 ? S.FLAME_LOW_COND_CHANCE : 0);
    if (rng() < fc) flame = true;
    addStamina(idol, -S.STAMINA);
    if (solo) idol.focus += S.SOLO_FOCUS;
    addAffection(idol, solo ? S.SOLO_AFFECTION : S.UNIT_AFFECTION);
    res.lines.push({ speaker: idol.id, text: idolLine(idol, 'sns', rng) });
  }
  if (!solo) state.unit.forEach((i) => { if (!members.includes(i)) addAffection(i, S.UNIT_AFFECTION); });
  if (flame) {
    const loss = Math.round(state.fans * S.FLAME_FAN_LOSS);
    state.fans -= loss;
    members.forEach((i) => addCondition(i, -1));
    res.lines.push({ speaker: 'n', text: '投稿の一部が切り取られて、ちょっとした炎上に…!' });
    res.log.push(`炎上してファン -${loss}、調子ダウン`);
  } else {
    fans *= 1 + state.fame / S.FAME_FAN_DIV;
    const got = addFans(state, fans * (0.8 + rng() * 0.4));
    addFame(state, S.FAME);
    res.log.push(`ファン +${got}、知名度アップ`);
  }
}

function actOuting(state, opts, rng, res) {
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
    res.title = 'ユニットでお出かけ';
    state.money -= O.UNIT_COST;
    state.unit.forEach((i) => {
      addAffection(i, O.UNIT_AFFECTION, 'outing'); addCondition(i, 1); addStamina(i, -O.STAMINA);
      res.lines.push({ speaker: i.id, text: idolLine(i, 'outing', rng) });
    });
    addBond(state, O.UNIT_BOND);
    res.log.push(`全員の親愛度・調子、絆 +${O.UNIT_BOND}(-¥${O.UNIT_COST.toLocaleString()})`);
  }
}

function actRest(state, opts, rng, res) {
  const R = C.REST;
  res.title = 'お休み';
  const rec = R.STAMINA + state.invest.dorm * INVESTMENTS.dorm.effect;
  state.unit.forEach((i) => {
    addStamina(i, rec);
    if (rng() < R.COND_UP_CHANCE) addCondition(i, 1);
    res.lines.push({ speaker: i.id, text: idolLine(i, 'rest', rng) });
  });
  state.money += R.PRESIDENT_MONEY;
  res.log.push(`全員の体力 +${rec}。社長は事務作業で ¥${R.PRESIDENT_MONEY.toLocaleString()}`);
}

// ---------- 週末処理 ----------
// 戻り値:再生するシーンの配列
function endWeek(state) {
  const rng = weekRng(state, 'end');
  const scenes = [];
  // 調子の変動
  for (const idol of state.unit) {
    const dormStab = state.invest.dorm * 0.03;
    let down = C.CONDITION_DRIFT.down - dormStab + (idol.stamina < C.LOW_STAMINA ? C.CONDITION_LOW_STAMINA_DOWN : 0);
    let up = C.CONDITION_DRIFT.up + idol.affection / 500;
    if (idol.personality === 'mypace') { down *= 0.6; up *= 0.6; }
    const x = rng();
    if (x < down) addCondition(idol, -1);
    else if (x > 1 - up) addCondition(idol, 1);
  }
  scenes.push(...checkRelationEvents(state));
  // ランダムイベント
  if (rng() < C.RANDOM_EVENT_CHANCE) {
    const ev = pickRandomEvent(state, rng);
    if (ev) scenes.push(ev);
  }
  return scenes;
}

// ツンデレの「認める」と、エピソード解放
function checkRelationEvents(state) {
  const scenes = [];
  for (const idol of state.unit) {
    if (!idol.accepted && idolTotalStats(idol) >= C.TSUNDERE_ACCEPT_STATS) scenes.push(acceptScene(state, idol));
    scenes.push(...checkEpisodes(state, idol));
  }
  return scenes;
}

function acceptScene(state, idol) {
  idol.accepted = true;
  addAffection(idol, 5);
  pushLog(state, `${idol.name}が社長を認めた!(親愛度が上がりやすくなった)`);
  return makeScene(`${idol.name}:才能を認めた日`, idol, RELATIONS.tsundere.acceptScene);
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
  if (n < 2) return makeScene(`${idol.name} エピソード${n + 1}`, idol, P.episodes[n]);
  const raw = HONNE_TEMPLATES[idol.relation](P.honneCore);
  return makeScene(`${idol.name} エピソード3「本音」`, idol, raw, [
    {
      label: '黙って、最後まで受け止める',
      apply: (st) => {
        const i = findIdol(st, idol.id) || idol;
        if (!i.honne) { i.honne = true; addAffection(i, 5); addBond(st, 3); }
        return `${i.name}の本音を受け止めた。(本音イベント回収)`;
      },
    },
    {
      label: '「らしくないな」と冗談で返す',
      apply: (st) => `${idol.name}は少し笑って、いつもの顔に戻った。(あとでアイドルの詳細から見直せる)`,
    },
  ]);
}

// ---------- ランダムイベント ----------
const RANDOM_EVENTS = [
  {
    id: 'snack', weight: 3,
    make: (s, r) => {
      const i = r.pick(s.unit);
      addAffection(i, 3);
      return makeScene('差し入れ', i, [['n', '{name}が、手作りのおにぎりを持ってきてくれた。'], ['i', idolLine(i, 'greet', r)], ['n', `${i.name}の親愛度が上がった。`]]);
    },
  },
  {
    id: 'rain', weight: 2,
    make: (s) => makeScene('突然の雨', null, [['n', 'レッスン帰り、突然の土砂降り。全員で軒下に駆け込んだ。']], [
      { label: 'みんなで雨宿りしながら話す', apply: (st) => { addBond(st, 5); return '他愛ない話で盛り上がった。(絆 +5)'; } },
      { label: 'タクシー代を出す(¥10,000)', apply: (st) => { st.money -= 10000; st.unit.forEach((i) => addCondition(i, 1)); return '濡れずに帰れた。(全員の調子 +1)'; } },
    ]),
  },
  {
    id: 'rival', weight: 2,
    make: (s) => {
      const nl = nextLive(s);
      const rival = nl ? C.RIVALS[nl.index].name : 'ライバル';
      return makeScene('ライバルの挑発', null, [['n', `テレビ局の廊下で「${rival}」とすれ違った。`], ['n', '「弱小事務所は、せいぜい頑張ってね」']], [
        { label: '「受けて立つ」と言い返す', apply: (st) => { st.unit.forEach((i) => addCondition(i, 1)); addBond(st, 3); return '全員の目に火がついた!(調子 +1、絆 +3)'; } },
        { label: '笑って受け流す', apply: (st) => { addFame(st, 2); return '大人の対応が記者の目に留まった。(知名度 +2)'; } },
      ]);
    },
  },
  {
    id: 'scandal', weight: 1, cond: (s) => s.fans > 3000,
    make: (s, r) => {
      const i = r.pick(s.unit);
      return makeScene('熱愛疑惑!?', i, [['n', '週刊誌に{name}の「熱愛疑惑」が載った。相手は…実のお兄さんだ。']], [
        { label: '正直に説明する', apply: (st) => { addAffection(i, 6); const l = Math.round(st.fans * 0.01); st.fans -= l; return `誤解はすぐに解けた。${i.name}は社長への信頼を深めた。(ファン -${l})`; } },
        { label: 'ノーコメントを貫く', apply: (st) => { const l = Math.round(st.fans * 0.04); st.fans -= l; addFame(st, 3); return `話題にはなったが、ファンは減った。(ファン -${l}、知名度 +3)`; } },
      ]);
    },
  },
  {
    id: 'interview', weight: 2,
    make: (s) => { addFame(s, 4); const g = addFans(s, 500); return makeScene('取材依頼', null, [['n', '地元のWebメディアから取材が来た!'], ['n', `知名度 +4、ファン +${g}`]]); },
  },
  {
    id: 'sick', weight: 2,
    make: (s, r) => {
      const i = r.pick(s.unit);
      addStamina(i, -20);
      return makeScene('体調不良', i, [['n', '{name}が少し熱っぽいようだ。(体力 -20)'], ['i', idolLine(i, 'tired', r)]], [
        { label: '病院に連れて行く(¥8,000)', apply: (st) => { st.money -= 8000; addStamina(i, 15); addAffection(i, 3); return `${i.name}はすぐに元気を取り戻した。(体力 +15)`; } },
        { label: '本人に任せる', apply: () => { addCondition(i, -1); return `${i.name}は無理をして、調子を崩した。`; } },
      ]);
    },
  },
  {
    id: 'quarrel', weight: 2, cond: (s) => s.bond < 50,
    make: (s, r) => {
      const [a, b] = r.shuffle(s.unit);
      return makeScene('ユニット内のケンカ', a, [['n', `${a.name}と${b.name}が、振り付けのことで言い争っている。`]], [
        { label: '間に入って話を聞く', apply: (st) => { addBond(st, 6); return '本音をぶつけ合って、前より仲良くなった。(絆 +6)'; } },
        { label: '二人に任せて見守る', apply: (st) => { const ok = makeRng(st.seed + st.week + 'q')() < 0.5; addBond(st, ok ? 8 : -5); return ok ? '二人だけで仲直りできた!(絆 +8)' : 'わだかまりが残った…(絆 -5)'; } },
      ]);
    },
  },
  {
    id: 'letter', weight: 2,
    make: (s) => { s.unit.forEach((i) => addAffection(i, 2)); const g = addFans(s, 200); return makeScene('ファンレター', null, [['n', '事務所に初めて段ボール一箱分のファンレターが届いた!'], ['n', `全員の親愛度 +2、ファン +${g}`]]); },
  },
  {
    id: 'oldfriend', weight: 1,
    make: () => makeScene('社長の昔なじみ', null, [['n', '昔の仕事仲間から「ちょっとした頼みごと」の電話が来た。']], [
      { label: '引き受ける', apply: (st) => { st.money += 50000; return '謝礼として ¥50,000 をもらった。'; } },
      { label: 'アイドルたちを売り込む', apply: (st) => { addFame(st, 3); addFans(st, 300); return 'ユニットを紹介してもらえた。(知名度 +3、ファン +300)'; } },
    ]),
  },
  {
    id: 'nightpractice', weight: 2,
    make: (s, r) => {
      const i = r.pick(s.unit);
      const st0 = r.pick(['tech', 'sense', 'visual']);
      return makeScene('深夜の自主練', i, [['n', '夜遅く、スタジオに{name}が一人で残っている。']], [
        { label: '止めて帰らせる', apply: () => { addAffection(i, 3); return `${i.name}は少しむくれながらも帰っていった。(親愛度 +3)`; } },
        { label: 'とことん付き合う', apply: (st) => { addStat(i, st0, 5); addStamina(i, -10); addAffection(i, 2); i.focus += 1; return `${i.name}の${STAT_NAMES[st0]} +5(体力 -10)`; } },
      ]);
    },
  },
  {
    id: 'unitdinner', weight: 2,
    make: () => makeScene('ごはん会', null, [['n', 'メンバーから「みんなでごはん行きたい!」と提案があった。']], [
      { label: '社長のおごりで行く(¥20,000)', apply: (st) => { st.money -= 20000; addBond(st, 6); st.unit.forEach((i) => addAffection(i, 2)); return '焼肉で大いに盛り上がった。(絆 +6、親愛度 +2)'; } },
      { label: '今回は見送る', apply: () => '「また今度ね」と、少し寂しそうだった。' },
    ]),
  },
];

function gapEventFor(state, rng) {
  const cands = state.unit.filter((i) => !i.gapRevealed);
  if (!cands.length) return null;
  const i = rng.pick(cands);
  i.gapRevealed = true;
  addAffection(i, 5);
  i.focus += 1;
  pushLog(state, `${i.name}の意外な一面を知った`);
  const raw = PERSONALITIES[i.personality].gapScene.concat([['n', `【ギャップ】${PERSONALITIES[i.personality].gap}(親愛度 +5)`]]);
  return makeScene(`${i.name}の意外な一面`, i, raw);
}

function pickRandomEvent(state, rng) {
  if (rng() < C.GAP_EVENT_CHANCE) {
    const g = gapEventFor(state, rng);
    if (g) return g;
  }
  const pool = RANDOM_EVENTS.filter((e) => !e.cond || e.cond(state));
  const ev = rng.weighted(pool, (e) => e.weight);
  state.seenEvents[ev.id] = (state.seenEvents[ev.id] || 0) + 1;
  return ev.make(state, rng);
}

// 週を進める。戻り値:次に向かう phase
function advanceWeek(state) {
  state.week++;
  if (state.week > totalWeeks()) return state.phase;
  if (weekInYear(state.week) === 1) {
    const meta = state._metaLoopBonus || 0;
    state.candidates = generateCandidates(state.seed, yearOf(state.week), meta, state.usedNames);
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
  const designer = state.unit.some((i) => i.off === 'design');
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
function useItem(state, key, idolId) {
  if (!state.items[key]) return { ok: false };
  const idol = idolId ? findIdol(state, idolId) : null;
  switch (key) {
    case 'drink': addStamina(idol, 30); break;
    case 'charm': addCondition(idol, 1); break;
    case 'gift': addAffection(idol, 6); break;
    case 'camp': addBond(state, 6); break;
    case 'supple': state.unit.forEach((i) => addStamina(i, 15)); break;
  }
  state.items[key]--;
  pushLog(state, `${ITEMS[key].name}を使った${idol ? '(' + idol.name + ')' : ''}`);
  return { ok: true, scenes: idol ? checkEpisodes(state, idol) : [] };
}

// ---------- ライブ ----------
function liveSetup(state) {
  const index = liveIndexOfWeek(state.week);
  const rngR = makeRng(state.seed + ':rival:' + index);
  const R = C.RIVALS[index];
  const rivalScore = Math.round(R.score * (1 - C.RIVAL_VARIANCE + rngR() * C.RIVAL_VARIANCE * 2));
  return { index, isFinal: index === C.LIVE_WEEKS.length - 1, rival: R.name, rivalScore, songSeed: state.seed + ':song:' + index };
}

// result: computeLiveScore の戻り値
function applyLiveResult(state, setup, centerId, result) {
  const win = result.total >= setup.rivalScore;
  const rewards = [];
  const fanGain = addFans(state, result.total * (win ? C.LIVE_FANS_WIN_RATE : C.LIVE_FANS_LOSE_RATE));
  rewards.push(`ファン +${fanGain.toLocaleString()}`);
  const money = win ? C.LIVE_MONEY_WIN : C.LIVE_MONEY_LOSE;
  state.money += money;
  rewards.push(`¥${money.toLocaleString()}`);
  addBond(state, win ? C.LIVE_BOND_WIN : C.LIVE_BOND_LOSE);
  rewards.push(`絆 +${win ? C.LIVE_BOND_WIN : C.LIVE_BOND_LOSE}`);
  addFame(state, win ? 5 : 2);
  const center = findIdol(state, centerId);
  center.focus += C.LIVE_FOCUS_CENTER;
  state.unit.forEach((i) => { addStamina(i, -C.LIVE_STAMINA); addAffection(i, win ? 3 : 1); });
  const scenes = [];
  if (win && C.LIVE_COSTUME_REWARD[setup.index] && !state.costumes.includes(C.LIVE_COSTUME_REWARD[setup.index])) {
    const k = C.LIVE_COSTUME_REWARD[setup.index];
    state.costumes.push(k);
    rewards.push(`衣装「${COSTUMES[k].name}」`);
  }
  if (win && !center.accepted) scenes.push(acceptScene(state, center));
  state.liveResults.push({ index: setup.index, score: result.total, rival: setup.rivalScore, win, center: centerId, mode: result.mode });
  pushLog(state, `ライブ${setup.index + 1}:${result.total.toLocaleString()}点 vs ${setup.rival} ${setup.rivalScore.toLocaleString()}点 → ${win ? '勝利!' : '敗北…'}`);
  scenes.push(...checkRelationEvents(state));
  return { win, rewards, scenes };
}
