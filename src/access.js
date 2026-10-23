import { timingSafeEqual } from "node:crypto";

export const CLERK_SETUP_MESSAGE = "Authentication is unavailable. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, then restart Tripwire.";
export const APP_URL_SETUP_MESSAGE = "This action is unavailable. Set APP_URL to this deployment's exact origin, then restart Tripwire.";

export function configuredClerkKeys(env = process.env) {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim());
}

export function tenantKey({ userId, orgId }) {
  if (typeof userId !== "string" || userId.length === 0) return null;
  return typeof orgId === "string" && orgId.length > 0 ? `org:${orgId}` : `user:${userId}`;
}

export function isOperator(userId, env = process.env) {
  if (typeof userId !== "string" || userId.length === 0) return false;
  const allowed = (env.TRIPWIRE_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}

export function hasStrongCronSecret(env = process.env) {
  return typeof env.CRON_SECRET === "string" && env.CRON_SECRET.length >= 32;
}

export function bearerToken(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

/** Compare fixed-size buffers to avoid a secret-dependent early exit. */
export function constantTimeEqual(expected, received) {
  if (typeof expected !== "string" || typeof received !== "string") return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function hasValidCronBearer(header, env = process.env) {
  if (!hasStrongCronSecret(env)) return false;
  return constantTimeEqual(env.CRON_SECRET, bearerToken(header));
}

export function isSameOrigin(origin, env = process.env) {
  if (typeof origin !== "string" || !env.APP_URL) return false;
  try {
    return new URL(origin).origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

export function validFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return typeof input.opportunityId === "string"
    && input.opportunityId.length > 0
    && input.opportunityId.length <= 512
    && ["relevant", "irrelevant"].includes(input.label)
    && Object.keys(input).every((key) => ["opportunityId", "label"].includes(key));
}
