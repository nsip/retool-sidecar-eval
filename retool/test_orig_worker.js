// Test script for src/orig.js with JWT
// This tests the full production worker including debug mode

const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;

// Generate JWT
const jwtToken = await generateJWT.trigger({
  additionalScope: {
    SECRET: secretForSigning,
    sub: "retool",
    aud: "sidecar-eval",
    ttl: 60
  }
});

console.log("=== Testing src/orig.js ===");
console.log("JWT Generated:", jwtToken);
console.log("JWT Length:", jwtToken.length);

const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";

// Test 1: Debug mode (test: true)
console.log("\n--- Test 1: Debug Mode ---");
try {
  const debugRes = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      test: true  // Triggers debug mode in src/orig.js
    })
  });
  
  const debugResult = await debugRes.json();
  console.log("Debug Status:", debugRes.status);
  console.log("Debug Response:", debugResult);
  
  if (debugResult.verified === true) {
    console.log("✅ JWT verification successful in debug mode");
  } else {
    console.log("❌ JWT verification failed in debug mode");
  }
} catch (err) {
  console.error("Debug test error:", err.message);
}

// Test 2: Normal mode (without test flag)
console.log("\n--- Test 2: Normal Mode ---");
try {
  const normalRes = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      id: 12907,
      blob: { assessorResponseText: "test" },
      Assessment: "4fdacb1d-3519-47f2-ba17-31d48570568",
      Control_Code: 52
    })
  });
  
  const normalResult = await normalRes.json();
  console.log("Normal Status:", normalRes.status);
  console.log("Normal Response:", normalResult);
  
  if (normalRes.status === 200 || normalRes.status === 201) {
    console.log("✅ Normal mode successful");
  } else {
    console.log("⚠️ Normal mode status:", normalRes.status);
  }
} catch (err) {
  console.error("Normal test error:", err.message);
}

console.log("\n=== Test Complete ===");
