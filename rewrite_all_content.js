const fs = require('fs');
const path = require('path');

// .env 로드
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) process.env[key] = val;
    }
  });
}

const axios = require('axios');
const DATA_FILE = path.join(__dirname, 'data.js');

// 요청 간격 (초당 1회 제한 방지)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rewriteContent(policy, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 없음');

  const prompt = `너는 자립준비청년(보호종료청년)들을 위한 복지 안내 서비스의 카드 설명 작성자야.
아래 지원사업 정보를 보고, 자립준비청년에게 친근하게 말 거는 2~4문장 설명을 써줘.

예시:
"전세 사기, 보증금 반환 문제… 혼자 감당하기 너무 막막했지? 😔 인천광역시자립지원전담기관에서 자립준비청년들의 LH 전세 문제를 직접 도와주는 지원사업을 운영하고 있어! 🏠 6월 21일까지니까 서두르자, 자세한 내용은 원문 링크를 꼭 확인해봐요! 😊"

규칙:
- 반말과 존댓말을 자연스럽게 섞어 쓰기 (친근하되 무례하지 않게)
- MZ세대 감성에 맞는 트렌디하고 센스있는 문장으로 시작하기 (단, "자립준비청년 친구들" 같은 오글거리는 호칭 절대 금지!)
- 기관명·사업명 언급하기
- 마감일이 있으면 언급하기 (없으면 생략)
- 마지막은 원문 링크 확인 유도로 끝내기
- 이모지 2~4개 자연스럽게 사용
- JSON이나 따옴표 없이 텍스트만 출력

지원사업 정보:
- 제목: ${policy.title}
- 기관: ${policy.provider}
- 지역: ${policy.region}
- 대상: ${policy.target}
- 기간: ${policy.date}
- 카테고리: ${policy.category}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.85 }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      if (resp.status === 429) {
        console.warn(`  [429] 할당량 초과, 10초 후 재시도 (${attempt}/${retries})`);
        await sleep(10000);
        continue;
      }

      const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();

      console.warn(`  [경고] 텍스트 없음 - 기본 content 유지`);
      return policy.content;

    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`  [429] 할당량 초과, 10초 후 재시도 (${attempt}/${retries})`);
        await sleep(10000);
        continue;
      }
      if (attempt === retries) {
        console.warn(`  [실패] ${err.message} - 기본 content 유지`);
        return policy.content;
      }
      await sleep(3000);
    }
  }
  return policy.content;
}

async function main() {
  console.log('=== 전체 사업설명 문체 일괄 변환 시작 ===\n');

  let dataContent = fs.readFileSync(DATA_FILE, 'utf8');
  const policiesRegex = /window\.initialPolicies\s*=\s*([\s\S]*?);\s*window\.regionalCenters/m;
  const match = dataContent.match(policiesRegex);
  if (!match) throw new Error('data.js에서 initialPolicies 파싱 실패');

  let policies = [];
  eval(`policies = ${match[1].trim()}`);
  console.log(`총 ${policies.length}개 정책 변환 시작...\n`);

  for (let i = 0; i < policies.length; i++) {
    const p = policies[i];
    console.log(`[${i + 1}/${policies.length}] ${p.title.slice(0, 40)}...`);
    const newContent = await rewriteContent(p);
    policies[i].content = newContent;
    console.log(`  → ${newContent.slice(0, 60)}...\n`);

    // API 호출 간격 (1초)
    if (i < policies.length - 1) await sleep(1200);
  }

  // 버전 번호 올리기
  const verRegex = /window\.initialDataVersion\s*=\s*["'](v\d{4}\.\d{2}\.\d{2}_v)(\d+)["']/m;
  const verMatch = dataContent.match(verRegex);
  let newVersionStr = '';
  if (verMatch) {
    const prefix = verMatch[1];
    const nextNum = parseInt(verMatch[2], 10) + 1;
    newVersionStr = `${prefix}${nextNum}`;
    dataContent = dataContent.replace(verRegex, `window.initialDataVersion = "${newVersionStr}"`);
  }

  const formattedPolicies = JSON.stringify(policies, null, 2);
  const updatedContent = dataContent.replace(policiesRegex, `window.initialPolicies = ${formattedPolicies};\n\nwindow.regionalCenters`);
  fs.writeFileSync(DATA_FILE, updatedContent, 'utf8');

  console.log(`\n=== 완료! 전체 ${policies.length}개 사업설명 변환 완료 ===`);
  console.log(`버전: ${newVersionStr}`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
