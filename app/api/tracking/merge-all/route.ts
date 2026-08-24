import { mergeAllChanges, requestUserId } from "../../../../services/backendService";

export async function POST(request: Request) {
  try { return Response.json(await mergeAllChanges(requestUserId(request))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not merge ASIN changes." }, { status: 500 }); }
}
