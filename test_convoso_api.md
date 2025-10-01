# Convoso API Parameter Test

According to the docs you provided, `/users/recordings` expects:
- `user` parameter as "Comma delimited list of users"
- Example shows: `user=john1@gmail.com` (email format)

But we're currently passing `user_id` (numeric) from `/agent-performance/search`.

Need to check:
1. Does `/agent-performance/search` return email/username field?
2. Does `/users/recordings` accept user_id instead of email?
3. Should we use a different endpoint to get user emails?

Let me check the agent-performance response structure...
