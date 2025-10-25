fetch('https://lrclib.net/api/get?track_name=Shape+of+You&artist_name=Ed+Sheeran')
  .then(r => r.json()).then(console.log)
