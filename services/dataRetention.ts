import { and, eq, inArray, lt } from 'drizzle-orm';
import { getDb } from '../db';
import { uploads, snapshotRows, detectedChanges, asinHistory } from '../db/schema';
import { retentionDays } from './amazonDataSecurity.mjs';

// Run on account access and from the scheduled maintenance command.
// The same scope used for reads is required for all deletion operations.
export async function expireAccountData(userId: string) {
  // Existing detailed orders require an explicit reviewed retention schedule.
  // Never silently delete customer data while deployment is being configured.
  if (process.env.DATA_RETENTION_APPROVED !== 'true') {
    if (process.env.NODE_ENV === 'production') throw Error('Approve and schedule database retention before enabling production access.');
    return;
  }
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays() * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  await db.transaction(async tx => {
    const expired = await tx.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.userId, userId), lt(uploads.createdAt, cutoff)));
    for (let start = 0; start < expired.length; start += 250) {
      const ids = expired.slice(start, start + 250).map(row => row.id);
      await tx.delete(snapshotRows).where(and(eq(snapshotRows.userId, userId), inArray(snapshotRows.uploadId, ids)));
      await tx.delete(uploads).where(and(eq(uploads.userId, userId), inArray(uploads.id, ids)));
    }
    await tx.delete(detectedChanges).where(and(eq(detectedChanges.userId, userId), lt(detectedChanges.createdAt, cutoff)));
    await tx.delete(asinHistory).where(and(eq(asinHistory.userId, userId), lt(asinHistory.mergedAt, cutoff)));
  });
}
