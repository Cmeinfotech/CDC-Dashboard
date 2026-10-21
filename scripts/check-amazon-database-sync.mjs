import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import mysql from 'mysql2/promise';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8')), ...process.env };
const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });
try {
  const [uploads] = await connection.execute("SELECT id, report_type AS reportType, valid_count AS validRows FROM uploads WHERE user_id = 'dashboard::cdc' ORDER BY report_type");
  const snapshots = [];
  for (const upload of uploads) {
    const [count] = await connection.execute('SELECT COUNT(*) AS rowCount FROM snapshot_rows WHERE upload_id = ?', [upload.id]);
    snapshots.push({ reportType: upload.reportType, rowCount: count[0].rowCount });
  }
  console.log(JSON.stringify({ uploads: uploads.map(({ id, ...upload }) => upload), snapshots }));
} finally { await connection.end(); }
