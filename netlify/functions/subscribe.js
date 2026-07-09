import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  try {
    const { who, subscription } = await req.json();
    if (who !== 'eyad' && who !== 'hala') {
      return new Response(JSON.stringify({ error: 'مرسل غير معروف' }), { status: 400 });
    }
    const store = getStore('eyad-hala-subs');
    await store.setJSON(who, subscription);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
