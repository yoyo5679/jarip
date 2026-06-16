const fs = require('fs');

// .env 파일 직접 파싱 (dotenv 패키지 불필요)
const envPath = require('path').join(__dirname, '.env');
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

// Gemini API로 content 친근하게 재작성
async function rewriteWithGemini(policy) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('  [Gemini] API 키 없음 - 기본 content 사용');
    return policy.content;
  }
  const prompt = `당신은 보호종료아동(자립준비청년)을 위한 복지 정보를 친근하게 전달하는 글쓰기 전문가입니다.
아래 지원사업 정보를 바탕으로, 자립준비청년들이 쉽게 이해할 수 있도록 친근하고 따뜻한 말투로 2~4문장의 소개글을 작성해 주세요.

규칙:
- 이모지 2~3개 포함
- "자립준비청년 친구들", "우리" 같은 친근한 표현 사용
- 어렵거나 딱딱한 행정 용어 대신 쉬운 말 사용
- 사업명, 기관명, 지역, 모집 기간 등 핵심 정보 포함
- 마지막 문장은 "자세한 내용은 원문 링크를 꼭 확인해봐요! 😊" 로 마무리

지원사업 정보:
- 제목: ${policy.title}
- 기관: ${policy.provider}
- 지역: ${policy.region}
- 대상: ${policy.target}
- 기간: ${policy.date}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const resp = await axiosInstance.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } }
    }, { headers: { 'Content-Type': 'application/json' } });

    // 할당량 초과 (429) 또는 기타 오류 응답
    if (resp.status === 429) {
      console.warn('  [Gemini] 일일 할당량 초과 - 기본 content 사용 (내일 자동 리셋)');
      return policy.content;
    }
    if (resp.status !== 200) {
      console.warn(`  [Gemini] HTTP ${resp.status} 오류 - 기본 content 사용`);
      return policy.content;
    }

    const candidate = resp.data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    // Gemini 2.5 Flash는 thinking 파트(thought:true)가 parts[0]에 들어옴
    const parts = candidate?.content?.parts || [];
    const textPart = parts.find(pt => !pt.thought && pt.text);
    if (textPart) {
      return textPart.text.trim();
    }
    console.warn(`  [Gemini] 응답 파싱 실패 (finishReason: ${finishReason || 'unknown'}) - 기본 content 사용`);
    return policy.content;
  } catch (err) {
    console.warn('  [Gemini] API 오류 - 기본 content 사용:', err.message);
    return policy.content;
  }
}
const path = require('path');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');

// SSL 인증서 경고 무시 (일부 공공기관 사이트 대응)
const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  validateStatus: () => true
});

// 파일 경로 설정
const DATA_FILE = path.join(__dirname, 'data.js');
const APP_FILE = path.join(__dirname, 'app.js');

// 제외할 행정/기타 키워드 목록 (공지사항 필터용 및 마감사업 제외)
const BLACKLIST = [
  '의무교육', '결산', '공시', '수의계약', '집행내역', '양식',
  '이수증', '안내 및 서식', '발급 안내', '후원신청서', '연간일정',
  '입찰', '운영비', '모집완료', '마감', '종료'
];

// 1. 카테고리 판별 도우미 함수
function detectCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('취업') || t.includes('인턴') || t.includes('일자리') || t.includes('직무') || t.includes('진로') || t.includes('채용')) {
    return 'job';
  }
  if (t.includes('주거') || t.includes('임대') || t.includes('주택') || t.includes('체험관') || t.includes('체험홈') || t.includes('입주')) {
    return 'housing';
  }
  if (t.includes('금융') || t.includes('경제') || t.includes('통장') || t.includes('자산') || t.includes('장학') || t.includes('지원금') || t.includes('수당')) {
    return 'economic';
  }
  if (t.includes('교육') || t.includes('학습') || t.includes('아카데미') || t.includes('강좌') || t.includes('클래스')) {
    return 'education';
  }
  return 'life'; // 기본값 (생활/의료/기타)
}

// 2. 경기도자립지원전담기관 크롤링
async function crawlGyeonggi() {
  console.log('--- 경기도자립지원전담기관 크롤링 시작 ---');
  const listUrl = 'https://www.ggjarip.or.kr/community_01.html?actobj=notice&bbs_code=notice';
  const newPolicies = [];

  try {
    const response = await axiosInstance.get(listUrl);
    if (response.status !== 200) {
      console.error(`경기도 사이트 응답 에러: ${response.status}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const links = $('a[href^="javascript:notice_view"]');

    links.each((i, el) => {
      const titleEl = $(el);
      const href = titleEl.attr('href') || '';
      const match = href.match(/notice_view\('([^']+)'\)/);
      if (!match) return;

      const key = match[1];
      const link = `https://www.ggjarip.or.kr/community_01.html?actobj=notice&acttype=VIEWINFO&bbs_code=notice&bbs_key=${key}`;

      const fullText = titleEl.text().trim();
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean).filter(line => !/^\d+$/.test(line));
      const title = lines[0] || '';

      // 날짜 추출
      let dateText = '';
      for (const line of lines) {
        if (/\d{4}\.\d{2}\.\d{2}/.test(line)) {
          dateText = line.replace(/\./g, '-');
          break;
        }
      }

      const shouldSkip = BLACKLIST.some(word => title.includes(word));
      if (shouldSkip || !title) {
        return;
      }

      newPolicies.push({
        title: title.startsWith('[') ? title : `[경기도자립지원전담기관] ${title}`,
        category: detectCategory(title),
        type: '공공·지자체',
        provider: '경기도자립지원전담기관',
        region: '경기',
        target: '경기도 거주 보호아동 및 자립준비청년',
        content: `경기도자립지원전담기관에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
        tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
        link: link,
        date: dateText ? `${dateText} ~ 모집 시까지` : '상시 모집',
        status: '모집중',
        source: '경기도자립지원전담기관'
      });
    });

    console.log(`경기도 자립 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('경기도 사이트 크롤링 오류:', error.message);
    return [];
  }
}

// 3. 서울자립지원전담기관 크롤링
async function crawlSeoul() {
  console.log('--- 서울자립지원전담기관 크롤링 시작 ---');
  const listUrl = 'https://www.sjarip.or.kr/home/kor/support/cmmn/index.do?menuPos=10';
  const newPolicies = [];

  try {
    const response = await axiosInstance.get(listUrl);
    if (response.status !== 200) {
      console.error(`서울 사이트 응답 에러: ${response.status}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const listItems = $('.board-list-wrap ul li, .board-list ul li, li');

    listItems.each((i, el) => {
      const item = $(el);
      const titleEl = item.find('.list_tit');
      if (titleEl.length === 0) return;

      const title = titleEl.text().trim();
      
      // 자세히보기 버튼이나 이미지 a태그에서 onclick fn_view 추출
      const viewBtn = item.find('a[onclick^="fn_view"]');
      if (viewBtn.length === 0) return;

      const onclick = viewBtn.attr('onclick') || '';
      const match = onclick.match(/fn_view\('(\d+)'\)/);
      if (!match) return;

      const id = match[1];
      const link = `https://www.sjarip.or.kr/home/kor/support/cmmn/view.do?menuPos=10&idx2=${id}`;

      // 접수기간(date) 추출
      let dateText = '';
      const listData = item.find('.list_data li');
      listData.each((j, dataLi) => {
        const txt = $(dataLi).text();
        if (txt.includes('접수기간')) {
          dateText = $(dataLi).find('.data_con').text().replace(/\s+/g, ' ').trim();
        }
      });

      const shouldSkip = BLACKLIST.some(word => title.includes(word));
      if (shouldSkip || !title) {
        return;
      }

      newPolicies.push({
        title: title.startsWith('[') ? title : `[서울자립지원전담기관] ${title}`,
        category: detectCategory(title),
        type: '공공·지자체',
        provider: '서울자립지원전담기관',
        region: '서울',
        target: '서울시 거주 보호아동 및 자립준비청년',
        content: `서울자립지원전담기관에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
        tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
        link: link,
        date: dateText || '상시 모집',
        status: '모집중',
        source: '서울자립지원전담기관'
      });
    });

    // 중복 제거 (li가 다중으로 매칭될 수 있으므로 제목 기준으로 중복 제거)
    const uniquePolicies = [];
    const seen = new Set();
    for (const p of newPolicies) {
      if (!seen.has(p.link)) {
        seen.add(p.link);
        uniquePolicies.push(p);
      }
    }

    console.log(`서울 자립 공고 ${uniquePolicies.length}건 수집 완료`);
    return uniquePolicies;
  } catch (error) {
    console.error('서울 사이트 크롤링 오류:', error.message);
    return [];
  }
}

// 3.5. 자립정보ON 크롤링
async function crawlJaripon() {
  console.log('--- 자립정보ON 크롤링 시작 ---');
  const listUrl = 'https://jaripon.ncrc.or.kr/home/kor/support/projectMng/index.do?menuPos=1';
  const newPolicies = [];

  try {
    const response = await axiosInstance.get(listUrl);
    if (response.status !== 200) {
      console.error(`자립정보ON 응답 에러: ${response.status}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const links = $('a[onclick^="fn_edit"]');

    links.each((i, el) => {
      const item = $(el);
      const onclick = item.attr('onclick') || '';
      const idxMatch = onclick.match(/fn_edit\('(\d+)'\)/);
      if (!idxMatch) return;
      const idx = idxMatch[1];
      const link = `https://jaripon.ncrc.or.kr/home/kor/support/projectMng/edit.do?idx=${idx}&menuPos=1`;

      const title = item.find('.tit').text().trim();
      
      // 모집상태 및 카테고리 추출
      let statusText = '모집중';
      let cateText = '';
      item.find('.left_cate .cate').each((j, cateEl) => {
        const text = $(cateEl).text().trim();
        if (['모집중', '모집예정', '마감', '모집완료', '종료', '상시모집'].includes(text)) {
          statusText = text;
        } else {
          cateText = text;
        }
      });

      // 마감/종료된 사업 필터링
      const isClosed = ['모집완료', '마감', '종료'].some(word => title.includes(word) || statusText.includes(word));
      const shouldSkip = BLACKLIST.some(word => title.includes(word));
      if (isClosed || shouldSkip || !title) {
        return;
      }

      // txt_area 상세 정보 파싱
      let provider = '자립정보ON';
      let region = '전국';
      let dateText = '상시 모집';

      item.find('.txt_area .txt').each((j, txtEl) => {
        const label = $(txtEl).find('.ft_c').text().replace(/\s+/g, '').trim();
        const value = $(txtEl).find('.cont_inner').text().replace(/\s+/g, ' ').trim();
        if (label.includes('기관명')) {
          provider = value;
        } else if (label.includes('모집지역')) {
          region = value;
        } else if (label.includes('모집기간')) {
          dateText = value;
        }
      });

      newPolicies.push({
        title: title.startsWith('[') ? title : `[자립정보ON] ${title}`,
        category: detectCategory(title),
        type: '공공·지자체',
        provider: provider,
        region: region,
        target: '자립준비청년 대상',
        content: `${provider}에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
        tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 상세 페이지를 꼭 확인해 주세요.',
        link: link,
        date: dateText || '상시 모집',
        status: statusText || '모집중',
        source: '자립정보ON'
      });
    });

    console.log(`자립정보ON 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('자립정보ON 크롤링 오류:', error.message);
    return [];
  }
}


// 4. 서울광역청년센터 크롤링 (자립준비청년 키워드 포함 글만)
async function crawlSmyc() {
  console.log('--- 서울광역청년센터(SMYC) 크롤링 시작 ---');
  const BASE = 'https://www.smyc.kr';
  const KEYWORD_ENC = '%EC%9E%90%EB%A6%BD%EC%A4%80%EB%B9%84%EC%B2%AD%EB%85%84'; // 자립준비청년
  const Q = 'YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9';
  const CLOSED_BADGES = new Set(['종료', '마감', '모집완료']);
  const newPolicies = [];

  try {
    // 키워드 검색 결과를 최대 5페이지까지 수집 (같은 페이지 반복 시 조기 종료)
    let prevPageKey = '';
    for (let page = 1; page <= 5; page++) {
      const url = `${BASE}/program/?q=${Q}&keyword=${KEYWORD_ENC}&t=board&page=${page}`;
      const res = await axiosInstance.get(url);
      if (res.status !== 200) break;

      const $ = cheerio.load(res.data);
      const cards = $('a.post_link_wrap');
      if (cards.length === 0) break;

      // idx 기준으로 중복 페이지 감지 (q 파라미터가 페이지마다 달라지는 imweb 특성 대응)
      const pageKey = cards.map((i, el) => {
        const m = ($(el).attr('href') || '').match(/idx=(\d+)/);
        return m ? m[1] : '';
      }).get().join(',');
      if (pageKey === prevPageKey) break;
      prevPageKey = pageKey;

      cards.each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const idxMatch = href.match(/idx=(\d+)/);
        if (!idxMatch) return;

        const cardEl = a.closest('.card');
        const fullText = cardEl.text().replace(/\s+/g, ' ').trim();

        // 제목·상태·날짜 추출: "공지 [상태] [제목] 0 0 [날짜] 조회 [숫자]"
        const m = fullText.match(/^공지\s+(\S+)\s+(.+?)\s+\d+\s+\d+\s+(\d{4}-\d{2}-\d{2}|[\d]+[시간일분]+전)\s+조회\s+\d+/);
        if (!m) return;

        const badge = m[1].trim();   // 모집, 종료, 소개 …
        const title = m[2].trim();
        const rawDate = m[3];

        // 종료/마감/모집완료 제외
        if (CLOSED_BADGES.has(badge)) return;

        const shouldSkip = BLACKLIST.some(word => title.includes(word));
        if (shouldSkip) return;

        // 날짜 정리: "2026-05-22" → "~2026.05.22", "23시간전" → "상시 모집"
        const dateText = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
          ? `~ ${rawDate.replace(/-/g, '.')}`
          : '상시 모집';

        const link = `${BASE}/program/?q=${Q}&bmode=view&idx=${idxMatch[1]}&t=board`;

        newPolicies.push({
          title: `[서울광역청년센터] ${title}`,
          category: detectCategory(title),
          type: '공공·지자체',
          provider: '서울광역청년센터',
          region: '서울',
          target: '자립준비청년 (서울 거주 청년 우선)',
          content: `서울광역청년센터에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '신청 전 공식 페이지에서 대상 자격·제출 서류를 반드시 확인하세요.',
          link,
          date: dateText,
          status: badge === '모집' ? '모집중' : '상시',
          source: '서울광역청년센터'
        });
      });
    }

    console.log(`서울광역청년센터 자립준비청년 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('서울광역청년센터 크롤링 오류:', error.message);
    return [];
  }
}

// 5. 수집 데이터를 data.js에 업데이트하는 메인 함수
async function main() {
  try {
    // 네 사이트 데이터 수집
    const ggData = await crawlGyeonggi();
    const seoulData = await crawlSeoul();
    const jariponData = await crawlJaripon();
    const smycData = await crawlSmyc();
    const scraped = [...ggData, ...seoulData, ...jariponData, ...smycData];

    if (scraped.length === 0) {
      console.log('수집된 신규 정책이 없습니다.');
      return;
    }

    // data.js 파일 읽기
    let dataContent = fs.readFileSync(DATA_FILE, 'utf8');

    // 기존 데이터 로딩 (정규식으로 window.initialPolicies 배열 부분만 추출해 파싱 시도)
    const policiesRegex = /window\.initialPolicies\s*=\s*([\s\S]*?);\s*window\.regionalCenters/m;
    const match = dataContent.match(policiesRegex);
    if (!match) {
      throw new Error('data.js 파일에서 initialPolicies 파악 실패');
    }

    // JSON 형식처럼 파싱 가능한 문자열로 가다듬기
    let existingPoliciesText = match[1].trim();
    // 안전한 파싱을 위해 임시 변수에 대입하여 실행 평가
    let existingPolicies = [];
    eval(`existingPolicies = ${existingPoliciesText}`);

    // 중복 제거 및 신규 데이터 추가
    let addedCount = 0;
    let nextId = Math.max(...existingPolicies.map(p => typeof p.id === 'number' ? p.id : 0), 600) + 1;

    for (const newItem of scraped) {
      // 제목 또는 링크가 동일하면 중복 처리
      const isDuplicate = existingPolicies.some(p => p.title === newItem.title || p.link === newItem.link);
      if (!isDuplicate) {
        newItem.id = nextId++;
        // Gemini로 content 친근하게 재작성
        console.log(`  [Gemini] "${newItem.title.slice(0, 30)}..." content 재작성 중...`);
        newItem.content = await rewriteWithGemini(newItem);
        existingPolicies.push(newItem);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      console.log('새로운 신규 공고가 없습니다. (모두 중복)');
      return;
    }

    // 정렬 (ID 오름차순 또는 원하는 대로)
    existingPolicies.sort((a, b) => a.id - b.id);

    // data.js 버전 번호 올리기 (캐시 무효화)
    const verRegex = /window\.initialDataVersion\s*=\s*["'](v\d{4}\.\d{2}\.\d{2}_v)(\d+)["']/m;
    const verMatch = dataContent.match(verRegex);
    let newVersionStr = '';
    if (verMatch) {
      const prefix = verMatch[1];
      const nextNum = parseInt(verMatch[2], 10) + 1;
      newVersionStr = `${prefix}${nextNum}`;
      dataContent = dataContent.replace(verRegex, `window.initialDataVersion = "${newVersionStr}"`);
    }

    // data.js 갱신 (정책 배열 + 버전 동시 업데이트)
    const formattedPolicies = JSON.stringify(existingPolicies, null, 2);
    const updatedContent = dataContent.replace(policiesRegex, `window.initialPolicies = ${formattedPolicies};\n\nwindow.regionalCenters`);
    fs.writeFileSync(DATA_FILE, updatedContent, 'utf8');
    console.log(`[data.js 업데이트 완료] 신규 지원사업 ${addedCount}건 추가, 버전 → ${newVersionStr}`);

  } catch (error) {
    console.error('메인 실행 오류:', error);
  }
}

main();



