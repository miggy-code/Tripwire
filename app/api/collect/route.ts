import { NextResponse } from "next/server";
import { APP_URL_SETUP_MESSAGE, hasValidCronBearer, isOperator, isSameOrigin } from "../../../src/access.js";
import { AuthError, requireSession } from "../../../src/auth";
import { runCollection } from "../../../src/repository.js";

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "collection_unavailable", message: "Collection could not run." } }, { status: 503 });
}

export async function POST(request: Request) {
  try {
    if (!process.env.APP_URL) {
      return NextResponse.json({ error: { code: "app_not_configured", message: APP_URL_SETUP_MESSAGE } }, { status: 503 });
    }
    if (!isSameOrigin(request.headers.get("origin"))) {
      return NextResponse.json({ error: { code: "cross_origin", message: "Collection requests must come from this application's origin." } }, { status: 403 });
    }
    const session = await requireSession();
    if (!isOperator(session.userId)) {
      return NextResponse.json({ error: { code: "operator_required", message: "Only configured Tripwire operators can start collection." } }, { status: 403 });
    }
    return NextResponse.json(await runCollection());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    if (!hasValidCronBearer(request.headers.get("authorization"))) {
      return NextResponse.json({ error: { code: "cron_unauthorized", message: "A configured cron bearer token is required." } }, { status: 401 });
    }
    return NextResponse.json(await runCollection());
  } catch (error) {
    return errorResponse(error);
  }
}
