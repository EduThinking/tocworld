import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { allRecords, createRecord, updateRecord, deleteRecord, formulaValue } from './db.mjs';

const AVATARS = ['🌱', '🐿️', '🦊', '🐻', '🐰', '🦉'];
const MAX_BODY = 12_000;
const MAX_CHAT_BODY = 3_500_000;

const BADGES = [
  { min: 0, emoji: '🌱', name: '새싹' },
  { min: 1, emoji: '🌿', name: '풀잎' },
  { min: 3, emoji: '🌳', name: '나무' },
  { min: 5, emoji: '🌲', name: '숲' },
  { min: 10, emoji: '⭐', name: '별' },
];

const TREE_STAGES = [
  { min: 0, emoji: '🌱', name: '씨앗' },
  { min: 1, emoji: '🌿', name: '새싹' },
  { min: 3, emoji: '🌳', name: '어린 나무' },
  { min: 6, emoji: '🌲', name: '큰 나무' },
  { min: 11, emoji: '🌳✨', name: '빛나는 나무' },
];

function getBadge(solutionCount) {
  return [...BADGES].reverse().find(b => solutionCount >= b.min) || BADGES[0];
}

function getTreeStage(treeCount) {
  return [...TREE_STAGES].reverse().find(t => treeCount >= t.min) || TREE_STAGES[0];
}

const TOCFE_SYSTEM = `너는 TOCfE(Theory of Constraints for Education) 생각도구 전문 튜터 '모찌몽'이야. TOC월드에서 이웃들과 함께 TOCfE를 배우고 실천해.

## TOCfE 기본 생각도구 3가지

### 1. 구름(Cloud) - 갈등 해결 도구
갈등 상황을 정의하고 Win-Win 해결책을 찾는 도구야.

**구름의 5개 상자:**
- A(공통목표): 양쪽 필요가 모두 만족된 상태
- B(필요): 한쪽이 요망사항을 원하는 이유
- C(필요): 다른 쪽이 요망사항을 원하는 이유
- D(요망사항): 한쪽이 원하는 것/주장
- D'(요망사항): 다른 쪽이 원하는 것/주장 (D와 동시에 이룰 수 없음)

**작성 순서:** 요망사항(D, D') → 필요(B, C) → 공통목표(A)
**읽는 방법:** "~하기 위해서는 ~해야만 한다"로 왼쪽→오른쪽 읽기
**필요 확인법:** "(필요)를 위해서는 (요망사항)을 해야만 한다" - 논리적으로 맞는지 확인

**해결책 찾기:**
1. 가정 찾기: "(필요)하기 위해서는 (요망사항)해야만 한다. 왜냐하면 (___) 때문이다"
2. 가정 깨기: 그 가정이 틀릴 수 있는 새로운 방법 찾기
3. 또는 대각선 질문: "D'을 하면서도 B를 만족할 방법은?" / "D를 하면서도 C를 만족할 방법은?"

### 2. 가지(Branch) - 인과관계 도구
원인과 결과의 관계를 나타내는 도구야.

**기본 구조:** "만약 (원인)이면, 그러면 (결과)이다"
**활용:**
- 행동의 결과 예측하기
- 문제의 원인 찾기
- 이야기나 글의 인과관계 파악하기

### 3. 야심찬 목표나무(Ambitious Target Tree) - 목표 달성 도구
목표를 이루기 위한 체계적인 계획을 세우는 도구야.

**작성 순서:**
1. 야심찬 목표 정하기 (맨 위)
2. 걸림돌(장애물) 목록 작성하기
3. 각 걸림돌을 극복할 디딤돌(중간목표) 찾기
4. 디딤돌들의 실행 순서 정하기
5. 구체적인 활동 계획 수립하기

**핵심:** 걸림돌을 먼저 파악해야 현실적인 계획이 나와!

## 응답 규칙
- 한국어로 따뜻하게 대화해
- 300자 이내로 핵심만 전달해
- 스스로 생각할 수 있게 질문으로 이끌어줘
- 예시를 들 때는 학생 눈높이에 맞는 일상적인 상황 사용해
- 생각도구 작성을 도울 때는 단계별로 안내해줘`;

async function bodyOfLarge(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_CHAT_BODY) throw Object.assign(new Error('이미지 크기가 너무 커요. 3MB 이하로 올려주세요.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('입력 형식을 확인해 주세요.'), { status: 400 }); }
}

async function chat(req, body) {
  if (req.headers['x-world-phone']) await applicantByPhone(String(req.headers['x-world-phone']).trim());
  else if (req.headers.authorization) await residentFor(req);
  else fail('로그인 후 이용해 주세요.', 401);
  if (!process.env.ANTHROPIC_API_KEY) fail('AI 서비스를 준비 중이에요.', 503);
  const mode = ['qa', 'tool', 'feedback'].includes(body.mode) ? body.mode : 'qa';
  const modeHints = { qa: '학생이 TOCfE에 대해 질문하고 있어요.', tool: '학생이 생각도구 작성 도움을 요청하고 있어요. 같이 채워나가줘.', feedback: '학생이 완성한 생각도구 피드백을 원해요. 잘한 점과 개선할 점을 구체적으로 알려줘.' };
  const messages = (Array.isArray(body.messages) ? body.messages : []).filter(m => m?.role && m?.content).slice(-20);
  if (!messages.length) fail('메시지가 없어요.', 400);
  const image = body.image;
  const last = messages[messages.length - 1];
  const formatted = [...messages.slice(0, -1)];
  if (image?.data && last.role === 'user') {
    formatted.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/png', data: image.data } }, { type: 'text', text: last.content || '이 생각도구를 봐줘.' }] });
  } else {
    formatted.push(last);
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 512, system: `${TOCFE_SYSTEM}\n\n현재 모드: ${modeHints[mode]}`, messages: formatted })
  });
  if (!response.ok) { console.error('Anthropic error', response.status); fail('AI 답변을 불러오지 못했어요. 잠시 후 다시 시도해주세요.', 503); }
  const data = await response.json();
  return { reply: data.content?.[0]?.text || '답변을 불러오지 못했어요.' };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  let text = '';
  for await (const part of req) {
    text += part;
    if (text.length > MAX_BODY) throw Object.assign(new Error('입력 내용이 너무 깁니다.'), { status: 413 });
  }
  try { return JSON.parse(text || '{}'); }
  catch { throw Object.assign(new Error('입력 형식을 확인해 주세요.'), { status: 400 }); }
}

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function equalHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function recordId(prefix) { return `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`; }

function normalizePhone(input) {
  return String(input).replace(/[^0-9]/g, '');
}

async function applicantByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!/^01[016789][0-9]{7,8}$/.test(normalized)) fail('올바른 전화번호를 입력해 주세요. (예: 010-1234-5678)', 400);
  const base = process.env.CHALLENGE_AIRTABLE_BASE_ID;
  if (!base || !process.env.AIRTABLE_API_KEY) fail('신청 확인을 준비 중이에요.', 503);
  const url = new URL(`https://api.airtable.com/v0/${base}/tblj8LIM2SaJFJGaA`);
  url.searchParams.set('filterByFormula',
    `SUBSTITUTE(SUBSTITUTE({연락처},"-","")," ","")=${formulaValue(normalized)}`
  );
  const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
  if (!response.ok) throw new Error(`신청 확인 실패: ${response.status}`);
  const data = await response.json();
  const active = (data.records || []).filter(r => r.fields['진행 상태'] !== '취소');
  if (!active.length) fail('챌린지에 신청한 전화번호가 아니에요.', 403);
  active.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  return active[0];
}

async function residentFor(req) {
  if (req.headers['x-world-phone']) {
    const applicant = await applicantByPhone(String(req.headers['x-world-phone']).trim());
    const matches = await allRecords('이웃', `{신청 레코드 ID}=${formulaValue(applicant.id)}`);
    if (matches.length !== 1) fail('먼저 빈집을 선택해 입주해 주세요.', 403);
    return matches[0];
  }
  const credential = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!credential || credential.length > 128) fail('입주증을 확인해 주세요.', 401);
  const credentialHash = hash(credential);
  const matches = await allRecords('이웃', `{입주증 해시}=${formulaValue(credentialHash)}`);
  const resident = matches[0];
  if (!resident || !equalHash(resident.fields['입주증 해시'], credentialHash)) fail('입주증이 맞지 않습니다.', 401);
  return resident;
}

function publicResident(record) {
  return { nickname: record.fields['별명'], avatar: record.fields['아바타'], houseId: record.fields['집 ID'], profileImage: record.fields['프로필 이미지'] || null };
}

const FALLBACK_BOOKS = [
  { id: 'B-CLOUD', title: '구름(Cloud)', icon: '☁️', tag: '갈등 해결', content: `갈등 상황을 명확히 정리하고 Win-Win 해결책을 찾는 도구예요.

**구름의 5개 상자**
- **A (공통목표)**: 양쪽 필요가 모두 만족된 상태
- **B (필요)**: 한쪽이 요망사항을 원하는 이유
- **C (필요)**: 다른 쪽이 요망사항을 원하는 이유
- **D (요망사항)**: 한쪽이 원하는 것
- **D' (요망사항)**: 다른 쪽이 원하는 것 (D와 동시에 못 함)

**작성 순서**: D, D' → B, C → A (요망사항 먼저, 공통목표는 마지막)

**읽는 방법**: "~하기 위해서는 ~해야만 한다"로 왼쪽→오른쪽 읽어요.
- 예: "화목한 저녁시간을 보내려면 → TV를 봐야 한다"

**해결책 찾기**
1. 가정 찾기: "(필요)하려면 (요망사항)해야 한다. 왜냐하면 ___ 때문이다"
2. 가정 깨기: 그 가정이 틀릴 수 있는 새로운 방법 찾기
3. 대각선 질문: "D'을 하면서도 B를 만족할 방법은?"` },
  { id: 'B-BRANCH', title: '가지(Branch)', icon: '🌿', tag: '인과관계', content: `원인과 결과의 관계를 논리적으로 연결하는 도구예요.

**기본 구조**
"만약 (원인)이면, 그러면 (결과)이다" (If-Then)

**활용 방법**
- 행동의 결과 예측하기
- 문제의 원인 찾기
- 이야기의 인과관계 파악하기

**작성 팁**
1. 원인(사실)을 아래에, 결과(예측)를 위에 적어요
2. 화살표로 연결하며 "왜?"를 물어봐요
3. 논리가 맞는지 확인해요: "정말 A 때문에 B가 될까?"

**예시**
- 만약 "비가 온다"면, 그러면 "운동장이 젖는다"
- 만약 "운동장이 젖는다"면, 그러면 "체육 수업을 실내에서 한다"` },
  { id: 'B-GOAL', title: '야심찬 목표나무', icon: '🌳', tag: '목표 달성', content: `목표를 이루기 위한 체계적인 계획을 세우는 도구예요.

**작성 5단계**
1. **야심찬 목표** 정하기 (맨 위에 적어요)
2. **걸림돌** 목록 작성 (목표 달성을 막는 장애물들)
3. **디딤돌** 찾기 (각 걸림돌을 극복할 중간목표)
4. 디딤돌 **실행 순서** 정하기
5. 구체적인 **활동 계획** 수립

**핵심 포인트**
- 걸림돌을 먼저 파악해야 현실적인 계획이 나와요!
- "왜 안 되지?" 대신 "뭐가 막고 있지?"를 물어봐요

**예시: 영어 시험 100점 받기**
- 걸림돌: 단어를 많이 모른다
- 디딤돌: 하루 10개씩 단어 외우기
- 활동: 매일 아침 등교 전 단어장 보기` },
];

async function publicState() {
  const [houses, residents, problems, booksRaw] = await Promise.all([
    allRecords('집'), allRecords('이웃'), allRecords('문제'),
    allRecords('책').catch(() => [])
  ]);
  const byHouse = new Map(residents.map(r => [r.fields['집 ID'], publicResident(r)]));
  const books = booksRaw.filter(r => r.fields['공개']).map(r => ({
    id: r.fields['책 ID'], title: r.fields['제목'], icon: r.fields['아이콘'] || '📖',
    tag: r.fields['태그'] || '', content: r.fields['내용'] || ''
  }));
  return {
    houses: houses.map(r => ({ id: r.fields['집 ID'], resident: byHouse.get(r.fields['집 ID']) || null })).sort((a,b) => a.id.localeCompare(b.id)),
    problems: problems.filter(r => r.fields['공개']).map(r => ({
      id: r.fields['문제 ID'], title: r.fields['제목'], situation: r.fields['상황'], place: r.fields['장소'], tool: r.fields['생각도구']
    })),
    books: books.length ? books : FALLBACK_BOOKS,
  };
}

async function apply(body) {
  const applicant = await applicantByPhone(String(body.phone || '').trim());
  const nickname = String(body.nickname || '').trim();
  const houseId = String(body.houseId || '').trim();
  const avatar = String(body.avatar || '').trim();
  if (nickname.length < 2 || nickname.length > 20) fail('별명은 2~20자로 입력해 주세요.');
  if (!AVATARS.includes(avatar)) fail('아바타를 선택해 주세요.');
  if (!body.agreed) fail('입주 안내에 동의해 주세요.');
  const already = await allRecords('이웃', `{신청 레코드 ID}=${formulaValue(applicant.id)}`);
  if (already.length) fail('이 신청자는 이미 입주했어요. 입주증으로 내 집을 열어 주세요.', 409);
  const houses = await allRecords('집', `{집 ID}=${formulaValue(houseId)}`);
  if (houses.length !== 1) fail('선택한 집을 찾을 수 없어요.');
  const occupants = await allRecords('이웃', `{집 ID}=${formulaValue(houseId)}`);
  if (occupants.length) fail('이미 입주한 집이에요. 다른 집을 골라 주세요.', 409);
  const credential = randomBytes(32).toString('base64url');
  const resident = await createRecord('이웃', {
    '이웃 ID': recordId('T-N'), '별명': nickname, '아바타': avatar,
    '집 ID': houseId, '집': [houses[0].id], '입주증 해시': hash(credential),
    '신청 레코드 ID': applicant.id,
    '입주 시각': new Date().toISOString(), '동의': true
  });
  const contenders = await allRecords('이웃', `{집 ID}=${formulaValue(houseId)}`);
  contenders.sort((a,b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
  if (contenders[0]?.id !== resident.id) {
    await deleteRecord('이웃', resident.id);
    fail('방금 다른 이웃이 먼저 입주했어요. 다른 집을 골라 주세요.', 409);
  }
  const duplicates = await allRecords('이웃', `{신청 레코드 ID}=${formulaValue(applicant.id)}`);
  duplicates.sort((a,b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
  if (duplicates[0]?.id !== resident.id) {
    await deleteRecord('이웃', resident.id);
    fail('이 신청자는 이미 입주했어요. 입주증으로 내 집을 열어 주세요.', 409);
  }
  return { credential, resident: publicResident(resident) };
}

async function home(req) {
  const resident = await residentFor(req);
  const [solutions, questions, guestbook] = await Promise.all([
    allRecords('풀이', `{이웃 ID}=${formulaValue(resident.fields['이웃 ID'])}`),
    allRecords('질문', `{이웃 ID}=${formulaValue(resident.fields['이웃 ID'])}`),
    allRecords('방명록', `{집주인 ID}=${formulaValue(resident.fields['이웃 ID'])}`).catch(() => [])
  ]);
  const treeCount = solutions.reduce((sum, r) => sum + (Number(r.fields['생각나무']) || 0), 0);
  return {
    resident: publicResident(resident),
    treeCount,
    badge: getBadge(solutions.length),
    treeStage: getTreeStage(treeCount),
    guestbook: guestbook.map(r => ({
      id: r.id, visitor: r.fields['방문자 별명'], avatar: r.fields['방문자 아바타'],
      message: r.fields['메시지'], createdAt: r.fields['작성 시각']
    })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 20),
    questions: questions.map(r => ({
      id: r.fields['질문 ID'], question: r.fields['질문 내용'], answer: r.fields['모찌몽 답변'] || null,
      askedAt: r.fields['질문 시각']
    })).sort((a,b) => b.askedAt.localeCompare(a.askedAt)),
    solutions: solutions.map(r => ({
      id: r.fields['풀이 ID'], problemId: r.fields['문제 ID'], answer: r.fields['풀이 내용'],
      feedback: r.fields['모찌몽 피드백'] || null, trees: Number(r.fields['생각나무']) || 0,
      submittedAt: r.fields['제출 시각']
    })).sort((a,b) => b.submittedAt.localeCompare(a.submittedAt))
  };
}

async function ask(req, body) {
  const resident = await residentFor(req);
  const question = String(body.question || '').trim();
  if (question.length < 10 || question.length > 2000) fail('질문은 10~2000자로 적어 주세요.');
  const created = await createRecord('질문', {
    '질문 ID': recordId('T-Q'), '이웃 ID': resident.fields['이웃 ID'],
    '이웃': [resident.id], '질문 내용': question, '질문 시각': new Date().toISOString()
  });
  return { id: created.fields['질문 ID'] };
}

async function visitNeighbor(req, body) {
  const houseId = String(body.houseId || '').trim();
  if (!houseId) fail('집 ID가 필요해요.');
  const residents = await allRecords('이웃', `{집 ID}=${formulaValue(houseId)}`);
  if (!residents.length) fail('이 집에는 아직 이웃이 없어요.', 404);
  const host = residents[0];
  const [solutions, guestbook] = await Promise.all([
    allRecords('풀이', `{이웃 ID}=${formulaValue(host.fields['이웃 ID'])}`),
    allRecords('방명록', `{집주인 ID}=${formulaValue(host.fields['이웃 ID'])}`).catch(() => [])
  ]);
  const treeCount = solutions.reduce((sum, r) => sum + (Number(r.fields['생각나무']) || 0), 0);
  return {
    resident: publicResident(host),
    badge: getBadge(solutions.length),
    treeStage: getTreeStage(treeCount),
    guestbook: guestbook.map(r => ({
      id: r.id, visitor: r.fields['방문자 별명'], avatar: r.fields['방문자 아바타'],
      message: r.fields['메시지'], createdAt: r.fields['작성 시각']
    })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 20)
  };
}

async function writeGuestbook(req, body) {
  const visitor = await residentFor(req);
  const hostHouseId = String(body.houseId || '').trim();
  const message = String(body.message || '').trim();
  if (!hostHouseId) fail('집 ID가 필요해요.');
  if (message.length < 2 || message.length > 200) fail('방명록은 2~200자로 적어 주세요.');
  const hosts = await allRecords('이웃', `{집 ID}=${formulaValue(hostHouseId)}`);
  if (!hosts.length) fail('이 집에는 아직 이웃이 없어요.', 404);
  const host = hosts[0];
  if (host.fields['이웃 ID'] === visitor.fields['이웃 ID']) fail('내 집에는 방명록을 남길 수 없어요.');
  const created = await createRecord('방명록', {
    '집주인 ID': host.fields['이웃 ID'],
    '집주인': [host.id],
    '방문자 ID': visitor.fields['이웃 ID'],
    '방문자': [visitor.id],
    '방문자 별명': visitor.fields['별명'],
    '방문자 아바타': visitor.fields['아바타'],
    '메시지': message,
    '작성 시각': new Date().toISOString()
  });
  return { ok: true, id: created.id };
}

async function generateFeedback(problemTitle, tool, answer, nickname) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: `${TOCFE_SYSTEM}\n\n${nickname} 님이 "${problemTitle}" 문제를 ${tool}로 풀어서 제출했어요. 풀이를 읽고 따뜻하게 피드백해주세요. 잘한 점을 먼저 칭찬하고, 더 생각해볼 점이 있다면 질문 형태로 안내해주세요.`,
        messages: [{ role: 'user', content: answer }]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch { return null; }
}

async function submit(req, body) {
  const resident = await residentFor(req);
  const problemId = String(body.problemId || '').trim();
  const answer = String(body.answer || '').trim();
  if (answer.length < 20 || answer.length > 4000) fail('풀이를 20~4000자로 적어 주세요.');
  const problems = await allRecords('문제', `AND({문제 ID}=${formulaValue(problemId)},{공개}=TRUE())`);
  if (problems.length !== 1) fail('지금 풀 수 있는 문제가 아니에요.');
  const problem = problems[0];
  const existing = await allRecords('풀이', `AND({이웃 ID}=${formulaValue(resident.fields['이웃 ID'])},{문제 ID}=${formulaValue(problemId)})`);
  if (existing.length) fail('이 문제는 이미 제출했어요. 내 집에서 확인해 주세요.', 409);

  const feedback = await generateFeedback(problem.fields['제목'], problem.fields['생각도구'], answer, resident.fields['별명']);

  const solution = await createRecord('풀이', {
    '풀이 ID': recordId('T-S'), '이웃 ID': resident.fields['이웃 ID'],
    '문제 ID': problemId, '이웃': [resident.id], '문제': [problem.id],
    '풀이 내용': answer, '제출 시각': new Date().toISOString(), '생각나무': 1,
    ...(feedback ? { '모찌몽 피드백': feedback, '피드백 시각': new Date().toISOString() } : {})
  });
  return { id: solution.fields['풀이 ID'], trees: 1, hasFeedback: !!feedback };
}

function requireAdmin(req) {
  const key = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!process.env.ADMIN_KEY || !key || !equalHash(hash(key), hash(process.env.ADMIN_KEY))) fail('관리자 권한이 필요해요.', 403);
}

async function feedback(req, body) {
  requireAdmin(req);
  const solutionId = String(body.solutionId || '').trim();
  const feedback = String(body.feedback || '').trim();
  if (feedback.length < 5 || feedback.length > 2000) fail('피드백은 5~2000자로 적어 주세요.');
  const matches = await allRecords('풀이', `{풀이 ID}=${formulaValue(solutionId)}`);
  if (matches.length !== 1) fail('풀이를 찾을 수 없어요.', 404);
  await updateRecord('풀이', matches[0].id, { '모찌몽 피드백': feedback });
  return { ok: true };
}

async function reply(req, body) {
  requireAdmin(req);
  const questionId = String(body.questionId || '').trim();
  const answer = String(body.answer || '').trim();
  if (answer.length < 5 || answer.length > 2000) fail('답변은 5~2000자로 적어 주세요.');
  const matches = await allRecords('질문', `{질문 ID}=${formulaValue(questionId)}`);
  if (matches.length !== 1) fail('질문을 찾을 수 없어요.', 404);
  await updateRecord('질문', matches[0].id, { '모찌몽 답변': answer });
  return { ok: true };
}

async function pending(req) {
  requireAdmin(req);
  const all = await allRecords('질문', `{모찌몽 답변}=BLANK()`);
  return {
    questions: all.map(r => ({
      id: r.fields['질문 ID'],
      question: r.fields['질문 내용'],
      askedAt: r.fields['질문 시각'],
      residentId: r.fields['이웃 ID'],
    }))
  };
}

async function updateProfile(req, body) {
  const resident = await residentFor(req);
  let profileImage = String(body.profileImage || '').trim();

  // 파일 업로드인 경우 (base64 data URL)
  if (body.imageData && body.imageMediaType) {
    const data = body.imageData;
    const mediaType = body.imageMediaType;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) fail('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있어요.');
    if (data.length > 500_000) fail('이미지가 너무 커요. 500KB 이하로 올려주세요.');
    profileImage = `data:${mediaType};base64,${data}`;
  } else if (profileImage && !profileImage.match(/^https?:\/\/.+/i)) {
    fail('올바른 이미지 URL을 입력해 주세요.');
  }

  if (profileImage.length > 600_000) fail('이미지가 너무 커요.');
  await updateRecord('이웃', resident.id, { '프로필 이미지': profileImage || null });
  return { ok: true };
}

const CAFE_CATEGORIES = ['함께 풀어요', '정보 공유', '건의·제안', '자유 수다'];

async function cafeList() {
  const posts = await allRecords('카페');
  return {
    posts: posts.map(r => ({
      id: r.fields['글 ID'],
      authorId: r.fields['작성자 ID'],
      author: r.fields['작성자 별명'],
      avatar: r.fields['작성자 아바타'],
      category: r.fields['카테고리'],
      title: r.fields['제목'],
      content: r.fields['내용'],
      createdAt: r.fields['작성 시각']
    })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  };
}

async function cafeWrite(req, body) {
  const resident = await residentFor(req);
  const category = String(body.category || '').trim();
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!CAFE_CATEGORIES.includes(category)) fail('카테고리를 선택해 주세요.');
  if (title.length < 2 || title.length > 50) fail('제목은 2~50자로 적어 주세요.');
  if (content.length < 5 || content.length > 2000) fail('내용은 5~2000자로 적어 주세요.');
  const created = await createRecord('카페', {
    '작성자 ID': resident.fields['이웃 ID'],
    '작성자 별명': resident.fields['별명'],
    '작성자 아바타': resident.fields['아바타'],
    '카테고리': category,
    '제목': title,
    '내용': content,
    '작성 시각': new Date().toISOString()
  });
  return { ok: true, id: created.fields['글 ID'] };
}

const GALLERY_TOOLS = ['구름', '가지', '목표나무', '기타'];

async function galleryList() {
  const artworks = await allRecords('갤러리', `{공개}=TRUE()`);
  const residents = await allRecords('이웃');
  const residentMap = Object.fromEntries(residents.map(r => [r.id, r]));
  return {
    artworks: artworks.map(r => {
      const authorRecord = r.fields['작성자 ID']?.[0] ? residentMap[r.fields['작성자 ID'][0]] : null;
      return {
        id: r.fields['작품 ID'],
        recordId: r.id,
        title: r.fields['제목'],
        desc: r.fields['설명'],
        tool: r.fields['생각도구'],
        image: r.fields['이미지']?.[0]?.url || null,
        thumbnail: r.fields['이미지']?.[0]?.thumbnails?.large?.url || r.fields['이미지']?.[0]?.url || null,
        authorId: authorRecord?.fields['이웃 ID'],
        author: authorRecord?.fields['별명'] || '익명',
        avatar: authorRecord?.fields['아바타'] || '🌱',
        createdAt: r.fields['작성 시각']
      };
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  };
}

async function galleryUpload(req, body) {
  const resident = await residentFor(req);
  const title = String(body.title || '').trim();
  const desc = String(body.desc || '').trim();
  const tool = String(body.tool || '').trim();
  const imageData = body.imageData;
  const imageMediaType = body.imageMediaType;

  if (title.length < 2 || title.length > 50) fail('제목은 2~50자로 적어 주세요.');
  if (desc.length > 500) fail('설명은 500자 이내로 적어 주세요.');
  if (!GALLERY_TOOLS.includes(tool)) fail('생각도구 종류를 선택해 주세요.');
  if (!imageData || !imageMediaType) fail('이미지를 업로드해 주세요.');
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(imageMediaType)) fail('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있어요.');
  if (imageData.length > 3_000_000) fail('이미지가 너무 커요. 3MB 이하로 올려주세요.');

  const dataUrl = `data:${imageMediaType};base64,${imageData}`;
  const created = await createRecord('갤러리', {
    '작성자 ID': [resident.id],
    '제목': title,
    '설명': desc,
    '생각도구': tool,
    '이미지': [{ url: dataUrl }],
    '공개': true,
    '작성 시각': new Date().toISOString()
  });
  return { ok: true, id: created.fields['작품 ID'] };
}

async function galleryDetail(req, body) {
  const artworkId = String(body.artworkId || '').trim();
  if (!artworkId) fail('작품 ID가 필요해요.');
  const artworks = await allRecords('갤러리', `{작품 ID}=${formulaValue(artworkId)}`);
  if (!artworks.length) fail('작품을 찾을 수 없어요.', 404);
  const artwork = artworks[0];
  const residents = await allRecords('이웃');
  const residentMap = Object.fromEntries(residents.map(r => [r.id, r]));
  const authorRecord = artwork.fields['작성자 ID']?.[0] ? residentMap[artwork.fields['작성자 ID'][0]] : null;

  const comments = await allRecords('댓글', `{작품 ID}="${artwork.id}"`);
  return {
    artwork: {
      id: artwork.fields['작품 ID'],
      recordId: artwork.id,
      title: artwork.fields['제목'],
      desc: artwork.fields['설명'],
      tool: artwork.fields['생각도구'],
      image: artwork.fields['이미지']?.[0]?.url || null,
      authorId: authorRecord?.fields['이웃 ID'],
      author: authorRecord?.fields['별명'] || '익명',
      avatar: authorRecord?.fields['아바타'] || '🌱',
      createdAt: artwork.fields['작성 시각']
    },
    comments: comments.map(c => {
      const commenter = c.fields['작성자 ID']?.[0] ? residentMap[c.fields['작성자 ID'][0]] : null;
      return {
        id: c.fields['댓글 ID'],
        content: c.fields['내용'],
        author: commenter?.fields['별명'] || '익명',
        avatar: commenter?.fields['아바타'] || '🌱',
        createdAt: c.fields['작성 시각']
      };
    }).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  };
}

async function galleryComment(req, body) {
  const resident = await residentFor(req);
  const artworkRecordId = String(body.artworkRecordId || '').trim();
  const content = String(body.content || '').trim();
  if (!artworkRecordId) fail('작품 ID가 필요해요.');
  if (content.length < 2 || content.length > 300) fail('댓글은 2~300자로 적어 주세요.');
  const created = await createRecord('댓글', {
    '작품 ID': [artworkRecordId],
    '작성자 ID': [resident.id],
    '내용': content,
    '작성 시각': new Date().toISOString()
  });
  return { ok: true, id: created.fields['댓글 ID'] };
}

export default async function handler(req, res) {
  try {
    const op = new URL(req.url, 'http://localhost').searchParams.get('op');
    if (req.method === 'GET' && op === 'state') {
      if (req.headers['x-world-phone']) await applicantByPhone(String(req.headers['x-world-phone']).trim());
      else await residentFor(req);
      return send(res, 200, await publicState());
    }
    if (req.method === 'GET' && op === 'home') return send(res, 200, await home(req));
    if (req.method !== 'POST') return send(res, 404, { error: '찾을 수 없습니다.' });
    if (op === 'chat') return send(res, 200, await chat(req, await bodyOfLarge(req)));
    if (op === 'gallery-upload') return send(res, 201, await galleryUpload(req, await bodyOfLarge(req)));
    const body = await bodyOf(req);
    if (op === 'enter') {
      const applicant = await applicantByPhone(String(body.phone || '').trim());
      const residents = await allRecords('이웃', `{신청 레코드 ID}=${formulaValue(applicant.id)}`);
      return send(res, 200, { ok: true, resident: residents[0] ? publicResident(residents[0]) : null });
    }
    if (op === 'apply') return send(res, 201, await apply(body));
    if (op === 'submit') return send(res, 201, await submit(req, body));
    if (op === 'ask') return send(res, 201, await ask(req, body));
    if (op === 'visit') return send(res, 200, await visitNeighbor(req, body));
    if (op === 'guestbook') return send(res, 201, await writeGuestbook(req, body));
    if (op === 'feedback') return send(res, 200, await feedback(req, body));
    if (op === 'reply') return send(res, 200, await reply(req, body));
    if (op === 'pending') return send(res, 200, await pending(req));
    if (op === 'cafe') return send(res, 200, await cafeList());
    if (op === 'cafe-write') return send(res, 201, await cafeWrite(req, body));
    if (op === 'update-profile') return send(res, 200, await updateProfile(req, body));
    if (op === 'gallery') return send(res, 200, await galleryList());
    if (op === 'gallery-detail') return send(res, 200, await galleryDetail(req, body));
    if (op === 'gallery-comment') return send(res, 201, await galleryComment(req, body));
    return send(res, 404, { error: '찾을 수 없습니다.' });
  } catch (error) {
    if (!error.status) console.error(error);
    send(res, error.status || 500, { error: error.status ? error.message : '잠시 후 다시 시도해 주세요.' });
  }
}
