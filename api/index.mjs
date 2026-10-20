import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { allRecords, createRecord, updateRecord, deleteRecord, formulaValue } from './db.mjs';

const AVATARS = ['🌱', '🐿️', '🦊', '🐻', '🐰', '🦉'];
const MAX_BODY = 12_000;
const MAX_CHAT_BODY = 3_500_000;

const TOCFE_SYSTEM = `너는 TOCfE(Theory of Constraints for Education) 생각도구 전문 튜터 '모찌몽'이야. TOC월드에서 이웃들과 함께 TOCfE를 배우고 실천한다.

TOCfE 주요 생각도구:
• 목표나무(IO Map/Goal Tree): 원하는 것을 꼭대기에 두고, 그것이 이루어지려면 무엇이 필요한지 아래로 펼쳐가는 도구
• 갈등구름(Conflict Cloud/EC): 충돌하는 욕구 사이에서 해결책을 찾는 도구. A→B→D, A→C→D' 구조
• 현실나무(CRT): 현재 불만족스러운 것(UDE)들의 공통 근본원인을 찾는 인과지도
• 미래나무(FRT): 해결책 실행 후 어떻게 달라지는지 그리는 인과지도
• 전제조건나무(PRT): 큰 목표로 가는 중간 이정표들을 찾는 도구

응답 규칙: 한국어로 따뜻하게, 200자 이내 핵심만, 스스로 생각할 수 있게 질문으로 이끌어줘.`;

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
  return { nickname: record.fields['별명'], avatar: record.fields['아바타'], houseId: record.fields['집 ID'] };
}

async function publicState() {
  const [houses, residents, problems] = await Promise.all([
    allRecords('집'), allRecords('이웃'), allRecords('문제')
  ]);
  const byHouse = new Map(residents.map(r => [r.fields['집 ID'], publicResident(r)]));
  return {
    houses: houses.map(r => ({ id: r.fields['집 ID'], resident: byHouse.get(r.fields['집 ID']) || null })).sort((a,b) => a.id.localeCompare(b.id)),
    problems: problems.filter(r => r.fields['공개']).map(r => ({
      id: r.fields['문제 ID'], title: r.fields['제목'], situation: r.fields['상황'], place: r.fields['장소'], tool: r.fields['생각도구']
    }))
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
  const [solutions, questions] = await Promise.all([
    allRecords('풀이', `{이웃 ID}=${formulaValue(resident.fields['이웃 ID'])}`),
    allRecords('질문', `{이웃 ID}=${formulaValue(resident.fields['이웃 ID'])}`)
  ]);
  return {
    resident: publicResident(resident),
    treeCount: solutions.reduce((sum, r) => sum + (Number(r.fields['생각나무']) || 0), 0),
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

async function submit(req, body) {
  const resident = await residentFor(req);
  const problemId = String(body.problemId || '').trim();
  const answer = String(body.answer || '').trim();
  if (answer.length < 20 || answer.length > 4000) fail('풀이를 20~4000자로 적어 주세요.');
  const problems = await allRecords('문제', `AND({문제 ID}=${formulaValue(problemId)},{공개}=TRUE())`);
  if (problems.length !== 1) fail('지금 풀 수 있는 문제가 아니에요.');
  const existing = await allRecords('풀이', `AND({이웃 ID}=${formulaValue(resident.fields['이웃 ID'])},{문제 ID}=${formulaValue(problemId)})`);
  if (existing.length) fail('이 문제는 이미 제출했어요. 내 집에서 확인해 주세요.', 409);
  const solution = await createRecord('풀이', {
    '풀이 ID': recordId('T-S'), '이웃 ID': resident.fields['이웃 ID'],
    '문제 ID': problemId, '이웃': [resident.id], '문제': [problems[0].id],
    '풀이 내용': answer, '제출 시각': new Date().toISOString(), '생각나무': 1
  });
  return { id: solution.fields['풀이 ID'], trees: 1 };
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
    const body = await bodyOf(req);
    if (op === 'enter') {
      const applicant = await applicantByPhone(String(body.phone || '').trim());
      const residents = await allRecords('이웃', `{신청 레코드 ID}=${formulaValue(applicant.id)}`);
      return send(res, 200, { ok: true, resident: residents[0] ? publicResident(residents[0]) : null });
    }
    if (op === 'apply') return send(res, 201, await apply(body));
    if (op === 'submit') return send(res, 201, await submit(req, body));
    if (op === 'ask') return send(res, 201, await ask(req, body));
    if (op === 'feedback') return send(res, 200, await feedback(req, body));
    if (op === 'reply') return send(res, 200, await reply(req, body));
    return send(res, 404, { error: '찾을 수 없습니다.' });
  } catch (error) {
    if (!error.status) console.error(error);
    send(res, error.status || 500, { error: error.status ? error.message : '잠시 후 다시 시도해 주세요.' });
  }
}
