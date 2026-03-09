export async function onRequestPost(context) {
    const headers = { 'Content-Type': 'application/json' };

    try {
        const { text, voice_id, speed, emotion } = await context.request.json();
        const FAL_KEY = context.env.FAL_KEY;

        if (!text || text.trim().length === 0) {
            return new Response(JSON.stringify({ error: 'No text provided' }), {
                status: 400, headers,
            });
        }

        const body = {
            prompt: text,
            voice_setting: {
                voice_id: voice_id || 'Wise_Woman',
                speed: speed || 1.0,
                emotion: emotion || 'neutral',
            },
            audio_setting: {
                format: 'mp3',
                sample_rate: 32000,
            },
        };

        // Submit to fal.ai queue
        const res = await fetch('https://queue.fal.run/fal-ai/minimax/speech-2.8-turbo', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            return new Response(JSON.stringify({ error: `fal.ai error: ${res.status}`, details: err }), {
                status: 502, headers,
            });
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), { headers });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers,
        });
    }
}
