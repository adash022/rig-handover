// Plan morning-digest § 1. Types first, so every part of § 2 can start against them.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in the night's run log.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log: keep the row, the page shows `—`
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string; // the log's own `at`, offset kept (never converted to UTC)
  last: string;
};

// No file → 404. A file with no rows → "nothing ran".
export type Night =
  | { found: false }
  | { found: true; rows: DigestRow[]; badLines: number }; // badLines: lines that didn't parse

// Reads `<runsDir>/<night>.jsonl`. A bad line is counted, never thrown.
export type ReadNight = (runsDir: string, night: string) => Night;
