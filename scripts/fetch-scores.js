/*
 * fetch-scores.js  —  runs on GitHub's servers, never in the browser.
 * Calls SofaScore (via RapidAPI), filters to the 2026 World Cup, and writes
 * a small scores.json the front-end reads. The API key comes from the
 * RAPIDAPI_KEY repo secret and is never written into the output.
 *
 * SofaScore live endpoint returns: { events: [ { tournament, homeTeam,
 * awayTeam, homeScore, awayScore, status, time, ... } ] }
 */

const fs = require("fs");

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = process.env.RAPIDAPI_HOST || "sofascore.p.rapidapi.com";

if (!KEY) {
  console.error("Missing RAPIDAPI_KEY secret.");
  process.exit(1);
}

/* ---- which competition counts as "the World Cup" ----
   SofaScore tournament names contain "World Cup". We match loosely so we
   don't depend on an exact unique-tournament id. */
const isWorldCup = (ev) => {
  const t = ev?.tournament?.name || ev?.tournament?.uniqueTournament?.name || "";
  const c = ev?.tournament?.category?.name || "";
  return /world cup/i.test(t) || (/world/i.test(t) && /cup/i.test(t)) ||
         /world cup/i.test(c);
};

/* ---- map SofaScore status -> our simple state ----
   SofaScore status.type: "notstarted" | "inprogress" | "finished"
   status.description carries detail: "1st half", "Halftime", "2nd half",
   "Extra time", "Penalties", "Ended", "AP" etc. */
function mapState(ev) {
  const type = ev?.status?.type || "";
  const desc = (ev?.status?.description || "").toLowerCase();

  if (type === "finished") {
    if (desc.includes("penalt")) return "AP";   // after penalties
    if (desc.includes("extra"))  return "AET";  // after extra time
    return "FT";
  }
  if (type === "inprogress") {
    if (desc.includes("half") && desc.includes("time")) return "HT"; // halftime
    if (desc.includes("halftime")) return "HT";
    if (desc.includes("penalt")) return "PEN";
    if (desc.includes("extra"))  return "ET";
    return "LIVE";
  }
  return "NS"; // not started
}

/* live minute, if SofaScore exposes it (best-effort) */
function liveMinute(ev) {
  // SofaScore sometimes provides time.currentPeriodStartTimestamp etc.
  // We surface the description's minute if present, else null.
  const m = (ev?.status?.description || "").match(/(\d{1,3})['’]/);
  return m ? parseInt(m[1], 10) : null;
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
    const data = await getJSON("/api/v1/sport/football/events/live");
    const events = Array.isArray(data?.events) ? data.events : [];

    const wc = events.filter(isWorldCup);

    out.matches = wc.map((ev) => ({
      home:      ev?.homeTeam?.name ?? "",
      away:      ev?.awayTeam?.name ?? "",
      homeScore: ev?.homeScore?.current ?? null,
      awayScore: ev?.awayScore?.current ?? null,
      state:     mapState(ev),
      minute:    liveMinute(ev),
    }));

    console.log(`Found ${events.length} live football events, ${wc.length} World Cup.`);
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
