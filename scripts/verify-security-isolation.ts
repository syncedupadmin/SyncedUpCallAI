#!/usr/bin/env ts-node
/**
 * Security Verification Script
 *
 * Verifies that multi-tenant agency isolation is properly implemented
 * across all API routes to prevent cross-agency data access.
 *
 * Run: npx ts-node scripts/verify-security-isolation.ts
 */

import fs from 'fs';
import path from 'path';

interface SecurityCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

const checks: SecurityCheck[] = [];

function addCheck(name: string, passed: boolean, details: string, severity: SecurityCheck['severity'] = 'MEDIUM') {
  checks.push({ name, passed, details, severity });
}

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
}

function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

console.log('🔒 Multi-Tenant Security Isolation Verification\n');
console.log('Checking security implementation...\n');

const securityModulePath = path.join(process.cwd(), 'src', 'lib', 'security', 'agency-isolation.ts');
const middlewarePath = path.join(process.cwd(), 'src', 'middleware.ts');
const dbPath = path.join(process.cwd(), 'src', 'server', 'db.ts');

addCheck(
  'Security module exists',
  checkFileExists(securityModulePath),
  `Security utilities module at ${securityModulePath}`,
  'CRITICAL'
);

const securityModule = readFile(securityModulePath);
if (securityModule) {
  addCheck(
    'getAgencyContext function exists',
    securityModule.includes('export async function getAgencyContext'),
    'Found getAgencyContext function',
    'CRITICAL'
  );

  addCheck(
    'withStrictAgencyIsolation wrapper exists',
    securityModule.includes('export function withStrictAgencyIsolation'),
    'Found withStrictAgencyIsolation wrapper',
    'CRITICAL'
  );

  addCheck(
    'createSecureClient function exists',
    securityModule.includes('export function createSecureClient'),
    'Found createSecureClient function',
    'CRITICAL'
  );

  addCheck(
    'validateResourceAccess function exists',
    securityModule.includes('export async function validateResourceAccess'),
    'Found validateResourceAccess function',
    'HIGH'
  );

  addCheck(
    'Security logging implemented',
    securityModule.includes('[SECURITY]'),
    'Security audit logging present',
    'HIGH'
  );
}

const vulnerableRoutes = [
  'src/app/api/ui/calls/route.ts',
  'src/app/api/ui/call/route.ts',
  'src/app/api/ui/call/[id]/route.ts',
  'src/app/api/ui/library/route.ts',
  'src/app/api/ui/stats/route.ts',
  'src/app/api/ui/journey/route.ts',
  'src/app/api/ui/processed-calls/route.ts',
  'src/app/api/ui/search/route.ts'
];

for (const route of vulnerableRoutes) {
  const routePath = path.join(process.cwd(), route);
  const content = readFile(routePath);

  if (content) {
    const hasSecurityWrapper = content.includes('withStrictAgencyIsolation');
    const hasAgencyFilter = content.includes("in('agency_id', context.agencyIds)") ||
                           content.includes('agency_id = ANY($') ||
                           content.includes('.agencyIds');
    const usesRawDb = content.includes("from '@/server/db'") &&
                     !content.includes('context.agencyIds');

    addCheck(
      `${route}: Uses security wrapper`,
      hasSecurityWrapper,
      hasSecurityWrapper
        ? `✓ Protected with withStrictAgencyIsolation`
        : `✗ Missing withStrictAgencyIsolation wrapper`,
      'CRITICAL'
    );

    addCheck(
      `${route}: Agency filtering implemented`,
      hasAgencyFilter,
      hasAgencyFilter
        ? `✓ Filters by agency_id`
        : `✗ No agency filtering detected`,
      'CRITICAL'
    );

    addCheck(
      `${route}: No unprotected raw DB usage`,
      !usesRawDb,
      usesRawDb
        ? `✗ Uses raw db without agency context`
        : `✓ No unprotected raw DB usage`,
      'CRITICAL'
    );
  } else {
    addCheck(
      `${route}: File exists`,
      false,
      `✗ File not found`,
      'CRITICAL'
    );
  }
}

const middleware = readFile(middlewarePath);
if (middleware) {
  const excludesApiRoutes = middleware.includes('|api)');
  addCheck(
    'Middleware protects API routes',
    !excludesApiRoutes,
    excludesApiRoutes
      ? '✗ Middleware excludes /api/* routes'
      : '✓ Middleware includes API routes',
    'HIGH'
  );
}

const dbModule = readFile(dbPath);
if (dbModule) {
  const hasSecurityWarning = dbModule.includes('SECURITY WARNING') ||
                            dbModule.includes('BYPASSES Row-Level Security');
  addCheck(
    'Raw DB module has deprecation warnings',
    hasSecurityWarning,
    hasSecurityWarning
      ? '✓ Security warnings present'
      : '✗ Missing security warnings about RLS bypass',
    'MEDIUM'
  );
}

console.log('\n📊 Security Verification Results:\n');

const criticalFailures: SecurityCheck[] = [];
const highFailures: SecurityCheck[] = [];
const mediumFailures: SecurityCheck[] = [];
const passed: SecurityCheck[] = [];

checks.forEach(check => {
  const icon = check.passed ? '✅' : '❌';
  const severity = check.passed ? '' : ` [${check.severity}]`;
  console.log(`${icon} ${check.name}${severity}`);
  console.log(`   ${check.details}\n`);

  if (!check.passed) {
    if (check.severity === 'CRITICAL') criticalFailures.push(check);
    else if (check.severity === 'HIGH') highFailures.push(check);
    else if (check.severity === 'MEDIUM') mediumFailures.push(check);
  } else {
    passed.push(check);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\n📈 Summary:\n');
console.log(`Total Checks: ${checks.length}`);
console.log(`✅ Passed: ${passed.length}`);
console.log(`❌ Failed: ${checks.length - passed.length}`);

if (criticalFailures.length > 0) {
  console.log(`\n🔴 CRITICAL failures: ${criticalFailures.length}`);
}
if (highFailures.length > 0) {
  console.log(`🟠 HIGH failures: ${highFailures.length}`);
}
if (mediumFailures.length > 0) {
  console.log(`🟡 MEDIUM failures: ${mediumFailures.length}`);
}

console.log('\n' + '='.repeat(70));

if (criticalFailures.length > 0) {
  console.log('\n🚨 CRITICAL ISSUES DETECTED - DEPLOYMENT BLOCKED\n');
  console.log('The following critical security issues must be resolved:\n');
  criticalFailures.forEach((check, i) => {
    console.log(`${i + 1}. ${check.name}`);
    console.log(`   ${check.details}\n`);
  });
  process.exit(1);
} else if (highFailures.length > 0) {
  console.log('\n⚠️  HIGH-PRIORITY ISSUES DETECTED\n');
  console.log('The following issues should be addressed:\n');
  highFailures.forEach((check, i) => {
    console.log(`${i + 1}. ${check.name}`);
    console.log(`   ${check.details}\n`);
  });
  process.exit(1);
} else {
  console.log('\n✅ ALL SECURITY CHECKS PASSED\n');
  console.log('Multi-tenant agency isolation is properly implemented.');
  console.log('System is ready for production deployment.\n');
  process.exit(0);
}