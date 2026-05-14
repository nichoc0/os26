/**
 * Telnyx Messaging — outbound SMS via /v2/messages.
 * Used by the Notify stage after a successful demo deploy.
 *
 * Env vars required:
 *   TELNYX_API_KEY                 — bearer token from Telnyx portal
 *   TELNYX_MESSAGING_PROFILE_ID    — (optional) profile to send under
 *   TELNYX_FROM_NUMBER             — E.164, your provisioned sender
 *   NOTIFY_TO_NUMBER               — E.164, where the SMS goes
 */
const TELNYX_URL = 'https://api.telnyx.com/v2/messages';

export async function sendSms({ to, from, text, messagingProfileId, apiKey }) {
  const key = apiKey || process.env.TELNYX_API_KEY;
  const fromNumber = from || process.env.TELNYX_FROM_NUMBER;
  const toNumber = to || process.env.NOTIFY_TO_NUMBER;
  const profile = messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!key) throw new Error('TELNYX_API_KEY not set');
  if (!fromNumber) throw new Error('TELNYX_FROM_NUMBER not set');
  if (!toNumber) throw new Error('NOTIFY_TO_NUMBER not set');

  const body = {
    from: fromNumber,
    to: toNumber,
    text,
  };
  if (profile) body.messaging_profile_id = profile;

  const resp = await fetch(TELNYX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Telnyx HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  return {
    id: data?.data?.id,
    to: toNumber,
    from: fromNumber,
  };
}
