import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { closeDb } from './db.js';
import { runCollection } from './repository.js';

const minutes = Number(process.env.COLLECTION_INTERVAL_MINUTES ?? 360);
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('COLLECTION_INTERVAL_MINUTES must be a positive number');

export async function main() {
  let stopped = false;
  let activeCollection = null;
  const aborter = new AbortController();
  let closing = null;
  const stop = async () => {
    stopped = true;
    aborter.abort();
    await activeCollection?.catch(() => {});
    if (!closing) closing = closeDb();
    await closing;
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });

  try {
    while (!stopped) {
      activeCollection = runCollection();
      try {
        const report = await activeCollection;
        console.log(JSON.stringify(report));
        if (report.failedBoards > 0) console.error(`${report.failedBoards} board collection(s) failed; retrying on the next interval`);
      } catch (error) {
        console.error(`Collection run failed; retrying on the next interval: ${error.message}`);
      } finally {
        activeCollection = null;
      }
      if (!stopped) {
        try { await sleep(minutes * 60_000, undefined, { signal: aborter.signal }); }
        catch (error) { if (error.name !== 'AbortError') throw error; }
      }
    }
  } finally {
    await stop();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
