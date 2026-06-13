/*
 * fetch-scores.js  —  runs on GitHub's servers, never in the browser.
 * Calls API-Football (via RapidAPI), fetches all World Cup 2026 matches for
 * today (live and finished), and writes a small scores.json the front-end reads.
 * The API key comes from the RAPIDAPI_KEY repo secret.
 *
 * API-Football by-date endpoint returns: { response: [ { league, fixture, teams,
 * goals, status.short (FT/HT/1H/2H/ET/P/AET/PEN/LIVE/NS), ... } ] }
 */

const fs = require("fs");

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = process.env.RAPIDAPI_HOST || "free-api-live-football-data.p.rapidapi.com";

if (!KEY) {
  console.error("Missing RAPIDAPI_KEY secret.");
  process.exit(1);
}

/* ---- Get today's date in Mecca time (UTC+3), format as YYYYMMDD ---- */
function getMeccaDateString() {
  const meccaOffset = 3 * 3600000;
  const now = new Date(Date.now() + meccaOffset);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/* ---- which match is the World Cup 2026 ---- */
const isWorldCup = (match) => {
  const league = match?.league?.name || "";
  return /2026|world cup/i.test(league);
};

/* ---- map API-Football status.short to our state ---- */
function mapState(match) {
  const short = match?.fixture?.status?.short || "NS";

  if (short === "FT") return "FT";
  if (short === "AET") return "AET";  // after extra time
  if (short === "PEN" || short === "P") return "AP";  // after penalties
  if (short === "HT") return "HT";
  if (short === "ET") return "ET";
  if (short === "LIVE" || short === "1H" || short === "2H") return "LIVE";
  return "NS";
}

/* extract live minute */
function liveMinute(match) {
  const elapsed = match?.fixture?.status?.elapsed;
  return elapsed ? Math.round(elapsed) : null;
}

async function getJSON(path) {
  const res = await fetch(`https://${HOST}${path}`, {
    headers: {
      "x-rapidapi-key": KEY,
      "x-rapidapi-host": HOST,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

async function main() {
  let out = { updated: new Date().toISOString(), matches: [] };

  try {
    const dateStr = getMeccaDateString();
    const path = `/football-get-matches-by-date?date=${dateStr}`;
    const data = await getJSON(path);
    const matches = Array.isArray(data?.response) ? data.response : [];

    const wc = matches.filter(isWorldCup);

    out.matches = wc.map((m) => ({
      home:      m?.teams?.home?.name ?? "",
      away:      m?.teams?.away?.name ?? "",
      homeScore: m?.goals?.home ?? null,
      awayScore: m?.goals?.away ?? null,
      state:     mapState(m),
      minute:    liveMinute(m),
    }));

    console.log(`Found ${matches.length} matches on ${dateStr}, ${wc.length} World Cup 2026.`);
  } catch (err) {
    console.error("Fetch failed:", err.message);
    out.error = err.message;
  }

  fs.writeFileSync("scores.json", JSON.stringify(out, null, 2));
  console.log("Wrote scores.json");
}

main();
