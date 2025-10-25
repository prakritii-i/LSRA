import pandas as pd
import ast
from collections import Counter

# Load your dataset (adjust the path if needed)
df = pd.read_csv("C:/Users/LENOVO/Downloads/musicLyrics.csv")  # replace with your actual filename

# If 'seeds' is a string of a list, convert it to a list using `ast.literal_eval`
df['class'] = df['class'].apply(lambda x: ast.literal_eval(x) if isinstance(x, str) else x)

# Extract first emotion tag
df['primary_emotion'] = df['class'].apply(lambda x: x[0] if x else None)

# Count how many songs per primary emotion
emotion_counts = df['primary_emotion'].value_counts()

# Display top 20 most common emotions
# print("🎵 Top Emotions (Primary Only):")
# print(emotion_counts.head(20))

# Optional: Save to CSV for review
emotion_counts.to_csv("C:/Users/LENOVO/Downloads/primary_emotion_counts.csv")
