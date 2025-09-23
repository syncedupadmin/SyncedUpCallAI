# Batch Upload Test Audio Files

## Quick Steps to Upload Your 267 MP3 Files

### 1. Go to Upload Page
Visit: http://localhost:3000/testing/upload

### 2. Select Files
- Click "Select MP3 Files" button
- Navigate to: `C:\Users\nicho\Downloads\iokjakye7l`
- Press Ctrl+A to select all files
- Click Open

### 3. Upload
- Click "Upload All Files" button
- Wait for progress (about 5-10 minutes for all 267 files)
- You'll see a progress bar showing X/267 files uploaded

### 4. Run Tests
After upload completes:
- Click "Go to Testing Dashboard"
- Your new test suite will appear
- Click "Run All Tests" to transcribe with Deepgram

## What This Does

1. **Creates a test suite** named "Bulk Upload YYYY-MM-DD"
2. **Uploads each MP3** to Supabase storage
3. **Creates test cases** for each file
4. **Extracts metadata** from filenames:
   - Account ID
   - Campaign ID
   - Lead ID
   - Agent ID
   - Timestamp

## File Pattern Detected

Your files follow this pattern:
```
103833_1110454_2027107388_10489711_4123_1758578091_9167-in-1758578091.mp3
  ^      ^        ^           ^       ^       ^         ^
  |      |        |           |       |       |         |
Account Campaign  Lead ID   Agent ID List  Timestamp  Extra
```

## Testing Process

When you run tests:
1. Each MP3 is sent to Deepgram for transcription
2. First transcription becomes the "ground truth"
3. Subsequent tests compare against ground truth
4. WER (Word Error Rate) is calculated
5. Results show accuracy metrics

## Tips

- **Start with 10-20 files** first to verify everything works
- **Check file sizes** - very large files may take longer
- **Monitor progress** - the UI shows real-time upload status
- **Batch processing** - system handles files sequentially to avoid overload

## Troubleshooting

If uploads fail:
1. Check you're logged in
2. Verify Supabase storage bucket exists (`call-recordings`)
3. Ensure files are valid MP3 format
4. Check file permissions

## Storage Location

Files are stored in Supabase at:
```
/storage/call-recordings/test-audio/{suite-id}/{filename}
```

## Next Steps

After uploading:
1. View test cases in dashboard
2. Run transcription tests
3. Compare WER scores
4. Export results for analysis