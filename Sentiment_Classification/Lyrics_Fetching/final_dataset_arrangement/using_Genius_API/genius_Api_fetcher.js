/**
 * Genius API Fetcher - for anger & fear songs
 * Author: Prakriti x GPT-5
 */

require("dotenv").config(); // 👈 Load .env file
const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fetch = require("node-fetch");

// ================= CONFIG =================
const GENIUS_TOKEN = process.env.GENIUS_API_TOKEN; // 👈 from .env
if (!GENIUS_TOKEN) {
  console.error("❌ Missing Genius API token. Add GENIUS_API_TOKEN to .env");
  process.exit(1);
}

const INPUT_CSV = "failed_anger_fear_subset.csv"; // filtered file
const OUTPUT_CSV = "genius_anger_fear_with_lyrics.csv";
const FAILED_CSV = "genius_anger_fear_failed.csv";
const PROGRESS_FILE = "genius_progress.json";
const DELAY_MS = 1500; // ⏳ Slightly safer delay (Genius is stricter)

// ================= INIT ====================
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
}

// ================= HELPERS ================

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const loadSongs = () => {
  return new Promise((resolve, reject) => {
    const songs = [];
    fs.createReadStream(INPUT_CSV)
      .pipe(csv())
      .on("data", (row) => songs.push(row))
      .on("end", () => resolve(songs))
      .on("error", reject);
  });
};

const appendRow = async (file, row) => {
  const exists = fs.existsSync(file);
  const headers = Object.keys(row).map((key) => ({ id: key, title: key }));
  const writer = createCsvWriter({
    path: file,
    header: headers,
    append: exists,
  });
  await writer.writeRecords([row]);
};

const cleanText = (text) => {
  return text
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|\"|\'/g, "")
    .replace(/feat\..*|ft\..*/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
};

const searchGenius = async (track, artist) => {
  const query = encodeURIComponent(`${track} ${artist}`);
  const url = `https://api.genius.com/search?q=${query}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${GENIUS_TOKEN}` },
  });

  if (!resp.ok) throw new Error(`Genius API error: ${resp.status}`);
  const data = await resp.json();
  const hits = data?.response?.hits || [];

  if (hits.length === 0) return null;

  const cleanedTrack = cleanText(track);
  const cleanedArtist = cleanText(artist);
  for (const hit of hits) {
    const title = cleanText(hit.result.title);
    const primaryArtist = cleanText(hit.result.primary_artist.name);
    if (title.includes(cleanedTrack) && primaryArtist.includes(cleanedArtist)) {
      return hit.result.url;
    }
  }

  return hits[0].result.url;
};

const scrapeLyrics = async (url) => {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load Genius page: ${resp.status}`);
  const html = await resp.text();
  const lyricsMatch = html.match(
    /<div class="Lyrics__Container.*?">(.*?)<\/div>/gs
  );
  if (!lyricsMatch) return null;

  const lyrics = lyricsMatch
    .map((block) =>
      block
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<.*?>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
    )
    .join("\n")
    .trim();

  return lyrics || null;
};

// ================= MAIN ====================
const run = async () => {
  const songs = await loadSongs();
  console.log(`📊 Loaded ${songs.length} anger/fear songs to fetch`);

  for (const row of songs) {
    const track = row.track?.trim();
    const artist = row.artist?.trim();
    if (!track || !artist) continue;

    const key = `${track}::${artist}`;
    if (progress[key]) {
      console.log(`⏩ Already processed: ${track} - ${artist}`);
      continue;
    }

    try {
      const url = await searchGenius(track, artist);
      if (!url) throw new Error("No Genius match found");

      const lyrics = await scrapeLyrics(url);
      if (!lyrics) throw new Error("Lyrics not found on page");

      await appendRow(OUTPUT_CSV, { ...row, lyrics, genius_url: url });
      console.log(`✅ Fetched: ${track} - ${artist}`);
    } catch (err) {
      console.warn(`❌ Failed: ${track} - ${artist} → ${err.message}`);
      await appendRow(FAILED_CSV, { ...row, reason: err.message });
    }

    progress[key] = true;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

    await delay(DELAY_MS);
  }

  console.log("\n🎉 Genius fetching completed!");
};

run().catch((err) => console.error("Fatal error:", err));
