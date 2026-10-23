import { fileURLToPath } from 'node:url';
import { closeDb } from './db.js';
import { runCollection } from './repository.js';

export async function main() {
  try {
    const report = await runCollection();
    console.log(JSON.stringify(report));
    if (report.failedBoards > 0) process.exitCode = 1;
    return report;
  } finally {
    await closeDb();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
