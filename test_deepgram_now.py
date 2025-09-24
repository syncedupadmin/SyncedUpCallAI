import requests
import json
import sys
from datetime import datetime

API_KEY = "ad6028587d6133caa78db69adb0e65b4adbcb3a9"

def test_convoso_call():
    """Test Convoso call with all Deepgram features"""

    audio_url = "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJsZnBvYWt2Y29nejR5bDdlYnV6ODl2eG9xZnlxN2J0aiUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"

    url = "https://api.deepgram.com/v1/listen"

    # Enable ALL features for maximum enrichment
    params = {
        "model": "nova-3",
        "utterances": "true",
        "diarize": "true",
        "sentiment": "true",
        "intents": "true",
        "detect_entities": "true",
        "smart_format": "true",
        "punctuate": "true",
        "paragraphs": "true",
        "topics": "true",
        "summarize": "v2",
        "detect_language": "true",
        "filler_words": "true",
        "measurements": "true",
        "profanity_filter": "false",
        "redact": "false",
        "numerals": "true"
    }

    headers = {
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }

    print("ANALYZING CONVOSO CALL RECORDING WITH NOVA-3...")
    print("=" * 60)
    print(f"Model: nova-3 (latest model)")
    print(f"Features: ALL ENABLED (sentiment, intents, entities, topics, summary)")
    print("=" * 60)

    response = requests.post(
        url,
        params=params,
        headers=headers,
        json={"url": audio_url}
    )

    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

    result = response.json()

    # Save full response
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f'deepgram_analysis_{timestamp}.json'
    with open(filename, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\nTRANSCRIPTION COMPLETE")
    print(f"Full response saved to '{filename}'")
    print("-" * 60)

    # Check what features returned data
    print("\nFEATURES DETECTED:")
    print("-" * 40)

    # Check each feature
    utterances = result.get("results", {}).get("utterances", [])
    print(f"[{'YES' if utterances else 'NO'}] Speaker Turns: {len(utterances)} utterances")

    sentiment = result.get("results", {}).get("sentiment", {})
    sentiment_segments = sentiment.get("segments", [])
    print(f"[{'YES' if sentiment_segments else 'NO'}] Sentiment Analysis: {len(sentiment_segments)} segments")

    intents = result.get("results", {}).get("intents", {})
    intent_segments = intents.get("segments", [])
    print(f"[{'YES' if intent_segments else 'NO'}] Intent Detection: {len(intent_segments)} segments")

    channels = result.get("results", {}).get("channels", [])
    if channels:
        entities = channels[0].get("alternatives", [{}])[0].get("entities", [])
        print(f"[{'YES' if entities else 'NO'}] Entity Extraction: {len(entities)} entities")

    topics = result.get("results", {}).get("topics", {})
    topic_segments = topics.get("segments", [])
    print(f"[{'YES' if topic_segments else 'NO'}] Topic Detection: {len(topic_segments)} topics")

    summary = result.get("results", {}).get("summary", {})
    print(f"[{'YES' if 'short' in summary else 'NO'}] Auto-Summary: {'Found' if 'short' in summary else 'Not found'}")

    # Print insights
    print("\n" + "=" * 60)
    print("AI INSIGHTS:")
    print("-" * 40)

    # Overall sentiment
    if sentiment:
        avg = sentiment.get("average", {})
        if avg:
            print(f"\nOVERALL SENTIMENT:")
            print(f"  Sentiment: {avg.get('sentiment', 'unknown')}")
            print(f"  Score: {avg.get('sentiment_score', 0):.2f}")

    # Sample sentiment changes
    if sentiment_segments:
        print(f"\nEMOTIONAL MOMENTS ({len(sentiment_segments)} total):")
        for seg in sentiment_segments[:3]:
            print(f"  [{seg.get('sentiment', 'unknown')}] \"{seg.get('text', '')[:80]}...\"")

    # Intents
    if intent_segments:
        print(f"\nINTENTS DETECTED:")
        all_intents = set()
        for segment in intent_segments:
            for intent in segment.get("intents", []):
                all_intents.add(intent.get("intent", "unknown"))
        for intent in list(all_intents)[:5]:
            print(f"  - {intent}")

    # Entities
    if channels and entities:
        print(f"\nENTITIES EXTRACTED:")
        entity_types = {}
        for entity in entities[:10]:
            label = entity.get("label", "unknown")
            value = entity.get("value", "")
            if label not in entity_types:
                entity_types[label] = []
            entity_types[label].append(value)

        for label, values in entity_types.items():
            print(f"  {label}: {', '.join(values[:3])}")

    # Topics
    if topic_segments:
        print(f"\nTOPICS DISCUSSED:")
        all_topics = set()
        for segment in topic_segments:
            for topic in segment.get("topics", []):
                all_topics.add(topic.get("topic", "unknown"))
        for topic in list(all_topics)[:5]:
            print(f"  - {topic}")

    # Summary
    if 'short' in summary:
        print(f"\nAUTO-GENERATED SUMMARY:")
        print(f"  {summary.get('short', '')}")

    # Sample transcript with metadata
    print("\n" + "=" * 60)
    print("ENRICHED TRANSCRIPT SAMPLE (first 3 turns):")
    print("-" * 40)

    if utterances:
        for i, utt in enumerate(utterances[:3]):
            speaker = utt.get("speaker", 0)
            start = utt.get("start", 0)
            end = utt.get("end", 0)
            confidence = utt.get("confidence", 0)
            text = utt.get("transcript", "")

            print(f"\n[{start:.1f}s - {end:.1f}s] Speaker {speaker} (confidence: {confidence:.1%})")
            print(f"Text: \"{text[:200]}...\"")

    return result

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("DEEPGRAM ADVANCED FEATURES TEST")
    print("=" * 60)

    result = test_convoso_call()

    if result:
        print("\n" + "=" * 60)
        print("ANALYSIS COMPLETE!")
        print("Check the JSON file for complete data")
        print("=" * 60)