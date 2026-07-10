import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  try {
    const { messageId, emoji, from } = await req.json();
    const store = getStore('eyad-hala-messages');
    const list = (await store.get('log', { type: 'json' })) || [];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'الرسالة مش موجودة' }), { status: 404 });
    }
    list[idx].reaction = emoji;
    list[idx].reactionBy = from;
    await store.setJSON('log', list);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
