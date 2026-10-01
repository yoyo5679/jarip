/* 자립 어드벤처 오락실 미니게임
 *  - 'gate': 응원단 달리기 (카운트 마스터즈 방식) — 응원단이 한 덩어리로 뛰고, 장애물에 닿은 사람만 떨어져 나간다
 *  - 'pin' : 핀 뽑기 (Hero Rescue 방식) — 금화·용암·물이 알갱이 물리로 흐른다 (규칙·레벨은 pin_physics.js)
 * MiniGames.open(kind, level, { charImg, onDone(result), cost, payRetry })  →  result: { win, stars, bonus }
 */
(function () {
  'use strict';
  const W = 960, H = 540;
  const A = 'assets/adventure/';
  const img = (src) => { const i = new Image(); i.src = A + src; return i; };
  const IMG = { worry: img('mob_worry.png'), scam: img('mob_scam.png'), debt: img('mob_debt.png') };
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

  let root, cv, ctx, raf = 0, game = null, opts = null, keys = {};

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'mini';
    root.innerHTML = `
      <canvas width="${W}" height="${H}"></canvas>
      <div class="mini-top"><span class="mini-title"></span><span class="mini-sub"></span>
        <button class="mini-x" title="나가기">✕</button></div>
      <div class="mini-help"></div>
      <div class="mini-result"></div>`;
    document.getElementById('stage').appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
    root.querySelector('.mini-x').onclick = () => finish({ win: false, stars: 0, quit: true });
    cv.addEventListener('pointerdown', e => { if (game && game.down) { game.down(pt(e), e); try { cv.setPointerCapture(e.pointerId); } catch (_) {} } });
    cv.addEventListener('pointermove', e => game && game.move && game.move(pt(e), e));
    cv.addEventListener('pointerup', e => game && game.up && game.up(pt(e), e));
    addEventListener('keydown', e => { if (!game) return; keys[e.key] = true; if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); game.key && game.key(e.key); }, true);
    addEventListener('keyup', e => { keys[e.key] = false; }, true);
  }
  function pt(e) {
    // 세로 폰에서 화면을 돌려 보여줄 때는 게임 쪽 relPt()로 좌표를 바꿔 계산한다
    if (window.relPt) { const q = window.relPt(e, cv); return { x: q.fx * W, y: q.fy * H }; }
    const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function make(kind, level) { return kind === 'pin' ? pinGame(level) : runGame(level); }
  function open(kind, level, o) {
    ensureDom();
    opts = o || {};
    keys = {};
    root.classList.add('on');
    root.querySelector('.mini-result').classList.remove('on');
    start(make(kind, level));
    cancelAnimationFrame(raf);
    let last = performance.now();
    // 게임 본편과 같은 고화질 배율로 그린다 (좌표는 960×540 그대로)
    const rs = window.RENDER_SCALE || 1;
    if (cv.width !== Math.round(W * rs)) { cv.width = Math.round(W * rs); cv.height = Math.round(H * rs); }
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      if (game) { ctx.setTransform(rs, 0, 0, rs, 0, 0); game.update(dt); game.draw(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function start(g) {
    game = g;
    root.querySelector('.mini-title').textContent = g.title;
    root.querySelector('.mini-sub').textContent = `${g.level}단계`;
    const help = root.querySelector('.mini-help');
    help.innerHTML = g.help || ''; help.style.display = g.help ? '' : 'none';
  }

  function finish(res) {
    cancelAnimationFrame(raf); game = null;
    root.classList.remove('on');
    opts.onDone && opts.onDone(res);
  }

  /** 결과 패널: 이기면 별, 지면 다시하기 */
  function showResult(win, stars, msg, bonus) {
    const el = root.querySelector('.mini-result');
    const starHtml = win ? '⭐'.repeat(stars) + '<span style="opacity:.25">' + '⭐'.repeat(3 - stars) + '</span>' : '';
    el.innerHTML = `<div class="mini-card"><h3>${win ? '클리어!' : '아쉬워요!'}</h3>
      <div class="mini-stars">${starHtml}</div><p>${msg}</p>
      <div class="mini-btns">${win ? '<button class="btn" data-a="ok">좋아!</button>'
        : `<button class="btn" data-a="retry">다시 하기${opts.cost ? ` (🪙${opts.cost})` : ''}</button><button class="btn ghost" data-a="quit">나가기</button>`}</div></div>`;
    el.classList.add('on');
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      // 오락실처럼 다시 하기도 코인을 낸다. 모자라면 버튼만 바꾸고 결과창은 그대로
      if (a === 'retry' && opts.payRetry && !opts.payRetry()) { b.textContent = '🪙 코인이 모자라요'; b.disabled = true; return; }
      el.classList.remove('on');
      if (a === 'ok') finish({ win: true, stars, bonus: bonus || 0 });
      else if (a === 'retry') { opts.attempts = (opts.attempts || 1) + 1; start(make(game.kind, game.level)); }
      else finish({ win: false, stars: 0 });
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(text, x, y, size, fill, stroke) {
    ctx.font = `${size}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = stroke || 'rgba(0,0,0,.6)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || '#fff'; ctx.fillText(text, x, y);
  }
  function seeded(n) { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

  /* ======================= 핀 뽑기 (Hero Rescue 방식) ======================= */
  const PART = { gold: ['#ffd84a', '#b98a00'], lava: ['#ff6a1f', '#c22a00'], water: ['#56b8ff', '#1f6fc4'], stone: ['#9aa0a8', '#5d636b'] };
  function pinGame(level) {
    const PP = window.PinPhysics;
    const S = PP.init(PP.LEVELS[Math.min(level, PP.LEVELS.length) - 1]);
    const pinOut = S.pins.map(() => 0);      // 뽑히는 애니메이션 0→1
    let t = 0, ended = false;
    // 핀 손잡이: 왼쪽/오른쪽 끝 바깥
    const handle = (p) => (p.side === 'l' ? { x: p.x1 - 22, y: p.y1, dir: -1 } : { x: p.x2 + 22, y: p.y2, dir: 1 });
    function hitPin(q) {
      let best = -1, bd = 26;
      S.pins.forEach((p, i) => {
        if (p.out) return;
        const h = handle(p), x1 = Math.min(p.x1, h.x), x2 = Math.max(p.x2, h.x);
        const d = q.x < x1 ? Math.hypot(q.x - x1, q.y - p.y1) : q.x > x2 ? Math.hypot(q.x - x2, q.y - p.y1) : Math.abs(q.y - p.y1);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }
    const helps = {
      1: '👆 핀을 눌러서 뽑아요. 💰 금화가 캐릭터한테 가면 성공!',
      2: '🔥 용암이 캐릭터한테 닿으면 실패! 💧 물을 부으면 용암이 돌로 굳어요.',
      3: '🪨 돌을 떨어뜨려서 걱정 괴물을 없애요. 살아 있는 괴물이 내려가면 캐릭터를 덮쳐요!',
      5: '괴물은 🔥 용암에 닿아도 사라져요. 남은 용암은 💧 물로 꼭 식히기!',
      6: '용암이 금화 위로 떨어지면 금화가 녹아요. 안 뽑는 게 나은 핀도 있어요!',
    };
    return {
      kind: 'pin', level, title: '🧷 핀 뽑기', S, // S: 테스트용
      help: helps[level] || '',
      down(p) { if (S.result !== 'play') return; const i = hitPin(p); if (i >= 0) PP.pull(S, i); },
      update(dt) {
        t += dt;
        PP.step(S, dt);
        S.pins.forEach((p, i) => { if (p.out) pinOut[i] = Math.min(1, pinOut[i] + dt * 3.5); });
        if (S.result !== 'play' && !ended) {
          ended = true;
          const tries = opts.attempts || 1, win = S.result === 'win';
          const stars = !win ? 0 : tries === 1 ? (S.got >= S.gold0 * 0.8 ? 3 : 2) : 1;
          setTimeout(() => showResult(win, stars, win ? `금화 ${S.got}개가 무사히 도착했어요!` : S.hero.why || '앗, 순서가 틀렸어요.'), 900);
        }
      },
      draw() {
        // 배경: 지하 창고
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2b3550'); g.addColorStop(1, '#151a2b');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.03)';
        for (let y = 60; y < H; y += 36) for (let x = (y / 36 % 2) * 40; x < W; x += 80) ctx.fillRect(x, y, 76, 32);
        const [rl, rr] = S.L.room;
        ctx.fillStyle = 'rgba(255,220,150,.10)'; ctx.fillRect(rl, 412, rr - rl, PP.FLOOR - 412);
        // 벽
        ctx.lineCap = 'round';
        S.L.walls.forEach(w => {
          ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
          ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
        });
        // 알갱이
        for (const type in PART) {
          const [c1, c2] = PART[type];
          ctx.fillStyle = c2; ctx.beginPath();
          for (const p of S.parts) if (p.t === type) { ctx.moveTo(p.x + PP.R, p.y); ctx.arc(p.x, p.y, PP.R, 0, 7); }
          ctx.fill();
          ctx.fillStyle = c1; ctx.beginPath();
          for (const p of S.parts) if (p.t === type) { ctx.moveTo(p.x + PP.R - 2, p.y - 1); ctx.arc(p.x - 1, p.y - 1, PP.R - 2, 0, 7); }
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,120,40,.12)'; ctx.beginPath();
        for (const p of S.parts) if (p.t === 'lava') { ctx.moveTo(p.x + 13, p.y); ctx.arc(p.x, p.y, 13, 0, 7); }
        ctx.fill();
        // 괴물
        S.mons.forEach(m => {
          if (!m.alive && m.dead > 0.6) return;
          ctx.save(); ctx.globalAlpha = m.alive ? 1 : 1 - m.dead / 0.6;
          const s = 58 * (m.alive ? 1 + Math.sin(t * 6) * 0.03 : 1 + m.dead);
          if (IMG.worry.complete) ctx.drawImage(IMG.worry, m.x - s / 2, m.y - s / 2 - 4, s, s);
          ctx.restore();
        });
        // 캐릭터
        const hero = S.hero, ci = opts.charImg;
        const jump = S.result === 'win' ? Math.abs(Math.sin(t * 8)) * 16 : 0;
        if (ci && ci.complete) {
          const hh = 86, ww = ci.width * hh / ci.height;
          ctx.save();
          if (hero.dead) ctx.filter = 'grayscale(1) brightness(.7)';
          ctx.drawImage(ci, hero.x - ww / 2, PP.FLOOR - hh - 4 - jump, ww, hh);
          ctx.restore();
        }
        if (hero.dead) label('😱', hero.x + 34, PP.FLOOR - 92, 34);
        if (S.result === 'win') label('🎉', hero.x - 40, PP.FLOOR - 96 - jump, 34);
        // 핀
        S.pins.forEach((p, i) => {
          const k = pinOut[i]; if (k >= 1) return;
          const h = handle(p);
          ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(k * 260 * h.dir, 0);
          const x1 = Math.min(p.x1, h.x), x2 = Math.max(p.x2, h.x);
          roundRect(x1, p.y1 - 6, x2 - x1, 12, 6);
          const gg = ctx.createLinearGradient(0, p.y1 - 6, 0, p.y1 + 6);
          gg.addColorStop(0, p.main ? '#ffb3a1' : '#ffe9a3'); gg.addColorStop(1, p.main ? '#c4472c' : '#d39a12');
          ctx.fillStyle = gg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#5a3a00'; ctx.stroke();
          ctx.beginPath(); ctx.arc(h.x, h.y, 13, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = p.main ? '#e0604a' : '#f2b72a'; ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = '#5a3a00'; ctx.stroke();
          ctx.restore();
        });
        // 효과
        S.fx.forEach(f => {
          const a = 1 - f.t / 0.6;
          if (f.k === 'steam') { ctx.fillStyle = `rgba(230,240,255,${a * 0.6})`; ctx.beginPath(); ctx.arc(f.x, f.y - f.t * 40, 6 + f.t * 20, 0, 7); ctx.fill(); }
          else if (f.k === 'coin') { ctx.globalAlpha = a; label('+1', f.x, f.y - f.t * 50, 18, '#ffe9a0'); ctx.globalAlpha = 1; }
          else { ctx.globalAlpha = a; label(f.k === 'burn' ? '🔥' : '💥', f.x, f.y - f.t * 30, 44); ctx.globalAlpha = 1; }
        });
        label(`💰 ${S.got} / ${S.need}`, W - 110, 72, 26, S.got >= S.need ? '#b6ffb0' : '#ffe9a0');
        if (S.result === 'play' && S.pins.every(p => !p.out) && t < 6) {
          ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3;
          const h = handle(S.pins[0]); label('👆', h.x + h.dir * 18, h.y + 30, 30);
          ctx.globalAlpha = 1;
        }
      },
    };
  }

  /* ======================= 응원단 달리기 (카운트 마스터즈 방식) =======================
   * 세계 좌표(미터): x = 좌우(-2.5~2.5), z = 앞으로 간 거리. 응원단은 한 명 한 명 실제로 움직인다.
   * 문(+/×는 늘고 -/÷는 줄고) · 빚 코인(좌우로 굴러다님) · 스미싱 막대(빙글빙글) · 좁은 다리(밖은 낭떠러지)
   * · 걱정 구름 군단(부딪혀서 1:1로 싸움) · 끝은 자립 계단(한 칸 오를 때마다 몇 명씩 남는다)
   */
  const GOOD = [['+', 5, '선배'], ['+', 10, '친구'], ['+', 15, '상담쌤'], ['x', 2, '자조모임'], ['+', 20, '바람개비'], ['x', 3, '응원단']];
  const BAD = [['-', 5, '사기문자'], ['-', 10, '번아웃'], ['/', 2, '과소비'], ['-', 15, '야근'], ['-', 20, '빚독촉']];
  function applyOp(n, op) {
    const [o, v] = op;
    return Math.max(0, Math.min(999, Math.floor(o === '+' ? n + v : o === '-' ? n - v : o === 'x' ? n * v : n / v))); // 최대 999명
  }
  const opText = (op) => ({ big: (op[0] === 'x' ? '×' : op[0] === '/' ? '÷' : op[0]) + op[1], name: op[2], good: op[0] === '+' || op[0] === 'x' });
  const HALF = 2.5, MAXU = 140, SP = 0.13; // SP: 대형 간격(작을수록 촘촘)

  function runGame(level) {
    const rnd = seeded(level * 13 + 5);
    const segs = [];
    // best: 한 명도 안 잃었을 때 최대 인원 · est: 장애물에서 조금씩 잃는 걸 감안한 예상 인원(군단·계단 크기 기준)
    let z = 14, best = 1, est = 1;
    const nSeg = 6 + level;
    for (let i = 0; i < nSeg; i++, z += 12) {
      const kinds = [];
      if (level >= 2) kinds.push('debt');
      if (i > 1) kinds.push('enemy'); // 걱정 구름 군단은 1단계부터
      if (level >= 4) kinds.push('bar');
      if (level >= 6 && i > 1) kinds.push('bridge');
      // 짝수 칸은 언제나 문, 홀수 칸은 장애물(1단계는 문만)
      const kind = i % 2 === 0 || !kinds.length ? 'gate' : kinds[Math.floor(rnd() * kinds.length)];
      if (kind === 'gate') {
        const g = GOOD[Math.floor(rnd() * Math.min(GOOD.length, 3 + Math.floor(level / 2)))];
        const b = BAD[Math.floor(rnd() * Math.min(BAD.length, 2 + Math.floor(level / 3)))];
        const g2 = GOOD[Math.floor(rnd() * GOOD.length)];
        // 레벨이 오르면 둘 다 좋은 문(더 좋은 쪽 고르기)도 나온다
        const pair = level >= 5 && rnd() < 0.3 ? [g, g2] : rnd() < 0.5 ? [g, b] : [b, g];
        segs.push({ type: 'gate', z, ops: pair });
        best = Math.max(applyOp(best, pair[0]), applyOp(best, pair[1]));
        est = Math.max(applyOp(est, pair[0]), applyOp(est, pair[1]));
      } else if (kind === 'enemy') {
        const n = Math.max(3, Math.floor(est * (0.25 + rnd() * 0.2 + level * 0.012)));
        segs.push({ type: 'enemy', z, n, left: n, units: [] });
        best -= n; est -= n;
      } else if ((est = Math.floor(est * 0.8)) >= 0 && kind === 'debt') segs.push({ type: 'debt', z, ph: rnd() * 6, w: 1.5 + level * 0.06, r: 0.55 });
      // 스미싱 막대는 길 한쪽에서만 돈다 → 반대쪽으로 비켜 가면 안전
      else if (kind === 'bar') segs.push({ type: 'bar', z, cx: (rnd() < .5 ? -1 : 1) * 1.25, ph: rnd() * 6, w: (rnd() < .5 ? -1 : 1) * (1.6 + level * 0.06), len: 1.05 });
      else segs.push({ type: 'bridge', z, len: 7, cx: (rnd() - 0.5) * 2.4, half: Math.max(0.6, 1.15 - level * 0.03) });
    }
    const FIN = z + 2, STEPS = 20;
    // 계단 한 칸에 남는 인원: 최선으로 모았을 때 인원 기준. 20칸을 다 오르려면 거의 다 모아야 한다
    const stepNeed = (k) => Math.max(1, Math.ceil(est * 0.05 * (0.6 + k * 0.04)));
    // 적 군단 그림용 배치
    segs.filter(s => s.type === 'enemy').forEach(s => { for (let i = 0; i < Math.min(s.n, 60); i++) { const r = SP * 1.1 * Math.sqrt(i), a = i * 2.39996; s.units.push({ x: r * Math.cos(a), z: r * Math.sin(a) * 0.7 }); } });

    let crowd = 1, X = 0, Z = 0, t = 0, phase = 'ready';
    const speed = 6 + level * 0.15;
    let units = [], dragX = null, dragCX = 0, fight = null, step = -1, shake = 0;
    const stood = [], falls = [], sparks = [], pops = [];
    const target = (i) => { const r = SP * Math.sqrt(i), a = i * 2.39996; return { x: r * Math.cos(a), z: r * Math.sin(a) * 0.75 }; };
    function sync() {
      const want = Math.min(crowd, MAXU);
      while (units.length < want) units.push({ x: (Math.random() - .5) * 0.2, z: (Math.random() - .5) * 0.2, b: Math.random() * 6 });
      while (units.length > want) units.pop();
    }
    sync();
    // 그려진 한 명이 실제 몇 명을 뜻하는지 (사람이 많으면 140명까지만 그린다)
    const per = () => Math.max(1, crowd / Math.max(1, units.length));
    function killUnit(i, how) {
      const u = units[i];
      falls.push({ x: X + u.x, z: Z + u.z, t: 0, how });
      units.splice(i, 1);
      crowd = Math.max(0, Math.round(crowd - per()));
      if (crowd < units.length) units.length = crowd;
    }
    const pop = (text, good, big) => pops.push({ text, good, big, t: 0 });
    const burst = (x, y, color, n) => { for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - .5) * 360, vy: -Math.random() * 320, t: 0, color }); };
    function end(win, msg) {
      phase = 'end';
      const stars = !win ? 0 : step >= 11 ? 3 : step >= 4 ? 2 : 1;
      const bonus = win ? Math.max(0, step + 1) : 0;
      setTimeout(() => showResult(win, stars, msg + (bonus ? ` · 🪙 계단 보너스 ${bonus}` : ''), bonus), 800);
    }

    // ----- 화면 투영 (카메라는 응원단 뒤 위쪽) -----
    const F = 600, CAMH = 3.0, CAMD = 6, HOR = 150;
    const camZ = () => Z - CAMD;
    const proj = (x, zz, y = 0) => { const d = Math.max(0.6, zz - camZ()); return { x: W / 2 + x * F / d, y: HOR + (CAMH - y) * F / d, s: F / d / 100 }; };

    return {
      kind: 'gate', level, title: '🏃 응원단 달리기',
      peek: () => ({ crowd, best, phase, X, Z, segs, step, units: units.length, FIN, t, speed, HALF }), // 테스트용
      setX: (x) => { X = Math.max(-HALF, Math.min(HALF, x)); if (phase === 'ready') phase = 'run'; }, // 테스트용
      help: level === 1 ? '👆 화면을 좌우로 끌어서 응원단을 움직여요. 파란 문으로 사람을 모아서 ☁️ 걱정 구름 군단을 이겨요. 끝에서는 자립 계단을 높이 올라가요!'
        : level === 2 ? '🪙 굴러다니는 빚 코인에 닿은 사람은 떨어져 나가요. 피해서 지나가요!'
        : level === 3 ? '☁️ 걱정 구름 군단과 부딪히면 1:1로 싸워요. 더 많이 모아서 지나가요!'
        : level === 4 ? '📱 빙글빙글 도는 스미싱 막대 조심! 막대 반대쪽으로 비켜 가요.'
        : level === 6 ? '🌉 좁은 다리 밖은 낭떠러지예요. 응원단을 다리 가운데로 모아요!' : '',
      down(p) { if (phase === 'ready') phase = 'run'; dragX = p.x; dragCX = X; },
      move(p, e) { if (dragX != null && (e.buttons || e.pointerType === 'touch')) X = Math.max(-HALF, Math.min(HALF, dragCX + (p.x - dragX) / 95)); },
      up() { dragX = null; },
      key(k) { if (phase === 'ready' && ['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp'].includes(k)) phase = 'run'; },
      update(dt) {
        t += dt; shake = Math.max(0, shake - dt);
        if (keys.ArrowLeft || keys.a) X = Math.max(-HALF, X - dt * 4);
        if (keys.ArrowRight || keys.d) X = Math.min(HALF, X + dt * 4);
        // 대형 유지: 한 명씩 자기 자리로, 길 밖으로는 못 나간다(다리 낭떠러지는 아래에서 따로 판정)
        units.forEach((u, i) => {
          const tg = target(i), fz = fight ? 0.6 : 0;
          u.x += (tg.x - u.x) * Math.min(1, dt * 8); u.z += (tg.z + fz - u.z) * Math.min(1, dt * 8);
          const wx = X + u.x; if (Math.abs(wx) > HALF - 0.1) u.x = Math.sign(wx) * (HALF - 0.1) - X;
        });
        for (let i = falls.length - 1; i >= 0; i--) if ((falls[i].t += dt) > 1) falls.splice(i, 1);
        for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 800 * dt; if (s.t > 0.7) sparks.splice(i, 1); }
        for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) > 1.1) pops.splice(i, 1);
        if (phase === 'ready' || phase === 'end') return;

        if (phase === 'fight') {
          // 1:1로 한 명씩 사라진다. 사람이 많을수록 빨리
          const s = fight, rate = Math.max(12, (crowd + s.left) * 0.9);
          s.acc = (s.acc || 0) + rate * dt;
          while (s.acc >= 1 && s.left > 0 && crowd > 0) {
            s.acc -= 1; s.left--;
            if (s.units.length > Math.ceil(s.left * Math.min(1, 60 / s.n))) s.units.pop();
            crowd--;
            if (units.length > crowd) { const u = units.pop(); if (u) falls.push({ x: X + u.x, z: Z + u.z, t: 0, how: 'fight' }); }
            if (Math.random() < 0.5) { const q = proj(X + (Math.random() - .5) * 1.5, s.z - 0.6); burst(q.x, q.y - 20, '#ffd84a', 2); }
          }
          if (crowd <= 0) { end(false, '걱정 구름 군단이 더 많았어요. 파란 문으로 더 모아 봐요!'); return; }
          if (s.left <= 0) { phase = 'run'; fight = null; pop('군단을 물리쳤다!', true, true); }
          return;
        }
        if (phase === 'climb') {
          Z += dt * 4.5;
          const k = Math.floor(Z - FIN);
          if (k > step && k < STEPS) {
            const need = stepNeed(k);
            if (crowd < need) { Z = FIN + step + 0.99; end(true, step >= 0 ? `자립 계단 ${step + 1}칸까지 올랐어요!` : '계단 앞까지 왔어요!'); return; }
            step = k;
            for (let j = 0; j < need; j++) { const u = units.pop(); stood.push({ k, x: X + (u ? u.x : 0) * 0.6, b: Math.random() * 6 }); }
            crowd -= need; sync();
            if (crowd <= 0) { end(true, `자립 계단 ${step + 1}칸! 다 같이 올라갔어요!`); return; }
          }
          if (k >= STEPS) end(true, '자립 계단 꼭대기까지! 대단해요!');
          return;
        }
        // 달리기
        const prevZ = Z;
        Z += speed * dt;
        for (const s of segs) {
          if (s.type === 'gate' && !s.done && prevZ < s.z && Z >= s.z) {
            s.done = true;
            const op = s.ops[X < 0 ? 0 : 1], o = opText(op), before = crowd;
            crowd = applyOp(crowd, op); sync();
            pop(`${o.big} ${o.name}`, o.good, true);
            if (crowd < before) shake = 0.2;
            if (crowd <= 0) { end(false, '응원단이 모두 흩어졌어요. 파란 문을 노려 봐요!'); return; }
          } else if (s.type === 'enemy' && !s.done && Z + 1.2 >= s.z - SP * Math.sqrt(s.n)) {
            s.done = true; fight = s; phase = 'fight'; pop('부딪혀라!', false, true); return;
          } else if ((s.type === 'debt' || s.type === 'bar') && Math.abs(s.z - Z) < 3) {
            for (let i = units.length - 1; i >= 0; i--) {
              const u = units[i]; if (!u) continue; // 앞에서 여러 명이 한꺼번에 빠졌을 수 있다
              const ux = X + u.x, uz = Z + u.z;
              let hit = false;
              if (s.type === 'debt') { const ox = Math.sin(t * s.w + s.ph) * (HALF - 0.4); hit = Math.hypot(ux - ox, uz - s.z) < s.r; }
              else {
                const ang = t * s.w + s.ph, dx = Math.cos(ang) * s.len, dz = Math.sin(ang) * s.len * 0.6;
                const px = ux - s.cx, pz = uz - s.z, l2 = dx * dx + dz * dz;
                const k = Math.max(-1, Math.min(1, (px * dx + pz * dz) / l2));
                hit = Math.hypot(px - dx * k, pz - dz * k) < 0.13;
              }
              if (hit) { killUnit(i, s.type); shake = 0.15; }
            }
            if (crowd <= 0) { end(false, s.type === 'debt' ? '빚 코인에 다 휩쓸렸어요. 굴러오는 걸 보고 피해요!' : '스미싱 막대에 다 걸렸어요. 막대 반대쪽으로 비켜 가요!'); return; }
          } else if (s.type === 'bridge' && Z + 1 > s.z && Z - 1 < s.z + s.len) {
            for (let i = units.length - 1; i >= 0; i--) {
              const u = units[i]; if (!u) continue;
              const uz = Z + u.z;
              if (uz > s.z && uz < s.z + s.len && Math.abs(X + u.x - s.cx) > s.half) killUnit(i, 'fall');
            }
            if (crowd <= 0) { end(false, '다리 밖으로 다 떨어졌어요. 다리 가운데로 모아요!'); return; }
          }
        }
        if (Z >= FIN) { phase = 'climb'; pop('자립 계단!', true, true); }
      },
      draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - .5) * 10, (Math.random() - .5) * 8);
        // 하늘·바다
        const sky = ctx.createLinearGradient(0, 0, 0, HOR + 10);
        sky.addColorStop(0, '#7cc8ff'); sky.addColorStop(1, '#d9f1ff');
        ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, HOR + 30);
        const sea = ctx.createLinearGradient(0, HOR, 0, H);
        sea.addColorStop(0, '#5bb6e8'); sea.addColorStop(1, '#2275b5');
        ctx.fillStyle = sea; ctx.fillRect(-20, HOR, W + 40, H);
        // 길 (다리 구간은 물 위 판자만)
        const far = Z + 70;
        const quad = (x1, z1, x2, z2, color, y = 0) => {
          const a = proj(x1, z1, y), b = proj(x2, z1, y), c = proj(x2, z2, y), d = proj(x1, z2, y);
          ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
        };
        const bridges = segs.filter(s => s.type === 'bridge');
        let zc = camZ() + 0.6;
        while (zc < Math.min(far, FIN)) {
          const br = bridges.find(b => zc >= b.z && zc < b.z + b.len);
          const nz = Math.min(far, FIN, br ? br.z + br.len : (bridges.find(b => b.z > zc) || { z: 1e9 }).z);
          if (br) quad(br.cx - br.half, zc, br.cx + br.half, nz, '#b07a43');
          else { quad(-HALF, zc, HALF, nz, '#a8b0ba'); quad(-HALF - 0.15, zc, -HALF, nz, '#e25b4a'); quad(HALF, zc, HALF + 0.15, nz, '#e25b4a'); }
          zc = nz;
        }
        for (let i = 0; i < 30; i++) {
          const z1 = Math.ceil(camZ() / 2.4) * 2.4 + i * 2.4;
          if (bridges.some(b => z1 + 1 >= b.z && z1 < b.z + b.len) || z1 > FIN || z1 > far) continue;
          quad(-0.04, z1, 0.04, z1 + 1, 'rgba(255,255,255,.75)');
        }
        // 결승: 자립 계단
        for (let k = STEPS - 1; k >= 0; k--) {
          const z1 = FIN + k, y = (k + 1) * 0.32;
          if (z1 > far) continue;
          const a = proj(-HALF, z1, y), b = proj(HALF, z1, y), a2 = proj(-HALF, z1, y - 0.32), b2 = proj(HALF, z1, y - 0.32);
          ctx.fillStyle = `hsl(${(k * 18) % 360} 70% 52%)`; ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.fill();
          quad(-HALF, z1, HALF, z1 + 1, `hsl(${(k * 18) % 360} 70% 68%)`, y);
          const m = proj(0, z1, y - 0.16);
          label(`×${(1 + k * 0.1).toFixed(1)}`, m.x, m.y, Math.max(10, 26 * m.s), '#fff', 'rgba(0,0,0,.4)');
        }
        // 물체들 (먼 것부터)
        const draws = [];
        segs.forEach(s => { if (s.z > camZ() + 1 && s.z < far && !(s.type === 'gate' && s.done) && !(s.type === 'enemy' && s.left <= 0)) draws.push({ z: s.z, s }); });
        stood.forEach(u => draws.push({ z: FIN + u.k + 0.5, stood: u }));
        units.forEach(u => draws.push({ z: Z + u.z, u }));
        falls.forEach(f => draws.push({ z: f.z, f }));
        draws.sort((a, b) => b.z - a.z);
        const ci = opts.charImg, climbY = (phase === 'climb' || phase === 'end') && step >= 0 ? (step + 1) * 0.32 : 0;
        for (const d of draws) {
          if (d.s) {
            const s = d.s;
            if (s.type === 'gate') {
              s.ops.forEach((op, sd) => {
                const o = opText(op), x1 = sd === 0 ? -HALF : 0.06, x2 = sd === 0 ? -0.06 : HALF;
                const a = proj(x1, s.z, 1.5), b = proj(x2, s.z, 1.5), c = proj(x2, s.z);
                ctx.fillStyle = o.good ? 'rgba(50,140,255,.55)' : 'rgba(235,60,60,.55)';
                ctx.fillRect(a.x, a.y, b.x - a.x, c.y - a.y);
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, 4 * a.s); ctx.strokeRect(a.x, a.y, b.x - a.x, c.y - a.y);
                label(o.big, (a.x + b.x) / 2, a.y + (c.y - a.y) * 0.42, Math.max(10, 70 * a.s));
                label(o.name, (a.x + b.x) / 2, a.y + (c.y - a.y) * 0.8, Math.max(8, 26 * a.s));
              });
            } else if (s.type === 'enemy') {
              s.units.slice().sort((a, b) => b.z - a.z).forEach((u, i) => {
                const q = proj(u.x, s.z + u.z), sz = 46 * q.s * 1.1;
                if (IMG.worry.complete) ctx.drawImage(IMG.worry, q.x - sz / 2, q.y - sz - Math.abs(Math.sin(t * 9 + i)) * 3 * q.s, sz, sz);
              });
              const q = proj(0, s.z, 1.3);
              label(`${s.left}`, q.x, q.y, Math.max(12, 44 * q.s), '#ffd0d0', '#7a0000');
            } else if (s.type === 'debt') {
              const ox = Math.sin(t * s.w + s.ph) * (HALF - 0.4), q = proj(ox, s.z), sz = 2 * s.r * 100 * q.s * 1.3;
              ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(q.x, q.y, sz * 0.5, sz * 0.12, 0, 0, 7); ctx.fill();
              ctx.save(); ctx.translate(q.x, q.y - sz / 2); ctx.rotate(Math.cos(t * s.w + s.ph) * 2.5);
              if (IMG.debt.complete) ctx.drawImage(IMG.debt, -sz / 2, -sz / 2, sz, sz);
              ctx.restore();
            } else if (s.type === 'bar') {
              const ang = t * s.w + s.ph, dx = Math.cos(ang) * s.len, dz = Math.sin(ang) * s.len * 0.6;
              const a = proj(s.cx - dx, s.z - dz, 0.35), b = proj(s.cx + dx, s.z + dz, 0.35), c = proj(s.cx, s.z, 0.35), base = proj(s.cx, s.z);
              ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(2, 10 * c.s); ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(c.x, c.y); ctx.stroke();
              ctx.lineCap = 'round'; ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(3, 22 * c.s); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              ctx.strokeStyle = '#fff'; ctx.setLineDash([10 * c.s, 10 * c.s]); ctx.lineWidth = Math.max(1, 8 * c.s); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
              const sz = 70 * c.s; if (IMG.scam.complete) ctx.drawImage(IMG.scam, c.x - sz / 2, c.y - sz * 0.9, sz, sz);
            }
          } else {
            let x, zz, y = 0, alpha = 1, bob = 0, tilt = 0;
            if (d.u) { x = X + d.u.x; zz = Z + d.u.z; y = climbY; bob = phase === 'run' || phase === 'climb' ? Math.abs(Math.sin(t * 14 + d.u.b)) * 0.06 : 0; }
            else if (d.stood) { x = d.stood.x; zz = FIN + d.stood.k + 0.5; y = (d.stood.k + 1) * 0.32; bob = Math.abs(Math.sin(t * 6 + d.stood.b)) * 0.03; }
            else { x = d.f.x; zz = d.f.z; alpha = Math.max(0, 1 - d.f.t); y = d.f.how === 'fall' ? -d.f.t * 3 : d.f.t * 0.8; tilt = d.f.t * 6; }
            const q = proj(x, zz, y + bob), hh = 42 * q.s * 1.2;
            if (ci && ci.complete) {
              ctx.save(); ctx.globalAlpha = alpha; ctx.translate(q.x, q.y); if (tilt) ctx.rotate(tilt);
              ctx.drawImage(ci, -hh * 0.36, -hh, hh * 0.72, hh); ctx.restore();
            }
          }
        }
        if (crowd > 0 && phase !== 'end') { const q = proj(X, Z + 0.2, 1.05 + climbY); label(`${crowd}`, q.x, q.y, 34, '#fff', '#1a4f8a'); }
        sparks.forEach(s => { ctx.globalAlpha = 1 - s.t / 0.7; ctx.fillStyle = s.color; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
        ctx.globalAlpha = 1;
        pops.forEach(p => { ctx.globalAlpha = Math.max(0, 1 - p.t); label(p.text, W / 2, 170 - p.t * 40, p.big ? 40 : 30, p.good ? '#bfe3ff' : '#ffc4c4', p.good ? '#1a4f8a' : '#7a0000'); });
        ctx.globalAlpha = 1;
        ctx.restore();
        // 진행 막대
        const prog = Math.max(0, Math.min(1, Z / FIN));
        roundRect(W / 2 - 160, 58, 320, 12, 6); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
        roundRect(W / 2 - 160, 58, 320 * prog, 12, 6); ctx.fillStyle = '#ffd84a'; ctx.fill();
        label('🏁', W / 2 + 174, 64, 20);
        if (phase === 'ready') label(IS_TOUCH ? '👆 화면을 좌우로 끌면 출발!' : '← → 키를 누르면 출발!', W / 2, H / 2 + 60, 34 + Math.sin(t * 5) * 2, '#fff', '#1a4f8a');
      },
    };
  }

  window.MiniGames = { open, current: () => game, applyOp };
})();
