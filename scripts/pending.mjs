import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.resolve(site, '../../../skills/nodak-airtable/.env'), 'utf8');
const token = process.env.AIRTABLE_API_KEY || env.match(/^AIRTABLE_API_KEY=(.*)$/m)?.[1];
const baseId = process.env.AIRTABLE_BASE_ID || 'app90BBDWqJnar9Ve';
const headers = { Authorization: `Bearer ${token}` };
async function rows(table) {
  let offset; const records = [];
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${table} 조회 실패: ${response.status}`);
    const data = await response.json(); records.push(...data.records); offset = data.offset;
  } while (offset);
  return records;
}
const [solutions, questions, residents, problems] = await Promise.all(['풀이', '질문', '이웃', '문제'].map(rows));
const byResident = new Map(residents.map(r => [r.fields['이웃 ID'], r.fields['별명']]));
const byProblem = new Map(problems.map(r => [r.fields['문제 ID'], r.fields['제목']]));
console.log(JSON.stringify({
  solutions: solutions.filter(r => !r.fields['모찌몽 피드백']).map(r => ({ id: r.fields['풀이 ID'], nickname: byResident.get(r.fields['이웃 ID']), problem: byProblem.get(r.fields['문제 ID']), answer: r.fields['풀이 내용'] })),
  questions: questions.filter(r => !r.fields['모찌몽 답변']).map(r => ({ id: r.fields['질문 ID'], nickname: byResident.get(r.fields['이웃 ID']), question: r.fields['질문 내용'] }))
}, null, 2));
