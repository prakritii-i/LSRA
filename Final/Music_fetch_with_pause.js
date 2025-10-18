const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");

const client = new Client();

const inputFile = "muse_v3.csv";
const outputFile = "muse_sample_with_lyrics.csv";
const failedFile = "failed_lyrics.csv";

const DELAY = 500; // milliseconds
const RETRY_LIMIT = 3;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const fetchWithRetry = async (query, retries = RETRY_LIMIT) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.findLyrics(query);
      return result;
    } catch (error) {
      if (attempt === retries) throw error;
      await delay(1000); // wait before retrying
    }
  }
};

// Load existing results to skip processed rows
const loadProcessed = (file) => {
  if (!fs.existsSync(file)) return [];
  const data = fs.readFileSync(file, "utf8").split("\n").slice(1); // skip header
  return data
    .map((line) => line.split(",")[0]) // assume first column = track or unique ID
    .filter(Boolean);
};

const run = async () => {
  const rows = [];

  fs.createReadStream(inputFile)
    .pipe(csv())
    .on("data", (data) => rows.push(data))
    .on("end", async () => {
      const processedTracks = new Set(loadProcessed(outputFile));
      const results = [];
      const failed = [];

      for (const row of rows.slice(0, 10)) { // ⬅️ Change/remove slice when scaling
        const track = row.track;
        const artist = row.artist;

        // Skip if already processed
        if (processedTracks.has(track)) {
          console.log(`⏩ Skipped (already done): ${track} - ${artist}`);
          continue;
        }

        const query = {
          track_name: track,
          artist_name: artist,
        };

        try {
          const metadata = await fetchWithRetry(query);
          const lyrics = metadata?.plainLyrics || "LYRICS_NOT_FOUND";

          results.push({
            ...row,
            lyrics: lyrics,
          });

          console.log(`✅ Found lyrics: ${track} - ${artist}`);
        } catch (err) {
          console.warn(`❌ Failed: ${track} - ${artist}`);
          failed.push({
            ...row,
            reason: err.message || "Unknown error",
          });
        }

        await delay(DELAY);
      }

      // Append mode for successful fetches
      if (results.length > 0) {
        const headers = Object.keys(results[0]).map((key) => ({
          id: key,
          title: key,
        }));

        const csvWriter = createCsvWriter({
          path: outputFile,
          header: headers,
          append: fs.existsSync(outputFile), // append if file exists
        });

        await csvWriter.writeRecords(results);
        console.log(`🎉 Appended ${results.length} rows to ${outputFile}`);
      }

      // Append mode for failures
      if (failed.length > 0) {
        const failHeaders = Object.keys(failed[0]).map((key) => ({
          id: key,
          title: key,
        }));

        const failWriter = createCsvWriter({
          path: failedFile,
          header: failHeaders,
          append: fs.existsSync(failedFile),
        });

        await failWriter.writeRecords(failed);
        console.warn(`⚠️ Logged ${failed.length} failures to ${failedFile}`);
      }
    });
};

run();
