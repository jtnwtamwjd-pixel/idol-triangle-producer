// ============================================================
// 調整用定数 — バランス調整はこのファイルだけで行えるようにする
// ============================================================
const C = {
  SAVE_KEY: 'idolPro_save_v1',
  META_KEY: 'idolPro_meta_v1',
  SETTINGS_KEY: 'idolPro_settings_v1',

  // ---- 期間 ----
  YEARS: 3,
  WEEKS_PER_YEAR: 16,
  LIVE_WEEKS: [8, 16, 22, 28, 34, 40, 48], // 通算週。最後が決勝
  CANDIDATES_MIN: 6,
  CANDIDATES_MAX: 9,
  UNIT_SIZE: 3,

  // ---- 初期値 ----
  START_MONEY: 200000,
  START_FANS: 100,
  START_FAME: 0,
  START_BOND: 20,
  STAT_INIT_MIN: 18,
  STAT_INIT_MAX: 32,
  SPECIALTY_INIT_BONUS: 12,
  TALK_INIT_MIN: 10,
  TALK_INIT_MAX: 25,
  STAT_MAX: 500,

  // ---- 体力 ----
  STAMINA_MAX: 100,
  LOW_STAMINA: 30,            // これ未満で失敗率・不調率が上がる
  LOW_STAMINA_FAIL_MAX: 0.5,  // 体力0のときの失敗率
  LOW_STAMINA_LIVE_MOD: 0.85, // ライブ時の体力不足ペナルティ

  // ---- 調子(-2..+2) ----
  CONDITION_NAMES: ['絶不調', '不調', '普通', '好調', '絶好調'],
  CONDITION_LESSON_MOD: [0.6, 0.8, 1.0, 1.2, 1.4],
  CONDITION_LIVE_MOD: [0.85, 0.93, 1.0, 1.07, 1.15],
  CONDITION_DRIFT: { down: 0.25, up: 0.25 }, // 週ごとの自然変動
  CONDITION_LOW_STAMINA_DOWN: 0.35,

  // ---- 親愛度・絆 ----
  AFFECTION_MAX: 100,
  AFFECTION_INIT: { loyal: 30, tsundere: 0, accomplice: 15 },
  AFFECTION_MUL: { loyal: 1.2, tsundere: 0.6, tsundereAccepted: 1.5, accomplice: 1.0 },
  ACCOMPLICE_OUTING_MUL: 1.3,
  TSUNDERE_ACCEPT_STATS: 240, // 合計ステータスがこれ以上で「才能を認める」
  EPISODE_THRESHOLDS: [25, 55, 85],
  BOND_MAX: 100,

  // ---- 行動 ----
  LESSON: {
    UNIT_GAIN: 5, UNIT_SUB_GAIN: 1, UNIT_STAMINA: 12, UNIT_BOND: 2,
    SOLO_MUL: 1.9, SOLO_STAMINA: 16, SOLO_OTHERS_RECOVER: 6, SOLO_FOCUS: 2,
    SPECIALTY_MUL: 1.3, FAIL_MUL: 0.4,
  },
  WORK: {
    UNIT_MONEY: 60000, SOLO_MONEY: 40000, UNIT_STAMINA: 14, SOLO_STAMINA: 18,
    UNIT_FANS: 150, SOLO_FANS: 100, FAME: 2, TALK_GAIN: 3, SPECIALTY_MUL: 1.5,
    SOLO_FOCUS: 2, SOLO_AFFECTION: 2,
    PRESIDENT_MONEY: 50000, PRESIDENT_SCALE_MUL: 0.15, PRESIDENT_IDOL_RECOVER: 8,
    FAME_MONEY_MUL: 0.01, // 知名度1につき+1%
  },
  SNS: {
    UNIT_FANS: 400, SOLO_FANS: 300, FAME: 3, STAMINA: 3,
    UNIT_AFFECTION: 1, SOLO_AFFECTION: 4, SOLO_FOCUS: 1,
    FLAME_CHANCE: 0.08, FLAME_LOW_COND_CHANCE: 0.2, FLAME_FAN_LOSS: 0.03,
    FAME_FAN_DIV: 40, VISUAL_DIV: 300,
  },
  OUTING: {
    SOLO_AFFECTION: 8, SOLO_COST: 10000, SOLO_FOCUS: 1,
    UNIT_AFFECTION: 3, UNIT_BOND: 4, UNIT_COST: 25000, STAMINA: 2,
  },
  REST: { STAMINA: 35, PRESIDENT_MONEY: 15000, COND_UP_CHANCE: 0.4 },

  // ---- 知名度・ファン ----
  FAME_MAX: 100,

  // ---- 投資(事務所規模) ----
  // 事務所規模 = 1 + 投資レベルの合計
  OFFICE_RANKS: [
    { min: 1, name: '雑居ビルの一室' },
    { min: 3, name: '小さな事務所' },
    { min: 6, name: '中堅プロダクション' },
    { min: 10, name: '大手事務所' },
    { min: 15, name: '芸能帝国' },
  ],
  INVEST_COST_GROWTH: 1.6,
  INVEST_MAX_LV: 5,

  // ---- 週次イベント ----
  RANDOM_EVENT_CHANCE: 0.4,
  GAP_EVENT_CHANCE: 0.25, // ランダムイベント発生時に、ギャップイベントが選ばれる確率

  // ---- ライブ:スコア計算式 ----
  POSITION_COEF: { center: 1.5, side: 1.0 },
  STAT_SCORE_SCALE: 28,
  COMBO_BONUS_MAX: 0.5,  // コンボ補正の最大(+50%)
  COMBO_CAP: 100,        // このコンボ数で補正が最大になる
  JUDGE_BONUS: { perfect: 40, good: 20, miss: 0 },
  SIDE_BUFF: {
    BASE_CHANCE: 0.25, BOND_CHANCE: 0.004, AFFECTION_CHANCE: 0.002,
    SCORE_UP: 0.08,          // サイド1人につき+8%
    JUDGE_WIDEN_MS: 25,      // 判定緩和:Good判定の幅を広げる
    JUDGE_MISS_REDUCE: 0.4,  // おまかせ時:Miss率を40%減らす
  },
  STUDIO_LIVE_BONUS: 0.04, // 専用スタジオのレベル1につき
  // ボルテージ・フィーバー
  VOLTAGE: { PERFECT: 2.2, GOOD: 1.0, MISS: -6, COMBO_STEP: 10, COMBO_STEP_GAIN: 3, MAX: 100 },
  FEVER_BEATS: 8 * 4,    // 8小節
  FEVER_MULT_MIN: 1.5,
  FEVER_MULT_MAX: 2.0,
  // リズムゲームの判定(秒)
  JUDGE_WINDOW: { perfect: 0.055, good: 0.12 },
  NOTE_TRAVEL_SEC: 1.5,
  LEAD_IN_SEC: 2.0,
  // おまかせの精度モデル
  AUTO: {
    PERFECT_BASE: 0.30, PERFECT_PER_STAT: 0.0011, GOOD_RATIO: 0.75,
    COND_MOD: 0.04, BOND_MOD: 0.0015, PERFECT_MAX: 0.92, PERFECT_MIN: 0.15,
  },

  // ---- ライブ:ライバルと報酬 ----
  RIVALS: [
    { name: 'ハニカムドロップ', score: 14000 },
    { name: 'SPARK☆LINE', score: 21000 },
    { name: '月下美人', score: 28000 },
    { name: 'ミルキーウェイ急行', score: 35000 },
    { name: 'Noir Crown', score: 42000 },
    { name: 'Re:Vival', score: 48000 },
    { name: 'GRAND ECLIPSE', score: 55000 },
  ],
  RIVAL_VARIANCE: 0.06,
  LIVE_FANS_WIN_RATE: 0.35,  // スコア × 倍率 = ファン増加
  LIVE_FANS_LOSE_RATE: 0.10,
  LIVE_MONEY_WIN: 120000,
  LIVE_MONEY_LOSE: 40000,
  LIVE_BOND_WIN: 6,
  LIVE_BOND_LOSE: 2,
  LIVE_STAMINA: 20,
  LIVE_FOCUS_CENTER: 4,
  LIVE_COSTUME_REWARD: { 2: 'wafuu', 4: 'star' }, // ライブの番号(0始まり)→ 勝利で入手できる衣装

  // ---- 楽曲生成 ----
  SONG: { BPM_MIN: 112, BPM_MAX: 150, BPM_LIVE_STEP: 3 },
  CHART_DENSITY: [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85], // ライブごとの譜面密度

  // ---- エンディング(仮の値) ----
  ENDING: {
    FANS_TARGET: 80000,
    BOND_TRUE: 75,
    TRUE_SCORE: 60000,
    CUTOFF_SCORE: 35000,
    BIAS_SHARE: 0.6,        // 1人の注力ポイントの割合
    BIAS_MIN_TOTAL: 30,     // 偏りの判定に必要な注力ポイントの合計
    SECRET_ENABLED: true,
    SECRET_BEFORE_TRUE: true,
  },

  // ---- 素材(assets/manifest.js) ----
  VIDEO_EVENT_KINDS: ['episode', 'honne', 'gap', 'accept'], // 動画を流すイベントの種類
  VIDEO_CUT_AT: 0.5, // イベントの台詞のどの位置で動画を挟むか(0=最初、1=最後)

  // ---- 周回 ----
  LOOP: { MONEY_BONUS: 50000, STAT_BONUS: 4, MAX_STACK: 3 },
};
