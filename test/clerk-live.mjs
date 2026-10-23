// Opt-in development verification. Run only with a local Tripwire server:
// node --env-file=.env.local test/clerk-live.mjs
// It creates two metadata-marked Clerk development users and removes them in finally.
import { createClerkClient } from "@clerk/backend";
import { randomUUID } from "node:crypto";
import pg from "pg";

const BASE_URL = process.env.TRIPWIRE_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const APP_ORIGIN = process.env.APP_URL;
const RUN_ID = `tripwire-live-${randomUUID()}`;
const createdUsers = [];
const createdSessions = [];
let checks = 0;

function assert(condition, name) {
  if (!condition) throw new Error(`Verification failed: ${name}`);
  checks += 1;
}

function configuredDevelopmentKeys() {
  return process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")
    && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_");
}

function localBaseUrl() {
  try {
    const url = new URL(BASE_URL);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function matchingAppOrigin() {
  try {
    return Boolean(APP_ORIGIN) && new URL(BASE_URL).origin === new URL(APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

async function request(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(new URL(path, BASE_URL), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function json(response, name) {
  assert(response.headers.get("content-type")?.includes("application/json"), `${name} JSON response`);
  return response.json();
}

async function createTestIdentity(client, label) {
  const user = await client.users.createUser({
    emailAddress: [`tripwire+clerk_test_${randomUUID()}@example.com`],
    password: `Tw!${randomUUID()}A7`,
    firstName: "Tripwire",
    lastName: "Integration Test",
    externalId: `${RUN_ID}-${label}`,
    privateMetadata: { integrationTest: true, runId: RUN_ID, label },
  });
  createdUsers.push(user.id);

  const session = await client.sessions.createSession({ userId: user.id });
  createdSessions.push(session.id);
  assert(session.status === "active", `${label} development session active`);
  const token = await client.sessions.getToken(session.id);
  const claims=JSON.parse(Buffer.from(token.jwt.split(".")[1],"base64url").toString());
  assert(claims.sts === "active", `${label} token active`);
  assert(typeof token.jwt === "string" && token.jwt.length > 20, `${label} Clerk session token minted`);
  return { token: token.jwt };
}

async function cleanup(client, database) {
  const failures = [];
  const userIds = [...createdUsers];
  if (userIds.length) {
    try {
      await database.query("DELETE FROM feedback WHERE user_id = ANY($1::text[])", [userIds]);
      const remainingFeedback = await database.query("SELECT count(*)::int AS count FROM feedback WHERE user_id = ANY($1::text[])", [userIds]);
      if (remainingFeedback.rows[0].count !== 0) failures.push("feedback cleanup");
    } catch {
      failures.push("feedback cleanup");
    }
  }
  for (const sessionId of createdSessions.reverse()) {
    try {
      await client.sessions.revokeSession(sessionId);
    } catch {
      failures.push("session cleanup");
    }
  }
  for (const userId of createdUsers.reverse()) {
    try {
      await client.users.deleteUser(userId);
    } catch {
      failures.push("user cleanup");
    }
  }
  if (userIds.length) {
    try {
      const remainingUsers = await client.users.getUserList({ userId: userIds });
      if (remainingUsers.data.length !== 0) failures.push("user cleanup verification");
    } catch {
      failures.push("user cleanup verification");
    }
  }
  if (failures.length) throw new Error(`Verification cleanup failed: ${[...new Set(failures)].join(", ")}`);
}

if (!configuredDevelopmentKeys()) {
  throw new Error("Refusing live Clerk verification: development pk_test_ and sk_test_ keys are required.");
}
if (!localBaseUrl()) {
  throw new Error("Refusing live Clerk verification: TRIPWIRE_TEST_BASE_URL must be local http://127.0.0.1 or http://localhost.");
}
if (!matchingAppOrigin()) {
  throw new Error("Refusing live Clerk verification: TRIPWIRE_TEST_BASE_URL and APP_URL must have the same local origin.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Refusing live Clerk verification: DATABASE_URL is required to remove its test feedback rows.");
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
let verificationError;
try {
  const userA = await createTestIdentity(clerk, "a");
  const userB = await createTestIdentity(clerk, "b");

  assert((await request("/api/feed")).status === 401, "anonymous feed denied");
  assert((await request("/api/feed", "not-a-clerk-token")).status === 401, "malformed token denied");

  const feedAResponse = await request("/api/feed", userA.token);
  if(feedAResponse.status !== 200) { const problem = await feedAResponse.clone().json().catch(()=>({})); console.log(JSON.stringify({check:"authenticated-feed",status:feedAResponse.status,errorCode:problem?.error?.code,authReason:feedAResponse.headers.get("x-clerk-auth-reason")})); }
  assert(feedAResponse.status === 200, "user A personal feed accepted");
  const feedA = await json(feedAResponse, "user A feed");
  assert(Array.isArray(feedA.opportunities), "user A feed shape");

  const exportA = await request("/api/export", userA.token);
  assert(exportA.status === 200, "user A personal export accepted");
  assert(exportA.headers.get("content-type")?.includes("text/csv"), "user A export is CSV");

  const opportunityId = feedA.opportunities[0]?.id;
  if (!opportunityId) {
    throw new Error("Verification requires at least one collected opportunity to exercise feedback isolation.");
  }

  async function feedback(token, label) {
    const response = await fetch(new URL("/api/feedback", BASE_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ opportunityId, label }),
    });
    assert(response.status === 200, `feedback ${label} accepted`);
    const body = await json(response, `feedback ${label}`);
    assert(body.ok === true, `feedback ${label} acknowledged`);
  }

  await feedback(userA.token, "relevant");
  const afterA = await json(await request("/api/feed", userA.token), "user A feedback read");
  assert(afterA.feedback.some((item) => item.opportunityId === opportunityId && item.label === "relevant"), "user A sees own feedback");

  const beforeB = await json(await request("/api/feed", userB.token), "user B feedback read");
  assert(!beforeB.feedback.some((item) => item.opportunityId === opportunityId), "user B cannot see user A feedback");
  await feedback(userB.token, "irrelevant");
  const afterB = await json(await request("/api/feed", userB.token), "user B feedback write");
  assert(afterB.feedback.some((item) => item.opportunityId === opportunityId && item.label === "irrelevant"), "user B sees own feedback");
  const finalA = await json(await request("/api/feed", userA.token), "user A feedback re-read");
  assert(finalA.feedback.some((item) => item.opportunityId === opportunityId && item.label === "relevant"), "user B cannot overwrite user A feedback");
} catch (error) {
  verificationError = error;
} finally {
  try {
    await cleanup(clerk, database);
    assert(true, "created Clerk identities cleaned up");
  } catch (cleanupError) {
    verificationError ??= cleanupError;
  } finally {
    await database.end();
  }
}

if (verificationError) throw verificationError;
console.log(`Clerk live verification passed (${checks} aggregate checks).`);
