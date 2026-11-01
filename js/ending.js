// ============================================================
// 卒業ライブ(グランプリ決勝)のエンディング判定
// 卒業するユニットごとに、上から順に判定して最初に当てはまったものに決める
// ============================================================

const ENDINGS = {
  bad: { name: 'Bad End:解散の危機', short: 'BAD' },
  individual: { name: 'Individual True End:センターの栄光', short: 'INDIVIDUAL' },
  secret: { name: 'Secret End:本音', short: 'SECRET' },
  true: { name: 'True End:三等星', short: 'TRUE' },
  normal: { name: 'Normal End:いつまでも私たちのステージ', short: 'NORMAL' },
};

// 注力ポイントの偏り(人数によって基準が変わる)
function focusBias(unit) {
  const members = unit.members;
  const total = members.reduce((a, i) => a + i.focus, 0);
  const top = members.reduce((m, i) => (i.focus > m.focus ? i : m), members[0]);
  const threshold = C.ENDING.BIAS_SHARE_BY_SIZE[members.length] || C.ENDING.BIAS_SHARE;
  return { total, top, share: total ? top.focus / total : 0, threshold };
}

function evaluateEnding(unit, finalScore) {
  const E = C.ENDING;
  const checks = [];
  // 1. Bad End
  checks.push(['bad', unit.bond <= 0 || finalScore < E.CUTOFF_SCORE]);
  const fansOk = unit.fans >= E.FANS_TARGET;
  // 2. Individual True End
  const b = focusBias(unit);
  checks.push(['individual', fansOk && b.total >= E.BIAS_MIN_TOTAL && b.share >= b.threshold]);
  // 3〜5. True / Secret / Normal
  const trueOk = fansOk && unit.bond >= E.BOND_TRUE && finalScore >= E.TRUE_SCORE;
  const secretOk = E.SECRET_ENABLED && trueOk && unit.members.every((i) => i.honne);
  if (E.SECRET_BEFORE_TRUE) checks.push(['secret', secretOk]);
  checks.push(['true', trueOk]);
  if (!E.SECRET_BEFORE_TRUE) checks.push(['secret', secretOk]); // 指示どおりの順番(この場合は発生しない)
  checks.push(['normal', true]);
  const hit = checks.find(([, ok]) => ok);
  return { id: hit[0], fansOk, trueOk, secretOk, bias: { share: b.share, total: b.total, topId: b.top.id, threshold: b.threshold }, finalScore };
}

const KANJI_NUM = ['', '一', '二', '三', '四', '五'];
const firstName = (i) => i.name.split(' ')[1] || i.name;

// unit: 卒業したユニット(alumni の記録でも可)、juniors: 残っている後輩ユニット
function endingScenes(unit, ev, juniors) {
  const m = unit.members;
  const U = unit.name;
  const n = KANJI_NUM[m.length] || m.length;
  const line = (i, key) => [i.id, idolLine(i, key)];
  let lines;
  switch (ev.id) {
    case 'bad':
      lines = [
        ['n', `卒業ライブの夜。「${U}」の楽屋は静まり返っていた。`],
        ['n', unit.bond <= 0 ? '誰も、誰とも目を合わせない。心は、とっくにばらばらだった。' : `スコアは1曲平均${ev.finalScore.toLocaleString()}点。足切り点の${C.ENDING.CUTOFF_SCORE.toLocaleString()}点に届かなかった。`],
        [m[0].id, '……ごめん。'],
        ['n', '解散の二文字が、事務所に重くのしかかる。'],
      ];
      break;
    case 'individual': {
      const top = m.find((i) => i.id === ev.bias.topId) || m[0];
      const others = m.filter((i) => i !== top);
      lines = [
        ['n', `グランプリ決勝。スポットライトの中心に立っていたのは、${top.name}だった。`],
        line(top, 'live'),
        ['n', `その歌声は会場を、そして日本中を飲み込んだ。翌朝、${top.name}は「国民的センター」と呼ばれていた。`],
        ['n', `ドラマ、CM、単独ドーム公演。${top.name}は一人で、遥か高みへ駆け上がっていく。`],
      ];
      if (others[0]) lines.push([others[0].id, `……すごいよ、${firstName(top)}。私たちの自慢のセンターだ。`]);
      if (others[1]) lines.push([others[1].id, 'うん。いつか、隣にもう一度立てるように、私たちも頑張らなきゃ。']);
      lines.push(['n', others.length ? '舞台袖のメンバーは、誇らしげに、少しだけ寂しそうに、その背中を見送った。' : '社長は客席の一番後ろで、その姿を見守っていた。']);
      break;
    }
    case 'true':
      lines = [
        ['n', `グランプリ決勝。満員のアリーナに「${U}」の名前がこだまする。`],
        ...m.map((i) => line(i, 'live')),
        ['n', m.map((i) => `${PERSONALITIES[i.personality].name}の${i.name}`).join('、') + '。'],
        ['n', `${n}つの星は、それぞれの色のまま、ひとつの星座になった。`],
        ['n', `結果は優勝。1曲平均${ev.finalScore.toLocaleString()}点、完璧なライブだった。`],
        [m[0].id, `社長!見てた!?私たち、${n}人そろって、一番明るい星だよ!`],
        ['n', '雑居ビルの一室から始まった物語は、最高の大団円を迎えた。'],
      ];
      break;
    case 'secret':
      lines = [
        ['n', '優勝セレモニーのあと。メンバーは、社長を誰もいない控え室に呼び出した。'],
        ...m.map((i) => [i.id, PERSONALITIES[i.personality].honneCore]),
        ...m.map((i) => [i.id, i.relation === 'tsundere' ? '…あんたがプロデューサーで、本当によかった。素直に、そう思ってる。' : i.relation === 'accomplice' ? '完璧じゃない私を知ってるのは、社長だけ。これからも、ずっと共犯者でいてね。' : '社長と出会えて、わたし、本当に幸せです!']),
        ['n', 'それは、ステージの上では決して見せない、本当の顔だった。'],
        ['n', `「${U}」——その本当の物語は、ここから始まる。`],
      ];
      break;
    default:
      lines = [
        ['n', `グランプリ決勝は1曲平均${ev.finalScore.toLocaleString()}点。頂点には、あと一歩届かなかった。`],
        ['n', `数週間後。始まりの小さなライブハウスで、「${U}」の卒業ライブが開かれた。`],
        line(m[0], 'live'),
        ['n', '最前列には、デビューの頃から通ってくれているファンの顔があった。'],
      ];
      if (m[1]) lines.push([m[1].id, 'ここが、私たちのホームだね。']);
      lines.push([m[m.length - 1].id, 'うん。いつか、もっと大きなステージに、みんなを連れて行こう。']);
      lines.push(['n', '終わらないアンコールの中、メンバーは未来への約束を交わした。']);
  }
  if ((unit.venue || 0) === C.VENUES.length - 1) lines.splice(Math.min(2, lines.length), 0, ['n', '思えば、地下ライブハウスから始まった道のりは、日本武道館の満員の客席にまで続いていた。']);
  // 卒業と、後輩たちへのバトン
  if (ev.id !== 'bad') {
    lines.push(['n', `そして「${U}」は、3年間の活動を終えて卒業した。`]);
    if (juniors && juniors.length) {
      lines.push(['n', `客席には、後輩の${juniors.map((u) => `${u.gen}期生「${u.name}」`).join('と')}の姿があった。`]);
      const j = juniors[0].members[0];
      if (j) lines.push([j.id, '先輩たちみたいなステージ、私たちも絶対に立ちます!']);
    }
  }
  return lines;
}
