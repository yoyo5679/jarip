/* 핀 뽑기 퍼즐 15단계 생성기 — 풀이기(pin_logic.solve)로 검증된 단계만 뽑는다.
 * 실행: node scripts/generate_pin_levels.js  → assets/adventure/pin_levels.js
 */
const fs = require('fs');
const path = require('path');
const PL = require('../assets/adventure/pin_logic.js');

// 시드 고정 난수 (같은 결과가 나오도록)
let seed = 20260930;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const W = 170, H = 105;
const LAYOUT = {
  T0: { x: 0, y: 0 }, T1: { x: 215, y: 0 }, T2: { x: 430, y: 0 },
  M0: { x: 100, y: 165 }, M1: { x: 330, y: 165 },
  p: { x: 215, y: 330 },
};
const DIRECT = [['T0', 'p'], ['T1', 'p'], ['T2', 'p']];
const TIER = [['T0', 'M0'], ['T1', 'M0'], ['T1', 'M1'], ['T2', 'M1'], ['M0', 'p'], ['M1', 'p'], ['T0', 'M1'], ['T2', 'M0']];

function build(edges, fill) {
  const ids = [...new Set(edges.flat())];
  return {
    chambers: ids.map(id => ({ id, ...LAYOUT[id], w: W, h: H, items: id === 'p' ? [] : (fill[id] || []) })),
    pins: edges,
  };
}

function randomLevel(lv) {
  const tier = lv >= 4;
  let edges;
  if (!tier) edges = DIRECT.filter(() => rnd() < 0.85);
  else {
    const n = Math.min(6, 3 + Math.floor(lv / 4) + (rnd() < .5 ? 1 : 0));
    edges = TIER.slice().sort(() => rnd() - .5).slice(0, n);
  }
  if (!edges.some(e => e[1] === 'p')) return null;
  const pool = lv < 3 ? ['coin', 'fire', 'mon'] : lv < 6 ? ['coin', 'fire', 'water', 'mon', 'rock'] : ['coin', 'fire', 'water', 'mon', 'rock', 'fire', 'mon'];
  const fill = {};
  edges.flat().forEach(id => {
    if (id === 'p' || fill[id]) return;
    const k = rnd() < .3 ? 0 : rnd() < .7 ? 1 : 2;
    // 코인은 맨 위 방(T*)에만: 한 수 만에 끝나는 단계를 줄인다
    const p2 = id[0] === 'T' ? pool : pool.filter(x => x !== 'coin');
    fill[id] = Array.from({ length: k }, () => pick(p2));
    // 처음부터 서로 반응하는 조합(몬스터+코인 등)은 두지 않는다
    if (PL.resolve(fill[id]).length !== fill[id].length || PL.resolve(fill[id]).some((x, i) => x !== fill[id][i])) fill[id] = [];
  });
  if (!Object.values(fill).flat().includes('coin')) return null;
  return build(edges, fill);
}

// 단계별 기준: 끝까지 가는 모든 순서 중 이기는 비율(ratio)과 최소 수(shortest)
function ok(lv, r, L) {
  if (!r.wins) return false;
  const ratio = r.wins / r.total;
  // 모든 방의 핀이 실제로 흐름에 쓰이는지(허수 방 방지): 물건 있는 방은 최소 하나
  const used = L.chambers.filter(c => c.id !== 'p' && c.items.length).length >= Math.min(3, L.pins.length);
  if (!used) return false;
  if (lv <= 2) return ratio <= 0.5 && r.shortest >= 1;
  if (lv <= 5) return ratio <= 0.4 && r.shortest >= 2;
  if (lv <= 9) return ratio <= 0.25 && r.shortest >= 3;
  return ratio <= 0.25 && r.shortest >= 3 && L.pins.length >= 5;
}

const levels = [
  // 1단계: 튜토리얼 (핀 하나)
  build([['T1', 'p']], { T1: ['coin', 'coin'] }),
];
// 후보를 많이 만들고 난이도 점수로 정렬해 고르게 뽑는다
const seen = new Set();
const cands = [];
for (let tries = 0; tries < 400000 && cands.length < 3000; tries++) {
  const lv = 2 + Math.floor(rnd() * 14); // 구조 다양성용
  const L = randomLevel(lv);
  if (!L) continue;
  const key = JSON.stringify(L);
  if (seen.has(key)) continue;
  seen.add(key);
  const r = PL.solve(L);
  if (!r.wins) continue;
  const ratio = r.wins / r.total;
  if (ratio > 0.5) continue; // 아무렇게나 뽑아도 이기는 단계는 제외
  if (L.chambers.filter(c => c.id !== 'p' && c.items.length).length < 2) continue;
  // 난이도: 이기는 비율이 낮을수록, 최소 수가 많을수록, 핀이 많을수록 어렵다
  const score = (1 - ratio) * 4 + r.shortest * 1.5 + L.pins.length * 0.5;
  L.stat = { wins: r.wins, total: r.total, shortest: r.shortest, score: +score.toFixed(2) };
  cands.push(L);
}
cands.sort((a, b) => a.stat.score - b.stat.score);
console.log('검증된 후보', cands.length, '개');
for (let i = 0; i < 14; i++) {
  // 쉬운 쪽(하위 5%)부터 어려운 쪽(최상위)까지 고르게
  const q = 0.05 + 0.95 * (i / 13);
  levels.push(cands[Math.min(cands.length - 1, Math.floor(q * (cands.length - 1)))]);
}

levels.forEach((L, i) => console.log(`L${i + 1}: pins ${L.pins.length}, 이기는 순서 ${L.stat ? L.stat.wins + '/' + L.stat.total : '1/1'}, 최소 ${L.stat ? L.stat.shortest : 1}수 ::`,
  L.chambers.filter(c => c.items.length).map(c => c.id + '[' + c.items.join(',') + ']').join(' ')));
fs.writeFileSync(path.join(__dirname, '../assets/adventure/pin_levels.js'),
  '/* 자동 생성: scripts/generate_pin_levels.js (풀이기로 풀 수 있음이 검증된 단계) */\nwindow.PIN_LEVELS = ' + JSON.stringify(levels) + ';\n');
