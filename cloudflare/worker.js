/**
 * StormLens push worker — runs on Cloudflare Workers (free plan).
 *
 * What it does, once a minute (cron trigger):
 *   1. Downloads active NWS severe-weather alerts.
 *   2. For every registered phone, checks which alerts are inside / near
 *      that phone's saved location (and its saved favorites).
 *   3. Sends a Web Push notification through Apple/Google's push service,
 *      so alerts arrive even when StormLens is completely closed.
 *
 * HTTP endpoints (used by the StormLens app):
 *   GET  /vapid        -> { publicKey }  (auto-generated, stored in KV)
 *   POST /subscribe    -> body: { subscription, lat, lon, radiusKm, prefs, places }
 *   POST /unsubscribe  -> body: { endpoint }
 *   GET  /             -> status JSON
 *
 * Requirements in the Cloudflare dashboard (see docs/PUSH_SETUP.md):
 *   - a KV namespace bound as  SUBS
 *   - a cron trigger:  * * * * *
 *
 * Optionally edit CONTACT to your real email — it's the standard way push
 * services can reach the operator of a misbehaving sender. Nothing is
 * emailed to it.
 */

const CONTACT = 'mailto:you@example.com';

const ALERT_EVENTS = [
  'Tornado Warning', 'Tornado Watch',
  'Severe Thunderstorm Warning', 'Severe Thunderstorm Watch',
  'Flash Flood Warning', 'Flash Flood Watch',
].map(encodeURIComponent).join(',');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (url.pathname === '/vapid' && req.method === 'GET') {
        const vapid = await ensureVapid(env);
        return json({ publicKey: vapid.publicRaw });
      }

      if (url.pathname === '/subscribe' && req.method === 'POST') {
        const body = await req.json();
        const endpoint = body?.subscription?.endpoint;
        const keys = body?.subscription?.keys;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return json({ error: 'invalid subscription' }, 400);
        }
        const id = await sha256hex(endpoint);
        await env.SUBS.put(`sub:${id}`, JSON.stringify({
          subscription: { endpoint, keys },
          lat: num(body.lat), lon: num(body.lon),
          radiusKm: Math.min(500, num(body.radiusKm) || 100),
          prefs: body.prefs || {},
          places: Array.isArray(body.places) ? body.places.slice(0, 10) : [],
          updated: Date.now(),
        }));
        return json({ ok: true });
      }

      if (url.pathname === '/unsubscribe' && req.method === 'POST') {
        const body = await req.json();
        if (body?.endpoint) {
          await env.SUBS.delete(`sub:${await sha256hex(body.endpoint)}`);
        }
        return json({ ok: true });
      }

      // Community spotter reports (this household's own database).
      if (url.pathname === '/report' && req.method === 'POST') {
        const body = await req.json();
        const type = String(body?.type || '').slice(0, 30);
        const text = String(body?.text || '').slice(0, 200);
        if (!type || body?.lat == null || body?.lon == null) {
          return json({ error: 'type, lat, lon required' }, 400);
        }
        const key = `report:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await env.SUBS.put(key, JSON.stringify({
          type, text, lat: num(body.lat), lon: num(body.lon), t: Date.now(),
        }), { expirationTtl: 24 * 3600 });
        return json({ ok: true });
      }

      if (url.pathname === '/reports' && req.method === 'GET') {
        const list = await env.SUBS.list({ prefix: 'report:', limit: 100 });
        const reports = [];
        for (const k of list.keys) {
          const raw = await env.SUBS.get(k.name);
          if (raw) { try { reports.push(JSON.parse(raw)); } catch { /* skip */ } }
        }
        reports.sort((a, b) => b.t - a.t);
        return json({ reports });
      }

      if (url.pathname === '/' && req.method === 'GET') {
        const list = await env.SUBS.list({ prefix: 'sub:' });
        return json({ ok: true, service: 'StormLens push worker', subscribers: list.keys.length });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlerts(env));
  },
};

/* ------------------------- alert checking ------------------------- */

async function checkAlerts(env) {
  const vapid = await ensureVapid(env);

  const resp = await fetch(
    `https://api.weather.gov/alerts/active?status=actual&event=${ALERT_EVENTS}`,
    { headers: { 'User-Agent': `StormLens-push-worker (${CONTACT})`, Accept: 'application/geo+json' } },
  );
  if (!resp.ok) return;
  const data = await resp.json();
  const alerts = (data.features || []).map(normalizeAlert).filter(Boolean);
  if (!alerts.length) return;

  const list = await env.SUBS.list({ prefix: 'sub:' });
  for (const key of list.keys) {
    const raw = await env.SUBS.get(key.name);
    if (!raw) continue;
    let sub;
    try { sub = JSON.parse(raw); } catch { continue; }

    const places = [];
    if (sub.lat != null) places.push({ name: 'you', lat: sub.lat, lon: sub.lon });
    for (const p of sub.places || []) {
      if (p?.lat != null) places.push({ name: p.name || 'saved place', lat: p.lat, lon: p.lon });
    }
    if (!places.length) continue;

    for (const alert of alerts) {
      if (!prefAllows(sub.prefs, alert.kind)) continue;
      for (const place of places) {
        const d = distToAlertKm(alert, place);
        const inIt = d === 0;
        // Warnings alert when inside or nearby; watches only when inside.
        const isWatch = alert.kind.endsWith('watch');
        if (!(inIt || (!isWatch && d < Math.min(60, sub.radiusKm)))) continue;

        const dedupeKey = `sent:${key.name}:${alert.id}:${place.name}`;
        if (await env.SUBS.get(dedupeKey)) continue;
        await env.SUBS.put(dedupeKey, '1', { expirationTtl: 6 * 3600 });

        const who = place.name === 'you' ? 'you' : `“${place.name}”`;
        const where = inIt
          ? (place.name === 'you' ? 'includes your location' : `includes ${who}`)
          : `${Math.round(d * 0.621)} mi from ${who}`;
        const status = await sendPush(sub.subscription, {
          title: titleFor(alert),
          body: `${alert.areaDesc} — ${where}.${alert.kind === 'tor-warning' ? ' Take shelter guidance from NWS immediately.' : ''}`,
          tag: alert.id,
        }, vapid);

        // Push service says this phone is gone — clean it up.
        if (status === 404 || status === 410) {
          await env.SUBS.delete(key.name);
        }
        break; // one notification per alert per phone is enough
      }
    }
  }
}

function titleFor(alert) {
  switch (alert.kind) {
    case 'tor-warning': return alert.isEmergency ? '🚨 TORNADO EMERGENCY' : '🌪 Tornado Warning';
    case 'svr-warning': return '⛈ Severe Thunderstorm Warning';
    case 'ffw-warning': return '💧 Flash Flood Warning';
    case 'tor-watch': return 'Tornado Watch';
    case 'svr-watch': return 'Severe Thunderstorm Watch';
    case 'ffw-watch': return 'Flash Flood Watch';
    default: return 'Weather alert';
  }
}

function prefAllows(prefs = {}, kind) {
  const map = {
    'tor-warning': prefs.tornadoWarning !== false,
    'svr-warning': prefs.severeWarning !== false,
    'ffw-warning': prefs.flashFloodWarning !== false,
    'tor-watch': !!prefs.tornadoWatch,
    'svr-watch': !!prefs.severeWatch,
    'ffw-watch': !!prefs.flashFloodWatch,
  };
  return map[kind] ?? false;
}

function normalizeAlert(f) {
  const p = f.properties;
  if (!p) return null;
  const event = p.event || '';
  const kind =
    /tornado warning/i.test(event) ? 'tor-warning'
      : /tornado watch/i.test(event) ? 'tor-watch'
        : /severe thunderstorm warning/i.test(event) ? 'svr-warning'
          : /severe thunderstorm watch/i.test(event) ? 'svr-watch'
            : /flash flood warning/i.test(event) ? 'ffw-warning'
              : /flash flood watch/i.test(event) ? 'ffw-watch' : 'other';
  return {
    id: p.id || f.id,
    kind,
    areaDesc: p.areaDesc || event,
    geometry: f.geometry || null,
    isEmergency: /tornado emergency/i.test(p.description || ''),
  };
}

/* ---------------------- geometry helpers ---------------------- */

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function pointInGeometry(lat, lon, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) {
    let inside = false;
    const ring = poly[0] || [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

function distToAlertKm(alert, place) {
  if (!alert.geometry) return Infinity;
  if (pointInGeometry(place.lat, place.lon, alert.geometry)) return 0;
  let best = Infinity;
  const polys = alert.geometry.type === 'Polygon' ? [alert.geometry.coordinates]
    : alert.geometry.type === 'MultiPolygon' ? alert.geometry.coordinates : [];
  for (const poly of polys) {
    for (const [lon, lat] of poly[0] || []) {
      best = Math.min(best, haversineKm(place.lat, place.lon, lat, lon));
    }
  }
  return best;
}

/* ------------------- Web Push (VAPID + RFC 8291) ------------------- */

/** VAPID signing keys are generated once and kept in KV. */
async function ensureVapid(env) {
  const stored = await env.SUBS.get('sys:vapid');
  if (stored) return JSON.parse(stored);
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicRawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const vapid = { privateJwk, publicRaw: b64u(publicRawBytes) };
  await env.SUBS.put('sys:vapid', JSON.stringify(vapid));
  return vapid;
}

async function vapidJwt(audience, vapid) {
  const enc = (obj) => b64u(new TextEncoder().encode(JSON.stringify(obj)));
  const input = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: CONTACT,
  })}`;
  const key = await crypto.subtle.importKey(
    'jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
  return `${input}.${b64u(sig)}`;
}

/** Encrypt a payload per RFC 8291 (aes128gcm) for one subscription. */
async function encryptPayload(plaintext, keys) {
  const uaPub = fromB64u(keys.p256dh);      // browser's public key (65 bytes)
  const authSecret = fromB64u(keys.auth);   // browser's auth secret (16 bytes)

  const asPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey));
  const uaKey = await crypto.subtle.importKey(
    'raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, asPair.privateKey, 256));

  const keyInfo = concat(str('WebPush: info\0'), uaPub, asPub);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, str('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, str('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(new TextEncoder().encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aes, padded));

  // aes128gcm body header: salt(16) | record size(4) | keyid len(1) | keyid
  const header = concat(salt, u32(4096), new Uint8Array([asPub.length]), asPub);
  return concat(header, cipher);
}

async function sendPush(subscription, payload, vapid) {
  try {
    const jwt = await vapidJwt(new URL(subscription.endpoint).origin, vapid);
    const body = await encryptPayload(JSON.stringify(payload), subscription.keys);
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicRaw}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '600',
        Urgency: 'high',
      },
      body,
    });
    return res.status;
  } catch {
    return 0;
  }
}

/* ---------------------------- utils ---------------------------- */

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

const str = (s) => new TextEncoder().encode(s);

function u32(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function sha256hex(s) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
