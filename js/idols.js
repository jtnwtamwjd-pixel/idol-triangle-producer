// ============================================================
// 候補生の生成と見た目(SVGアバター)
// ============================================================

function generateCandidates(seed, year, loopBonus, usedNames) {
  const rng = makeRng(seed + ':cand:' + year);
  const count = rng.int(C.CANDIDATES_MIN, C.CANDIDATES_MAX);
  const pKeys = Object.keys(PERSONALITIES);
  // 7タイプをなるべく重複させず並べる
  let pool = rng.shuffle(pKeys);
  while (pool.length < count) pool = pool.concat(rng.shuffle(pKeys));
  const rels = Object.keys(RELATIONS);
  const used = new Set(usedNames || []);
  const list = [];
  for (let i = 0; i < count; i++) {
    let name;
    for (let t = 0; t < 50; t++) {
      name = rng.pick(SURNAMES) + ' ' + rng.pick(GIVEN_NAMES);
      if (!used.has(name)) break;
    }
    used.add(name);
    list.push(createIdol(rng, {
      id: 'y' + year + 'c' + i,
      name,
      personality: pool[i],
      relation: rels[(i + rng.int(0, 2)) % 3],
      year,
      loopBonus: loopBonus || 0,
    }));
  }
  return list;
}

function createIdol(rng, o) {
  const P = PERSONALITIES[o.personality];
  const perf = rng.pick(Object.keys(PERF_SPECIALTIES));
  const off = rng.pick(Object.keys(OFF_SPECIALTIES));
  const yearBonus = (o.year - 1) * 15; // 後の年の候補生は少し強い
  const s = () => rng.int(C.STAT_INIT_MIN, C.STAT_INIT_MAX) + yearBonus + o.loopBonus;
  const stats = { tech: s(), sense: s(), visual: s(), talk: rng.int(C.TALK_INIT_MIN, C.TALK_INIT_MAX) };
  stats[PERF_SPECIALTIES[perf].stat] += C.SPECIALTY_INIT_BONUS;
  return {
    id: o.id,
    name: o.name,
    personality: o.personality,
    relation: o.relation,
    perf, off,
    stats,
    stamina: C.STAMINA_MAX + P.staminaMaxBonus,
    staminaMax: C.STAMINA_MAX + P.staminaMaxBonus,
    condition: 0,
    affection: C.AFFECTION_INIT[o.relation],
    accepted: o.relation !== 'tsundere', // ツンデレのみ「認めた」フラグが必要
    focus: 0,
    episodesSeen: 0,
    honne: false,
    gapRevealed: false,
    costume: 'school',
    look: {
      hair: rng.pick(P.hairColors),
      skin: rng.pick(['#ffe3d3', '#ffd9c2', '#f7cfb4', '#fbe6da']),
      eyeColor: rng.pick(['#3b2a4a', '#2a4b7c', '#5a3a1a', '#7a2a4a', '#2f6b4f']),
    },
  };
}

function idolTotalStats(idol) {
  return idol.stats.tech + idol.stats.sense + idol.stats.visual;
}

function idolLine(idol, key, rng) {
  const lines = PERSONALITIES[idol.personality].lines[key] || [''];
  return rng ? rng.pick(lines) : lines[0];
}

function fillName(text, idol) {
  return text.replace(/\{name\}/g, idol ? idol.name : '');
}

// ---------- 素材(assets/manifest.js)のキャラ割り振り ----------
function assetChars() {
  return typeof ASSET_CHARACTERS !== 'undefined' && Array.isArray(ASSET_CHARACTERS)
    ? ASSET_CHARACTERS.filter((c) => c && c.id && c.image) : [];
}
function idolCharacter(idol) {
  if (!idol || !idol.charId) return null;
  return assetChars().find((c) => c.id === idol.charId) || null;
}
function idolVideos(idol) {
  const ch = idolCharacter(idol);
  return ch && Array.isArray(ch.videos) ? ch.videos.filter(Boolean) : [];
}
// list の各アイドルに、未使用のキャラを割り振る(taken は使用済みとみなすキャラID)
// 素材が足りなければ割り振らない(SVGで表示される)
function assignCharacters(list, taken, seed) {
  const chars = assetChars();
  if (!chars.length) return;
  const used = new Set(taken || []);
  for (const i of list) if (idolCharacter(i)) used.add(i.charId);
  for (const idol of list) {
    if (idolCharacter(idol)) continue;
    idol.charId = null;
    let pool = chars.filter((c) => !used.has(c.id));
    if (!pool.length) continue;
    const match = pool.filter((c) => c.personality === idol.personality);
    if (match.length) pool = match;
    const ch = pool[hashSeed(seed + ':char:' + idol.id) % pool.length];
    idol.charId = ch.id;
    used.add(ch.id);
  }
}
function ensureCharacters(state) {
  assignCharacters(state.unit, [], state.seed);
  assignCharacters(state.candidates, state.unit.map((i) => i.charId).filter(Boolean), state.seed);
}

// ---------- アバター(素材があれば画像、なければSVG) ----------
function avatarSVG(idol, size) {
  size = size || 96;
  const ch = idolCharacter(idol);
  if (ch) return `<img class="avatar photo" src="${ch.image}" width="${size}" height="${size}" alt="${idol.name}" draggable="false">`;
  const P = PERSONALITIES[idol.personality];
  const L = idol.look;
  const cos = COSTUMES[idol.costume] || COSTUMES.school;
  const hair = L.hair;
  const style = P.hairStyle;
  const back = {
    short: '<path d="M22 52 Q20 18 50 16 Q80 18 78 52 L74 60 Q50 50 26 60 Z"/>',
    long: '<path d="M18 50 Q18 14 50 14 Q82 14 82 50 L86 100 L14 100 Z"/>',
    bob: '<path d="M18 52 Q18 14 50 14 Q82 14 82 52 L82 74 Q50 80 18 74 Z"/>',
    fluffy: '<path d="M14 56 Q8 30 26 18 Q50 4 74 18 Q92 30 86 56 Q92 80 76 86 Q50 92 24 86 Q8 80 14 56 Z"/>',
    twin: '<path d="M22 50 Q20 14 50 14 Q80 14 78 50 Z"/><ellipse cx="12" cy="62" rx="10" ry="24"/><ellipse cx="88" cy="62" rx="10" ry="24"/>',
    side: '<path d="M20 50 Q20 14 50 14 Q80 14 80 50 L80 60 L20 60 Z"/><ellipse cx="86" cy="58" rx="9" ry="22"/>',
    low: '<path d="M20 52 Q20 14 50 14 Q80 14 80 52 L78 66 L22 66 Z"/><ellipse cx="50" cy="90" rx="9" ry="12"/>',
  }[style];
  const bangs = {
    short: '<path d="M24 40 L30 22 L38 34 L46 20 L54 34 L62 20 L68 34 L76 40 Q76 18 50 18 Q24 18 24 40 Z"/>',
    long: '<path d="M24 44 Q30 24 50 22 Q70 24 76 44 Q66 30 50 32 Q34 30 24 44 Z"/>',
    bob: '<path d="M22 46 L22 28 Q50 10 78 28 L78 46 Q70 32 50 34 Q30 32 22 46 Z"/>',
    fluffy: '<path d="M22 42 Q26 22 40 26 Q50 16 60 26 Q74 22 78 42 Q66 34 50 36 Q34 34 22 42 Z"/>',
    twin: '<path d="M24 42 Q32 24 50 24 Q68 24 76 42 L66 32 L58 38 L50 30 L42 38 L34 32 Z"/>',
    side: '<path d="M22 44 Q24 20 52 20 Q78 22 78 36 Q56 30 40 44 Q30 40 22 44 Z"/>',
    low: '<path d="M24 42 Q28 22 50 22 Q72 22 76 42 Q62 30 50 34 Q38 30 24 42 Z"/>',
  }[style];
  const ec = L.eyeColor;
  const eyes = {
    bright: `<ellipse cx="40" cy="50" rx="4.5" ry="6" fill="${ec}"/><ellipse cx="60" cy="50" rx="4.5" ry="6" fill="${ec}"/><circle cx="41.5" cy="48" r="1.6" fill="#fff"/><circle cx="61.5" cy="48" r="1.6" fill="#fff"/><path d="M33 41 L46 43 M54 43 L67 41" stroke="#4a2a20" stroke-width="2"/>`,
    sparkle: `<ellipse cx="40" cy="51" rx="5" ry="6.5" fill="${ec}"/><ellipse cx="60" cy="51" rx="5" ry="6.5" fill="${ec}"/><circle cx="42" cy="48" r="2" fill="#fff"/><circle cx="62" cy="48" r="2" fill="#fff"/><circle cx="38.5" cy="53" r="1" fill="#fff"/><circle cx="58.5" cy="53" r="1" fill="#fff"/>`,
    sharp: `<path d="M34 50 Q40 45 46 50 Q40 53 34 50 Z" fill="${ec}"/><path d="M54 50 Q60 45 66 50 Q60 53 54 50 Z" fill="${ec}"/><path d="M33 44 L46 46 M54 46 L67 44" stroke="#333" stroke-width="1.6"/>`,
    sleepy: `<path d="M34 51 Q40 55 46 51" stroke="${ec}" stroke-width="2.4" fill="none"/><path d="M54 51 Q60 55 66 51" stroke="${ec}" stroke-width="2.4" fill="none"/>`,
    wink: `<ellipse cx="40" cy="50" rx="4.5" ry="6" fill="${ec}"/><circle cx="41.5" cy="48" r="1.6" fill="#fff"/><path d="M54 50 Q60 46 66 50" stroke="${ec}" stroke-width="2.4" fill="none"/>`,
    serious: `<ellipse cx="40" cy="51" rx="4" ry="5" fill="${ec}"/><ellipse cx="60" cy="51" rx="4" ry="5" fill="${ec}"/><circle cx="41" cy="49.5" r="1.3" fill="#fff"/><circle cx="61" cy="49.5" r="1.3" fill="#fff"/>`,
    kind: `<ellipse cx="40" cy="51" rx="4" ry="5.5" fill="${ec}"/><ellipse cx="60" cy="51" rx="4" ry="5.5" fill="${ec}"/><circle cx="41" cy="49" r="1.4" fill="#fff"/><circle cx="61" cy="49" r="1.4" fill="#fff"/><path d="M34 44 Q40 42 46 44 M54 44 Q60 42 66 44" stroke="#5a3a20" stroke-width="1.4" fill="none"/>`,
  }[P.eye];
  const acc = {
    band: `<rect x="22" y="30" width="56" height="5" rx="2" fill="${P.color}"/>`,
    ribbon: `<path d="M64 20 L76 14 L76 28 Z M64 20 L54 12 L54 26 Z" fill="${P.color}"/><circle cx="64" cy="20" r="3" fill="#fff"/>`,
    pin: `<rect x="66" y="26" width="10" height="3" rx="1" fill="${P.color}" transform="rotate(-25 71 27)"/>`,
    flower: `<g transform="translate(70 24)" fill="${P.color}"><circle cx="0" cy="-4" r="3"/><circle cx="4" cy="0" r="3"/><circle cx="0" cy="4" r="3"/><circle cx="-4" cy="0" r="3"/><circle r="2" fill="#fff59d"/></g>`,
    heart: `<path d="M30 22 q-4 -6 -8 0 q0 4 8 9 q8 -5 8 -9 q-4 -6 -8 0 Z" fill="${P.color}"/>`,
    glasses: `<g stroke="#333" stroke-width="1.5" fill="none"><rect x="33" y="45" width="14" height="11" rx="3"/><rect x="53" y="45" width="14" height="11" rx="3"/><path d="M47 50 L53 50"/></g>`,
    clip: `<rect x="28" y="28" width="10" height="3" rx="1" fill="${P.color}"/><rect x="30" y="32" width="10" height="3" rx="1" fill="${P.color}"/>`,
  }[P.accessory];
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${idol.name}">
    <circle cx="50" cy="50" r="49" fill="${P.color}" opacity="0.18"/>
    <g fill="${hair}">${back}</g>
    <path d="M18 100 Q22 78 50 76 Q78 78 82 100 Z" fill="${cos.color}"/>
    <path d="M40 78 L50 90 L60 78" fill="none" stroke="${cos.accent}" stroke-width="3"/>
    <rect x="44" y="64" width="12" height="12" fill="${L.skin}"/>
    <ellipse cx="50" cy="48" rx="26" ry="27" fill="${L.skin}"/>
    <ellipse cx="34" cy="58" rx="4" ry="2.4" fill="#ff9aa2" opacity="0.6"/><ellipse cx="66" cy="58" rx="4" ry="2.4" fill="#ff9aa2" opacity="0.6"/>
    ${eyes}
    <path d="M45 62 Q50 66 55 62" stroke="#a0453a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <g fill="${hair}">${bangs}</g>
    ${acc}
  </svg>`;
}
