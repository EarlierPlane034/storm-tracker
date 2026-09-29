/**
 * NEXRAD Level II availability check — the same raw, full polar-resolution
 * radar data RadarScope decodes and renders itself (public domain, hosted
 * by NOAA on AWS Open Data at noaa-nexrad-level2, no key required).
 *
 * This only LISTS what's available; it does not decode or render it. A
 * correct Level II binary decoder (BZIP2-compressed message blocks, the
 * Message Type 31 generic radar data format, polar gate-by-gate moment
 * data) plus a polar-to-map renderer is a large, specialized project that
 * needs iterative testing against real captured volume files to get right
 * — not something to ship as "done" without that testing. This module is
 * the honest first step: it confirms the pipeline reaches the exact same
 * source RadarScope uses and reports how fresh the data is, as a
 * foundation for the real decoder later.
 */
const BUCKET = 'https://noaa-nexrad-level2.s3.amazonaws.com';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Most recent Level II volume object for a site — checks today (UTC),
 * falling back to yesterday if nothing has landed yet today. */
export async function fetchLevel2Availability(siteId) {
  const now = new Date();
  for (const daysAgo of [0, 1]) {
    const d = new Date(now.getTime() - daysAgo * 86400000);
    const prefix = `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${siteId}/`;
    const url = `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
    let text;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue; // no network / CORS blocked / bucket unreachable — try the earlier day, then give up
    }
    const entry = parseLatestObject(text);
    if (entry) return entry;
  }
  return null;
}

/** Parses an S3 ListBucketResult XML body for the newest <Contents> entry.
 * This bucket's keys are zero-padded timestamps in the filename, so they
 * sort lexicographically by time — the last entry is the newest. Exported
 * standalone so it can be unit-tested against a fixture without a network
 * call. */
export function parseLatestObject(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const contents = [...doc.getElementsByTagName('Contents')];
  if (!contents.length) return null;
  const last = contents[contents.length - 1];
  const key = last.getElementsByTagName('Key')[0]?.textContent;
  const sizeText = last.getElementsByTagName('Size')[0]?.textContent;
  const lastModifiedText = last.getElementsByTagName('LastModified')[0]?.textContent;
  if (!key || key.endsWith('/')) return null;
  return {
    key,
    sizeBytes: sizeText ? Number(sizeText) : null,
    lastModified: lastModifiedText ? new Date(lastModifiedText) : null,
    url: `${BUCKET}/${key}`,
  };
}
