import type { DigestRow } from '../digest/types.js';

const dash = '—';

// Plan morning-digest § 2a. Retries of 3 or more, or a last status of fail, mark the row.
const isWarn = (row: DigestRow) => row.retries >= 3 || row.lastStatus === 'fail';

export function Digest(props: { night: string; rows: DigestRow[]; badLines: number }) {
  const { night, rows, badLines } = props;
  return (
    <>
      <h1>digest · {night}</h1>
      {badLines > 0 && (
        <p class="warn">
          {badLines} {badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      )}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0))
              .map((row) => (
                <tr class={isWarn(row) ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? dash}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus ?? dash}</td>
                  <td>{row.lastError ?? dash}</td>
                  <td>{row.first ?? dash}</td>
                  <td>{row.last ?? dash}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  );
}
