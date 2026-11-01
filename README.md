# 三等星プロデュース(アイドル育成ゲーム)

HTML / CSS / JavaScript のみで作っています。フレームワークもビルドも使いません。
仕様の整理と仮定は [SPEC.md](SPEC.md) にまとめています。

## 起動方法
- 簡単な方法:`index.html` をブラウザで開く(`file://` のままでも動きます)
- 確実な方法:`node tools/serve.js` を実行し、http://localhost:8123 を開く
- テスト:`node tests/run-tests.js`
- バランス確認:`node tests/run-tests.js --sim`(3種類のプレイ方針で150回ずつ自動プレイし、エンディングの分布を表示します)

## ファイル構成
```
index.html          エントリーポイント
css/style.css       見た目
js/constants.js     ★調整用の定数(体力・資金・親愛度・絆・ファン数・増減値・目標値・スコア係数)
js/rng.js           シード付き乱数
js/data.js          性格7タイプ(台詞・ギャップ・エピソード)、得意分野、関係タイプ、衣装、投資、アイテム
js/idols.js         候補生の生成、SVGアバター
js/game.js          週の行動、週次イベント、エピソード、ショップ、ライブの報酬
js/score.js         ★スコア計算式(computeLiveScore)、ボルテージ、おまかせの判定
js/music.js         楽曲と譜面の自動生成(シードで再現できる)
js/ending.js        エンディング判定(判定順どおりに実装)と、各エンディングの台詞
js/audio.js         Web Audio API による合成と再生、効果音
js/rhythm.js        4レーンのリズムゲーム(Canvas)
js/ui.js            画面、セーブ(localStorage)、起動処理
tests/run-tests.js  Node で動くロジックのテストとシミュレーション
tools/serve.js      依存なしの簡易サーバー
```
ロジック(`game.js`、`score.js`、`music.js`、`ending.js` など)は DOM に依存しないので、Node からそのまま読み込んでテストできます。

## 画像・動画の素材を追加する
1. 画像を `assets/img/` に、動画を `assets/video/` に置く(動画は mp4(H.264)推奨)
2. [assets/manifest.js](assets/manifest.js) にキャラクターを1行ずつ追加する
   ```js
   { id: 'char01', image: 'assets/img/char01.jpg', videos: ['assets/video/char01_a.mp4', 'assets/video/char01_b.mp4'] },
   ```
   - `personality`(nekketsu / pure / cool / mypace / azatoi / pro / kurou)を書くと、その性格の候補生に優先して割り振られます
3. 候補生には自動で割り振られます。同じ年の候補生どうしとユニット内では重なりません。素材が足りない子はSVGのアバターのままです
4. エピソード・本音イベント・ギャップ・「才能を認めた日」の途中で、そのキャラの動画が流れます
   - 複数ある場合はつなげてループし、「次へ」を押すまで再生を続けます
   - 動画を挟む位置と、動画を流すイベントの種類は `constants.js` の `VIDEO_CUT_AT` と `VIDEO_EVENT_KINDS` で変えられます
   - 設定画面でオフにもできます
5. 既存のセーブデータにも、次に読み込んだときに自動で割り振られます

※ GitHub Pages は公開サイトです。1ファイル100MBまでで、サイト全体は1GBまでにしてください。

## 操作
- リズムゲーム:D / F / J / K キー、またはレーンをタップ。Esc か「中断」で中断し、おまかせに切り替えられる
- 会話:クリックか Enter で進む
- 設定:BGM、音量、判定オフセット(音ズレの補正)、ノーツの速さ
