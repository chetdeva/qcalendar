import { createPgDb, createPgliteDb, migrate, type SslMode } from '../src/db.ts';
import { migrateFromSqlite } from '../src/migrate-sqlite.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const sqlitePath = flag('sqlite');
const ownerId = flag('owner');
const apply = args.includes('--apply');
if (!sqlitePath || !ownerId) {
  console.error('usage: npm run migrate-sqlite -- --sqlite ./data/dev.db --owner <teacher user id> [--owner-email e] [--owner-name n] [--apply]');
  console.error('Without --apply nothing is written; it only reports what would be copied.');
  process.exit(1);
}
const env = process.env;
const db = env.DATABASE_URL ? createPgDb(env.DATABASE_URL, { ssl: env.DATABASE_SSL as SslMode | undefined, caCert: env.DATABASE_CA_CERT }) : createPgliteDb(env.PGLITE_DIR ?? './data/pglite');
await migrate(db);
const r = await migrateFromSqlite(db, { sqlitePath, ownerId, ownerEmail: flag('owner-email'), ownerName: flag('owner-name'), apply });
console.log(`${apply ? 'Copied' : 'Would copy'} ${r.inserted} of ${r.total} classes (${r.participants} students); ${r.skipped} already there.`);
if (!apply && r.inserted) console.log('Run again with --apply to write them.');
await db.close();
