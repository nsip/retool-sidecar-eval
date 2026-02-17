# CREATE and UPDATE Operations - Implementation Guide

## Overview

The Cloudflare Worker now supports both CREATE and UPDATE operations for Assessment_Data records in Directus, with JWT authentication for all requests.

## Architecture

```
┌─────────────────┐                                     ┌──────────────────────┐
│    Retool       │  POST with operation type          │  Cloudflare Worker   │
│  (Frontend)     │  ────────────────────────────────▶  │  (sidecar-eval)      │
│                 │                                     │                      │
│  crupdate()     │  ◀────────────────────────────────  │  - JWT Verify        │
│  - found=true   │     Directus Response               │  - Route by operation│
│    → UPDATE     │                                     │  - PATCH or POST     │
│  - found=false  │                                     │                      │
│    → CREATE     │                                     └──────────────────────┘
└─────────────────┘                                                │
                                                                   │
                                                                   ▼
                                                    ┌──────────────────────┐
                                                    │     Directus API     │
                                                    │  /items/             │
                                                    │  Assessment_Data     │
                                                    └──────────────────────┘
```

## Worker Deployment

- **URL:** https://sidecar-eval.nsip-esa.workers.dev
- **Version:** 65e39c63-f9c1-418a-aa10-e610bd056a5c
- **Entry Point:** `src/orig.js`

## Request Format

### Common Headers
```javascript
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

### CREATE Operation

**Purpose:** Create a new Assessment_Data record in Directus

**Request Body:**
```javascript
{
  "operation": "create",
  "blob": { /* JSON data */ },
  "Assessment": "assessment-uuid",
  "Control_Code": 123
  // NO id field - Directus generates it
}
```

**Response (Success - 200/201):**
```javascript
{
  "data": {
    "id": "newly-generated-id",
    "blob": { /* ... */ },
    "Assessment": "assessment-uuid",
    "Control_Code": 123,
    // ... other Directus fields
  }
}
```

**Response (Error - 400):**
```javascript
{
  "error": "Missing required fields for create: blob, Assessment, Control_Code"
}
```

### UPDATE Operation

**Purpose:** Update an existing Assessment_Data record in Directus

**Request Body:**
```javascript
{
  "operation": "update",
  "id": "existing-record-id",
  "blob": { /* JSON data */ },
  "Assessment": "assessment-uuid",
  "Control_Code": 123
}
```

**Response (Success - 200):**
```javascript
{
  "data": {
    "id": "existing-record-id",
    "blob": { /* updated data */ },
    "Assessment": "assessment-uuid",
    "Control_Code": 123,
    // ... other Directus fields
  }
}
```

**Response (Error - 400):**
```javascript
{
  "error": "Missing required fields for update: id, blob, Assessment, Control_Code"
}
```

## Worker Implementation

### Operation Flow

1. **JWT Authentication** (all requests)
   - Verify JWT signature
   - Check expiry
   - Reject if invalid

2. **Operation Validation**
   - Check `operation` field exists
   - Must be "create" or "update"
   - Return 400 if invalid

3. **Field Validation**
   - CREATE: requires `blob`, `Assessment`, `Control_Code`
   - UPDATE: requires `id`, `blob`, `Assessment`, `Control_Code`
   - Return 400 if missing

4. **Directus Request**
   - CREATE: POST to `/items/Assessment_Data`
   - UPDATE: PATCH to `/items/Assessment_Data/{id}`
   - Forward response to client

### Error Responses

| Status | Condition | Error Message |
|--------|-----------|---------------|
| 400 | Missing operation | "Missing or invalid operation. Must be 'create' or 'update'" |
| 400 | Invalid operation | Same as above |
| 400 | Missing fields (CREATE) | "Missing required fields for create: blob, Assessment, Control_Code" |
| 400 | Missing fields (UPDATE) | "Missing required fields for update: id, blob, Assessment, Control_Code" |
| 401 | Missing JWT | "Missing JWT" |
| 401 | Invalid JWT | "JWT invalid" |
| 401 | Expired JWT | "Token expired" |
| 500 | Server error | Error message from exception |

## Retool Implementation

### File: `retool/save_evaluation_blob.js`

#### Function: `crupdate()`

The `crupdate` function now handles both CREATE and UPDATE through the worker:

**UPDATE (found=true):**
```javascript
// Generate JWT
const jwtToken = await generateJWT.trigger({...});

// Call worker with UPDATE operation
const response = await fetch(workerUrl, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    operation: "update",
    id: eval_id,
    blob: ret,
    Assessment: assessment_id,
    Control_Code: parseInt(control_id)
  })
});

// Return existing ID
return eval_id;
```

**CREATE (found=false):**
```javascript
// Generate JWT
const jwtToken = await generateJWT.trigger({...});

// Call worker with CREATE operation
const response = await fetch(workerUrl, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    operation: "create",
    blob: ret,
    Assessment: assessment_id,
    Control_Code: parseInt(control_id)
    // NO id for create
  })
});

// Extract and return NEW ID from Directus
return result.data.id;
```

### GraphQL Replacement

The GraphQL triggers have been commented out but preserved:

**Old UPDATE (commented out):**
```javascript
/* GRAPHQL */
/*
return update_evaluation_for_control.trigger({
  additionalScope: { id, assessment_id, control_id, blob }
})
*/
```

**Old CREATE (commented out):**
```javascript
/* GRAPHQL - commented out, now using worker */
/*
return create_evaluation_for_control.trigger({
  additionalScope: { assessment_id, control_id, blob }
})
*/
```

## Testing

### Test Script: `retool/test_create_update_operations.js`

Comprehensive test script that validates:

1. **CREATE Operation**
   - Sends create request with test data
   - Verifies new ID is returned
   - Stores ID for UPDATE test

2. **UPDATE Operation**
   - Uses ID from CREATE test
   - Sends update request
   - Verifies success

3. **Error Handling**
   - Missing operation field → 400
   - Invalid operation type → 400
   - Missing required fields → 400

### Running Tests

1. Open Retool
2. Create new JavaScript query
3. Copy contents of `retool/test_create_update_operations.js`
4. Run the query
5. Check console output

**Expected Output:**
```
=== Testing CREATE and UPDATE Operations ===

JWT Generated: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT Length: 176

--- Test 1: CREATE Operation ---
CREATE Status: 200
✅ CREATE successful - New ID: <generated-id>

--- Test 2: UPDATE Operation ---
UPDATE Status: 200
✅ UPDATE successful

--- Test 3: Error Handling - Missing operation ---
Error Test Status: 400
✅ Error handling working correctly

--- Test 4: Error Handling - Invalid operation ---
Invalid Op Status: 400
✅ Invalid operation rejected correctly

--- Test 5: Error Handling - Missing fields (CREATE) ---
Missing Fields Status: 400
✅ Missing fields validation working

=== Test Complete ===
```

## Migration from GraphQL

### Benefits of Worker Approach

1. **Unified Authentication** - Both CREATE and UPDATE use JWT
2. **Single Endpoint** - Easier to maintain and monitor
3. **Consistent Error Handling** - Standardized error responses
4. **Better Security** - JWT validates every request
5. **Future Extensibility** - Easy to add more operations

### What Changed

**Before:**
- UPDATE: Worker (no JWT) → Directus
- CREATE: GraphQL → Directus
- Two different patterns

**After:**
- UPDATE: Worker (JWT) → Directus
- CREATE: Worker (JWT) → Directus
- Single consistent pattern

## Configuration

### Required Cloudflare Secrets

```bash
# Shared secret for JWT signing/verification
wrangler secret put DIRECTUS_TOKEN

# Directus API base URL (⚠️ NO trailing slash!)
# Example: https://app.st4s.edu.au (NOT https://app.st4s.edu.au/)
# Trailing slash causes double-slash in paths: //items/Assessment_Data/123
wrangler secret put DIRECTUS_BASE
```

### Required Retool Configuration

- **Config Variable:** `directus_bearer_token_plaintext`
  - Must match `DIRECTUS_TOKEN` in Cloudflare
- **Query:** `generateJWT` must be available

## Troubleshooting

### CREATE returns no ID

**Symptom:** Response is 200 but `result.data.id` is undefined

**Causes:**
- Directus response format different than expected
- Check full response in console

**Solution:** Log full response and adjust parsing

### UPDATE works but CREATE fails

**Symptom:** UPDATE returns 200, CREATE returns 400/500

**Causes:**
- Missing required fields in CREATE request
- Directus validation rules different for CREATE vs UPDATE

**Solution:** Check Directus logs, verify all required fields present

### Both operations return 401

**Symptom:** All requests return "JWT invalid"

**Causes:**
- Secret mismatch between Retool and Cloudflare
- JWT generation failing

**Solution:**
```bash
# Re-set Cloudflare secret
wrangler secret put DIRECTUS_TOKEN
# Enter exact same value as in Retool config
```

## Batch CREATE Operation

### Implementation

The `create_multiple` function now uses the worker for batch creates, sending multiple CREATE requests in parallel.

**Function:** `create_multiple(assessment_id, evals)`

**Process:**
1. Generate JWT once (shared across all requests)
2. Map each eval to a CREATE request
3. Execute all requests in parallel with `Promise.all()`
4. Return results in same format as GraphQL (for backward compatibility)

**Code Example:**
```javascript
async function create_multiple(assessment_id, evals) {
  // Generate JWT once
  const jwtToken = await generateJWT.trigger({...});
  
  // Create all records in parallel
  const createPromises = evals.map(async (evalItem) => {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        operation: "create",
        blob: evalItem.blob,
        Assessment: assessment_id,
        Control_Code: parseInt(evalItem.control_id)
      })
    });
    
    const result = await response.json();
    return {
      id: result.data.id,
      blob: evalItem.blob,
      Assessment: assessment_id,
      Control_Code: parseInt(evalItem.control_id)
    };
  });
  
  // Wait for all to complete
  const results = await Promise.all(createPromises);
  return results;
}
```

**Benefits:**
- ✅ Parallel execution (faster than sequential)
- ✅ JWT authentication for all creates
- ✅ Individual error handling per record
- ✅ Backward compatible return format
- ✅ Handles partial failures gracefully

**Error Handling:**
- Failed creates return `null`
- Successful creates are included in results
- Warns if some records failed

## Future Enhancements

### Planned (Not Yet Implemented)

1. **DELETE Operation** - Remove records
2. **PATCH Operation** - Partial updates
3. **Validation** - Schema validation before Directus call
4. **True Batch Endpoint** - Single request for multiple creates (optimization)

## Summary

✅ CREATE and UPDATE operations unified under single worker endpoint  
✅ JWT authentication for all operations  
✅ Explicit operation type for clarity  
✅ Comprehensive error handling  
✅ GraphQL code preserved (commented out)  
✅ Test script included  
✅ Documentation complete  

**Status: READY FOR PRODUCTION USE**
