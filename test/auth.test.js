import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  configuredClerkKeys,
  constantTimeEqual,
  hasStrongCronSecret,
  hasValidCronBearer,
  isOperator,
  isSameOrigin,
  tenantKey,
  validFeedback,
} from "../src/access.js";
import { csv, csvCell, opportunityRows } from "../src/csv.js";

test("tenant keys are derived from a verified Clerk identity", () => {
  assert.equal(tenantKey({ userId: "user_1", orgId: "org_1" }), "org:org_1");
  assert.equal(tenantKey({ userId: "user_1", orgId: null }), "user:user_1");
  assert.equal(tenantKey({ userId: "", orgId: "org_1" }), null);
});

test("operator access is allowlisted by exact Clerk user ID", () => {
  const env = { TRIPWIRE_ADMIN_USER_IDS: "user_admin, user_other" };
  assert.equal(isOperator("user_admin", env), true);
  assert.equal(isOperator("user_member", env), false);
  assert.equal(isOperator(undefined, env), false);
});

test("cron access fails closed without a strong configured secret", () => {
  const weak = { CRON_SECRET: "too-short" };
  const strong = { CRON_SECRET: "a".repeat(32) };
  assert.equal(hasStrongCronSecret(weak), false);
  assert.equal(hasValidCronBearer("Bearer too-short", weak), false);
  assert.equal(hasValidCronBearer("Bearer wrong", strong), false);
  assert.equal(hasValidCronBearer(`Bearer ${strong.CRON_SECRET}`, strong), true);
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(constantTimeEqual("same", "same"), true);
  assert.equal(constantTimeEqual("same", "different"), false);
});

test("feedback can only be valid, same-origin JSON data", () => {
  const env = { APP_URL: "https://app.tripwire.example" };
  assert.equal(isSameOrigin("https://app.tripwire.example", env), true);
  assert.equal(isSameOrigin("https://attacker.example", env), false);
  assert.equal(isSameOrigin("https://app.tripwire.example", {}), false);
  assert.equal(validFeedback({ opportunityId: "opportunity:1", label: "relevant" }), true);
  assert.equal(validFeedback({ opportunityId: "opportunity:1", label: "buy-now" }), false);
  assert.equal(validFeedback({ opportunityId: "opportunity:1", label: "irrelevant", tenantId: "spoofed" }), false);
});

test("Clerk configuration has no implicit development bypass", () => {
  assert.equal(configuredClerkKeys({}), false);
  assert.equal(configuredClerkKeys({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test", CLERK_SECRET_KEY: "sk_test" }), true);
});

test("CSV cells escape quotes and prevent spreadsheet formulas", () => {
  assert.equal(csvCell('=SUM(A1:A2)'), "\"'=SUM(A1:A2)\"");
  assert.equal(csvCell('\t=HYPERLINK("https://attacker.example")'), '"\'\t=HYPERLINK(""https://attacker.example"")"');
  assert.equal(csvCell('say "hello"'), '"say ""hello"""');
  assert.equal(csv([["a", "b"], ["1", "2"]]), '"a","b"\r\n"1","2"');
});

test("CSV exports the repository opportunity shape with exact evidence and source fields", () => {
  const [header, row] = opportunityRows([{
    id: "opportunity:event-1:ai-automation:v1",
    profileId: "ai-automation",
    profileVersion: 1,
    title: "Operations manager",
    observedAt: "2026-10-23T10:00:00.000Z",
    score: 2,
    demo: false,
    company: { name: "Northstar", domain: "northstar.example" },
    event: { source: "greenhouse", url: "https://jobs.example/1", sourcePublishedAt: "2026-10-20T00:00:00.000Z", sourceUpdatedAt: "2026-10-22T00:00:00.000Z" },
    matches: [
      { label: "Manual reporting", excerpt: "Own weekly reporting across Salesforce.", suggestion: "Automate reporting.", question: "What remains manual?" },
      { label: "Reconciliation", excerpt: "Improve the reconciliation process.", suggestion: "Automate reconciliation.", question: "Which system differs?" },
    ],
  }]);
  assert.deepEqual(header.slice(0, 12), ["opportunity_id", "company", "domain", "profile", "profile_version", "title", "observed_at", "source", "source_url", "source_published_at", "source_updated_at", "score"]);
  assert.deepEqual(row.slice(0, 12), ["opportunity:event-1:ai-automation:v1", "Northstar", "northstar.example", "ai-automation", 1, "Operations manager", "2026-10-23T10:00:00.000Z", "greenhouse", "https://jobs.example/1", "2026-10-20T00:00:00.000Z", "2026-10-22T00:00:00.000Z", 2]);
  assert.equal(row[13], "Own weekly reporting across Salesforce.\n---\nImprove the reconciliation process.");
});
