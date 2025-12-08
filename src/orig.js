addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

// === JWT VERIFICATION (HS256 via WebCrypto) ===
async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");

    if (!headerB64 || !payloadB64 || !signatureB64) {
      return { ok: false, error: "Malformed JWT" };
    }

    const encoder = new TextEncoder();

    // Decode base64url → ArrayBuffer
    const toBuffer = (b64) =>
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      toBuffer(signatureB64),
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!ok) return { ok: false, error: "Invalid signature" };

    const payloadJson = JSON.parse(
      new TextDecoder().decode(toBuffer(payloadB64))
    );

    // Expiry check
    if (payloadJson.exp && Date.now() / 1000 > payloadJson.exp) {
      return { ok: false, error: "Token expired" };
    }

    return { ok: true, payload: payloadJson };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}


// === MAIN HANDLER ===

async function handleRequest(request) {
  // Log execution location for diagnostics
  const colo = request.cf?.colo || 'unknown';
  const country = request.cf?.country || 'unknown';
  console.log(`[GEO] Request from ${country}, executing in colo: ${colo}`);

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

  // === 1) Check JWT ===
  const authHeader = request.headers.get("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing JWT" }), {
      status: 401,
      headers
    });
  }

  const jwtToken = authHeader.slice(7);

  const verify = await verifyJWT(jwtToken, globalThis.DIRECTUS_TOKEN);

  if (!verify.ok) {
    return new Response(JSON.stringify({ error: "JWT invalid", detail: verify.error }), {
      status: 401,
      headers
    });
  }

  // === 2) Read body and validate operation ===
  try {
    const body = await request.json();
    const { operation, id, blob, Assessment, Control_Code } = body;

    // Validate operation type
    if (!operation || !["create", "update"].includes(operation)) {
      return new Response(JSON.stringify({ 
        error: "Missing or invalid operation. Must be 'create' or 'update'" 
      }), {
        status: 400,
        headers
      });
    }

    // === 3) Handle CREATE or UPDATE ===
    let directusResponse;
    
    if (operation === "update") {
      // Validate required fields for update
      if (!id || !blob || !Assessment || Control_Code === undefined) {
        return new Response(JSON.stringify({ 
          error: "Missing required fields for update: id, blob, Assessment, Control_Code" 
        }), {
          status: 400,
          headers
        });
      }

      // PATCH to update existing record
      directusResponse = await fetch(
        `${globalThis.DIRECTUS_BASE}/items/Assessment_Data/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${globalThis.DIRECTUS_TOKEN}`
          },
          body: JSON.stringify({ blob, Assessment, Control_Code })
        }
      );

    } else if (operation === "create") {
      // Validate required fields for create (no id needed)
      if (!blob || !Assessment || Control_Code === undefined) {
        return new Response(JSON.stringify({ 
          error: "Missing required fields for create: blob, Assessment, Control_Code" 
        }), {
          status: 400,
          headers
        });
      }

      // POST to create new record
      directusResponse = await fetch(
        `${globalThis.DIRECTUS_BASE}/items/Assessment_Data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${globalThis.DIRECTUS_TOKEN}`
          },
          body: JSON.stringify({ blob, Assessment, Control_Code })
        }
      );
    }

    const result = await directusResponse.json();

    return new Response(JSON.stringify(result), {
      status: directusResponse.status,
      headers
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers
    });
  }
}
