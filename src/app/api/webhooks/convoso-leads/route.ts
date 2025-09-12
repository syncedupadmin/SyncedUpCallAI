import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);
    
    // Log the webhook for debugging
    console.log('Lead webhook received:', {
      type: 'lead',
      lead_id: body.owner_id || body.created_by,
      phone: body.phone_number,
      name: `${body.first_name} ${body.last_name}`,
      email: body.email
    });
    
    // This is lead data, not call data
    // Store it in a leads table or contacts table if you want to track leads
    
    // For now, just acknowledge receipt
    return NextResponse.json({
      ok: true,
      message: 'Lead data received',
      type: 'lead',
      lead: {
        name: `${body.first_name} ${body.last_name}`,
        phone: body.phone_number,
        email: body.email
      }
    });
    
  } catch (error: any) {
    console.error('Lead webhook error:', error);
    
    // Return success to prevent retries
    return NextResponse.json({
      ok: true,
      message: 'Webhook received',
      error: error.message
    });
  }
}

// GET endpoint to check status
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Convoso leads webhook endpoint',
    description: 'This endpoint receives lead/contact data from Convoso',
    timestamp: new Date().toISOString()
  });
}