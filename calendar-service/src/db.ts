import { readdirSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

export type Row = Record<string, any>;

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs a script of several statements (no parameters), e.g. a migration file. */
  exec(sql: string): Promise<void>;
}

/** The only thing the rest of the service knows about storage. Production uses Postgres; tests and local dev use PGlite. */
export interface Db extends Queryable {
  /** Runs fn inside one transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type SslMode = 'off' | 'require' | 'verify';

export function createPgDb(connectionString: string, opts: { ssl?: SslMode; caCert?: string } = {}): Db {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
  const mode: SslMode = opts.ssl ?? (local ? 'off' : 'require');
  const ssl = mode === 'off' ? false : mode === 'verify' ? { ca: opts.caCert, rejectUnauthorized: true } : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString, ssl, max: 5 });
  pool.on('error', (e) => console.error('postgres pool error', e.message));
  return {
    async query(sql, params) {
      return (await pool.query(sql, params as unknown[])).rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          query: async (sql, params) => (await client.query(sql, params as unknown[])).rows,
          exec: async (sql) => void (await client.query(sql)),
        });
        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** In-memory (no dir) or file-backed Postgres engine running inside this process. */
export function createPgliteDb(dir?: string): Db {
  if (dir) mkdirSync(dir, { recursive: true });
  const db = dir ? new PGlite(dir) : new PGlite();
  return {
    async query(sql, params) {
      return (await db.query(sql, params as unknown[])).rows as any[];
    },
    async exec(sql) {
      await db.exec(sql);
    },
    tx: (fn) =>
      db.transaction((t) =>
        fn({
          query: async (sql, params) => (await t.query(sql, params as unknown[])).rows as any[],
          exec: async (sql) => void (await t.exec(sql)),
        }),
      ),
    close: () => db.close(),
  };
}

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Applies any migrations/*.sql not yet recorded in calendar.schema_migrations, in filename order. */
export async function migrate(db: Db, dir = MIGRATIONS): Promise<string[]> {
  await db.query('create schema if not exists calendar');
  await db.query('create table if not exists calendar.schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from calendar.schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const name = file.replace(/\.sql$/, '');
    if (done.has(name)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.tx((q) => q.exec(sql));
    await db.query('insert into calendar.schema_migrations (name) values ($1) on conflict do nothing', [name]);
    applied.push(name);
  }
  return applied;
}
