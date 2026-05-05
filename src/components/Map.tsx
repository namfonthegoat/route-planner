'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Place { name: string; lat: number | null; lng: number | null; }
const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#3b82f6','#ec4899','#64748b'];

export default function Map({ coords, places, dates }: { coords: [number, number][]; places: Place[]; dates: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = L.map(ref.current);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    coords.forEach((c, i) => {
      const ci = Math.floor(i / Math.ceil(coords.length / 4)) % colors.length;
      L.circleMarker(c, { radius: 10, fillColor: colors[ci], color: '#fff', weight: 3, fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup(`<div style="min-width:140px"><strong style="font-size:14px">${places[i]?.name||''}</strong><div style="color:#64748b;font-size:12px;margin-top:4px">${dates[i]||''}</div></div>`);
    });

    if (coords.length > 1) {
      L.polyline(coords, { color: '#6366f1', weight: 3, opacity: 0.6, dashArray: '8, 12' }).addTo(map);
      map.fitBounds(coords, { padding: [40, 40] });
    } else if (coords.length === 1) {
      map.setView(coords[0], 13);
    }

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [coords, places, dates]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
