require('dotenv').config({ path: '.env.local' });

console.log('Checking environment variables...\n');

const dbVars = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'POSTGRES_URL'
];

console.log('Database-related variables:');
dbVars.forEach(key => {
  const value = process.env[key];
  if (value) {
    const masked = value.length > 20
      ? value.substring(0, 20) + '...'
      : value;
    console.log(`  ${key}: ${masked}`);
  } else {
    console.log(`  ${key}: NOT SET`);
  }
});

console.log('\nAll environment variables:');
const allKeys = Object.keys(process.env)
  .filter(k => !k.startsWith('npm_') && !k.startsWith('NODE_') && !k.startsWith('PATH') && k !== 'PWD' && k !== 'OLDPWD')
  .sort();

console.log(`Total: ${allKeys.length}`);
console.log('Keys:', allKeys.slice(0, 15).join(', '));
