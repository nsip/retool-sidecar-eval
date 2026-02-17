const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;

// call generate_jwt and wait for its result
const genResp = await generateJWT.trigger({
  additionalScope: {
    SECRET: secretForSigning,
    sub: "retool",         // optional override
    aud: "sidecar-eval",   // optional override
    ttl: 60                // seconds
  }
});

// genResp will be available as generate_jwt.data, but trigger() returns a promise that resolves when query completes.
// In Retool JS query environment, you can get the return value:
const jwtToken = genResp; // If you `return` from the JS Query, the resolved value is its return

const eval_id = 12907;
const assessment_id = "4fdacb1d-3519-47f2-ba17-31d48570568";
const control_id = 52;
const blob = { assessorResponseText: "" };




// Add after line 14 (after jwtToken is assigned):
console.log("=== JWT DIAGNOSTICS ===");
console.log("JWT Full:", jwtToken);
console.log("JWT Length:", jwtToken.length);
console.log("JWT Type:", typeof jwtToken);
const parts = jwtToken.split(".");
console.log("JWT Parts Count:", parts.length);
console.log("Header length:", parts[0]?.length);
console.log("Payload length:", parts[1]?.length);
console.log("Signature length:", parts[2]?.length);
console.log("Authorization Header:", `Bearer ${jwtToken}`);
console.log("=====================");


// Now use jwtToken in Authorization header to call the Worker:
const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";
const res = await fetch(workerUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    id: eval_id,
    blob: blob,
    Assessment: assessment_id,
    Control_Code: parseInt(control_id)
  })
});

const workerResult = await res.json();
console.log("=== WORKER RESPONSE ===");
console.log("Status:", res.status);
console.log("Response:", workerResult);
console.log("======================");
console.log(workerResult);