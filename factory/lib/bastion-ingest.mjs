/**
 * Bastion ingest — fire-and-forget telemetry to /api/blue/ingest so every
 * Factory agent's tool_use shows up live in the Bastion dashboard's Live
 * Activity panel. This is the substrate the demo "wow moment" pivots on:
 * the dashboard shows real-time agent actions, and Bastion's classifier
 * surfaces flagged events (prompt injections etc.) inline.
 *
 * READ-ONLY consumer — we do NOT modify Bastion. We only POST events.
 */
const DEFAULT_BASE = 'https://bastion-runner.pistonsolutions.ai';

export function bastionClient({ apiKey, baseUrl, agentId = 'os26-factory' } = {}) {
  const base = (baseUrl || process.env.BASTION_SERVER_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const token = apiKey || process.env.BASTION_API_KEY;
  if (!token) {
    console.warn('[bastion-ingest] no BASTION_API_KEY — events will be dropped');
  }
  return {
    /**
     * Log an event (a single agent tool_use, a stage transition, anything).
     * Never throws. Network/auth failures are swallowed.
     */
    async ingest(event) {
      if (!token) return null;
      const body = {
        session_id: event.session_id || event.runId || 'os26-run',
        agent_id: agentId,
        started_at: new Date().toISOString(),
        latency_ms: event.latency_ms || 0,
        request: {
          stage: event.stage || 'unknown',
          tool: event.tool || null,
          input: event.input || null,
          customer: event.customer || null,
        },
        response: {
          summary: event.summary || '',
          ok: event.ok !== false,
        },
        caller_context: event.context || null,
      };
      try {
        const ctl = AbortSignal.timeout(5000);
        const resp = await fetch(`${base}/api/blue/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: ctl,
        });
        if (!resp.ok) {
          console.warn(`[bastion-ingest] HTTP ${resp.status}`);
          return null;
        }
        return await resp.json().catch(() => null);
      } catch (e) {
        console.warn(`[bastion-ingest] failed: ${e.message}`);
        return null;
      }
    },
  };
}
