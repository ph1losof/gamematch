/** Opens the SQLite database with the schema's migrations applied, and names its handle types. */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

export function openDb(path = ':memory:') {
  const client = new Database(path, { strict: true });
  client.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  return db;
}

export type Db = ReturnType<typeof openDb>;
/** A transaction handle; functions that write money take `Db | Tx` so callers can compose them atomically. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

/** The row of an aggregate query without GROUP BY, which SQL always returns; drizzle's `.get()` can't know that. */
export function onlyRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('an aggregate query returned no row');
  return row;
}
