const $ = selector => document.querySelector(selector);
const avatars = ['🌱', '🐿️', '🦊', '🐻', '🐰', '🦉'];
let state = { houses: [], problems: [], books: [] };
let worldPhone = '';
let ownResident = null;
const credentialKey = 'toc-world-pilot-credential';
const worldPhoneKey = 'toc-world-phone';
const credential = () => localStorage.getItem(credentialKey);
const make = (tag, className, value) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
};

async function api(op, method = 'GET', data, useCredential = false) {
  const response = await fetch(`/api?op=${op}`, {
    method,
    headers: { ...(worldPhone ? { 'X-World-Phone': worldPhone } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...(useCredential ? { Authorization: `Bearer ${credential()}` } : {}) },
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '잠시 후 다시 시도해 주세요.');
  return result;
}

const HOUSE_POSITIONS = {
  'T-H001': [9,22], 'T-H002': [19,22], 'T-H003': [14,42], 'T-H004': [9,58], 'T-H005': [19,62],
  'O-H001': [44,22], 'O-H002': [54,22], 'O-H003': [49,42], 'O-H004': [44,58], 'O-H005': [54,58],
  'C-H001': [74,22], 'C-H002': [84,22], 'C-H003': [79,42], 'C-H004': [74,58], 'C-H005': [84,58]
};
const VILLAGE_SCENE_POSITIONS = {
  't': { 'T-H001': [18,24], 'T-H002': [48,17], 'T-H003': [76,22], 'T-H004': [27,56], 'T-H005': [60,57] },
  'o': { 'O-H001': [44,12], 'O-H002': [78,33], 'O-H003': [17,32], 'O-H004': [18,62], 'O-H005': [73,68] },
  'c': { 'C-H001': [22,21], 'C-H002': [57,15], 'C-H003': [18,49], 'C-H004': [42,73], 'C-H005': [69,73] }
};

// 씬 좌표가 없는 집(H006+)은 씬 하단에 자동 배치
function sceneAutoPos(existingPositions, index) {
  const used = Object.values(existingPositions);
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  // 기존 좌표와 겹치지 않도록 하단 영역에 배치
  let x = 15 + col * 22;
  let y = 82 + row * 10;
  return [x, Math.min(y, 92)];
}

function renderHouses() {
  const grid = $('#house-grid'); if (grid) grid.replaceChildren();
  const markers = $('#map-houses'); if (markers) markers.replaceChildren();
  const vacant = state.houses.filter(h => !h.resident).length;
  $('#vacancy-count').textContent = `빈집 ${vacant} / ${state.houses.length}`;
  const villages = [
    { label: 'T마을', houses: state.houses.filter(h => h.id.startsWith('T')) },
    { label: 'O마을', houses: state.houses.filter(h => h.id.startsWith('O')) },
    { label: 'C마을', houses: state.houses.filter(h => h.id.startsWith('C')) }
  ];
  villages.forEach(({ label, houses }) => {
    if (!houses.length) return;
    const section = make('div', 'village-section');
    section.dataset.village = label.charAt(0).toLowerCase();
    section.append(make('h2', 'village-heading', label));
    const houseGrid = make('div', 'house-grid');
    houses.forEach(house => {
      const card = make('article', `house${house.resident ? ' occupied' : ''}`);
      const roof = make('div', 'roof');
      if (house.resident) roof.textContent = house.resident.avatar;
      else { const drawing = make('img'); drawing.src = '/house.svg'; drawing.alt = ''; roof.append(drawing); }
      card.append(roof);
      const info = make('div');
      info.append(make('h3', '', `${house.id} · ${house.resident ? '이웃의 집' : '빈집'}`));
      info.append(make('small', '', house.resident ? `${house.resident.nickname} 님이 살고 있어요` : '새 이웃을 기다리는 중'));
      const button = make('button', '', house.resident ? '미니홈피 열기' : '이 집 둘러보기');
      button.addEventListener('click', () => visitHouse(house));
      const pos = HOUSE_POSITIONS[house.id] || [20, 70];
      const villageKey = house.id.charAt(0).toLowerCase();
      const marker = make('button', `map-house village-${villageKey} ${house.resident ? 'settled' : ''}`, `${house.resident ? house.resident.avatar : '🏡'} ${house.id.slice(-3)}`);
      marker.style.left = `${pos[0]}%`; marker.style.top = `${pos[1]}%`;
      marker.setAttribute('aria-label', `${house.id} ${house.resident ? house.resident.nickname + ' 님 미니홈피' : '빈집 둘러보기'}`);
      marker.addEventListener('click', () => visitHouse(house)); if (markers) markers.append(marker);
      info.append(button); card.append(info); houseGrid.append(card);
    });
    section.append(houseGrid); if (grid) grid.append(section);
  });
}

function renderProblems() {
  const list = $('#problem-list'); list.replaceChildren();
  if (!state.problems.length) { list.append(make('div', 'home-empty', '첫 문제가 준비 중이에요. 곧 광장에서 만나요!')); return; }
  state.problems.forEach(problem => {
    const card = make('article', 'problem'), info = make('div');
    info.append(make('span', 'tag', `${problem.place} · ${problem.tool}`));
    info.append(make('h3', '', problem.title));
    info.append(make('p', '', problem.situation));
    const button = make('button', 'button primary', '문제 풀어보기 ↗');
    button.addEventListener('click', () => {
      if (!ownResident && !credential()) { showPage('houses'); alert('먼저 빈집을 골라 입주해 주세요.'); return; }
      $('#solve-title').textContent = problem.title;
      $('#solve-situation').textContent = problem.situation;
      $('#solve-id').value = problem.id;
      $('#solve-error').textContent = '';
      $('#solve-dialog').showModal();
    });
    card.append(info, button); list.append(card);
  });
}

function renderBooks() {
  const shelf = $('#book-shelf'); if (!shelf) return;
  shelf.replaceChildren();
  if (!state.books.length) { shelf.append(make('p', 'notice', '곧 책이 도착해요!')); return; }
  state.books.forEach(book => {
    const card = make('button', 'book-card');
    card.append(make('span', 'book-icon', book.icon), make('span', 'book-title', book.title), make('span', 'book-tag', book.tag));
    card.addEventListener('click', () => {
      $('#book-tag').textContent = book.tag;
      $('#book-title').textContent = `${book.icon} ${book.title}`;
      const contentEl = $('#book-content');
      contentEl.innerHTML = book.content
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .split('\n').map(line => {
          if (/^\d+\.\s/.test(line)) return `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
          if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
          if (!line.trim()) return '<br>';
          return `<p>${line}</p>`;
        }).join('').replace(/(<li>.*<\/li>)+/gs, m => `<ol>${m}</ol>`);
      $('#book-dialog').showModal();
    });
    shelf.append(card);
  });
}

function renderHome(home) {
  const target = $('#home-content'); target.replaceChildren();
  if (!ownResident && !credential()) {
    $('#ask-button').hidden = true;
    const empty = make('div', 'home-empty');
    empty.append(make('div', '', '🏡'), make('strong', '', '아직 입주 전이에요.'), make('p', '', '빈집을 골라 아바타와 함께 입주하면 내 집이 열립니다.'));
    target.append(empty); $('#enter-form').hidden = true; return;
  }
  $('#enter-form').hidden = true;
  $('#ask-button').hidden = false;
  if (!home) { target.append(make('div', 'home-empty', '내 집 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.')); return; }
  const summary = make('div', 'home-summary studio-summary');
  summary.append(make('div', 'avatar', home.resident.avatar));
  const title = make('div', 'studio-title');
  title.append(make('h3', '', `${home.resident.nickname} 님의 미니홈피`), make('p', '', '생각하다 쉬어가도 괜찮아요'), make('small', '', home.resident.houseId));
  summary.append(title);
  const waiting = home.questions.filter(q => !q.answer).length;
  const answered = home.questions.filter(q => q.answer).length;
  const stats = make('div', 'studio-stats');
  [['✎', '푼 문제', home.solutions.length], ['🌱', '생각나무', home.treeCount], ['☁', '답변 대기', waiting], ['●', '받은 답변', answered]].forEach(([icon, label, count], i) => {
    const stat = make('div', `studio-stat${i === 3 && count ? ' has-answers' : ''}`);
    const text = make('div'); text.append(make('span', '', label), make('strong', '', count));
    const symbol = make('span', 'stat-icon', icon); symbol.setAttribute('aria-hidden', 'true');
    stat.append(symbol, text); stats.append(stat);
  });
  summary.append(stats); target.append(summary);
  const room = make('div', 'studio-room');
  room.setAttribute('role', 'img'); room.setAttribute('aria-label', '햇살 드는 창가 책상과 책장, 초록 식물과 편안한 소파가 있는 작업실');
  target.append(room);
  const notebook = make('div', 'studio-notebook');
  const tabs = make('div', 'studio-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '내 기록');
  const records = make('div', 'solution-list'); records.id = 'studio-solutions'; records.setAttribute('role', 'tabpanel'); records.tabIndex = 0;
  const questions = make('div', 'solution-list'); questions.id = 'studio-questions'; questions.setAttribute('role', 'tabpanel'); questions.tabIndex = 0;
  const panels = [records, questions];
  const buttons = ['내가 푼 문제', `모찌몽과의 문답 · ${home.questions.length}`].map((label, index) => {
    const button = make('button', '', label); button.type = 'button'; button.id = `studio-tab-${index}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panels[index].id); panels[index].setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => selectTab(index));
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
      if (next !== null) { event.preventDefault(); selectTab(next); buttons[next].focus(); }
    });
    tabs.append(button); return button;
  });
  function selectTab(index) {
    panels.forEach((panel, i) => { panel.hidden = i !== index; buttons[i].setAttribute('aria-selected', String(i === index)); buttons[i].tabIndex = i === index ? 0 : -1; });
  }
  selectTab(answered ? 1 : 0);
  if (!home.solutions.length) {
    const empty = make('div', 'home-empty'); empty.append(make('p', '', '아직 푼 문제가 없어요. 광장에서 첫 생각을 시작해 보세요.'));
    const go = make('button', 'button primary', '생각 광장으로'); go.type = 'button'; go.addEventListener('click', () => showPage('plaza')); empty.append(go); records.append(empty);
  }
  home.solutions.forEach(solution => {
    const card = make('article', 'solution');
    const problem = state.problems.find(p => p.id === solution.problemId);
    card.append(make('h4', '', `${problem?.title || solution.problemId} · 🌳 ${solution.trees}`), make('p', '', solution.answer));
    const feedback = make('div', 'feedback'); feedback.append(make('b', '', '모찌몽의 피드백'), make('p', '', solution.feedback || '풀이를 읽고 피드백을 준비하고 있어요.'));
    card.append(feedback); records.append(card);
  });
  if (!home.questions.length) questions.append(make('div', 'home-empty', '생각하다 막힌 부분이 있나요? 아래 질문하기 버튼으로 이야기를 남겨 주세요.'));
  home.questions.forEach(item => {
    const card = make('article', `solution${item.answer ? ' answered-question' : ''}`);
    card.append(make('h4', '', item.answer ? '모찌몽의 답변이 도착했어요' : '답변을 기다리고 있어요'), make('p', '', item.question));
    const answer = make('div', 'feedback'); answer.append(make('b', '', '모찌몽의 답변'), make('p', '', item.answer || '질문을 읽고 답을 준비하고 있어요.'));
    card.append(answer); questions.append(card);
  });
  notebook.append(tabs, records, questions); target.append(notebook);
}

async function load() {
  try {
    state = await api('state'); renderHouses(); renderProblems(); renderBooks();
    if (ownResident || credential()) {
      try { renderHome(await api('home', 'GET', null, true)); }
      catch (error) {
        if (error.message.includes('입주증')) localStorage.removeItem(credentialKey);
        renderHome();
      }
    } else renderHome();
  } catch (error) {
    $('#world-error').textContent = error.message;
    $('#problem-list').textContent = error.message;
  }
}

function openApply(id) {
  $('#apply-form').reset(); $('#house-id').value = id; $('#village-phone').value = worldPhone;
  $('#chosen-house').textContent = id; $('#apply-error').textContent = '';
  const villageLabel = id.startsWith('O') ? 'O마을' : id.startsWith('C') ? 'C마을' : 'T마을';
  $('#apply-title').textContent = `${villageLabel} 입주 신청`;
  $('#apply-dialog').showModal();
}

avatars.forEach((avatar, i) => {
  const label = make('label'), radio = make('input'), display = make('span', '', avatar);
  radio.type = 'radio'; radio.name = 'avatar'; radio.value = avatar; radio.required = true; if (i === 0) { radio.checked = true; radio.defaultChecked = true; }
  label.append(radio, display); $('#avatar-choices').append(label);
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#apply-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true;
  $('#apply-error').textContent = '';
  try {
    const result = await api('apply', 'POST', {
      houseId: $('#house-id').value, nickname: $('#nickname').value,
      avatar: form.querySelector('[name=avatar]:checked').value, agreed: form.querySelector('[name=agreed]').checked,
      phone: $('#village-phone').value.trim()
    });
    localStorage.setItem(credentialKey, result.credential); ownResident = result.resident; $('#welcome-name').textContent = `${ownResident.avatar} ${ownResident.nickname} 님`;
    $('#apply-dialog').close(); await load(); showPage('my-home');
    $('#credential-dialog').showModal();
  } catch (error) { $('#apply-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#close-book').addEventListener('click', () => { $('#book-dialog').close(); });
$('#finish-credential').addEventListener('click', () => {
  $('#credential-dialog').close(); showPage('my-home');
});
$('#go-plaza').addEventListener('click', () => {
  $('#credential-dialog').close(); showPage('plaza');
});
$('#enter-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#enter-error').textContent = '';
  const code = $('#enter-code').value.trim();
  if (!code) return;
  localStorage.setItem(credentialKey, code);
  try { await api('home', 'GET', null, true); await load(); $('#enter-code').value = ''; }
  catch (error) { localStorage.removeItem(credentialKey); $('#enter-error').textContent = error.message; }
});
$('#ask-button').addEventListener('click', () => {
  $('#ask-error').textContent = '';
  $('#ask-dialog').showModal();
});
$('#ask-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
  $('#ask-error').textContent = '';
  try {
    await api('ask', 'POST', { question: $('#question').value }, true);
    $('#question').value = ''; $('#ask-dialog').close(); await load(); showPage('my-home');
  } catch (error) { $('#ask-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#solve-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true; $('#solve-error').textContent = '';
  try {
    await api('submit', 'POST', { problemId: $('#solve-id').value, answer: $('#answer').value }, true);
    $('#solve-dialog').close(); $('#answer').value = ''; await load(); showPage('my-home');
  } catch (error) { $('#solve-error').textContent = error.message; }
  finally { button.disabled = false; }
});

function showPage(id) {
  document.querySelectorAll('.page').forEach(page => { page.hidden = page.id !== id; });
  document.querySelectorAll('.sidebar [data-page]').forEach(button => {
    if (button.dataset.page === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const titles = { houses: '마을 전체 지도', 'my-home': '내 미니홈피', plaza: '생각 광장', cafe: '마을 카페', library: '마을 도서관', guide: '마을 이용 안내', 'neighbor-home': '이웃 미니홈피', learn: 'TOCfE 배우기' };
  if (id === 'learn' && !$('#chat-messages').childElementCount) renderBubble('assistant', 'TOCfE 생각도구에 대해 궁금한 것을 물어보세요! 질문하기·작성 도움·피드백 받기 모드를 선택해서 시작해요. 🌱');
  $('#page-label').textContent = titles[id] || 'TOC월드';
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
$('.brand').addEventListener('click', event => { event.preventDefault(); showPage('houses'); });
function visitHouse(house) {
  if (ownResident?.houseId === house.id) { showPage('my-home'); return; }
  const target = $('#neighbor-content'); target.replaceChildren();
  const room = make('div', 'mini-room');
  room.append(make('span', 'room-window', '☀️'), make('span', 'room-avatar', house.resident?.avatar || '🏡'), make('span', 'room-plant', '🪴'), make('span', 'room-books', '📚'));
  target.append(make('h1', '', house.resident ? `${house.resident.nickname} 님의 미니홈피` : `${house.id} · 나의 집이 될 공간`), room);
  target.append(make('p', 'notice', house.resident ? '이웃의 집에 오신 걸 환영해요. 풀이와 질문, 피드백은 집주인만 볼 수 있어요.' : '별명과 아바타를 정하면 이곳에 나의 풀이와 생각나무가 쌓여요.'));
  if (!house.resident && !ownResident) {
    const choose = make('button', 'button primary', '이 집에 입주하기'); choose.addEventListener('click', () => openApply(house.id)); target.append(choose);
  } else if (!house.resident) target.append(make('p', '', '이미 내 집이 있어요. 집 이동은 아직 지원하지 않아요.'));
  showPage('neighbor-home');
}
$('#gate-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; $('#gate-error').textContent = '';
  try {
    const phone = $('#gate-code').value.trim();
    const result = await api('enter', 'POST', { phone });
    worldPhone = phone; ownResident = result.resident; localStorage.setItem(worldPhoneKey, phone); localStorage.removeItem(credentialKey);
    $('#gate-code').value = ''; $('#gate').hidden = true; $('#world').hidden = false;
    $('#welcome-name').textContent = ownResident ? `${ownResident.avatar} ${ownResident.nickname} 님` : '새 이웃을 환영해요';
    showPage('houses'); await load();
  } catch(error) { $('#gate-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click', () => {
  worldPhone = ''; ownResident = null; state = {houses:[], problems:[]}; localStorage.removeItem(credentialKey); localStorage.removeItem(worldPhoneKey);
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('#home-content').replaceChildren(); $('#neighbor-content').replaceChildren(); $('#house-grid').replaceChildren(); $('#map-houses').replaceChildren(); $('#problem-list').replaceChildren();
  $('#world').hidden = true; $('#gate').hidden = false; $('#gate-code').focus();
});

function initVillageNav() {
  const mapWrap = $('.map-wrap');
  if (!mapWrap) return;
  [['t','T마을','0%','0%','33%','100%'],['o','O마을','33%','0%','34%','100%'],['c','C마을','67%','0%','33%','100%']].forEach(([key, label, l, t, w, h]) => {
    const btn = make('button', `village-zone zone-${key}`);
    btn.setAttribute('aria-label', `${label} 보기`);
    btn.style.cssText = `left:${l};top:${t};width:${w};height:${h}`;
    btn.addEventListener('click', () => showVillage(key));
    mapWrap.append(btn);
  });
}

function showVillage(key) {
  const labels = { t: 'T마을', o: 'O마을', c: 'C마을' };
  const houses = state.houses.filter(h => h.id.charAt(0).toLowerCase() === key);
  const vacant = houses.filter(h => !h.resident).length;
  $('#village-detail-name').textContent = labels[key];
  $('#village-detail-count').textContent = `빈집 ${vacant} / ${houses.length}`;
  const scene = $('#village-scene');
  scene.dataset.village = key;
  scene.querySelectorAll('.scene-house').forEach(el => el.remove());
  const scenePos = VILLAGE_SCENE_POSITIONS[key] || {};
  const grid = $('#village-detail-grid'); grid.replaceChildren();
  let autoIdx = 0;
  houses.forEach(house => {
    const defined = scenePos[house.id];
    const pos = defined ?? sceneAutoPos(scenePos, autoIdx);
    if (!defined) autoIdx++;
    {
      const pin = make('button', `scene-house${house.resident ? '' : ' vacant'}`);
      pin.style.cssText = `left:${pos[0]}%;top:${pos[1]}%`;
      pin.innerHTML = `${house.resident ? house.resident.avatar : '🏡'} <span>${house.resident ? house.resident.nickname : house.id.slice(-3)}</span>`;
      pin.title = house.resident ? `${house.resident.nickname} 님의 집` : `${house.id} 빈집`;
      pin.addEventListener('click', () => visitHouse(house));
      scene.append(pin);
    }
    const card = make('article', `house${house.resident ? ' occupied' : ''}`);
    const roof = make('div', 'roof');
    if (house.resident) roof.textContent = house.resident.avatar;
    else { const drawing = make('img'); drawing.src = '/house.svg'; drawing.alt = ''; roof.append(drawing); }
    card.append(roof);
    const info = make('div');
    info.append(make('h3', '', `${house.id} · ${house.resident ? '이웃의 집' : '빈집'}`));
    info.append(make('small', '', house.resident ? `${house.resident.nickname} 님이 살고 있어요` : '새 이웃을 기다리는 중'));
    const button = make('button', '', house.resident ? '미니홈피 열기' : '이 집 둘러보기');
    button.addEventListener('click', () => visitHouse(house));
    info.append(button); card.append(info); grid.append(card);
  });
  $('#village-map-view').hidden = true;
  $('#village-detail').hidden = false;
  window.scrollTo({ top: 0 });
}

$('#village-back').addEventListener('click', () => {
  $('#village-detail').hidden = true;
  $('#village-map-view').hidden = false;
});

initVillageNav();
document.querySelectorAll('.community-spot[data-page]').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

(async () => {
  const savedPhone = localStorage.getItem(worldPhoneKey);
  if (savedPhone) {
    try {
      const result = await api('enter', 'POST', { phone: savedPhone });
      worldPhone = savedPhone; ownResident = result.resident; localStorage.removeItem(credentialKey);
      $('#gate').hidden = true; $('#world').hidden = false;
      $('#welcome-name').textContent = ownResident ? `${ownResident.avatar} ${ownResident.nickname} 님` : '새 이웃을 환영해요';
      showPage('houses'); await load();
    } catch { localStorage.removeItem(worldPhoneKey); }
  }
})();

// === TOCfE 채팅 ===
let chatMessages = [];
let chatMode = 'qa';

function renderBubble(role, content) {
  const container = $('#chat-messages');
  if (!container) return;
  const msg = make('div', `chat-bubble ${role}`);
  if (role === 'assistant') msg.append(make('span', 'chat-avatar', '🍞'));
  msg.append(make('div', 'chat-text', content));
  container.append(msg);
  container.scrollTop = container.scrollHeight;
}

document.querySelectorAll('.chat-mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chat-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chatMode = btn.dataset.mode;
  });
});

$('#chat-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#chat-input');
  const imageInput = $('#chat-image');
  const text = input.value.trim();
  if (!text && !imageInput?.files.length) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#chat-error').textContent = '';
  renderBubble('user', text || '[이미지 첨부]');
  input.value = '';
  chatMessages.push({ role: 'user', content: text || '이미지를 첨부했어요.' });
  try {
    let image = null;
    if (imageInput?.files[0]) {
      const file = imageInput.files[0];
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = e => resolve(e.target.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(file);
      });
      image = { data, mediaType: file.type };
      imageInput.value = '';
    }
    const payload = { messages: chatMessages.slice(-20), mode: chatMode };
    if (image) payload.image = image;
    const result = await api('chat', 'POST', payload);
    renderBubble('assistant', result.reply);
    chatMessages.push({ role: 'assistant', content: result.reply });
  } catch (error) {
    $('#chat-error').textContent = error.message;
    chatMessages.pop();
  } finally { button.disabled = false; }
});

$('#chat-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#chat-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
});
