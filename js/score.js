// ============================================================
// ライブのスコア計算(リズムゲームとおまかせで共通)
// 1曲のスコア = (Σ(基礎ステータス × ポジション係数)) × コンボ補正 + 判定ボーナス
//   ※Σ には人数補正・曲レベル補正・サイドのバフ・スタジオ補正がかかる
//   ※フィーバー中に処理したノーツの分は、基礎点・判定ボーナスに倍率がかかる
// ライブのスコア = セットリストの各曲のスコアの合計
// ============================================================

// キャラの基礎ステータス(衣装・調子・体力の補正込み)
// staminaOverride:ライブ中に曲ごとに減った体力を反映するときに使う
function idolLivePower(idol, staminaOverride) {
  const cos = COSTUMES[idol.costume] || COSTUMES.school;
  const fav = PERSONALITIES[idol.personality].favCostume === idol.costume ? FAV_COSTUME_BONUS : 0;
  const s = idol.stats;
  let p = s.tech * (1 + cos.bonus.tech + fav) + s.sense * (1 + cos.bonus.sense + fav) + s.visual * (1 + cos.bonus.visual + fav);
  p *= C.CONDITION_LIVE_MOD[idol.condition + 2];
  const st = staminaOverride != null ? staminaOverride : idol.stamina;
  if (st < C.LOW_STAMINA) p *= C.LOW_STAMINA_LIVE_MOD;
  return p;
}

// 1曲ぶんのコンテキスト:ポジション係数、サイドのバフ、フィーバー倍率、曲レベル
// song: 持ち歌(level を使う)、songIndex: セットリストの何曲目か(0始まり。体力の減少に使う)
function buildLiveContext(state, unit, centerId, setup, song, songIndex) {
  songIndex = songIndex || 0;
  const rng = makeRng(setup.songSeed + ':buff:' + centerId + ':' + songIndex + ':' + (song ? song.id : ''));
  const drain = songIndex * C.LIVE_STAMINA_PER_SONG;
  const SB = C.SIDE_BUFF;
  const members = unit.members.map((idol) => {
    const isCenter = idol.id === centerId;
    let buff = null;
    if (!isCenter) {
      const chance = SB.BASE_CHANCE + unit.bond * SB.BOND_CHANCE + idol.affection * SB.AFFECTION_CHANCE;
      if (rng() < chance) buff = idol.stats.tech >= idol.stats.visual ? 'judge' : 'score';
    }
    return { id: idol.id, name: idol.name, stamina: Math.max(0, idol.stamina - drain), power: idolLivePower(idol, Math.max(0, idol.stamina - drain)), coef: isCenter ? C.POSITION_COEF.center : C.POSITION_COEF.side, isCenter, buff };
  });
  const sides = Math.max(1, members.length - 1);
  const perSide = SB.SCORE_UP * Math.min(1, 2 / sides); // サイドが多いほど1人あたりは小さく
  const voltageMul = 1 + unit.members.reduce((m, i) => Math.max(m, (COSTUMES[i.costume] || COSTUMES.school).voltage), 0);
  return {
    members,
    scoreUp: members.filter((m) => m.buff === 'score').length * perSide,
    judgeBuffs: Math.min(2, members.filter((m) => m.buff === 'judge').length),
    sizeMul: C.SIZE_SCORE_MUL[members.length] || 1,
    songMul: 1 + ((song ? song.level : 1) - 1) * C.SONG_LV_SCORE,
    feverMult: C.FEVER_MULT_MIN + (C.FEVER_MULT_MAX - C.FEVER_MULT_MIN) * (unit.bond / C.BOND_MAX),
    voltageMul,
    studio: state.invest.studio * C.STUDIO_LIVE_BONUS,
    songwriter: unit.members.some((i) => i.off === 'songwriting') ? 0.25 : 0,
    bond: unit.bond,
    avgCondition: unit.members.reduce((a, i) => a + i.condition, 0) / unit.members.length,
  };
}

// ボルテージゲージ(リズムゲームとおまかせの両方で使う)
class VoltageGauge {
  constructor(bpm, voltageMul) {
    this.value = 0;
    this.feverEnd = -1;
    this.feverCount = 0;
    this.feverSec = C.FEVER_BEATS * 60 / bpm;
    this.mul = voltageMul || 1;
  }
  isFever(t) { return t < this.feverEnd; }
  // 戻り値:このノーツでフィーバーに入ったら true
  feed(judge, combo, t) {
    if (this.isFever(t)) return false;
    const V = C.VOLTAGE;
    let d = judge === 'perfect' ? V.PERFECT : judge === 'good' ? V.GOOD : V.MISS;
    if (d > 0) {
      d *= this.mul;
      if (combo > 0 && combo % V.COMBO_STEP === 0) d += V.COMBO_STEP_GAIN;
    }
    this.value = clamp(this.value + d, 0, V.MAX);
    if (this.value >= V.MAX) {
      this.value = 0;
      this.feverEnd = t + this.feverSec;
      this.feverCount++;
      return true;
    }
    return false;
  }
}

function newJudgeCounter(total) {
  return { perfect: 0, good: 0, miss: 0, combo: 0, maxCombo: 0, total, feverPerfect: 0, feverGood: 0, feverCount: 0 };
}
function countJudge(jc, judge, inFever) {
  jc[judge]++;
  if (judge === 'miss') jc.combo = 0;
  else {
    jc.combo++;
    jc.maxCombo = Math.max(jc.maxCombo, jc.combo);
    if (inFever) jc[judge === 'perfect' ? 'feverPerfect' : 'feverGood']++;
  }
}

// ★スコア計算式(唯一の実装)
function computeLiveScore(ctx, jc) {
  const sigma = ctx.members.reduce((a, m) => a + m.power * m.coef, 0) * (ctx.sizeMul || 1) * (ctx.songMul || 1) * (1 + ctx.scoreUp) * (1 + ctx.studio);
  const comboMult = 1 + C.COMBO_BONUS_MAX * Math.min(1, jc.maxCombo / C.COMBO_CAP);
  const base = sigma * C.STAT_SCORE_SCALE * comboMult;
  const feverRatio = jc.total ? (jc.feverPerfect + jc.feverGood) / jc.total : 0;
  const feverBonus = base * feverRatio * (ctx.feverMult - 1);
  const JB = C.JUDGE_BONUS;
  const jbMul = 1 + ctx.songwriter;
  const normalP = jc.perfect - jc.feverPerfect, normalG = jc.good - jc.feverGood;
  const judgeBonus = (normalP * JB.perfect + normalG * JB.good + (jc.feverPerfect * JB.perfect + jc.feverGood * JB.good) * ctx.feverMult) * jbMul;
  const total = Math.round(base + feverBonus + judgeBonus);
  return { sigma: Math.round(sigma), comboMult, base: Math.round(base), feverBonus: Math.round(feverBonus), judgeBonus: Math.round(judgeBonus), total, judge: { ...jc } };
}

// おまかせ:ステータスから判定を確率で決め、同じ計算式に通す
function autoPerfectRate(ctx) {
  const A = C.AUTO;
  const avg = ctx.members.reduce((a, m) => a + m.power, 0) / ctx.members.length;
  return clamp(A.PERFECT_BASE + avg * A.PERFECT_PER_STAT + ctx.avgCondition * A.COND_MOD + ctx.bond * A.BOND_MOD, A.PERFECT_MIN, A.PERFECT_MAX);
}
function simulateAuto(ctx, chart, seed) {
  const rng = makeRng(seed + ':auto');
  const pr = autoPerfectRate(ctx);
  let missRate = (1 - pr) * (1 - C.AUTO.GOOD_RATIO);
  missRate *= Math.pow(1 - C.SIDE_BUFF.JUDGE_MISS_REDUCE, ctx.judgeBuffs);
  const gauge = new VoltageGauge(chart.bpm, ctx.voltageMul);
  const jc = newJudgeCounter(chart.notes.length);
  for (const n of chart.notes) {
    const x = rng();
    const judge = x < pr ? 'perfect' : x < 1 - missRate ? 'good' : 'miss';
    const inFever = gauge.isFever(n.time);
    countJudge(jc, judge, inFever);
    gauge.feed(judge, jc.combo, n.time);
  }
  jc.feverCount = gauge.feverCount;
  const r = computeLiveScore(ctx, jc);
  r.mode = 'auto';
  return r;
}
