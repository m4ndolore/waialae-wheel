const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ROUND_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Round sharing ─────────────────────────────────────────────
    const roundMatch = url.pathname.match(/^\/round\/([A-Za-z0-9_-]+)$/);

    // PUT /round/:code — scorekeeper pushes state
    if (request.method === 'PUT' && roundMatch) {
      try {
        const code = roundMatch[1].toUpperCase();
        const body = await request.text();
        // Validate it's parseable JSON with basic shape
        const parsed = JSON.parse(body);
        if (!parsed.players || !parsed.scores) {
          return json({ error: 'Invalid round state' }, 400);
        }
        await env.ROUNDS.put(code, body, { expirationTtl: ROUND_TTL });
        return json({ ok: true, code });
      } catch (e) {
        return json({ error: 'Invalid request' }, 400);
      }
    }

    // GET /round/:code — viewer fetches state
    if (request.method === 'GET' && roundMatch) {
      const code = roundMatch[1].toUpperCase();
      const data = await env.ROUNDS.get(code);
      if (!data) {
        return json({ error: 'Round not found' }, 404);
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // ── Feedback ──────────────────────────────────────────────────

    // POST /feedback — submit new feedback
    if (request.method === 'POST' && url.pathname === '/feedback') {
      try {
        const body = await request.json();
        const { type, message } = body;

        if (!type || !message || !message.trim()) {
          return json({ error: 'type and message required' }, 400);
        }

        const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const entry = {
          id,
          type,
          message: message.trim(),
          timestamp: new Date().toISOString(),
          userAgent: request.headers.get('user-agent') || '',
        };

        await env.FEEDBACK.put(id, JSON.stringify(entry));

        return json({ ok: true, id });
      } catch (e) {
        return json({ error: 'Invalid request' }, 400);
      }
    }

    // GET /feedback — list all feedback (simple admin read)
    if (request.method === 'GET' && url.pathname === '/feedback') {
      const list = await env.FEEDBACK.list();
      const entries = await Promise.all(
        list.keys.map(async (key) => {
          const val = await env.FEEDBACK.get(key.name);
          return val ? JSON.parse(val) : null;
        })
      );
      return json(entries.filter(Boolean).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    }

    return json({ error: 'Not found' }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
