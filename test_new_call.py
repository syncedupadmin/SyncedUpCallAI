import requests
import json
import sys

# Your API key
API_KEY = "ad6028587d6133caa78db69adb0e65b4adbcb3a9"

def test_url(audio_url):
    """Test with URL"""

    url = "https://api.deepgram.com/v1/listen"

    params = {
        "model": "nova-3",
        "utterances": "true",
        "diarize": "true",
        "sentiment": "true",
        "intents": "true",
        "detect_entities": "true",
        "smart_format": "true",
        "punctuate": "true"
    }

    headers = {
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        url,
        params=params,
        headers=headers,
        json={"url": audio_url}
    )

    result = response.json()

    with open('new_call_response.json', 'w') as f:
        json.dump(result, f, indent=2)

    print("\nURL TRANSCRIPTION COMPLETE")
    check_features(result)
    print_sample_output(result)

    return result

def check_features(result):
    """Check which features returned data"""

    print("\nFEATURES DETECTED:")
    print("-" * 30)

    features = {
        "Utterances": "utterances" in result.get("results", {}),
        "Speaker Diarization": any("speaker" in w for w in result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("words", [])),
        "Sentiment": "sentiment" in result.get("results", {}),
        "Intents": "intents" in result.get("results", {}),
        "Entities": "entities" in result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0],
        "Topics": "topics" in result.get("results", {}),
        "Word Confidence": any("confidence" in w for w in result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("words", []))
    }

    for feature, found in features.items():
        status = "[YES]" if found else "[NO]"
        print(f"{status} {feature}: {'Found' if found else 'Not found'}")

    return features

def print_sample_output(result):
    """Print sample of enriched output"""

    print("\nSAMPLE ENRICHED OUTPUT:")
    print("-" * 30)

    # Sample utterance with all metadata
    utterances = result.get("results", {}).get("utterances", [])
    if utterances and len(utterances) > 0:
        print(f"\nTotal utterances: {len(utterances)}")
        sample = utterances[0]
        print(f"\nFirst utterance - Speaker {sample.get('speaker', 'Unknown')}:")
        print(f"   Text: {sample.get('transcript', '')[:150]}...")
        print(f"   Time: {sample.get('start', 0):.2f}s - {sample.get('end', 0):.2f}s")
        print(f"   Confidence: {sample.get('confidence', 0):.2%}")

    # Sample entities
    entities = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("entities", [])
    if entities:
        print(f"\nEntities Found: {len(entities)} total")

        # Group entities by type
        entity_types = {}
        for entity in entities:
            label = entity.get('label', 'unknown')
            value = entity.get('value', '')
            if label not in entity_types:
                entity_types[label] = []
            entity_types[label].append(value)

        print("Entity types breakdown:")
        for label, values in list(entity_types.items())[:5]:
            print(f"   {label}: {', '.join(values[:3])}")

    # Sample sentiment
    sentiment = result.get("results", {}).get("sentiment", {})
    if sentiment:
        avg = sentiment.get("average", {})
        if avg:
            print(f"\nOverall Sentiment: {avg.get('sentiment', 'unknown')} (score: {avg.get('sentiment_score', 0):.2f})")

        segments = sentiment.get("segments", [])
        if segments:
            print(f"   Sentiment segments: {len(segments)}")

    # Sample intents
    intents = result.get("results", {}).get("intents", {})
    if intents:
        segments = intents.get("segments", [])
        if segments:
            print(f"\nIntents Found: {len(segments)} segments")

            # Count intent types
            intent_counts = {}
            for seg in segments:
                for intent in seg.get("intents", []):
                    intent_name = intent.get('intent', 'unknown')
                    intent_counts[intent_name] = intent_counts.get(intent_name, 0) + 1

            print("Most common intents:")
            for intent, count in sorted(intent_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"   - {intent}: {count} occurrences")

    # Topics if available
    topics = result.get("results", {}).get("topics", {})
    if topics:
        segments = topics.get("segments", [])
        if segments:
            print(f"\nTopics Found: {len(segments)} segments")

            # Get unique topics
            topic_set = set()
            for seg in segments:
                for topic in seg.get("topics", []):
                    topic_set.add(topic.get('topic', 'unknown'))

            print("Topics discussed:")
            for topic in list(topic_set)[:5]:
                print(f"   - {topic}")

    # Summary if available
    summary = result.get("results", {}).get("summary", {})
    if summary:
        short = summary.get("short", "")
        if short:
            print(f"\nAuto-Generated Summary:")
            print(f"   {short}")

if __name__ == "__main__":
    print("=" * 50)
    print("DEEPGRAM NOVA-3 FEATURE TEST")
    print("=" * 50)

    # New Convoso call URL
    audio_url = "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjI5czNnYnZ4ajYzbmo0aHVpejliM3Z4NjR2YjZvczU3cyUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"

    print(f"\nTesting with new Convoso call recording...")
    print(f"URL: {audio_url[:50]}...")

    test_url(audio_url)

    print("\nFull response saved to 'new_call_response.json'")
    print("Open the JSON file to explore the complete structure")