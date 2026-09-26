/** Local tornado climatology — derived from the SPC historical-tracks
 * fetch the tornado-history map layer already downloads, so this needs no
 * extra network call: just a summary of the same rows already sitting in
 * memory (count, peak month, strongest, deadliest) for whatever ~200 km
 * window is currently on screen. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let current = null;

export function computeClimatology(tracks) {
  if (!tracks || !tracks.length) { current = null; return null; }
  const byMonth = new Array(12).fill(0);
  let strongest = 0, deadliest = null, totalFat = 0;
  for (const t of tracks) {
    const m = Number(String(t.date || '').slice(5, 7)) - 1;
    if (m >= 0 && m < 12) byMonth[m]++;
    if (t.mag > strongest) strongest = t.mag;
    totalFat += t.fat || 0;
    if (!deadliest || (t.fat || 0) > (deadliest.fat || 0)) deadliest = t;
  }
  const peakMonthIdx = byMonth.indexOf(Math.max(...byMonth));
  current = {
    count: tracks.length,
    peakMonth: MONTHS[peakMonthIdx],
    strongestEF: strongest,
    totalFatalities: totalFat,
    deadliestDate: deadliest ? deadliest.date : null,
    deadliestFat: deadliest ? deadliest.fat || 0 : 0,
  };
  return current;
}

export function getClimatology() {
  return current;
}
