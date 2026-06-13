/*
 * fetch-scores.js  —  runs on GitHub's servers, never in the browser.
 * Calls API-Football (via RapidAPI), filters to the 2026 World Cup, and writes
 * a small scores.json the front-end reads. The API key comes from the
 * RAPIDAPI_KEY repo secret and is never written into the output.
 *
 * API-Football live endpoint returns: { response: [ { league, fixture, teams,
 * goals, status.short (FT/HT/1H/2H/ET/P/AET/PEN/LIVE/NS), ... } ] }
 */

const fs = require("fs");

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = process.env.RAPIDAPI_HOST || "free-api-live-football-data.p.rapidapi.com";

if (!KEY) {
  console.error("Missing RAPIDAPI_KEY secret.");
  process.exit(1);
}

/* ---- which match is the World Cup 2026 ----
   API-Football returns league.name like "World Cup". Match on that. */
const isWorldCup = (match) => {
  const league = match?.league?.name || "";
  return /2026|world cup/i.test(league);
};

/* ---- map API-Football status.short to our state ----
   API-Football status.short: FT, HT, 1H, 2H, ET, P, AET, PEN, LIVE, NS
   We simplify to: FT, HT, LIVE, ET, AET, AP (after penalties), NS */
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

/* extract live minute from elapsed time */
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
    const data = await getJSON("/football-current-live");
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

    console.log(`Found ${matches.length} live football matches, ${wc.length} World Cup 2026.`);
  } catch (err) {
    /* On any error, keep the file valid but mark stale. We DON'T overwrite
       with garbage; the front-end falls back to its built-in RESULTS. */
    console.error("Fetch failed:", err.message);
    out.error = err.message;
  }

  fs.writeFileSync("scores.json", JSON.stringify(out, null, 2));
  console.log("Wrote scores.json");
}

main();
