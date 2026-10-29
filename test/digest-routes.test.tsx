import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

type DigestJson = { night: string; rows: DigestRow[]; badLines: number };

const GOOD = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-11-09';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Written out of job order on purpose: the routes must sort.
const goodNight = [
  line('2026-11-01T23:10:00+01:00', 'c/orphan', 'ok', null),
  line('2026-11-02T00:10:00+01:00', 'b/broken', 'ok', 'rook'),
  line('2026-11-02T01:10:00+01:00', 'a/flaky', 'retry', 'rook', 'upstream 503'),
  line('2026-11-02T01:11:00+01:00', 'a/flaky', 'retry', 'rook', 'upstream 503'),
  line('2026-11-02T01:12:00+01:00', 'a/flaky', 'retry', 'rook', 'upstream 503'),
  line('2026-11-02T01:13:00+01:00', 'a/flaky', 'ok', 'rook'),
  line('2026-11-02T04:00:00+01:00', 'b/broken', 'fail', 'rook', 'quota exceeded'),
].join('\n');

const badNight = [
  line('2026-11-03T23:00:00+01:00', 'a/sync', 'ok', 'rook'),
  '{"at":"2026-11-04T00:00:00+01:00","job":"a/sy',
  line('2026-11-04T01:00:00+01:00', 'b/backup', 'ok', 'rook'),
].join('\n');

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${GOOD}.jsonl`), `${goodNight}\n`);
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), `${badNight}\n`);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

// The <tr> chunk of the page that holds `job`.
const rowOf = (html: string, job: string) => {
  const chunk = html.split('<tr').find((c) => c.includes(job));
  if (!chunk) throw new Error(`no row for ${job} in the page`);
  return chunk.split('</tr>')[0] ?? '';
};
const isWarn = (row: string) => /class="[^"]*\bwarn\b/.test(row);

describe('GET /digest/:night', () => {
  it('renders the good night with 200', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['a/flaky', 'b/broken', 'c/orphan']) expect(html).toContain(job);
  });

  it('marks retries >= 3 and last status fail as warn, nothing else', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    expect(isWarn(rowOf(html, 'a/flaky'))).toBe(true);
    expect(isWarn(rowOf(html, 'b/broken'))).toBe(true);
    expect(isWarn(rowOf(html, 'c/orphan'))).toBe(false);
  });

  it('shows a null owner as —', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    expect(rowOf(html, 'c/orphan')).toContain('—');
  });

  it('404s for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for the empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders the night with a bad line and counts it', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/\b1 line(\(s\)|s)? could not be read/);
    expect(html).toContain('a/sync');
    expect(html).toContain('b/backup');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows and badLines for the good night, sorted by job', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['a/flaky', 'b/broken', 'c/orphan']);
    expect(body.rows.find((r) => r.job === 'a/flaky')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'b/broken')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(body.rows.find((r) => r.job === 'c/orphan')?.owner).toBeNull();
  });

  it('404s with { error: "no such night" } for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows for the empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('reports badLines 1 for the night with one bad line', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/sync', 'b/backup']);
  });
});

describe('page and JSON agree', () => {
  it.each([GOOD, BAD])('lists the jobs of %s in the same order', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as DigestJson;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
