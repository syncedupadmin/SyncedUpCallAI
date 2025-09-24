import requests
import json
from datetime import datetime

API_KEY = "ad6028587d6133caa78db69adb0e65b4adbcb3a9"

audio_url = "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJsZnBvYWt2Y29nejR5bDdlYnV6ODl2eG9xZnlxN2J0aiUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"

url = "https://api.deepgram.com/v1/listen"

# OPTIMIZED PARAMETERS
params = {
    "model": "nova-3",
    "utterances": "true",
    "utt_split": "0.9",
    "diarize": "true",
    "smart_format": "true",
    "numerals": "true",
    "punctuate": "true",
    "sentiment": "true",
    "intents": "true",
    "detect_entities": "true",
    # Search for critical phrases
    "search": ["do not call", "post date", "talk to my wife", "declined"],
    # Boost insurance terms
    "keyterm": ["Medicare", "deductible", "PPO", "premium"]
}

headers = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}

print("Testing Nova-3 with optimizations...")
response = requests.post(url, params=params, headers=headers, json={"url": audio_url})

if response.status_code == 200:
    result = response.json()

    # Save full response
    with open('nova3_test.json', 'w') as f:
        json.dump(result, f, indent=2)

    print("\nSUCCESS! Results:")
    print("-" * 40)

    # Check for search hits
    search_results = result.get("results", {}).get("search", [])
    if search_results:
        print("\nCRITICAL PHRASE DETECTION:")
        for item in search_results:
            query = item.get("query", "")
            hits = item.get("hits", [])
            if hits:
                print(f"  '{query}': {len(hits)} occurrences found")
                for hit in hits[:2]:
                    print(f"    - [{hit.get('start', 0):.1f}s]: \"{hit.get('snippet', '')}\"")

    # Check utterances
    utterances = result.get("results", {}).get("utterances", [])
    print(f"\nSpeaker turns: {len(utterances)}")

    # Check intents
    intents = result.get("results", {}).get("intents", {}).get("segments", [])
    print(f"Intent segments: {len(intents)}")

    # Check entities
    entities = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("entities", [])
    print(f"Entities extracted: {len(entities)}")

    print("\nFull results saved to nova3_test.json")
else:
    print(f"Error {response.status_code}: {response.text}")