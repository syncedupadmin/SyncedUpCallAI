// Test script to run Convoso sync directly
require('dotenv').config({ path: '.env.local' });

async function testSync() {
  console.log('Testing Convoso sync...');
  console.log('CONVOSO_AUTH_TOKEN present:', !!process.env.CONVOSO_AUTH_TOKEN);
  console.log('SUPABASE_SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Import the sync service
  const { ConvosoSyncService } = require('./src/lib/convoso-sync.ts');

  try {
    const syncService = new ConvosoSyncService();
    console.log('Starting sync...');

    const result = await syncService.syncCalls(1);

    console.log('Sync completed:', result);
  } catch (error) {
    console.error('Sync failed:', error.message);
    console.error('Full error:', error);
  }
}

testSync();