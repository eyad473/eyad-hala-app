// ستيكرز و GIFs — وسيط لـ GIPHY (المفتاح يضل سري بالسيرفر)
export default async (req) => {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GIPHY not configured', items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type') === 'gifs' ? 'gifs' : 'stickers';
  const q = (url.searchParams.get('q') || '').slice(0, 60);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  const giphyUrl = new URL(`https://api.giphy.com/v1/${type}/${q ? 'search' : 'trending'}`);
  giphyUrl.searchParams.set('api_key', apiKey);
  giphyUrl.searchParams.set('limit', '24');
  giphyUrl.searchParams.set('offset', String(offset));
  giphyUrl.searchParams.set('rating', 'pg-13');
  if (q) {
    giphyUrl.searchParams.set('q', q);
    giphyUrl.searchParams.set('lang', 'ar');
  }

  try {
    const res = await fetch(giphyUrl.toString());
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'giphy request failed', items: [] }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json();
    const items = (data.data || [])
      .map((g) => ({
        id: g.id,
        preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || g.images?.original?.url,
        full: g.images?.original?.url || g.images?.downsized?.url,
      }))
      .filter((it) => it.preview && it.full);

    return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, items: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
