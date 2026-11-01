// ============================================================
// リズムゲーム(4レーン)。時間は AudioContext の時計に合わせる
// ============================================================

const LANE_KEYS = ['d', 'f', 'j', 'k'];
const LANE_COLORS = ['#ff6fa8', '#ffb347', '#5bd1ff', '#9d7bff'];

class RhythmGame {
  // o: { container, song, chart, liveCtx, center (idol), settings, onFinish(result), onAbort() }
  constructor(o) {
    Object.assign(this, o);
    this.notes = this.chart.notes.map((n) => ({ ...n, judged: null }));
    this.jc = newJudgeCounter(this.notes.length);
    this.gauge = new VoltageGauge(this.chart.bpm, this.liveCtx.voltageMul);
    this.widen = this.liveCtx.judgeBuffs * C.SIDE_BUFF.JUDGE_WIDEN_MS / 1000;
    this.travel = C.NOTE_TRAVEL_SEC / (this.settings.noteSpeed || 1);
    this.offset = (this.settings.offsetMs || 0) / 1000;
    this.pressed = [0, 0, 0, 0];
    this.effects = [];
    this.lastJudge = null;
    this.running = false;
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="rg-wrap">
        <canvas class="rg-canvas"></canvas>
        <div class="rg-hud">
          <div class="rg-title">♪ ${this.song.title} <small>BPM ${this.song.bpm}</small></div>
          <button class="btn small ghost rg-quit">中断</button>
        </div>
        <div class="rg-cutin hidden"><div class="rg-cutin-inner">${avatarSVG(this.center, 160)}<div class="rg-cutin-text">FEVER TIME!<small>${this.center.name}</small></div></div></div>
        <div class="rg-countdown">READY…</div>
      </div>`;
    this.canvas = this.container.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.cutin = this.container.querySelector('.rg-cutin');
    this.countdown = this.container.querySelector('.rg-countdown');
    this.container.querySelector('.rg-quit').onclick = () => this.abort();
    this.onKey = (e) => {
      if (e.repeat) return;
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane >= 0) { e.preventDefault(); this.hit(lane); }
      if (e.key === 'Escape') this.abort();
    };
    this.onPointer = (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const lane = Math.floor(((e.clientX - r.left) / r.width) * 4);
      if (lane >= 0 && lane < 4) this.hit(lane);
    };
    this.onResize = () => this.resize();
    window.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    const ctx = ensureAudio();
    this.ctx = ctx;
    this.player = new SongPlayer(this.song, { volume: 0.9 });
    this.startAt = ctx.currentTime + C.LEAD_IN_SEC;
    this.player.start(this.startAt);
    this.running = true;
    const loop = () => { if (!this.running) return; this.update(); this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  // 耳に届いている音の時刻(出力遅延と判定オフセットを補正)
  now() {
    const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - lat - this.startAt - this.offset;
  }

  hit(lane) {
    if (!this.running) return;
    this.pressed[lane] = performance.now();
    const t = this.now();
    const win = C.JUDGE_WINDOW.good + this.widen;
    let best = null, bestD = 1e9;
    for (const n of this.notes) {
      if (n.judged || n.lane !== lane) continue;
      const d = Math.abs(n.time - t);
      if (n.time - t > win) break;
      if (d <= win && d < bestD) { best = n; bestD = d; }
    }
    if (!best) return;
    this.judge(best, bestD <= C.JUDGE_WINDOW.perfect + this.widen * 0.3 ? 'perfect' : 'good');
  }

  judge(n, j) {
    n.judged = j;
    const fever = this.gauge.isFever(n.time);
    countJudge(this.jc, j, fever);
    if (this.gauge.feed(j, this.jc.combo, n.time)) this.startFever();
    this.lastJudge = { j, at: performance.now() };
    if (j !== 'miss') {
      this.effects.push({ lane: n.lane, at: performance.now(), j });
      playSE(j);
    }
  }

  startFever() {
    playSE('fever');
    this.cutin.classList.remove('hidden');
    this.cutin.classList.remove('play'); void this.cutin.offsetWidth; this.cutin.classList.add('play');
    setTimeout(() => this.cutin.classList.add('hidden'), 1700);
  }

  update() {
    const t = this.now();
    if (t > -0.5) this.countdown.style.display = 'none';
    else this.countdown.textContent = t < -1.2 ? 'READY…' : 'GO!';
    const win = C.JUDGE_WINDOW.good + this.widen;
    for (const n of this.notes) {
      if (n.judged) continue;
      if (t - n.time > win) this.judge(n, 'miss');
      else break;
    }
    if (t > this.chart.duration + 0.8) this.finish();
  }

  draw() {
    const g = this.g, w = this.w, h = this.h, t = this.now();
    const fever = this.gauge.isFever(t);
    // 背景(フィーバー中は専用の背景)
    if (fever) {
      const hue = (performance.now() / 8) % 360;
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, `hsl(${hue},90%,45%)`); grd.addColorStop(0.5, `hsl(${(hue + 60) % 360},90%,40%)`); grd.addColorStop(1, `hsl(${(hue + 140) % 360},90%,45%)`);
      g.fillStyle = grd;
    } else {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#1b1036'); grd.addColorStop(1, '#3a1650');
      g.fillStyle = grd;
    }
    g.fillRect(0, 0, w, h);
    // 拍に合わせて光る
    const beat = t / (60 / this.chart.bpm);
    const pulse = beat > 0 ? Math.max(0, 1 - (beat % 1) * 3) : 0;
    const laneW = Math.min(110, w / 4.6), x0 = (w - laneW * 4) / 2;
    const judgeY = h - 110;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + (i % 2) * 0.03 + pulse * 0.04})`;
      g.fillRect(x0 + i * laneW, 0, laneW - 2, h);
      const p = (performance.now() - this.pressed[i]) / 150;
      if (p < 1) { g.fillStyle = `rgba(255,255,255,${0.25 * (1 - p)})`; g.fillRect(x0 + i * laneW, 0, laneW - 2, judgeY + 30); }
    }
    // 判定ライン
    g.fillStyle = fever ? '#fff' : '#ffd6f0';
    g.fillRect(x0, judgeY - 2, laneW * 4, 4);
    g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText(LANE_KEYS[i].toUpperCase(), x0 + i * laneW + laneW / 2, judgeY + 40);
    }
    // ノーツ
    for (const n of this.notes) {
      if (n.judged && n.judged !== 'miss') continue;
      const dt = n.time - t;
      if (dt > this.travel) break;
      if (dt < -0.3) continue;
      const y = judgeY - (dt / this.travel) * judgeY;
      const x = x0 + n.lane * laneW + 6;
      g.globalAlpha = n.judged === 'miss' ? 0.3 : 1;
      g.fillStyle = LANE_COLORS[n.lane];
      roundRect(g, x, y - 9, laneW - 14, 18, 9); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      roundRect(g, x + 6, y - 4, laneW - 26, 5, 3); g.fill();
      g.globalAlpha = 1;
    }
    // ヒットエフェクト
    const nowMs = performance.now();
    this.effects = this.effects.filter((e) => nowMs - e.at < 300);
    for (const e of this.effects) {
      const p = (nowMs - e.at) / 300;
      g.strokeStyle = e.j === 'perfect' ? `rgba(255,240,120,${1 - p})` : `rgba(160,220,255,${1 - p})`;
      g.lineWidth = 4;
      g.beginPath(); g.arc(x0 + e.lane * laneW + laneW / 2, judgeY, 16 + p * 30, 0, Math.PI * 2); g.stroke();
    }
    // コンボと判定
    g.fillStyle = '#fff';
    if (this.jc.combo >= 3) {
      g.font = 'bold 44px sans-serif'; g.fillText(this.jc.combo, w / 2, h * 0.38);
      g.font = 'bold 14px sans-serif'; g.fillText('COMBO', w / 2, h * 0.38 + 22);
    }
    if (this.lastJudge && nowMs - this.lastJudge.at < 450) {
      const j = this.lastJudge.j;
      g.font = 'bold 30px sans-serif';
      g.fillStyle = j === 'perfect' ? '#fff27a' : j === 'good' ? '#8fe3ff' : '#aaa';
      g.fillText(j.toUpperCase(), w / 2, h * 0.5);
    }
    // ボルテージゲージ
    const gx = Math.max(8, x0 - 34), gh = h * 0.55, gy = h * 0.15;
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(gx, gy, 14, gh);
    const v = fever ? 1 - (t - (this.gauge.feverEnd - this.gauge.feverSec)) / this.gauge.feverSec : this.gauge.value / C.VOLTAGE.MAX;
    const vg = g.createLinearGradient(0, gy + gh, 0, gy);
    vg.addColorStop(0, '#ff6fa8'); vg.addColorStop(1, '#fff27a');
    g.fillStyle = vg; g.fillRect(gx, gy + gh * (1 - v), 14, gh * v);
    g.save(); g.translate(gx + 7, gy - 10); g.font = 'bold 11px sans-serif'; g.fillStyle = '#fff'; g.fillText('VOLTAGE', 0, 0); g.restore();
    if (fever) { g.font = 'bold 26px sans-serif'; g.fillStyle = '#fff'; g.fillText(`★ FEVER ×${this.liveCtx.feverMult.toFixed(2)} ★`, w / 2, 70); }
    // 暫定スコアと進行
    const sc = computeLiveScore(this.liveCtx, this.jc).total;
    g.textAlign = 'right'; g.font = 'bold 20px sans-serif'; g.fillStyle = '#fff';
    g.fillText(sc.toLocaleString(), w - 14, 70);
    g.font = '12px sans-serif'; g.fillText(`P ${this.jc.perfect}  G ${this.jc.good}  M ${this.jc.miss}`, w - 14, 90);
    g.textAlign = 'center';
    const prog = clamp(t / this.chart.duration, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, h - 4, w, 4);
    g.fillStyle = '#ff6fa8'; g.fillRect(0, h - 4, w * prog, 4);
  }

  cleanup() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    if (this.player) this.player.stop(0.5);
  }
  finish() {
    if (!this.running) return;
    this.cleanup();
    this.jc.feverCount = this.gauge.feverCount;
    const r = computeLiveScore(this.liveCtx, this.jc);
    r.mode = 'rhythm';
    this.onFinish(r);
  }
  abort() {
    if (!this.running) return;
    this.cleanup();
    this.onAbort();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
