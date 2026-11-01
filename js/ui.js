// ============================================================
// 画面描画とプレイヤー操作
// ============================================================

const App = { state: null, meta: null, settings: null, bgm: null, bgmSeed: null };
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yen = (n) => '¥' + Math.round(n).toLocaleString();
const root = () => $('#app');

// ---------- セーブ ----------
function saveGame() {
  try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(App.state)); } catch (e) { console.warn(e); }
}
function loadGame() {
  try { const s = localStorage.getItem(C.SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function deleteSave() { try { localStorage.removeItem(C.SAVE_KEY); } catch (e) { /* noop */ } }
function saveMeta() { try { localStorage.setItem(C.META_KEY, JSON.stringify(App.meta)); } catch (e) { /* noop */ } }
function loadMeta() {
  try { return Object.assign(defaultMeta(), JSON.parse(localStorage.getItem(C.META_KEY) || '{}')); } catch (e) { return defaultMeta(); }
}
function saveSettings() { try { localStorage.setItem(C.SETTINGS_KEY, JSON.stringify(App.settings)); } catch (e) { /* noop */ } }
function loadSettings() {
  const d = { bgm: true, videos: true, musicVol: 0.7, seVol: 0.6, offsetMs: 0, noteSpeed: 1 };
  try { return Object.assign(d, JSON.parse(localStorage.getItem(C.SETTINGS_KEY) || '{}')); } catch (e) { return d; }
}
function applyVolumes() {
  if (!AudioSys.ctx) return;
  AudioSys.music.gain.value = App.settings.musicVol;
  AudioSys.se.gain.value = App.settings.seVol;
}

// ---------- BGM(プレイごとに自動生成) ----------
function playBgm() {
  if (!App.settings.bgm || !AudioSys.ctx) return;
  const seed = (App.state ? App.state.seed : 'title') + ':bgm' + (App.state ? yearOf(App.state.week) : '');
  if (App.bgm && App.bgmSeed === seed) return;
  stopBgm();
  App.bgm = new SongPlayer(generateSong(seed, { calm: true }), { loop: true, calm: true, volume: 0.35 });
  App.bgmSeed = seed;
  App.bgm.start();
}
function stopBgm() { if (App.bgm) { App.bgm.stop(0.6); App.bgm = null; App.bgmSeed = null; } }

// ---------- モーダルとシーン ----------
function openModal(html, cls) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal-back';
  m.innerHTML = `<div class="modal ${cls || ''}">${html}</div>`;
  document.body.appendChild(m);
  return m.firstElementChild;
}
function closeModal() { $$('.modal-back').forEach((m) => m.remove()); }

function speakerInfo(id) {
  if (id === 'p') return { name: '社長', avatar: '<div class="avatar-p">社長</div>' };
  if (id === 'n') return null;
  const idol = (App.state && (findIdol(App.state, id) || App.state.candidates.find((c) => c.id === id)));
  return idol ? { name: idol.name, avatar: avatarSVG(idol, 84), idol } : null;
}

// scenes を順番に再生。選択肢があれば選ばせる
function playScenes(scenes, done) {
  scenes = (scenes || []).filter(Boolean);
  if (!scenes.length) { done && done(); return; }
  const [sc, ...rest] = scenes;
  let i = 0;
  const box = openModal('<div class="scene"></div>', 'scene-modal');
  // イベント動画:台詞の途中(VIDEO_CUT_AT の位置)で一度だけ挟む
  const vIdol = sc.video && App.settings.videos ? findIdol(App.state, sc.video) : null;
  const videos = vIdol ? idolVideos(vIdol) : [];
  const cutAt = videos.length ? Math.min(sc.lines.length - 1, Math.max(1, Math.round(sc.lines.length * C.VIDEO_CUT_AT))) : -1;
  const next = () => {
    if ($('.video-cut')) return;
    if (i === cutAt && !sc._videoShown) {
      sc._videoShown = true;
      playVideoCut(videos, `${vIdol.name}|${sc.title}`, next);
      return;
    }
    if (i < sc.lines.length) {
      const ln = sc.lines[i++];
      const sp = speakerInfo(ln.speaker);
      $('.scene', box).innerHTML = `
        <div class="scene-title">${esc(sc.title)}</div>
        <div class="scene-body ${sp ? '' : 'narr'}">
          ${sp ? `<div class="scene-avatar">${sp.avatar}</div>` : ''}
          <div class="scene-text">${sp ? `<div class="scene-name">${esc(sp.name)}</div>` : ''}<p>${esc(ln.text)}</p></div>
        </div>
        <div class="scene-next">▼ クリック / Enter</div>`;
      return;
    }
    if (sc.choices && !sc._chosen) {
      $('.scene-next', box).remove();
      const c = document.createElement('div');
      c.className = 'choices';
      sc.choices.forEach((ch) => {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = ch.label;
        b.onclick = (e) => {
          e.stopPropagation();
          sc._chosen = true;
          const msg = ch.apply(App.state);
          sc.lines.push({ speaker: 'n', text: msg });
          saveGame();
          next();
        };
        c.appendChild(b);
      });
      $('.scene', box).appendChild(c);
      return;
    }
    document.removeEventListener('keydown', onKey);
    closeModal();
    playScenes(rest, done);
  };
  const onKey = (e) => { if ($('.video-cut')) return; if ((e.key === 'Enter' || e.key === ' ') && !$('.choices', box)) { e.preventDefault(); next(); } };
  box.parentElement.addEventListener('click', () => { if (!$('.choices', box)) next(); });
  document.addEventListener('keydown', onKey);
  next();
}

// 動画を画面いっぱいに再生。複数あれば順につなげてループし、「次へ」を押すまで流し続ける
function playVideoCut(urls, title, done) {
  const ov = document.createElement('div');
  ov.className = 'video-cut';
  ov.innerHTML = `<video playsinline preload="auto"></video>
    <div class="vc-bar"><span class="vc-title">${esc(title)}</span><span class="vc-count"></span><button class="btn big vc-next">次へ</button></div>
    <div class="vc-error hidden">動画を読み込めませんでした</div>`;
  document.body.appendChild(ov);
  const v = $('video', ov);
  // BGMを止める(終了時に元に戻す)
  const prevVol = AudioSys.music ? AudioSys.music.gain.value : null;
  if (AudioSys.music) AudioSys.music.gain.value = 0;
  let k = 0, fails = 0;
  const playAt = (n) => {
    k = n % urls.length;
    $('.vc-count', ov).textContent = urls.length > 1 ? `${k + 1}/${urls.length}` : '';
    v.src = urls[k];
    v.loop = urls.length === 1;
    const p = v.play();
    if (p) p.catch(() => { v.muted = true; v.play().catch(() => {}); }); // 自動再生が拒否されたら消音で再生
  };
  v.onplaying = () => { fails = 0; };
  v.onended = () => playAt(k + 1);
  v.onerror = () => {
    fails++;
    if (fails >= urls.length) { $('.vc-error', ov).classList.remove('hidden'); return; }
    playAt(k + 1);
  };
  const close = (e) => {
    if (e) e.stopPropagation();
    v.pause(); v.removeAttribute('src'); v.load();
    ov.remove();
    if (AudioSys.music && prevVol != null) AudioSys.music.gain.value = prevVol;
    done();
  };
  $('.vc-next', ov).onclick = close;
  $('.vc-next', ov).focus();
  playAt(0);
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- 共通パーツ ----------
function bar(v, max, cls) {
  return `<div class="bar ${cls || ''}"><div style="width:${clamp((v / max) * 100, 0, 100)}%"></div></div>`;
}
function condBadge(c) {
  return `<span class="cond c${c + 2}">${C.CONDITION_NAMES[c + 2]}</span>`;
}
function idolTags(i) {
  return `<span class="tag p" style="--c:${PERSONALITIES[i.personality].color}">${PERSONALITIES[i.personality].name}</span>
    <span class="tag">${PERF_SPECIALTIES[i.perf].name}</span><span class="tag">${OFF_SPECIALTIES[i.off].name}</span>
    <span class="tag rel">${RELATIONS[i.relation].name}</span>`;
}
function statsTable(i) {
  return `<div class="stats">${['tech', 'sense', 'visual', 'talk'].map((k) => `<div><span>${STAT_NAMES[k]}</span><b>${Math.round(i.stats[k])}</b></div>`).join('')}</div>`;
}

// ---------- タイトル ----------
function renderTitle() {
  stopBgm();
  const save = loadGame();
  const m = App.meta;
  root().innerHTML = `
    <div class="title-screen">
      <div class="title-logo"><span>弱小事務所から始める</span><h1>三等星プロデュース</h1><p>— Idol Triangle Producer —</p></div>
      <div class="title-menu">
        ${save && save.phase !== 'ending' ? `<button class="btn big" id="b-cont">つづきから<small>${save.unitName || '結成前'}/${yearOf(save.week)}年目 ${weekInYear(save.week)}週</small></button>` : ''}
        <button class="btn big" id="b-new">はじめから${m.loops ? `<small>周回 ${m.loops} 回目の引き継ぎあり</small>` : ''}</button>
        <div class="seed-row"><label>シード <input id="seed" placeholder="空欄ならランダム" maxlength="24"></label></div>
        <button class="btn ghost" id="b-gallery">エンディング記録</button>
        <button class="btn ghost" id="b-settings">設定</button>
      </div>
      <p class="hint">セーブは毎週ブラウザ(localStorage)に自動保存されます。</p>
    </div>`;
  if ($('#b-cont')) $('#b-cont').onclick = () => { App.state = save; ensureAudio(); applyVolumes(); renderPhase(); };
  $('#b-new').onclick = () => {
    if (save && save.phase !== 'ending' && !confirm('今のセーブデータは上書きされます。よろしいですか?')) return;
    ensureAudio(); applyVolumes();
    const seed = $('#seed').value.trim() || Math.random().toString(36).slice(2, 10);
    App.state = newGameState(seed, App.meta);
    saveGame();
    renderPhase();
  };
  $('#b-gallery').onclick = showGallery;
  $('#b-settings').onclick = showSettings;
}

function showGallery() {
  const m = App.meta;
  openModal(`<h2>エンディング記録</h2>
    <ul class="gallery">${Object.entries(ENDINGS).map(([k, e]) => `<li class="${m.endings.includes(k) ? 'got' : ''}">${m.endings.includes(k) ? '★ ' + e.name : '??? (未到達)'}</li>`).join('')}</ul>
    <p>周回数:${m.loops} / 決勝の最高スコア:${(m.bestFinal || 0).toLocaleString()} / 引き継ぐ衣装:${m.costumes.length ? m.costumes.map((k) => COSTUMES[k].name).join('、') : 'なし'}</p>
    <button class="btn" onclick="closeModal()">閉じる</button>`);
}

function showSettings() {
  const s = App.settings;
  const box = openModal(`<h2>設定</h2>
    <label class="set"><input type="checkbox" id="s-bgm" ${s.bgm ? 'checked' : ''}> BGMを流す</label>
    <label class="set"><input type="checkbox" id="s-vid" ${s.videos ? 'checked' : ''}> イベント中に動画を流す(素材がある場合)</label>
    <label class="set">音楽の音量 <input type="range" id="s-mv" min="0" max="1" step="0.05" value="${s.musicVol}"></label>
    <label class="set">効果音の音量 <input type="range" id="s-sv" min="0" max="1" step="0.05" value="${s.seVol}"></label>
    <label class="set">判定オフセット <input type="range" id="s-off" min="-150" max="150" step="5" value="${s.offsetMs}"> <span id="s-offv">${s.offsetMs}ms</span></label>
    <p class="hint">ノーツが早く来るように感じたら+、遅く感じたら−にします。</p>
    <label class="set">ノーツの速さ <input type="range" id="s-ns" min="0.6" max="2" step="0.1" value="${s.noteSpeed}"> <span id="s-nsv">×${s.noteSpeed}</span></label>
    <button class="btn" id="s-close">閉じる</button>`);
  $('#s-off', box).oninput = (e) => ($('#s-offv', box).textContent = e.target.value + 'ms');
  $('#s-ns', box).oninput = (e) => ($('#s-nsv', box).textContent = '×' + e.target.value);
  $('#s-close', box).onclick = () => {
    s.bgm = $('#s-bgm', box).checked;
    s.videos = $('#s-vid', box).checked;
    s.musicVol = +$('#s-mv', box).value; s.seVol = +$('#s-sv', box).value;
    s.offsetMs = +$('#s-off', box).value; s.noteSpeed = +$('#s-ns', box).value;
    saveSettings(); ensureAudio(); applyVolumes();
    if (!s.bgm) stopBgm(); else if (App.state && App.state.phase !== 'title') playBgm();
    closeModal();
  };
}

// ---------- フェーズ振り分け ----------
function renderPhase() {
  const s = App.state;
  if (!s) return renderTitle();
  ensureCharacters(s); // 素材が増えた・減った場合に割り振り直す
  if (s.phase === 'scout') return renderScout();
  if (s.phase === 'ending') return renderTitle();
  if (s.phase === 'finale') return renderEnding(s.finalScore);
  return renderHome();
}

// ---------- 候補生 ----------
function candidateCard(c, selected) {
  return `<div class="card cand ${selected ? 'sel' : ''}" data-id="${c.id}">
    <div class="cand-head">${avatarSVG(c, 84)}<div><h3>${esc(c.name)}</h3>${idolTags(c)}</div></div>
    <p class="feature">${esc(PERSONALITIES[c.personality].feature)}</p>
    <p class="quote">「${esc(idolLine(c, 'greet'))}」</p>
    ${statsTable(c)}
    <p class="rel-desc">${RELATIONS[c.relation].desc}</p>
  </div>`;
}

function renderScout() {
  const s = App.state;
  playBgm();
  const first = s.unit.length === 0;
  const sel = new Set();
  root().innerHTML = `
    <div class="screen">
      <header class="top"><h2>${yearOf(s.week)}年目:新しい候補生が入所しました(${s.candidates.length}人)</h2></header>
      <p class="lead">${first ? 'ユニットのメンバーを3人選んでください。性格・得意分野・社長との関係がそれぞれ違います。' : `入れ替えたい候補生を1人選び、卒業するメンバーを選べます。入れ替えると絆が15下がります。`}</p>
      ${first ? '' : `<div class="unit-row">${s.unit.map((i) => `<div class="mini" data-out="${i.id}">${avatarSVG(i, 56)}<span>${esc(i.name)}</span></div>`).join('')}</div>`}
      <div class="grid cands">${s.candidates.map((c) => candidateCard(c)).join('')}</div>
      <div class="bottom-bar">
        ${first ? `<label>ユニット名 <input id="unit-name" value="${esc(UNIT_NAME_SUGGEST[hashSeed(s.seed) % UNIT_NAME_SUGGEST.length])}" maxlength="20"></label>
          <button class="btn big" id="b-form" disabled>結成する(0/3)</button>`
          : `<button class="btn" id="b-skip">入れ替えない</button><button class="btn big" id="b-swap" disabled>入れ替える</button>`}
      </div>
    </div>`;
  let outId = null;
  $$('.cand').forEach((el) => el.onclick = () => {
    const id = el.dataset.id;
    if (first) {
      if (sel.has(id)) sel.delete(id); else if (sel.size < 3) sel.add(id);
    } else { sel.clear(); sel.add(id); }
    $$('.cand').forEach((e2) => e2.classList.toggle('sel', sel.has(e2.dataset.id)));
    playSE('select');
    refresh();
  });
  $$('.mini[data-out]').forEach((el) => el.onclick = () => {
    outId = el.dataset.out;
    $$('.mini[data-out]').forEach((e2) => e2.classList.toggle('sel', e2.dataset.out === outId));
    refresh();
  });
  function refresh() {
    if (first) { const b = $('#b-form'); b.disabled = sel.size !== 3; b.textContent = `結成する(${sel.size}/3)`; }
    else $('#b-swap').disabled = !(sel.size === 1 && outId);
  }
  if (first) {
    $('#b-form').onclick = () => {
      formUnit(s, [...sel], $('#unit-name').value.trim());
      saveGame();
      const intro = s.unit.map((i) => makeScene(`メンバー紹介:${i.name}`, i, [['i', idolLine(i, 'greet')], ['n', `${PERSONALITIES[i.personality].feature}(${RELATIONS[i.relation].name})`]]));
      playScenes(intro, renderHome);
    };
  } else {
    $('#b-skip').onclick = () => { finishScouting(s); saveGame(); renderHome(); };
    $('#b-swap').onclick = () => {
      const inId = [...sel][0];
      swapMember(s, outId, inId);
      const idol = findIdol(s, inId);
      finishScouting(s); saveGame();
      playScenes([makeScene('新メンバー加入', idol, [['i', idolLine(idol, 'greet')]])], renderHome);
    };
  }
}

// ---------- ホーム ----------
function renderHome() {
  const s = App.state;
  if (s.week > totalWeeks()) return;
  playBgm();
  const li = liveIndexOfWeek(s.week);
  const nl = nextLive(s);
  root().innerHTML = `
    <div class="screen home">
      <header class="top">
        <div class="date"><b>${yearOf(s.week)}</b>年目 <b>${weekInYear(s.week)}</b>週<small>(通算 ${s.week}/${totalWeeks()})</small></div>
        <div class="res">
          <span title="資金">💰 ${yen(s.money)}</span>
          <span title="ファン数">💗 ${s.fans.toLocaleString()} / ${C.ENDING.FANS_TARGET.toLocaleString()}</span>
          <span title="知名度">📣 ${Math.round(s.fame)}</span>
          <span title="ユニットの絆">🤝 絆 ${s.bond}</span>
        </div>
        <div class="menu"><button class="btn small" id="b-shop">ショップ</button><button class="btn small" id="b-items">アイテム</button><button class="btn small ghost" id="b-log">ログ</button><button class="btn small ghost" id="b-set">設定</button><button class="btn small ghost" id="b-title">タイトル</button></div>
      </header>
      <div class="office">🏢 ${esc(s.unitName)}|事務所:${officeRankName(s)}(規模 ${officeScale(s)})${s.loop ? `|周回 ${s.loop}` : ''}|シード <code>${esc(s.seed)}</code></div>
      <div class="grid unit">${s.unit.map(idolCard).join('')}</div>
      <div class="bond-row">ユニットの絆 ${bar(s.bond, C.BOND_MAX, 'bond')}</div>
      ${li >= 0 ? `
        <div class="live-banner"><h2>LIVE ${li + 1} / 7 ${li === 6 ? '— アイドルグランプリ決勝 —' : ''}</h2><p>今週はライブ!ライバル「${C.RIVALS[li].name}」とスコアを競います。</p><button class="btn big" id="b-live">ライブの準備へ</button></div>`
      : `
        <div class="next-live">${nl ? `次のライブ:LIVE ${nl.index + 1}(あと ${nl.inWeeks} 週)vs ${C.RIVALS[nl.index].name}` : ''}</div>
        <div class="actions">
          ${[['lesson', 'レッスン', '能力↑ 体力↓ 絆↑'], ['work', 'お仕事', '資金・経験 体力↓'], ['sns', 'SNS', '知名度・ファン・親愛度'], ['outing', 'お出かけ', '親愛度↑ 調子↑'], ['rest', '休み', '体力回復']]
            .map(([k, n, d]) => `<button class="action a-${k}" data-act="${k}"><b>${n}</b><small>${d}</small></button>`).join('')}
        </div>`}
      <div class="log-mini">${s.log.slice(0, 4).map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    </div>`;
  $$('.idol-card').forEach((el) => el.onclick = () => showIdolDetail(el.dataset.id));
  $$('.action').forEach((el) => el.onclick = () => chooseAction(el.dataset.act));
  if ($('#b-live')) $('#b-live').onclick = renderLivePrep;
  $('#b-shop').onclick = () => showShop('invest');
  $('#b-items').onclick = showItems;
  $('#b-log').onclick = () => openModal(`<h2>ログ</h2><div class="log-full">${s.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div><button class="btn" onclick="closeModal()">閉じる</button>`);
  $('#b-set').onclick = showSettings;
  $('#b-title').onclick = () => { saveGame(); renderTitle(); };
}

function idolCard(i) {
  const epNext = i.episodesSeen < 3 ? C.EPISODE_THRESHOLDS[i.episodesSeen] : null;
  return `<div class="card idol-card" data-id="${i.id}">
    <div class="ic-head">${avatarSVG(i, 72)}<div><h3>${esc(i.name)}</h3>${idolTags(i)}</div></div>
    <div class="ic-row"><span>体力</span>${bar(i.stamina, i.staminaMax, i.stamina < C.LOW_STAMINA ? 'low' : 'stamina')}<small>${i.stamina}</small></div>
    <div class="ic-row"><span>親愛度</span>${bar(i.affection, C.AFFECTION_MAX, 'aff')}<small>${Math.round(i.affection)}</small></div>
    <div class="ic-row"><span>調子</span>${condBadge(i.condition)}<span class="ep">エピソード ${i.episodesSeen}/3${epNext ? `(次:${epNext})` : ''}${i.honne ? ' 💌' : ''}${!i.accepted ? ' 😤' : ''}</span></div>
    ${statsTable(i)}
  </div>`;
}

// ---------- 行動の選択 ----------
function chooseAction(act) {
  const s = App.state;
  const opt = (v, label, extra) => `<button class="btn opt" data-v="${v}">${label}${extra ? `<small>${extra}</small>` : ''}</button>`;
  const idolOpts = (extraFn) => s.unit.map((i) => opt(i.id, esc(i.name), extraFn ? extraFn(i) : `体力 ${i.stamina}`)).join('');
  if (act === 'rest') return runAction('rest', {});
  let html = '';
  if (act === 'lesson') {
    html = `<h2>レッスン</h2>
      <h4>内容</h4><div class="opts" id="o-stat">${['tech', 'sense', 'visual'].map((k) => opt(k, STAT_NAMES[k] + 'レッスン')).join('')}</div>
      <h4>参加メンバー</h4><div class="opts" id="o-target">${opt('unit', 'ユニット全員', '絆が上がる')}${idolOpts((i) => `個人レッスン:効果大・体力 ${i.stamina}`)}</div>`;
  } else if (act === 'work') {
    html = `<h2>お仕事</h2><div class="opts" id="o-target">${opt('unit', 'ユニットで出演', '報酬・ファン大')}${idolOpts((i) => `${OFF_SPECIALTIES[i.off].name}・体力 ${i.stamina}`)}${opt('president', '社長自身が働く', 'アイドルは自主練で体力回復')}</div>`;
  } else if (act === 'sns') {
    html = `<h2>SNS</h2><div class="opts" id="o-target">${opt('unit', 'ユニットで投稿', 'ファン・全員の親愛度')}${idolOpts((i) => `ビジュアル ${Math.round(i.stats.visual)}`)}</div><p class="hint">調子が悪いと炎上しやすくなります。</p>`;
  } else if (act === 'outing') {
    html = `<h2>お出かけ</h2><div class="opts" id="o-target">${opt('unit', 'みんなで出かける', `絆↑ ${yen(C.OUTING.UNIT_COST)}`)}${idolOpts((i) => `親愛度 ${Math.round(i.affection)}・${yen(C.OUTING.SOLO_COST)}`)}</div>`;
  }
  html += `<div class="row"><button class="btn ghost" id="o-cancel">やめる</button><button class="btn big" id="o-go" disabled>決定</button></div>`;
  const box = openModal(html);
  const pick = { stat: act === 'lesson' ? null : 'x', target: null };
  $$('#o-stat .opt', box).forEach((b) => b.onclick = () => { pick.stat = b.dataset.v; mark('#o-stat', b); });
  $$('#o-target .opt', box).forEach((b) => b.onclick = () => { pick.target = b.dataset.v; mark('#o-target', b); });
  function mark(g, b) {
    $$(g + ' .opt', box).forEach((x) => x.classList.toggle('sel', x === b));
    $('#o-go', box).disabled = !(pick.stat && pick.target);
  }
  $('#o-cancel', box).onclick = closeModal;
  $('#o-go', box).onclick = () => { closeModal(); runAction(act, pick); };
}

function runAction(act, opts) {
  const s = App.state;
  const res = doAction(s, act, opts);
  const scene = { title: res.title, lines: res.lines.concat(res.log.map((t) => ({ speaker: 'n', text: t }))) };
  const after = endWeek(s);
  advanceWeek(s); // 先に週を進めて保存(シーン中にリロードしても二重行動にならない)
  saveGame();
  playScenes([scene, ...after], renderPhase);
}

// ---------- アイドル詳細 ----------
function showIdolDetail(id) {
  const s = App.state;
  const i = findIdol(s, id);
  const P = PERSONALITIES[i.personality];
  const box = openModal(`
    <div class="detail">
      <div class="d-left">${avatarSVG(i, 180)}</div>
      <div class="d-right">
        <h2>${esc(i.name)}</h2>${idolTags(i)}
        <p>${esc(P.feature)}</p>
        <p class="gap">ギャップ:${i.gapRevealed ? esc(P.gap) : '???(イベントで判明)'}</p>
        <p class="small">${OFF_SPECIALTIES[i.off].name}:${OFF_SPECIALTIES[i.off].desc}<br>${RELATIONS[i.relation].name}:${RELATIONS[i.relation].desc}${i.relation === 'tsundere' ? (i.accepted ? '(認めてくれた)' : `(合計ステータス ${C.TSUNDERE_ACCEPT_STATS} 以上、またはセンターでライブに勝つと…)`) : ''}</p>
        ${statsTable(i)}
        <p class="small">注力ポイント:${i.focus} / 本音イベント:${i.honne ? '回収済み 💌' : '未回収'}</p>
        <h4>衣装</h4>
        <div class="opts costumes">${s.costumes.map((k) => `<button class="btn opt ${i.costume === k ? 'sel' : ''}" data-c="${k}">${COSTUMES[k].name}${P.favCostume === k ? ' ♥' : ''}<small>${COSTUMES[k].desc}</small></button>`).join('')}</div>
        <p class="hint">♥ はお気に入りの衣装(全ステータス+5%)</p>
        <h4>エピソード</h4>
        <div class="opts">${[0, 1, 2].map((n) => `<button class="btn opt" data-ep="${n}" ${n < i.episodesSeen ? '' : 'disabled'}>${n < i.episodesSeen ? `エピソード${n + 1}${n === 2 ? '「本音」' : ''}` : `親愛度 ${C.EPISODE_THRESHOLDS[n]} で解放`}</button>`).join('')}</div>
      </div>
    </div>
    <button class="btn" id="d-close">閉じる</button>`, 'wide');
  $$('[data-c]', box).forEach((b) => b.onclick = () => { equipCostume(s, id, b.dataset.c); saveGame(); renderHome(); showIdolDetail(id); });
  $$('[data-ep]', box).forEach((b) => b.onclick = () => {
    const n = +b.dataset.ep;
    const sc = episodeScene(s, i, n);
    if (n === 2 && i.honne) sc.choices = null;
    playScenes([sc], () => { renderHome(); });
  });
  $('#d-close', box).onclick = closeModal;
}

// ---------- ショップ ----------
function showShop(tab) {
  const s = App.state;
  let body = '';
  if (tab === 'invest') {
    body = Object.entries(INVESTMENTS).map(([k, inv]) => {
      const c = canInvest(s, k);
      return `<div class="shop-item"><div><b>${inv.name}</b> Lv${s.invest[k]}/${C.INVEST_MAX_LV}<small>${inv.desc}</small></div>
        <button class="btn small" data-inv="${k}" ${c.ok ? '' : 'disabled'}>${s.invest[k] >= C.INVEST_MAX_LV ? 'MAX' : yen(investCost(s, k))}${c.ok ? '' : `<small>${c.why}</small>`}</button></div>`;
    }).join('') + `<p class="hint">投資するほど事務所の規模が大きくなり、新しい投資先が解放されます。現在:${officeRankName(s)}(規模 ${officeScale(s)})</p>`;
  } else if (tab === 'item') {
    body = Object.entries(ITEMS).map(([k, it]) => `<div class="shop-item"><div><b>${it.name}</b>(所持 ${s.items[k]})<small>${it.desc}</small></div><button class="btn small" data-item="${k}" ${s.money >= it.price ? '' : 'disabled'}>${yen(it.price)}</button></div>`).join('');
  } else {
    body = Object.entries(COSTUMES).map(([k, co]) => {
      const p = costumePrice(s, k);
      const owned = s.costumes.includes(k);
      return `<div class="shop-item"><div class="cos-swatch" style="background:${co.color};border-color:${co.accent}"></div><div><b>${co.name}</b><small>${co.desc}</small></div>
        <button class="btn small" data-cos="${k}" ${owned || p == null || s.money < p ? 'disabled' : ''}>${owned ? '所持済み' : p == null ? '非売品' : yen(p)}</button></div>`;
    }).join('') + (s.unit.some((i) => i.off === 'design') ? '<p class="hint">デザインが得意なメンバーがいるので2割引き!</p>' : '');
  }
  const box = openModal(`<h2>ショップ <small>所持金 ${yen(s.money)}</small></h2>
    <div class="tabs">${[['invest', '投資'], ['item', 'アイテム'], ['costume', '衣装']].map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div class="shop-list">${body}</div><button class="btn" id="sh-close">閉じる</button>`, 'wide');
  $$('[data-tab]', box).forEach((b) => b.onclick = () => showShop(b.dataset.tab));
  const done = (r) => { if (r.ok) { playSE('select'); saveGame(); renderHome(); } else toast(r.why); showShop(tab); };
  $$('[data-inv]', box).forEach((b) => b.onclick = () => done(buyInvest(s, b.dataset.inv)));
  $$('[data-item]', box).forEach((b) => b.onclick = () => done(buyItem(s, b.dataset.item)));
  $$('[data-cos]', box).forEach((b) => b.onclick = () => done(buyCostume(s, b.dataset.cos)));
  $('#sh-close', box).onclick = closeModal;
}

function showItems() {
  const s = App.state;
  const box = openModal(`<h2>アイテム</h2><div class="shop-list">${Object.entries(ITEMS).map(([k, it]) => `<div class="shop-item"><div><b>${it.name}</b> ×${s.items[k]}<small>${it.desc}</small></div>
    <div class="row">${it.target === 'idol' ? s.unit.map((i) => `<button class="btn small" data-use="${k}" data-id="${i.id}" ${s.items[k] ? '' : 'disabled'}>${esc(i.name.split(' ')[1])}</button>`).join('') : `<button class="btn small" data-use="${k}" ${s.items[k] ? '' : 'disabled'}>使う</button>`}</div></div>`).join('')}</div>
    <button class="btn" id="it-close">閉じる</button>`, 'wide');
  $$('[data-use]', box).forEach((b) => b.onclick = () => {
    const r = useItem(s, b.dataset.use, b.dataset.id);
    if (!r.ok) return;
    saveGame(); renderHome();
    if (r.scenes.length) playScenes(r.scenes, renderHome); else showItems();
  });
  $('#it-close', box).onclick = closeModal;
}

// ---------- ライブ ----------
function renderLivePrep() {
  const s = App.state;
  const setup = liveSetup(s);
  const song = generateSong(setup.songSeed, { liveIndex: setup.index });
  const chart = generateChart(song, C.CHART_DENSITY[setup.index]);
  let center = s.unit.reduce((m, i) => (idolLivePower(i) > idolLivePower(m) ? i : m)).id;
  const draw = () => {
    const ctx = buildLiveContext(s, center, setup);
    root().innerHTML = `
      <div class="screen live-prep">
        <header class="top"><h2>LIVE ${setup.index + 1} / 7 ${setup.isFinal ? '— アイドルグランプリ決勝 —' : ''}</h2></header>
        <div class="vs"><div><b>${esc(s.unitName)}</b></div><span>VS</span><div><b>${esc(setup.rival)}</b><small>予想スコア ${setup.rivalScore.toLocaleString()}</small></div></div>
        <div class="song-info">♪ 楽曲「${esc(song.title)}」 BPM ${song.bpm} / ${song.mode === 'major' ? 'メジャー' : 'マイナー'} / ノーツ ${chart.notes.length} / ${Math.round(song.duration)}秒 <small>(シード:${esc(setup.songSeed)})</small> <button class="btn small ghost" id="b-preview">試聴</button></div>
        <h3>センターを選ぶ(係数 ×${C.POSITION_COEF.center})</h3>
        <div class="grid unit">${s.unit.map((i) => {
          const m = ctx.members.find((x) => x.id === i.id);
          return `<div class="card pos-card ${i.id === center ? 'center' : ''}" data-id="${i.id}">
            <div class="pos-label">${i.id === center ? '★ CENTER' : 'SIDE'}</div>
            ${avatarSVG(i, 90)}<h3>${esc(i.name)}</h3>
            <p>基礎ステータス <b>${Math.round(m.power)}</b> × ${m.coef}</p>
            <p>${condBadge(i.condition)} 体力 ${i.stamina}</p>
            <p class="small">衣装:${COSTUMES[i.costume].name}</p>
            ${m.buff ? `<p class="buff">サイドのバフ:${m.buff === 'score' ? 'スコアアップ' : '判定緩和'}</p>` : i.id !== center ? '<p class="small">バフ発動なし</p>' : ''}
          </div>`;
        }).join('')}</div>
        <p class="hint">サイドのバフは、絆と親愛度が高いほど発動しやすくなります。フィーバー倍率:×${ctx.feverMult.toFixed(2)}(絆で決まる)</p>
        <div class="row center">
          <button class="btn big" id="b-rhythm">リズムゲームで挑む<small>D F J K / タップ</small></button>
          <button class="btn big ghost" id="b-auto">おまかせ<small>ステータスから自動判定</small></button>
        </div>
      </div>`;
    $$('.pos-card').forEach((el) => el.onclick = () => { center = el.dataset.id; playSE('select'); draw(); });
    let prev = null;
    $('#b-preview').onclick = () => {
      if (prev) { prev.stop(); prev = null; playBgm(); return; }
      stopBgm(); ensureAudio(); prev = new SongPlayer(song, { volume: 0.7 }); prev.start();
      setTimeout(() => { if (prev) { prev.stop(1); prev = null; } }, 15000);
    };
    $('#b-rhythm').onclick = () => { if (prev) prev.stop(); startRhythm(setup, song, chart, center); };
    $('#b-auto').onclick = () => {
      if (prev) prev.stop();
      const lctx = buildLiveContext(s, center, setup);
      finishLive(setup, center, simulateAuto(lctx, chart, setup.songSeed), lctx);
    };
  };
  draw();
}

function startRhythm(setup, song, chart, center) {
  const s = App.state;
  stopBgm();
  const lctx = buildLiveContext(s, center, setup);
  root().innerHTML = '<div class="rhythm-screen" id="rg"></div>';
  const game = new RhythmGame({
    container: $('#rg'), song, chart, liveCtx: lctx, center: findIdol(s, center), settings: App.settings,
    onFinish: (r) => finishLive(setup, center, r, lctx),
    onAbort: () => {
      if (confirm('リズムゲームを中断して「おまかせ」で判定しますか?\n(キャンセルすると準備画面に戻ります)')) finishLive(setup, center, simulateAuto(lctx, chart, setup.songSeed), lctx);
      else renderLivePrep();
    },
  });
  window.__rg = game; // デバッグ・テスト用
  game.start();
}

function finishLive(setup, centerId, r, lctx) {
  const s = App.state;
  const out = applyLiveResult(s, setup, centerId, r);
  if (setup.isFinal) { s.phase = 'finale'; s.finalScore = r.total; } else advanceWeek(s);
  saveGame();
  if (out.win) playSE('win');
  const j = r.judge;
  const centerIdol = findIdol(s, centerId);
  root().innerHTML = `
    <div class="screen live-result ${out.win ? 'win' : 'lose'}">
      <h1>${out.win ? 'WIN!' : 'LOSE…'}</h1>
      <div class="vs"><div><b>${esc(s.unitName)}</b><big>${r.total.toLocaleString()}</big></div><span>VS</span><div><b>${esc(setup.rival)}</b><big>${setup.rivalScore.toLocaleString()}</big></div></div>
      <div class="breakdown card">
        <h3>スコアの内訳(${r.mode === 'auto' ? 'おまかせ' : 'リズムゲーム'})</h3>
        <table>
          <tr><td>Σ(基礎ステータス × ポジション係数)× バフ</td><td>${r.sigma.toLocaleString()}</td></tr>
          <tr><td>× スケール ${C.STAT_SCORE_SCALE} × コンボ補正 ${r.comboMult.toFixed(3)}(最大 ${j.maxCombo} コンボ)</td><td>${r.base.toLocaleString()}</td></tr>
          <tr><td>フィーバー加点(${j.feverCount}回、×${lctx.feverMult.toFixed(2)})</td><td>+${r.feverBonus.toLocaleString()}</td></tr>
          <tr><td>判定ボーナス(Perfect ${j.perfect} / Good ${j.good} / Miss ${j.miss})</td><td>+${r.judgeBonus.toLocaleString()}</td></tr>
          <tr class="sum"><td>ライブスコア</td><td>${r.total.toLocaleString()}</td></tr>
        </table>
      </div>
      <p class="rewards">獲得:${out.rewards.join(' / ')}</p>
      <div class="result-face">${avatarSVG(centerIdol, 80)}<p>「${esc(idolLine(centerIdol, out.win ? 'win' : 'lose'))}」</p></div>
      <button class="btn big" id="b-next">${setup.isFinal ? '結果発表へ' : '次へ'}</button>
    </div>`;
  $('#b-next').onclick = () => playScenes(out.scenes, () => {
    if (setup.isFinal) return renderEnding(r.total);
    renderPhase();
  });
}

// ---------- エンディング ----------
function renderEnding(finalScore) {
  const s = App.state;
  const ev = evaluateEnding(s, finalScore);
  s.ending = ev;
  s.phase = 'ending';
  const m = App.meta;
  if (!m.endings.includes(ev.id)) m.endings.push(ev.id);
  m.bestFinal = Math.max(m.bestFinal || 0, finalScore);
  m.costumes = Array.from(new Set(m.costumes.concat(s.costumes.filter((k) => k !== 'school'))));
  saveMeta(); saveGame();
  const lines = endingScenes(s, ev);
  playScenes([{ title: ENDINGS[ev.id].name, lines: lines.map(([sp, t]) => ({ speaker: sp, text: t })) }], () => {
    const b = focusBias(s);
    root().innerHTML = `
      <div class="screen ending e-${ev.id}">
        <p class="end-tag">${ENDINGS[ev.id].short} END</p>
        <h1>${ENDINGS[ev.id].name}</h1>
        <div class="unit-row">${s.unit.map((i) => `<div class="mini">${avatarSVG(i, 90)}<span>${esc(i.name)}</span></div>`).join('')}</div>
        <div class="card end-stats">
          <div>決勝スコア <b>${finalScore.toLocaleString()}</b>(True基準 ${C.ENDING.TRUE_SCORE.toLocaleString()} / 足切り ${C.ENDING.CUTOFF_SCORE.toLocaleString()})</div>
          <div>ファン数 <b>${s.fans.toLocaleString()}</b>(目標 ${C.ENDING.FANS_TARGET.toLocaleString()})</div>
          <div>絆 <b>${s.bond}</b>(True基準 ${C.ENDING.BOND_TRUE})</div>
          <div>注力の偏り <b>${Math.round(b.share * 100)}%</b>(${C.ENDING.BIAS_SHARE * 100}%以上で偏り)/ 本音イベント <b>${s.unit.filter((i) => i.honne).length}/3</b></div>
          <div>ライブ戦績 <b>${s.liveResults.filter((l) => l.win).length}勝${s.liveResults.filter((l) => !l.win).length}敗</b></div>
        </div>
        ${ev.id === 'bad' ? `
          <p>解散の危機……。どうしますか?</p>
          <div class="row center"><button class="btn big ghost" id="b-giveup">諦める</button><button class="btn big" id="b-retry">もう一度プロデュースし直す<small>周回データを引き継ぐ</small></button></div>`
        : `<div class="row center"><button class="btn big ghost" id="b-totitle">タイトルへ</button><button class="btn big" id="b-retry">周回プレイ<small>周回データを引き継いで、はじめから</small></button></div>`}
      </div>`;
    if ($('#b-giveup')) $('#b-giveup').onclick = () => { deleteSave(); App.state = null; renderTitle(); };
    if ($('#b-totitle')) $('#b-totitle').onclick = () => { App.state = null; renderTitle(); };
    $('#b-retry').onclick = () => {
      m.loops++; saveMeta();
      App.state = newGameState(Math.random().toString(36).slice(2, 10), m);
      saveGame();
      playScenes([{ title: `周回 ${m.loops}`, lines: [{ speaker: 'n', text: `引き継ぎ:資金 +${yen(Math.min(m.loops, C.LOOP.MAX_STACK) * C.LOOP.MONEY_BONUS)}、候補生の能力 +${Math.min(m.loops, C.LOOP.MAX_STACK) * C.LOOP.STAT_BONUS}、衣装 ${m.costumes.length} 着。` }, { speaker: 'n', text: 'もう一度、あの日の雑居ビルから。' }] }], renderPhase);
    };
  });
}

// ---------- 起動 ----------
function boot() {
  App.meta = loadMeta();
  App.settings = loadSettings();
  // 最初のユーザー操作でオーディオを有効にする(自動再生の制限対策)
  const unlock = () => { ensureAudio(); applyVolumes(); if (App.state && App.state.phase !== 'ending') playBgm(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
  renderTitle();
}
window.addEventListener('DOMContentLoaded', boot);
