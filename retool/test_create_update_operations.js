// Test script for CREATE and UPDATE operations via worker
// Tests both operations with JWT authentication

const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;
const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";

console.log("=== Testing CREATE and UPDATE Operations ===\n");

// Generate JWT for all tests
const jwtToken = await generateJWT.trigger({
  additionalScope: {
    SECRET: secretForSigning,
    sub: "retool",
    aud: "sidecar-eval",
    ttl: 60
  }
});

console.log("JWT Generated:", jwtToken.substring(0, 50) + "...");
console.log("JWT Length:", jwtToken.length);

// Test data
const testData = {
  Assessment: "test-assessment-id",
  Control_Code: 999,
  blob: { 
    assessorResponseText: "Test response", 
    timestamp: Date.now() 
  }
};

// ============================================================================
// Test 1: CREATE Operation
// ============================================================================
console.log("\n--- Test 1: CREATE Operation ---");

try {
  const createResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      operation: "create",
      blob: testData.blob,
      Assessment: testData.Assessment,
      Control_Code: testData.Control_Code
    })
  });

  const createResult = await createResponse.json();
  
  console.log("CREATE Status:", createResponse.status);
  console.log("CREATE Response:", createResult);
  
  if (createResponse.status === 200 || createResponse.status === 201) {
    if (createResult.data && createResult.data.id) {
      console.log("✅ CREATE successful - New ID:", createResult.data.id);
      
      // Store the ID for update test
      window.testRecordId = createResult.data.id;
    } else {
      console.log("⚠️ CREATE returned success but no ID found");
      console.log("Full response:", JSON.stringify(createResult, null, 2));
    }
  } else {
    console.log("❌ CREATE failed");
  }
} catch (err) {
  console.error("❌ CREATE error:", err.message);
}

// ============================================================================
// Test 2: UPDATE Operation (using ID from CREATE, or use existing ID)
// ============================================================================
console.log("\n--- Test 2: UPDATE Operation ---");

// Use ID from CREATE test, or fall back to a test ID
const updateId = window.testRecordId || "12907";

try {
  const updateResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      operation: "update",
      id: updateId,
      blob: { 
        assessorResponseText: "Updated test response", 
        timestamp: Date.now() 
      },
      Assessment: testData.Assessment,
      Control_Code: testData.Control_Code
    })
  });

  const updateResult = await updateResponse.json();
  
  console.log("UPDATE Status:", updateResponse.status);
  console.log("UPDATE Response:", updateResult);
  
  if (updateResponse.status === 200) {
    console.log("✅ UPDATE successful");
  } else {
    console.log("❌ UPDATE failed");
  }
} catch (err) {
  console.error("❌ UPDATE error:", err.message);
}

// ============================================================================
// Test 3: Error Handling - Missing operation
// ============================================================================
console.log("\n--- Test 3: Error Handling - Missing operation ---");

try {
  const errorResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      // No operation field
      blob: testData.blob,
      Assessment: testData.Assessment,
      Control_Code: testData.Control_Code
    })
  });

  const errorResult = await errorResponse.json();
  
  console.log("Error Test Status:", errorResponse.status);
  console.log("Error Test Response:", errorResult);
  
  if (errorResponse.status === 400 && errorResult.error) {
    console.log("✅ Error handling working correctly");
  } else {
    console.log("⚠️ Unexpected error response");
  }
} catch (err) {
  console.error("Error test exception:", err.message);
}

// ============================================================================
// Test 4: Error Handling - Invalid operation
// ============================================================================
console.log("\n--- Test 4: Error Handling - Invalid operation ---");

try {
  const errorResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      operation: "delete", // Invalid operation
      blob: testData.blob,
      Assessment: testData.Assessment,
      Control_Code: testData.Control_Code
    })
  });

  const errorResult = await errorResponse.json();
  
  console.log("Invalid Op Status:", errorResponse.status);
  console.log("Invalid Op Response:", errorResult);
  
  if (errorResponse.status === 400 && errorResult.error) {
    console.log("✅ Invalid operation rejected correctly");
  } else {
    console.log("⚠️ Unexpected response");
  }
} catch (err) {
  console.error("Invalid operation test exception:", err.message);
}

// ============================================================================
// Test 5: Error Handling - Missing required fields for CREATE
// ============================================================================
console.log("\n--- Test 5: Error Handling - Missing fields (CREATE) ---");

try {
  const errorResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
      operation: "create",
      // Missing blob
      Assessment: testData.Assessment,
      Control_Code: testData.Control_Code
    })
  });

  const errorResult = await errorResponse.json();
  
  console.log("Missing Fields Status:", errorResponse.status);
  console.log("Missing Fields Response:", errorResult);
  
  if (errorResponse.status === 400 && errorResult.error) {
    console.log("✅ Missing fields validation working");
  } else {
    console.log("⚠️ Unexpected response");
  }
} catch (err) {
  console.error("Missing fields test exception:", err.message);
}

console.log("\n=== Test Complete ===");
console.log("\nSummary:");
console.log("- Test CREATE operation");
console.log("- Test UPDATE operation");
console.log("- Test error handling for missing operation");
console.log("- Test error handling for invalid operation");
console.log("- Test error handling for missing required fields");
