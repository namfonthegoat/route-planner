import { NextRequest, NextResponse } from 'next/server';

const NEON_CONNECTION_STRING = process.env.NEON_CONNECTION_STRING;

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    const url = "https://ep-ancient-morning-and850nw-pooler.c-6.us-east-1.aws.neon.tech/sql";

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (NEON_CONNECTION_STRING) headers['neon-connection-string'] = NEON_CONNECTION_STRING;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
