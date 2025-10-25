const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Fix import for lrclib-api
const LrcLibModule = require("lrclib-api");
const LrcLib = LrcLibModule.default || LrcLibModule;
const lrclib = LrcLib(); // call as a function

console.log("lrclib initialized successfully!");


// Configuration
const INPUT_CSV = "muse_dataset.csv";     // Your CSV with track & artist
const LYRICS_DIR = "lyrics";              // Folder to save lyrics
const FAILED_CSV = "failed.csv";          // Log failed fetches
const PROGRESS_CSV = "progress.json";     // Tracks already fetched
const DELAY_MS = 2000;                    // 2-second delay between requests
const MAX_RETRIES = 3;                    // Retry limit

// Ensure lyrics folder exists
if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR);

// Load already fetched songs for resume support
let progress = {};
if (fs.existsSync(PROGRESS_CSV)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_CSV));
}

// Load CSV
const songs = [];
fs.createReadStream(INPUT_CSV)
  .pipe(csv())
  .on("data", (row) => songs.push(row))
  .on("end", async () => {
    console.log(`Loaded ${songs.length} songs from CSV.`);

    for (const song of songs) {
      const { track, artist } = song;

      // Skip if already fetched
      if (progress[track]) continue;

      let attempt = 0;
      let success = false;

      while (attempt < MAX_RETRIES && !success) {
        try {
          const lyricsData = await lrclib.search({ title: track, artist });

          if (lyricsData?.lyrics) {
            const safeName = track.replace(/[\/\\:*?"<>|]/g, "_");
            fs.writeFileSync(path.join(LYRICS_DIR, `${safeName}.txt`), lyricsData.lyrics);

            console.log(`✅ Saved lyrics for: ${track}`);
            progress[track] = true;
            fs.writeFileSync(PROGRESS_CSV, JSON.stringify(progress, null, 2));

            success = true;
          } else {
            console.log(`⚠️ No lyrics found for: ${track}`);
            logFailure(track, artist);
            success = true; // Consider "no lyrics" a success
          }
        } catch (err) {
          attempt++;
          console.log(`❌ Error fetching ${track} (attempt ${attempt}): ${err.message}`);
          if (attempt === MAX_RETRIES) logFailure(track, artist);
        }
      }

      // Delay before next request
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    console.log("🎵 Lyrics fetching completed.");
  });

// Log failed songs for retry later
function logFailure(track, artist) {
  const line = `"${track}","${artist}"\n`;
  fs.appendFileSync(FAILED_CSV, line);
}
