// --- Safe base64url encoding ---
function base64UrlEncodeUint8(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- HMAC SHA256 using WebCrypto ---
async function hmacSHA256(keyStr, msgStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msgStr));
  return new Uint8Array(sig);
}

/* Generate a JWT token synchronously (exported to window for direct access) */
async function generateJWTToken(SECRET, sub, aud, ttl) {
  try {
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: sub,
      aud: aud,
      iat: now,
      exp: now + ttl
    };

    const encodedHeader = base64UrlEncodeUint8(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64UrlEncodeUint8(new TextEncoder().encode(JSON.stringify(payload)));

    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signatureBytes = await hmacSHA256(SECRET, signingInput);
    const encodedSignature = base64UrlEncodeUint8(signatureBytes);

    const token = `${signingInput}.${encodedSignature}`;

    return token;

  } catch (err) {
    throw new Error("JWT generation failed: " + err.message);
  }
}

// Export to window for direct access (no .trigger() needed)
window.generateJWT = generateJWTToken;

// ORIGINAL VERSION: For Retool trigger compatibility
// Keep this for backward compatibility if other code still uses generateJWT.trigger()
try {
  // INPUTS COME FROM additionalScope
  const SECRET1 = SECRET;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: sub,
    aud: aud,
    iat: now,
    exp: now + ttl
  };

  const encodedHeader = base64UrlEncodeUint8(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncodeUint8(new TextEncoder().encode(JSON.stringify(payload)));

  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signatureBytes = await hmacSHA256(SECRET1, signingInput);
  const encodedSignature = base64UrlEncodeUint8(signatureBytes);

  const token = `${signingInput}.${encodedSignature}`;

  return token;

} catch (err) {
  throw new Error("JWT generation failed: " + err.message);
}
