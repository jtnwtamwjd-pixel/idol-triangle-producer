// ============================================================
// 楽曲と譜面の自動生成(シードで再現できる。音は鳴らさない純粋な関数)
// 拍(beat)単位でイベントを並べ、譜面のノーツも同じ拍グリッドから作る
// ============================================================

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const PROGRESSIONS = [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 4, 4], [5, 4, 3, 4]];

function scaleMidi(root, scale, idx) {
  const oct = Math.floor(idx / 7);
  return root + oct * 12 + scale[((idx % 7) + 7) % 7];
}

function generateSong(seed, opts) {
  opts = opts || {};
  const rng = makeRng(seed + ':music');
  const calm = !!opts.calm;
  const li = opts.liveIndex || 0;
  const bpm = calm ? rng.int(88, 102) : clamp(rng.int(C.SONG.BPM_MIN, C.SONG.BPM_MAX - 12) + li * C.SONG.BPM_LIVE_STEP, C.SONG.BPM_MIN, C.SONG.BPM_MAX + 10);
  const mode = rng.chance(calm ? 0.3 : 0.4) ? 'minor' : 'major';
  const scale = SCALES[mode];
  const root = 57 + rng.int(0, 7);
  const progA = rng.pick(PROGRESSIONS), progB = rng.pick(PROGRESSIONS), progC = rng.pick(PROGRESSIONS);
  const sections = calm
    ? [{ name: 'loop', bars: 8, prog: progA }]
    : [
      { name: 'intro', bars: 4, prog: progC },
      { name: 'A', bars: 8, prog: progA },
      { name: 'B', bars: 4, prog: progB },
      { name: 'chorus', bars: 8, prog: progC },
      { name: 'inter', bars: 2, prog: progA },
      { name: 'chorus', bars: 8, prog: progC },
      { name: 'outro', bars: 2, prog: progC },
    ];
  const events = [];
  const motifs = {};
  let bar = 0;
  for (const sec of sections) {
    sec.startBeat = bar * 4;
    const density = { intro: 0, A: 0.45, B: 0.55, chorus: 0.7, inter: 0, outro: 0, loop: 0.35 }[sec.name];
    if (density > 0 && !motifs[sec.name]) motifs[sec.name] = makeMotif(rng, density);
    for (let b = 0; b < sec.bars; b++) {
      const beat0 = (bar + b) * 4;
      const deg = sec.prog[b % 4];
      const chord = [deg, deg + 2, deg + 4].map((d) => scaleMidi(root, scale, d));
      // パッド(和音)
      events.push({ beat: beat0, dur: 4, type: 'chord', notes: chord, vel: calm ? 0.5 : 0.35 });
      // ベース
      const bassStep = sec.name === 'chorus' ? 0.5 : 1;
      for (let t = 0; t < 4; t += bassStep) events.push({ beat: beat0 + t, dur: bassStep * 0.9, type: 'bass', midi: chord[0] - 24 + (t === 3 && b % 2 ? 7 : 0), vel: 0.6 });
      // ドラム
      if (!calm) addDrums(events, sec.name, beat0, b, sec.bars);
      else if (b % 2 === 0) events.push({ beat: beat0, type: 'kick', vel: 0.4 }), events.push({ beat: beat0 + 2.5, type: 'hat', vel: 0.2 });
    }
    // メロディ
    if (density > 0) {
      const motif = motifs[sec.name];
      for (let b = 0; b < sec.bars; b += 2) {
        const variant = (b / 2) % 2 === 1 ? makeVariant(rng, motif) : motif;
        for (const n of variant) {
          const beat = (bar + b) * 4 + n.slot * 0.5;
          const deg = sec.prog[(b + Math.floor(n.slot / 8)) % 4];
          let idx = n.deg;
          if (n.slot % 4 === 0) idx = nearestChordTone(idx, deg); // 強拍はコードトーンへ
          events.push({ beat, dur: n.len * 0.5 * 0.9, type: 'lead', midi: scaleMidi(root + 12, scale, idx), vel: 0.5, deg: idx, section: sec.name });
        }
      }
    }
    bar += sec.bars;
  }
  events.sort((a, b) => a.beat - b.beat);
  return {
    seed: String(seed), bpm, mode, root, sections, events,
    totalBeats: bar * 4,
    duration: bar * 4 * 60 / bpm,
    title: rng.pick(SONG_WORDS_A) + '・' + rng.pick(SONG_WORDS_B),
  };
}

// 2小節(8分音符16個)のモチーフ
function makeMotif(rng, density) {
  const notes = [];
  let deg = rng.int(0, 4);
  for (let slot = 0; slot < 16; slot++) {
    const strong = slot % 4 === 0;
    if (slot === 0 || rng() < density * (strong ? 1.3 : 0.9)) {
      deg = clamp(deg + rng.pick([-2, -1, -1, 0, 1, 1, 2, 3]), -2, 9);
      notes.push({ slot, deg, len: 1 });
    }
  }
  for (let i = 0; i < notes.length; i++) {
    const next = i + 1 < notes.length ? notes[i + 1].slot : 16;
    notes[i].len = Math.min(next - notes[i].slot, 3);
  }
  return notes;
}
function makeVariant(rng, motif) {
  return motif.map((n) => (n.slot >= 10 ? { ...n, deg: clamp(n.deg + rng.pick([-2, -1, 1, 2]), -2, 9) } : n));
}
function nearestChordTone(idx, chordDeg) {
  let best = idx, bestD = 99;
  for (let k = -14; k <= 14; k++) {
    const c = chordDeg + k;
    const r = ((k % 7) + 7) % 7;
    if (r !== 0 && r !== 2 && r !== 4) continue; // ルート・3度・5度
    if (Math.abs(c - idx) < bestD) { bestD = Math.abs(c - idx); best = c; }
  }
  return best;
}

function addDrums(ev, name, b0, b, bars) {
  const last = b === bars - 1;
  const kick = (t, v) => ev.push({ beat: b0 + t, type: 'kick', vel: v || 0.9 });
  const snare = (t, v) => ev.push({ beat: b0 + t, type: 'snare', vel: v || 0.7 });
  const hat = (t, v) => ev.push({ beat: b0 + t, type: 'hat', vel: v || 0.3 });
  if (name === 'intro') { kick(0); kick(2); for (let t = 0; t < 4; t += 1) hat(t + 0.5); if (last) [3, 3.25, 3.5, 3.75].forEach((t) => snare(t, 0.5)); return; }
  if (name === 'A') { kick(0); kick(2.5); snare(1); snare(3); for (let t = 0; t < 4; t += 0.5) hat(t); return; }
  if (name === 'B') { kick(0); kick(1.5); kick(2); snare(3); for (let t = 0; t < 4; t += 0.5) hat(t, t % 1 ? 0.35 : 0.2); if (last) [2, 2.5, 3, 3.25, 3.5, 3.75].forEach((t) => snare(t, 0.6)); return; }
  if (name === 'chorus') { if (b === 0) ev.push({ beat: b0, type: 'crash', vel: 0.6 }); [0, 1, 2, 3].forEach((t) => kick(t)); snare(1); snare(3); for (let t = 0.5; t < 4; t += 1) hat(t, 0.45); return; }
  if (name === 'inter') { kick(0); snare(2); if (last) [2, 2.5, 3, 3.5].forEach((t) => snare(t, 0.6)); return; }
  if (name === 'outro') { if (b === 0) { ev.push({ beat: b0, type: 'crash', vel: 0.7 }); kick(0); } }
}

// 譜面:メロディの発音タイミング(=拍グリッド上)からノーツを作る
function generateChart(song, density) {
  const rng = makeRng(song.seed + ':chart');
  const spb = 60 / song.bpm;
  const notes = [];
  const add = (beat, lane) => {
    if (!notes.some((n) => n.beat === beat && n.lane === lane)) notes.push({ beat, time: beat * spb, lane });
  };
  // ドラムのみの区間はキックで刻む
  for (const sec of song.sections) {
    if (sec.name === 'intro' || sec.name === 'inter' || sec.name === 'outro') {
      for (let bt = sec.startBeat; bt < sec.startBeat + sec.bars * 4; bt += sec.name === 'outro' ? 4 : 1) {
        if (rng() < density || bt % 4 === 0) add(bt, sec.name === 'outro' ? 1 : [0, 3, 1, 2][bt % 4]);
      }
    }
  }
  const lead = song.events.filter((e) => e.type === 'lead');
  const degs = lead.map((e) => e.deg);
  const lo = Math.min(...degs), hi = Math.max(...degs);
  let prevLane = 1;
  for (const e of lead) {
    const strong = e.beat % 1 === 0;
    if (!strong && rng() > density) continue;
    let lane = Math.round(((e.deg - lo) / Math.max(1, hi - lo)) * 3);
    if (lane === prevLane && rng() < 0.35) lane = (lane + rng.pick([1, 3])) % 4;
    add(e.beat, lane);
    prevLane = lane;
    // サビの小節頭は同時押し
    if (e.section === 'chorus' && e.beat % 4 === 0 && rng() < density - 0.2) add(e.beat, (lane + 2) % 4);
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return { bpm: song.bpm, notes, duration: song.duration };
}
