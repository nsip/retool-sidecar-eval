# JWT Implementation Summary - Retool ↔ Cloudflare Worker

## Overview

This document summarizes the JWT signing implementation between Retool and the Cloudflare Worker (sidecar-eval).

## Architecture

```
┌─────────────────┐         JWT-Signed Request          ┌──────────────────────┐
│                 │ ─────────────────────────────────▶   │                      │
│  Retool         │                                      │  Cloudflare Worker   │
│  (Frontend)     │   Authorization: Bearer <JWT>        │  (sidecar-eval)      │
│                 │ ◀─────────────────────────────────   │                      │
└─────────────────┘         JSON Response                └──────────────────────┘
       │                                                            │
       │ Generates JWT                                             │ Verifies JWT
       │ using HMAC-SHA256                                         │ using HMAC-SHA256
       │                                                            │
       └─────────── Shared Secret: DIRECTUS_TOKEN ────────────────┘
```

## Implementation Details

### JWT Generation (Retool Side)

**File:** `retool/generateJWT.js`

- **Algorithm:** HS256 (HMAC-SHA256)
- **Library:** Browser WebCrypto API
- **Structure:**
  - Header: `{ alg: "HS256", typ: "JWT" }`
  - Payload: `{ sub, aud, iat, exp }`
  - Signature: HMAC-SHA256(header.payload, secret)
- **Encoding:** Base64URL (no padding)

**Parameters:**
- `SECRET` - The shared secret (from `retoolContext.configVars.directus_bearer_token_plaintext`)
- `sub` - Subject (default: "retool")
- `aud` - Audience (default: "sidecar-eval")
- `ttl` - Time to live in seconds (default: 60)

**Example JWT:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXRvb2wiLCJhdWQiOiJzaWRlY2FyLWV2YWwiLCJpYXQiOjE3NjM1MjYxNDYsImV4cCI6MTc2MzUyNjIwNn0.6AcAbo_GowZtuUiCG8L2KPuEKOdYdHDwyTvtD89kZlc
```
- Length: 176-177 characters
- Structure: 3 parts separated by dots

### JWT Verification (Worker Side)

**File:** `src/orig.js` (Production) / `src/index.js` (Simple)

**Process:**
1. Extract JWT from `Authorization: Bearer <token>` header
2. Split JWT into 3 parts: `[header, payload, signature]`
3. Decode header and payload from base64url
4. Recompute signature using shared secret
5. Compare computed signature with provided signature
6. Check expiry (`exp` claim)

**Function:** `verifyJWT(token, secret)`

Returns:
```javascript
{
  ok: true/false,
  payload: { ... }, // decoded payload if ok
  error: "reason"   // error message if not ok
}
```

### Security Features

1. **HMAC-SHA256 Signature** - Prevents tampering
2. **Expiry Check** - Tokens are time-limited (default 60 seconds)
3. **Audience Validation** - Ensures token is for this service
4. **Secret Management** - Secrets stored in environment variables

## Current Status

### ✅ Confirmed Working

1. **JWT Generation in Retool**
   - Generates valid 176-177 char JWTs
   - 3 parts separated by dots
   - Proper base64url encoding

2. **JWT Transmission**
   - No truncation during HTTP request
   - Authorization header intact
   - JWT structure preserved

3. **JWT Verification with src/index.js**
   - Signature verification successful
   - Payload decoded correctly
   - Returns 200 status

### ⏳ Testing Required

1. **JWT Verification with src/orig.js**
   - Production code with Directus integration
   - Debug mode testing
   - Normal mode testing

2. **Integration into save_evaluation_blob.js**
   - Add JWT generation to `crupdate` function
   - Error handling
   - Production testing

## Configuration Requirements

### Retool Configuration

**Config Variable:**
- `directus_bearer_token_plaintext` - The shared secret for JWT signing

**Required Queries:**
- `generateJWT` - The JWT generation query (from `retool/generateJWT.js`)

### Cloudflare Worker Configuration

**Environment Secrets:**
```bash
# The shared secret (MUST match Retool's directus_bearer_token_plaintext)
wrangler secret put DIRECTUS_TOKEN

# Directus API base URL (⚠️ NO trailing slash!)
# Example: https://app.st4s.edu.au (NOT https://app.st4s.edu.au/)
wrangler secret put DIRECTUS_BASE
```

**Entry Point:**
- Currently deployed: `src/orig.js`
- Alternative for testing: `src/index.js`

## Testing Progress

### Phase 1: Basic JWT Flow ✅
- [x] Generate JWT in Retool
- [x] Validate JWT structure
- [x] Send to worker (src/index.js)
- [x] Verify signature
- [x] Decode payload

### Phase 2: Production Worker Testing ⏳
- [ ] Test src/orig.js with debug mode
- [ ] Test src/orig.js with normal mode
- [ ] Verify Directus integration
- [ ] Handle error cases

### Phase 3: Integration ⏳
- [ ] Add JWT to save_evaluation_blob.js
- [ ] Test with real data
- [ ] Monitor production usage
- [ ] Document troubleshooting

## Error Handling

### Common Errors and Solutions

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| "Missing JWT" | 401 | No Authorization header | Add `Authorization: Bearer <token>` header |
| "Malformed JWT" | 400 | Invalid JWT structure | Check JWT has 3 parts separated by dots |
| "JWT invalid" | 401 | Signature mismatch | Verify secrets match exactly |
| "Token expired" | 401 | Token TTL exceeded | Increase TTL or check clock skew |

## Files Reference

### Retool Files
- `retool/generateJWT.js` - JWT generation function
- `retool/json_web_token.js` - Test script (working with src/index.js)
- `retool/test_orig_worker.js` - Test script for src/orig.js
- `retool/test_generate_jwt.js` - Example JWT generation
- `retool/save_evaluation_blob.js` - Production code (needs JWT integration)

### Worker Files
- `src/index.js` - Simple JWT verification (confirmed working)
- `src/orig.js` - Production worker with Directus (currently deployed)
- `wrangler.jsonc` - Worker configuration

### Documentation
- `TESTING_INSTRUCTIONS.md` - Detailed testing steps
- `JWT_IMPLEMENTATION_SUMMARY.md` - This file

## Next Steps

1. **Run `retool/test_orig_worker.js` in Retool** to test src/orig.js
2. **Check console output** for debug and normal mode results
3. **If tests pass:** Integrate JWT into save_evaluation_blob.js
4. **If tests fail:** Debug using error messages and troubleshooting guide

## Notes

- JWT typical length: 176-177 characters
- TTL set to 60 seconds (configurable)
- Base64URL encoding (no padding)
- Secrets must match exactly (no whitespace)
- Worker deployed at: https://sidecar-eval.nsip-esa.workers.dev
