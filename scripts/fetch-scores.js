/*
 * fetch-scores.js  —  runs on GitHub's servers, never in the browser.
 * Calls football-data.org (free API), fetches all World Cup 2026 matches
 * (live, finished, and scheduled), and writes scores.json the front-end reads.
 * The API key comes from the RAPIDAPI_KEY repo secret (reusing the env var name).
 *
 * football-data.org response: { matches: [ { utcDate, status, homeTeam, awayTeam,
 * score: { fullTime, halfTime, winner }, ... } ] }
 */

const fs = require("fs");

const API_KEY = process.env.RAPIDAPI_KEY;  // reuse this env var for football-data.org key

if (!API_KEY) {
  console.error("Missing API key in RAPIDAPI_KEY secret.");
  process.exit(1);
}

/* ---- map football-data.org status to our state ---- */
function mapState(match) {
  const status = match?.status || "SCHEDULED";
  const score = match?.score || {};

  if (status === "FINISHED") {
    // Check if it went to extra time or penalties
    if (score.duration === "PENALTY") return "AP";    // after penalties
    if (score.duration === "EXTRA_TIME") return "AET"; // after extra time
    return "FT";
  }
  if (status === "LIVE" || status === "IN_PLAY") return "LIVE";
  if (status === "PAUSED") return "HT";  // halftime or pause
  return "NS"; // not started (SCHEDULED, POSTPONED, CANCELLED, AWARDED, etc.)
}

/* extract minute from utcDate and compare to now (rough estimate) */
function liveMinute(match) {
  if (match?.status !== "LIVE" && match?.status !== "IN_PLAY") return null;
  const kickoff = new Date(match?.utcDate);
  const now = new Date();
  const elapsedMs = now - kickoff;
  const elapsedMin = Math.round(elapsedMs / 60000);
  return elapsedMin > 0 ? elapsedMin : null;
}

async function getJSON(path) {
  const res = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: {
      "X-Auth-Token": API_KEY,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

async function main() {
  let out = { updated: new Date().toISOString(), matches: [] };

  try {
    // Fetch all World Cup 2026 matches (live + finished + scheduled)
    const data = await getJSON("/competitions/WC/matches?status=SCHEDULED,LIVE,FINISHED");
    const matches = Array.isArray(data?.matches) ? data.matches : [];

    out.matches = matches.map((m) => ({
      home:      m?.homeTeam?.name ?? "",
      away:      m?.awayTeam?.name ?? "",
      homeScore: m?.score?.fullTime?.home ?? null,
      awayScore: m?.score?.fullTime?.away ?? null,
      state:     mapState(m),
      minute:    liveMinute(m),
    }));

    console.log(`Found ${matches.length} World Cup 2026 matches.`);
  } catch (err) {
    console.error("Fetch failed:", err.message);
    out.error = err.message;
  }

  fs.writeFileSync("scores.json", JSON.stringify(out, null, 2));
  console.log("Wrote scores.json");
}

main();
