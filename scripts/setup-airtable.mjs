import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.resolve(site, '../../../skills/nodak-airtable/.env'), 'utf8');
const token = process.env.AIRTABLE_API_KEY || envText.match(/^AIRTABLE_API_KEY=(.*)$/m)?.[1];
const baseId = process.env.AIRTABLE_BASE_ID || 'app90BBDWqJnar9Ve';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${response.status}: ${data.error?.message || JSON.stringify(data.error)}`);
  return data;
}
const field = (name, type = 'singleLineText', options) => ({ name, type, ...(options ? { options } : {}) });
const definitions = [
  { name: '집', fields: [field('집 ID')] },
  { name: '이웃', fields: [field('이웃 ID'), field('별명'), field('아바타'), field('집 ID'), field('입주증 해시'), field('입주 시각'), field('동의', 'checkbox', { icon: 'check', color: 'greenBright' })] },
  { name: '문제', fields: [field('문제 ID'), field('제목'), field('상황', 'multilineText'), field('장소'), field('생각도구'), field('공개', 'checkbox', { icon: 'check', color: 'greenBright' })] },
  { name: '풀이', fields: [field('풀이 ID'), field('이웃 ID'), field('문제 ID'), field('풀이 내용', 'multilineText'), field('모찌몽 피드백', 'multilineText'), field('생각나무', 'number', { precision: 0 }), field('제출 시각')] },
  { name: '질문', fields: [field('질문 ID'), field('이웃 ID'), field('질문 내용', 'multilineText'), field('모찌몽 답변', 'multilineText'), field('질문 시각')] }
];

let tables = (await request(metaUrl)).tables;
for (const definition of definitions) {
  if (!tables.some(table => table.name === definition.name)) {
    const created = await request(metaUrl, 'POST', definition);
    console.log(`표 생성: ${created.name}`);
    tables = (await request(metaUrl)).tables;
  }
}
for (const [sourceName, fieldName, targetName] of [['이웃', '집', '집'], ['풀이', '이웃', '이웃'], ['풀이', '문제', '문제'], ['질문', '이웃', '이웃']]) {
  const source = tables.find(table => table.name === sourceName);
  const target = tables.find(table => table.name === targetName);
  if (!source.fields.some(item => item.name === fieldName)) {
    await request(`${metaUrl}/${source.id}/fields`, 'POST', field(fieldName, 'multipleRecordLinks', { linkedTableId: target.id }));
    console.log(`연결 생성: ${sourceName}.${fieldName} → ${targetName}`);
    tables = (await request(metaUrl)).tables;
  }
}
const houses = JSON.parse(fs.readFileSync(path.resolve(site, '../t-village-houses.json'), 'utf8')).houses;
const houseTable = tables.find(table => table.name === '집');
const existing = await request(`https://api.airtable.com/v0/${baseId}/${houseTable.id}`);
const known = new Set(existing.records.map(record => record.fields['집 ID']));
const missing = houses.filter(house => !known.has(house.houseId));
if (missing.length) {
  await request(`https://api.airtable.com/v0/${baseId}/${houseTable.id}`, 'POST', { records: missing.map(house => ({ fields: { '집 ID': house.houseId } })) });
  console.log(`빈집 ${missing.length}개 생성`);
}
console.log(`완료: ${baseId} · 집 ${houses.length}개`);
