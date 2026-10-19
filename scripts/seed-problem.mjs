import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.resolve(site, '../../../skills/nodak-airtable/.env'), 'utf8');
const token = process.env.AIRTABLE_API_KEY || env.match(/^AIRTABLE_API_KEY=(.*)$/m)?.[1];
const baseId = process.env.AIRTABLE_BASE_ID || 'app90BBDWqJnar9Ve';
const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent('문제')}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const existing = await (await fetch(url, { headers })).json();
if (!existing.records?.some(record => record.fields['문제 ID'] === 'T-P001')) {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ records: [{ fields: {
    '문제 ID': 'T-P001', '제목': '하고 싶은 일은 많은데 시간이 부족해요',
    '상황': '이번 주에 하고 싶은 일이 여러 가지인데 시간이 모자라요. 목표나무를 그려 내가 정말 이루고 싶은 목표, 걸림돌, 첫 디딤돌을 찾아볼까요? 이 문제는 첫 시범용 예시이며 자신의 상황으로 바꾸어 풀어도 좋아요.',
    '장소': '광장', '생각도구': '목표나무', '공개': true
  } }] }) });
  if (!response.ok) throw new Error(`문제 생성 실패: ${response.status}`);
  console.log('첫 시범 문제 T-P001 생성');
} else console.log('첫 시범 문제 T-P001 이미 있음');
