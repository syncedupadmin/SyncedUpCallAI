#!/bin/bash

#############################################
# SyncedUpCallAI - Critical Security Fix Script
# Generated: October 2, 2025
# Purpose: Emergency remediation of secrets in Git
#############################################

set -e  # Exit on error

echo "================================================"
echo "   SyncedUpCallAI Security Emergency Fix"
echo "   WARNING: This will rewrite Git history!"
echo "================================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "This script must be run from the repository root"
    exit 1
fi

echo "This script will:"
echo "1. Remove ALL .env files from Git history"
echo "2. Create proper .gitignore entries"
echo "3. Create a secure env template"
echo "4. Set up pre-commit hooks"
echo ""
read -p "Are you SURE you want to continue? (type 'yes' to proceed): " confirmation

if [ "$confirmation" != "yes" ]; then
    print_warning "Aborted by user"
    exit 0
fi

# Step 1: Create backup
print_status "Creating repository backup..."
git bundle create ../syncedupcallai-backup-$(date +%Y%m%d-%H%M%S).bundle --all
print_status "Backup created in parent directory"

# Step 2: Save current env files (if they exist and aren't already saved)
print_status "Saving current environment files..."
mkdir -p .env_backup_temp
for file in .env .env.local .env.production .env.vercel.local .env.local.backup; do
    if [ -f "$file" ]; then
        cp "$file" ".env_backup_temp/$file.backup" 2>/dev/null || true
        print_warning "Saved $file to .env_backup_temp/"
    fi
done

# Step 3: Remove env files from Git history
print_status "Removing .env files from Git history..."
print_warning "This may take several minutes for large repositories..."

# Using git filter-branch to remove files
git filter-branch --force --index-filter \
    'git rm --cached --ignore-unmatch .env .env.* *.env 2>/dev/null || true' \
    --prune-empty --tag-name-filter cat -- --all

print_status "Git history cleaned"

# Step 4: Clean up refs and garbage collect
print_status "Cleaning up Git references..."
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive
print_status "Git cleanup complete"

# Step 5: Update .gitignore
print_status "Updating .gitignore..."
cat >> .gitignore << 'EOL'

# Environment Variables - NEVER COMMIT
.env
.env.*
*.env
!.env.example
!.env.local.example
.env_backup_temp/

# Security
*.key
*.pem
*.p12
*.pfx
credentials.json
serviceAccount.json

# IDE
.idea/
.vscode/settings.json
*.swp
*.swo

EOL

print_status ".gitignore updated"

# Step 6: Create secure example files
print_status "Creating secure example files..."

cat > .env.local.example << 'EOL'
# Database (Supabase)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
DATABASE_URL=postgresql://postgres:xxxxx@db.xxxxx.supabase.co:5432/postgres

# External APIs
DEEPGRAM_API_KEY=xxxxx
OPENAI_API_KEY=sk-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx  # Optional fallback

# Integrations
CONVOSO_WEBHOOK_SECRET=xxxxx
CONVOSO_AUTH_TOKEN=xxxxx
STRIPE_SECRET_KEY=sk_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Security
JOBS_SECRET=generate-with-openssl-rand-base64-32
CRON_SECRET=generate-with-openssl-rand-base64-32
ENCRYPTION_KEY=generate-with-openssl-rand-base64-32

# Application
APP_URL=https://your-app.vercel.app
NODE_ENV=production

# Feature Flags
HIPAA_MODE=false
REDACTION=true

# Monitoring (Optional)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENDGRID_API_KEY=SG.xxxxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx

EOL

print_status "Created .env.local.example"

# Step 7: Generate secure random secrets
print_status "Generating secure secrets for your reference..."
echo ""
echo "========================================="
echo "   SECURE SECRETS (SAVE THESE!)"
echo "========================================="
echo "JOBS_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "CONVOSO_WEBHOOK_SECRET=$(openssl rand -base64 24)"
echo "========================================="
echo ""

# Step 8: Create pre-commit hook
print_status "Setting up pre-commit hook..."
mkdir -p .git/hooks

cat > .git/hooks/pre-commit << 'EOL'
#!/bin/bash
# Pre-commit hook to prevent committing secrets

# Check for .env files
env_files=$(git diff --cached --name-only | grep -E '^\.(env|.*\.env)' || true)
if [ ! -z "$env_files" ]; then
    echo "ERROR: Attempting to commit .env files:"
    echo "$env_files"
    echo "Remove them from staging: git reset HEAD <file>"
    exit 1
fi

# Check for potential secrets in staged files
patterns=(
    "sk-[a-zA-Z0-9]{48}"  # OpenAI
    "sk-ant-"              # Anthropic
    "eyJ[a-zA-Z0-9]+"      # JWT/Supabase
    "whsec_"               # Stripe webhook
    "SG\."                 # SendGrid
    "-----BEGIN"           # Private keys
)

for pattern in "${patterns[@]}"; do
    matches=$(git diff --cached --name-only -z | xargs -0 grep -l "$pattern" 2>/dev/null || true)
    if [ ! -z "$matches" ]; then
        echo "ERROR: Potential secrets found in:"
        echo "$matches"
        echo "Pattern: $pattern"
        exit 1
    fi
done

exit 0
EOL

chmod +x .git/hooks/pre-commit
print_status "Pre-commit hook installed"

# Step 9: Create emergency checklist
cat > EMERGENCY_CHECKLIST.md << 'EOL'
# POST-CLEANUP EMERGENCY CHECKLIST

## IMMEDIATE ACTIONS REQUIRED

### 1. Rotate ALL Secrets (DO THIS NOW!)

Visit these services and regenerate all keys:

- [ ] **Supabase**: https://app.supabase.io → Settings → API
  - [ ] Regenerate anon key
  - [ ] Regenerate service role key

- [ ] **OpenAI**: https://platform.openai.com/api-keys
  - [ ] Delete old key
  - [ ] Create new key

- [ ] **Deepgram**: https://console.deepgram.com
  - [ ] Revoke old API key
  - [ ] Generate new API key

- [ ] **Stripe**: https://dashboard.stripe.com/apikeys
  - [ ] Roll secret key
  - [ ] Regenerate webhook secret

- [ ] **Convoso**: Contact support or use dashboard
  - [ ] Reset webhook secret
  - [ ] Reset auth token

- [ ] **Anthropic**: https://console.anthropic.com
  - [ ] Regenerate API key (if used)

### 2. Update Vercel Environment Variables

Go to: https://vercel.com/[your-team]/[your-project]/settings/environment-variables

Add all new keys from step 1.

### 3. Update Local Development

```bash
# Create new .env.local with new secrets
cp .env.local.example .env.local
# Edit with your new keys
nano .env.local
```

### 4. Force Push (COORDINATE WITH TEAM!)

```bash
# THIS WILL BREAK OTHER PEOPLE'S CLONES
git push origin --force --all
git push origin --force --tags
```

### 5. Notify Team

Send this message to your team:

```
URGENT: Security fix applied to repository.
Action required:
1. Do NOT pull or fetch
2. Back up any uncommitted work
3. Re-clone the repository fresh
4. Get new .env.local from team lead
5. Never commit .env files
```

### 6. Audit Access Logs

Check these services for unauthorized access:
- Supabase: Check audit logs
- OpenAI: Check usage dashboard
- Stripe: Check API logs
- Vercel: Check deployment history

### 7. Set Up Monitoring

- [ ] Enable Sentry error tracking
- [ ] Set up spending alerts on OpenAI
- [ ] Configure Stripe webhook monitoring
- [ ] Enable Supabase email alerts

## Prevention Measures

1. **Never** commit .env files
2. Use Vercel environment variables
3. Rotate secrets quarterly
4. Use the pre-commit hook
5. Run `git status` before committing

## If Compromise Suspected

1. Immediately disable all API keys
2. Check billing on all services
3. Review audit logs for unusual activity
4. Contact security@company.com
5. File incident report

---
Generated: $(date)
EOL

print_status "Created EMERGENCY_CHECKLIST.md"

# Final summary
echo ""
echo "================================================"
echo -e "${GREEN}   CLEANUP COMPLETE!${NC}"
echo "================================================"
echo ""
echo -e "${RED}CRITICAL: You MUST now:${NC}"
echo ""
echo "1. Rotate ALL API keys and secrets immediately"
echo "   See EMERGENCY_CHECKLIST.md for links"
echo ""
echo "2. Update Vercel environment variables with new keys"
echo ""
echo "3. Force push to remote (coordinate with team!):"
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "4. Have all team members re-clone the repository"
echo ""
echo -e "${YELLOW}Your old .env files are backed up in:${NC}"
echo "   .env_backup_temp/"
echo ""
echo -e "${YELLOW}Repository backup created in parent directory${NC}"
echo ""
print_warning "DO NOT restore old .env files to the repository!"
print_warning "Add them to Vercel settings instead"
echo ""
echo "Read EMERGENCY_CHECKLIST.md for complete instructions"

# Optional: Open checklist
if command -v code &> /dev/null; then
    code EMERGENCY_CHECKLIST.md
elif command -v open &> /dev/null; then
    open EMERGENCY_CHECKLIST.md
fi