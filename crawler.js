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
- MZ세대 감성에 맞는 트렌디하고 유쾌한 말투 사용 (단, "자립준비청년 친구들" 같은 오글거리는 호칭은 절대 금지!)
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

// 낡은 SSL(약한 DH 키)을 쓰는 사이트(grouphome.kr 등)용 레거시 에이전트
const legacyHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  ciphers: 'DEFAULT@SECLEVEL=1',
  minVersion: 'TLSv1'
});

// grouphome.kr 전용 GET: https(레거시 TLS) → 실패 시 http 재시도
async function legacyGet(url) {
  try {
    return await axiosInstance.get(url, { httpsAgent: legacyHttpsAgent });
  } catch (e) {
    const httpUrl = url.replace(/^https:/, 'http:');
    return await axiosInstance.get(httpUrl, { httpsAgent: legacyHttpsAgent });
  }
}

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


// 3.6. 부산광역시자립지원전담기관 크롤링
async function crawlBusan() {
  console.log('--- 부산광역시자립지원전담기관 크롤링 시작 ---');
  const listUrl = 'https://www.busanjarip.or.kr/edu/sub5.php';
  const newPolicies = [];

  // 2페이지까지 순회 (목록이 페이지네이션됨)
  for (let page = 1; page <= 2; page++) {
    let pageUrl = listUrl;
    try {
      const response = await axiosInstance.get(pageUrl + (page > 1 ? `?page=${page}` : ''));
      if (response.status !== 200) {
        console.error(`부산 사이트 응답 에러: ${response.status}`);
        break;
      }

      const $ = cheerio.load(response.data);

      // 각 사업 항목 파싱: <a href="/edu/sub5_2.php?zipEncode=...">...
      $('a[href*="sub5_2.php"]').each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        if (!href.includes('zipEncode=')) return;

        const fullText = a.text().replace(/\s+/g, ' ').trim();
        if (!fullText) return;

        // 상태 추출: 접수중 | 종료 | 접수마감 등
        let statusText = '';
        let title = '';
        let dateText = '';

        // 텍스트 구조: "제목\n날짜범위\n상태"
        const parts = a.text().split('\n').map(s => s.trim()).filter(Boolean);
        title = parts[0] || '';
        // 날짜: 2026-06-10 ~ 2026-06-19 형태
        const datePart = parts.find(p => /\d{4}-\d{2}-\d{2}/.test(p));
        if (datePart) dateText = datePart.trim();
        // 상태
        const statusPart = parts.find(p => ['접수중', '종료', '접수마감', '접수예정'].includes(p.trim()));
        if (statusPart) statusText = statusPart.trim();

        // 접수중인 사업만 수집
        if (statusText !== '접수중') return;

        // 블랙리스트 필터
        const shouldSkip = BLACKLIST.some(word => title.includes(word));
        if (shouldSkip || !title) return;

        // href가 절대경로(/edu/sub5_2.php?...)이면 루트 기준으로 처리
        // href가 상대경로(sub5_2.php?...)이면 /edu/ 붙이기
        const link = href.startsWith('/') 
          ? `https://www.busanjarip.or.kr${href}`
          : `https://www.busanjarip.or.kr/edu/${href}`;

        newPolicies.push({
          title: title.startsWith('[') ? title : `[부산자립지원전담기관] ${title}`,
          category: detectCategory(title),
          type: '공공·지자체',
          provider: '부산광역시보호아동자립지원센터',
          region: '부산',
          target: '부산 거주 보호연장아동 및 자립준비청년',
          content: `부산광역시보호아동자립지원센터에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
          link: link,
          date: dateText || '상시 모집',
          status: '모집중',
          source: '부산광역시자립지원전담기관'
        });
      });
    } catch (error) {
      console.error(`부산 사이트 크롤링 오류 (페이지 ${page}):`, error.message);
      break;
    }
  }

  // 중복 링크 제거
  const unique = [];
  const seen = new Set();
  for (const p of newPolicies) {
    if (!seen.has(p.link)) {
      seen.add(p.link);
      unique.push(p);
    }
  }

  console.log(`부산 자립 공고 ${unique.length}건 수집 완료`);
  return unique;
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

// 게시판 앵커 텍스트에서 깔끔한 제목만 추출하는 공용 헬퍼
function cleanBoardTitle(rawText) {
  let t = (rawText || '').replace(/\s+/g, ' ').trim();
  // 앞쪽 글번호(순수 숫자) 제거
  t = t.replace(/^\d+\s+/, '');
  // 등록일(yyyy-mm-dd / yyyy.mm.dd) 이후는 목록 메타정보이므로 제거
  t = t.replace(/\s*\d{4}[-.]\d{2}[-.]\d{2}.*$/, '');
  // '조회 123', '작성자', 'NEW', '답변' 등 목록 꼬리표 제거
  t = t.replace(/\s*(조회\s*\d+|작성자.*|첨부파일.*|new|hot)\s*$/i, '');
  return t.trim();
}

// 6. 충남아동자립지원전담기관 크롤링 (메이크샵 rwdboard: /bbs/rwdboard/{id})
async function crawlChungnam() {
  console.log('--- 충남아동자립지원전담기관 크롤링 시작 ---');
  const BASE = 'http://www.cnjarip.co.kr';
  const listUrl = `${BASE}/bbs/rwdboard`;
  const newPolicies = [];
  const seen = new Set();

  try {
    for (let page = 1; page <= 2; page++) {
      const url = page > 1 ? `${listUrl}?page=${page}` : listUrl;
      const response = await axiosInstance.get(url);
      if (response.status !== 200) {
        console.error(`충남 사이트 응답 에러: ${response.status}`);
        break;
      }

      const $ = cheerio.load(response.data);
      $('a[href*="/bbs/rwdboard/"]').each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/\/bbs\/rwdboard\/(\d+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;

        const title = cleanBoardTitle(a.text());
        if (!title || title.length < 3) return;

        const shouldSkip = BLACKLIST.some(word => title.includes(word));
        if (shouldSkip) return;

        seen.add(id);
        const link = `${BASE}/bbs/rwdboard/${id}`;

        newPolicies.push({
          title: title.startsWith('[') ? title : `[충남아동자립지원전담기관] ${title}`,
          category: detectCategory(title),
          type: '공공·지자체',
          provider: '충남아동자립지원전담기관',
          region: '충남',
          target: '충남 거주 보호아동 및 자립준비청년',
          content: `충남아동자립지원전담기관에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
          link: link,
          date: '상시 모집',
          status: '모집중',
          source: '충남아동자립지원전담기관'
        });
      });
    }

    console.log(`충남 자립 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('충남 사이트 크롤링 오류:', error.message);
    return [];
  }
}

// 7. 인천광역시자립지원전담기관 크롤링 (그누보드: _NBoard/board.php?bo_table=info&wr_id={id})
async function crawlIncheon() {
  console.log('--- 인천광역시자립지원전담기관 크롤링 시작 ---');
  const BASE = 'https://www.injarip.or.kr';
  const listUrl = `${BASE}/_NBoard/board.php?bo_table=info`;
  const SKIP_LINK_TEXT = new Set(['이전글', '다음글', '목록', '글쓰기', '답변', '수정', '삭제']);
  const newPolicies = [];
  const seen = new Set();

  try {
    for (let page = 1; page <= 2; page++) {
      const url = `${listUrl}&page=${page}`;
      const response = await axiosInstance.get(url);
      if (response.status !== 200) {
        console.error(`인천 사이트 응답 에러: ${response.status}`);
        break;
      }

      const $ = cheerio.load(response.data);
      $('a[href*="bo_table=info"][href*="wr_id="]').each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/wr_id=(\d+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;

        const title = cleanBoardTitle(a.text());
        if (!title || title.length < 5 || SKIP_LINK_TEXT.has(title)) return;

        const shouldSkip = BLACKLIST.some(word => title.includes(word));
        if (shouldSkip) return;

        seen.add(id);
        const link = `${BASE}/_NBoard/board.php?bo_table=info&wr_id=${id}`;

        newPolicies.push({
          title: title.startsWith('[') ? title : `[인천광역시자립지원전담기관] ${title}`,
          category: detectCategory(title),
          type: '공공·지자체',
          provider: '인천광역시자립지원전담기관',
          region: '인천',
          target: '인천 거주 보호아동 및 자립준비청년',
          content: `인천광역시자립지원전담기관에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
          link: link,
          date: '상시 모집',
          status: '모집중',
          source: '인천광역시자립지원전담기관'
        });
      });
    }

    console.log(`인천 자립 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('인천 사이트 크롤링 오류:', error.message);
    return [];
  }
}

// 8. 전라북도자립지원전담기관 크롤링 (굿네이버스 CMS: /board/{code}/info/{id})
async function crawlJeonbuk() {
  console.log('--- 전라북도자립지원전담기관 크롤링 시작 ---');
  const BASE = 'https://jbjarip.goodneighbors.kr';
  // 공지사항 / 자립정책 및 정보 / 청년채용정보 게시판
  const boards = [
    `${BASE}/gnjbjarip/board/cd103101100/default`,
    `${BASE}/gnjbjarip/board/cd104102100/default`,
    `${BASE}/gnjbjarip/board/cd104103100/default`,
  ];
  const newPolicies = [];
  const seen = new Set();

  try {
    for (const boardUrl of boards) {
      const response = await axiosInstance.get(boardUrl);
      if (response.status !== 200) {
        console.error(`전북 사이트 응답 에러(${boardUrl}): ${response.status}`);
        continue;
      }

      const $ = cheerio.load(response.data);
      $('a[href*="/info/"]').each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/\/board\/(cd\d+)\/info\/(\d+)/);
        if (!m) return;
        const boardCode = m[1];
        const id = m[2];
        const key = `${boardCode}-${id}`;
        if (seen.has(key)) return;

        const title = cleanBoardTitle(a.text());
        if (!title || title.length < 3) return;

        const shouldSkip = BLACKLIST.some(word => title.includes(word));
        if (shouldSkip) return;

        seen.add(key);
        const link = href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;

        newPolicies.push({
          title: title.startsWith('[') ? title : `[전라북도자립지원전담기관] ${title}`,
          category: detectCategory(title),
          type: '공공·지자체',
          provider: '전라북도자립지원전담기관',
          region: '전북',
          target: '전북 거주 보호아동 및 자립준비청년',
          content: `전라북도자립지원전담기관에서 우리 자립준비청년들을 위해 준비한 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 기관 상세 안내 페이지를 꼭 확인해 주세요.',
          link: link,
          date: '상시 모집',
          status: '모집중',
          source: '전라북도자립지원전담기관'
        });
      });
    }

    console.log(`전북 자립 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('전북 사이트 크롤링 오류:', error.message);
    return [];
  }
}

// 9. 전국아동청소년그룹홈협의회 '열린공지' 크롤링 (page_153.php?sn={번호})
async function crawlGrouphome() {
  console.log('--- 전국아동청소년그룹홈협의회(열린공지) 크롤링 시작 ---');
  const BASE = 'https://grouphome.kr';
  const listBase = `${BASE}/pages/page_153.php`;
  const newPolicies = [];
  const seen = new Set();

  try {
    for (let page = 1; page <= 3; page++) {
      const url = page > 1 ? `${listBase}?page=${page}` : listBase;
      let response;
      try {
        response = await legacyGet(url);
      } catch (e) {
        console.error(`그룹홈 요청 실패(page ${page}): ${e.message}`);
        break;
      }
      if (response.status !== 200) {
        console.error(`그룹홈 응답 에러(page ${page}): ${response.status}`);
        break;
      }

      const $ = cheerio.load(response.data);
      $('a[href*="sn="]').each((i, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        // 열린공지(page_153) 글만: sn 파라미터 추출
        const m = href.match(/[?&]sn=(\d+)/);
        if (!m) return;
        // page_153 게시판 링크가 아닌 경우 제외 (다른 게시판 sn 혼입 방지)
        if (href.includes('page_') && !href.includes('page_153')) return;
        const sn = m[1];
        if (seen.has(sn)) return;

        let title = cleanBoardTitle(a.text());
        // 페이지 타이틀 꼬리표(' - 열린공지') 제거
        title = title.replace(/\s*-\s*열린공지\s*$/, '').trim();
        if (!title || title.length < 5) return;

        // 자립준비청년(자립사업) 관련 글만 수집 (돌봄교육·이벤트 등 그 외 공지 제외)
        const JARIP_KEYWORDS = ['자립', '보호종료', '보호종결'];
        if (!JARIP_KEYWORDS.some(k => title.includes(k))) return;

        // 마감/종료 등 블랙리스트 검사 (단, '보호종료/보호종결'은 종료 status가 아니므로 예외)
        const titleForBlacklist = title.replace(/보호종료/g, '').replace(/보호종결/g, '');
        const shouldSkip = BLACKLIST.some(word => titleForBlacklist.includes(word));
        if (shouldSkip) return;

        seen.add(sn);
        const link = `${BASE}/pages/page_153.php?sn=${sn}`;

        newPolicies.push({
          title: title.startsWith('[') ? title : `[그룹홈 열린공지] ${title}`,
          category: detectCategory(title),
          type: 'NGO·복지재단',
          provider: '전국아동청소년그룹홈협의회',
          region: '전국',
          target: '보호아동·자립준비청년 (그룹홈 등)',
          content: `전국아동청소년그룹홈협의회 열린공지에 올라온 [${title}] 소식이에요! 🌸 자세한 자격 조건이나 신청 방법은 우측 하단의 '원문 바로가기' 링크를 꾹~ 눌러서 꼼꼼히 확인해봐요! 😉`,
          tip: '제출 서류 및 자격 요건이 변동될 수 있으므로, 신청 전에 원문 게시글을 꼭 확인해 주세요.',
          link: link,
          date: '상시 모집',
          status: '모집중',
          source: '그룹홈 열린공지'
        });
      });
    }

    console.log(`그룹홈 열린공지 공고 ${newPolicies.length}건 수집 완료`);
    return newPolicies;
  } catch (error) {
    console.error('그룹홈 크롤링 오류:', error.message);
    return [];
  }
}

// 5. 수집 데이터를 data.js에 업데이트하는 메인 함수
async function main() {
  try {
      // 크롤링 사이트 통합 수집 (최신 정렬 시 높은 ID가 위로 오게 하기 위해 우선순위 역순으로 추가: 스마일센터 -> 부산 -> 경기 -> 서울 -> 자립정보ON)
      const jariponData = await crawlJaripon();
      const seoulData = await crawlSeoul();
      const ggData = await crawlGyeonggi();
      const busanData = await crawlBusan();
      const smycData = await crawlSmyc();
      const incheonData = await crawlIncheon();
      const chungnamData = await crawlChungnam();
      const jeonbukData = await crawlJeonbuk();
      const grouphomeData = await crawlGrouphome();
      const scraped = [...grouphomeData, ...smycData, ...jeonbukData, ...chungnamData, ...incheonData, ...busanData, ...ggData, ...seoulData, ...jariponData];

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

    // 배열 리터럴 텍스트를 파싱 (eval 미사용: 격리된 Function 스코프에서 값만 반환)
    let existingPoliciesText = match[1].trim();
    let existingPolicies = [];
    try {
      existingPolicies = new Function(`return (${existingPoliciesText});`)();
    } catch (parseErr) {
      throw new Error(`data.js의 initialPolicies 파싱 실패: ${parseErr.message}`);
    }
    if (!Array.isArray(existingPolicies)) {
      throw new Error('data.js의 initialPolicies가 배열이 아닙니다.');
    }

    // 마감된 사업 필터링 함수
    const isExpired = (dateText) => {
      if (!dateText || dateText.includes('상시')) return false;
      const matches = dateText.match(/\\d{4}[-.]\\d{2}[-.]\\d{2}/g);
      if (!matches) return false;
      const lastDateStr = matches[matches.length - 1].replace(/\\./g, '-');
      
      const now = new Date();
      const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const todayStr = kst.toISOString().split('T')[0];
      
      return lastDateStr < todayStr;
    };

    // 기존 데이터에서 마감되거나 키워드 포함된 사업 제거
    const originalCount = existingPolicies.length;
    existingPolicies = existingPolicies.filter(p => {
      const title = p.title || '';
      const isClosedKeyword = ['모집완료', '마감', '종료'].some(word => title.includes(word));
      if (isClosedKeyword || isExpired(p.date)) return false;
      return true;
    });
    console.log(`기존 데이터 ${originalCount}건 중 마감된 사업 제외 후 ${existingPolicies.length}건 남음`);

    const allProviders = [...new Set(existingPolicies.map(p => p.provider).filter(Boolean))];

    // 제목 정규화 및 핵심 텍스트 비교 함수
    const cleanTitleForCompare = (title, provider = '') => {
      let t = title.toLowerCase();
      
      // 1. 대괄호 태그 및 괄호 내용 제거
      t = t.replace(/\[.*?\]/g, '');
      t = t.replace(/\(.*?\)/g, '');
      t = t.replace(/\{.*?\}/g, '');
      
      // 2. 해당 아이템의 provider 및 전체 provider 목록 제거
      if (provider) {
        const escapedProv = provider.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        t = t.replace(new RegExp(escapedProv, 'g'), '');
      }
      for (const p of allProviders) {
        if (p && p.length > 1) {
          const escapedP = p.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          t = t.replace(new RegExp(escapedP, 'g'), '');
        }
      }
      
      // 3. 기수, 연도, 월 패턴 제거 (상이한 연도/월/기수의 사업은 별개 사업이므로 비교 문자열에 남김)
      // t = t.replace(/\d+기/g, '');
      // t = t.replace(/\d+년/g, '');
      // t = t.replace(/\d+월/g, '');
      
      // 4. 공백 제거
      t = t.replace(/\s+/g, '');
      
      // 5. 불용어 제거 (공백 없는 텍스트 기준)
      const stopWords = [
        '참여자모집', '참가자모집', '교육생모집', '훈련생모집', '인턴모집', '회원모집',
        '참여자', '참가자', '모집안내', '모집공고', '모집', '신청안내', '신청',
        '지원사업', '지원금', '지원', '프로그램', '교실', '교육', '특강', '체험',
        '행사', '안내', '일정', '사업', '상반기', '하반기', '여름방학', '겨울방학',
        '클래스', '아카데미', '캠프', '프로젝트', '페스티벌', '콘서트', '자립'
      ];
      
      for (const word of stopWords) {
        t = t.replace(new RegExp(word, 'g'), '');
      }
      
      // 특수문자 제거
      t = t.replace(/[^a-zA-Z0-9가-힣]/g, '');
      
      return t;
    };

    // 교차 소스 중복 판별
    const isSimilarTitle = (p1, p2) => {
      // 동일 제공기관(provider)의 다른 사업인 경우 중복으로 보지 않음 (다른 공고임)
      if (p1.provider && p2.provider && p1.provider === p2.provider) return false;

      const c1 = cleanTitleForCompare(p1.title, p1.provider);
      const c2 = cleanTitleForCompare(p2.title, p2.provider);
      
      // 정규화된 텍스트가 완전히 같으면 중복
      if (c1 && c2 && c1 === c2) return true;
      
      // 두 텍스트 모두 충분히 길고(8글자 이상) 길이 차이가 적을 때(3글자 이하)만 포함 관계 인정
      if (c1 && c2 && Math.min(c1.length, c2.length) >= 8) {
        const lenDiff = Math.abs(c1.length - c2.length);
        if (lenDiff <= 3 && (c1.includes(c2) || c2.includes(c1))) {
          return true;
        }
      }
      
      return false;
    };

    // 중복 제거 및 신규 데이터 추가
    let addedCount = 0;
    let skippedDuplicates = 0;
    let nextId = Math.max(...existingPolicies.map(p => typeof p.id === 'number' ? p.id : 0), 600) + 1;

    for (const newItem of scraped) {
      if (['모집완료', '마감', '종료'].some(word => (newItem.title || '').includes(word)) || isExpired(newItem.date)) {
        continue;
      }

      // zipEncode 파라미터 추출 함수 (부산 사이트 중복 정규화)
      const extractZipEncode = (url) => {
        try { return new URL(url).searchParams.get('zipEncode') || ''; } catch { return ''; }
      };
      const newZip = extractZipEncode(newItem.link);

      // 제목, 링크, 또는 교차 소스 유사도 기반 중복 판별
      const isDuplicate = existingPolicies.some(p => {
        if (p.title === newItem.title) return true;
        if (p.link === newItem.link) return true;
        // zipEncode 파라미터 값이 같으면 동일 사업 (부산 링크 경로 오류 대응)
        if (newZip && newZip === extractZipEncode(p.link)) return true;
        // 교차 소스 중복: 제목 유사도 기반 판별
        if (isSimilarTitle(p, newItem)) return true;
        return false;
      });
      if (isDuplicate) {
        skippedDuplicates++;
      } else {
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

    // 기관/출처 우선순위 가중치 산출 함수
    const getSourcePriorityRank = (p) => {
      const src = (p.source || '').toLowerCase();
      const prov = (p.provider || '').toLowerCase();
      const reg = (p.region || '').toLowerCase();
      const combined = `${src} ${prov} ${reg} ${(p.title || '').toLowerCase()}`;

      // 1순위: 자립정보온 (자립정보ON / 아동권리보장원)
      if (src.includes('자립정보on') || src.includes('자립정보온') || combined.includes('자립정보on') || combined.includes('아동권리보장원')) {
        return 1;
      }
      // 2순위: 서울 전담기관 (서울자립지원전담기관 / 서울광역청년센터 / 서울)
      if (combined.includes('서울') && (combined.includes('전담기관') || combined.includes('지원센터') || combined.includes('광역청년센터') || src.includes('서울'))) {
        return 2;
      }
      // 3순위: 경기 전담기관 (경기도자립지원전담기관 / 경기)
      if (combined.includes('경기') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('경기'))) {
        return 3;
      }
      // 4순위: 부산 전담기관 (부산광역시자립지원전담기관 / 부산)
      if (combined.includes('부산') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('부산'))) {
        return 4;
      }
      // 5순위: 인천 전담기관
      if (combined.includes('인천') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('인천'))) {
        return 5;
      }
      // 6순위: 충남 전담기관
      if (combined.includes('충남') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('충남'))) {
        return 6;
      }
      // 7순위: 전북 전담기관
      if ((combined.includes('전북') || combined.includes('전라북도')) && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('전북'))) {
        return 7;
      }
      // 8순위: 경북 전담기관
      if ((combined.includes('경북') || combined.includes('경상북도')) && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('경북'))) {
        return 8;
      }

      // 기타 기관
      return 10;
    };

    // 정렬 (1. 기관 우선순위: 자립정보온 -> 서울 -> 경기 -> 부산 -> 기타, 2. ID 순)
    existingPolicies.sort((a, b) => {
      const rankA = getSourcePriorityRank(a);
      const rankB = getSourcePriorityRank(b);
      if (rankA !== rankB) return rankA - rankB;
      return (a.id || 0) - (b.id || 0);
    });

    // 크롤링 반영 일자(KST) 계산
    const _kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const _todayDash = _kstNow.toISOString().split('T')[0];   // YYYY-MM-DD
    const _todayDot = _todayDash.replace(/-/g, '.');          // YYYY.MM.DD

    // data.js 버전 올리기 (날짜=오늘로 현행화 + 번호 증가 → 캐시 무효화)
    const verRegex = /window\.initialDataVersion\s*=\s*["']v\d{4}\.\d{2}\.\d{2}_v(\d+)["']/m;
    const verMatch = dataContent.match(verRegex);
    let newVersionStr = '';
    if (verMatch) {
      const nextNum = parseInt(verMatch[1], 10) + 1;
      newVersionStr = `v${_todayDot}_v${nextNum}`;
      dataContent = dataContent.replace(verRegex, `window.initialDataVersion = "${newVersionStr}"`);
    }

    // 최종 업데이트 일자 기록 (UI 노출용) — 있으면 갱신, 없으면 버전 줄 뒤에 삽입
    if (/window\.lastUpdated\s*=/.test(dataContent)) {
      dataContent = dataContent.replace(/window\.lastUpdated\s*=\s*["'][^"']*["'];?/, `window.lastUpdated = "${_todayDash}";`);
    } else {
      dataContent = dataContent.replace(/(window\.initialDataVersion\s*=\s*"[^"]*";)/, `$1\nwindow.lastUpdated = "${_todayDash}";`);
    }

    // 헤더 주석의 '마지막 크롤링 일시' 현행화
    dataContent = dataContent.replace(/\/\/ 마지막 크롤링 일시: \d{4}-\d{2}-\d{2}/, `// 마지막 크롤링 일시: ${_todayDash}`);

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



