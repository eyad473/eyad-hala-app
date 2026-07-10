import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore('eyad-hala-typing');
  try {
    if (req.method === 'POST') {
      const { from } = await req.json();
      await store.setJSON('status', { from, ts: Date.now() });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    const status = (await store.get('status', { type: 'json' })) || null;
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
