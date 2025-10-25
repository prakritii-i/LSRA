const { Client } = require("lrclib-api");

const client = new Client();

(async () => {
  const query = {
    track_name: "The Chain",
    artist_name: "Fleetwood Mac",
  };

  try {
    const metadata = await client.findLyrics(query);
    console.log("Metadata:", metadata);

    const unsynced = await client.getUnsynced(query);
    console.log("Unsynced Lyrics:", unsynced);

    const synced = await client.getSynced(query);
    console.log("Synced Lyrics:", synced);
  } catch (error) {
    console.error("Error fetching lyrics:", error);
  }
})();