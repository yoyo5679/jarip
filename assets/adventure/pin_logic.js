/* 핀 뽑기 퍼즐 규칙 (게임과 레벨 생성기가 같이 쓴다)
 * 방(chamber)마다 물건이 있고, 핀(from→to)을 뽑으면 from 방의 물건이 to 방으로 떨어진다.
 * 물건: coin(희망코인) fire(빚 불씨) water(저축 물) rock(돌) mon(걱정 몬스터)
 * 만나면: 물+불 → 돌 / 돌+몬스터 → 몬스터 사라짐 / 불·몬스터+코인 → 코인 사라짐
 * 승리: 플레이어 방(p)에 코인이 도착하고 위험물(불·몬스터)이 없을 때
 */
(function (root) {
  'use strict';
  const HAZARD = ['fire', 'mon'];

  function resolve(items) {
    const n = (t) => items.filter(i => i === t).length;
    const out = items.slice();
    const take = (t) => { const i = out.indexOf(t); if (i >= 0) out.splice(i, 1); };
    let w = n('water'), f = n('fire');
    while (w > 0 && f > 0) { take('water'); take('fire'); out.push('rock'); w--; f--; }
    if (out.includes('rock') && out.includes('mon')) for (let i = out.length - 1; i >= 0; i--) if (out[i] === 'mon') out.splice(i, 1);
    if (out.includes('fire') || out.includes('mon')) for (let i = out.length - 1; i >= 0; i--) if (out[i] === 'coin') out.splice(i, 1);
    return out;
  }

  /** 핀 하나를 뽑은 결과. moves: 애니메이션용 [{from,to,items}] 목록 */
  function pull(state, pinIdx, level) {
    const s = { items: {}, open: state.open.slice() };
    for (const k in state.items) s.items[k] = state.items[k].slice();
    s.open[pinIdx] = true;
    const moves = [];
    for (let guard = 0; guard < 20; guard++) {
      let moved = false;
      level.pins.forEach((pin, i) => {
        if (!s.open[i]) return;
        const src = s.items[pin[0]];
        if (!src.length) return;
        moves.push({ from: pin[0], to: pin[1], items: src.slice() });
        s.items[pin[1]] = resolve(s.items[pin[1]].concat(src));
        s.items[pin[0]] = [];
        moved = true;
      });
      if (!moved) break;
    }
    return { state: s, moves, result: judge(s, level) };
  }

  function judge(s, level) {
    const p = s.items.p;
    if (p.some(i => HAZARD.includes(i))) return 'lose';
    if (p.includes('coin')) return 'win';
    const coins = Object.values(s.items).reduce((a, it) => a + it.filter(i => i === 'coin').length, 0);
    if (!coins) return 'lose';
    if (s.open.every(Boolean)) return 'lose';
    return 'play';
  }

  function initState(level) {
    const items = {};
    level.chambers.forEach(c => { items[c.id] = (c.items || []).slice(); });
    return { items, open: level.pins.map(() => false) };
  }

  /** 모든 뽑는 순서를 끝까지 탐색: {wins, total, shortest} */
  function solve(level) {
    let wins = 0, total = 0, shortest = Infinity;
    (function dfs(state, depth) {
      for (let i = 0; i < level.pins.length; i++) {
        if (state.open[i]) continue;
        const r = pull(state, i, level);
        if (r.result === 'play') dfs(r.state, depth + 1);
        else { total++; if (r.result === 'win') { wins++; shortest = Math.min(shortest, depth + 1); } }
      }
    })(initState(level), 0);
    return { wins, total, shortest };
  }

  const api = { resolve, pull, judge, initState, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PinLogic = api;
})(this);
