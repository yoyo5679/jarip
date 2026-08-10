document.addEventListener("DOMContentLoaded", () => {
  // 관리자 세션 확인 (admin.html에서 로그인 시 sessionStorage에 저장됨)
  const isAdmin = sessionStorage.getItem('jarip_admin') === '1';

  // 1. 상태 관리 변수
  let policies = [];
  let localPolicies = []; // 로컬 수집 정책 리스트
  let currentCategory = "all";
  let currentRegion = "all";
  let currentType = "all"; // 기관구분 필터 상태 추가
  let currentSort = "newest"; // 정렬 상태 추가
  let searchQuery = "";
  let currentSource = "all"; // 출처 필터 상태 추가
  let editingPolicyId = null; // 수정 중인 정책 ID (null이면 새 글 등록)
  let showBookmarksOnly = false; // 즐겨찾기만 보기 토글

  // 즐겨찾기(북마크) 상태: localStorage에 정책 ID 집합 저장
  let bookmarks = new Set();
  function loadBookmarks() {
    try {
      const raw = localStorage.getItem("jarip_bookmarks");
      if (raw) bookmarks = new Set(JSON.parse(raw).map(String));
    } catch { bookmarks = new Set(); }
  }
  function saveBookmarks() {
    localStorage.setItem("jarip_bookmarks", JSON.stringify([...bookmarks]));
  }
  function isBookmarked(id) { return bookmarks.has(String(id)); }
  function toggleBookmark(id) {
    const key = String(id);
    if (bookmarks.has(key)) { bookmarks.delete(key); }
    else { bookmarks.add(key); }
    saveBookmarks();
    return bookmarks.has(key);
  }

  // 2. DOM 요소 참조
  const cardsGrid = document.getElementById("cardsGrid");
  const regionFilter = document.getElementById("regionFilter");
  const sourceFilter = document.getElementById("sourceFilter");
  const searchInput = document.getElementById("searchInput");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const themeToggleBtn = document.getElementById("themeToggle");
  const openModalBtn = document.getElementById("openModalBtn");
  
  // 모달 요소
  const policyModal = document.getElementById("policyModal");
  const modalCloseBtn = document.getElementById("modalClose");
  const policyForm = document.getElementById("policyForm");
  const modalTitle = document.getElementById("modalTitle");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnDelete = document.getElementById("btnDelete");
  
  // 입력 필드 요소
  const policyIdInput = document.getElementById("policyId");
  const titleInput = document.getElementById("policyTitle");
  const categorySelect = document.getElementById("policyCategory");
  const typeSelect = document.getElementById("policyType"); // 기관구분 필드 참조 추가
  const providerInput = document.getElementById("policyProvider");
  const regionSelect = document.getElementById("policyRegion");
  const targetInput = document.getElementById("policyTarget");
  const contentInput = document.getElementById("policyContent");
  const tipInput = document.getElementById("policyTip");
  const linkInput = document.getElementById("policyLink");
  const dateInput = document.getElementById("policyDate");

  // 통계 요소
  const statTotal = document.getElementById("statTotal");
  const statEconomic = document.getElementById("statEconomic");
  const statHousing = document.getElementById("statHousing");
  const statEducation = document.getElementById("statEducation");
  const statJob = document.getElementById("statJob");
  const statLife = document.getElementById("statLife");

  // 토스트 컨테이너
  const toastContainer = document.getElementById("toastContainer");

  // 관리자 UI 설정 (로그인 상태일 때만 상단 바 및 편집 버튼 활성화)
  function setupAdminUI() {
    if (!isAdmin) return;

    // 관리자 상단 바 동적 생성
    const bar = document.createElement('div');
    bar.id = 'adminBar';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:#4f46e5', 'color:#fff',
      'padding:0.45rem 1.25rem',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'font-size:0.82rem', 'font-weight:600',
      'box-shadow:0 2px 8px rgba(0,0,0,0.2)'
    ].join(';');
    bar.innerHTML = `
      <span>🔑 관리자 모드 활성화</span>
      <div style="display:flex;gap:0.6rem;align-items:center;">
        <button id="openModalBtn"
          style="background:#fff;color:#4f46e5;border:none;padding:0.3rem 0.9rem;
                 border-radius:6px;font-weight:700;cursor:pointer;font-size:0.8rem;">
          + 새 지원사업 등록
        </button>
        <button id="adminLogoutBtn"
          style="background:rgba(255,255,255,0.15);color:#fff;
                 border:1px solid rgba(255,255,255,0.45);padding:0.3rem 0.9rem;
                 border-radius:6px;cursor:pointer;font-size:0.8rem;">
          로그아웃
        </button>
      </div>
    `;
    document.body.prepend(bar);

    // 상단 바 높이만큼 본문 여백 추가
    document.body.style.paddingTop = '36px';

    // 새 지원사업 등록 버튼
    document.getElementById('openModalBtn').addEventListener('click', () => openModal(null));

    // 로그아웃 버튼
    document.getElementById('adminLogoutBtn').addEventListener('click', () => {
      sessionStorage.removeItem('jarip_admin');
      showToast('👋 관리자 로그아웃 되었습니다.');
      setTimeout(() => location.reload(), 800);
    });
  }

  function rebuildCombinedPolicies() {
    policies = [...localPolicies];
    populateRegionFilters();
    populateSourceFilters();
    renderPolicies();
    renderStats();
  }

  // 3-1. 초기화 함수
  function init() {
    loadBookmarks();
    setupAdminUI();
    loadPolicies();
    loadTheme();
    populateRegionFilters();
    populateSourceFilters();
    renderPolicies();
    renderStats();
    renderRegionalCenters();
    setupEventListeners();
    setupPullToRefresh();
  }

  // 4. 데이터 로드 및 저장
  function loadPolicies() {
    const saved = localStorage.getItem("jarip_policies");
    const savedVersion = localStorage.getItem("jarip_data_version");
    const currentVersion = window.initialDataVersion || "v2026.06.10_v47";
    
    let rawPolicies = [];
    if (saved && savedVersion === currentVersion) {
      rawPolicies = JSON.parse(saved);
    } else {
      // 새 버전의 크롤링 데이터로 자동 업그레이드
      rawPolicies = [...window.initialPolicies];
      localStorage.setItem("jarip_data_version", currentVersion);
    }

    // 기존 데이터에 기관구분(type) 정보 보완 로직
    localPolicies = rawPolicies.map(p => {
      if (!p.type) {
        const checkStr = (p.provider + " " + p.title + " " + (p.source || "")).toLowerCase();
        if (
          checkStr.includes("보건복지부") || 
          checkStr.includes("지자체") || 
          checkStr.includes("고용노동부") || 
          checkStr.includes("국토교통부") || 
          checkStr.includes("우체국") || 
          checkStr.includes("공단") || 
          checkStr.includes("lh") || 
          checkStr.includes("토지주택공사") || 
          checkStr.includes("한국인터넷진흥원") || 
          checkStr.includes("국가아동권리보장원") || 
          checkStr.includes("시립") || 
          checkStr.includes("도립") || 
          checkStr.includes("서울시") || 
          checkStr.includes("인천광역시") ||
          checkStr.includes("강원특별자치도") ||
          checkStr.includes("대구광역시") ||
          checkStr.includes("광주광역시") ||
          checkStr.includes("울산광역시") ||
          checkStr.includes("세종특별자치시") ||
          checkStr.includes("충청북도") ||
          checkStr.includes("충청남도") ||
          checkStr.includes("전북특별자치도") ||
          checkStr.includes("전라남도") ||
          checkStr.includes("경상북도") ||
          checkStr.includes("제주아동")
        ) {
          p.type = "공공·지자체";
        } else if (
          checkStr.includes("재단") || 
          checkStr.includes("아름다운") || 
          checkStr.includes("굿네이버스") || 
          checkStr.includes("세이브더칠드런") || 
          checkStr.includes("월드비전") || 
          checkStr.includes("초록우산") || 
          checkStr.includes("적십자") || 
          checkStr.includes("기아대책") || 
          checkStr.includes("바보의나눔") || 
          checkStr.includes("엔젤스헤이븐") || 
          checkStr.includes("야나") || 
          checkStr.includes("따뜻한 하루") || 
          checkStr.includes("해피기버") || 
          checkStr.includes("홀트") ||
          checkStr.includes("그루터기") ||
          checkStr.includes("공익사단법인") ||
          checkStr.includes("러브비욘드더오퍼니지")
        ) {
          p.type = "NGO·복지재단";
        } else if (
          checkStr.includes("삼성") || 
          checkStr.includes("현대") || 
          checkStr.includes("sk") || 
          checkStr.includes("스타벅스") || 
          checkStr.includes("bgf") || 
          checkStr.includes("gs") || 
          checkStr.includes("롯데") || 
          checkStr.includes("에쓰오일") || 
          checkStr.includes("씨티은행") || 
          checkStr.includes("포스코") || 
          checkStr.includes("하나금융") || 
          checkStr.includes("기업은행") || 
          checkStr.includes("국민은행") || 
          checkStr.includes("우리금융") || 
          checkStr.includes("신한") || 
          checkStr.includes("가스공사") || 
          checkStr.includes("핀테크") || 
          checkStr.includes("표준협회") || 
          checkStr.includes("디지털융합") || 
          checkStr.includes("사랑밭") || 
          checkStr.includes("브라더스키퍼") || 
          checkStr.includes("드림셰어링") || 
          checkStr.includes("소이프") ||
          checkStr.includes("kpmg") ||
          checkStr.includes("청년재단")
        ) {
          p.type = "기업·사회공헌";
        } else {
          p.type = "공공·지자체";
        }
      }
      return p;
    });

    rebuildCombinedPolicies();
    savePolicies();
  }

  function savePolicies() {
    localStorage.setItem("jarip_policies", JSON.stringify(localPolicies));
  }

  // 5. 테마 설정
  function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mobileBtn = document.getElementById("themeToggleMobile");
    
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.setAttribute("data-theme", "dark");
      themeToggleBtn.innerHTML = '☀️';
      if (mobileBtn) mobileBtn.innerHTML = '☀️';
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      themeToggleBtn.innerHTML = '🌙';
      if (mobileBtn) mobileBtn.innerHTML = '🌙';
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const mobileBtn = document.getElementById("themeToggleMobile");
    if (currentTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
      themeToggleBtn.innerHTML = '🌙';
      if (mobileBtn) mobileBtn.innerHTML = '🌙';
      showToast("☀️ 라이트 모드로 전환되었습니다.");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
      themeToggleBtn.innerHTML = '☀️';
      if (mobileBtn) mobileBtn.innerHTML = '☀️';
      showToast("🌙 다크 모드로 전환되었습니다.");
    }
  }

  // 기관/출처 우선순위 가중치 헬퍼 (1위: 자립정보온, 2위: 서울, 3위: 경기, 4위: 부산, 5위: 기타)
  function getSourcePriorityRank(p) {
    const src = (p.source || '').toLowerCase();
    const prov = (p.provider || '').toLowerCase();
    const reg = (p.region || '').toLowerCase();
    const combined = `${src} ${prov} ${reg} ${(p.title || '').toLowerCase()}`;

    if (src.includes('자립정보on') || src.includes('자립정보온') || combined.includes('자립정보on') || combined.includes('아동권리보장원')) {
      return 1;
    }
    if (combined.includes('서울') && (combined.includes('전담기관') || combined.includes('지원센터') || combined.includes('광역청년센터') || src.includes('서울'))) {
      return 2;
    }
    if (combined.includes('부산') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('부산'))) {
      return 3;
    }
    if (combined.includes('경기') && (combined.includes('전담기관') || combined.includes('지원센터') || src.includes('경기'))) {
      return 4;
    }

    return 10;
  }

  // 6. 필터 채우기 (데이터에 기반한 유동적 지역 목록)
  function populateRegionFilters() {
    const regionsSet = new Set(["전국"]);
    policies.forEach(p => {
      if (p.region && p.region !== "전국") {
        regionsSet.add(p.region);
      }
    });

    const regionPriority = (r) => {
      if (r === "전국") return 0;
      if (r.includes("서울")) return 1;
      if (r.includes("부산")) return 2;
      if (r.includes("경기")) return 3;
      return 10;
    };

    const sortedRegions = Array.from(regionsSet).sort((a, b) => {
      const pA = regionPriority(a);
      const pB = regionPriority(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b, 'ko');
    });

    regionFilter.innerHTML = '<option value="all">📍 전체 지역</option>';
    sortedRegions.forEach(r => {
      const option = document.createElement("option");
      option.value = r;
      option.textContent = r;
      regionFilter.appendChild(option);
    });
  }

  function populateSourceFilters() {
    const sourcesSet = new Set();
    policies.forEach(p => {
      if (p.source) sourcesSet.add(p.source);
    });

    const sourcePriority = (s) => {
      const sLower = s.toLowerCase();
      if (sLower.includes("자립정보on") || sLower.includes("자립정보온") || sLower.includes("아동권리보장원")) return 1;
      if (sLower.includes("서울")) return 2;
      if (sLower.includes("경기")) return 3;
      if (sLower.includes("부산")) return 4;
      return 10;
    };

    const sortedSources = Array.from(sourcesSet).sort((a, b) => {
      const pA = sourcePriority(a);
      const pB = sourcePriority(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b, 'ko');
    });

    sourceFilter.innerHTML = '<option value="all">🔍 전체 출처</option>';
    sortedSources.forEach(s => {
      const option = document.createElement("option");
      option.value = s;
      option.textContent = s;
      sourceFilter.appendChild(option);
    });
  }

  // 7. 대시보드 통계 계산 및 렌더링
  function renderStats() {
    statTotal.textContent = policies.length;
    
    const countCategory = (cat) => policies.filter(p => p.category === cat).length;
    
    statEconomic.textContent = countCategory("economic");
    statHousing.textContent = countCategory("housing");
    statEducation.textContent = countCategory("education");
    if (statJob) statJob.textContent = countCategory("job");
    if (statLife) statLife.textContent = countCategory("life");
  }

  // 모집 상태 배지 HTML 생성 헬퍼
  function getStatusBadge(status) {
    if (!status) return '';
    const colors = {
      '모집중': '#ef4444',
      '모집예정': '#f59e0b',
      '상시': '#10b981',
      '상시모집': '#10b981',
      '수시': '#6366f1',
      '정기': '#3b82f6'
    };
    const color = colors[status] || '#64748b';
    return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;">${escapeHTML(status)}</span>`;
  }

  // 마감일까지 남은 일수 계산 (신청기간 문자열에서 마지막 날짜를 마감일로 간주)
  function getDaysUntilDeadline(dateStr) {
    if (!dateStr) return null;
    const matches = dateStr.match(/\d{4}[-.]\d{2}[-.]\d{2}/g);
    if (!matches || matches.length === 0) return null;
    const endStr = matches[matches.length - 1].replace(/\./g, '-');
    const end = new Date(endStr + 'T23:59:59');
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = end.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // 마감 D-day 배지 HTML 생성 (임박할수록 강조)
  function getDdayBadge(dateStr) {
    const days = getDaysUntilDeadline(dateStr);
    if (days === null) return '';
    if (days < 0) {
      return `<span class="dday-badge dday-closed" aria-label="접수 마감됨">마감</span>`;
    }
    let cls = 'dday-far';
    if (days <= 3) cls = 'dday-urgent';
    else if (days <= 7) cls = 'dday-soon';
    const label = days === 0 ? 'D-DAY' : `D-${days}`;
    return `<span class="dday-badge ${cls}" aria-label="마감 ${days === 0 ? '오늘' : days + '일 남음'}">${label}</span>`;
  }

  // 8. 카테고리 한글 변환 헬퍼
  function getCategoryLabel(cat) {
    const mapping = {
      economic: "금융·경제",
      housing: "주거지원",
      education: "교육·장학",
      job: "취업·진로",
      life: "생활·의료"
    };
    return mapping[cat] || "기타";
  }

  // 기관 구분 한글 클래스 헬퍼
  function getTypeClass(type) {
    if (type === "공공·지자체") return "public";
    if (type === "NGO·복지재단") return "ngo";
    if (type === "기업·사회공헌") return "corp";
    return "public";
  }

  // 9. 정책 목록 렌더링
  function renderPolicies() {
    cardsGrid.innerHTML = "";

    // 필터링 적용
    const filtered = policies.filter(p => {
      const matchCategory = currentCategory === "all" || p.category === currentCategory;
      const matchRegion = currentRegion === "all" || p.region === currentRegion || p.region === "전국";
      const matchType = currentType === "all" || p.type === currentType;
      const matchSource = currentSource === "all" || p.source === currentSource;
      const matchBookmark = !showBookmarksOnly || isBookmarked(p.id);

      const searchLower = searchQuery.toLowerCase();
      const matchSearch = searchQuery === "" || 
        p.title.toLowerCase().includes(searchLower) ||
        p.provider.toLowerCase().includes(searchLower) ||
        p.content.toLowerCase().includes(searchLower) ||
        (p.tip && p.tip.toLowerCase().includes(searchLower));

      return matchCategory && matchRegion && matchSearch && matchType && matchSource && matchBookmark;
    });

    // 정렬 로직 (기관 우선순위: 자립정보온 -> 서울 -> 경기 -> 부산 -> 기타 적용 후 정렬)
    filtered.sort((a, b) => {
      const rankA = getSourcePriorityRank(a);
      const rankB = getSourcePriorityRank(b);
      if (rankA !== rankB) return rankA - rankB;

      if (currentSort === "newest") {
        if (typeof a.id === 'number' && typeof b.id === 'number') {
          return b.id - a.id;
        }
        return String(b.id).localeCompare(String(a.id));
      } else if (currentSort === "closing_soon") {
        // 모집중 우선
        const aStatus = a.status === "모집중" ? 1 : 0;
        const bStatus = b.status === "모집중" ? 1 : 0;
        if (aStatus !== bStatus) return bStatus - aStatus;
        
        // 마감일 기준 오름차순 (가장 빠른 마감일이 먼저)
        const extractDate = (dateStr) => {
          if (!dateStr) return "9999-12-31";
          const match = dateStr.match(/\d{4}[-\.]\d{2}[-\.]\d{2}/g);
          if (match && match.length > 0) return match[match.length - 1]; // ~ 끝나는 날짜
          return "9999-12-31";
        };
        const aDate = extractDate(a.date);
        const bDate = extractDate(b.date);
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        if (typeof a.id === 'number' && typeof b.id === 'number') {
          return b.id - a.id;
        }
        return String(b.id).localeCompare(String(a.id));
      }
      return 0;
    });

    if (filtered.length === 0) {
      cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--color-text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <p style="font-weight: 500;">검색 결과 및 조건에 맞는 지원 사업이 없습니다.</p>
          <p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--color-text-light);">다른 키워드를 검색하거나 필터를 해제해 보세요.</p>
        </div>
      `;
      return;
    }

    // 카드 렌더링
    filtered.forEach(p => {
      const card = document.createElement("div");
      card.className = "policy-card";
      
      card.innerHTML = `
        <div class="card-top">
          <span class="badge ${p.category}">${getCategoryLabel(p.category)}</span>
          <div style="display:flex;gap:0.4rem;align-items:center;">
            ${getDdayBadge(p.date)}
            ${getStatusBadge(p.status)}
            <span class="card-region">${escapeHTML(p.region)}</span>
            <button class="btn-bookmark${isBookmarked(p.id) ? ' marked' : ''}" data-id="${escapeHTML(String(p.id))}"
              aria-pressed="${isBookmarked(p.id)}"
              aria-label="${isBookmarked(p.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}"
              title="${isBookmarked(p.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${isBookmarked(p.id) ? '⭐' : '☆'}</button>
          </div>
        </div>
        <h4 class="card-title">${escapeHTML(p.title)}</h4>
        <div class="card-metadata">
          <div class="meta-row">
            <span class="label">기관구분</span>
            <span class="value font-semibold type-${getTypeClass(p.type)}">${escapeHTML(p.type || "공공·지자체")}</span>
          </div>
          <div class="meta-row">
            <span class="label">지원주체</span>
            <span class="value">${escapeHTML(p.provider)}</span>
          </div>
          <div class="meta-row">
            <span class="label">지원대상</span>
            <span class="value">${escapeHTML(p.target)}</span>
          </div>
          <div class="meta-row">
            <span class="label">신청기간</span>
            <span class="value" style="font-weight: 600; color: var(--color-primary);">${escapeHTML(p.date)}</span>
          </div>
          ${p.source ? `<div class="meta-row">
            <span class="label">출처</span>
            <span class="value" style="font-size:0.75rem;color:var(--color-text-light);">${escapeHTML(p.source)}</span>
          </div>` : ''}
        </div>
        <p class="card-desc">${escapeHTML(p.content)}</p>
        ${p.tip ? `<div class="card-tip">💡 <b>전담요원 꿀팁:</b> ${escapeHTML(p.tip)}</div>` : ''}
        <div class="card-actions">
          <a href="${safeUrl(p.link)}" target="_blank" rel="noopener noreferrer" class="btn-card link">
            <span>원문 바로가기</span> 🔗
          </a>
          ${!isAdmin ? `<button class="btn-card web-share" data-id="${escapeHTML(String(p.id))}"><span>공유하기</span> 📤</button>` : ''}
          ${isAdmin ? `<button class="btn-card share" data-id="${escapeHTML(String(p.id))}"><span>공유 정보 복사</span> 💬</button>` : ''}
          ${isAdmin ? `<button class="btn-card edit" data-id="${escapeHTML(String(p.id))}" title="정책 수정/삭제">⚙️</button>` : ''}
        </div>
      `;

      // 일반 방문자: 카드 클릭 시 상세 모달
      if (!isAdmin) {
        card.style.cursor = 'pointer';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${p.title} 상세 정보 보기`);
        const openIfNotControl = (e) => {
          if (!e.target.closest('a') && !e.target.closest('.copy-link') &&
              !e.target.closest('.web-share') && !e.target.closest('.btn-bookmark')) {
            openDetailModal(p.id);
          }
        };
        card.addEventListener('click', openIfNotControl);
        card.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
            e.preventDefault();
            openDetailModal(p.id);
          }
        });
      }

      cardsGrid.appendChild(card);
    });

    // 이벤트 리스너 재바인딩
    document.querySelectorAll(".btn-card.copy-link").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const link = e.currentTarget.getAttribute("data-link");
        navigator.clipboard.writeText(link).then(() => {
          showToast("📋 링크 주소가 복사되었습니다!");
        }).catch(() => {
          showToast("⚠️ 복사에 실패했습니다.");
        });
      });
    });

    // 즐겨찾기 토글 버튼
    document.querySelectorAll(".btn-bookmark").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rawId = e.currentTarget.getAttribute("data-id");
        const id = /^\d+$/.test(rawId) ? parseInt(rawId) : rawId;
        const nowMarked = toggleBookmark(id);
        showToast(nowMarked ? "⭐ 즐겨찾기에 추가했어요!" : "☆ 즐겨찾기에서 뺐어요.");
        // 즐겨찾기 전용 보기 중이면 목록을 다시 그려 즉시 반영
        if (showBookmarksOnly) {
          renderPolicies();
        } else {
          const b = e.currentTarget;
          b.textContent = nowMarked ? '⭐' : '☆';
          b.classList.toggle('marked', nowMarked);
          b.setAttribute('aria-pressed', String(nowMarked));
          b.setAttribute('aria-label', nowMarked ? '즐겨찾기 해제' : '즐겨찾기 추가');
          b.setAttribute('title', nowMarked ? '즐겨찾기 해제' : '즐겨찾기 추가');
        }
      });
    });

    // 공유하기 버튼 (Web Share API 우선, 미지원 시 클립보드 폴백)
    document.querySelectorAll(".btn-card.web-share").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rawId = e.currentTarget.getAttribute("data-id");
        const id = /^\d+$/.test(rawId) ? parseInt(rawId) : rawId;
        webSharePolicy(id);
      });
    });

    document.querySelectorAll(".btn-card.share").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rawId = e.currentTarget.getAttribute("data-id");
        const id = /^\d+$/.test(rawId) ? parseInt(rawId) : rawId;
        sharePolicy(id);
      });
    });

    document.querySelectorAll(".btn-card.edit").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rawId = e.currentTarget.getAttribute("data-id");
        const id = /^\d+$/.test(rawId) ? parseInt(rawId) : rawId;
        openModal(id);
      });
    });
  }

  // 10-1. 읽기 전용 상세 모달
  function openDetailModal(id) {
    const p = policies.find(x => String(x.id) === String(id));
    if (!p) return;

    let modal = document.getElementById('detailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'detailModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:8000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);padding:1rem;';
      modal.innerHTML = `
        <div id="detailModalBox" style="background:var(--bg-modal);border-radius:18px;max-width:580px;width:100%;max-height:88vh;overflow-y:auto;padding:2rem;position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.25);color:var(--color-text-main);">
          <button id="detailModalClose" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--color-text-main);opacity:0.6;">✕</button>
          <div id="detailModalContent"></div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById('detailModalClose').addEventListener('click', () => { modal.style.display = 'none'; });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    const content = document.getElementById('detailModalContent');
    content.innerHTML = `
      <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;">
        <span class="badge ${p.category}">${getCategoryLabel(p.category)}</span>
        ${getDdayBadge(p.date)}
        ${getStatusBadge(p.status)}
        <span class="card-region">${escapeHTML(p.region)}</span>
      </div>
      <h3 style="margin:0 0 1.25rem;font-size:1.15rem;line-height:1.5;color:var(--color-text);">${escapeHTML(p.title)}</h3>
      <div class="card-metadata" style="margin-bottom:1rem;">
        <div class="meta-row"><span class="label">기관구분</span><span class="value font-semibold type-${getTypeClass(p.type)}">${escapeHTML(p.type || '공공·지자체')}</span></div>
        <div class="meta-row"><span class="label">지원주체</span><span class="value">${escapeHTML(p.provider)}</span></div>
        <div class="meta-row"><span class="label">지원대상</span><span class="value">${escapeHTML(p.target)}</span></div>
        <div class="meta-row"><span class="label">신청기간</span><span class="value" style="font-weight:600;color:var(--color-primary);">${escapeHTML(p.date)}</span></div>
        ${p.source ? `<div class="meta-row"><span class="label">출처</span><span class="value" style="font-size:0.78rem;color:var(--color-text-light);">${escapeHTML(p.source)}</span></div>` : ''}
      </div>
      <p style="font-size:0.88rem;line-height:1.7;color:var(--color-text-muted);margin-bottom:1rem;">${escapeHTML(p.content)}</p>
      ${p.tip ? `<div class="card-tip" style="margin-bottom:1.25rem;">💡 <b>전담요원 꿀팁:</b> ${escapeHTML(p.tip)}</div>` : ''}
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <a href="${safeUrl(p.link)}" target="_blank" rel="noopener noreferrer" class="btn-card link" style="display:inline-flex;">
          <span>원문 바로가기</span> 🔗
        </a>
        <button class="btn-card copy-link" data-link="${escapeHTML(p.link)}" style="cursor:pointer;"><span>링크 전달하기</span> 📋</button>
      </div>
    `;
    // 상세 모달 내 링크 전달하기 버튼 이벤트 바인딩
    const detailCopyBtn = content.querySelector('.copy-link');
    if (detailCopyBtn) {
      detailCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const link = detailCopyBtn.getAttribute('data-link');
        navigator.clipboard.writeText(link).then(() => {
          showToast('📋 링크 주소가 복사되었습니다!');
        }).catch(() => {
          showToast('⚠️ 복사에 실패했습니다.');
        });
      });
    }

    modal.style.display = 'flex';
  }

  // 10. 사이드바 17개 시도 전담기관 렌더링
  function renderRegionalCenters() {
    const listContainer = document.getElementById("centersList");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    window.regionalCenters.forEach(c => {
      const item = document.createElement("div");
      item.className = "center-item";
      
      item.innerHTML = `
        <div class="center-header">
          <span>${escapeHTML(c.name)}</span>
          <span class="center-tag">${escapeHTML(c.region)}</span>
        </div>
        <div class="center-details">
          <div>📞 연락처: <b>${escapeHTML(c.phone)}</b></div>
          <div>📍 관할지: ${escapeHTML(c.address)}</div>
        </div>
        <div class="center-links">
          <a href="${safeUrl(c.website)}" target="_blank" rel="noopener noreferrer" class="btn-mini">홈페이지 🔗</a>
          <button class="btn-mini btn-copy-contact" data-phone="${escapeHTML(c.phone)}" data-name="${escapeHTML(c.name)}">연락처 복사 📋</button>
        </div>
      `;
      listContainer.appendChild(item);
    });

    // 연락처 복사 버튼 바인딩
    document.querySelectorAll(".btn-copy-contact").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const phone = e.currentTarget.getAttribute("data-phone");
        const name = e.currentTarget.getAttribute("data-name");
        navigator.clipboard.writeText(`${name} 연락처: ${phone}`).then(() => {
          showToast(`📋 ${name} 연락처가 복사되었습니다.`);
        });
      });
    });
  }

  // 11. 카카오톡 공유용 메시지 빌더 & 클립보드 복사
  function sharePolicy(id) {
    const p = policies.find(item => item.id === id);
    if (!p) return;

    const shareText = `📢 [자립준비청년 지원 정책 추천]
━━━━━━━━━━━━━━━━━━━━
📌 지원사업: ${p.title}
🏢 지원주체: ${p.provider}
📍 지원지역: ${p.region}
👥 대상자 요건:
- ${p.target}

📝 상세내용:
- ${p.content}

⏰ 신청기간: ${p.date}

💡 전담요원 강력추천 팁:
- ${p.tip || "공식 공고 확인 후 신청 바랍니다."}

🔗 상세 확인 및 신청 링크:
${p.link}
━━━━━━━━━━━━━━━━━━━━
🌱 여러분의 성공적인 자립을 진심으로 응원합니다.`;

    navigator.clipboard.writeText(shareText).then(() => {
      showToast("💬 청년에게 발송할 카카오톡 공유 양식이 복사되었습니다!");
    }).catch(err => {
      console.error("클립보드 복사 실패: ", err);
      showToast("⚠️ 복사에 실패했습니다. 권한을 확인해 주세요.");
    });
  }

  // 11-1. Web Share API 기반 공유 (일반 방문자용, 미지원 시 클립보드 폴백)
  function webSharePolicy(id) {
    const p = policies.find(item => String(item.id) === String(id));
    if (!p) return;

    const shareTitle = p.title;
    const shareText = `📢 ${p.title}\n🏢 ${p.provider}\n📍 ${p.region}\n⏰ ${p.date}`;
    const shareUrl = safeUrl(p.link);
    const canShareUrl = shareUrl && shareUrl !== '#';

    if (navigator.share) {
      const payload = { title: shareTitle, text: shareText };
      if (canShareUrl) payload.url = shareUrl;
      navigator.share(payload).catch((err) => {
        // 사용자가 공유 시트를 취소한 경우(AbortError)는 조용히 무시
        if (err && err.name === 'AbortError') return;
        copyShareFallback(shareText, shareUrl, canShareUrl);
      });
    } else {
      copyShareFallback(shareText, shareUrl, canShareUrl);
    }
  }

  function copyShareFallback(shareText, shareUrl, canShareUrl) {
    const full = canShareUrl ? `${shareText}\n🔗 ${shareUrl}` : shareText;
    navigator.clipboard.writeText(full).then(() => {
      showToast("📋 공유 내용이 복사되었어요! 카톡 등에 붙여넣어 보내세요.");
    }).catch(() => {
      showToast("⚠️ 공유에 실패했습니다.");
    });
  }

  // 12. 토스트 팝업 표시
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>🔔</span> ${escapeHTML(message)}`;
    
    toastContainer.appendChild(toast);
    
    // 애니메이션 후 소멸
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // 13. 모달 제어 함수
  function openModal(id = null) {
    editingPolicyId = id;
    
    if (id !== null) {
      // 수정 모드
      const p = policies.find(item => item.id === id);
      if (!p) return;
      
      modalTitle.textContent = "⚙️ 지원 사업 정보 수정/삭제";
      btnSubmit.textContent = "수정 완료";
      btnDelete.style.display = "block";
      
      // 기존 값 폼에 채우기
      policyIdInput.value = p.id;
      titleInput.value = p.title;
      categorySelect.value = p.category;
      typeSelect.value = p.type || "공공·지자체"; // 기관구분 주입
      providerInput.value = p.provider;
      regionSelect.value = p.region;
      targetInput.value = p.target;
      contentInput.value = p.content;
      tipInput.value = p.tip || "";
      linkInput.value = p.link;
      dateInput.value = p.date;
    } else {
      // 등록 모드
      modalTitle.textContent = "➕ 새 지원 사업 등록";
      btnSubmit.textContent = "등록하기";
      btnDelete.style.display = "none";
      
      policyForm.reset();
      policyIdInput.value = "";
    }
    
    policyModal.classList.add("active");
  }

  function closeModal() {
    policyModal.classList.remove("active");
    editingPolicyId = null;
  }

  // 14. 이벤트 리스너 설정
  function setupEventListeners() {
    // 테마 토글 (데스크톱 + 모바일 헤더 버튼 모두 연결)
    themeToggleBtn.addEventListener("click", toggleTheme);
    const themeToggleMobile = document.getElementById("themeToggleMobile");
    if (themeToggleMobile) {
      themeToggleMobile.addEventListener("click", toggleTheme);
    }

    // 검색 입력
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderPolicies();
    });

    // 정렬 기준 필터
    const sortFilter = document.getElementById("sortFilter");
    if (sortFilter) {
      sortFilter.addEventListener("change", (e) => {
        currentSort = e.target.value;
        renderPolicies();
      });
    }

    // 지역 필터링
    regionFilter.addEventListener("change", (e) => {
      currentRegion = e.target.value;
      renderPolicies();
    });

    // 출처 필터링
    sourceFilter.addEventListener("change", (e) => {
      currentSource = e.target.value;
      renderPolicies();
    });

    // 즐겨찾기만 보기 토글
    const bookmarkFilterBtn = document.getElementById("bookmarkFilterBtn");
    if (bookmarkFilterBtn) {
      bookmarkFilterBtn.addEventListener("click", () => {
        showBookmarksOnly = !showBookmarksOnly;
        bookmarkFilterBtn.classList.toggle("active", showBookmarksOnly);
        bookmarkFilterBtn.setAttribute("aria-pressed", String(showBookmarksOnly));
        renderPolicies();
      });
    }

    // 카테고리 탭 클릭
    tabButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        tabButtons.forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        
        currentCategory = e.currentTarget.getAttribute("data-category");
        renderPolicies();
      });
    });

    // 기관 구분 필터 클릭
    const typeButtons = document.querySelectorAll(".type-btn");
    typeButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        typeButtons.forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        
        currentType = e.currentTarget.getAttribute("data-type");
        renderPolicies();
      });
    });

    // 모달 제어
    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => openModal(null));
    }
    modalCloseBtn.addEventListener("click", closeModal);


    
    // 모달 외부 클릭 시 닫기
    policyModal.addEventListener("click", (e) => {
      if (e.target === policyModal) {
        closeModal();
      }
    });





    // 폼 제출 (등록/수정)
    policyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const newPolicy = {
        title: titleInput.value.trim(),
        category: categorySelect.value,
        type: typeSelect.value, // 기관구분 수집
        provider: providerInput.value.trim(),
        region: regionSelect.value,
        target: targetInput.value.trim(),
        content: contentInput.value.trim(),
        tip: tipInput.value.trim(),
        link: linkInput.value.trim(),
        date: dateInput.value.trim()
      };

      if (!newPolicy.title || !newPolicy.provider || !newPolicy.content || !newPolicy.link) {
        alert("필수 입력 필드를 모두 채워주세요.");
        return;
      }

      // 링크 URL 유효성 검사 (http/https 만 허용)
      if (safeUrl(newPolicy.link) === '#') {
        alert("링크는 http:// 또는 https:// 로 시작하는 유효한 URL을 입력해주세요.");
        return;
      }

      if (editingPolicyId !== null) {
        const idx = localPolicies.findIndex(p => p.id === editingPolicyId);
        if (idx !== -1) {
          localPolicies[idx] = { ...localPolicies[idx], ...newPolicy };
          showToast("✏️ 지원 사업 정보가 수정되었습니다.");
        }
      } else {
        newPolicy.id = Date.now();
        localPolicies.unshift(newPolicy);
        showToast("✨ 새 지원 사업 정보가 등록되었습니다.");
      }

      savePolicies();
      rebuildCombinedPolicies();
      closeModal();
    });

    // 위로가기 버튼 스크롤 토글
    const scrollTopBtn = document.getElementById("scrollTopBtn");
    if (scrollTopBtn) {
      window.addEventListener("scroll", () => {
        if (window.scrollY > 300) {
          scrollTopBtn.classList.add("visible");
        } else {
          scrollTopBtn.classList.remove("visible");
        }
      });
    }

    // 삭제 버튼 클릭
    btnDelete.addEventListener("click", () => {
      if (editingPolicyId === null) return;

      if (confirm("정말로 이 지원 정보를 대시보드에서 삭제하시겠습니까?")) {
        localPolicies = localPolicies.filter(p => p.id !== editingPolicyId);
        savePolicies();
        rebuildCombinedPolicies();
        closeModal();
        showToast("🗑️ 지원 정보가 삭제되었습니다.");
      }
    });

    // 🔑 관리자 페이지 진입용 숨겨진 로직 (로고 7번 연속 터치 시 admin.html 이동, 1번 터치 시 새로고침)
    let logoClicks = 0;
    let clickTimeout;
    let reloadTimeout;
    const handleLogoClick = () => {
      logoClicks++;
      
      // 기존에 예약된 새로고침이 있다면 취소 (연속 터치 시 바로 새로고침 되는 것 방지)
      clearTimeout(reloadTimeout);
      
      if (logoClicks >= 7) {
        logoClicks = 0;
        window.location.href = "admin.html";
        return;
      }
      
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        logoClicks = 0;
      }, 3000); // 3초간 추가 입력이 없으면 카운트 초기화

      // 300ms 후 새로고침 실행 (7번 연속 클릭을 시도 중인 경우 차단됨)
      reloadTimeout = setTimeout(() => {
        logoClicks = 0;
        window.location.reload();
      }, 300);
    };

    const desktopLogo = document.querySelector(".logo-section");
    const mobileLogo = document.querySelector(".mobile-logo");
    if (desktopLogo) desktopLogo.addEventListener("click", handleLogoClick);
    if (mobileLogo) mobileLogo.addEventListener("click", handleLogoClick);
  }

  // 14-2. 아래로 당겨서 새로고침 (Pull to Refresh) 기능 구현
  function setupPullToRefresh() {
    // 이미 생성된 경우 중복 생성 방지
    if (document.getElementById("pullToRefresh")) return;

    const ptr = document.createElement("div");
    ptr.id = "pullToRefresh";
    ptr.className = "ptr-indicator";
    ptr.innerHTML = `
      <div class="ptr-content">
        <span class="ptr-icon">🌸</span>
        <span class="ptr-text">당겨서 새로고침</span>
      </div>
    `;
    document.body.prepend(ptr);

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    const threshold = 70; // 새로고침을 트리거할 당김 거리 (px)
    const maxPull = 120;   // 최대 당김 거리 제한 (px)

    const getScrollTop = () => {
      const mainContent = document.querySelector(".main-content");
      const mainScroll = mainContent ? mainContent.scrollTop : 0;
      return window.scrollY || document.documentElement.scrollTop || mainScroll;
    };

    window.addEventListener("touchstart", (e) => {
      // 스크롤이 가장 상단에 위치해 있을 때만 Pull to Refresh 작동
      if (getScrollTop() === 0) {
        startY = e.touches[0].pageY;
        isPulling = true;
      }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!isPulling) return;
      currentY = e.touches[0].pageY;
      const diff = currentY - startY;

      // 아래 방향으로 끌어내릴 때만 동작
      if (diff > 0) {
        // 저항감을 주기 위해 0.5 배율 적용
        const pullDist = Math.min(diff * 0.5, maxPull);
        
        // 인디케이터 위치 이동 및 회전 효과
        ptr.style.transform = `translateY(${pullDist}px)`;
        const icon = ptr.querySelector(".ptr-icon");
        if (icon) {
          icon.style.transform = `rotate(${pullDist * 3}deg)`;
        }

        const text = ptr.querySelector(".ptr-text");
        if (text) {
          if (pullDist >= threshold) {
            text.textContent = "놓아서 새로고침";
          } else {
            text.textContent = "당겨서 새로고침";
          }
        }

        // 당겨지는 동안 기본 바운스 스크롤 현상 방지
        if (diff > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        isPulling = false;
        ptr.style.transform = '';
      }
    }, { passive: false });

    window.addEventListener("touchend", () => {
      if (!isPulling) return;
      isPulling = false;

      const diff = currentY - startY;
      const pullDist = diff * 0.5;

      if (pullDist >= threshold) {
        // 새로고침 임계값 충족 시 로딩 상태 전환 후 페이지 reload
        ptr.classList.add("ptr-loading");
        const text = ptr.querySelector(".ptr-text");
        if (text) text.textContent = "새로고침 중...";
        
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        // 임계값 미충족 시 다시 상단으로 부드럽게 복귀
        ptr.style.transform = 'translateY(0)';
        const icon = ptr.querySelector(".ptr-icon");
        if (icon) icon.style.transform = '';
      }

      startY = 0;
      currentY = 0;
    });
  }

  // 15. HTML 이스케이프 유틸리티 (XSS 방지)
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 16. URL 안전성 검사 (javascript: 등 악성 URL 차단)
  function safeUrl(url) {
    if (!url) return '#';
    try {
      const u = new URL(url);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '#';
    } catch {
      return '#';
    }
  }

  // 실행 시작!
  init();
});
