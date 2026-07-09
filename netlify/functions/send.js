import { getStore } from '@netlify/blobs';

// هاد الإصدار ما بيبعت أي شي لتيليجرام — الرسائل والستيكرات
// بتنخزن وبتظهر جوا التطبيق بس، بدون ما توصل تطبيق تيليجرام الحقيقي.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    const { from, text, image, type } = await req.json();
    if (from !== 'eyad' && from !== 'hala') {
      return new Response(JSON.stringify({ error: 'مرسل غير معروف' }), { status: 400 });
    }

    const store = getStore('eyad-hala-messages');
    const list = (await store.get('log', { type: 'json' })) || [];
    const entry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      text: text || '',
      image: type === 'sticker' ? image : null,
      type: type || 'text',
      timestamp: Date.now(),
    };
    list.push(entry);
    if (list.length > 500) list.splice(0, list.length - 500);
    await store.setJSON('log', list);

    return new Response(JSON.stringify({ ok: true, message: entry }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
