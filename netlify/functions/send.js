import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

// هاد الإصدار ما بيبعت أي شي لتيليجرام — الرسائل والستيكرات
// بتنخزن وبتظهر جوا التطبيق، ومنبعت إشعار Push للطرف التاني.

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:eyad@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function notifyOther(from, text, type) {
  try {
    const other = from === 'eyad' ? 'hala' : 'eyad';
    const subStore = getStore('eyad-hala-subs');
    const subscription = await subStore.get(other, { type: 'json' });
    if (!subscription) return;

    const senderName = from === 'eyad' ? 'إياد' : 'حلا';
    const body = type === 'sticker' ? 'بعتلك ستيكر 🎨' : type === 'voice' ? 'بعتلك رسالة صوتية 🎤' : (text || 'رسالة جديدة');

    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: senderName, body })
    );
  } catch (e) {
    // نتجاهل أخطاء الإشعار حتى ما توقف إرسال الرسالة نفسها
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    const { from, text, image, audio, type } = await req.json();
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
      audio: type === 'voice' ? audio : null,
      type: type || 'text',
      timestamp: Date.now(),
    };
    list.push(entry);
    if (list.length > 500) list.splice(0, list.length - 500);
    await store.setJSON('log', list);

    await notifyOther(from, text, type);

    return new Response(JSON.stringify({ ok: true, message: entry }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
