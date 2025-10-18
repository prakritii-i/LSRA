const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");
const franc = require("franc"); // ✅ Language detection

// -------------------- Configuration --------------------
const INPUT_CSV = "muse_final_emotion_dataset.csv";
const OUTPUT_CSV = "muse_with_lyrics.csv";
const FAILED_CSV = "failed_lyrics.csv";
const NON_ENGLISH_CSV = "non_english_lyrics.csv";
const PROGRESS_FILE = "progress.json";

const BATCH_SIZE = 500;     // number of songs processed in a batch
const DELAY_MS = 300;       // delay between API calls
const RETRY_LIMIT = 3;      // number of retries per song

// Initialize API client
const client = new Client();

// -------------------- Helpers --------------------

// Delay helper
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Retry fetch helper
const fetchWithRetry = async (query, retries = RETRY_LIMIT) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await client.findLyrics(query);
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt} failed for "${query.track_name}"`);
      if (attempt === retries) throw error;
      await delay(2000);
    }
  }
};

// Load progress (for resume support)
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

// -------------------- Main Logic --------------------
const run = async () => {
  const allSongs = await loadSongs();
  console.log(`📊 Total songs loaded: ${allSongs.length}`);

  for (let i = 0; i < allSongs.length; i += BATCH_SIZE) {
    const batch = allSongs.slice(i, i + BATCH_SIZE);
    console.log(`\n➡️ Processing batch ${i / BATCH_SIZE + 1} (${batch.length} songs)`);

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

        if (lyrics === "LYRICS_NOT_FOUND") {
          // Log failed fetch
          await appendToCsv(FAILED_CSV, [{ ...row, reason: "Lyrics not found" }]);
          console.warn(`❌ Not found: ${track}`);
        } else {
          // Detect language using franc
          const lang = franc(lyrics, { minLength: 20 }); // better accuracy
          if (lang !== "eng") {
            // Log non-English
            await appendToCsv(NON_ENGLISH_CSV, [{ ...row, language: lang }]);
            console.log(`🌐 Non-English (${lang}): ${track}`);
          } else {
            // Save English lyrics
            await appendToCsv(OUTPUT_CSV, [{ ...row, lyrics }]);
            console.log(`✅ Saved English lyrics: ${track}`);
          }
        }
      } catch (err) {
        await appendToCsv(FAILED_CSV, [{ ...row, reason: err.message || "Unknown error" }]);
        console.warn(`❌ Failed: ${track} - ${artist}`);
      }

      // Mark progress after each song
      progress[track] = true;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

      // Delay to respect API limits
      await delay(DELAY_MS);
    }
  }

  console.log("\n🎵 Lyrics fetching completed for all batches!");
};

run().catch((err) => console.error("Fatal error:", err));
