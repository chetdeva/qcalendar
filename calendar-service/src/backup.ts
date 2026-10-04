import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';

const [src = process.env.DB_PATH ?? './data/calendar.db', dest = './data/backup.db'] = process.argv.slice(2);
rmSync(dest, { force: true });
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`);
db.close();
console.log(`backup written to ${dest}`);
