import { getStore } from '@netlify/blobs';

// عند إرسال "إياد" -> بتنبعت عن طريق بوت حلا لصندوق محادثتها
// عند إرسال "حلا" -> بتنبعت عن طريق بوت إياد لصندوق محادثته
function getBotFor(from) {
  if (from === 'eyad') {
    return { token: process.env.HALA_BOT_TOKEN, chatId: process.env.HALA_CHAT_ID };
  }
  if (from === 'hala') {
    return { token: process.env.EYAD_BOT_TOKEN, chatId: process.env.EYAD_CHAT_ID };
  }
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    const { from, text, image, type } = await req.json();
    const bot = getBotFor(from);
    if (!bot || !bot.token || !bot.chatId) {
      return new Response(JSON.stringify({ error: 'مرسل غير معروف أو الإعدادات ناقصة' }), { status: 400 });
    }

    let tgData;

    if (type === 'sticker' && image) {
      const base64 = image.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      const form = new FormData();
      form.append('chat_id', bot.chatId);
      form.append('photo', new Blob([buffer], { type: 'image/png' }), 'sticker.png');
      if (text) form.append('caption', text);

      const tgResp = await fetch(`https://api.telegram.org/bot${bot.token}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      tgData = await tgResp.json();
    } else {
      const tgResp = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: bot.chatId, text: text || '' }),
      });
      tgData = await tgResp.json();
    }

    if (!tgData.ok) {
      return new Response(JSON.stringify({ error: tgData.description || 'telegram error' }), { status: 502 });
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
                              
