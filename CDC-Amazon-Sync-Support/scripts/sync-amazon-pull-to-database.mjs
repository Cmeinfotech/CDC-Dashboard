import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import mysql from 'mysql2/promise';
import { minimizeAmazonData, readAmazonJson } from '../services/amazonDataSecurity.mjs';
import { monitorState } from '../services/amazonMonitorStore.mjs';
import { catalogTrackingChanges } from '../services/catalogTrackingDiff.mjs';

const env = { ...parseEnv(await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))), ...process.env };
for (const key of ['AMAZON_DATA_KEY', 'AMAZON_MONITOR_DATA_DIR', 'AMAZON_ACCESS_REVOKED', 'AMAZON_DATA_RETENTION_DAYS']) if (env[key]) process.env[key] = env[key];
for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) if (!env[key]) throw Error(`${key} is required to synchronize Amazon data into the dashboard database.`);
if (env.DB_PASSWORD === undefined) throw Error('DB_PASSWORD is required to synchronize Amazon data into the dashboard database.');

const userId = env.CDC_DATA_OWNER_ID || 'dashboard::cdc';
const source = path.join(process.cwd(), 'outputs', 'amazon-cdc');
const catalog = await readAmazonJson(path.join(source, 'catalog.json'), null);
const orders = await readAmazonJson(path.join(source, 'order-report.json'), null);
if (!catalog?.rows?.length || !orders?.rows?.length) throw Error('A completed Amazon catalog and order-history pull is required before dashboard synchronization.');

const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4' });
const chunk = (values, size = 250) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const id = () => crypto.randomUUID();
const text = value => value == null ? '' : String(value);
const orderDate = row => text(row['purchase-date']);
const orderData = row => minimizeAmazonData({
  orderId: text(row['amazon-order-id']), merchantOrderId: text(row['merchant-order-id']), orderDate: orderDate(row), childAsin: text(row.asin), sku: text(row.sku), title: text(row['product-name']), quantity: Number(row.quantity ?? row['quantity-purchased'] ?? 0), currency: text(row.currency), itemPrice: Number(row['item-price'] || 0), itemTax: Number(row['item-tax'] || 0), shippingPrice: Number(row['shipping-price'] || 0), promotionDiscount: Number(row['item-promotion-discount'] || 0), status: text(row['order-status']), itemStatus: text(row['item-status']), fulfillmentChannel: text(row['fulfillment-channel']), salesChannel: text(row['sales-channel']), shipServiceLevel: text(row['ship-service-level']),
});
const catalogData = (row, product, parentAsin) => minimizeAmazonData({ ...row, Title: text(row['item-name'] || product?.title), Status: text(row.status), 'Parent SKU': text(row['parent-sku']), 'Parent ASIN': parentAsin, 'Parent/Child': product?.parentage || 'Unspecified' });
const validOrders = orders.rows.filter(row => text(row['amazon-order-id']) && orderDate(row));
const validCatalog = catalog.rows.filter(row => text(row.asin1) && text(row['seller-sku']));
const monitor = await monitorState();
if (!monitor.run?.complete || monitor.run.products?.length !== validCatalog.length) throw Error('A complete matching catalog monitor run is required; dashboard snapshots were preserved.');
const productBySku = new Map((monitor.run?.products || []).map(product => [product.sku, product]));
const now = new Date();
const rangeDates = validOrders.map(orderDate).map(Date.parse).filter(Number.isFinite);
const revenue = validOrders.reduce((sum, row) => sum + Number(row['item-price'] || 0), 0);

async function insertUpload(upload) {
  await connection.execute('INSERT INTO uploads (id, user_id, report_type, file_name, file_size, sheet_name, row_count, valid_count, invalid_count, parents_count, children_count, revenue_cents, changes_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', upload);
}
async function insertRows(rows) {
  for (const group of chunk(rows)) {
    await connection.execute(`INSERT INTO snapshot_rows (upload_id, user_id, report_type, record_key, asin, parent_asin, sku, month, data) VALUES ${group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`, group.flatMap(row => [row.uploadId, userId, row.type, row.recordKey, row.asin, row.parentAsin, row.sku, row.month, JSON.stringify(row.data)]));
  }
}
try {
  await connection.beginTransaction();
  const [previousUploads] = await connection.execute("SELECT id FROM uploads WHERE user_id = ? AND report_type = 'catalog' ORDER BY created_at DESC, id DESC LIMIT 1", [userId]);
  const previousUploadId = previousUploads[0]?.id || null;
  const [previousCatalog] = previousUploadId ? await connection.execute('SELECT asin, sku, data FROM snapshot_rows WHERE upload_id = ?', [previousUploadId]) : [[]];
  if (previousCatalog.length && validCatalog.length < previousCatalog.length * 0.8) throw Error('New catalog has fewer than 80% of the previous listings; existing tracking data was preserved for review.');
  const [oldOrderUploads] = await connection.execute("SELECT id FROM uploads WHERE user_id = ? AND report_type = 'orders' AND file_name = 'Amazon Two-Year Order History'", [userId]);
  for (const upload of oldOrderUploads) await connection.execute('DELETE FROM uploads WHERE id = ? AND user_id = ?', [upload.id, userId]);

  const catalogUpload = id(); const orderUpload = id();
  const catalogRows = validCatalog.map((row, index) => {
    const product = productBySku.get(text(row['seller-sku']));
    const parentAsin = product?.parentAsins?.[0] || text(row.asin1);
    return { uploadId: catalogUpload, type: 'catalog', recordKey: `${text(row.asin1)}:${index}`, asin: text(row.asin1), parentAsin, sku: text(row['seller-sku']), month: '', data: catalogData(row, product, parentAsin) };
  });
  const changes = catalogTrackingChanges(previousCatalog.map(row => ({ ...row, data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data })), catalogRows);
  await insertUpload([catalogUpload, userId, 'catalog', 'Amazon Catalog Live Sync', 0, 'Amazon Catalog', catalog.rows.length, validCatalog.length, catalog.rows.length - validCatalog.length, 0, new Set(validCatalog.map(row => text(row.asin1))).size, 0, changes.length, now]);
  await insertUpload([orderUpload, userId, 'orders', 'Amazon Two-Year Order History', 0, 'Amazon Orders', orders.rows.length, validOrders.length, orders.rows.length - validOrders.length, 0, new Set(validOrders.map(row => text(row.asin))).size, Math.round(revenue * 100), 0, now]);
  await insertRows(catalogRows);
  for (const group of chunk(changes, 100)) {
    await connection.execute(`INSERT INTO detected_changes (id, user_id, previous_upload_id, current_upload_id, kind, asin, sku, parent_sku, product, previous_asin, current_asin, details, status, confidence, created_at) VALUES ${group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`, group.flatMap(change => [id(), userId, previousUploadId, catalogUpload, change.kind, change.asin, change.sku, change.parentSku, change.product, change.previousAsin, change.currentAsin, JSON.stringify(change.details), change.status, change.confidence, now]));
  }
  await insertRows(validOrders.map((row, index) => ({ uploadId: orderUpload, type: 'orders', recordKey: `${text(row['amazon-order-id'])}:${index}`, asin: text(row.asin), parentAsin: '', sku: text(row.sku), month: '', data: orderData(row) })));
  await connection.commit();
  console.log(JSON.stringify({ status: 'complete', userId, catalogRows: validCatalog.length, orderRows: validOrders.length, changes: changes.length, start: new Date(rangeDates.reduce((minimum, date) => Math.min(minimum, date), Infinity)).toISOString().slice(0, 10), end: new Date(rangeDates.reduce((maximum, date) => Math.max(maximum, date), -Infinity)).toISOString().slice(0, 10) }));
} catch (error) {
  await connection.rollback().catch(() => {});
  throw error;
} finally { await connection.end(); }
