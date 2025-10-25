import pandas as pd
from collections import Counter

# Load the dataset
df = pd.read_csv("C:/Users/LENOVO/Desktop/LSRA/fetching_practice/musicLyrics.csv", encoding='latin1')

# Clean columns
df.columns = df.columns.str.strip().str.lower()

# Check 'class' column existence
if 'class' not in df.columns:
    raise ValueError("The 'class' column is missing from the dataset.")

# Function to split emotions by comma and strip whitespace
def split_emotions(x):
    if pd.isna(x):
        return []
    # split by comma, strip spaces
    return [emotion.strip() for emotion in x.split(',')]

# Apply function
df['class'] = df['class'].apply(split_emotions)

# Flatten the list of all emotions across rows
all_emotions = [emotion for sublist in df['class'] for emotion in sublist if emotion]

# Count emotions
emotion_counts = Counter(all_emotions)

# Convert to DataFrame and sort
emotion_df = pd.DataFrame(emotion_counts.items(), columns=['emotion', 'count']).sort_values(by='count', ascending=False)

# Save to CSV
emotion_df.to_csv("C:/Users/LENOVO/Desktop/LSRA/fetching_practice/emotion_counts.csv", index=False)

print("🎵 Top 10 Emotions:")
print(emotion_df.head(10))
