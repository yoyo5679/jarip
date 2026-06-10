const express = require('express');
const cors = require('cors');
const { fork } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (현재 디렉터리의 index.html, app.js 등)
app.use(express.static('.'));

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

// 서버가 시작되고 5초 뒤에 최초 1회 바로 실행하여 데이터를 최신화합니다.
setTimeout(runCrawler, 5000);

console.log(`[스케줄러 설정] 매일 09:00, 12:00, 14:00, 16:00 정각에 자동 크롤링이 진행됩니다. (최초 구동 5초 후 즉시 실행)`);

// 서버 구동
app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(` Youth Policy Proxy Server is running!`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(`========================================================`);
});
