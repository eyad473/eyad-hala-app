export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/messages' && request.method === 'GET') {
        return await getMessages(env);
      }
      if (path === '/api/send' && request.method === 'POST') {
        return await sendMessage(request, env);
      }
      if (path === '/api/react' && request.method === 'POST') {
        return await reactMessage(request, env);
      }
      if (path === '/api/editDelete' && request.method === 'POST') {
        return await editDeleteMessage(request, env);
      }
      if (path === '/api/typing' && request.method === 'POST') {
        return await postTyping(request, env);
      }
      if (path === '/api/typing' && request.method === 'GET') {
        return await getTyping(env);
      }
      if (path === '/api/seen' && request.method === 'POST') {
        return await postSeen(request, env);
      }
      if (path === '/api/seen' && request.method === 'GET') {
        return await getSeen(env);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }

    // أي طلب تاني: خدمة الملفات الثابتة (index.html, sw.js...)
    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getMessagesList(env) {
  const raw = await env.EYAD_HALA_KV.get('messages_log');
  return raw ? JSON.parse(raw) : [];
}

async function getMessages(env) {
  const list = await getMessagesList(env);
  return json(list);
}

async function sendMessage(request, env) {
  const { from, text, image, audio, media, mediaType, replyTo, type } = await request.json();
  if (from !== 'eyad' && from !== 'hala') {
    return json({ error: 'مرسل غير معروف' }, 400);
  }
  const list = await getMessagesList(env);
  const entry = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    text: text || '',
    image: type === 'sticker' ? image : null,
    audio: type === 'voice' ? audio : null,
    media: type === 'media' ? media : null,
    mediaType: type === 'media' ? mediaType : null,
    replyTo: replyTo || null,
    type: type || 'text',
    timestamp: Date.now(),
  };
  list.push(entry);
  if (list.length > 500) list.splice(0, list.length - 500);
  await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
  return json({ ok: true, message: entry });
}

async function reactMessage(request, env) {
  const { messageId, emoji, from } = await request.json();
  const list = await getMessagesList(env);
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return json({ error: 'الرسالة مش موجودة' }, 404);
  list[idx].reaction = emoji;
  list[idx].reactionBy = from;
  await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
  return json({ ok: true });
}

async function editDeleteMessage(request, env) {
  const { action, messageId, from, newText } = await request.json();
  const list = await getMessagesList(env);
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return json({ error: 'الرسالة مش موجودة' }, 404);
  if (list[idx].from !== from) return json({ error: 'ما بتقدر تعدل/تحذف رسالة مش إلك' }, 403);
  if (action === 'delete') {
    list[idx].deleted = true;
    list[idx].text = '';
    list[idx].image = null;
    list[idx].audio = null;
    list[idx].media = null;
  } else if (action === 'edit') {
    list[idx].text = newText || '';
    list[idx].edited = true;
  } else {
    return json({ error: 'إجراء غير معروف' }, 400);
  }
  await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
  return json({ ok: true });
}

async function postTyping(request, env) {
  const { from } = await request.json();
  await env.EYAD_HALA_KV.put('typing_status', JSON.stringify({ from, ts: Date.now() }), { expirationTtl: 30 });
  return json({ ok: true });
}

async function getTyping(env) {
  const raw = await env.EYAD_HALA_KV.get('typing_status');
  return new Response(raw || 'null', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function postSeen(request, env) {
  const { who } = await request.json();
  if (who !== 'eyad' && who !== 'hala') return json({ error: 'مرسل غير معروف' }, 400);
  await env.EYAD_HALA_KV.put(`seen_${who}`, JSON.stringify({ ts: Date.now() }));
  return json({ ok: true });
}

async function getSeen(env) {
  const eyadRaw = await env.EYAD_HALA_KV.get('seen_eyad');
  const halaRaw = await env.EYAD_HALA_KV.get('seen_hala');
  const eyad = eyadRaw ? JSON.parse(eyadRaw).ts : 0;
  const hala = halaRaw ? JSON.parse(halaRaw).ts : 0;
  return json({ eyad, hala });
      }
    
