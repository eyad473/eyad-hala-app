import { getStore } from '@netlify/blobs';

// شو معناته وصول رسالة على كل شات
// شات حلا (بوت حلا) => الرسالة كانت من حلا
// شات إياد (بوت إياد) => الرسالة كانت من إياد
function senderForChat(chatId) {
  if (String(chatId) === String(process.env.HALA_CHAT_ID)) return 'hala';
  if (String(chatId) === String(process.env.EYAD_CHAT_ID)) return 'eyad';
  return null;
}

function tokenForSender(sender) {
  return sender === 'hala' ? process.env.HALA_BOT_TOKEN : process.env.EYAD_BOT_TOKEN;
}

export default async (req) => {
  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg) return new Response('ok');

    const from = senderForChat(msg.chat.id);
    if (!from) return new Response('ok');

    const store = getStore('eyad-hala-messages');
    const list = (await store.get('log', { type: 'json' })) || [];

    let entry = {
      id: `tg-${msg.message_id}-${msg.date}`,
      from,
      timestamp: msg.date * 1000,
      text: '',
      type: 'text',
      image: null,
    };

    if (msg.text) {
      entry.text = msg.text;
    } else if (msg.photo && msg.photo.length) {
      const token = tokenForSender(from);
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();
      if (fileData.ok) {
        entry.type = 'sticker';
        entry.image = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        entry.text = msg.caption || '';
      } else {
        return new Response('ok');
      }
    } else {
      return new Response('ok');
    }

    // تجنب التكرار لو تيليجرام بعت نفس التحديث مرتين
    if (!list.find((m) => m.id === entry.id)) {
      list.push(entry);
      if (list.length > 500) list.splice(0, list.length - 500);
      await store.setJSON('log', list);
    }

    return new Response('ok');
  } catch (e) {
    return new Response('ok'); // دايماً نرجع ok لتيليجرام حتى لو صار خطأ
  }
};
