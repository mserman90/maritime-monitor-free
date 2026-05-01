import { GoogleGenerativeAI } from '@google/generative-ai';

const STAC_API = 'https://earth-search.aws.element84.com/v1';
const COLLECTION = 'sentinel-2-l2a';

async function fetchSTACItems(lat, lon, dateFrom, dateTo, maxItems = 4) {
  const bbox = [
    lon - 0.1, lat - 0.1,
    lon + 0.1, lat + 0.1,
  ];
  const url = `${STAC_API}/search`;
  const body = {
    collections: [COLLECTION],
    bbox,
    datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
    limit: maxItems,
    query: { 'eo:cloud_cover': { lte: 30 } },
    sortby: [{ field: 'datetime', direction: 'desc' }],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`STAC search failed: ${res.status}`);
  const data = await res.json();
  return data.features || [];
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { lat, lon, dateFrom, dateTo, geminiApiKey } = body;

    if (!lat || !lon || !geminiApiKey) {
      return Response.json({ error: 'lat, lon and geminiApiKey are required' }, { status: 400 });
    }

    const dFrom = dateFrom || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dTo = dateTo || new Date().toISOString().slice(0, 10);

    // 1. Fetch STAC items
    const items = await fetchSTACItems(lat, lon, dFrom, dTo);
    if (items.length === 0) {
      return Response.json({ error: 'No cloud-free Sentinel-2 images found for this location and date range.' }, { status: 404 });
    }

    // 2. Get thumbnail URLs (visual TCI band)
    const imageInfos = [];
    for (const item of items.slice(0, 4)) {
      const assets = item.assets;
      // Try thumbnail first, then rendered_preview, then visual
      const thumbUrl = assets?.thumbnail?.href || assets?.rendered_preview?.href || assets?.visual?.href;
      if (thumbUrl) {
        imageInfos.push({
          date: item.properties?.datetime?.slice(0, 10),
          cloud: item.properties?.['eo:cloud_cover']?.toFixed(1),
          id: item.id,
          url: thumbUrl,
        });
      }
    }

    if (imageInfos.length === 0) {
      return Response.json({ error: 'No usable thumbnail images found.' }, { status: 404 });
    }

    // 3. Download images as base64
    const imageParts = [];
    for (const info of imageInfos) {
      try {
        const b64 = await fetchImageAsBase64(info.url);
        const mimeType = info.url.endsWith('.png') ? 'image/png' : 'image/jpeg';
        imageParts.push({ inlineData: { data: b64, mimeType } });
      } catch (e) {
        console.warn('Failed to fetch image:', info.url, e.message);
      }
    }

    if (imageParts.length === 0) {
      return Response.json({ error: 'Could not download any satellite images.' }, { status: 500 });
    }

    // 4. Analyze with Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imageDescriptions = imageInfos.slice(0, imageParts.length)
      .map((info, i) => `Image ${i + 1}: Date=${info.date}, Cloud=${info.cloud}%, ID=${info.id}`)
      .join('\n');

    const prompt = `You are a maritime surveillance analyst examining Sentinel-2 satellite images of the area around coordinates (${lat}, ${lon}).
Each image covers approximately a 20x20 km area at ~10m/pixel resolution. Ships appear as bright specks against dark water, often with V-shaped wakes.

You are analyzing ${imageParts.length} image(s) (newest first):
${imageDescriptions}

For EACH image, report:
- Approximate vessel count and locations
- Port/anchorage activity level (high/moderate/low/none)
- Notable features (wakes, formations, etc.)
- Water body type (open sea, strait, bay, etc.)

After analyzing all images, provide:
- TEMPORAL COMPARISON: How has maritime activity changed?
- ANOMALY DETECTION: Is there anything unusual?

End your response with a JSON block:
\`\`\`json
{
  "anomaly_detected": true or false,
  "anomaly_description": "short description or empty string",
  "vessel_count_estimate": number or null,
  "activity_level": "high|moderate|low|none",
  "summary": "one sentence summary"
}
\`\`\``;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    // Parse JSON block
    let parsed = null;
    const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1]); } catch (e) { /* ignore */ }
    }

    return Response.json({
      success: true,
      location: { lat, lon },
      dateRange: { from: dFrom, to: dTo },
      imagesAnalyzed: imageInfos.slice(0, imageParts.length),
      analysis: text,
      parsed,
    });

  } catch (err) {
    console.error('Analysis error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
