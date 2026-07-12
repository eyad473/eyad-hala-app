/* ===============================================
   سَما — الباك إند على Cloudflare Workers
   Durable Object + WebSocket للتوصيل اللحظي
   =============================================== */

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // بث رسالة لكل المتصلين (بيجي من الـ Worker الرئيسي)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const data = await request.text();
      this.ctx.getWebSockets().forEach((ws) => {
        try { ws.send(data); } catch (e) {}
      });
      return new Response('ok');
    }

    // فتح اتصال WebSocket
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    try {
      server.serializeAttachment({ who: url.searchParams.get('who') || '' });
    } catch (e) {}
    return new Response(null, { status: 101, webSocket: client });
  }

  // رسائل جاية من العملاء عبر WebSocket (كتابة/شوفها — أحداث خفيفة)
  webSocketMessage(ws, message) {
    try {
      const d = JSON.parse(message);
      if (d.t === 'typing' || d.t === 'seen') {
        const out = JSON.stringify(d);
        this.ctx.getWebSockets().forEach((s) => {
          if (s !== ws) { try { s.send(out); } catch (e) {} }
        });
      }
    } catch (e) {}
  }

  webSocketClose(ws) { try { ws.close(); } catch (e) {} }
  webSocketError(ws) { try { ws.close(); } catch (e) {} }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/ws') {
        const stub = env.CHAT.get(env.CHAT.idFromName('main'));
        return stub.fetch(request);
      }
      if (path === '/api/messages' && request.method === 'GET') {
        return await getMessages(env);
      }
      if (path === '/api/send' && request.method === 'POST') {
        return await sendMessage(request, env);
      }
      if (path.startsWith('/api/media/') && request.method === 'GET') {
        return await getMedia(path.slice('/api/media/'.length), env);
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
        return json({ ok: true }); // صار عبر WebSocket
      }
      if (path === '/api/typing' && request.method === 'GET') {
        return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
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

    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function broadcast(env, obj) {
  try {
    const stub = env.CHAT.get(env.CHAT.idFromName('main'));
    await stub.fetch('https://do/broadcast', { method: 'POST', body: JSON.stringify(obj) });
  } catch (e) {}
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
      for (const s of due) {
        const entry = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: s.from,
          text: s.text,
          type: 'text',
          scheduled: true,
          timestamp: Date.now(),
        };
        list.push(entry);
        await broadcast(env, { t: 'msg', m: entry });
      }
      if (list.length > 500) list.splice(0, list.length - 500);
      await env.EYAD_HALA_KV.put('messages_log', JSON.stringify(list));
      await env.EYAD_HALA_KV.put('scheduled', JSON.stringify(remaining));
    }
  }

  return json(list);
}

/* فصل الوسائط الثقيلة (base64) عن السجل — بتتخزن لحالها وبيتخزن رابطها بس */
async function offloadMedia(entry, env) {
  const fields = ['image', 'audio', 'media'];
  for (const f of fields) {
    const v = entry[f];
    if (v && typeof v === 'string' && v.startsWith('data:')) {
      const mid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await env.EYAD_HALA_KV.put(`media:${mid}`, v);
      entry[f] = `/api/media/${mid}`;
    }
  }
}

async function getMedia(mid, env) {
  const dataUrl = await env.EYAD_HALA_KV.get(`media:${mid}`);
  if (!dataUrl) return new Response('not found', { status: 404 });
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma); // بعد "data:"
  const mime = header.split(';')[0] || 'application/octet-stream';
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function sendMessage(request, env) {
  const { from, text, image, audio, media, mediaType, replyTo, type, sos } = await request.json();
  if (from !== 'eyad' && from !== 'hala') {
    return json({ error: 'مرسل غير معروف' }, 400);
  }
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

  await offloadMedia(entry, env);

  // البث اللحظي أولاً (قبل الكتابة بالتخزين) — هاد سر السرعة
  await broadcast(env, { t: 'msg', m: entry });

  const list = await getMessagesList(env);
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
  await broadcast(env, { t: 'react', messageId, emoji, from });
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
  await broadcast(env, { t: 'update', m: list[idx] });
  return json({ ok: true });
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

/* ===== الإشعارات (Web Push بدون حمولة) =====
   المفتاح العام مو سري وبيتوافق مع الموجود بـ index.html.
   المفتاح الخاص لازم يكون Cloudflare secret باسم VAPID_PRIVATE_JWK
   (قيمته JSON بصيغة JWK: {"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."})
   يتحط عبر: wrangler secret put VAPID_PRIVATE_JWK */
const VAPID_PUBLIC = 'BHrW8JfecR9Q8o7YulIKdrSq-vgNsdUlmchV4HgZiP8hzGdwnnDJVOK6_M8CcG-PLuTcSF96G-pXyFMIJeYGepI';

function b64urlStr(s) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function vapidJwt(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = b64urlStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64urlStr(
    JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:app@example.com' })
  );
  const unsigned = header + '.' + payload;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
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
    if (!env.VAPID_PRIVATE_JWK) return;
    const jwt = await vapidJwt(sub.endpoint, env);
    await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400',
        Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
      },
    });
  } catch (e) {}
  }
    
