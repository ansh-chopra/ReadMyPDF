export async function onRequestGet(context) {
    const headers = { 'Content-Type': 'application/json' };

    try {
        const url = new URL(context.request.url);
        const requestId = url.searchParams.get('id');
        const FAL_KEY = context.env.FAL_KEY;

        if (!requestId) {
            return new Response(JSON.stringify({ error: 'Missing request ID' }), {
                status: 400, headers,
            });
        }

        // Check status
        const statusRes = await fetch(
            `https://queue.fal.run/fal-ai/minimax/speech-2.8-turbo/requests/${requestId}/status`,
            {
                headers: { 'Authorization': `Key ${FAL_KEY}` },
            }
        );

        if (!statusRes.ok) {
            return new Response(JSON.stringify({ error: `Status check failed: ${statusRes.status}` }), {
                status: 502, headers,
            });
        }

        const status = await statusRes.json();

        if (status.status === 'COMPLETED') {
            // Fetch the result
            const resultRes = await fetch(
                `https://queue.fal.run/fal-ai/minimax/speech-2.8-turbo/requests/${requestId}`,
                {
                    headers: { 'Authorization': `Key ${FAL_KEY}` },
                }
            );

            if (!resultRes.ok) {
                return new Response(JSON.stringify({ error: 'Failed to fetch result' }), {
                    status: 502, headers,
                });
            }

            const result = await resultRes.json();
            return new Response(JSON.stringify({ status: 'COMPLETED', result }), { headers });
        }

        return new Response(JSON.stringify({ status: status.status }), { headers });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers,
        });
    }
}
