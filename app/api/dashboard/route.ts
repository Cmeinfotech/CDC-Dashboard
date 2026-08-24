import { dashboardData, requestUserId } from "../../../services/backendService";
export async function GET(request: Request) { try { return Response.json(await dashboardData(requestUserId(request))); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load dashboard." }, { status: 500 }); } }
