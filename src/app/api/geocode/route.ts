import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('q');
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!address) return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  if (!key) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
    );
    const data = await res.json();

    if (data.status === 'OK' && data.results[0]) {
      const r = data.results[0];
      return NextResponse.json({
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        displayName: r.formatted_address,
      });
    }
    return NextResponse.json({ error: 'Not found', status: data.status }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
