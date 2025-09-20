# Discovery System Files

This folder contains all files related to the Discovery and Openings analysis system.

## File Structure

### UI Pages
- `discovery-test-page.tsx` - Superadmin discovery test page (`/superadmin/discovery-test`)
- `admin-discovery-test-page.tsx` - Admin discovery test page (`/admin/discovery-test`)
- `superadmin-openings-page.tsx` - Superadmin openings analysis page (`/superadmin/openings`)
- `admin-openings-page.tsx` - Admin openings analysis page (`/admin/openings`)

### API Endpoints

#### Discovery API (`api-discovery/`)
- `test/route.ts` - Test endpoint for analyzing existing DB calls
- `progress/route.ts` - Progress polling endpoint
- `start/route.ts` - Start discovery analysis endpoint

#### Openings API (`api-openings/`)
- `route.ts` - Main openings endpoint
- `agents/route.ts` - Agent-specific openings analysis
- `discover/route.ts` - Discover opening patterns
- `extract/route.ts` - Extract openings from calls
- `patterns/route.ts` - Manage opening patterns
- `score/route.ts` - Score opening quality
- `stats/route.ts` - Opening statistics

### Core Libraries
- `discovery-engine.ts` - Pattern recognition and analysis engine (lying detection, etc.)
- `opening-analyzer.ts` - Analyzes opening quality and patterns
- `opening-extractor.ts` - Extracts opening segments from calls
- `opening-control.ts` - Opening control scoring logic

### Database
- `add-discovery-system.sql` - Database migration for discovery system tables

## Key Features

### Discovery System
- Analyzes batches of calls (100 to 10,000)
- Calculates closing rates, opening scores, rebuttal failures
- Detects agent hangups on "Hello"
- Identifies lying patterns (dental scams, price deception)
- Real-time progress tracking
- Emerging insights during analysis

### Openings Analysis
- Extracts first 90 seconds of calls
- Scores opening quality (0-100)
- Identifies control acquisition patterns
- Tracks agent performance metrics
- Pattern discovery and cataloging

### Lying Detection Patterns
1. **Dental Scam Detection**
   - "Free dental exams" that aren't actually free
   - "Cleanings covered" requiring paid membership
   - "Bite wing x-rays included" with hidden costs

2. **Price Deception**
   - Changing prices during the call
   - Vague pricing responses
   - Rushed or mumbled pricing

3. **Feature Misrepresentation**
   - Overstating coverage
   - Hidden limitations
   - False urgency tactics

4. **Customer Contradiction Detection**
   - Customer saying they already purchased
   - Customer catching agent in lies
   - Customer expressing confusion about terms

## Database Tables

The discovery system uses these tables (from migration):
- `discovery_sessions` - Tracks analysis sessions
- `discovery_metrics` - Stores calculated metrics
- `discovery_insights` - Stores emerging insights
- `opening_patterns` - Cataloged opening patterns
- `agent_openings` - Agent-specific opening performance

## Integration Points

The discovery system integrates with:
- Convoso API for call data
- Transcription system (ASR Nova2)
- Analysis pipeline (rebuttals, outcomes, etc.)
- Agent performance tracking
- CRM updates

## Usage

1. **Run Discovery Analysis**
   - Navigate to `/superadmin/discovery-test`
   - Select number of calls to analyze
   - Click "Start Discovery Analysis"
   - Monitor real-time progress and insights

2. **View Opening Patterns**
   - Navigate to `/superadmin/openings`
   - View agent performance metrics
   - Discover new opening patterns
   - Export patterns for training

## Environment Variables

Required environment variables:
- Database connection (handled by existing DB config)
- OpenAI API key (for enhanced pattern detection if enabled)
- Convoso API credentials (for fetching call data)