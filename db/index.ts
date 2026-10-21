import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";

let database: MySql2Database<typeof schema> | undefined;

export const isDatabaseConfigured = () => Boolean(
  // An empty password is valid for the local XAMPP development root account.
  // Check that the variable exists rather than requiring a truthy value.
  process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD !== undefined && process.env.DB_NAME,
);

export function getDb(): MySql2Database<typeof schema> {
  if (database) return database;
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  if (!isDatabaseConfigured() || !host || !user || password === undefined || !name) {
    throw new Error("MySQL is not configured. Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME in .env.");
  }
  if (process.env.NODE_ENV === 'production' && process.env.DB_ENCRYPTION_VERIFIED !== 'true') throw new Error('Verify encrypted database volumes and backups before enabling production data access.');
  if (process.env.NODE_ENV === 'production' && host !== 'localhost' && host !== '127.0.0.1' && !process.env.DB_SSL_CA) throw new Error('Remote production database connections require a trusted TLS CA.');
  const pool = createPool({ host, port: Number(process.env.DB_PORT || 3306), user, password, database: name, ...(process.env.DB_SSL_CA ? { ssl: { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true, verifyIdentity: true } } : {}), waitForConnections: true, connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10), charset: "utf8mb4" });
  database = drizzle({ client: pool, schema, mode: "default" });
  return database;
}
