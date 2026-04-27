const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

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
