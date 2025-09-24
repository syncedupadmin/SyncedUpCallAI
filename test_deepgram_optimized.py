import requests
import json
import sys
from datetime import datetime

API_KEY = "ad6028587d6133caa78db69adb0e65b4adbcb3a9"

def test_optimized_nova3():
    """Test with optimized Nova-3 parameters for insurance calls"""

    audio_url = "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJsZnBvYWt2Y29nejR5bDdlYnV6ODl2eG9xZnlxN2J0aiUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"

    url = "https://api.deepgram.com/v1/listen"

    # OPTIMIZED PARAMETERS FOR INSURANCE CALLS
    params = {
        "model": "nova-3",

        # Structure
        "utterances": "true",
        "utt_split": "0.9",  # Higher confidence for speaker changes
        "diarize": "true",

        # Formatting
        "smart_format": "true",
        "numerals": "true",
        "punctuate": "true",

        # Intelligence
        "sentiment": "true",
        "intents": "true",

        # Custom intents for insurance calls
        "custom_intent": ["do not call", "buy now", "talk to my wife", "charge on", "need to think", "call back later", "not interested", "ready to enroll"],
        "custom_intent_mode": "extended",

        # Entities + redaction
        "detect_entities": "true",
        "redact": "pci",  # Can only redact one type at a time or use array format

        # Acoustic search anchors - CRITICAL BUSINESS PHRASES
        "search": ["do not call", "call me back", "talk to my wife", "charge on", "post date", "declined", "insufficient funds", "cancel", "refund", "not interested"],

        # Domain boosting for insurance (nova-3 uses keyterm)
        "keyterm": ["Medicare Part B", "deductible", "copay", "PPO", "HMO", "Medigap", "premium", "enrollment fee", "effective date", "pre-existing"]
    }

    headers = {
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }

    print("TESTING OPTIMIZED NOVA-3 CONFIGURATION")
    print("=" * 60)
    print("Model: nova-3 with insurance-specific optimization")
    print("Custom Intents: DNC, callbacks, objections")
    print("Search Anchors: Critical business phrases")
    print("Keyterm Boosting: Insurance terminology")
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
    filename = f'nova3_optimized_{timestamp}.json'
    with open(filename, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\nTRANSCRIPTION COMPLETE")
    print(f"Full response saved to '{filename}'")
    print("-" * 60)

    # Analyze features
    analyze_optimized_features(result)

    # Process search hits
    analyze_search_hits(result)

    # Process interruptions and pauses
    analyze_conversation_dynamics(result)

    # Show enriched transcript with inline entities
    show_enriched_transcript(result)

    return result

def analyze_optimized_features(result):
    """Check what optimized features detected"""

    print("\nOPTIMIZED FEATURES ANALYSIS:")
    print("-" * 40)

    # Check utterances
    utterances = result.get("results", {}).get("utterances", [])
    print(f"✓ Speaker Turns: {len(utterances)} utterances")

    # Check custom intents
    intents = result.get("results", {}).get("intents", {})
    intent_segments = intents.get("segments", [])
    if intent_segments:
        print(f"✓ Custom Intents Detected: {len(intent_segments)} segments")
        # Count each intent type
        intent_counts = {}
        for seg in intent_segments:
            for intent in seg.get("intents", []):
                intent_name = intent.get("intent", "unknown")
                intent_counts[intent_name] = intent_counts.get(intent_name, 0) + 1

        print("  Intent breakdown:")
        for intent, count in sorted(intent_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"    - {intent}: {count} occurrences")

    # Check search hits
    search_info = result.get("results", {}).get("search", [])
    if search_info:
        print(f"\n✓ SEARCH HITS (Critical Phrases):")
        for search_result in search_info:
            query = search_result.get("query", "")
            hits = search_result.get("hits", [])
            if hits:
                print(f"  '{query}': {len(hits)} hits")
                for hit in hits[:2]:  # Show first 2 hits
                    start = hit.get("start", 0)
                    end = hit.get("end", 0)
                    snippet = hit.get("snippet", "")
                    print(f"    [{start:.1f}s-{end:.1f}s]: \"{snippet}\"")

    # Check entities with redaction
    channels = result.get("results", {}).get("channels", [])
    if channels:
        entities = channels[0].get("alternatives", [{}])[0].get("entities", [])

        # Count redacted items
        words = channels[0].get("alternatives", [{}])[0].get("words", [])
        redacted_count = sum(1 for w in words if "[redacted]" in w.get("word", "").lower())

        print(f"\n✓ Entities Extracted: {len(entities)} total")
        print(f"✓ Redacted Items: {redacted_count} PII elements")

        # Show entity types
        entity_types = {}
        for entity in entities:
            label = entity.get("label", "unknown")
            entity_types[label] = entity_types.get(label, 0) + 1

        print("  Entity types found:")
        for label, count in sorted(entity_types.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"    - {label}: {count}")

def analyze_search_hits(result):
    """Map search hits to business events"""

    print("\n🎯 BUSINESS-CRITICAL EVENTS DETECTED:")
    print("-" * 40)

    search_results = result.get("results", {}).get("search", [])
    utterances = result.get("results", {}).get("utterances", [])

    business_events = []

    for search_item in search_results:
        query = search_item.get("query", "")
        hits = search_item.get("hits", [])

        for hit in hits:
            start_time = hit.get("start", 0)
            snippet = hit.get("snippet", "")

            # Find nearest utterance
            nearest_utt = None
            for utt in utterances:
                if abs(utt.get("start", 0) - start_time) < 2:  # Within 2 seconds
                    nearest_utt = utt
                    break

            speaker = nearest_utt.get("speaker", "unknown") if nearest_utt else "unknown"

            # Categorize the event
            if query in ["do not call", "cancel", "not interested"]:
                event_type = "DNC_REQUEST"
                priority = "HIGH"
            elif query in ["call me back", "call back later"]:
                event_type = "CALLBACK_REQUEST"
                priority = "HIGH"
            elif query in ["talk to my wife", "talk to my husband"]:
                event_type = "SPOUSE_APPROVAL_NEEDED"
                priority = "MEDIUM"
            elif query in ["post date", "charge on"]:
                event_type = "SCHEDULED_PAYMENT"
                priority = "HIGH"
            elif query in ["declined", "insufficient funds"]:
                event_type = "PAYMENT_ISSUE"
                priority = "CRITICAL"
            else:
                event_type = "OTHER"
                priority = "LOW"

            if priority in ["HIGH", "CRITICAL"]:
                print(f"[{priority}] {event_type} at {start_time:.1f}s (Speaker {speaker})")
                print(f"  \"{snippet}\"")

def analyze_conversation_dynamics(result):
    """Compute gaps and overlaps for conversation flow"""

    print("\n💬 CONVERSATION DYNAMICS:")
    print("-" * 40)

    channels = result.get("results", {}).get("channels", [])
    if not channels:
        return

    words = channels[0].get("alternatives", [{}])[0].get("words", [])

    long_pauses = []
    interruptions = []

    for i in range(1, len(words)):
        prev_word = words[i-1]
        curr_word = words[i]

        gap = curr_word.get("start", 0) - prev_word.get("end", 0)

        # Long pause detection
        if gap > 3.0:  # 3+ second pause
            long_pauses.append({
                "time": prev_word.get("end", 0),
                "duration": gap,
                "after": prev_word.get("word", "")
            })

        # Interruption detection (overlap or speaker change with minimal gap)
        if (prev_word.get("speaker") != curr_word.get("speaker") and
            gap < 0.2 and gap > -1.0):  # Overlap or quick switch
            interruptions.append({
                "time": curr_word.get("start", 0),
                "interrupter": f"Speaker {curr_word.get('speaker')}",
                "interrupted": f"Speaker {prev_word.get('speaker')}"
            })

    print(f"Long Pauses (3+ seconds): {len(long_pauses)}")
    for pause in long_pauses[:3]:
        print(f"  [{pause['time']:.1f}s] {pause['duration']:.1f}s pause after \"{pause['after']}\"")

    print(f"\nInterruptions: {len(interruptions)}")
    for intr in interruptions[:3]:
        print(f"  [{intr['time']:.1f}s] {intr['interrupter']} interrupted {intr['interrupted']}")

def show_enriched_transcript(result):
    """Show transcript with inline entities and annotations"""

    print("\n📝 ENRICHED TRANSCRIPT SAMPLE (with inline annotations):")
    print("-" * 60)

    utterances = result.get("results", {}).get("utterances", [])[:5]  # First 5 utterances
    channels = result.get("results", {}).get("channels", [])

    if not channels:
        return

    entities = channels[0].get("alternatives", [{}])[0].get("entities", [])

    for utt in utterances:
        speaker = utt.get("speaker", 0)
        start = utt.get("start", 0)
        end = utt.get("end", 0)
        text = utt.get("transcript", "")
        confidence = utt.get("confidence", 0)

        # Find entities in this utterance
        utt_entities = []
        for entity in entities:
            # Check if entity falls within this utterance (approximate)
            entity_start = entity.get("start_time", 0)
            if start <= entity_start <= end:
                utt_entities.append(f"{entity.get('label', '')}: {entity.get('value', '')}")

        # Check for search hits in this utterance
        search_markers = []
        search_results = result.get("results", {}).get("search", [])
        for search_item in search_results:
            for hit in search_item.get("hits", []):
                if start <= hit.get("start", 0) <= end:
                    search_markers.append(f"[CRITICAL: {search_item.get('query', '')}]")

        # Print enriched utterance
        print(f"\n[{start:.1f}s-{end:.1f}s] Speaker {speaker} (conf: {confidence:.1%})")

        if search_markers:
            print(f"  ⚠️ {' '.join(search_markers)}")

        if utt_entities:
            print(f"  📌 Entities: {', '.join(utt_entities)}")

        print(f"  Text: \"{text[:150]}{'...' if len(text) > 150 else ''}\"")

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("DEEPGRAM NOVA-3 OPTIMIZED FOR INSURANCE CALLS")
    print("=" * 60)

    result = test_optimized_nova3()

    if result:
        print("\n" + "=" * 60)
        print("ANALYSIS COMPLETE!")
        print("This shows how to extract maximum value from Deepgram")
        print("for your OpenAI analysis pipeline")
        print("=" * 60)