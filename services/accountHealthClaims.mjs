import { monitorRoot, readJson, atomicJson } from './amazonMonitorStore.mjs';
import { amazonRequest } from './amazonSpApi.ts';
import { join } from 'node:path';
function amountFor(event) {
    const lines = [
        ...(event.OrderChargeAdjustmentList ?? []).map(charge => charge.ChargeAmount),
        ...(event.ShipmentItemAdjustmentList ?? []).flatMap(item => (item.ItemChargeAdjustmentList ?? []).map(charge => charge.ChargeAmount)),
    ].filter((amount) => typeof amount?.CurrencyAmount === 'number' && Boolean(amount.CurrencyCode));
    const currencies = [...new Set(lines.map(line => line.CurrencyCode))];
    if (!lines.length || currencies.length !== 1)
        return { amount: null, currency: currencies.length ? 'Mixed currencies' : null };
    return { amount: Math.abs(lines.reduce((sum, line) => sum + line.CurrencyAmount, 0)), currency: currencies[0] };
}
export async function pullAccountHealthClaims() {
    try {
        const report = await readJson(join(monitorRoot(), 'account-health.json'));
        if (!report)
            return { available: false, events: [], reason: 'No saved Amazon Account Health report.' };
        const before = new Date(Date.now() - 3 * 60_000);
        const after = new Date(before);
        after.setUTCFullYear(after.getUTCFullYear() - 1);
        after.setUTCHours(0, 0, 0, 0);
        const reportingRange = { startDate: after.toISOString().slice(0, 10), endDate: before.toISOString().slice(0, 10) };
        const windows = [];
        for (let end = before.getTime(); end > after.getTime();) {
            const start = Math.max(after.getTime(), end - 180 * 86400_000);
            windows.push({ after: new Date(start).toISOString(), before: new Date(end).toISOString() });
            end = start;
        }
        const events = [];
        let nextToken;
        let pages = 0;
        for (const window of windows) {
        do {
            const query = new URLSearchParams({ MaxResultsPerPage: '100', PostedAfter: window.after, PostedBefore: window.before });
            if (nextToken)
                query.set('NextToken', nextToken);
            await new Promise(resolve => setTimeout(resolve, 2100));
            const response = await amazonRequest(`/finances/v0/financialEvents?${query.toString()}`);
            const payload = response.data.payload;
            for (const event of payload?.FinancialEvents?.GuaranteeClaimEventList ?? []) {
                const amount = amountFor(event);
                events.push({ dateFiled: event.PostedDate ?? null, orderId: event.AmazonOrderId ?? event.SellerOrderId ?? null, amount: amount.amount, currency: amount.currency });
            }
            nextToken = payload?.NextToken;
            pages++;
            const capturedAt = new Date().toISOString();
            await atomicJson(join(monitorRoot(), 'account-health-claims-progress.json'), { pages, claimCount: events.length, updatedAt: capturedAt, reportingRange });
            {
                await atomicJson(join(monitorRoot(), 'account-health-claims.json'), { available: true, events: [...events].sort((a, b) => (b.dateFiled ?? '').localeCompare(a.dateFiled ?? '')), truncated: Boolean(nextToken) || window !== windows.at(-1), capturedAt, reportingRange, source: 'SP-API Finances API · GuaranteeClaimEventList' });
            }
        } while (nextToken);
        }
        events.sort((a, b) => (b.dateFiled ?? '').localeCompare(a.dateFiled ?? ''));
        return { available: true, events, reportingRange, pagesLoaded: pages, source: 'SP-API Finances API · GuaranteeClaimEventList' };
    }
    catch (error) {
        return { available: false, events: [], reason: error instanceof Error ? error.message : 'Amazon claim events could not be loaded.' };
    }
}
