const baseId = () => process.env.AIRTABLE_BASE_ID;
const token = () => process.env.AIRTABLE_API_KEY;

export async function airtable(table, method = 'GET', options = {}) {
  if (!baseId() || !token()) throw new Error('Airtable 환경변수가 설정되지 않았습니다.');
  const url = new URL(`https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}`);
  if (options.filter) url.searchParams.set('filterByFormula', options.filter);
  if (options.maxRecords) url.searchParams.set('maxRecords', String(options.maxRecords));
  if (options.offset) url.searchParams.set('offset', options.offset);
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Airtable ${response.status}: ${data.error?.message || '요청 실패'}`);
  return data;
}

export async function allRecords(table, filter) {
  const records = [];
  let offset;
  do {
    const page = await airtable(table, 'GET', { filter, offset });
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

export async function createRecord(table, fields) {
  const data = await airtable(table, 'POST', { body: { records: [{ fields }] } });
  return data.records[0];
}

export async function updateRecord(table, id, fields) {
  const url = `https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}/${id}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Airtable ${response.status}: ${data.error?.message || '수정 실패'}`);
  return data;
}

export async function deleteRecord(table, id) {
  const url = `https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}/${id}`;
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error(`Airtable ${response.status}: 삭제 실패`);
}

export function formulaValue(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
