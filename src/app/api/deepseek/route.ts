import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { route, analysisType = 'optimize' } = await request.json();
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const prompt = analysisType === 'optimize'
      ? 'Analyze this monthly route plan and provide optimization suggestions, cluster recommendations, and efficiency improvements.'
      : 'Analyze this list of places and suggest how to group them into efficient daily routes.';

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a route planning assistant. Provide concise, actionable suggestions.' },
          { role: 'user', content: `${prompt}\n\nRoute data:\n${JSON.stringify(route, null, 2)}` },
        ],
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
