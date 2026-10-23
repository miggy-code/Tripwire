import { NextResponse } from "next/server";
import { APP_URL_SETUP_MESSAGE, isSameOrigin, validFeedback } from "../../../src/access.js";
import { AuthError, requireSession } from "../../../src/auth";
import { saveFeedback } from "../../../src/repository.js";

const MAX_BODY_BYTES = 8 * 1024;

async function readBodyWithinLimit(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("body_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return NextResponse.json({ error: { code: "feedback_unavailable", message: "Feedback could not be saved." } }, { status: 503 });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!process.env.APP_URL) {
      return NextResponse.json({ error: { code: "app_not_configured", message: APP_URL_SETUP_MESSAGE } }, { status: 503 });
    }
    if (!isSameOrigin(origin)) {
      return NextResponse.json({ error: { code: "cross_origin", message: "Feedback requests must come from this application's origin." } }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: { code: "invalid_content_type", message: "Feedback requires application/json." } }, { status: 415 });
    }
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: { code: "body_too_large", message: "Feedback must be 8 KB or smaller." } }, { status: 413 });
    }
    // Establish the session before consuming a potentially attacker-controlled body.
    const session = await requireSession();
    let rawBody: string;
    try {
      rawBody = await readBodyWithinLimit(request);
    } catch (error) {
      if (error instanceof RangeError) {
        return NextResponse.json({ error: { code: "body_too_large", message: "Feedback must be 8 KB or smaller." } }, { status: 413 });
      }
      throw error;
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: { code: "body_too_large", message: "Feedback must be 8 KB or smaller." } }, { status: 413 });
    }
    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: { code: "invalid_json", message: "Feedback must be valid JSON." } }, { status: 400 });
    }
    if (!validFeedback(input)) {
      return NextResponse.json({ error: { code: "invalid_feedback", message: "Feedback requires an opportunityId and a relevant or irrelevant label." } }, { status: 400 });
    }
    const feedbackInput = input as { opportunityId: string; label: "relevant" | "irrelevant" };
    const feedback = await saveFeedback({
      tenantId: session.tenantId,
      userId: session.userId,
      opportunityId: feedbackInput.opportunityId,
      label: feedbackInput.label,
    });
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    return errorResponse(error);
  }
}
