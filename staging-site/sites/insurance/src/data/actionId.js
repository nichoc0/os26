// Operator-visible, copy-paste-able action ID for events surfaced in
// the Agents section. Yousuf (GCC) 2026-05-27: "items should be given
// some sort of ID number to help the user trace the action, it will
// help tracking blocked, flagged, and passed actions."
//
// Format: ACT-NNNNN — zero-padded so IDs sort lexicographically and
// stay constant-width in tables. Stable across reloads (derived from
// the canonical event.id). The Filters → Search box in LiveTelemetry
// matches the exact string so an operator can paste "ACT-00041" from
// a ticket / Slack and jump to the row.
//
// Extracted to its own module to avoid a circular import between
// LiveTelemetry (which renders DrilldownView) and EventDrilldown
// (which renders the ID badge).
export function actionIdFor(event) {
  const raw = event && event.id != null ? event.id : '';
  const s = String(raw);
  // Numeric ids get zero-padded. Non-numeric ids (some demo fixtures
  // ship string keys) pass through as-is so we don't mangle already-
  // meaningful identifiers.
  if (/^\d+$/.test(s)) return `ACT-${s.padStart(5, '0')}`;
  return s ? `ACT-${s}` : 'ACT-—';
}
