import { NextResponse } from "next/server";
import { AuthError, requireSession } from "../../../src/auth";
import { csv, opportunityRows } from "../../../src/csv.js";
import { getFeed } from "../../../src/repository.js";

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (typeof error === "object" && error && "status" in error && (error as { status?: unknown }).status === 400) {
    return NextResponse.json({ error: { code: "invalid_profile", message: "The requested profile does not exist." } }, { status: 400 });
  }
  return NextResponse.json({ error: { code: "export_unavailable", message: "The export is temporarily unavailable." } }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const profileId = new URL(request.url).searchParams.get("profileId") || undefined;
    if (profileId !== undefined && (profileId.length === 0 || profileId.length > 128)) {
      return NextResponse.json({ error: { code: "invalid_profile", message: "profileId must be between 1 and 128 characters." } }, { status: 400 });
    }
    const feed = await getFeed(profileId, { tenantId: session.tenantId, userId: session.userId, limit: 1000 });
    const opportunities = Array.isArray(feed?.opportunities) ? feed.opportunities : [];
    return new NextResponse(csv(opportunityRows(opportunities)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="tripwire-export.csv"',
        "cache-control": "no-store",
        "x-tripwire-exported-count": String(opportunities.length),
        "x-tripwire-export-limit": "1000",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
