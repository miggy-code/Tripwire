import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateEvent, loadProfiles } from "../src/profiles.js";

const profilesDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");
const company = { id: "company-1", name: "Northstar", domain: "northstar.example", verified: true };

function event(overrides = {}) {
  return {
    id: "job-42",
    companyId: company.id,
    title: "Business Operations Manager",
    text: "Own weekly reporting across Salesforce and spreadsheets. Improve the manual reconciliation process.",
    url: "https://jobs.example/job-42",
    firstSeen: "2026-10-22T08:00:00.000Z",
    lastSeen: "2026-10-22T08:00:00.000Z",
    source: "greenhouse",
    demo: true,
    current: true,
    ...overrides,
  };
}

test("loads both versioned reusable profiles", async () => {
  const profiles = await loadProfiles(profilesDirectory);
  assert.deepEqual(profiles.map(({ id, version }) => ({ id, version })), [
    { id: "ai-automation", version: 2 },
    { id: "technology-modernization", version: 2 },
  ]);
});

test("AI automation profile returns literal source excerpts and ordinal evidence score", async () => {
  const [aiAutomation] = await loadProfiles(profilesDirectory);
  const opportunity = evaluateEvent(event(), company, aiAutomation);

  assert.equal(opportunity.id, "opportunity:job-42:ai-automation:v2");
  assert.equal(opportunity.score, 2);
  assert.deepEqual(opportunity.matches.map((match) => match.excerpt), [
    "Own weekly reporting across Salesforce and spreadsheets.",
    "Improve the manual reconciliation process.",
  ]);
  assert.equal(opportunity.observedAt, "2026-10-22T08:00:00.000Z");
  assert.equal(opportunity.demo, true);
});

test("profiles reuse the same source event while selecting different evidence", async () => {
  const profiles = await loadProfiles(profilesDirectory);
  const modernization = profiles.find((profile) => profile.id === "technology-modernization");
  const aiAutomation = profiles.find((profile) => profile.id === "ai-automation");
  const migrationEvent = event({
    id: "job-99",
    text: "Lead a cloud migration and integrate with legacy services.",
  });

  assert.equal(evaluateEvent(migrationEvent, company, aiAutomation), null);
  const opportunity = evaluateEvent(migrationEvent, company, modernization);
  assert.equal(opportunity.score, 2);
  assert.deepEqual(opportunity.matches.map((match) => match.ruleId), ["platform-migration", "integration-program"]);
});

test("marketing and customer-delivery evidence does not create opportunities", async () => {
  const [aiAutomation] = await loadProfiles(profilesDirectory);
  const profiles = await loadProfiles(profilesDirectory);
  const modernization = profiles.find((profile) => profile.id === "technology-modernization");
  assert.equal(evaluateEvent(event({ text: "Our platform is used by thousands of customers for cloud migration." }), company, modernization), null);
  assert.equal(evaluateEvent(event({ title: "Forward Deployed Engineer", text: "Perform legacy systems audits at client sites." }), company, modernization), null);
  assert.equal(evaluateEvent(event({ text: "Build AI features for customers." }), company, aiAutomation), null);
  assert.equal(evaluateEvent(event(), { ...company, verified: false }, aiAutomation), null);
});

test("sentence exclusions skip boilerplate but retain an internal workflow sentence", async () => {
  const profiles = await loadProfiles(profilesDirectory);
  const modernization = profiles.find((profile) => profile.id === "technology-modernization");
  const opportunity = evaluateEvent(event({
    title: "Legal Operations Manager",
    text: "Lead our internal migration from legacy systems to the new legal operations platform. Our platform is used by customers undertaking cloud migration.",
  }), company, modernization);
  assert.equal(opportunity.score, 1);
  assert.equal(opportunity.matches[0].excerpt, "Lead our internal migration from legacy systems to the new legal operations platform.");
  assert.equal(opportunity.matches[0].ruleId, "legacy-systems");
});

test("malformed untrusted profile configuration is rejected", () => {
  assert.throws(
    () => evaluateEvent(event(), company, { id: "bad", name: "Bad", version: 0, description: "x", evidenceRules: [] }),
    /Invalid profile/,
  );
});


test("long multiline descriptions are scanned without repeated suffix backtracking", async () => {
  const [profile] = await loadProfiles(profilesDirectory);
  const longEvent = event({text: "x".repeat(100000) + "\nOwn manual reporting across systems\n" + "y".repeat(100000)});
  const start = performance.now();
  const result = evaluateEvent(longEvent, company, profile);
  assert.ok(result.matches.some(match => match.excerpt === "Own manual reporting across systems"));
  assert.ok(performance.now()-start < 1000, "multiline matching should remain linear");
});
