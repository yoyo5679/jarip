/* 자립 어드벤처 미니게임: 핀 뽑기 퍼즐 + 게이트 달리기
 * MiniGames.open(kind, level, { charImg, onDone(result) })
 *   kind: 'pin' | 'gate',  result: { win, stars }
 * 필요: pin_logic.js, pin_levels.js (window.PinLogic, window.PIN_LEVELS)
 */
(function () {
  'use strict';
  const W = 960, H = 540;
  const A = 'assets/adventure/';
  const img = (src) => { const i = new Image(); i.src = A + src; return i; };
  const IMG = { mon: img('mob_worry.png'), boss: img('mob_boss.png'), scam: img('mob_scam.png') };
  const EMO = { coin: '💰', fire: '🔥', water: '💧', rock: '🪨' };

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
    cv.addEventListener('pointerdown', e => game && game.down && game.down(pt(e), e));
    cv.addEventListener('pointermove', e => game && game.move && game.move(pt(e), e));
    addEventListener('keydown', e => { if (!game) return; keys[e.key] = true; if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) e.preventDefault(); }, true);
    addEventListener('keyup', e => { keys[e.key] = false; }, true);
  }
  function pt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }

  function open(kind, level, o) {
    ensureDom();
    opts = o || {};
    keys = {};
    root.classList.add('on');
    root.querySelector('.mini-result').classList.remove('on');
    game = kind === 'pin' ? pinGame(level) : gateGame(level);
    root.querySelector('.mini-title').textContent = game.title;
    root.querySelector('.mini-sub').textContent = `${level}단계`;
    const help = root.querySelector('.mini-help');
    help.innerHTML = game.help || ''; help.style.display = game.help ? '' : 'none';
    cancelAnimationFrame(raf);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      if (game) { game.update(dt); game.draw(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function finish(res) {
    cancelAnimationFrame(raf); game = null;
    root.classList.remove('on');
    opts.onDone && opts.onDone(res);
  }

  /** 결과 패널: 이기면 별, 지면 다시하기(+선택적으로 건너뛰기) */
  function showResult(win, stars, msg) {
    const el = root.querySelector('.mini-result');
    const starHtml = win ? '⭐'.repeat(stars) + '<span style="opacity:.25">' + '⭐'.repeat(3 - stars) + '</span>' : '';
    el.innerHTML = `<div class="mini-card"><h3>${win ? '클리어!' : '아쉬워요!'}</h3>
      <div class="mini-stars">${starHtml}</div><p>${msg}</p>
      <div class="mini-btns">${win ? '<button class="btn" data-a="ok">좋아!</button>'
        : `<button class="btn" data-a="retry">다시 하기</button>${opts.canSkip ? '<button class="btn ghost" data-a="skip">건너뛰기</button>' : '<button class="btn ghost" data-a="quit">나가기</button>'}`}</div></div>`;
    el.classList.add('on');
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      el.classList.remove('on');
      if (a === 'ok') finish({ win: true, stars });
      else if (a === 'retry') { opts.attempts = (opts.attempts || 1) + 1; const k = game.kind, lv = game.level; game = k === 'pin' ? pinGame(lv) : gateGame(lv); }
      else finish({ win: false, stars: 0, skip: a === 'skip' });
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

  /* ======================= 핀 뽑기 퍼즐 ======================= */
  function pinGame(level) {
    const L = window.PIN_LEVELS[Math.min(level, window.PIN_LEVELS.length) - 1];
    const PL = window.PinLogic;
    const BX = 180, BY = 78;
    let state = PL.initState(L);
    let shown = PL.initState(L);     // 애니메이션 중 화면에 보이는 상태
    let anim = null;                 // { moves, i, t, final }
    let pinAnim = {};                // 뽑히는 핀 애니메이션
    const fxs = [];
    let over = false, t = 0;
    const ch = (id) => L.chambers.find(c => c.id === id);
    const center = (c) => ({ x: BX + c.x + c.w / 2, y: BY + c.y + c.h / 2 });
    // 한 방에서 핀이 둘 나가면 바닥을 반씩 나눠 쓴다 (왼쪽 목적지 → 왼쪽 반, 손잡이도 바깥쪽)
    const geom = L.pins.map((pin, i) => {
      const c = ch(pin[0]);
      const sib = L.pins.map((p2, j) => [p2, j]).filter(([p2]) => p2[0] === pin[0])
        .sort((a, b) => ch(a[0][1]).x - ch(b[0][1]).x).map(([, j]) => j);
      const y = BY + c.y + c.h - 12;
      if (sib.length < 2) return { x: BX + c.x - 6, y, w: c.w + 12, h: 22, hx: BX + c.x + c.w + 9, dir: 1, sx: BX + c.x + c.w / 2 };
      const left = sib.indexOf(i) === 0;
      return left
        ? { x: BX + c.x - 6, y, w: c.w / 2 + 2, h: 22, hx: BX + c.x - 9, dir: -1, sx: BX + c.x + c.w / 4 }
        : { x: BX + c.x + c.w / 2 + 4, y, w: c.w / 2 + 2, h: 22, hx: BX + c.x + c.w + 9, dir: 1, sx: BX + c.x + c.w * 3 / 4 };
    });
    const pinRect = (i) => geom[i];

    function pull(i) {
      if (over || anim || state.open[i]) return;
      const r = PL.pull(state, i, L);
      pinAnim[i] = 0;
      state = r.state;
      anim = { moves: r.moves, i: 0, t: 0, result: r.result };
      shown.open[i] = true;
    }
    return {
      kind: 'pin', level, title: '🧷 핀 뽑기 퍼즐', pinRect,
      help: level <= 3 ? '핀을 눌러 뽑으면 위 칸의 물건이 아래로 떨어져요. 💰를 나한테 보내고 🔥·☁️는 피하기! &nbsp;💧+🔥=🪨 · 🪨는 ☁️를 눌러요'
        : '💧+🔥=🪨 · 🪨가 떨어지면 ☁️가 사라져요 · 🔥·☁️를 만난 💰는 사라져요',
      down(p) {
        for (let i = 0; i < L.pins.length; i++) {
          if (state.open[i]) continue;
          const r = pinRect(i);
          const x0 = Math.min(r.x, r.hx - 11), x1 = Math.max(r.x + r.w, r.hx + 11);
          if (p.x >= x0 && p.x <= x1 && p.y >= r.y - 14 && p.y <= r.y + r.h + 14) { pull(i); return; }
        }
      },
      update(dt) {
        t += dt;
        for (const k in pinAnim) pinAnim[k] = Math.min(1, pinAnim[k] + dt * 3);
        for (let i = fxs.length - 1; i >= 0; i--) if ((fxs[i].t += dt) > 0.7) fxs.splice(i, 1);
        if (anim && Object.values(pinAnim).every(v => v >= 1 || v === undefined)) {
          const m = anim.moves[anim.i];
          if (!m) {
            // 모든 이동이 끝남
            shown = { items: JSON.parse(JSON.stringify(state.items)), open: state.open.slice() };
            const res = anim.result; anim = null;
            if (res !== 'play') {
              over = true;
              const tries = opts.attempts || 1;
              const stars = res === 'win' ? (tries === 1 ? 3 : tries === 2 ? 2 : 1) : 0;
              setTimeout(() => showResult(res === 'win', stars,
                res === 'win' ? '희망코인이 무사히 도착했어요!' : '앗, 순서가 틀렸어요. 어떤 핀부터 뽑아야 할까요?'), 450);
            }
            return;
          }
          if (anim.t === 0) shown.items[m.from] = [];
          anim.t += dt / 0.4;
          if (anim.t >= 1) {
            const before = shown.items[m.to].concat(m.items);
            const after = PL.resolve(before);
            if (after.length !== before.length || after.join() !== before.join()) {
              const c = center(ch(m.to));
              fxs.push({ x: c.x, y: c.y, t: 0, text: before.includes('water') && before.includes('fire') ? '💨' : '💥' });
            }
            shown.items[m.to] = after;
            anim.i++; anim.t = 0;
          }
        }
      },
      draw() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#fbe7c6'); g.addColorStop(1, '#e7c28f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // 파이프
        L.pins.forEach(([a, b], i) => {
          const A_ = ch(a), B_ = ch(b);
          ctx.strokeStyle = 'rgba(120,80,40,.25)'; ctx.lineWidth = 30; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(geom[i].sx, BY + A_.y + A_.h - 4); ctx.lineTo(BX + B_.x + B_.w / 2, BY + B_.y + 6); ctx.stroke();
        });
        // 방
        L.chambers.forEach(c => {
          const x = BX + c.x, y = BY + c.y;
          roundRect(x, y, c.w, c.h, 16);
          ctx.fillStyle = c.id === 'p' ? 'rgba(255,255,255,.75)' : 'rgba(210,240,255,.55)'; ctx.fill();
          ctx.lineWidth = 4; ctx.strokeStyle = c.id === 'p' ? '#d9822b' : '#7aa7c7'; ctx.stroke();
          const its = shown.items[c.id] || [];
          if (c.id === 'p' && opts.charImg && opts.charImg.complete) {
            const ih = 84, iw = opts.charImg.width * ih / opts.charImg.height;
            ctx.drawImage(opts.charImg, x + 16, y + c.h - ih - 4, iw, ih);
          }
          its.forEach((it, k) => {
            const cols = Math.min(its.length, 3), col = k % cols, row = Math.floor(k / cols);
            const ix = x + (c.id === 'p' ? 110 : c.w / 2) + (col - (cols - 1) / 2) * 44, iy = y + c.h / 2 + row * 30 - 4;
            if (it === 'mon') { if (IMG.mon.complete) ctx.drawImage(IMG.mon, ix - 24, iy - 24 + Math.sin(t * 5 + k) * 2, 48, 48); }
            else { ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(EMO[it], ix, iy + Math.sin(t * 4 + k) * 2); }
          });
        });
        // 떨어지는 물건
        if (anim && anim.moves[anim.i] && anim.t > 0) {
          const m = anim.moves[anim.i], a = center(ch(m.from)), b = center(ch(m.to));
          const k = anim.t * anim.t;
          m.items.forEach((it, j) => {
            const x = a.x + (b.x - a.x) * k + (j - (m.items.length - 1) / 2) * 30, y = a.y + (b.y - a.y) * k;
            if (it === 'mon') { if (IMG.mon.complete) ctx.drawImage(IMG.mon, x - 22, y - 22, 44, 44); }
            else { ctx.font = '32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(EMO[it], x, y); }
          });
        }
        // 핀
        L.pins.forEach((pin, i) => {
          const r = pinRect(i), k = pinAnim[i] || 0;
          if (k >= 1) return;
          ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(k * 160 * r.dir, 0);
          // 막대 + 바깥쪽 손잡이
          const bx0 = Math.min(r.x, r.hx), bx1 = Math.max(r.x + r.w, r.hx);
          roundRect(bx0, r.y, bx1 - bx0, r.h - 8, 7);
          const gg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
          gg.addColorStop(0, '#ffe38a'); gg.addColorStop(1, '#d99a1a');
          ctx.fillStyle = gg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8a5a00'; ctx.stroke();
          ctx.beginPath(); ctx.arc(r.hx, r.y + 7, 11, 0, 7); ctx.fillStyle = '#ffd24a'; ctx.fill(); ctx.stroke();
          ctx.restore();
          if (!state.open[i] && !anim && !over) { // 누를 수 있다는 표시
            ctx.globalAlpha = 0.5 + Math.sin(t * 5 + i) * 0.3;
            label('👆', r.hx + r.dir * 10, r.y + 30, 22);
            ctx.globalAlpha = 1;
          }
        });
        fxs.forEach(f => { ctx.globalAlpha = 1 - f.t / 0.7; label(f.text, f.x, f.y - f.t * 30, 44); ctx.globalAlpha = 1; });
      },
    };
  }

  /* ======================= 게이트 달리기 ======================= */
  function seeded(n) { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
  const GOOD = [['+', 3, '선배'], ['+', 5, '친구'], ['+', 8, '상담쌤'], ['x', 2, '자조모임'], ['+', 10, '바람개비'], ['x', 3, '응원단']];
  const BAD = [['-', 4, '사기문자'], ['-', 6, '번아웃'], ['/', 2, '과소비'], ['-', 8, '야근'], ['-', 10, '빚독촉']];
  function applyOp(n, op) {
    const [o, v] = op;
    return Math.max(0, Math.floor(o === '+' ? n + v : o === '-' ? n - v : o === 'x' ? n * v : n / v));
  }
  function opText(op) { const [o, v, name] = op; return { big: (o === 'x' ? '×' : o === '/' ? '÷' : o) + v, name, good: o === '+' || o === 'x' }; }

  function gateGame(level) {
    const rnd = seeded(level * 7 + 3);
    const rows = [];
    const nRows = Math.min(16, 5 + Math.floor(level * 0.75));
    let best = 1;
    for (let i = 0; i < nRows; i++) {
      const mobK = 2 + Math.floor(rnd() * (3 + level));
      // 방해 무리: 최선으로 골랐을 때도 3명 이상 남을 때만 (항상 이길 수 있게)
      if (i > 1 && rnd() < 0.18 + level * 0.01 && best - mobK >= 3) {
        rows.push({ type: 'mob', k: mobK, z: -i * 0.42 - 0.3 });
        best -= mobK;
        continue;
      }
      const g = GOOD[Math.floor(rnd() * Math.min(GOOD.length, 3 + Math.floor(level / 3)))];
      // 어려울수록 양쪽 다 나쁜 문(덜 나쁜 쪽 고르기)이 섞인다
      const b = BAD[Math.floor(rnd() * Math.min(BAD.length, 2 + Math.floor(level / 3)))];
      const b2 = BAD[Math.floor(rnd() * BAD.length)];
      const both = level >= 4 && rnd() < 0.12 + level * 0.015 && Math.max(applyOp(best, b), applyOp(best, b2)) >= 3;
      const other = both ? b2 : b;
      const pair = both ? [b, other] : (rnd() < .5 ? [g, other] : [other, g]);
      rows.push({ type: 'gate', ops: pair, z: -i * 0.42 - 0.3 });
      best = Math.max(applyOp(best, pair[0]), applyOp(best, pair[1]));
    }
    const boss = Math.max(4, Math.floor(best * Math.min(0.8, 0.4 + level * 0.03)));
    let crowd = 1, px = 0, targetPx = 0, speed = 0.36 + level * 0.012, t = 0;
    let phase = 'run', fight = 0, enemy = boss, over = false, bossZ = rows[rows.length - 1].z - 0.6;
    const pops = [];
    const PZ = 0.86;
    const yOf = (z) => 120 + 420 * Math.max(0, Math.min(1.1, z));
    const half = (z) => 60 + 300 * Math.max(0, z);
    const xOf = (lane, z) => W / 2 + lane * half(z) * 0.62;
    function pop(text, good) { pops.push({ text, good, t: 0, x: xOf(px, PZ), y: yOf(PZ) - 90 }); }

    return {
      kind: 'gate', level, title: '🏃 게이트 달리기',
      peek: () => ({ rows, crowd, phase, enemy, boss, best, px, PZ }), // 테스트용
      help: level <= 2 ? '좌우로 끌거나 ←→ 키로 움직여서 좋은 문(파란색)을 지나가요. 응원단을 모아 끝에서 걱정 군단을 이겨요!' : '',
      down(p) { targetPx = Math.max(-1, Math.min(1, (p.x - W / 2) / (half(PZ) * 0.62))); },
      move(p, e) { if (e.buttons || e.pointerType === 'touch') targetPx = Math.max(-1, Math.min(1, (p.x - W / 2) / (half(PZ) * 0.62))); },
      update(dt) {
        t += dt;
        if (keys.ArrowLeft || keys.a) targetPx = Math.max(-1, targetPx - dt * 2.6);
        if (keys.ArrowRight || keys.d) targetPx = Math.min(1, targetPx + dt * 2.6);
        px += (targetPx - px) * Math.min(1, dt * 10);
        for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) > 1) pops.splice(i, 1);
        if (phase === 'run') {
          rows.forEach(r => {
            const before = r.z; r.z += speed * dt;
            if (before < PZ && r.z >= PZ && !r.done) {
              r.done = true;
              if (r.type === 'gate') {
                const op = r.ops[px < 0 ? 0 : 1], o = opText(op);
                crowd = applyOp(crowd, op); pop(`${o.big} ${o.name}`, o.good);
              } else { crowd = Math.max(0, crowd - r.k); pop(`-${r.k} 걱정 구름`, false); }
              if (crowd <= 0) { phase = 'end'; over = true; setTimeout(() => showResult(false, 0, '응원단이 모두 흩어졌어요. 파란 문을 노려봐요!'), 500); }
            }
          });
          bossZ += speed * dt;
          if (bossZ >= PZ - 0.12) { phase = 'fight'; }
        } else if (phase === 'fight') {
          fight += dt;
          // 둘이 동시에 줄어든다
          const rate = Math.max(8, (crowd + enemy) / 1.6);
          const d = Math.min(enemy, crowd, rate * dt);
          crowd -= d; enemy -= d;
          if (enemy <= 0.001 || crowd <= 0.001) {
            phase = 'end'; over = true;
            const win = enemy <= 0.001 && crowd > 0.001;
            const left = Math.ceil(crowd), ratio = left / boss;
            const stars = !win ? 0 : ratio >= 0.5 ? 3 : ratio >= 0.2 ? 2 : 1;
            setTimeout(() => showResult(win, stars, win ? `걱정 군단을 이겼어요! 남은 응원단 ${left}명` : '걱정 군단이 더 많았어요. 더 많이 모아봐요!'), 600);
          }
        }
      },
      draw() {
        // 하늘·바다
        const sky = ctx.createLinearGradient(0, 0, 0, 140);
        sky.addColorStop(0, '#8fd3ff'); sky.addColorStop(1, '#dff3ff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 140);
        const sea = ctx.createLinearGradient(0, 120, 0, H);
        sea.addColorStop(0, '#5bb6e8'); sea.addColorStop(1, '#2a7fbf');
        ctx.fillStyle = sea; ctx.fillRect(0, 120, W, H - 120);
        // 도로
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath(); ctx.moveTo(xOf(-1.35, 0), yOf(0)); ctx.lineTo(xOf(1.35, 0), yOf(0)); ctx.lineTo(xOf(1.35, 1.1), H); ctx.lineTo(xOf(-1.35, 1.1), H); ctx.fill();
        // 차선 (움직이는 점선)
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 4;
        for (let i = 0; i < 12; i++) {
          const z = ((i / 12) + t * speed) % 1, z2 = z + 0.03;
          ctx.beginPath(); ctx.moveTo(W / 2, yOf(z)); ctx.lineTo(W / 2, yOf(z2)); ctx.stroke();
        }
        // 난간
        ctx.strokeStyle = '#d9534f'; ctx.lineWidth = 6;
        [-1.35, 1.35].forEach(s => { ctx.beginPath(); ctx.moveTo(xOf(s, 0), yOf(0)); ctx.lineTo(xOf(s, 1.1), H); ctx.stroke(); });
        // 보스 무리
        const items = rows.filter(r => r.z > -0.05 && r.z < 1.15 && !(r.done && r.z > PZ + 0.1));
        if (bossZ > -0.1 && enemy > 0) items.push({ type: 'boss', z: Math.min(bossZ, PZ - 0.12) });
        items.sort((a, b) => a.z - b.z).forEach(r => {
          const y = yOf(r.z), s = 0.25 + 0.75 * Math.max(0, r.z);
          if (r.type === 'gate' && !r.done) {
            r.ops.forEach((op, side) => {
              const o = opText(op);
              const x0 = side === 0 ? xOf(-1.3, r.z) : xOf(0.03, r.z), x1 = side === 0 ? xOf(-0.03, r.z) : xOf(1.3, r.z);
              const h = 90 * s;
              ctx.fillStyle = o.good ? 'rgba(60,140,255,.72)' : 'rgba(230,60,60,.72)';
              ctx.fillRect(x0, y - h, x1 - x0, h);
              ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3 * s; ctx.strokeRect(x0, y - h, x1 - x0, h);
              label(o.big, (x0 + x1) / 2, y - h * 0.6, 46 * s);
              label(o.name, (x0 + x1) / 2, y - h * 0.2, 20 * s);
            });
          } else if (r.type === 'mob' && !r.done) {
            for (let k = 0; k < Math.min(r.k, 8); k++) {
              const xx = xOf(-0.9 + (k % 4) * 0.6, r.z), yy = y - (k >= 4 ? 18 * s : 0);
              if (IMG.mon.complete) ctx.drawImage(IMG.mon, xx - 22 * s, yy - 44 * s, 44 * s, 44 * s);
            }
            label(`${r.k}`, W / 2, y - 60 * s, 30 * s, '#ffd0d0');
          } else if (r.type === 'boss') {
            const bs = 150 * s;
            if (IMG.boss.complete) ctx.drawImage(IMG.boss, W / 2 - bs / 2, y - bs, bs, bs);
            for (let k = 0; k < 6; k++) if (IMG.mon.complete) ctx.drawImage(IMG.mon, xOf(-1.1 + k * 0.44, r.z) - 20 * s, y - 40 * s, 40 * s, 40 * s);
            label(`걱정 군단 ${Math.ceil(enemy)}`, W / 2, y - bs - 16 * s, 34 * s, '#ffd0d0', '#5a0000');
          }
        });
        // 우리 응원단
        const cx = xOf(px, PZ), cy = yOf(PZ);
        const n = Math.min(30, Math.ceil(crowd));
        const ci = opts.charImg;
        for (let k = n - 1; k >= 0; k--) {
          const ring = Math.floor(Math.sqrt(k)), ang = k * 2.4;
          const ox = Math.cos(ang) * ring * 14, oy = Math.sin(ang) * ring * 6 - (k === 0 ? 0 : 4);
          const hh = k === 0 ? 70 : 40;
          const bob = Math.abs(Math.sin(t * 12 + k)) * 3;
          if (ci && ci.complete) ctx.drawImage(ci, cx + ox - hh * 0.35, cy + oy - hh - bob, hh * 0.7, hh);
        }
        if (crowd > 0) label(`${Math.ceil(crowd)}명`, cx, cy - 92, 30, '#fff', '#1a4f8a');
        pops.forEach(p => { ctx.globalAlpha = 1 - p.t; label(p.text, p.x, p.y - p.t * 50, 30, p.good ? '#bfe3ff' : '#ffc4c4'); ctx.globalAlpha = 1; });
        if (phase === 'fight') label('⚔️', W / 2, yOf(PZ - 0.06) - 40 + Math.sin(t * 20) * 4, 48);
      },
    };
  }

  window.MiniGames = { open, current: () => game, _gate: (lv) => gateGame(lv), applyOp };
})();
