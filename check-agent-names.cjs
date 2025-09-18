const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nofhwemvyrbejqitjzrw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZmh3ZW12eXJiZWpxaXRqenJ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzY3MDA0OCwiZXhwIjoyMDQ5MjQ2MDQ4fQ.hqxmDrVtfBCq91-2xCjD8jU5qowCUKaCYVzwTKwJNMY'
);

async function checkAgentNames() {
  console.log('Checking agent names in database...\n');

  const { data, error } = await supabase
    .from('calls')
    .select('id, agent_name, source, metadata, created_at')
    .or('source.eq.convoso,source.eq.cron,source.eq.manual')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No Convoso calls found in database');
    return;
  }

  console.log(`Found ${data.length} calls:\n`);

  data.forEach(call => {
    console.log(`Call ID: ${call.id}`);
    console.log(`  Agent Name: ${call.agent_name}`);
    console.log(`  Source: ${call.source}`);
    console.log(`  Imported By: ${call.metadata?.imported_by || 'N/A'}`);
    console.log(`  Created: ${new Date(call.created_at).toLocaleString()}`);
    console.log('');
  });

  // Check specifically for 'system' as agent name
  const systemAgents = data.filter(c => c.agent_name === 'system' || c.agent_name === 'System');
  if (systemAgents.length > 0) {
    console.log(`⚠️ Found ${systemAgents.length} calls with 'system' as agent_name`);
    console.log('This indicates the agent name is not being fetched from the API correctly.');
  }
}

checkAgentNames();