const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");

// Configuration
const INPUT_CSV = "muse_final_emotion_dataset.csv";             // Input dataset
const OUTPUT_CSV = "muse_with_lyrics.csv";   // Output with fetched lyrics
const FAILED_CSV = "failed_lyrics.csv";      // Failed fetches log
const PROGRESS_FILE = "progress.json";       // Tracks processed songs
const BATCH_SIZE = 500;                      // Songs per batch
const DELAY_MS = 300;                       // Delay between requests
const RETRY_LIMIT = 3;                       // Retry per song

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

// Append results to CSV
const appendToCsv = async (file, rows) => {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]).map((key) => ({ id: key, title: key }));
  const writer = createCsvWriter({
    path: file,
    header: headers,
    append: fs.existsSync(file),
  });
  await writer.writeRecords(rows);
};

// Main function
const run = async () => {
  const allSongs = await loadSongs();
  console.log(`📊 Total songs loaded: ${allSongs.length}`);

  for (let i = 0; i < allSongs.length; i += BATCH_SIZE) {
    const batch = allSongs.slice(i, i + BATCH_SIZE);
    console.log(`\n➡️ Processing batch ${i / BATCH_SIZE + 1} (${batch.length} songs)`);

    const batchResults = [];
    const batchFailed = [];

    for (const row of batch) {
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

        batchResults.push({ ...row, lyrics });
        console.log(`✅ Fetched: ${track} - ${artist}`);
      } catch (err) {
        console.warn(`❌ Failed: ${track} - ${artist}`);
        batchFailed.push({ ...row, reason: err.message || "Unknown error" });
      }

      // Save progress after each song
      progress[track] = true;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

      // Delay to respect rate limits
      await delay(DELAY_MS);
    }

    // Append batch results
    await appendToCsv(OUTPUT_CSV, batchResults);
    if (batchFailed.length > 0) await appendToCsv(FAILED_CSV, batchFailed);

    console.log(`📝 Batch completed: ${batchResults.length} successes, ${batchFailed.length} failures`);
  }

  console.log("\n🎵 Lyrics fetching completed for all batches!");
};

run().catch((err) => console.error("Fatal error:", err));
