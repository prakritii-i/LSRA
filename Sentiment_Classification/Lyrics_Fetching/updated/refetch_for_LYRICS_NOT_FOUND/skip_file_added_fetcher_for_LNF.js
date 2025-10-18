const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");

// ================= CONFIGURATION =================
const INPUT_CSV = "Failed_lyrics_from_db.csv"; // Input dataset
const OUTPUT_CSV = "not_found_retry_lyrics.csv"; // Lyrics fetched successfully
const FAILED_CSV = "failed_lyrics_LNF.csv"; // Failed fetches
const SKIPPED_CSV = "skipped_LNF_lyrics.csv"; // Already processed
const PROGRESS_FILE = "progress_LNF.json"; // Resume support
const DELAY_MS = 300; // Delay between API calls
const RETRY_LIMIT = 3; // Retries per song

// ================ INITIALIZATION ==================
const client = new Client();
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Load resume progress
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
}

// ================ HELPERS =========================

// Retry logic for API calls
const fetchWithRetry = async (query, retries = RETRY_LIMIT) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.findLyrics(query);
      return result;
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt} failed for "${query.track_name}"`);
      if (attempt === retries) throw error;
      await delay(800); // wait 2 sec before retry
    }
  }
};

// Load all songs from CSV
const loadSongs = async () => {
  const songs = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(INPUT_CSV)
      .pipe(csv())
      .on("data", (row) => songs.push(row))
      .on("end", () => resolve(songs))
      .on("error", reject);
  });
};

// Append a single row to a CSV file
const appendRowToCsv = async (file, row) => {
  const exists = fs.existsSync(file);
  const headers = Object.keys(row).map((key) => ({ id: key, title: key }));
  const writer = createCsvWriter({
    path: file,
    header: headers,
    append: exists,
  });
  await writer.writeRecords([row]);
};

// ================= MAIN FETCHER ===================
const run = async () => {
  const allSongs = await loadSongs();
  console.log(`📊 Total songs loaded: ${allSongs.length}`);

  for (const row of allSongs) {
    const track = row.track;
    const artist = row.artist;

    // --- Skip already processed songs ---
    if (progress[track]) {
      console.log(`⏩ Skipped: ${track} - ${artist}`);
      await appendRowToCsv(SKIPPED_CSV, {
        ...row,
        reason: "Already processed",
      });
      continue;
    }

    // --- Build query ---
    const query = { track_name: track, artist_name: artist };

    try {
      // Fetch lyrics with retry
      const metadata = await fetchWithRetry(query);
      const lyrics = metadata?.plainLyrics || "LYRICS_NOT_FOUND";

      // Save immediately to lyrics CSV
      await appendRowToCsv(OUTPUT_CSV, { ...row, lyrics });
      console.log(`✅ Fetched: ${track} - ${artist}`);
    } catch (err) {
      // Save failed attempts immediately
      console.warn(`❌ Failed: ${track} - ${artist}`);
      await appendRowToCsv(FAILED_CSV, {
        ...row,
        reason: err.message || "Unknown error",
      });
    }

    // --- Update progress after every song ---
    progress[track] = true;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

    // --- Respect rate limits ---
    await delay(DELAY_MS);
  }

  console.log("\n🎵 Lyrics fetching completed for all songs!");
};

// Run the script
run().catch((err) => console.error("Fatal error:", err));
