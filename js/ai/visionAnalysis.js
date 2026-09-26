/**
 * Radar-screenshot AI vision analysis. There is no built-in vision service —
 * this app is otherwise fully on-device — so this sends the picked image to
 * a vision-capable endpoint the USER configures themselves (Settings → Data
 * & About → Radar image AI analysis), the same "bring your own Cloudflare
 * Worker" pattern already used for push notifications (pushServerUrl). No
 * image data goes anywhere unless that URL is set. The endpoint is expected
 * to accept a JSON POST of {image: <data URL>, prompt} and return JSON with
 * a text/description/result string field (or a plain string body).
 */
import { settings } from '../storage.js';

export const VISION_PROMPT = 'You are a radar meteorology assistant helping a storm chaser. Describe what this radar image shows: storm structure (e.g. hook echo, bow echo, bounded weak echo region, debris ball, supercell classic/HP/LP structure), any signs of rotation or a mesocyclone, and anything else notable. Be concise (3-5 sentences), and always note this is an AI visual read of a static image, not an official NWS product.';

export async function analyzeRadarImage(file) {
  if (!settings.visionApiUrl) {
    return {
      ok: false,
      error: 'No vision analysis endpoint is configured yet. Add your own vision-capable API/Worker URL in Settings → Data & About → “Radar image AI analysis”.',
    };
  }
  let dataUrl;
  try {
    dataUrl = await fileToDataUrl(file);
  } catch {
    return { ok: false, error: 'Couldn\'t read that image file.' };
  }
  try {
    const res = await fetch(settings.visionApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, prompt: VISION_PROMPT }),
    });
    if (!res.ok) return { ok: false, error: `Endpoint returned HTTP ${res.status}.` };
    let data;
    try { data = await res.json(); } catch { data = null; }
    const text = (data && (data.text || data.description || data.result))
      || (typeof data === 'string' ? data : null);
    if (!text) return { ok: false, error: 'Endpoint responded but didn\'t include a text/description/result field in its JSON.' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: `Couldn't reach the endpoint (${err.message}). Check the URL and that it allows requests from this app's origin.` };
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
