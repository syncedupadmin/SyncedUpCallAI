// Debug version to check admin status
// Add this temporarily to the login page after line 37 to debug:
console.log('Checking admin status...');
const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
console.log('Admin check result:', { isAdmin, adminError });

if (adminError) {
  console.error('Error checking admin status:', adminError);
}
