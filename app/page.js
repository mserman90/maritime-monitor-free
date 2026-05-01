'use client';
import { useState } from 'react';

const PRESET_LOCATIONS = [
  { name: 'Suez Canal', lat: 30.0, lon: 32.55 },
  { name: 'Strait of Gibraltar', lat: 35.95, lon: -5.45 },
  { name: 'Strait of Hormuz', lat: 26.6, lon: 56.5 },
  { name: 'Singapore Strait', lat: 1.25, lon: 103.8 },
  { name: 'English Channel', lat: 51.0, lon: 1.5 },
  { name: 'Bosphorus Strait', lat: 41.12, lon: 29.08 },
  { name: 'Istanbul', lat: 41.0, lon: 28.95 },
  { name: 'Port of Rotterdam', lat: 51.95, lon: 4.1 },
];

export default function Home() {
  const [geminiKey, setGeminiKey] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  function selectPreset(loc) {
    setLat(String(loc.lat));
    setLon(String(loc.lon));
  }

  async function handleAnalyze(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setStep('Fetching Sentinel-2 satellite images from Element84 STAC...');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          dateFrom: dateFrom || ninetyDaysAgo,
          dateTo: dateTo || today,
          geminiApiKey: geminiKey,
        }),
      });
      setStep('Analyzing images with Gemini AI...');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStep('');
    }
  }

  const s = {
    page: { minHeight: '100vh', padding: '24px', maxWidth: '1000px', margin: '0 auto' },
    header: { textAlign: 'center', marginBottom: '32px' },
    h1: { fontSize: '2rem', fontWeight: 700, color: '#60a5fa', marginBottom: '8px' },
    sub: { color: '#94a3b8', fontSize: '0.95rem' },
    card: { background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px', marginBottom: '20px' },
    label: { display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 },
    input: { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '10px 14px', color: '#e2e8f0', fontSize: '0.95rem', boxSizing: 'border-box' },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
    btn: { width: '100%', padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '8px' },
    btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
    presets: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' },
    presetBtn: { padding: '6px 12px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #1e40af', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' },
    badge: (color) => ({ display: 'inline-block', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, background: color === 'red' ? '#7f1d1d' : color === 'green' ? '#14532d' : '#1e3a5f', color: color === 'red' ? '#fca5a5' : color === 'green' ? '#86efac' : '#93c5fd' }),
    imageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' },
    imgCard: { background: '#1f2937', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151' },
    imgMeta: { padding: '8px', fontSize: '0.75rem', color: '#94a3b8' },
    pre: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.85rem', color: '#cbd5e1', maxHeight: '500px', overflowY: 'auto', marginTop: '12px' },
    err: { background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '8px', padding: '16px', color: '#fca5a5', marginBottom: '16px' },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Maritime Traffic Monitor</h1>
        <p style={s.sub}>Sentinel-2 satellite imagery + Google Gemini AI &mdash; 100% free open APIs</p>
      </div>

      <div style={s.card}>
        <h2 style={{ color: '#e2e8f0', marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>Configuration</h2>
        <div style={{ marginBottom: '16px' }}>
          <label style={s.label}>Google Gemini API Key <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            style={s.input}
            type="password"
            placeholder="AIza..."
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
          />
          <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '4px' }}>
            Free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>aistudio.google.com</a> &mdash; stored only in your browser
          </p>
        </div>

        <label style={s.label}>Quick select location:</label>
        <div style={s.presets}>
          {PRESET_LOCATIONS.map(loc => (
            <button key={loc.name} style={s.presetBtn} onClick={() => selectPreset(loc)}>
              {loc.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleAnalyze}>
          <div style={s.row}>
            <div>
              <label style={s.label}>Latitude</label>
              <input style={s.input} type="number" step="0.0001" placeholder="30.0" value={lat} onChange={e => setLat(e.target.value)} required />
            </div>
            <div>
              <label style={s.label}>Longitude</label>
              <input style={s.input} type="number" step="0.0001" placeholder="32.55" value={lon} onChange={e => setLon(e.target.value)} required />
            </div>
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Date From (optional)</label>
              <input style={s.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Date To (optional)</label>
              <input style={s.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          <button
            type="submit"
            style={{ ...s.btn, ...(loading || !geminiKey ? s.btnDisabled : {}) }}
            disabled={loading || !geminiKey}
          >
            {loading ? step || 'Analyzing...' : 'Analyze Maritime Traffic'}
          </button>
        </form>
      </div>

      {error && <div style={s.err}><strong>Error:</strong> {error}</div>}

      {result && (
        <div>
          <div style={s.card}>
            <h2 style={{ color: '#e2e8f0', marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>Analysis Summary</h2>
            {result.parsed && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <span style={s.badge(result.parsed.anomaly_detected ? 'red' : 'green')}>
                  {result.parsed.anomaly_detected ? 'ANOMALY DETECTED' : 'Normal Activity'}
                </span>
                <span style={s.badge('blue')}>Activity: {result.parsed.activity_level}</span>
                {result.parsed.vessel_count_estimate !== null && (
                  <span style={s.badge('blue')}>~{result.parsed.vessel_count_estimate} vessels</span>
                )}
              </div>
            )}
            {result.parsed?.summary && (
              <p style={{ color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.6 }}>{result.parsed.summary}</p>
            )}
            {result.parsed?.anomaly_description && (
              <p style={{ color: '#fca5a5', marginBottom: '12px' }}><strong>Anomaly:</strong> {result.parsed.anomaly_description}</p>
            )}
            <p style={{ color: '#6b7280', fontSize: '0.8rem' }}>
              Location: ({result.location.lat}, {result.location.lon}) &bull;
              Date range: {result.dateRange.from} to {result.dateRange.to} &bull;
              {result.imagesAnalyzed.length} image(s) analyzed
            </p>
          </div>

          {result.imagesAnalyzed.length > 0 && (
            <div style={s.card}>
              <h2 style={{ color: '#e2e8f0', marginTop: 0, marginBottom: '4px', fontSize: '1.1rem' }}>Satellite Images</h2>
              <div style={s.imageGrid}>
                {result.imagesAnalyzed.map((img, i) => (
                  <div key={i} style={s.imgCard}>
                    <img
                      src={img.url}
                      alt={`Sentinel-2 ${img.date}`}
                      style={{ width: '100%', display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={s.imgMeta}>
                      <div>{img.date}</div>
                      <div>Cloud: {img.cloud}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.card}>
            <h2 style={{ color: '#e2e8f0', marginTop: 0, marginBottom: '4px', fontSize: '1.1rem' }}>Full AI Analysis</h2>
            <pre style={s.pre}>{result.analysis}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
