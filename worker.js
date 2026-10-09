// BitmapComps wallet API: returns the valid bitmaps (with traits) held by a Bitcoin address.
// Source: Ordinals Wallet's indexer, which tags only first-inscribed (valid) bitmaps as collection "bitmap".
const ALLOWED = ['https://bitmapcomps.com', 'https://www.bitmapcomps.com', 'http://localhost:8000'];
const ADDR = /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;

function cors(req) {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(req, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(req), ...extra }
  });
}

function traitsOf(meta) {
  const t = {};
  for (const a of (meta && meta.attributes) || []) t[a.trait_type] = a.value;
  return t;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    if (url.pathname === '/health') return json(req, { ok: true, stripe: !!(env && env.STRIPE_KEY) });

    // Paid report unlock: verify a Stripe Checkout Session server-side.
    if (url.pathname === '/unlock') {
      const sid = (url.searchParams.get('session_id') || '').trim();
      if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return json(req, { ok: false, error: 'Missing or invalid payment reference.' }, 400);
      if (!env || !env.STRIPE_KEY) return json(req, { ok: false, error: 'Payments are not configured yet.' }, 503);
      let s;
      try {
        const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + sid, { headers: { Authorization: 'Bearer ' + env.STRIPE_KEY } });
        s = await r.json();
        if (!r.ok) return json(req, { ok: false, error: 'Could not find that payment.' }, 404);
      } catch (e) {
        return json(req, { ok: false, error: 'Could not reach Stripe. Try again in a minute.' }, 502);
      }
      const paid = s.payment_status === 'paid' && s.status === 'complete' && (s.amount_total || 0) >= 1500 && s.currency === 'usd';
      if (!paid) return json(req, { ok: false, error: 'That payment is not complete.' }, 402);
      const addr = (s.client_reference_id || '').trim();
      return json(req, { ok: true, address: ADDR.test(addr) ? addr : null, email: s.customer_details ? s.customer_details.email : null });
    }
    if (url.pathname !== '/wallet') return json(req, { error: 'Not found' }, 404);

    const address = (url.searchParams.get('address') || '').trim();
    if (!ADDR.test(address)) return json(req, { error: 'That doesn\'t look like a Bitcoin address.' }, 400);

    const cache = caches.default;
    const key = new Request('https://cache.bitmapcomps/wallet/' + address);
    const hit = await cache.match(key);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...cors(req) } });
    }

    let list;
    try {
      const r = await fetch('https://turbo.ordinalswallet.com/wallet/' + address + '/inscriptions', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'BitmapComps/1.0 (+https://bitmapcomps.com)' }
      });
      if (!r.ok) return json(req, { error: 'Indexer returned ' + r.status + '. Try again in a minute.' }, 502);
      list = await r.json();
    } catch (e) {
      return json(req, { error: 'Could not reach the indexer. Try again in a minute.' }, 502);
    }
    if (!Array.isArray(list)) return json(req, { error: 'Unexpected indexer response.' }, 502);

    const bitmaps = [];
    for (const i of list) {
      const slugs = i.collection_slugs || [];
      const isBitmap = slugs.includes('bitmap') || (i.collection && i.collection.slug === 'bitmap');
      const m = isBitmap && i.meta && /^(\d+)\.bitmap$/.exec(i.meta.name || '');
      if (!m) continue;
      bitmaps.push({ h: Number(m[1]), id: i.id, t: traitsOf(i.meta) });
    }
    bitmaps.sort((a, b) => a.h - b.h);

    const body = JSON.stringify({
      address,
      totalInscriptions: list.length,
      bitmaps,
      source: 'Ordinals Wallet index',
      fetchedAt: new Date().toISOString()
    });
    const res = new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...cors(req) } });
  }
};
