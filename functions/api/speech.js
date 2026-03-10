export async function onRequestPost(context) {
    const headers = { 'Content-Type': 'application/json' };

    try {
        const { text, voice_id, speed, pitch, emotion } = await context.request.json();
        const FAL_KEY = context.env.FAL_KEY;

        if (!text || text.trim().length === 0) {
            return new Response(JSON.stringify({ error: 'No text provided' }), {
                status: 400, headers,
            });
        }

        const voiceSetting = {
            voice_id: voice_id || 'Wise_Woman',
            speed: speed || 1.0,
            emotion: emotion || 'neutral',
        };
        if (pitch !== undefined && pitch !== 0) {
            voiceSetting.pitch = pitch;
        }

        const audioSetting = {
            format: 'mp3',
            sample_rate: 32000,
        };

        const chunks = splitText(text.trim());

        // Add spoken part cues for multi-chunk audio
        if (chunks.length > 1) {
            for (let i = 0; i < chunks.length; i++) {
                chunks[i] = `Part ${i + 1}. ${chunks[i]}`;
            }
        }

        // Submit all chunks to fal.ai queue
        const submissions = await Promise.all(chunks.map(async (chunk) => {
            const res = await fetch('https://queue.fal.run/fal-ai/minimax/speech-2.8-turbo', {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${FAL_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: chunk,
                    voice_setting: voiceSetting,
                    audio_setting: audioSetting,
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`fal.ai error: ${res.status} - ${err}`);
            }

            return res.json();
        }));

        // Single chunk — return as before for backward compat
        if (submissions.length === 1) {
            return new Response(JSON.stringify(submissions[0]), { headers });
        }

        // Multiple chunks — return all ids/urls
        return new Response(JSON.stringify({
            chunked: true,
            total_chunks: submissions.length,
            request_ids: submissions.map(s => s.request_id || null),
            audio_urls: submissions.map(s => s.audio?.url || null),
        }), { headers });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers,
        });
    }
}

function splitText(text, maxLen = 9500) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        let splitAt = -1;

        // Try sentence boundary (.!?\n followed by whitespace)
        for (let i = maxLen; i > maxLen * 0.5; i--) {
            if ('.!?\n'.includes(remaining[i]) &&
                (i + 1 >= remaining.length || ' \n\t'.includes(remaining[i + 1]))) {
                splitAt = i + 1;
                break;
            }
        }

        // Fall back to word boundary
        if (splitAt === -1) {
            for (let i = maxLen; i > maxLen * 0.5; i--) {
                if (' \t\n'.includes(remaining[i])) {
                    splitAt = i + 1;
                    break;
                }
            }
        }

        // Last resort
        if (splitAt === -1) splitAt = maxLen;

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    return chunks;
}
