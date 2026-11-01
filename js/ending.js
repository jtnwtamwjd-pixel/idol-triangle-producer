// ============================================================
// 最終章:エンディング判定(上から順に、最初に当てはまったもので決める)
// ============================================================

const ENDINGS = {
  bad: { name: 'Bad End:解散の危機', short: 'BAD' },
  individual: { name: 'Individual True End:センターの栄光', short: 'INDIVIDUAL' },
  secret: { name: 'Secret End:本音', short: 'SECRET' },
  true: { name: 'True End:三等星', short: 'TRUE' },
  normal: { name: 'Normal End:いつまでも私たちのステージ', short: 'NORMAL' },
};

// 注力ポイントの偏り
function focusBias(state) {
  const total = state.unit.reduce((a, i) => a + i.focus, 0);
  const top = state.unit.reduce((m, i) => (i.focus > m.focus ? i : m), state.unit[0]);
  return { total, top, share: total ? top.focus / total : 0 };
}

function evaluateEnding(state, finalScore) {
  const E = C.ENDING;
  const checks = [];
  // 1. Bad End
  checks.push(['bad', state.bond <= 0 || finalScore < E.CUTOFF_SCORE]);
  const fansOk = state.fans >= E.FANS_TARGET;
  // 2. Individual True End
  const b = focusBias(state);
  checks.push(['individual', fansOk && b.total >= E.BIAS_MIN_TOTAL && b.share >= E.BIAS_SHARE]);
  // 3〜5. True / Secret / Normal
  const trueOk = fansOk && state.bond >= E.BOND_TRUE && finalScore >= E.TRUE_SCORE;
  const secretOk = E.SECRET_ENABLED && trueOk && state.unit.every((i) => i.honne);
  if (E.SECRET_BEFORE_TRUE) checks.push(['secret', secretOk]);
  checks.push(['true', trueOk]);
  if (!E.SECRET_BEFORE_TRUE) checks.push(['secret', secretOk]); // 指示どおりの順番(この場合は発生しない)
  checks.push(['normal', true]);
  const hit = checks.find(([, ok]) => ok);
  return { id: hit[0], fansOk, trueOk, secretOk, bias: { share: b.share, total: b.total, topId: b.top.id }, finalScore };
}

function endingScenes(state, ev) {
  const [a, b, c] = state.unit;
  const U = state.unitName;
  const line = (i, key) => [i.id, idolLine(i, key)];
  switch (ev.id) {
    case 'bad':
      return [
        ['n', `グランプリ決勝の夜。「${U}」の楽屋は静まり返っていた。`],
        ['n', state.bond <= 0 ? '誰も、誰とも目を合わせない。三人の心は、とっくにばらばらだった。' : `スコアは${ev.finalScore.toLocaleString()}点。足切り点の${C.ENDING.CUTOFF_SCORE.toLocaleString()}点に届かなかった。`],
        [a.id, '……ごめん。'],
        ['n', '解散の二文字が、事務所に重くのしかかる。'],
      ];
    case 'individual': {
      const top = findIdol(state, ev.bias.topId);
      const others = state.unit.filter((i) => i !== top);
      return [
        ['n', `グランプリ決勝。スポットライトの中心に立っていたのは、${top.name}だった。`],
        line(top, 'live'),
        ['n', `その歌声は会場を、そして日本中を飲み込んだ。翌朝、${top.name}は「国民的センター」と呼ばれていた。`],
        ['n', `ドラマ、CM、単独ドーム公演。${top.name}は一人で、遥か高みへ駆け上がっていく。`],
        [others[0].id, `……すごいよ、${top.name.split(' ')[1]}。私たちの自慢のセンターだ。`],
        [others[1].id, 'うん。いつか、隣にもう一度立てるように、私たちも頑張らなきゃ。'],
        ['n', '舞台袖の二人は、誇らしげに、少しだけ寂しそうに、その背中を見送った。'],
      ];
    }
    case 'true':
      return [
        ['n', `グランプリ決勝。満員のアリーナに「${U}」の名前がこだまする。`],
        line(a, 'live'), line(b, 'live'), line(c, 'live'),
        ['n', `${PERSONALITIES[a.personality].name}の${a.name}、${PERSONALITIES[b.personality].name}の${b.name}、${PERSONALITIES[c.personality].name}の${c.name}。`],
        ['n', '三つの星は、それぞれの色のまま、ひとつの星座になった。'],
        ['n', `結果は優勝。${ev.finalScore.toLocaleString()}点、完璧なライブだった。`],
        [a.id, '社長!見てた!?私たち、三等星だよ。三人そろって、一番明るい星!'],
        ['n', '雑居ビルの一室から始まった物語は、最高の大団円を迎えた。'],
      ];
    case 'secret':
      return [
        ['n', '優勝セレモニーのあと。三人は、社長を誰もいない控え室に呼び出した。'],
        ...state.unit.map((i) => [i.id, PERSONALITIES[i.personality].honneCore]),
        ...state.unit.map((i) => [i.id, i.relation === 'tsundere' ? '…あんたがプロデューサーで、本当によかった。素直に、そう思ってる。' : i.relation === 'accomplice' ? '完璧じゃない私を知ってるのは、社長だけ。これからも、ずっと共犯者でいてね。' : '社長と出会えて、わたし、本当に幸せです!']),
        ['n', 'それは、ステージの上では決して見せない、三人の本当の顔だった。'],
        ['n', `「${U}」——その本当の物語は、ここから始まる。`],
      ];
    default:
      return [
        ['n', `グランプリ決勝は${ev.finalScore.toLocaleString()}点。頂点には、あと一歩届かなかった。`],
        ['n', '数週間後。始まりの小さなライブハウスで、「' + U + '」の凱旋ライブが開かれた。'],
        line(a, 'live'),
        ['n', '最前列には、デビューの頃から通ってくれているファンの顔があった。'],
        [b.id, 'ここが、私たちのホームだね。'],
        [c.id, 'うん。いつか、もっと大きなステージに、みんなを連れて行こう。'],
        ['n', '終わらないアンコールの中、三人は未来への約束を交わした。'],
      ];
  }
}
