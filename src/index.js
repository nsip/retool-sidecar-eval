addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers
    });
  }

  try {
    const body = await request.json();

    // Extract JWT from header
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers });
    }

    // Use SECRET stored as Worker secret
    const SECRET = globalThis.DIRECTUS_TOKEN;

    // Verify JWT manually (HMAC-SHA256)
    const [encodedHeader, encodedPayload, encodedSig] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSig) {
      return new Response(JSON.stringify({ error: "Malformed JWT" }), { status: 400, headers });
    }

    // Recompute signature
    const data = `${encodedHeader}.${encodedPayload}`;
    const sigBuf = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    ).then(key => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));

    // Convert ArrayBuffer to base64url
    const uint8 = new Uint8Array(sigBuf);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const expectedSig = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    if (expectedSig !== encodedSig) {
      return new Response(JSON.stringify({ error: "JWT invalid" }), { status: 403, headers });
    }

    return new Response(JSON.stringify({ jwt_verified: true, payload: encodedPayload }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: err.message }), { status: 500, headers });
  }
}

