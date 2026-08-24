import { requestUserId, trackingData } from "../../../services/backendService";
export async function GET(request: Request) { try { return Response.json(await trackingData(requestUserId(request))); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load tracking data." }, { status: 500 }); } }
