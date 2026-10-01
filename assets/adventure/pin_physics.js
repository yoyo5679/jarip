/* 핀 뽑기 물리 엔진 (Hero Rescue 방식) — 화면 그리기와 분리해서 node로도 검증할 수 있다
 * 알갱이: gold(금화) · lava(용암) · water(물) · stone(돌: 물+용암)
 * 규칙: 금화가 캐릭터에 닿으면 모인다 · 용암이 캐릭터에 닿으면 실패 · 용암에 닿은 금화는 녹는다
 *       괴물은 용암에 닿거나 돌에 깔리면 사라지고, 살아서 캐릭터에 닿으면 실패
 * 좌표: 960×540 캔버스 픽셀
 */
(function (root) {
  'use strict';
  const R = 7, D = R * 2, G = 1500, WALL_T = 7, CELL = 16;
  const W = 960, H = 540, FLOOR = 500;

  /* ---------- 레벨 만들기 도우미 ----------
   * slots: 나란히 선 칸 기둥들. 기둥마다 cells를 위에서부터 쌓는다 (G 금화 · L 용암 · W 물 · S 돌 · M 괴물 · E 빈칸)
   * 모든 기둥의 맨 아래 칸은 '긴 바닥 핀' 하나를 같이 밟고 있다 → 그 핀을 뽑기 전에 칸마다 위험을 치워야 한다
   * 그 아래는 깔때기 → 캐릭터 방. w = 기둥 폭, h = 칸 높이(기본 84)
   */
  const FILL = { G: 'gold', L: 'lava', W: 'water', S: 'stone' };
  const YB = 330, ROOM_L = 410, ROOM_R = 550, ROOM_TOP = 412;
  function build(spec) {
    const walls = [[40, 60, 40, FLOOR], [920, 60, 920, FLOOR], [40, FLOOR, 920, FLOOR]];
    const pins = [], fills = [], mons = [];
    const slots = spec.slots.map(sl => (Array.isArray(sl) ? { cells: sl } : sl));
    const total = slots.reduce((a, sl) => a + (sl.w || 120), 0);
    let x = 480 - total / 2;
    const X0 = x;
    slots.forEach((sl, si) => {
      const w = sl.w || 120, x1 = x, x2 = x + w;
      const hs = sl.cells.map((c, i) => (sl.h && sl.h[i]) || 84);
      let y = YB - hs.reduce((a, b) => a + b, 0);
      walls.push([x1, y - 4, x2, y - 4]); // 뚜껑
      sl.cells.forEach((c, i) => {
        const y2 = y + hs[i];
        if (FILL[c]) fills.push({ type: FILL[c], x1: x1 + WALL_T + 2, y1: y + 4, x2: x2 - WALL_T - 2, y2: y2 - WALL_T - 3 });
        if (c === 'M') mons.push({ x: (x1 + x2) / 2, y: y2 - 34 });
        if (i < sl.cells.length - 1) pins.push({ x1, y1: y2, x2, y2, side: si < slots.length / 2 ? 'l' : 'r' });
        y = y2;
      });
      walls.push([x1, YB - hs.reduce((a, b) => a + b, 0) - 4, x1, YB], [x2, YB - hs.reduce((a, b) => a + b, 0) - 4, x2, YB]);
      x = x2;
    });
    const X1 = x;
    pins.push({ x1: X0, y1: YB, x2: X1, y2: YB, side: 'r', main: true }); // 긴 바닥 핀은 맨 마지막
    // 깔때기 → 캐릭터 방
    walls.push([X0, YB, ROOM_L, ROOM_TOP], [X1, YB, ROOM_R, ROOM_TOP], [ROOM_L, ROOM_TOP, ROOM_L, FLOOR], [ROOM_R, ROOM_TOP, ROOM_R, FLOOR]);
    return { walls, pins, fills, mons, hero: { x: 480, y: FLOOR - 40 }, need: spec.need || 0.5, room: [ROOM_L, ROOM_R] };
  }

  function init(spec) {
    const L = build(spec);
    const parts = [];
    L.fills.forEach(f => {
      // 칸 안을 육각 격자로 채운다
      let row = 0;
      for (let y = f.y2 - R; y > f.y1 + R; y -= D * 0.87, row++) {
        for (let x = f.x1 + R + (row % 2 ? R : 0); x < f.x2 - R; x += D) {
          if (f.n && parts.filter(p => p.f === f).length >= f.n) break;
          parts.push({ x, y, vx: 0, vy: 0, t: f.type, f });
        }
      }
    });
    parts.forEach(p => delete p.f);
    const gold0 = parts.filter(p => p.t === 'gold').length;
    return {
      L, parts, gold0, need: Math.max(1, Math.ceil(gold0 * L.need)), got: 0, burnt: 0,
      pins: L.pins.map(p => ({ ...p, out: false, k: 0 })),
      mons: L.mons.map(m => ({ x: m.x, y: m.y, vx: 0, vy: 0, alive: true, dead: 0, ground: false, crush: 0 })),
      hero: { ...L.hero, dead: false, why: '' },
      t: 0, calm: 0, result: 'play', fx: [],
    };
  }

  function pull(S, i) { const p = S.pins[i]; if (!p || p.out || S.result !== 'play') return false; p.out = true; S.calm = 0; S.since = 0; return true; }
  const activeSegs = (S) => S.L.walls.concat(S.pins.filter(p => !p.out).map(p => [p.x1, p.y1, p.x2, p.y2]));

  function collideSeg(o, s, rad) {
    const [x1, y1, x2, y2] = s, dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
    let u = ((o.x - x1) * dx + (o.y - y1) * dy) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = x1 + dx * u, cy = y1 + dy * u, ex = o.x - cx, ey = o.y - cy, d2 = ex * ex + ey * ey, min = rad + WALL_T;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2) || 0.001, nx = ex / d, ny = ey / d;
    o.x = cx + nx * min; o.y = cy + ny * min;
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= vn * nx * 1.1; o.vy -= vn * ny * 1.1; o.vx *= 0.985; o.vy *= 0.985; }
    return ny < -0.5; // 아래에서 받쳐 줌
  }

  function step(S, dt) {
    if (S.result !== 'play') { S.t += dt; return; }
    S.t += dt;
    const segs = activeSegs(S), P = S.parts, sub = 3, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (const p of P) {
        p.vy += G * h; p.x += p.vx * h; p.y += p.vy * h;
        for (const s of segs) collideSeg(p, s, R);
      }
      // 알갱이끼리 밀어내기 + 반응
      const grid = new Map();
      for (let i = 0; i < P.length; i++) {
        const p = P[i], key = ((p.x / CELL) | 0) * 1000 + ((p.y / CELL) | 0);
        (grid.get(key) || grid.set(key, []).get(key)).push(i);
      }
      for (let i = 0; i < P.length; i++) {
        const a = P[i], gx = (a.x / CELL) | 0, gy = (a.y / CELL) | 0;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const cell = grid.get((gx + ox) * 1000 + gy + oy); if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const b = P[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 >= D * D || d2 === 0) continue;
            react(S, a, b);
            const d = Math.sqrt(d2), push = (D - d) / 2, nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) { const imp = rv * 0.5; a.vx += imp * nx; a.vy += imp * ny; b.vx -= imp * nx; b.vy -= imp * ny; }
          }
        }
      }
      // 괴물
      for (const m of S.mons) {
        if (!m.alive) continue;
        m.vy += G * h; m.x += m.vx * h; m.y += m.vy * h; m.ground = false;
        for (const s of segs) if (collideSeg(m, s, 24)) m.ground = true;
        let stones = 0;
        for (const p of P) {
          const dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy, min = 24 + R;
          if (d2 >= min * min) continue;
          if (p.t === 'lava') { kill(S, m, '🔥'); break; }
          if (p.t === 'stone' && dy < 0) stones++;
          const d = Math.sqrt(d2) || 0.001; p.x = m.x + dx / d * min; p.y = m.y + dy / d * min;
          if (dy < 0 && p.vy > 0) { m.ground = true; }
        }
        if (m.alive && stones >= 7) kill(S, m, '💥');
      }
    }
    // 정리: 화면 밖, 녹은 금화 / 뜨거운 돌 식히기
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; if (p.hot > 0) p.hot -= dt; if (p.dead || p.y > H + 40) P.splice(i, 1); }
    // 괴물 움직임: 캐릭터와 같은 바닥이면 걸어간다
    for (const m of S.mons) {
      if (!m.alive) { m.dead += dt; continue; }
      if (m.ground && Math.abs(m.y - (S.hero.y + 16)) < 50 && !blocked(S, m.x, S.hero.x, FLOOR - 30)) m.vx = Math.sign(S.hero.x - m.x) * 140;
      else m.vx *= 0.8;
      if (Math.abs(m.x - S.hero.x) < 46 && Math.abs(m.y - S.hero.y) < 60) lose(S, '괴물이 캐릭터를 덮쳤어요!');
    }
    // 캐릭터: 금화 모으기 / 용암 닿으면 실패
    const hx = S.hero.x, hy = S.hero.y;
    for (const p of P) {
      if (p.x > S.L.room[0] && p.x < S.L.room[1] && p.y > ROOM_TOP + 6) {
        if (p.t === 'gold') { p.dead = true; S.got++; S.fx.push({ x: p.x, y: p.y, t: 0, k: 'coin' }); }
        else if (p.t === 'lava') { lose(S, '용암이 캐릭터한테 닿았어요!'); break; }
      }
    }
    // 다 멈췄는지
    let fast = 0; for (const p of P) if (p.vx * p.vx + p.vy * p.vy > 3600) fast++;
    let monMoving = false; for (const m of S.mons) if (m.alive && (Math.abs(m.vx) > 5 || !m.ground)) monMoving = true;
    S.calm = fast <= Math.max(3, P.length * 0.04) && !monMoving ? S.calm + dt : 0;
    // 위험 요소(용암·괴물)만 멈췄는지: 물이 찰랑거려도 판정할 수 있게
    // 쌓여 있는 알갱이는 미세하게 떨리니, 용암 중 꽤 많이(25%↑) 빠르게 움직일 때만 '아직 흐르는 중'
    let lavaN = 0, lavaFast = 0;
    for (const p of P) if (p.t === 'lava') { lavaN++; if (p.vx * p.vx + p.vy * p.vy > 14400) lavaFast++; }
    const danger = monMoving || lavaFast > Math.max(3, lavaN * 0.25);
    S.dcalm = danger ? 0 : (S.dcalm || 0) + dt;
    S.since = (S.since || 0) + dt;
    if (S.result === 'play') {
      const allOut = S.pins.every(p => p.out);
      // 안전: 바닥 핀 아래(깔때기·캐릭터 방)에 용암도, 살아 있는 괴물도 없음
      const safe = !P.some(p => p.t === 'lava' && p.y > YB + 10) && S.mons.every(m => !m.alive || m.y < YB - 10);
      if (S.got >= S.need && S.since > 1 && (safe || (S.dcalm > 0.8 && S.mons.every(m => !m.alive || !canReach(S, m))))) win(S);
      else if ((S.calm > 1.2 || S.since > 8) && (allOut || goldLeft(S) + S.got < S.need)) {
        if (S.got >= S.need) win(S); else lose(S, goldLeft(S) + S.got < S.need ? '금화가 너무 많이 녹았어요.' : '금화가 캐릭터한테 못 왔어요.');
      }
    }
    for (let i = S.fx.length - 1; i >= 0; i--) if ((S.fx[i].t += dt) > 0.6) S.fx.splice(i, 1);
  }
  // 물이 닿은 용암은 돌이 되고, 막 굳은(뜨거운) 돌에 닿은 용암도 줄줄이 굳는다 → 용암 덩어리 전체가 식는다
  function cool(S, p) { p.t = 'stone'; p.hot = 0.5; if (Math.random() < 0.15) S.fx.push({ x: p.x, y: p.y, t: 0, k: 'steam' }); }
  function react(S, a, b) {
    if (a.t === 'lava' && (b.t === 'water' || (b.t === 'stone' && b.hot > 0))) cool(S, a);
    else if (b.t === 'lava' && (a.t === 'water' || (a.t === 'stone' && a.hot > 0))) cool(S, b);
    else if (a.t === 'gold' && b.t === 'lava') { a.dead = true; S.burnt++; }
    else if (b.t === 'gold' && a.t === 'lava') { b.dead = true; S.burnt++; }
  }
  const goldLeft = (S) => S.parts.filter(p => p.t === 'gold' && !p.dead).length;
  function kill(S, m, icon) { m.alive = false; S.fx.push({ x: m.x, y: m.y, t: 0, k: icon === '🔥' ? 'burn' : 'crush' }); }
  function lose(S, why) { if (S.result !== 'play') return; S.result = 'lose'; S.hero.dead = true; S.hero.why = why; }
  function win(S) { if (S.result === 'play') S.result = 'win'; }
  // 바닥 칸막이가 사이에 있으면 못 건너간다
  function blocked(S, x1, x2, y) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    return S.L.walls.some(w => w[0] === w[2] && w[0] > lo && w[0] < hi && Math.min(w[1], w[3]) < y && Math.max(w[1], w[3]) > y);
  }
  const canReach = (S, m) => m.y > S.hero.y - 80 && !blocked(S, m.x, S.hero.x, FLOOR - 30);

  /* ---------- 레벨 15개 (아래 검증기로 모든 핀 순서를 돌려 봄: 이기는 순서가 있고, 아무렇게나 하면 진다) ---------- */
  const LEVELS = [
    { slots: [['G']] },
    { slots: [['G'], ['W', 'L']] },
    { slots: [['G'], ['S', 'M']] },
    { slots: [['W', 'L'], ['G'], ['S', 'M']] },
    { slots: [['G'], ['W', 'L', 'M']] },
    { slots: [['W', 'L', 'G'], ['G']], need: 0.7 },
    { slots: [['W', 'L'], ['G'], ['W', 'L', 'M']] },
    { slots: [['W', 'L', 'M'], ['L', 'G']] },
    { slots: [['G'], ['W', 'L'], ['S', 'M'], ['G']], need: 0.5 },
    { slots: [['W', 'L', 'G'], ['S', 'M'], ['W', 'L']], need: 0.45 },
    { slots: [['S', 'M'], ['W', 'L', 'G'], ['L', 'G'], ['W', 'L']], need: 0.45 },
    { slots: [['W', 'L', 'M'], ['G'], ['W', 'L', 'M']] },
    { slots: [['L', 'G'], ['W', 'L', 'M'], ['W', 'L', 'G'], ['S', 'M']], need: 0.5 },
    { slots: [['W', 'L', 'M'], ['W', 'L', 'G'], ['W', 'L'], ['S', 'M']], need: 0.6 },
    { slots: [['W', 'L', 'M'], ['L', 'G'], ['W', 'L', 'G'], ['W', 'L', 'M']], need: 0.45 },
  ];

  const API = { init, step, pull, LEVELS, W, H, R, FLOOR, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PinPhysics = API;
})(typeof window !== 'undefined' ? window : globalThis);
