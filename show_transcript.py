#!/usr/bin/env python3
import json
import requests
import sys

url = 'http://localhost:3007/api/analyze'
payload = {
    "recording_url": "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJkejZxZjNxYm93cHE1MzgwZnE1N2hyamV2MHk3c3BzdyUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8",
    "meta": {
        "agent_id": "test",
        "campaign": "test",
        "duration_sec": 0,
        "disposition": "Unknown",
        "direction": "outbound"
    }
}

print("Fetching transcript from API...")
response = requests.post(url, json=payload)
data = response.json()

# Save full JSON
with open('full_api_response.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"Full response saved to full_api_response.json")

# Try to extract segments from debug
if 'debug' in data and 'segments' in data['debug']:
    segments = data['debug']['segments']
    print(f"\n=== FULL TRANSCRIPT ({len(segments)} segments) ===\n")

    for i, seg in enumerate(segments):
        time_ms = seg.get('startMs', 0)
        time_sec = int(time_ms / 1000) if time_ms else 0
        mins = time_sec // 60
        secs = time_sec % 60

        speaker = seg.get('speaker', '?')
        text = seg.get('text', '')

        print(f"{i+1}. [{mins:02d}:{secs:02d}] {speaker}: {text}")

    # Save transcript to text file
    with open('full_transcript.txt', 'w') as f:
        for i, seg in enumerate(segments):
            time_ms = seg.get('startMs', 0)
            time_sec = int(time_ms / 1000) if time_ms else 0
            mins = time_sec // 60
            secs = time_sec % 60

            speaker = seg.get('speaker', '?')
            text = seg.get('text', '')

            f.write(f"{i+1}. [{mins:02d}:{secs:02d}] {speaker}: {text}\n")

    print("\nTranscript saved to full_transcript.txt")
else:
    print("No segments found in debug. Available keys:", list(data.keys()))
    if 'debug' in data:
        print("Debug keys:", list(data['debug'].keys()))