from dotenv import load_dotenv
import os
from lyricsgenius import Genius

load_dotenv()  # loads .env file

# Copy token to the variable expected by lyricsgenius
os.environ["GENIUS_ACCESS_TOKEN"] = os.getenv("GENIUS_API_TOKEN")

genius = Genius(skip_non_songs=True, remove_section_headers=True)

import lyricsgenius
from dotenv import load_dotenv
import os 
# replace with your token
genius_token =os.getenv("GENIUS_API_TOKEN")
# genius = lyricsgenius.Genius(genius_token, skip_non_songs=True, excluded_terms=["(Remix)", "(Live)"], remove_section_headers=True)

import pandas as pd

failed_df = pd.read_csv("failed_anger_fear_subset.csv")

import pandas as pd
import time
import json
import os
from lyricsgenius import Genius



# ================= CONFIGURATION =================
INPUT_CSV = "failed_anger_fear_subset.csv"
OUTPUT_CSV = "fear_and_anger_lyrics.csv"
FAILED_CSV = "failed_skipped_lyrics2.csv"
SKIPPED_CSV = "skipped_lyrics.csv"
PROGRESS_FILE = "progress.json"
DELAY_SEC = 0.3
RETRY_LIMIT = 3
GENIUS_TOKEN = os.getenv("GENIUS_API_TOKEN")
# ================= INITIALIZATION =================
genius = Genius(GENIUS_TOKEN, skip_non_songs=True, remove_section_headers=True)

# Load resume progress
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
        progress = json.load(f)
else:
    progress = {}

# Load songs
all_songs = pd.read_csv(INPUT_CSV)
print(f"📊 Total songs loaded: {len(all_songs)}")

# ================= HELPERS =========================
def fetch_with_retry(track, artist, retries=RETRY_LIMIT):
    for attempt in range(1, retries + 1):
        try:
            song = genius.search_song(track, artist)
            return song.lyrics if song else None
        except Exception as e:
            print(f"⚠️ Attempt {attempt} failed for '{track}' - {artist}: {e}")
            if attempt == retries:
                return None
            time.sleep(0.8)

def append_row_to_csv(file, row):
    df = pd.DataFrame([row])
    if os.path.exists(file):
        df.to_csv(file, mode='a', index=False, header=False)
    else:
        df.to_csv(file, index=False)

# ================= MAIN FETCHER ===================
for idx, row in all_songs.iterrows():
    track = str(row['track']).strip()
    artist = str(row['artist']).strip()
    key = f"{track}|{artist}"

    # --- Skip already processed songs ---
    if key in progress:
        print(f"⏩ Skipped: {track} - {artist}")
        append_row_to_csv(SKIPPED_CSV, {**row, "reason": "Already processed"})
        continue

    # --- Fetch lyrics ---
    lyrics = fetch_with_retry(track, artist)
    if lyrics:
        append_row_to_csv(OUTPUT_CSV, {**row, "lyrics": lyrics})
        print(f"✅ Fetched: {track} - {artist}")
    else:
        append_row_to_csv(FAILED_CSV, {**row, "reason": "LYRICS_NOT_FOUND"})
        print(f"❌ Failed: {track} - {artist}")

    # --- Update progress ---
    progress[key] = True
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)

    # --- Respect rate limits ---
    time.sleep(DELAY_SEC)

print("\n🎵 Lyrics fetching completed for all songs!")
