#!/bin/bash

AUTH_TOKEN="8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p"

# Test 1: Get calls for specific user_id
echo "=== Test 1: Fetching calls for user_id 1054132 ==="
curl -s "https://api.convoso.com/v1/log/retrieve?auth_token=${AUTH_TOKEN}&user_id=1054132&limit=5" | python3 -m json.tool > test1.json

echo "Response structure:"
cat test1.json | python3 -c "import sys,json; data=json.load(sys.stdin); print('Success:', data.get('success')); print('Total found:', data.get('data', {}).get('total_found')); print('Entries:', data.get('data', {}).get('entries'))"

echo ""
echo "First call sample:"
cat test1.json | python3 -c "import sys,json; data=json.load(sys.stdin); results=data.get('data', {}).get('results', []); print(json.dumps(results[0] if results else {}, indent=2))" | head -40

echo ""
echo "=== Test 2: Check if call_length field exists (for 10+ sec filtering) ==="
cat test1.json | python3 -c "import sys,json; data=json.load(sys.stdin); results=data.get('data', {}).get('results', []); print('Call lengths:', [r.get('call_length') for r in results[:5]])"

echo ""
echo "=== Test 3: Test with date range ==="
START_DATE="2025-09-25"
END_DATE="2025-10-01"
echo "Fetching calls from ${START_DATE} to ${END_DATE} for user_id 1054132"
curl -s "https://api.convoso.com/v1/log/retrieve?auth_token=${AUTH_TOKEN}&user_id=1054132&start=${START_DATE}&end=${END_DATE}&limit=10" | python3 -c "import sys,json; data=json.load(sys.stdin); print('Total found:', data.get('data', {}).get('total_found')); results=data.get('data', {}).get('results', []); valid=[r for r in results if r.get('call_length') and int(r.get('call_length')) >= 10]; print('Calls with 10+ sec:', len(valid), 'out of', len(results))"

echo ""
echo "=== Test 4: Check what fields are available ==="
cat test1.json | python3 -c "import sys,json; data=json.load(sys.stdin); results=data.get('data', {}).get('results', []); print('Available fields:', list(results[0].keys()) if results else [])" 

rm test1.json
