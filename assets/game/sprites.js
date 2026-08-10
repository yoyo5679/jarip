/* ============================================================
   자립 방탈출(아케이드) 스프라이트 모듈 — 복원본
   외부 이미지 없이 오프스크린 캔버스로 픽셀 스프라이트를 생성한다.
   요구 API:
     Sprites.init()
     Sprites.cache.player[facing][frame]        (facing: up/down/left/right, frame: 0~2)
     Sprites.cache.npc1 / npc2 / npc3           (player와 동일한 구조)
     Sprites.cache.door_locked / door_unlocked  (단일 캔버스)
     Sprites.getProp(emoji)                     (단일 캔버스)
   ============================================================ */
(function () {
  'use strict';

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ---- 이모지를 캔버스에 렌더 (소품용) ---- */
  var EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','EmojiOne Color',sans-serif";
  function emojiSprite(emoji, size) {
    size = size || 26;
    var c = makeCanvas(size, size);
    var x = c.getContext('2d');
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = Math.floor(size * 0.82) + "px " + EMOJI_FONT;
    x.fillText(emoji || '❓', size / 2, size / 2 + Math.floor(size * 0.04));
    return c;
  }

  /* ---- 픽셀 캐릭터 생성 (방향 4 × 프레임 3) ---- */
  var CW = 24, CH = 34;
  function drawCharFrame(facing, frame, col) {
    var c = makeCanvas(CW, CH);
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;

    var skin = col.skin, hair = col.hair, shirt = col.shirt, pants = col.pants, shoe = col.shoe || '#20242e';
    var facingUp = (facing === 'up');

    // 머리카락
    x.fillStyle = hair;
    x.fillRect(6, 2, 12, 7);
    x.fillRect(6, 6, 2, 5);
    x.fillRect(16, 6, 2, 5);
    // 얼굴
    x.fillStyle = facingUp ? hair : skin;
    x.fillRect(8, 6, 8, 7);
    // 눈 (뒤를 볼 땐 없음)
    if (!facingUp) {
      x.fillStyle = '#1c2431';
      if (facing === 'left') { x.fillRect(9, 9, 2, 2); }
      else if (facing === 'right') { x.fillRect(13, 9, 2, 2); }
      else { x.fillRect(9, 9, 2, 2); x.fillRect(13, 9, 2, 2); }
    }
    // 몸통(셔츠)
    x.fillStyle = shirt;
    x.fillRect(6, 13, 12, 10);
    // 팔
    x.fillStyle = skin;
    x.fillRect(4, 14, 2, 7);
    x.fillRect(18, 14, 2, 7);

    // 다리 (walk cycle)
    x.fillStyle = pants;
    if (frame === 1) { x.fillRect(7, 23, 3, 9); x.fillRect(14, 23, 3, 7); }
    else if (frame === 2) { x.fillRect(7, 23, 3, 7); x.fillRect(14, 23, 3, 9); }
    else { x.fillRect(8, 23, 3, 9); x.fillRect(13, 23, 3, 9); }
    // 신발
    x.fillStyle = shoe;
    if (frame === 1) { x.fillRect(7, 31, 4, 2); x.fillRect(14, 29, 4, 2); }
    else if (frame === 2) { x.fillRect(7, 29, 4, 2); x.fillRect(14, 31, 4, 2); }
    else { x.fillRect(8, 31, 4, 2); x.fillRect(13, 31, 4, 2); }

    return c;
  }

  function makeCharacter(col) {
    var dirs = ['up', 'down', 'left', 'right'];
    var out = {};
    dirs.forEach(function (d) {
      out[d] = [0, 1, 2].map(function (f) { return drawCharFrame(d, f, col); });
    });
    return out;
  }

  /* ---- 문 스프라이트 ---- */
  function doorSprite(unlocked) {
    var W = 24, H = 36;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    // 문틀
    x.fillStyle = '#5a3d22';
    x.fillRect(1, 1, W - 2, H - 1);
    // 문짝
    x.fillStyle = unlocked ? '#a9713b' : '#7a4e28';
    x.fillRect(3, 3, W - 6, H - 4);
    // 패널 음영
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(6, 6, W - 12, 10);
    x.fillRect(6, 19, W - 12, 10);
    // 손잡이 / 자물쇠
    if (unlocked) {
      x.fillStyle = '#34d399';
      x.fillRect(W - 8, 17, 3, 3);
      // 살짝 열린 빛
      x.fillStyle = 'rgba(255,236,150,0.55)';
      x.fillRect(3, 3, 3, H - 4);
    } else {
      x.fillStyle = '#ffcc00';
      x.fillRect(W - 9, 16, 5, 5);
      x.fillStyle = '#8a6d0b';
      x.fillRect(W - 8, 14, 3, 3);
    }
    return c;
  }

  /* ---- 모듈 ---- */
  var Sprites = {
    cache: {},
    _propCache: {},
    init: function () {
      this.cache.player = makeCharacter({ skin: '#f6cfa8', hair: '#2b2018', shirt: '#5b8cff', pants: '#33415c' });
      this.cache.npc1 = makeCharacter({ skin: '#f2c39b', hair: '#141414', shirt: '#e0771f', pants: '#3a3a3a' });
      this.cache.npc2 = makeCharacter({ skin: '#eeba8c', hair: '#6b4a2b', shirt: '#2dd4bf', pants: '#33415c' }); // 원장님 계열
      this.cache.npc3 = makeCharacter({ skin: '#f4c8a0', hair: '#333333', shirt: '#b57bff', pants: '#2c3e50' });
      this.cache.door_locked = doorSprite(false);
      this.cache.door_unlocked = doorSprite(true);
      return this;
    },
    getProp: function (emoji) {
      if (!this._propCache[emoji]) this._propCache[emoji] = emojiSprite(emoji, 26);
      return this._propCache[emoji];
    }
  };

  window.Sprites = Sprites;
})();
