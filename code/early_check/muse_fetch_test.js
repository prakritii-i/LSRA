const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Client } = require("lrclib-api");

const client = new Client();

const inputFile = "muse_sample.csv";
const outputFile = "muse_sample_with_lyrics2.csv";
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

const run = async () => {
  const rows = [];

  fs.createReadStream(inputFile)
    .pipe(csv())
    .on("data", (data) => rows.push(data))
    .on("end", async () => {
      const results = [];
      const failed = [];

      for (const row of rows.slice(0, 10)) { // ⬅️ Limit to 10 songs for now
        const track = row.track;
        const artist = row.artist;

        const query = {
          track_name: track,
          artist_name: artist,
        };

        try {
          const metadata = await fetchWithRetry(query);
          const lyrics = metadata.plainLyrics || "Not Found";

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

      // Save successful fetches
if (results.length > 0) {
  const headers = Object.keys(results[0]).map((key) => ({
    id: key,
    title: key,
  }));

  const csvWriter = createCsvWriter({
    path: outputFile,
    header: headers,
  });

  await csvWriter.writeRecords(results);
  console.log(`🎉 Saved ${results.length} lyrics to ${outputFile}`);
} else {
  console.warn("⚠️ No lyrics were found, skipping save for results.");
}


    //   // Save successful fetches
    //   const headers = Object.keys(results[0] || rows[0]).map((key) => ({
    //     id: key,
    //     title: key,
    //   }));

    //   const csvWriter = createCsvWriter({
    //     path: outputFile,
    //     header: headers,
    //   });

    //   await csvWriter.writeRecords(results);
    //   console.log(`🎉 Saved lyrics to ${outputFile}`);

      // Save failures
      if (failed.length > 0) {
        const failHeaders = Object.keys(failed[0]).map((key) => ({
          id: key,
          title: key,
        }));

        const failWriter = createCsvWriter({
          path: failedFile,
          header: failHeaders,
        });

        await failWriter.writeRecords(failed);
        console.warn(`⚠️ Logged ${failed.length} failures to ${failedFile}`);
      }
    });
};

run();
