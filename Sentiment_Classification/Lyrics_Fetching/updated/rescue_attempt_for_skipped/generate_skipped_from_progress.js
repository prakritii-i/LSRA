const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const ORIGINAL_CSV = "muse_final_emotion_dataset.csv";
const PROGRESS_FILE = "progress_smh.json";
const OUTPUT_SKIPPED_CSV = "skipped_clean.csv";

// Helper: Load CSV into array
const loadCsv = (file) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
};

const main = async () => {
  console.log("🔄 Loading original dataset...");
  const original = await loadCsv(ORIGINAL_CSV);
  console.log(`📊 Original dataset: ${original.length} songs`);

  console.log("🔄 Loading progress file...");
  if (!fs.existsSync(PROGRESS_FILE)) {
    console.error(`❌ Progress file ${PROGRESS_FILE} not found.`);
    process.exit(1);
  }
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  const progressKeys = new Set(
    Object.keys(progress).map((k) => k.trim().toLowerCase())
  );
  console.log(`📥 Songs processed (success+fail): ${progressKeys.size}`);

  // Find skipped songs (those not in progress)
  const skipped = original.filter((row) => {
    const trackKey = row.track?.trim().toLowerCase();
    return trackKey && !progressKeys.has(trackKey);
  });

  console.log(`🚀 Found ${skipped.length} truly skipped songs`);

  if (skipped.length > 0) {
    const headers = Object.keys(skipped[0]).map((key) => ({
      id: key,
      title: key,
    }));

    const writer = createCsvWriter({
      path: OUTPUT_SKIPPED_CSV,
      header: headers,
    });

    await writer.writeRecords(skipped);
    console.log(`📝 Skipped songs list saved to: ${OUTPUT_SKIPPED_CSV}`);
  } else {
    console.log(
      "✅ No skipped songs found — progress file covers all entries."
    );
  }
};

main().catch((err) => console.error("❌ Error:", err));
