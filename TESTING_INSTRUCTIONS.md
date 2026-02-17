# JWT Testing Instructions for Retool → Cloudflare Worker

## Current Status

✅ **Working:**
- JWT generation in Retool (generateJWT.js)
- JWT verification with src/index.js (simple verification)
- JWT transmission is intact (no truncation)

❌ **Needs Testing:**
- JWT verification with src/orig.js (production code with Directus integration)

## Deployed Worker Configuration

- **Worker URL:** https://sidecar-eval.nsip-esa.workers.dev
- **Current Entry Point:** src/orig.js
- **Version:** f84dd8d3-1c10-490d-86c9-1a1e18c6007b

## Required Environment Variables in Cloudflare

Ensure these secrets are configured in your Cloudflare Worker:

1. `DIRECTUS_TOKEN` - The shared secret for JWT signing/verification
2. `DIRECTUS_BASE` - Base URL for your Directus API

**To check/set these secrets:**
```bash
# List current secrets
wrangler secret list

# Set a secret (you'll be prompted for the value)
wrangler secret put DIRECTUS_TOKEN
wrangler secret put DIRECTUS_BASE
```

## Testing Steps

### Step 1: Test src/orig.js with JWT

Run the **`retool/test_orig_worker.js`** script in Retool:

1. Open Retool
2. Create a new JavaScript query
3. Copy the contents of `retool/test_orig_worker.js`
4. Run the query
5. Check the console output

**Expected Results:**

#### Test 1 (Debug Mode):
```javascript
Status: 200
Response: {
  mode: "debug",
  verified: true,
  header: { alg: "HS256", typ: "JWT" },
  payload: { sub: "retool", aud: "sidecar-eval", iat: ..., exp: ... }
}
```

#### Test 2 (Normal Mode):
```javascript
Status: 200 or 201
Response: { ... } // Directus response
```

### Step 2: Diagnose Any Failures

If you see errors, check:

1. **"Missing JWT" (401)** → Authorization header not received
2. **"JWT invalid" (401)** → Secret mismatch or verification failed
3. **"Malformed JWT" (400)** → JWT structure issue (should not happen based on earlier tests)
4. **"Token expired" (401)** → Clock skew or ttl too short

### Step 3: If Tests Pass

Once src/orig.js works with JWT, we can:

1. Update `retool/save_evaluation_blob.js` to include JWT signing
2. Test the full production flow
3. Document the complete setup

## Troubleshooting Guide

### Issue: "JWT invalid" / Signature Verification Fails

**Possible Causes:**
- Secret in Retool (`directus_bearer_token_plaintext`) doesn't match `DIRECTUS_TOKEN` in Cloudflare
- Secret has extra whitespace or encoding issues

**Fix:**
```bash
# Re-set the secret in Cloudflare
wrangler secret put DIRECTUS_TOKEN
# Enter the EXACT same value as in Retool (no extra spaces)
```

### Issue: Debug Mode Works but Normal Mode Fails

**Possible Causes:**
- Directus endpoint not accessible
- `DIRECTUS_BASE` not configured
- Network/firewall issues

**Fix:**
- Check `DIRECTUS_BASE` is set correctly
- Test Directus endpoint separately

### Issue: "Malformed JWT"

**Possible Causes:**
- JWT is being corrupted during transmission (unlikely based on earlier tests)
- Authorization header parsing issue in worker

**Diagnosis:**
Look at the debug mode output to see exactly what the worker received.

## Next Steps After Successful Testing

1. ✅ Confirm src/orig.js works with JWT
2. Update `retool/save_evaluation_blob.js` with JWT signing (in `crupdate` function)
3. Test save_evaluation_blob.js in Retool with real data
4. Monitor production usage for any issues

## Files Overview

- **`retool/generateJWT.js`** - JWT generation function (called by other scripts)
- **`retool/json_web_token.js`** - Simple test script (confirmed working with src/index.js)
- **`retool/test_orig_worker.js`** - Comprehensive test for src/orig.js (USE THIS NEXT)
- **`retool/test_generate_jwt.js`** - Example of how to call generateJWT
- **`retool/save_evaluation_blob.js`** - Production code (needs JWT integration after tests pass)
- **`src/index.js`** - Simple JWT verification worker (confirmed working)
- **`src/orig.js`** - Production worker with Directus integration (CURRENTLY DEPLOYED)
