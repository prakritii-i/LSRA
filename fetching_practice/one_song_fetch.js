const fs = require("fs");
const { Client } = require("lrclib-api");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const client = new Client();

// Hardcoded song
const query = {
  track_name: "The Chain",
  artist_name: "Fleetwood Mac",
};

const outputFile = "one_song_lyrics.csv";

const csvWriter = createCsvWriter({
  path: outputFile,
  header: [
    { id: "track_name", title: "Track Name" },
    { id: "artist_name", title: "Artist Name" },
    { id: "album_name", title: "Album" },
    { id: "duration", title: "Duration (sec)" },
    { id: "lyrics", title: "Lyrics" },
    { id: "instrumental", title: "Instrumental" },
  ],
});

(async () => {
  try {
    const metadata = await client.findLyrics(query);

    const result = {
      track_name: metadata.trackName,
      artist_name: metadata.artistName,
      album_name: metadata.albumName,
      duration: metadata.duration,
      lyrics: metadata.plainLyrics || "Not found",
      instrumental: metadata.instrumental,
    };

    console.log("Lyrics fetched:\n", result);

    await csvWriter.writeRecords([result]);
    console.log(`Saved to ${outputFile}`);
  } catch (error) {
    console.error("Error fetching lyrics:", error.message);
  }
})();
// fetches lyrics using lrclib API