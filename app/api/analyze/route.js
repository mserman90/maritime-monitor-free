/**
 * Maritime Traffic Monitor - AI Analysis Route
 *
 * AI Provider Strategy (automatic fallback):
 *  1. If geminiApiKey is provided  -> Google Gemini 2.0 Flash (best quality)
 *  2. If no key provided            -> Pollinations.AI free keyless vision API
 *
 * Pollinations.AI endpoint: https://text.pollinations.ai/openai
 * (OpenAI-compatible, no signup, no API key required)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const STAC_API = 'https://earth-search.aws.element84.com/v1';
const COLLECTION = 'sentinel-2-l2a';

// Free fallback: Pollinations.AI OpenAI-compatible endpoint (keyless)
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_MODEL = 'openai'; // supports vision; alternatives: 'claude', 'gemini', 'deepseek'

// ---------------------------------------------------------------------------
// STAC helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(lat, lon, imageParts, imageInfos) {
  const imageDescriptions = imageInfos
    .slice(0, imageParts.length)
    .map((info, i) => `Image ${i + 1}: Date=${info.date}, Cloud=${info.cloud}%, ID=${info.id}`)
    .join('\n');

  return `You are a maritime surveillance analyst examining Sentinel-2 satellite images of the area around coordinates (${lat}, ${lon}).
Each image covers approximately a 20x20 km area at ~10m/pixel resolution.
Ships appear as bright specks against dark water, often with V-shaped wakes.
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
}

// ---------------------------------------------------------------------------
// AI provider 1: Google Gemini (when API key is provided)
// ---------------------------------------------------------------------------

async function analyzeWithGemini(geminiApiKey, imageParts, imageInfos, lat, lon) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildPrompt(lat, lon, imageParts, imageInfos);

  // Gemini uses inlineData format
  const geminiImageParts = imageParts.map(img => ({
    inlineData: { data: img.data, mimeType: img.mimeType },
  }));

  const result = await model.generateContent([prompt, ...geminiImageParts]);
  return result.response.text();
}

// ---------------------------------------------------------------------------
// AI provider 2: Pollinations.AI (free, keyless fallback)
// ---------------------------------------------------------------------------

async function analyzeWithPollinations(imageParts, imageInfos, lat, lon) {
  const prompt = buildPrompt(lat, lon, imageParts, imageInfos);

  // OpenAI vision format: image_url with base64 data URI
  const contentParts = [{ type: 'text', text: prompt }];
  for (const img of imageParts) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    });
  }

  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: POLLINATIONS_MODEL,
      messages: [{ role: 'user', content: contentParts }],
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pollinations.AI error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function POST(request) {
  try {
    const body = await request.json();
    const { lat, lon, dateFrom, dateTo, geminiApiKey } = body;

    if (!lat || !lon) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const dFrom = dateFrom || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dTo   = dateTo   || new Date().toISOString().slice(0, 10);

    // Decide which AI provider to use
    const useGemini = !!(geminiApiKey && geminiApiKey.trim().length > 0);
    const aiProvider = useGemini
      ? 'Google Gemini 2.0 Flash'
      : 'Pollinations.AI (free, no key required)';

    // 1. Fetch STAC satellite items
    const items = await fetchSTACItems(lat, lon, dFrom, dTo);
    if (items.length === 0) {
      return Response.json(
        { error: 'No cloud-free Sentinel-2 images found for this location and date range.' },
        { status: 404 }
      );
    }

    // 2. Collect thumbnail URLs
    const imageInfos = [];
    for (const item of items.slice(0, 4)) {
      const assets = item.assets;
      const thumbUrl =
        assets?.thumbnail?.href ||
        assets?.rendered_preview?.href ||
        assets?.visual?.href;
      if (thumbUrl) {
        imageInfos.push({
          date:  item.properties?.datetime?.slice(0, 10),
          cloud: item.properties?.['eo:cloud_cover']?.toFixed(1),
          id:    item.id,
          url:   thumbUrl,
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
        imageParts.push({ data: b64, mimeType });
      } catch (e) {
        console.warn('Failed to fetch image:', info.url, e.message);
      }
    }

    if (imageParts.length === 0) {
      return Response.json({ error: 'Could not download any satellite images.' }, { status: 500 });
    }

    // 4. Analyze with selected AI provider
    let text;
    if (useGemini) {
      text = await analyzeWithGemini(geminiApiKey.trim(), imageParts, imageInfos, lat, lon);
    } else {
      text = await analyzeWithPollinations(imageParts, imageInfos, lat, lon);
    }

    // 5. Parse structured JSON block from response
    let parsed = null;
    const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1]); } catch (e) { /* ignore */ }
    }

    return Response.json({
      success: true,
      location:       { lat, lon },
      dateRange:      { from: dFrom, to: dTo },
      aiProvider,
      imagesAnalyzed: imageInfos.slice(0, imageParts.length),
      analysis:       text,
      parsed,
    });

  } catch (err) {
    console.error('Analysis error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
