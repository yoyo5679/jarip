/**
 * sprites.js
 * 자립 방탈출 2D 리메이크를 위한 프로그래매틱 픽셀 아트 엔진
 * 이미지 에셋 없이 Canvas API를 통해 JRPG 스타일 도트 캐릭터와 소품을 런타임에 렌더링하고 캐시합니다.
 */

const Sprites = {
  cache: {},

  // 색상 팔레트
  colors: {
    skin: '#fcd3a1',
    skinDark: '#e3b177',
    hairHaram: '#2c2222', // 새 디자인: 다크브라운
    clothHaram: '#e2e8f0', // 흰색계열 니트
    pantsHaram: '#3b82f6', // 청바지
    outline: '#1e1e1e',
    doorWood: '#8b5a2b',
    doorKnob: '#ffd700'
  },

  init() {
    // 하람이 생성 (상/하/좌/우 x 3프레임)
    this.cache.player = this.generateCharacter('./assets/game/haram_sheet_t.png');
    this.cache.npc1 = this.generateCharacter('./assets/game/npc_sheet_t.png');
    this.cache.npc2 = this.generateCharacter('./assets/game/npc2_sheet_t.png');
    this.cache.npc3 = this.generateCharacter('./assets/game/npc3_sheet_t.png');
    
    // 새싹이 (동반자)
    this.cache.follower = this.generateFollower();

    // 오브젝트들
    this.cache.door_locked = this.generateDoor(true);
    this.cache.door_unlocked = this.generateDoor(false);
    this.cache.box = this.generateBox();
    this.cache.desk = this.generateDesk();
    this.cache.laptop = this.generateLaptop();
    this.cache.paper = this.generatePaper();
    this.cache.cake = this.generateCake();
  },

  // AI 생성 4방향 스프라이트 시트 비동기 로드 및 렌더링
  generateCharacter(imgSrc) {
    const sheet = {};
    const dirs = ['down', 'left', 'right', 'up']; 
    
    // AI 이미지 로드
    const aiImage = new Image();
    aiImage.src = imgSrc;

    // 고화질 렌더링을 위해 캔버스 해상도를 2배(64x96)로 증가
    const W = 64; 
    const H = 96;
    
    dirs.forEach(dir => {
      sheet[dir] = [];
      for (let frame = 0; frame < 3; frame++) {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        sheet[dir].push(canvas);
      }
    });

    aiImage.onload = () => {
      const frameW = aiImage.width / 4;
      const frameH = aiImage.height;

      dirs.forEach(dir => {
        let dirIndex = 0;
        if (dir === 'down') dirIndex = 0; // 정면
        else if (dir === 'left') dirIndex = 1; // 좌측
        else if (dir === 'right') dirIndex = 2; // 우측
        else if (dir === 'up') dirIndex = 3; // 뒷면

        for (let frame = 0; frame < 3; frame++) {
          const canvas = sheet[dir][frame];
          const ctx = canvas.getContext('2d');
          
          ctx.clearRect(0, 0, W, H);
          ctx.imageSmoothingEnabled = true;
          
          // 임시 캔버스에 캐릭터 그리고 흰 배경 제거
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = W; tempCanvas.height = H;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.imageSmoothingEnabled = true;
          
          let wobbleY = 0;
          let wobbleAngle = 0;
          if (frame === 0) { wobbleY = 4; wobbleAngle = -0.06; }
          if (frame === 2) { wobbleY = 4; wobbleAngle = 0.06; }

          tempCtx.translate(W/2, H/2 + wobbleY);
          tempCtx.rotate(wobbleAngle);
          
          const pad = 4;
          const targetW = W - pad*2;
          const targetH = H - pad*2 - 12; 
          const scale = Math.min(targetW / frameW, targetH / frameH);
          
          const drawW = frameW * scale;
          const drawH = frameH * scale;
          
          tempCtx.drawImage(
            aiImage, 
            dirIndex * frameW, 0, frameW, frameH, 
            -drawW/2, -drawH/2, drawW, drawH
          );

          // 본 캔버스에 그림자 먼저 그리고 캐릭터 올리기
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(W/2, H - 8, 20, 6, 0, 0, Math.PI*2);
          ctx.fill();

          ctx.drawImage(tempCanvas, 0, 0);
        }
      });
    };

    return sheet;
  },

  generateFollower() {
    const frames = [];
    for (let i = 0; i < 2; i++) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      const yOffset = i === 1 ? 1 : 0;
      
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(8, 14, 5, 0, Math.PI*2); ctx.fill();
      
      // 몸통
      ctx.fillStyle = '#34d399';
      ctx.beginPath(); ctx.arc(8, 9 + yOffset, 6, 0, Math.PI*2); ctx.fill();
      
      // 새싹
      ctx.fillStyle = '#10b981';
      ctx.fillRect(7, 3 + yOffset, 2, 3);
      ctx.fillRect(5, 2 + yOffset, 2, 2);
      ctx.fillRect(9, 2 + yOffset, 2, 2);
      
      // 눈
      ctx.fillStyle = '#111827';
      ctx.fillRect(5, 8 + yOffset, 2, 2);
      ctx.fillRect(9, 8 + yOffset, 2, 2);
      
      frames.push(c);
    }
    return frames;
  },

  generateDoor(isLocked) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    
    // 바닥에 은은하게 빛나는 타원형 탈출 구역
    const grad = ctx.createRadialGradient(16, 26, 2, 16, 26, 14);
    if (isLocked) {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.8)'); // 붉은 빛 (잠김)
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    } else {
      grad.addColorStop(0, 'rgba(34, 197, 94, 0.9)'); // 초록 빛 (열림)
      grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
    }
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(16, 26, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 탈출 화살표 (오른쪽 방향)
    ctx.fillStyle = isLocked ? 'rgba(252, 165, 165, 0.9)' : 'rgba(134, 239, 172, 0.9)';
    ctx.beginPath();
    ctx.moveTo(16, 22);
    ctx.lineTo(22, 26);
    ctx.lineTo(16, 30);
    ctx.lineTo(16, 28);
    ctx.lineTo(10, 28);
    ctx.lineTo(10, 24);
    ctx.lineTo(16, 24);
    ctx.fill();
    
    // 상단 EXIT 텍스트
    ctx.fillStyle = isLocked ? '#fca5a5' : '#bef264';
    ctx.font = 'bold 9px "DungGeunMo", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 16, 14);
    
    return c;
  },

  generateBox() {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#a16207'; // 갈색 상자
    ctx.fillRect(2, 6, 20, 16);
    ctx.fillStyle = '#ca8a04'; // 상단
    ctx.fillRect(2, 2, 20, 8);
    ctx.fillStyle = '#1e1e1e'; // 테이프
    ctx.fillRect(10, 2, 4, 8);
    return c;
  },

  generateDesk() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#78350f'; // 진한 나무색
    ctx.fillRect(2, 4, 28, 16);
    ctx.fillStyle = '#b45309'; // 윗면
    ctx.fillRect(2, 2, 28, 10);
    // 다리
    ctx.fillStyle = '#451a03';
    ctx.fillRect(4, 12, 3, 10);
    ctx.fillRect(25, 12, 3, 10);
    return c;
  },

  generateLaptop() {
    const c = document.createElement('canvas');
    c.width = 20; c.height = 16;
    const ctx = c.getContext('2d');
    // 하판
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(2, 8, 16, 6);
    // 모니터
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(3, 2, 14, 8);
    // 화면
    ctx.fillStyle = '#0ea5e9'; // 파란 화면
    ctx.fillRect(4, 3, 12, 5);
    return c;
  },

  generatePaper() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc'; // 종이
    ctx.fillRect(3, 2, 10, 12);
    // 글씨
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(5, 4, 6, 1);
    ctx.fillRect(5, 6, 5, 1);
    ctx.fillRect(5, 8, 6, 1);
    // 빨간 도장
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(9, 10, 2, 2);
    return c;
  },

  generateCake() {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const ctx = c.getContext('2d');
    // 접시
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath(); ctx.ellipse(12, 20, 10, 3, 0, 0, Math.PI*2); ctx.fill();
    // 케이크 빵
    ctx.fillStyle = '#fef08a'; // 노란 시트
    ctx.fillRect(6, 12, 12, 8);
    // 딸기 크림
    ctx.fillStyle = '#fbcfe8';
    ctx.fillRect(5, 10, 14, 4);
    // 촛불
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(9, 6, 2, 4);
    ctx.fillRect(13, 6, 2, 4);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(9, 4, 2, 2);
    ctx.fillRect(13, 4, 2, 2);
    return c;
  },
  
  getProp(emoji) {
    // 이모지에 매핑되는 스프라이트를 반환. 기본은 박스
    if (emoji === '🚪') return this.cache.door_locked;
    if (emoji === '💻') return this.cache.laptop;
    if (emoji === '📒' || emoji === '📝') return this.cache.paper;
    if (emoji === '🎂') return this.cache.cake;
    return this.cache.box; 
  }
};
