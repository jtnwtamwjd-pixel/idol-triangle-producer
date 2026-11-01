// ============================================================
// 調整用定数 — バランス調整はこのファイルだけで行えるようにする
// ============================================================
const C = {
  SAVE_KEY: 'idolPro_save_v2', // v1(1ユニット制)のセーブは読み込まない
  META_KEY: 'idolPro_meta_v1',
  SETTINGS_KEY: 'idolPro_settings_v1',

  // ---- 期間 ----
  WEEKS_PER_YEAR: 16,
  CAREER_YEARS: 3, // ユニットの活動期間。最終年の最終週が卒業ライブ(決勝)
  // 年ごとのライブ週(年内の週)。最終週は、卒業するユニットがいれば決勝になる
  // 1年目は年4回、2年目以降は年6回(3年目以降の16週は卒業ライブ)
  LIVE_WEEKS_BY_YEAR: { 1: [4, 8, 12, 16], default: [3, 6, 9, 12, 15, 16] },
  CANDIDATES_MIN: 6,
  CANDIDATES_MAX: 9,
  // ユニットの人数:下限 UNIT_MIN、上限 = min(UNIT_MAX, 候補生の数 − UNIT_SIZE_OFFSET)
  UNIT_MIN: 2,
  UNIT_MAX: 5,
  UNIT_SIZE_OFFSET: 3,

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
  // 人数補正:Σ(基礎ステータス × ポジション係数)にかける。3人組を基準に、人数が違っても公平にする
  SIZE_SCORE_MUL: { 1: 2.2, 2: 1.35, 3: 1.0, 4: 0.82, 5: 0.7 },
  STAT_SCORE_SCALE: 28,
  COMBO_BONUS_MAX: 0.5,  // コンボ補正の最大(+50%)
  COMBO_CAP: 100,        // このコンボ数で補正が最大になる
  JUDGE_BONUS: { perfect: 40, good: 20, miss: 0 },
  SIDE_BUFF: {
    BASE_CHANCE: 0.25, BOND_CHANCE: 0.004, AFFECTION_CHANCE: 0.002,
    SCORE_UP: 0.08,          // サイド1人につき+8%(サイドが3人以上なら、合計 +16% を人数で分ける)
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

  // ---- ライブ:箱(会場)とライバル ----
  // ユニットごとに箱レベルを持つ。ライブのあと、ファン数と「そのライブの演奏曲レベルの合計」が
  // 次の箱の条件(needFans / needSongLv)を満たしていれば1段階上がる(1回に1段階、下がらない)
  // rivalScore はライバルの「1曲あたり」の点数。こちらも1曲ずつ計算して合計で競う
  VENUES: [
    { name: '地下ライブハウス', cap: 150, maxSongs: 2, rival: 'ハニカムドロップ', rivalScore: 14000, fanMul: 1.0, money: 80000, density: 0.55 },
    { name: 'ライブハウス', cap: 400, maxSongs: 2, rival: 'SPARK☆LINE', rivalScore: 21000, fanMul: 1.15, money: 110000, density: 0.6, needFans: 2500, needSongLv: 3 },
    { name: 'ライブホール', cap: 1000, maxSongs: 3, rival: '月下美人', rivalScore: 28000, fanMul: 1.3, money: 150000, density: 0.65, needFans: 8000, needSongLv: 5 },
    { name: '市民ホール', cap: 2000, maxSongs: 3, rival: 'ミルキーウェイ急行', rivalScore: 36000, fanMul: 1.45, money: 200000, density: 0.7, needFans: 18000, needSongLv: 7 },
    { name: '大ホール', cap: 5000, maxSongs: 4, rival: 'Noir Crown', rivalScore: 44000, fanMul: 1.6, money: 260000, density: 0.75, needFans: 35000, needSongLv: 9 },
    { name: 'アリーナ', cap: 10000, maxSongs: 4, rival: 'Re:Vival', rivalScore: 52000, fanMul: 1.8, money: 330000, density: 0.8, needFans: 60000, needSongLv: 12 },
    { name: '日本武道館', cap: 14000, maxSongs: 5, rival: 'CROWN JEWEL', rivalScore: 60000, fanMul: 2.0, money: 420000, density: 0.85, needFans: 100000, needSongLv: 16 },
  ],
  // 卒業ライブ(グランプリ決勝):規定の曲数を演奏し、1曲平均でエンディングを判定する
  FINAL: { name: 'アイドルグランプリ決勝', rival: 'GRAND ECLIPSE', rivalScore: 75000, songs: 3, density: 0.85, fanMul: 2.0, money: 500000 },
  RIVAL_VARIANCE: 0.06,
  LIVE_FANS_WIN_RATE: 0.12,  // 合計スコア × 倍率 × 箱の fanMul = ファン増加
  LIVE_FANS_LOSE_RATE: 0.04,
  LIVE_MONEY_LOSE_RATE: 0.35, // 負けたときは箱の報酬 × この割合
  LIVE_BOND_WIN: 6,
  LIVE_BOND_LOSE: 2,
  LIVE_STAMINA_PER_SONG: 9,  // 1曲ごとにメンバーの体力が減る(後半の曲ほど不利になる)
  LIVE_FOCUS_CENTER: 4,
  LIVE_COSTUME_REWARD: { 2: 'wafuu', 4: 'star' }, // 箱レベル(0始まり)→ その箱で勝つと入手できる衣装

  // ---- 持ち歌 ----
  SONGS_AT_FORMATION: 2,     // 結成時の持ち歌(デビュー曲とカップリング)
  SONG_EACH_YEAR: 1,         // 毎年1週目に、活動中のユニットへ新曲を1曲(周年シングル)
  SONG_MAX: 8,               // 持ち歌の上限
  NEW_SONG_COST: 150000,     // ショップで新曲を発注する費用(作詞作曲が得意なメンバーがいれば半額)
  SONG_LV_MAX: 10,
  SONG_LV_EXP: [0, 2, 4, 7, 10, 14, 18, 23, 28, 34], // レベルnに必要な累計経験値
  SONG_EXP_PLAY: 2,          // ライブで演奏すると
  SONG_EXP_WIN: 1,           // その曲でライバルの1曲点を上回ると追加
  SONG_EXP_PRACTICE: 2,      // レッスン「持ち歌練習」
  SONG_LV_SCORE: 0.04,       // 曲レベル1につき Σ に +4%

  // ---- 楽曲生成 ----
  SONG: { BPM_MIN: 112, BPM_MAX: 150, BPM_LIVE_STEP: 3 },

  // ---- エンディング(仮の値) ----
  ENDING: {
    FANS_TARGET: 120000,
    BOND_TRUE: 75,
    TRUE_SCORE: 80000,      // 決勝の「1曲平均」スコア
    CUTOFF_SCORE: 45000,    // 決勝の「1曲平均」スコア
    BIAS_SHARE: 0.6,        // 1人の注力ポイントの割合(3人組の場合)
    BIAS_SHARE_BY_SIZE: { 1: 1.01, 2: 0.75, 3: 0.6, 4: 0.5, 5: 0.45 }, // 人数ごとの基準(1人は判定しない)
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
