const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");

// Configuration
const INPUT_CSV = "muse_final_emotion_dataset.csv";  // Input dataset
const OUTPUT_CSV = "muse_with_lyrics.csv";            // Output with fetched lyrics
const FAILED_CSV = "failed_lyrics.csv";              // Failed fetches log
const PROGRESS_FILE = "progress_smh.json";               // Tracks processed songs
const DELAY_MS = 300;                                // Delay between requests
const RETRY_LIMIT = 3;                               // Retry per song

// Initialize API client
const client = new Client();

// Delay helper
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Retry fetch helper
const fetchWithRetry = async (query, retries = RETRY_LIMIT) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.findLyrics(query);
      return result;
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt} failed for "${query.track_name}"`);
      if (attempt === retries) throw error;
      await delay(2000); // wait before retry
    }
  }
};

// Load progress for resume support
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
}

// Load CSV into memory
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

// Append single row to CSV immediately
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

// Main function
const run = async () => {
  const allSongs = await loadSongs();
  console.log(`📊 Total songs loaded: ${allSongs.length}`);

  for (const row of allSongs) {
    const track = row.track;
    const artist = row.artist;

    // Skip already processed
    if (progress[track]) {
      console.log(`⏩ Skipped: ${track} - ${artist}`);
      continue;
    }

    const query = { track_name: track, artist_name: artist };

    try {
      const metadata = await fetchWithRetry(query);
      const lyrics = metadata?.plainLyrics || "LYRICS_NOT_FOUND";

      // Write immediately
      await appendRowToCsv(OUTPUT_CSV, { ...row, lyrics });
      console.log(`✅ Fetched: ${track} - ${artist}`);
    } catch (err) {
      console.warn(`❌ Failed: ${track} - ${artist}`);
      await appendRowToCsv(FAILED_CSV, { ...row, reason: err.message || "Unknown error" });
    }

    // Save progress after each song
    progress[track] = true;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

    // Delay between requests
    await delay(DELAY_MS);
  }

  console.log("\n🎵 Lyrics fetching completed for all songs!");
};

run().catch((err) => console.error("Fatal error:", err));
