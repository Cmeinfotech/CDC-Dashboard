import { boundedBytes } from '../../../../../services/boundedBody.mjs';
import { accessGuard } from '../../../../../services/accessSecurity.mjs';
import { verifyAdminPassword } from '../../../../../services/adminSecurity.mjs';
import { reverseMerge } from '../../../../../services/amazonMonitorStore.mjs';

export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  try {
    const text = new TextDecoder().decode(await boundedBytes(request, 4096));
    const body = JSON.parse(text);
    if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id) || body.confirm !== true) return Response.json({ error: 'Confirm the selected merge reversal.' }, { status: 400 });
    const result = await verifyAdminPassword(request, body.password);
    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    await reverseMerge(body.id, result.user.userId);
    return Response.json({ status: 'Reversed' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json({ error: ['Merge is no longer active. Refresh and review the latest mapping.', 'A newer Amazon relationship exists. Review it before reversing.', 'This merge cannot be reversed.'].includes(message) ? message : 'Reversal failed. Refresh and try again.' }, { status: 409 });
  }
}
