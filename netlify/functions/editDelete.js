import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  try {
    const { action, messageId, from, newText } = await req.json();
    const store = getStore('eyad-hala-messages');
    const list = (await store.get('log', { type: 'json' })) || [];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'الرسالة مش موجودة' }), { status: 404 });
    }
    if (list[idx].from !== from) {
      return new Response(JSON.stringify({ error: 'ما بتقدر تعدل/تحذف رسالة مش إلك' }), { status: 403 });
    }
    if (action === 'delete') {
      list[idx].deleted = true;
      list[idx].text = '';
      list[idx].image = null;
      list[idx].audio = null;
    } else if (action === 'edit') {
      list[idx].text = newText || '';
      list[idx].edited = true;
    } else {
      return new Response(JSON.stringify({ error: 'إجراء غير معروف' }), { status: 400 });
    }
    await store.setJSON('log', list);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
