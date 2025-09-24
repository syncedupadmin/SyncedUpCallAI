import requests
import json
import sys
import os
from datetime import datetime

# Get API key from environment or set directly
API_KEY = os.getenv("DEEPGRAM_API_KEY", "YOUR_DEEPGRAM_API_KEY")

def test_convoso_call():
    """Test Convoso call with all Deepgram features"""

    # Your Convoso call recording URL
    audio_url = "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJsZnBvYWt2Y29nejR5bDdlYnV6ODl2eG9xZnlxN2J0aiUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"

    url = "https://api.deepgram.com/v1/listen"

    # Enable ALL features for maximum enrichment
    params = {
        "model": "nova-2-phonecall",  # Phone call optimized model
        "utterances": "true",          # Speaker turns
        "diarize": "true",             # Speaker separation
        "sentiment": "true",           # Emotion detection
        "intents": "true",             # Intent recognition
        "detect_entities": "true",     # Extract entities (names, dates, prices)
        "smart_format": "true",        # Format numbers, dates
        "punctuate": "true",           # Add punctuation
        "paragraphs": "true",          # Group into paragraphs
        "topics": "true",              # Topic detection
        "summarize": "v2",             # Auto-summarization
        "detect_language": "true",     # Language detection
        "filler_words": "true",        # Keep um, uh, etc.
        "measurements": "true",        # Format measurements
        "profanity_filter": "false",   # Don't filter
        "redact": "false",             # Don't redact PII
        "numerals": "true"             # Convert numbers to digits
    }

    headers = {
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }

    print("🎧 ANALYZING CONVOSO CALL RECORDING...")
    print("=" * 60)
    print(f"URL: {audio_url[:50]}...")
    print(f"Model: nova-2-phonecall")
    print(f"Features: ALL ENABLED")
    print("=" * 60)

    # Make the API call
    response = requests.post(
        url,
        params=params,
        headers=headers,
        json={"url": audio_url}
    )

    if response.status_code != 200:
        print(f"❌ Error: {response.status_code}")
        print(response.text)
        return None

    result = response.json()

    # Save full response with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f'convoso_call_analysis_{timestamp}.json'
    with open(filename, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ TRANSCRIPTION COMPLETE")
    print(f"📁 Full response saved to '{filename}'")
    print("-" * 60)

    # Analyze what features returned data
    analyze_features(result)

    # Print enriched insights
    print_insights(result)

    # Print sample transcript with metadata
    print_enriched_transcript(result)

    return result

def analyze_features(result):
    """Check which AI features detected data"""

    print("\n📊 AI FEATURES ANALYSIS:")
    print("-" * 40)

    # Check for each feature
    features_found = {}

    # Basic transcription
    transcript = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
    features_found["Transcription"] = len(transcript) > 0

    # Utterances (speaker turns)
    utterances = result.get("results", {}).get("utterances", [])
    features_found["Speaker Turns"] = len(utterances)

    # Sentiment analysis
    sentiment = result.get("results", {}).get("sentiment", {})
    sentiment_segments = sentiment.get("segments", [])
    features_found["Sentiment Segments"] = len(sentiment_segments)

    # Intent detection
    intents = result.get("results", {}).get("intents", {})
    intent_segments = intents.get("segments", [])
    features_found["Intent Segments"] = len(intent_segments)

    # Entity detection
    channels = result.get("results", {}).get("channels", [])
    if channels:
        entities = channels[0].get("alternatives", [{}])[0].get("entities", [])
        features_found["Entities Detected"] = len(entities)

    # Topics
    topics = result.get("results", {}).get("topics", {})
    topic_segments = topics.get("segments", [])
    features_found["Topics"] = len(topic_segments)

    # Summary
    summary = result.get("results", {}).get("summary", {})
    features_found["Summary"] = "short" in summary

    # Print results
    for feature, value in features_found.items():
        if isinstance(value, bool):
            status = "✅" if value else "❌"
            print(f"{status} {feature}: {'Found' if value else 'Not found'}")
        else:
            status = "✅" if value > 0 else "❌"
            print(f"{status} {feature}: {value} found")

def print_insights(result):
    """Print AI-generated insights"""

    print("\n🧠 AI INSIGHTS:")
    print("-" * 40)

    # Overall sentiment
    sentiment = result.get("results", {}).get("sentiment", {})
    if sentiment:
        avg = sentiment.get("average", {})
        if avg:
            print(f"\n😊 OVERALL SENTIMENT:")
            print(f"   Sentiment: {avg.get('sentiment', 'unknown')}")
            print(f"   Score: {avg.get('sentiment_score', 0):.2f}")

    # Sentiment changes
    sentiment_segments = sentiment.get("segments", [])
    if sentiment_segments:
        print(f"\n📈 EMOTIONAL JOURNEY ({len(sentiment_segments)} segments):")
        # Find most positive and negative moments
        most_positive = max(sentiment_segments, key=lambda x: x.get("sentiment_score", 0), default=None)
        most_negative = min(sentiment_segments, key=lambda x: x.get("sentiment_score", 0), default=None)

        if most_positive:
            print(f"   😊 Most Positive ({most_positive.get('sentiment_score', 0):.2f}):")
            print(f"      \"{most_positive.get('text', '')[:100]}...\"")

        if most_negative:
            print(f"   😟 Most Negative ({most_negative.get('sentiment_score', 0):.2f}):")
            print(f"      \"{most_negative.get('text', '')[:100]}...\"")

    # Intents detected
    intents = result.get("results", {}).get("intents", {})
    intent_segments = intents.get("segments", [])
    if intent_segments:
        print(f"\n🎯 INTENTS DETECTED ({len(intent_segments)} segments):")
        all_intents = {}
        for segment in intent_segments:
            for intent in segment.get("intents", []):
                intent_name = intent.get("intent", "unknown")
                confidence = intent.get("confidence_score", 0)
                if intent_name not in all_intents or confidence > all_intents[intent_name]:
                    all_intents[intent_name] = confidence

        for intent_name, confidence in sorted(all_intents.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"   - {intent_name}: {confidence:.1%} confidence")

    # Entities extracted
    channels = result.get("results", {}).get("channels", [])
    if channels:
        entities = channels[0].get("alternatives", [{}])[0].get("entities", [])
        if entities:
            print(f"\n🏷️ ENTITIES EXTRACTED ({len(entities)} total):")
            entity_types = {}
            for entity in entities:
                label = entity.get("label", "unknown")
                value = entity.get("value", "")
                if label not in entity_types:
                    entity_types[label] = []
                entity_types[label].append(value)

            for label, values in list(entity_types.items())[:5]:
                print(f"   {label}: {', '.join(values[:3])}")

    # Topics discussed
    topics = result.get("results", {}).get("topics", {})
    topic_segments = topics.get("segments", [])
    if topic_segments:
        print(f"\n📚 TOPICS DISCUSSED:")
        all_topics = {}
        for segment in topic_segments:
            for topic in segment.get("topics", []):
                topic_name = topic.get("topic", "unknown")
                confidence = topic.get("confidence_score", 0)
                if topic_name not in all_topics or confidence > all_topics[topic_name]:
                    all_topics[topic_name] = confidence

        for topic_name, confidence in sorted(all_topics.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"   - {topic_name}: {confidence:.1%} relevance")

    # Summary if available
    summary = result.get("results", {}).get("summary", {})
    if summary:
        short_summary = summary.get("short", "")
        if short_summary:
            print(f"\n📝 AUTO-GENERATED SUMMARY:")
            print(f"   {short_summary}")

def print_enriched_transcript(result):
    """Print sample of enriched transcript with metadata"""

    print("\n📜 ENRICHED TRANSCRIPT SAMPLE:")
    print("-" * 40)

    utterances = result.get("results", {}).get("utterances", [])

    if utterances:
        print(f"Total utterances: {len(utterances)}")
        print("\nFirst 5 speaker turns with metadata:\n")

        for i, utt in enumerate(utterances[:5]):
            speaker = utt.get("speaker", 0)
            start = utt.get("start", 0)
            end = utt.get("end", 0)
            confidence = utt.get("confidence", 0)
            text = utt.get("transcript", "")

            # Try to get sentiment for this utterance
            sentiment_marker = ""
            sentiment_data = result.get("results", {}).get("sentiment", {}).get("segments", [])
            for seg in sentiment_data:
                if seg.get("start_word", 0) <= i <= seg.get("end_word", 0):
                    sentiment_marker = f"[{seg.get('sentiment', 'neutral').upper()}]"
                    break

            print(f"[{start:.1f}s - {end:.1f}s] Speaker {speaker} (conf: {confidence:.1%}) {sentiment_marker}")
            print(f"   \"{text[:150]}{'...' if len(text) > 150 else ''}\"")
            print()

    # Show word-level confidence if available
    channels = result.get("results", {}).get("channels", [])
    if channels:
        words = channels[0].get("alternatives", [{}])[0].get("words", [])
        if words:
            print("\n🔍 WORD-LEVEL CONFIDENCE (first 20 words):")
            for word in words[:20]:
                w = word.get("word", "")
                conf = word.get("confidence", 0)
                speaker = word.get("speaker", "?")

                # Color code by confidence
                if conf > 0.9:
                    indicator = "🟢"
                elif conf > 0.7:
                    indicator = "🟡"
                else:
                    indicator = "🔴"

                print(f"{indicator} {w} (S{speaker}: {conf:.1%})", end="  ")
                if words.index(word) % 5 == 4:
                    print()  # New line every 5 words

if __name__ == "__main__":
    print("🚀 DEEPGRAM ADVANCED FEATURE TEST")
    print("=" * 60)

    if API_KEY == "YOUR_DEEPGRAM_API_KEY":
        print("⚠️  Please set your Deepgram API key!")
        print("   Edit this file and replace YOUR_DEEPGRAM_API_KEY")
        print("   Or set environment variable: DEEPGRAM_API_KEY")
        sys.exit(1)

    # Test the Convoso call
    result = test_convoso_call()

    if result:
        print("\n" + "=" * 60)
        print("✨ ANALYSIS COMPLETE!")
        print("📊 Check the JSON file for complete data structure")
        print("🔍 Look for sentiment changes, intents, and entities")
        print("=" * 60)