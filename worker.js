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
      if (path === '/api/schedule' && request.method === 'POST') {
        return await scheduleMessage(request, env);
      }
      if (path === '/api/subscribe' && request.method === 'POST') {
        return await subscribeNotif(request, env);
      }
      if (path === '/api/meta' && request.method === 'GET') {
        return await getMeta(env);
      }
      if (path === '/api/meta' && request.method === 'POST') {
        return await setMeta(request, env);
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
      if (path === '/api/schedule' && request.method === 'POST') {
        return await scheduleMessage(request, env);
      }
      if (path === '/api/startdate' && request.method === 'POST') {
        return await postStartDate(request, env);
      }
      if (path === '/api/startdate' && request.method === 'GET') {
        return await getStartDate(env);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }

    // أي طلب تاني: خدمة الملفات الثابتة (index.html, sw.js...)
    return env.ASSETS.fetch(request);
  },

  // يشتغل تلقائياً كل دقيقة، يفحص الرسائل المجدولة ويرسل يلي وقتها استحق
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processScheduledMessages(env));
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
  let list = await getMessagesList(env);

  // تسليم الرسائل المجدولة يلي حان وقتها
  const schedRaw = await env.EYAD_HALA_KV.get('scheduled');
  if (schedRaw) {
    const sched = JSON.parse(schedRaw);
    const now = Date.now();
    const due = sched.filter((s) => s.deliverAt <= now);
    const remaining = sched.filter((s) => s.deliverAt > now);
    if (due.length) {
      due.forEach((s) => {
        list.push({
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: s.from,
          text: s.text,
          type: 'text',
          scheduled: true,
          timestamp: Date.now(),
        });
      });
      if (list.length > 500) list.splice(0, list.length - 500);
      await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
      await env.EYAD_HALA_KV.put('scheduled', JSON.stringify(remaining));
    }
  }

  return json(list);
}

async function scheduleMessage(request, env) {
  const { from, text, deliverAt } = await request.json();
  if (from !== 'eyad' && from !== 'hala') return json({ error: 'مرسل غير معروف' }, 400);
  if (!text || !deliverAt) return json({ error: 'ناقص نص أو وقت' }, 400);
  const raw = await env.EYAD_HALA_KV.get('scheduled');
  const sched = raw ? JSON.parse(raw) : [];
  sched.push({ from, text, deliverAt });
  await env.EYAD_HALA_KV.put('scheduled', JSON.stringify(sched));
  return json({ ok: true });
}

async function getMeta(env) {
  const raw = await env.EYAD_HALA_KV.get('meta');
  return new Response(raw || '{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function setMeta(request, env) {
  const body = await request.json();
  const raw = await env.EYAD_HALA_KV.get('meta');
  const meta = raw ? JSON.parse(raw) : {};
  Object.assign(meta, body);
  await env.EYAD_HALA_KV.put('meta', JSON.stringify(meta));
  return json({ ok: true });
}

async function sendMessage(request, env) {
  const { from, text, image, audio, media, mediaType, replyTo, type, sos } = await request.json();
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
    sos: sos || false,
    type: type || 'text',
    timestamp: Date.now(),
  };
  list.push(entry);
  if (list.length > 500) list.splice(0, list.length - 500);
  await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
  await notifyOther(from, env);
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

/* ===== الإشعارات (Web Push بدون حمولة) ===== */
const VAPID_PUBLIC = 'BFjNF8HRXnpw4m5RBru6srtVahFtd80QSqG9ydMxguyHWmVutzPeVnE37hQorhyH6E8MCyYs9lqMC1Tmt9olUaU';
const VAPID_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'WM0XwdFeenDiblEGu7qyu1VqEW13zRBKob3J0zGC7Ic',
  y: 'WmVutzPeVnE37hQorhyH6E8MCyYs9lqMC1Tmt9olUaU',
  d: '8-T9rBH1VuDkk7kmZnbz0AVFv0UGre1rPSbF-Hg3vaE',
};

function b64urlStr(s) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function vapidJwt(endpoint) {
  const aud = new URL(endpoint).origin;
  const header = b64urlStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64urlStr(
    JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:app@example.com' })
  );
  const unsigned = header + '.' + payload;
  const key = await crypto.subtle.importKey('jwk', VAPID_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + b64urlBytes(new Uint8Array(sig));
}

async function subscribeNotif(request, env) {
  const { who, subscription } = await request.json();
  if (who !== 'eyad' && who !== 'hala') return json({ error: 'مرسل غير معروف' }, 400);
  await env.EYAD_HALA_KV.put(`sub_${who}`, JSON.stringify(subscription));
  return json({ ok: true });
}

async function notifyOther(from, env) {
  try {
    const other = from === 'eyad' ? 'hala' : 'eyad';
    const raw = await env.EYAD_HALA_KV.get(`sub_${other}`);
    if (!raw) return;
    const sub = JSON.parse(raw);
    const jwt = await vapidJwt(sub.endpoint);
    await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400',
        Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
      },
    });
  } catch (e) {
    // نتجاهل فشل الإشعار حتى ما يوقف الرسالة نفسها
  }
}
  
