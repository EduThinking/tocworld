import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [kind, publicId, file] = process.argv.slice(2);
if (!['solution', 'question'].includes(kind) || !publicId || !file) {
  console.error('사용법: node scripts/respond.mjs solution|question <풀이/질문 ID> <답변 텍스트 파일>'); process.exit(2);
}
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.resolve(site, '../../../skills/nodak-airtable/.env'), 'utf8');
const token = process.env.AIRTABLE_API_KEY || env.match(/^AIRTABLE_API_KEY=(.*)$/m)?.[1];
const baseId = process.env.AIRTABLE_BASE_ID || 'app90BBDWqJnar9Ve';
const answer = fs.readFileSync(file, 'utf8').trim();
if (answer.length < 5 || answer.length > 2000) throw new Error('답변 길이는 5~2000자여야 합니다.');
const table = kind === 'solution' ? '풀이' : '질문';
const idField = kind === 'solution' ? '풀이 ID' : '질문 ID';
const answerField = kind === 'solution' ? '모찌몽 피드백' : '모찌몽 답변';
const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let offset, record;
do {
  const url = new URL(baseUrl);
  if (offset) url.searchParams.set('offset', offset);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`조회 실패: ${response.status}`);
  const page = await response.json();
  record = page.records.find(r => r.fields[idField] === publicId);
  offset = page.offset;
} while (!record && offset);
if (!record) throw new Error(`${publicId}를 찾지 못했습니다.`);
if (record.fields[answerField]) throw new Error('이미 답변이 있습니다. 덮어쓰지 않았습니다.');
const saved = await fetch(`${baseUrl}/${record.id}`, { method: 'PATCH', headers, body: JSON.stringify({ fields: { [answerField]: answer } }) });
if (!saved.ok) throw new Error(`답변 저장 실패: ${saved.status}`);
console.log(`${table} ${publicId}: 답변 저장 완료`);
