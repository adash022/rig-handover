import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    if (!night.found) throw new Error('night not found');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const row = (job: string) => night.rows.find((r) => r.job === job);

    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1 });
    expect(row('lane/sync')).toMatchObject({ retries: 1, first: '2026-10-28T23:00:06+01:00' });
  });

  it('returns found:false for a night with no file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    expect(readNight(dir, '2026-01-01')).toEqual({ found: false });
  });

  it('an empty file is found with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ found: true, rows: [], badLines: 0 });
  });

  it('counts bad lines, skips blank ones, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    const lines = [
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"retry","owner":"x","error":"boom"}',
      '',
      '   ',
      'not json',
      '{"at":"2026-01-01T02:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T03:00:00+01:00","status":"ok","owner":"x"}',
      '[1,2]',
      '{"at":"2026-01-01T04:00:00+01:00","job":"a","status":"fail","owner":"x"}',
    ];
    writeFileSync(join(dir, '2026-01-01.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-01');
    expect(night).toEqual({
      found: true,
      badLines: 5,
      rows: [
        {
          job: 'a',
          owner: 'x',
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: null,
          first: '2026-01-01T01:00:00+01:00',
          last: '2026-01-01T04:00:00+01:00',
        },
      ],
    });
  });
});
