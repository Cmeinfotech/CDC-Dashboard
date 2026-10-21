import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { buildAmazonAllWorkbook, writeAmazonAllWorkbook } from '../../../../services/amazonAllWorkbook.mjs';
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  try {
    const bytes = writeAmazonAllWorkbook(await buildAmazonAllWorkbook());
    return new Response(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="CDC-Amazon-All-Data-${new Date().toISOString().slice(0, 10)}.xlsx"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'Export could not be generated. Refresh and try again.' }, { status: 500 }); }
}
