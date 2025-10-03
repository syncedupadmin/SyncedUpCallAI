/**
 * API Route: Compliance Script Templates
 * Provides default post-close compliance script templates
 * that agencies can use as starting points
 */

import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Default script templates
const SCRIPT_TEMPLATES = [
  {
    name: "Medicare Advantage Post-Close Script",
    product_type: "Medicare Advantage",
    state: null,
    script_text: `Thank you for enrolling in our Medicare Advantage plan today. Before we finalize your enrollment, I need to review some important information with you.

First, I want to confirm that you understand this is a Medicare Advantage plan, which replaces your Original Medicare Parts A and B. Your new plan will become effective on [EFFECTIVE DATE].

Your monthly premium will be [PREMIUM AMOUNT] in addition to your Medicare Part B premium. This will be automatically deducted from your Social Security check.

You have selected the [PLAN NAME] which includes [COVERAGE DETAILS]. Your annual deductible is [DEDUCTIBLE AMOUNT] and your maximum out-of-pocket is [MAX OOP].

It's important that you continue to pay your Medicare Part B premium. If you stop paying your Part B premium, you will lose your Medicare Advantage coverage.

You have the right to cancel this enrollment. If you change your mind, you can cancel during the Annual Enrollment Period or if you qualify for a Special Enrollment Period.

Do you have any questions about what we've discussed today?

Thank you for choosing our Medicare Advantage plan. You'll receive your welcome packet and member ID card within 7-10 business days. Is the address we have on file still correct?

This call may have been recorded for quality assurance purposes. Thank you for your time today.`,
    required_phrases: [
      "Medicare Advantage plan",
      "replaces your Original Medicare Parts A and B",
      "monthly premium",
      "Medicare Part B premium",
      "annual deductible",
      "maximum out-of-pocket",
      "right to cancel",
      "Annual Enrollment Period",
      "welcome packet",
      "recorded for quality assurance"
    ]
  },
  {
    name: "Medicare Supplement Post-Close Script",
    product_type: "Medicare Supplement",
    state: null,
    script_text: `Thank you for purchasing your Medicare Supplement insurance policy today. Let me review the important details of your coverage.

You have selected Plan [PLAN LETTER] which provides [COVERAGE DESCRIPTION]. This supplement works alongside your Original Medicare to help cover costs that Medicare doesn't pay.

Your monthly premium is [PREMIUM AMOUNT]. This is in addition to your Medicare Part B premium, which you must continue to pay.

Your coverage will begin on [EFFECTIVE DATE]. There is no deductible with this plan, and it covers [BENEFIT DETAILS].

This Medicare Supplement policy is guaranteed renewable. This means your insurance company cannot cancel your policy as long as you pay your premiums on time.

You have a 30-day free-look period. If you're not satisfied with your policy, you can cancel it within 30 days of receipt and receive a full refund of any premiums paid.

Your policy documents will be mailed to you within 10 business days. Please review them carefully when they arrive.

Do you have any questions about your Medicare Supplement coverage?

I want to confirm your mailing address for the policy documents: [CONFIRM ADDRESS].

This call has been recorded for quality and training purposes. Thank you for choosing us for your Medicare Supplement insurance needs.`,
    required_phrases: [
      "Medicare Supplement insurance policy",
      "works alongside your Original Medicare",
      "monthly premium",
      "Medicare Part B premium",
      "guaranteed renewable",
      "30-day free-look period",
      "full refund",
      "policy documents",
      "10 business days",
      "recorded for quality"
    ]
  },
  {
    name: "ACA Health Insurance Post-Close Script",
    product_type: "ACA",
    state: null,
    script_text: `Thank you for enrolling in your health insurance plan through the Affordable Care Act marketplace today.

You have selected the [PLAN NAME] from [CARRIER NAME]. This is a [METAL LEVEL] plan with a monthly premium of [PREMIUM AMOUNT] after your subsidy of [SUBSIDY AMOUNT] has been applied.

Your coverage will begin on [EFFECTIVE DATE]. Your annual deductible is [DEDUCTIBLE] and your maximum out-of-pocket is [MAX OOP].

It's important that you pay your first premium by [PAYMENT DEADLINE] to ensure your coverage begins on time. You can pay online, by phone, or by mail using the information in your welcome packet.

You must report any changes in income or household size to the marketplace within 30 days, as this could affect your subsidy amount.

You have selected [PRIMARY CARE PHYSICIAN] as your primary care doctor. You can change this selection at any time by contacting member services.

Your insurance cards and welcome packet will arrive within 7-14 business days at the address we have on file.

You have the right to appeal any coverage decisions. Information about the appeals process will be included in your member handbook.

Do you have any questions about your new health insurance coverage?

This call has been recorded for quality assurance and compliance purposes. Congratulations on obtaining health insurance coverage.`,
    required_phrases: [
      "Affordable Care Act marketplace",
      "monthly premium",
      "subsidy",
      "annual deductible",
      "maximum out-of-pocket",
      "pay your first premium",
      "report any changes",
      "within 30 days",
      "insurance cards",
      "right to appeal",
      "recorded for quality assurance"
    ]
  },
  {
    name: "Final Expense Post-Close Script",
    product_type: "Final Expense",
    state: null,
    script_text: `Thank you for purchasing your final expense life insurance policy today. Let me review the important details with you.

You have purchased a whole life insurance policy with a death benefit of [DEATH BENEFIT AMOUNT]. This benefit is guaranteed and will never decrease as long as premiums are paid.

Your monthly premium is [PREMIUM AMOUNT] and will never increase for the life of the policy. You've chosen to have this automatically drafted from your [PAYMENT METHOD] on the [DRAFT DATE] of each month.

Your beneficiary is [BENEFICIARY NAME] with the relationship of [RELATIONSHIP]. You can change your beneficiary at any time by submitting a written request.

This policy has a two-year contestability period. This means the insurance company can investigate and deny claims for material misrepresentations made on the application during the first two years.

Your policy will build cash value over time, which you can borrow against if needed. However, any outstanding loans will reduce the death benefit.

You have a 30-day free-look period. If you decide this policy isn't right for you, you can return it within 30 days for a full refund.

Your policy documents will be mailed to you within 10-14 business days. Keep them in a safe place and make sure your beneficiary knows about this policy.

Do you have any questions about your final expense coverage?

This call has been recorded for compliance and quality assurance purposes. Thank you for trusting us with your final expense insurance needs.`,
    required_phrases: [
      "final expense life insurance",
      "whole life insurance policy",
      "death benefit",
      "guaranteed and will never decrease",
      "monthly premium",
      "never increase",
      "beneficiary",
      "two-year contestability period",
      "cash value",
      "30-day free-look period",
      "recorded for compliance"
    ]
  }
];

/**
 * GET: Retrieve available script templates
 */
export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    // Return all templates
    return NextResponse.json({
      success: true,
      templates: SCRIPT_TEMPLATES.map(t => ({
        ...t,
        id: `template_${t.product_type?.toLowerCase().replace(/\s+/g, '_') || 'generic'}`
      }))
    });
  } catch (error: any) {
    console.error('Failed to retrieve templates:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve templates' },
      { status: 500 }
    );
  }
});

/**
 * POST: Create a script from a template
 */
export const POST = withStrictAgencyIsolation(async (req, context) => {
  try {
    const { template_id, customizations } = await req.json();

    // Find the template
    const template = SCRIPT_TEMPLATES.find(t =>
      `template_${t.product_type?.toLowerCase().replace(/\s+/g, '_') || 'generic'}` === template_id
    );

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Apply any customizations
    let scriptText = template.script_text;
    let scriptName = template.name;

    if (customizations) {
      // Replace placeholders with actual values
      Object.entries(customizations).forEach(([key, value]) => {
        const placeholder = `[${key.toUpperCase().replace(/_/g, ' ')}]`;
        scriptText = scriptText.replace(new RegExp(placeholder, 'g'), String(value));
      });

      // Update name if provided
      if (customizations.script_name) {
        scriptName = customizations.script_name;
      }
    }

    // Create the script in the database
    const script = await db.one(`
      INSERT INTO post_close_scripts (
        script_name,
        script_version,
        product_type,
        state,
        script_text,
        required_phrases,
        min_word_match_percentage,
        fuzzy_match_threshold,
        allow_minor_variations,
        strict_mode,
        agency_id,
        status,
        uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      scriptName,
      '1.0',
      template.product_type,
      customizations?.state || null,
      scriptText,
      template.required_phrases,
      85.0, // Default min word match percentage
      0.8,  // Default fuzzy match threshold
      true, // Allow minor variations by default
      false, // Start in normal mode, not strict
      context.agencyId,
      'draft',
      context.userId
    ]);

    return NextResponse.json({
      success: true,
      script,
      message: 'Script created from template successfully'
    });

  } catch (error: any) {
    console.error('Failed to create script from template:', error);
    return NextResponse.json(
      { error: 'Failed to create script from template' },
      { status: 500 }
    );
  }
});