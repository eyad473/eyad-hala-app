import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store = getStore('eyad-hala-messages');
    const list = (await store.get('log', { type: 'json' })) || [];
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
