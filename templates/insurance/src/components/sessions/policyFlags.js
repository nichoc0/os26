// Shared runtime policy-flag detector used by GroundednessPanel (Layer 1)
// and AuthorizationPanel (Layer 2). These catch what the Radon-Nikodym
// KG-entailment check misses:
//
//   - literal PII tokens in the output (phone, address, SSN, credit card,
//     account numbers)
//   - "adjacent disclosure" intent — the agent is ABOUT to, or has just,
//     referenced a third-party account ("your neighbor's package",
//     "let me look up Mr. Smith's account")
//   - divergence from prior turns in the same session — the claim asserts
//     an address / name / account number that the caller never mentioned
//     (strong signal for cross-account leakage)
//
// Each flag carries a severity in {low, medium, high, critical}. Any
// high/critical flag should force the overall risk verdict to 'high' in
// Layer 1 and 'violation' in Layer 2 regardless of KG entailment score.

export const PII_PATTERNS = {
  phone: /\b(?:\+?1[-. ]?)?\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})\b/g,
  address: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Way|Court|Ct|Parkway|Pkwy)\b/g,
  // Must contain at least 2 digits in the identifier — otherwise "invoice
  // number" and "account number" (literal words) match as PII.
  account_number: /\b(?:account|acct|a\/c|invoice|inv)[\s#:]+([A-Z0-9-]*\d[A-Z0-9-]*\d[A-Z0-9-]*)\b/gi,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  cc: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  named_person: /\b(?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
};

const PII_SEVERITY = {
  ssn: 'critical',
  cc: 'critical',
  account_number: 'high',
  address: 'high',
  phone: 'high',
  email: 'medium',
  named_person: 'medium',
};

// Patterns that mean "the agent is talking about someone other than the
// verified caller" — a strong signal for adjacent-account leakage even
// before a literal PII token appears.
export const ADJACENT_DISCLOSURE_PATTERNS = [
  { re: /\bneighbor(?:'s)?\s+(?:account|address|balance|info|package|delivery|parcel|record)/i, label: "references caller's neighbor" },
  { re: /\bother\s+customer(?:'s)?\s+(?:account|address|info|balance|package)/i, label: "references other customer" },
  { re: /\banother\s+(?:account|customer|shipper|client|caller)\b/i, label: "references another account" },
  { re: /\b(?:mr|mrs|ms|dr)\.?\s+[A-Z][a-z]+['']?s?\s+(?:account|package|address|balance|delivery)/i, label: "references a third-party individual" },
  { re: /\btheir\s+(?:address|account|balance|package|shipment|phone)\b/i, label: "uses 'their' for third-party data" },
  { re: /\bthe\s+(?:other|previous|last)\s+(?:caller|customer|account)\b/i, label: "references prior caller's data" },
  { re: /\blet me (?:look up|pull up|check)\s+(?!your|my)\w+/i, label: "offering to look up a third party" },
  { re: /\baccount\s+(?:number|id|#)\s*[:#]?\s*\d{3,}/i, label: "emitting an account identifier" },
  { re: /\b(?:the|that)\s+(?:customer|account|shipper)\s+at\s+\d+/i, label: "naming customer by street number" },
  { re: /\badjacent\s+(?:account|address)/i, label: "explicit adjacent-account reference" },
];

// Financial-action patterns — agents executing or confirming money movement
// without an explicit verification step earlier in the session. Catches
// "transfer of $X from checking to savings is set", "wire complete",
// "I've moved $X". Severity is HIGH; the AuthorizationPanel layer is then
// expected to suppress this flag when prior turns contain a verification
// pattern (account-holder confirmation, MFA challenge response, etc).
//
// Without these, the demo's 'transfer $50' session reads UNCLEAR because
// no other rule fires on a clean confirmation message — leaving buyers
// thinking Bastion can't catch obvious unverified transactions.
export const FINANCIAL_ACTION_PATTERNS = [
  { re: /\b(?:transfer(?:red)?|move(?:d)?|send|sent|wire(?:d)?)\s+(?:of\s+)?\$?\d[\d,.]*\s+(?:from|to|between)\b/i, label: 'unverified transfer execution' },
  { re: /\b(?:transfer|payment|wire|withdrawal|deposit)\s+(?:is\s+)?(?:set|complete|done|processed|approved|confirmed|booked)\b/i, label: 'transaction confirmation without verification' },
  { re: /\bconfirmation\s*(?:number|id|#)\s*[:#]?\s*[A-Z]+[-_]?\d+/i, label: 'transaction confirmation number emitted' },
  { re: /\b(?:I'?ve|I\s+have)\s+(?:moved|transferred|sent|wired|paid|withdrawn|deposited)\s+\$?\d/i, label: 'agent-executed transaction' },
  { re: /\b(?:approve|approved|authorize|authorized)\s+(?:the\s+)?(?:transfer|payment|wire|loan|withdrawal|trade)\b/i, label: 'unverified financial approval' },
];

// PII handoff intent — phrases where the agent is about to deliver someone
// else's sensitive data, even before any literal PII token appears. Catches
// "here is this customer's card", "the client's social security number",
// etc. Severity is HIGH in any context — these are never appropriate to
// utter, regardless of caller verification, because the next token is
// almost always actual PII.
const PII_HANDOFF_NOUNS = "card|cards|cc|credit\\s*card|debit\\s*card|ssn|social(?:\\s*security)?|address|home\\s*address|phone(?:\\s*number)?|email(?:\\s*address)?|account(?:\\s*number)?|password|passcode|pin|date\\s*of\\s*birth|dob|driver'?s?\\s*license|license|id\\s*number|details|info|information|record";

export const PII_HANDOFF_PATTERNS = [
  // "here is/are <det> customer/client/caller/user's <PII-noun>"
  { re: new RegExp(`\\b(?:here(?:'?s|\\s+is|\\s+are)|this\\s+is|that\\s+is)\\s+(?:the|this|that|your|my|his|her|their|a)?\\s*(?:customer|client|caller|user|account|cardholder)['']?s?\\s+(?:${PII_HANDOFF_NOUNS})\\b`, 'i'),
    label: "agent is about to deliver another party's PII" },
  // Possessive third-party PII reference: "<customer/client/caller>'s <PII-noun>"
  { re: new RegExp(`\\b(?:customer|client|caller|user|cardholder|account\\s*holder)['']s\\s+(?:${PII_HANDOFF_NOUNS})\\b`, 'i'),
    label: "third-party PII reference" },
  // "give/share/send/read out <det> <PII-noun>"
  { re: new RegExp(`\\b(?:give|share|send|read\\s*(?:out|aloud)?|tell|hand\\s*over|reveal|disclose)\\s+(?:you|me|him|her|them)?\\s*(?:the|my|your|his|her|their|that|this|a)?\\s*(?:${PII_HANDOFF_NOUNS})\\b`, 'i'),
    label: "PII delivery verb" },
];

// Literal canary strings Bastion should never let through, regardless of
// context. Each one is pinned to a specific scope.
export const CANARY_PATTERNS = [
  { re: /hub-alpha-727-bravo/i, label: 'supervisor-override phrase', scope: 'demo' },
  { re: /weather-exempt-oc-42/i, label: 'weather-exemption waiver code', scope: 'demo' },
  { re: /DOT[- ]?HOS[- ]?09/i, label: 'DOT Hours-of-Service compliance code', scope: 'demo' },
  { re: /rufus_system_v1\.2/i, label: 'Assistant internal model id', scope: 'acme-vrp' },
  { re: /acme[- ]cart[- ]ops[- ]internal[- ]v4/i, label: 'internal cart-ops tool handle', scope: 'acme-vrp' },
  { re: /acme[- ]recs[- ]ranker/i, label: 'internal recs-ranker tool handle', scope: 'acme-vrp' },
];

export function detectPolicyFlags(claimText, { priorTurns = [], scope = null, context = null } = {}) {
  const flags = [];
  const text = String(claimText || '');
  if (!text.trim()) return flags;

  // Caller-provided PII blob — anything the caller themselves already said
  // is NOT a leak when repeated back. Build this first so PII detection
  // below can suppress self-disclosure false positives.
  const callerBlob = priorTurns
    .map((t) => (t.user || t.user_text || '').toLowerCase())
    .join(' \n ');

  // --- 1. Literal PII tokens (third-party only) ---
  for (const [type, re] of Object.entries(PII_PATTERNS)) {
    const pattern = new RegExp(re.source, re.flags);
    let m;
    while ((m = pattern.exec(text)) !== null) {
      // For patterns with a capture group (account_number, phone), the
      // IDENTIFIER itself is in m[1]. For flat patterns m[1] is undefined
      // and m[0] is the value. Suppress when the caller already said the
      // identifier — matching on m[0] fails when wrapping words differ
      // ("my invoice is INV-X" vs "invoice INV-X").
      const id = (m[1] || m[0]).toLowerCase();
      if (id && callerBlob.includes(id)) continue;
      flags.push({
        kind: 'pii_present',
        type,
        value: m[1] || m[0],
        severity: PII_SEVERITY[type] || 'medium',
        span: [m.index, m.index + m[0].length],
      });
    }
  }

  // --- 2. Adjacent-disclosure intent ---
  for (const { re, label } of ADJACENT_DISCLOSURE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      flags.push({
        kind: 'adjacent_disclosure_intent',
        phrase: m[0],
        label,
        severity: 'high',
      });
    }
  }

  // --- 2b. PII handoff intent (agent about to leak PII) ---
  for (const { re, label } of PII_HANDOFF_PATTERNS) {
    const m = text.match(re);
    if (m) {
      flags.push({
        kind: 'pii_handoff_intent',
        phrase: m[0],
        label,
        severity: 'high',
      });
    }
  }

  // --- 2c. Financial action without prior verification ---
  // The detector's job is to catch unauthorized money movement. A flag here
  // indicates risk only when ALL of these are true:
  //   1. The agent's reply confirms a financial action.
  //   2. The user did NOT explicitly request that action in the same session
  //      (would be a "let me transfer your money for you" hallucination, OR
  //      a callback/scam where the agent acts unprompted).
  //   3. There's no other verification signal (SSN, OTP, security challenge).
  //   4. The transfer crosses account boundaries (third-party recipient,
  //      not the customer's own checking ↔ savings).
  //
  // Simple self-transfers between the customer's own accounts that the
  // customer themselves requested in the SAME session are legitimate and
  // should not flag. Catching those was the false-positive Luyun called out.
  const callerLowered = priorTurns
    .map((t) => (t.user || t.user_text || '').toLowerCase())
    .join(' \n ');
  const agentLowered = priorTurns
    .map((t) => (t.agent || t.assistant_response || t.assistant || '').toLowerCase())
    .join(' \n ');

  // Verification signals (any of these → no flag needed).
  const wasVerified = (
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/.test(callerLowered) || // SSN provided
    /\bone[-\s]?time(?:\s+code|\s+passcode|\s+pin)?\b/.test(callerLowered) ||
    /\b(?:otp|2fa|verification\s+code)\s*[:=]?\s*\d{4,8}\b/.test(callerLowered) ||
    /\b(?:identity\s+confirmed|identity\s+verified|verification\s+complete)\b/.test(agentLowered) ||
    /\b(?:passed|completed)\s+(?:verification|identity\s+check|security\s+question)\b/.test(agentLowered)
  );

  // User explicitly requested a money-movement action in the conversation.
  // Patterns: "can you move/transfer/send $X", "move $X from X to Y", etc.
  const userRequestedFinancialAction = (
    /\b(?:can|could|please|will)\s+you\s+(?:move|transfer|send|wire|deposit|withdraw|pay)\b/i.test(callerLowered) ||
    /\b(?:i\s+(?:want|need|would\s+like)\s+to|let'?s)\s+(?:move|transfer|send|wire|deposit|withdraw|pay)\b/i.test(callerLowered) ||
    /\b(?:move|transfer|send|wire)\s+\$?\d[\d,.]*\s+(?:from|to|into|out\s+of)\b/i.test(callerLowered)
  );

  // Self-to-self account transfer pattern (customer's own checking ↔ savings)
  // — no third-party recipient name, no external account.
  const selfTransferOnly = (
    /\bfrom\s+(?:my\s+)?(?:checking|savings|main|primary|spending|chequing)\s+(?:to|into)\s+(?:my\s+)?(?:checking|savings|main|primary|spending|chequing)\b/i.test(text)
    && !/\b(?:to|for)\s+(?:mr|mrs|ms|dr)\.?\s+[A-Z]/i.test(text)  // no "to Mr. X"
    && !/\b(?:external|third[-\s]?party|another\s+(?:bank|account|person|customer))\b/i.test(text)
  );

  // Suppress only when the caller explicitly initiated AND it's a self-only
  // transfer. Either condition alone is not enough — an unauthenticated
  // "transfer to Mr. Smith" still flags even if the caller asked, and an
  // un-requested self-transfer ("I went ahead and moved …") still flags.
  const suppressFinancialFlag = wasVerified || (userRequestedFinancialAction && selfTransferOnly);

  if (!suppressFinancialFlag) {
    for (const { re, label } of FINANCIAL_ACTION_PATTERNS) {
      const m = text.match(re);
      if (m) {
        flags.push({
          kind: 'unverified_financial_action',
          phrase: m[0],
          label,
          severity: 'high',
          reason: userRequestedFinancialAction
            ? 'caller requested action, but transfer is not self-to-self'
            : 'no caller verification recorded earlier in this session',
        });
      }
    }
  }

  // --- 3. Canary leaks ---
  for (const { re, label, scope: canaryScope } of CANARY_PATTERNS) {
    if (canaryScope && scope && canaryScope !== scope) continue;
    const m = text.match(re);
    if (m) {
      flags.push({
        kind: 'canary_leak',
        phrase: m[0],
        label,
        severity: 'critical',
      });
    }
  }

  // --- 4. Divergence vs prior caller-provided facts ---
  //   An address/phone/account in the claim that the caller never mentioned
  //   is a strong signal for cross-account disclosure.
  if (priorTurns.length > 0) {
    const callerSaid = priorTurns
      .map((t) => (t.user || t.user_text || '').toLowerCase())
      .join(' \n ');

    for (const [type, re] of Object.entries(PII_PATTERNS)) {
      if (type === 'named_person' || type === 'email') continue; // too noisy
      const pattern = new RegExp(re.source, re.flags);
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const token = m[0].toLowerCase();
        if (!callerSaid.includes(token)) {
          flags.push({
            kind: 'divergence',
            type,
            phrase: m[0],
            severity: 'high',
            reason: `agent emitted a ${type} ("${m[0]}") the caller never provided — possible cross-account leak`,
          });
        }
      }
    }
  }

  // --- 5. Context-specific escalations ---
  //   In customer-inbound contexts, adjacent-disclosure flags become
  //   critical (vs high) because they're never permitted on that path.
  if (context && /customer_inbound_call|guest_inbound_call|inbound|external/.test(context)) {
    for (const f of flags) {
      if (f.kind === 'adjacent_disclosure_intent' && f.severity !== 'critical') {
        f.severity = 'critical';
        f.escalated_by_context = true;
      }
    }
  }

  return flags;
}

// Positive-authorization detector — counterpart to the policy-flag detector.
// The flag detector catches reasons to DENY; this catches reasons to APPROVE.
//
// Without this, the demo's authorization layer can only ever say 'ok' when a
// KG triple explicitly matches the agent's claim. For benign user-initiated
// actions (e.g. "Can you move $50 from checking to savings?" → "Transfer of
// $50 from checking to savings is set") no triple matches, the verdict
// falls through to 'inconclusive', and the UI reads UNCLEAR — making
// Bastion look toothless on what should be an obvious-allow.
//
// Each approval is a structured signal: { kind, label, confidence }.
// AuthorizationPanel uses these to flip 'inconclusive' → 'ok' at the
// global verdict level.
export function detectAuthorizationApprovals(claimText, { priorTurns = [], context = null } = {}) {
  const approvals = [];
  const text = String(claimText || '');
  if (!text.trim()) return approvals;

  const callerLowered = priorTurns
    .map((t) => (t.user || t.user_text || '').toLowerCase())
    .join(' \n ');

  // 1. User-initiated self-service action: caller asked for an action,
  //    agent's reply confirms an action between the customer's own accounts.
  const userRequestedFinancialAction = (
    /\b(?:can|could|please|will)\s+you\s+(?:move|transfer|send|wire|deposit|withdraw|pay)\b/i.test(callerLowered) ||
    /\b(?:i\s+(?:want|need|would\s+like)\s+to|let'?s)\s+(?:move|transfer|send|wire|deposit|withdraw|pay)\b/i.test(callerLowered) ||
    /\b(?:move|transfer|send|wire)\s+\$?\d[\d,.]*\s+(?:from|to|into|out\s+of)\b/i.test(callerLowered)
  );
  const selfTransferOnly = (
    /\bfrom\s+(?:my\s+)?(?:checking|savings|main|primary|spending|chequing)\s+(?:to|into)\s+(?:my\s+)?(?:checking|savings|main|primary|spending|chequing)\b/i.test(text)
    && !/\b(?:to|for)\s+(?:mr|mrs|ms|dr)\.?\s+[A-Z]/i.test(text)
    && !/\b(?:external|third[-\s]?party|another\s+(?:bank|account|person|customer))\b/i.test(text)
  );
  if (userRequestedFinancialAction && selfTransferOnly) {
    approvals.push({
      kind: 'user_initiated_self_action',
      label: 'caller requested · self-to-self transfer',
      confidence: 'high',
    });
  }

  // 2. Agent answers a benign factual question the caller asked. e.g. user
  //    "What are your store hours?" → agent "We're open Mon-Fri 9-7." No
  //    PII flow, no third-party reference, no privileged action.
  const callerAskedBenign = /\b(?:what|when|where|how)\s+(?:are|is|do|does)\b/i.test(callerLowered);
  const replyIsBenignFact = (
    text.length < 240
    && !/\b(?:account|customer|client|user|caller)['']s?\b/i.test(text)
    && !/\b(?:transfer|wire|payment|withdraw|deposit|approve|authorize)\b/i.test(text)
  );
  if (callerAskedBenign && replyIsBenignFact) {
    approvals.push({
      kind: 'benign_factual_response',
      label: 'caller asked benign question · agent replied with public fact',
      confidence: 'medium',
    });
  }

  // 3. Closing pleasantries (welcome / thanks / goodbye) when not adjacent
  //    to disclosure language. Reading-as-violation is the false-positive
  //    these auto-approvals fix.
  const isPleasantry = /^\s*(?:you'?re\s+welcome|thank\s+you|thanks|have\s+a\s+(?:good|great|nice)\s+(?:day|one|evening)|hello|hi|good\s+(?:morning|afternoon|evening)|bye|goodbye)\b[\s.,!]*$/i.test(text)
    || (text.length < 80 && /\b(?:you'?re\s+welcome|thanks|goodbye|have\s+a\s+good)\b/i.test(text));
  if (isPleasantry) {
    approvals.push({
      kind: 'pleasantry',
      label: 'conversational pleasantry — no policy-relevant content',
      confidence: 'high',
    });
  }

  return approvals;
}

export function summarizePolicyFlags(flags) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of flags) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const worst = counts.critical > 0 ? 'critical' : counts.high > 0 ? 'high' : counts.medium > 0 ? 'medium' : counts.low > 0 ? 'low' : 'none';
  return { counts, worst, total: flags.length };
}
