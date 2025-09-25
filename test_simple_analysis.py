#!/usr/bin/env python3
import json
import requests

url = 'http://localhost:3007/api/analyze-simple'
payload = {
    "recording_url": "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJkejZxZjNxYm93cHE1MzgwZnE1N2hyamV2MHk3c3BzdyUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8"
}

print("Calling Simple Analysis API...")
response = requests.post(url, json=payload)
data = response.json()

# Save full response
with open('simple_analysis_full_output.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"[OK] Full response saved to simple_analysis_full_output.json")
print(f"\n=== ANALYSIS SUMMARY ===")
if 'analysis' in data:
    analysis = data['analysis']
    print(f"Outcome: {analysis.get('outcome', 'N/A')}")
    print(f"Monthly Premium: ${analysis.get('monthly_premium', 'N/A')}")
    print(f"Enrollment Fee: ${analysis.get('enrollment_fee', 'N/A')}")
    print(f"Customer Name: {analysis.get('customer_name', 'N/A')}")
    print(f"Reason: {analysis.get('reason', 'N/A')}")
    print(f"Summary: {analysis.get('summary', 'N/A')}")

    if 'policy_details' in analysis:
        pd = analysis['policy_details']
        print(f"\n=== POLICY DETAILS ===")
        print(f"Carrier: {pd.get('carrier', 'N/A')}")
        print(f"Plan Type: {pd.get('plan_type', 'N/A')}")
        print(f"Effective Date: {pd.get('effective_date', 'N/A')}")

    if 'red_flags' in analysis and analysis['red_flags']:
        print(f"\n=== RED FLAGS ===")
        for flag in analysis['red_flags']:
            print(f"- {flag}")

print(f"\n=== CALL METADATA ===")
print(f"Utterances: {data.get('utterance_count', 'N/A')}")
duration = data.get('duration', 0)
print(f"Duration: {int(duration//60)}:{int(duration%60):02d}")
print(f"Model: {data.get('metadata', {}).get('model', 'N/A')}")

print(f"\n=== TRANSCRIPT SAMPLE ===")
transcript = data.get('transcript', '')
lines = transcript.split('\n')
print("First 5 utterances:")
for line in lines[:5]:
    if line.strip():
        print(f"  {line[:120]}...")

print("\nLast 5 utterances:")
for line in lines[-5:]:
    if line.strip():
        print(f"  {line[:120]}...")

print(f"\n=== FULL OUTPUT ===")
print(json.dumps(data, indent=2))