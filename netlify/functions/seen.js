import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore('eyad-hala-seen');
  try {
    if (req.method === 'POST') {
      const { who } = await req.json();
      if (who !== 'eyad' && who !== 'hala') {
        return new Response(JSON.stringify({ error: 'مرسل غير معروف' }), { status: 400 });
      }
      await store.setJSON(who, { ts: Date.now() });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    const eyad = (await store.get('eyad', { type: 'json' })) || { ts: 0 };
    const hala = (await store.get('hala', { type: 'json' })) || { ts: 0 };
    return new Response(JSON.stringify({ eyad: eyad.ts, hala: hala.ts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
