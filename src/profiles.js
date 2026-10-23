import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const REQUIRED_PROFILE_FIELDS = ["id", "name", "version", "description", "evidenceRules"];

function configurationError(source, message) {
  return new Error(`Invalid profile${source ? ` (${source})` : ""}: ${message}`);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateProfile(profile, source) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw configurationError(source, "must be an object");
  }

  for (const field of REQUIRED_PROFILE_FIELDS) {
    if (!(field in profile)) {
      throw configurationError(source, `is missing ${field}`);
    }
  }

  for (const field of ["id", "name", "description"]) {
    if (!nonEmptyString(profile[field])) {
      throw configurationError(source, `${field} must be a non-empty string`);
    }
  }

  if (!Number.isInteger(profile.version) || profile.version < 1) {
    throw configurationError(source, "version must be a positive integer");
  }
  if (!Array.isArray(profile.evidenceRules) || profile.evidenceRules.length === 0) {
    throw configurationError(source, "evidenceRules must be a non-empty array");
  }
  for (const field of ["sentenceExclusions", "excludedTitleTerms"]) {
    if (profile[field] !== undefined && !Array.isArray(profile[field])) {
      throw configurationError(source, `${field} must be an array when present`);
    }
  }

  const ruleIds = new Set();
  for (const rule of profile.evidenceRules) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw configurationError(source, "each evidence rule must be an object");
    }
    for (const field of ["id", "label", "terms", "suggestion", "question"]) {
      if (!(field in rule)) {
        throw configurationError(source, `an evidence rule is missing ${field}`);
      }
    }
    if (!["id", "label", "suggestion", "question"].every((field) => nonEmptyString(rule[field]))) {
      throw configurationError(source, "rule text fields must be non-empty strings");
    }
    if (ruleIds.has(rule.id)) {
      throw configurationError(source, `has duplicate rule id ${rule.id}`);
    }
    ruleIds.add(rule.id);
    if (!Array.isArray(rule.terms) || rule.terms.length === 0 || !rule.terms.every(nonEmptyString)) {
      throw configurationError(source, `rule ${rule.id} must have non-empty string terms`);
    }
  }
  for (const field of ["sentenceExclusions", "excludedTitleTerms"]) {
    if (profile[field] && !profile[field].every(nonEmptyString)) {
      throw configurationError(source, `${field} must contain only non-empty strings`);
    }
  }

  return Object.freeze({
    ...profile,
    sentenceExclusions: Object.freeze([...(profile.sentenceExclusions ?? [])]),
    excludedTitleTerms: Object.freeze([...(profile.excludedTitleTerms ?? [])]),
    evidenceRules: Object.freeze(profile.evidenceRules.map((rule) => Object.freeze({
      ...rule,
      terms: Object.freeze([...rule.terms]),
    }))),
  });
}

/** Load every validated JSON profile in a directory, ordered by filename. */
export async function loadProfiles(directory) {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();

  const profiles = await Promise.all(filenames.map(async (filename) => {
    const source = join(directory, filename);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(source, "utf8"));
    } catch (error) {
      throw configurationError(filename, `cannot parse JSON: ${error.message}`);
    }
    return validateProfile(parsed, filename);
  }));

  const ids = new Set();
  for (const profile of profiles) {
    if (ids.has(profile.id)) {
      throw configurationError(directory, `has duplicate profile id ${profile.id}`);
    }
    ids.add(profile.id);
  }
  return Object.freeze(profiles);
}

function sourceFields(event) {
  return [event.title, event.text].filter(nonEmptyString);
}

function includesLiteral(value, term) {
  return value.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

// Each returned value is a literal sentence slice from the job title or description.
function sourceSentences(value) {
  return (value.match(/[^.!?\n]+[.!?]*/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function firstEvidence(event, terms, sentenceExclusions) {
  for (const field of sourceFields(event)) {
    for (const sentence of sourceSentences(field)) {
      if (sentenceExclusions.some((term) => includesLiteral(sentence, term))) continue;
      for (const term of terms) {
        if (includesLiteral(sentence, term)) {
          return sentence;
        }
      }
    }
  }
  return null;
}

function isUsableEvent(event) {
  return Boolean(
    event && typeof event === "object" &&
    nonEmptyString(event.id) && nonEmptyString(event.companyId) &&
    nonEmptyString(event.title) && nonEmptyString(event.firstSeen),
  );
}

/**
 * Deterministically turns source evidence into a reviewable opportunity.
 * Score is the count of matching rules, never a probability or a buying claim.
 */
export function evaluateEvent(event, company, profile) {
  if (!isUsableEvent(event) || !company || company.id !== event.companyId || company.verified !== true) {
    return null;
  }

  const safeProfile = validateProfile(profile);
  if (safeProfile.excludedTitleTerms.some((term) => includesLiteral(event.title, term))) {
    return null;
  }

  const matches = safeProfile.evidenceRules.flatMap((rule) => {
    const excerpt = firstEvidence(event, rule.terms, safeProfile.sentenceExclusions);
    return excerpt === null ? [] : [{
      ruleId: rule.id,
      label: rule.label,
      excerpt,
      suggestion: rule.suggestion,
      question: rule.question,
    }];
  });
  if (matches.length === 0) return null;

  return Object.freeze({
    id: `opportunity:${event.id}:${safeProfile.id}:v${safeProfile.version}`,
    eventId: event.id,
    companyId: event.companyId,
    profileId: safeProfile.id,
    profileVersion: safeProfile.version,
    title: event.title,
    score: matches.length,
    matches: Object.freeze(matches.map(Object.freeze)),
    demo: event.demo === true,
    observedAt: event.firstSeen,
  });
}
