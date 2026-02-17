// Example JS query in Retool
const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;

const jwtResult = await generateJWT.trigger({
  additionalScope: {
    SECRET: secretForSigning,
    sub: "retool",          // optional, defaults to "retool"
    aud: "sidecar-eval",    // optional, defaults to "sidecar-eval"
    ttl: 60                 // optional, seconds until expiry
  }
});

// jwtResult now contains the JWT string returned from generateJWT
console.log("Generated JWT:", jwtResult);



// Or just return it to the query result
return jwtResult;
