// Debug script to test admin functionality
// Run this in the browser console after logging in

async function debugAdminAccess() {
  console.log('🔍 Debugging Admin Access...');

  // Check if we have a Supabase client
  if (typeof window === 'undefined' || !window.supabase) {
    console.error('❌ No Supabase client found');
    return;
  }

  const supabase = window.supabase;

  try {
    // 1. Check current user
    console.log('\n1️⃣ Checking current user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('❌ Error getting user:', userError);
      return;
    }

    if (!user) {
      console.error('❌ No authenticated user');
      return;
    }

    console.log('✅ User authenticated:', user.email, 'ID:', user.id);

    // 2. Check is_admin() function (without parameters)
    console.log('\n2️⃣ Testing is_admin() function (no parameters)...');
    const { data: isAdminNoParams, error: adminErrorNoParams } = await supabase.rpc('is_admin');
    console.log('Result:', { isAdminNoParams, adminErrorNoParams });

    // 3. Check is_admin() function (with email parameter)
    console.log('\n3️⃣ Testing is_admin() function (with email parameter)...');
    const { data: isAdminWithEmail, error: adminErrorWithEmail } = await supabase.rpc('is_admin', {
      user_email: user.email
    });
    console.log('Result:', { isAdminWithEmail, adminErrorWithEmail });

    // 4. Check admin_users table directly
    console.log('\n4️⃣ Checking admin_users table...');
    const { data: adminUsers, error: adminUsersError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', user.email);
    console.log('Admin users result:', { adminUsers, adminUsersError });

    // 5. Check profiles table for admin role
    console.log('\n5️⃣ Checking profiles table for admin role...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', user.email)
      .single();
    console.log('Profile result:', { profile, profileError });

    // 6. Check admin API endpoint
    console.log('\n6️⃣ Testing admin API endpoint...');
    const adminApiResponse = await fetch('/api/auth/admin', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const adminApiData = await adminApiResponse.json();
    console.log('Admin API result:', adminApiData);

    // 7. Check cookies
    console.log('\n7️⃣ Checking cookies...');
    const adminAuthCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('admin-auth='));
    console.log('Admin auth cookie:', adminAuthCookie ? 'Present' : 'Missing');

    // Summary
    console.log('\n📋 SUMMARY:');
    console.log('User:', user.email);
    console.log('is_admin() no params:', isAdminNoParams);
    console.log('is_admin() with email:', isAdminWithEmail);
    console.log('In admin_users table:', adminUsers && adminUsers.length > 0);
    console.log('Profile role:', profile?.role);
    console.log('Admin cookie:', adminAuthCookie ? 'Present' : 'Missing');

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (!isAdminNoParams && !isAdminWithEmail) {
      console.log('- User is not recognized as admin');
      console.log('- Check if email is in admin_users table');
      console.log('- Check if profile role is set to "admin"');
      console.log('- Run the fix-admin-function.sql script');
    }
    if (!adminAuthCookie) {
      console.log('- Admin cookie is missing');
      console.log('- Try logging in again through /login');
    }

  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  debugAdminAccess();
} else {
  console.log('Run debugAdminAccess() in the browser console');
}