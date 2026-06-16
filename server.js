const express = require('express');
const cors = require('cors');
const { fork } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: 허용 출처를 환경 변수로 관리 (미설정 시 로컬 개발용 기본값)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// 허용된 정적 파일만 명시적으로 서빙 (소스 코드 노출 방지)
// server.js, crawler.js, package.json 등은 접근 불가
const ALLOWED_STATIC_FILES = new Set(['index.html', 'admin.html', 'app.js', 'data.js', 'styles.css']);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res, next) => {
  const filename = path.basename(req.path);
  if (ALLOWED_STATIC_FILES.has(filename)) {
    return res.sendFile(path.join(__dirname, filename));
  }
  next();
});

// 3시간마다 백기라운드에서 크롤러(crawler.js) 실행 자동화
function runCrawler() {
  console.log(`[${new Date().toLocaleString()}] 자동 크롤링 작업 시작...`);
  const child = fork(path.join(__dirname, 'crawler.js'));
  
  child.on('close', (code) => {
    console.log(`[${new Date().toLocaleString()}] 자동 크롤링 종료 (코드: ${code})`);
  });
  
  child.on('error', (err) => {
    console.error(`[${new Date().toLocaleString()}] 자동 크롤링 실행 실패:`, err);
  });
}

let lastRunKey = '';

function checkTimeAndCrawl() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${currentHour}`;

  // 사용자 지정 크롤링 시간: 오전 9시, 오후 12시, 오후 2시, 오후 4시
  const targetHours = [9, 12, 14, 16];

  if (targetHours.includes(currentHour) && currentMinute === 0) {
    if (lastRunKey !== currentDayKey) {
      lastRunKey = currentDayKey;
      runCrawler();
    }
  }
}

// 30초마다 시간을 체크하여 지정된 시각 정각에 크롤링을 동작시킵니다.
setInterval(checkTimeAndCrawl, 30 * 1000);