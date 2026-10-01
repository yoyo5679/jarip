/* 핀 뽑기 레벨 검증기 (assets/adventure/pin_physics.js의 LEVELS)
 * 실행: node scripts/verify_pin_levels.js [단계들 예: 1,2,15] [무작위 순서 수]
 * 단계마다 (1) 정석 순서로 이기는지 (2) 무작위로 핀을 뽑으면 얼마나 이기는지(낮을수록 퍼즐다움)를 출력
 */
const path = require('path').join(__dirname, '../assets/adventure/pin_physics.js');
const PP = require(path);
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const SAMPLES = +(process.argv[3] || 40);
const DT = 1 / 60;

function perms(a) { if (a.length <= 1) return [a]; return a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x, ...p])); }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function rng(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); }

function play(spec, order) {
  const S = PP.init(spec);
  const settle = (max) => { for (let i = 0; i < max * 60 && S.result === 'play'; i++) { PP.step(S, DT); if (S.calm > 0.45 && i > 25) break; } };
  settle(2);
  for (const k of order) { if (S.result !== 'play') break; PP.pull(S, k); settle(4); }
  for (let i = 0; i < 5 * 60 && S.result === 'play'; i++) PP.step(S, DT);
  return { res: S.result, why: S.hero.why, got: S.got, need: S.need, gold: S.gold0, alive: S.mons.filter(m => m.alive).length };
}
// 정석: 기둥마다 위에서부터 핀을 뽑되, 물 없이 용암만 금화 위에 있으면 그 핀은 건드리지 않는다. 마지막에 긴 바닥 핀
function solution(spec) {
  const order = []; let k = 0;
  spec.slots.forEach(sl => {
    const cells = Array.isArray(sl) ? sl : sl.cells;
    for (let i = 0; i < cells.length - 1; i++, k++) {
      const trap = cells[i] === 'L' && cells[i + 1] === 'G' && !cells.slice(0, i).includes('W');
      if (!trap) order.push(k);
    }
  });
  order.push(k);
  return order;
}

PP.LEVELS.forEach((spec, li) => {
  if (only && !only.includes(li + 1)) return;
  const n = PP.init(spec).pins.length;
  const sol = solution(spec), s = play(spec, sol);
  let orders = n <= 4 ? perms([...Array(n).keys()]) : Array.from({ length: SAMPLES }, (_, i) => shuffle([...Array(n).keys()], rng(li * 977 + i + 1)));
  const rs = orders.map(o => play(spec, o));
  const wins = rs.filter(r => r.res === 'win').length;
  const why = {}; rs.filter(r => r.res !== 'win').forEach(r => { const k = r.why || r.res; why[k] = (why[k] || 0) + 1; });
  console.log(`L${li + 1} pins=${n} gold=${s.gold} need=${s.need} | 정석[${sol}] → ${s.res}${s.why ? '(' + s.why + ')' : ''} got=${s.got} alive=${s.alive} | 무작위 ${wins}/${orders.length} 승 ${JSON.stringify(why)}`);
});
