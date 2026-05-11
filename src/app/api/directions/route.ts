import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { places } = await request.json();
    const key = process.env.GOOGLE_MAPS_API_KEY;

    if (!places || places.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 places' }, { status: 400 });
    }

    const start = places[0];
    const end = places[places.length - 1];
    const waypoints = places.slice(1, -1);

    const params = new URLSearchParams({
      origin: `${start.lat},${start.lng}`,
      destination: `${end.lat},${end.lng}`,
      key: key || '',
    });

    if (waypoints.length > 0) {
      params.set('optimize_waypoints', 'true');
      waypoints.forEach((p: any) => {
        params.append('waypoints', `${p.lat},${p.lng}`);
      });
    }

    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const data = await res.json();

    if (data.status !== 'OK') {
      return NextResponse.json({ error: data.status, message: data.error_message }, { status: 400 });
    }

    const order = data.routes[0].waypoint_order;
    const reordered = [start, ...order.map((i: number) => waypoints[i]), end];

    return NextResponse.json({
      optimized_order: reordered,
      route: data.routes[0],
      waypoint_order: order,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
