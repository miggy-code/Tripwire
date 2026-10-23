/** Escape one cell for RFC 4180 CSV and neutralize spreadsheet formula prefixes. */
export function csvCell(value) {
  const text = String(value ?? "");
  // Spreadsheet importers can ignore leading whitespace before evaluating a formula.
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const HEADER = [
  "opportunity_id", "company", "domain", "profile", "profile_version", "title",
  "observed_at", "source", "source_url", "source_published_at", "source_updated_at",
  "score", "evidence_labels", "evidence_excerpts", "suggestions", "questions", "demo",
];

function evidence(opportunity, field) {
  return Array.isArray(opportunity?.matches)
    ? opportunity.matches.map((match) => match?.[field]).filter((value) => typeof value === "string").join("\n---\n")
    : "";
}

/** Convert repository opportunities to stable, source-backed CSV rows. */
export function opportunityRows(opportunities) {
  const items = Array.isArray(opportunities) ? opportunities : [];
  return [HEADER, ...items.map((opportunity) => {
    const company = opportunity?.company ?? {};
    const event = opportunity?.event ?? {};
    return [
      opportunity?.id,
      company.name,
      company.domain,
      opportunity?.profileId,
      opportunity?.profileVersion,
      opportunity?.title ?? event.title,
      opportunity?.observedAt ?? event.firstSeen,
      event.source,
      event.url,
      event.sourcePublishedAt,
      event.sourceUpdatedAt,
      opportunity?.score,
      evidence(opportunity, "label"),
      evidence(opportunity, "excerpt"),
      evidence(opportunity, "suggestion"),
      evidence(opportunity, "question"),
      opportunity?.demo === true,
    ];
  })];
}
