export async function onRequestPost(context) {
    const headers = { 'Content-Type': 'application/json' };

    try {
        const { pdf_base64 } = await context.request.json();
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;

        if (!pdf_base64) {
            return new Response(JSON.stringify({ error: 'No PDF data provided' }), {
                status: 400, headers,
            });
        }

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: 'Extract the main body text from this PDF document. Preserve paragraph structure and line breaks. Omit any boilerplate that is not part of the core content — this includes copyright notices, "all rights reserved" lines, publisher info, page numbers, repeated headers/footers, disclaimers, and legal fine print. Return only the clean extracted text — no commentary, no formatting instructions.',
                            },
                            {
                                inlineData: {
                                    mimeType: 'application/pdf',
                                    data: pdf_base64,
                                },
                            },
                        ],
                    }],
                }),
            }
        );

        if (!res.ok) {
            const err = await res.text();
            return new Response(JSON.stringify({ error: `Gemini API error: ${res.status}`, details: err }), {
                status: 502, headers,
            });
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return new Response(JSON.stringify({ text }), { headers });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers,
        });
    }
}
