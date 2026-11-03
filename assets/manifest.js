// ============================================================
// 素材の対応表(キャラクター = 画像1枚 + イベント用の動画0本以上)
//
// 書き方:
//   {
//     id: 'char01',                          // 重複しない任意のID
//     image: 'assets/img/char01.jpg',        // 立ち絵・アイコン(縦長推奨。顔が上の方にあるとよい)
//     videos: ['assets/video/char01_a.mp4',  // イベント中に流す動画。複数あればつなげてループ再生
//              'assets/video/char01_b.mp4'],
//     personality: 'pure',                   // 省略可。指定すると、その性格の候補生に優先して割り振る
//                                            // nekketsu / pure / cool / mypace / azatoi / pro / kurou
//   },
//
// ・候補生には、ここに書いたキャラが自動で割り振られます(同じ年の候補生とユニット内では重ならない)
//   キャラが足りないときは、別のユニットと同じキャラを使い回すことがあります
// ・ここが空、またはキャラが足りずに割り振れなかった子は、従来のSVGアバターで表示します
// ・動画は、エピソード・本音イベント・ギャップ・「才能を認めた日」の途中で流れます
//   (「次へ」を押すまでループ再生。設定画面でオフにもできます)
// ・パスは index.html からの相対パスです
// ============================================================
const ASSET_CHARACTERS = [
  { id: 'char10', image: 'assets/img/char10.png', videos: [], personality: 'nekketsu' }, // 珊瑚色ショート・赤白のステージジャケット
  { id: 'char11', image: 'assets/img/char11.png', videos: [], personality: 'mypace' },   // ミント髪・月のケープレット
  { id: 'char12', image: 'assets/img/char12.png', videos: [], personality: 'cool' },     // 紫のボブ・紺と銀のジャケット
  { id: 'char01', image: 'assets/img/char01.jpg', videos: [], personality: 'nekketsu' }, // 赤ジャケット・ガッツポーズ
  { id: 'char02', image: 'assets/img/char02.jpg', videos: [], personality: 'cool' },     // 黒髪ロング・青
  { id: 'char03', image: 'assets/img/char03.jpg', videos: [], personality: 'pro' },      // 金髪・星飾り
  { id: 'char04', image: 'assets/img/char04.jpg', videos: [], personality: 'pure' },     // 桜・ピンクのドレス
  { id: 'char05', image: 'assets/img/char05.jpg', videos: [], personality: 'mypace' },   // パーカー・ヘッドホン
  { id: 'char06', image: 'assets/img/char06.jpg', videos: [], personality: 'azatoi' },   // ツインテール・ウインク
  { id: 'char07', image: 'assets/img/char07.jpg', videos: [], personality: 'kurou' },    // 銀髪ショート・三つ編み
  { id: 'char08', image: 'assets/img/char08.jpg', videos: [], personality: 'pro' },      // 金髪・三つ編みのまとめ髪
  { id: 'char09', image: 'assets/img/char09.jpg', videos: [], personality: 'kurou' },    // 茶髪お団子・タオル
];
