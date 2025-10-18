// generate_skipped_from_outputs.js
const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const ORIGINAL_CSV = "muse_final_emotion_dataset.csv";
const FETCHED_CSV = "muse_with_lyrics.csv";
const FAILED_CSV = "failed_lyrics.csv"; // optional but recommended
const OUTPUT_SKIPPED_CSV = "skipped_clean2.csv";
const NEW_PROGRESS_PAIRS = "progress_pairs.json"; // optional output (pair-keyed progress)

// helper to load CSV rows
const loadCsv = (file) =>
  new Promise((resolve, reject) => {
    const rows = [];
    if (!fs.existsSync(file)) return resolve(rows);
    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve(rows))
      .on("error", (e) => reject(e));
  });

// safe normalize function for keys
const norm = (s) => (s || "").toString().trim().toLowerCase();

// make pair key
const pairKey = (track, artist) => `${norm(track)}|${norm(artist)}`;

(async () => {
  try {
    console.log("🔄 Loading original dataset...");
    const original = await loadCsv(ORIGINAL_CSV);
    console.log(`📊 Original rows: ${original.length}`);

    console.log("🔄 Loading fetched (success) dataset...");
    const fetched = await loadCsv(FETCHED_CSV);
    console.log(`✅ Fetched rows: ${fetched.length}`);

    console.log("🔄 Loading failed dataset (if exists)...");
    const failed = await loadCsv(FAILED_CSV);
    console.log(`❌ Failed rows: ${failed.length}`);

    // Build processed set from fetched + failed (pair keys)
    const processedSet = new Set();

    fetched.forEach((r) => {
      processedSet.add(pairKey(r.track, r.artist));
    });

    failed.forEach((r) => {
      // if failed CSV uses different column names, try both common patterns
      processedSet.add(
        pairKey(r.track || r.track_name || r.title, r.artist || r.artist_name)
      );
    });

    console.log(`🔎 Unique processed (pair) count: ${processedSet.size}`);

    // Optionally include progress.json if it contains pair-keys:
    if (fs.existsSync("progress_smh.json")) {
      try {
        const progress = JSON.parse(
          fs.readFileSync("progress_smh.json", "utf8")
        );
        // check if progress keys look like pair keys (contain '|')
        const keys = Object.keys(progress || {});
        const sample = keys.slice(0, 10).join(", ");
        const hasPairLike = keys.some((k) => k && k.includes("|"));
        console.log(
          `ℹ️ progress_smh.json presence: ${keys.length} keys; sample: ${sample}`
        );
        if (hasPairLike) {
          console.log(
            "ℹ️ progress_smh.json contains pair-style keys — adding to processed set."
          );
          keys.forEach((k) => processedSet.add(k.trim().toLowerCase()));
        } else {
          console.log(
            "⚠️ progress_smh.json appears to be track-only keys; ignoring it for pair-based skip generation."
          );
        }
      } catch (e) {
        console.warn("⚠️ Could not parse progress_smh.json — skipping it.");
      }
    }

    // Build set of unique (track|artist) in original for informative stats
    const originalPairsSet = new Set();
    original.forEach((r) => originalPairsSet.add(pairKey(r.track, r.artist)));
    console.log(
      `ℹ️ Unique (track|artist) pairs in original: ${originalPairsSet.size}`
    );

    // Find skipped rows: those whose pair isn't in processedSet
    const skipped = original.filter((r) => {
      const key = pairKey(r.track, r.artist);
      return !processedSet.has(key);
    });

    console.log(`🚀 Found ${skipped.length} truly skipped rows (pair-based)`);

    if (skipped.length > 0) {
      // write CSV
      const headers = Object.keys(skipped[0]).map((k) => ({ id: k, title: k }));
      const writer = createCsvWriter({
        path: OUTPUT_SKIPPED_CSV,
        header: headers,
      });
      await writer.writeRecords(skipped);
      console.log(`📝 Skipped list saved to: ${OUTPUT_SKIPPED_CSV}`);
    } else {
      console.log("✅ No skipped rows found (pair-based).");
    }

    // Optionally write a new progress file keyed by pair so future runs are pair-aware
    const newProgressObj = {};
    processedSet.forEach((k) => {
      newProgressObj[k] = true;
    });
    fs.writeFileSync(
      NEW_PROGRESS_PAIRS,
      JSON.stringify(newProgressObj, null, 2)
    );
    console.log(`💾 Wrote pair-keyed progress file: ${NEW_PROGRESS_PAIRS}`);

    // Print quick summary
    console.log("\n--- Summary ---");
    console.log(`Original rows: ${original.length}`);
    console.log(`Unique original pairs: ${originalPairsSet.size}`);
    console.log(
      `Processed unique pairs (from fetched+failed+progress): ${processedSet.size}`
    );
    console.log(
      `Skipped rows (written to ${OUTPUT_SKIPPED_CSV}): ${skipped.length}`
    );
    console.log("----------------\n");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
