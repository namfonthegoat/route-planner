'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/Map'), { ssr: false });

interface Place {
  id: number; name: string; address: string;
  lat: number | null; lng: number | null; _saved?: boolean;
}

interface DayRoute {
  date: Date;
  places: Place[];
  gmapsUrl: string;
}

const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#3b82f6','#ec4899','#64748b'];
const sections = ['import-section','places-section','planner-section','results-section'];
const pageTitles: Record<string,{title:string;subtitle:string}> = {
  'import-section':{title:'Import Places',subtitle:'Add places from your lists'},
  'places-section':{title:'My Places',subtitle:'Manage your destinations'},
  'planner-section':{title:'Plan Route',subtitle:'Configure your monthly visits'},
  'results-section':{title:'Route Map',subtitle:'Your daily route plan'},
};

const weekNames = ['Week 1','Week 2','Week 3','Week 4'];
const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [section, setSection] = useState('import-section');
  const [dayRoutes, setDayRoutes] = useState<DayRoute[]>([]);
  const [routeId, setRouteId] = useState<number|null>(null);
  const [placesPerMonth, setPlacesPerMonth] = useState(10);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [optimize, setOptimize] = useState('nearest');
  const [selectedWeeks, setSelectedWeeks] = useState([true,true,true,true]);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gmapsInput, setGmapsInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{message:string;key:number}>({message:'',key:0});
  const [departure, setDeparture] = useState<{name:string;address:string;lat:number|null;lng:number|null;type:string}>({name:'',address:'',lat:null,lng:null,type:'home'});
  const [showDepartureForm, setShowDepartureForm] = useState(false);
  const [departureInput, setDepartureInput] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast({message: msg, key: Date.now()});
    setTimeout(() => setToast({message: '', key: 0}), 3000);
  }, []);

  const nav = (s: string) => { setSection(s); setSidebarOpen(false); };

  const scheduleCoords: [number,number][] = dayRoutes.flatMap(d => d.places.filter(p=>p.lat).map(p=>[p.lat!,p.lng!] as [number,number]));
  const allScheduleItems = dayRoutes.flatMap(d => d.places.map(p => ({date:d.date,place:p})));

  useEffect(() => {
    fetch('/api/neon', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:`CREATE TABLE IF NOT EXISTS places (id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, created_at TIMESTAMP DEFAULT NOW());
              CREATE TABLE IF NOT EXISTS routes (id SERIAL PRIMARY KEY, name TEXT, schedule JSONB, stats JSONB, created_at TIMESTAMP DEFAULT NOW());
              CREATE TABLE IF NOT EXISTS route_analyses (id SERIAL PRIMARY KEY, route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE, analysis TEXT, created_at TIMESTAMP DEFAULT NOW());`})
    }).catch(()=>{});
    fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'SELECT * FROM places ORDER BY created_at DESC'})})
      .then(r=>r.json()).then(d=>{
        if (d.rows?.length) setPlaces(d.rows.map((r:any)=>({id:r.id,name:r.name,address:r.address||'',lat:r.lat,lng:r.lng,_saved:true})));
      }).catch(()=>{});
  }, []);

  const savePlaces = async (list: Place[]) => {
    const unsaved = list.filter(p => !p._saved);
    if (!unsaved.length) return;
    try {
      const res = await fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:`INSERT INTO places (name,address,lat,lng) VALUES ${unsaved.map(p=>`('${p.name.replace(/'/g,"''")}','${(p.address||'').replace(/'/g,"''")}',${p.lat??'NULL'},${p.lng??'NULL'})`).join(',')} RETURNING id`})});
      const d = await res.json();
      if (d.rows) {
        let ri = 0;
        setPlaces(prev => prev.map(p => {
          if (p._saved) return p;
          return d.rows[ri] ? {...p, id: d.rows[ri++].id, _saved: true} : {...p, _saved: true};
        }));
      }
    } catch(e) {}
  };

  const geocode = async (q: string) => {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.lat) return {lat:d.lat,lng:d.lng,displayName:d.displayName};
    } catch(e){}
    return null;
  };

  const addPlace = async () => {
    const name = (document.getElementById('manualName') as HTMLInputElement)?.value?.trim();
    const address = (document.getElementById('manualAddress') as HTMLInputElement)?.value?.trim();
    if (!name || !address) { showToast('Enter both name and address'); return; }
    const loc = await geocode(address);
    const p: Place = {id:Date.now(),name,address,lat:loc?.lat??null,lng:loc?.lng??null,_saved:false};
    setPlaces(prev => [...prev, p]);
    savePlaces([...places, p]);
    (document.getElementById('manualName') as HTMLInputElement)!.value = '';
    (document.getElementById('manualAddress') as HTMLInputElement)!.value = '';
    showToast(`Added "${name}"`);
  };

  const importGmaps = async () => {
    const lines = gmapsInput.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    if (!lines.length) { showToast('Paste places first'); return; }
    setImporting(true);
    showToast(`Importing ${lines.length} places...`);
    const newPlaces: Place[] = [];
    for (let i=0; i<lines.length; i++) {
      const loc = await geocode(lines[i]);
      newPlaces.push({id:Date.now()+Math.random(),name:lines[i],address:loc?.displayName||lines[i],lat:loc?.lat??null,lng:loc?.lng??null,_saved:false});
      if (i%5===0) await new Promise(r=>setTimeout(r,100));
    }
    const all = [...places, ...newPlaces];
    setPlaces(all); setGmapsInput(''); setImporting(false);
    savePlaces(all);
    showToast(`Imported ${newPlaces.length} places`);
  };

  const removePlace = async (id: number) => {
    setPlaces(prev => prev.filter(p=>p.id!==id));
    if (Number.isInteger(id)) {
      await fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`DELETE FROM places WHERE id = ${id}`})}).catch(()=>{});
    }
  };

  const clearAll = async () => {
    if (!places.length) return;
    if (confirm('Clear all places?')) {
      setPlaces([]); setDayRoutes([]);
      await fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'DELETE FROM places'})}).catch(()=>{});
    }
  };

  const toggleWeek = (idx: number) => {
    setSelectedWeeks(prev => prev.map((v,i)=>i===idx?!v:v));
  };

  const saveDeparture = async () => {
    const input = departureInput.trim();
    if (!input) { showToast('Enter a place name or address'); return; }
    const loc = await geocode(input);
    if (loc) {
      setDeparture({name: input, address: loc.displayName, lat: loc.lat, lng: loc.lng, type: departure.type});
      setShowDepartureForm(false);
      setDepartureInput('');
      showToast(`Departure: ${input}`);
    } else {
      showToast('Could not find that location');
    }
  };

  const clearDeparture = () => {
    setDeparture({name:'',address:'',lat:null,lng:null,type:'home'});
  };

  const generateGmapsUrl = (places: Place[]) => {
    const valid = places.filter(p=>p.lat && p.lng);
    if (valid.length < 1) return '';
    const coords = valid.map(p => `${p.lat},${p.lng}`);
    // Prepend departure if set
    if (departure.lat && departure.lng) {
      coords.unshift(`${departure.lat},${departure.lng}`);
    }
    if (coords.length < 2) return '';
    return `https://www.google.com/maps/dir/${coords.join('/')}`;
  };

  const generatePlan = () => {
    const geocoded = places.filter(p=>p.lat!==null);
    if (!geocoded.length) { showToast('No places with locations'); return; }
    if (geocoded.length < placesPerMonth) { showToast(`Only ${geocoded.length} available`); return; }

    // Select places
    let selected = geocoded.slice(0, placesPerMonth);
    if (optimize==='nearest') {
      const ordered = [selected[0]];
      const rest = selected.slice(1);
      while (rest.length) {
        const last = ordered[ordered.length-1];
        let idx = 0, min = Infinity;
        rest.forEach((p,i)=>{const d=Math.hypot(p.lat!-last.lat!,p.lng!-last.lng!);if(d<min){min=d;idx=i;}});
        ordered.push(rest.splice(idx,1)[0]);
      }
      selected = ordered;
    }

    // Build available workdays from selected weeks
    const start = new Date(startDate+'T00:00:00');
    const daysInMonth = new Date(start.getFullYear(), start.getMonth()+1, 0).getDate();
    const workdays: Date[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d);
      const dayOfWeek = date.getDay();
      // Determine which week of the month this day belongs to (0-indexed)
      const weekOfMonth = Math.floor((d - 1) / 7);
      if (!selectedWeeks[weekOfMonth]) continue;
      if (weekdaysOnly && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
      workdays.push(date);
    }

    if (!workdays.length) { showToast('No workdays in selected weeks'); return; }

    // Distribute places across workdays
    const perDay = Math.ceil(selected.length / workdays.length);
    const routes: DayRoute[] = [];
    let idx = 0;

    for (const date of workdays) {
      if (idx >= selected.length) break;
      const dayPlaces = selected.slice(idx, idx + perDay);
      idx += perDay;
      const gmapsUrl = generateGmapsUrl(dayPlaces);
      routes.push({ date, places: dayPlaces, gmapsUrl });
    }

    setDayRoutes(routes);
    setAnalysis('');

    // Save route to DB
    const stats = {
      total: selected.length,
      days: routes.length,
      startDate: routes[0]?.date?.toISOString(),
      endDate: routes[routes.length-1]?.date?.toISOString(),
    };
    const flat = routes.flatMap(d => d.places.map(p => ({date:d.date.toISOString(),place:p})));
    fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:`INSERT INTO routes (name,schedule,stats) VALUES ('Monthly Route','${JSON.stringify(flat).replace(/'/g,"''")}'::jsonb,'${JSON.stringify(stats).replace(/'/g,"''")}'::jsonb) RETURNING id`})})
      .then(r=>r.json()).then(d=>{if(d.rows?.[0]) setRouteId(d.rows[0].id)}).catch(()=>{});

    setSection('results-section');
  };

  const analyzeWithAI = async () => {
    if (!dayRoutes.length) { showToast('Generate a route first'); return; }
    setAnalyzing(true);
    setAnalysis('Analyzing your monthly route plan...');
    try {
      const payload = dayRoutes.map(d => ({
        date: d.date.toISOString().split('T')[0],
        places: d.places.map(p => p.name),
        route: d.gmapsUrl,
      }));
      const r = await fetch('/api/deepseek', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({route:payload,analysisType:'optimize'})});
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || 'No analysis returned.';
      setAnalysis(text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>'));

      // Save analysis to DB
      if (routeId) {
        fetch('/api/neon', {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query:`INSERT INTO route_analyses (route_id,analysis) VALUES (${routeId},'${text.replace(/'/g,"''")}')`})}).catch(()=>{});
      }
    } catch(e) { setAnalysis('Failed to analyze.'); }
    setAnalyzing(false);
  };

  const exportPlan = () => {
    if (!dayRoutes.length) return;
    let csv = 'Date,Places,Google Maps Link\n';
    dayRoutes.forEach(d => {
      csv += `${d.date.toISOString().split('T')[0]},"${d.places.map(p=>p.name).join('; ')}",${d.gmapsUrl}\n`;
    });
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='route-plan.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as CSV');
  };

  const geocodedPlaces = places.filter(p=>p.lat!==null);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen?' open':''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6366f1"/><path d="M9 16L14 21L23 11" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>RoutePlan</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {sections.map(s => (
            <a key={s} className={`nav-item${section===s?' active':''}${s==='results-section'&&!dayRoutes.length?' disabled':''}`} onClick={()=>{if(s!=='results-section'||dayRoutes.length)nav(s)}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {s==='import-section'&&<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}
                {s==='places-section'&&<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>}
                {s==='planner-section'&&<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                {s==='results-section'&&<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>}
              </svg>
              {s.replace('-section','').replace(/^\w/,c=>c.toUpperCase())}
              {s==='places-section'&&<span className="nav-badge">{places.length}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer"><div className="usage-label">Free Plan</div><div className="usage-count">Unlimited places</div></div>
      </aside>
      <div className={`overlay${sidebarOpen?' active':''}`} onClick={()=>setSidebarOpen(false)} />

      <main className="main-content">
        <header className="top-bar">
          <button className="mobile-menu-btn" onClick={()=>setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="page-title"><h1>{pageTitles[section]?.title||''}</h1><p>{pageTitles[section]?.subtitle||''}</p></div>
          <div className="top-bar-actions">
            <button className="btn-icon" onClick={clearAll} title="Clear all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </div>
        </header>

        <div className="content-area">
          {/* Import Section */}
          <section className={`content-section${section==='import-section'?' active':''}`}>
            <div className="cards-grid">
              <div className="card card-highlight">
                <div className="card-header">
                  <div className="card-icon gmaps-icon"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#4285f4"/></svg></div>
                  <div><h2>Google Maps Import</h2><p>Copy places from your lists</p></div>
                </div>
                <div className="card-body">
                  <div className="import-steps">{['Open your Maps list','Scroll to load all','Select & copy all names','Paste below & import'].map((s,i)=>(<div key={i} className="step"><span className="step-num">{i+1}</span><span>{s}</span></div>))}</div>
                  <textarea rows={6} placeholder="Paste place names here, one per line&#10;Central Park, New York&#10;..." value={gmapsInput} onChange={e=>setGmapsInput(e.target.value)} />
                  <div className="import-footer">
                    <button className="btn btn-primary" disabled={!gmapsInput.trim()||importing} onClick={importGmaps}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      {importing ? 'Importing...' : 'Import Places'}
                    </button>
                    <span className="char-count">{gmapsInput.split('\n').filter(l=>l.trim().length>0).length} line(s)</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-icon manual-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                  <div><h2>Manual Entry</h2><p>Add one at a time</p></div>
                </div>
                <div className="card-body">
                  <div className="input-group"><label>Place Name</label><input id="manualName" type="text" placeholder="e.g. Coffee House" /></div>
                  <div className="input-group"><label>Address</label><input id="manualAddress" type="text" placeholder="e.g. 123 Main St, NY" /></div>
                  <button className="btn btn-outline" onClick={addPlace}>Add Place</button>
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-icon csv-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                  <div><h2>Power Import</h2><p>Script or CSV</p></div>
                </div>
                <div className="card-body">
                  <div className="tabs">
                    <button className="tab active" onClick={e=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));(e.target as HTMLElement).classList.add('active');(document.getElementById('tab-script') as HTMLElement).classList.add('active')}}>Script</button>
                    <button className="tab" onClick={e=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));(e.target as HTMLElement).classList.add('active');(document.getElementById('tab-csv') as HTMLElement).classList.add('active')}}>CSV</button>
                  </div>
                  <div id="tab-script" className="tab-content active">
                    <p style={{fontSize:'0.875rem',marginBottom:8,color:'#475569'}}><strong>Run in Console on your Maps list:</strong></p>
                    <div className="code-block">
                      <pre>{`var s=['[role="heading"][aria-level="3"]','.fontHeadlineSmall','.section-result-title','h3'].join(',');var n=[];document.querySelectorAll(s).forEach(function(e){var t=e.textContent.trim();if(t.length>2&&n.indexOf(t)===-1)n.push(t)});console.log(n.length+' place(s)');copy(n.join('\\n'));`}</pre>
                      <button className="btn-sm" onClick={e=>{navigator.clipboard.writeText(`var s=['[role="heading"][aria-level="3"]','.fontHeadlineSmall','.section-result-title','h3'].join(',');var n=[];document.querySelectorAll(s).forEach(function(e){var t=e.textContent.trim();if(t.length>2&&n.indexOf(t)===-1)n.push(t)});console.log(n.length+' place(s)');copy(n.join('\\n'));`);(e.target as HTMLElement).textContent='Copied!';setTimeout(()=>(e.target as HTMLElement).textContent='Copy',2000)}}>Copy</button>
                    </div>
                  </div>
                  <div id="tab-csv" className="tab-content">
                    <p style={{fontSize:'0.875rem',marginBottom:8,color:'#475569'}}>CSV (name, address):</p>
                    <textarea rows={4} id="csvInput" placeholder="Cafe A, 123 Main St, NYC" />
                    <button className="btn btn-outline" style={{marginTop:8}} onClick={async()=>{
                      const ta = document.getElementById('csvInput') as HTMLTextAreaElement;
                      const lines = ta.value.split('\n').filter(l=>l.trim());
                      const newPlaces: Place[] = [];
                      for (const line of lines) {
                        const [name,...addr] = line.split(',').map(s=>s.trim());
                        if (name && addr.length) {
                          const loc = await geocode(addr.join(', '));
                          newPlaces.push({id:Date.now()+Math.random(),name,address:addr.join(', '),lat:loc?.lat??null,lng:loc?.lng??null,_saved:false});
                        }
                      }
                      const all = [...places, ...newPlaces]; setPlaces(all); ta.value = ''; savePlaces(all);
                      showToast(`Imported ${newPlaces.length} places`);
                    }}>Import CSV</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Places Section */}
          <section className={`content-section${section==='places-section'?' active':''}`}>
            <div className="section-header">
              <div className="search-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search places..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
              </div>
              <div className="places-stats"><span className="stat"><strong>{places.length}</strong> total</span><span className="stat"><strong>{geocodedPlaces.length}</strong> mapped</span></div>
            </div>
            <div className="places-list">
              {places.length===0 ? (
                <div className="empty-state"><p>No places yet</p><span>Import or add places to get started</span></div>
              ) : places.filter(p=>p.name.toLowerCase().includes(searchQuery.toLowerCase())||p.address.toLowerCase().includes(searchQuery.toLowerCase())).map((p,i)=>(
                <div key={p.id} className="place-item">
                  <span className="place-number">{i+1}</span>
                  <div className="place-info">
                    <div className="place-name" title={p.name}>{p.name.length>45?p.name.slice(0,42)+'...':p.name}</div>
                    <div className="place-address" title={p.address}>{p.address.length>55?p.address.slice(0,52)+'...':p.address}</div>
                  </div>
                  <span className={`place-status ${p.lat?'mapped':'unmapped'}`}>{p.lat?'Mapped':'Not found'}</span>
                  <button className="place-remove" onClick={()=>removePlace(p.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Planner Section */}
          <section className={`content-section${section==='planner-section'?' active':''}`}>
            <div className="planner-card">
              <div className="planner-header"><h2>Configure Your Monthly Plan</h2><p>Set preferences and we'll generate daily routes with Google Maps links</p></div>
              <div className="planner-form">
                <div className="form-row" style={{gridTemplateColumns:'1fr 1fr'}}>
                  <div className="form-group">
                    <label>Places to visit this month</label>
                    <div className="input-with-control">
                      <input type="range" min="1" max="50" value={placesPerMonth} onChange={e=>setPlacesPerMonth(Number(e.target.value))} />
                      <input type="number" min="1" value={placesPerMonth} onChange={e=>setPlacesPerMonth(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Start month</label>
                    <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                  </div>
                </div>

                <div className="form-row" style={{gridTemplateColumns:'1fr 1fr',marginTop:8}}>
                  <div className="form-group">
                    <label>Active weeks <span style={{fontWeight:400,color:'var(--text-tertiary)'}}>(skip weeks you're busy)</span></label>
                    <div className="week-toggles">
                      {weekNames.map((name,i)=>(
                        <label key={i} className={`week-chip${selectedWeeks[i]?' active':''}`}>
                          <input type="checkbox" checked={selectedWeeks[i]} onChange={()=>toggleWeek(i)} />
                          {name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Working days</label>
                    <div className="day-toggles">
                      <label className={`day-chip${weekdaysOnly?' active':''}`} onClick={()=>setWeekdaysOnly(true)}>
                        <input type="radio" name="daytype" checked={weekdaysOnly} onChange={()=>{}} /> Mon-Fri
                      </label>
                      <label className={`day-chip${!weekdaysOnly?' active':''}`} onClick={()=>setWeekdaysOnly(false)}>
                        <input type="radio" name="daytype" checked={!weekdaysOnly} onChange={()=>{}} /> All days
                      </label>
                    </div>
                  </div>
                </div>

                <div className="form-row" style={{gridTemplateColumns:'1fr',marginTop:8}}>
                  <div className="form-group">
                    <label>Route optimization</label>
                    <select value={optimize} onChange={e=>setOptimize(e.target.value)}>
                      <option value="nearest">Nearest neighbor (shorter routes)</option>
                      <option value="list">Keep list order</option>
                    </select>
                  </div>
                </div>

                {/* Departure Location */}
                <div className="departure-section" style={{marginTop:16}}>
                  <div className="departure-header">
                    <label style={{fontSize:'0.813rem',fontWeight:500,color:'var(--text-secondary)'}}>Departure location</label>
                    <span style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>Starting point for every daily route</span>
                  </div>
                  {!showDepartureForm && !departure.lat ? (
                    <button className="btn btn-outline" style={{marginTop:8}} onClick={()=>setShowDepartureForm(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      Set departure location
                    </button>
                  ) : showDepartureForm ? (
                    <div className="departure-form" style={{marginTop:8}}>
                      <div className="input-group">
                        <label>Place name or address</label>
                        <input type="text" placeholder="e.g. Home, 123 Main St, Bangkok" value={departureInput} onChange={e=>setDepartureInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')saveDeparture()}} />
                      </div>
                      <div className="departure-types" style={{marginBottom:12}}>
                        {[
                          {value:'home',label:'🏠 Home'},
                          {value:'workplace',label:'💼 Workplace'},
                          {value:'other',label:'📍 Other'},
                        ].map(t => (
                          <label key={t.value} className={`week-chip${departure.type===t.value?' active':''}`} onClick={()=>setDeparture(prev=>({...prev,type:t.value}))}>
                            <input type="radio" name="dtype" checked={departure.type===t.value} onChange={()=>{}} /> {t.label}
                          </label>
                        ))}
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-primary" onClick={saveDeparture}>Set Departure</button>
                        <button className="btn btn-outline" onClick={()=>{setShowDepartureForm(false);setDepartureInput('')}}>Cancel</button>
                      </div>
                    </div>
                  ) : departure.lat && (
                    <div className="departure-badge" style={{marginTop:8}}>
                      <span className="departure-icon">
                        {departure.type==='home'?'🏠':departure.type==='workplace'?'💼':'📍'}
                      </span>
                      <span className="departure-text">{departure.name || departure.address}</span>
                      <button className="btn-icon" onClick={clearDeparture} title="Remove" style={{marginLeft:'auto',padding:4}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="planner-actions" style={{marginTop:24}}>
                  <button className="btn btn-primary btn-lg" onClick={generatePlan}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Generate Daily Routes
                  </button>
                  <p className="hint">{geocodedPlaces.length} place{geocodedPlaces.length!==1?'s':''} available · {selectedWeeks.filter(Boolean).length} week{selectedWeeks.filter(Boolean).length!==1?'s':''} active</p>
                </div>
              </div>
            </div>
          </section>

          {/* Results Section */}
          <section className={`content-section${section==='results-section'?' active':''}`}>
            {dayRoutes.length>0 && (
              <>
                <div className="results-header">
                  <div className="results-summary">
                    <div className="summary-stat"><div className="value">{dayRoutes.reduce((s,d)=>s+d.places.length,0)}</div><div className="label">Places</div></div>
                    <div className="summary-stat"><div className="value">{dayRoutes.length}</div><div className="label">Visit days</div></div>
                    <div className="summary-stat"><div className="value">{dayRoutes[0]?.date?.toLocaleDateString('en',{month:'short',day:'numeric'})}</div><div className="label">Starts</div></div>
                    <div className="summary-stat"><div className="value">{dayRoutes[dayRoutes.length-1]?.date?.toLocaleDateString('en',{month:'short',day:'numeric'})}</div><div className="label">Ends</div></div>
                  </div>
                  <div className="results-actions">
                    <button className="btn btn-primary" disabled={analyzing} onClick={analyzeWithAI}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      {analyzing ? 'Analyzing...' : 'AI Analysis'}
                    </button>
                    <button className="btn btn-outline" onClick={exportPlan}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Export
                    </button>
                    <button className="btn btn-primary" onClick={()=>nav('planner-section')}>New Plan</button>
                  </div>
                </div>

                <div>
                  <div className="map-wrapper" style={{height:400,marginBottom:24}}>
                    <MapComponent coords={scheduleCoords} places={allScheduleItems.map(s=>s.place)} dates={allScheduleItems.map(s=>s.date.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'}))} />
                  </div>
                </div>

                <div className="day-routes">
                  {dayRoutes.map((dr, di) => (
                    <div key={di} className="day-route-card">
                      <div className="day-route-header">
                        <div className="day-route-title">
                          <span className="day-route-date">{dr.date.toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})}</span>
                          <span className="day-route-count">{dr.places.length} place{dr.places.length!==1?'s':''} · {departure.lat ? 'From '+departure.name : 'No departure set'}</span>
                        </div>
                        {dr.gmapsUrl && (
                          <a href={dr.gmapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            Open in Google Maps
                          </a>
                        )}
                      </div>
                      <div className="day-route-places">
                        {departure.lat && (
                          <div className="day-route-place departure-stop">
                            <span className="route-stop departure">D</span>
                            <div className="place-info">
                              <div className="place-name" style={{fontSize:'0.875rem',color:'var(--accent-primary)'}}>
                                {departure.name || departure.address} <span style={{fontWeight:400,color:'var(--text-tertiary)',fontSize:'0.75rem'}}>({departure.type})</span>
                              </div>
                              <div className="place-address" style={{fontSize:'0.75rem'}}>{departure.address}</div>
                            </div>
                            <span className="place-status mapped" style={{fontSize:'0.7rem'}}>Departure</span>
                          </div>
                        )}
                        {dr.places.map((p, pi) => (
                          <div key={pi} className="day-route-place">
                            <span className="route-stop">{pi+1}</span>
                            <div className="place-info">
                              <div className="place-name" style={{fontSize:'0.875rem'}} title={p.name}>{p.name.length>50?p.name.slice(0,47)+'...':p.name}</div>
                              <div className="place-address" style={{fontSize:'0.75rem'}}>{p.address?.length>60?p.address.slice(0,57)+'...':p.address}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {analysis && (
                  <div className="analysis-section" style={{marginTop:24}}>
                    <div className="analysis-header"><h3>AI Route Analysis</h3></div>
                    <div className="analysis-content" dangerouslySetInnerHTML={{__html:analysis}} />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      {toast.message && <div className="toast" key={toast.key}>{toast.message}</div>}
    </div>
  );
}
