import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'SENDGRID_API_KEY not found in environment variables'
    }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'nicholas.stults@gmail.com' }]
        }],
        from: { email: 'admin@syncedupsolutions.com' },
        subject: 'SendGrid Test from Vercel',
        content: [{
          type: 'text/plain',
          value: 'This is a test email sent from your Vercel deployment to verify SendGrid integration.'
        }]
      })
    });

    const responseText = await response.text();
    let responseData;

    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = responseText;
    }

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Email sent successfully!',
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'SendGrid API error',
        status: response.status,
        details: responseData
      }, { status: response.status });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      details: error
    }, { status: 500 });
  }
}