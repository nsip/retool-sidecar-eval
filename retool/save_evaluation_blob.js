function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* Save the evaluation as a BLOB to Directus. GraphQL needs this to be either a create or an update operation; we are now only using this for single creates, or for one or more updates. (GraphQL does not allow batch multiple updates where the update to each object is open-ended). 
If we have already retrieved this control response, we will treat it as an update. We are assuming no race conditions.

found: boolean: have we already retrieved this response
eval_id: if we have, what is its ID in Directus
ret: the JSON BLOB of the evaluation
assessment_id: the assessment ID
control_id: the control ID
control_code: the control code (human-readable)
module: the module code 
Returns: the id of the record created or updated
*/

async function crupdate(assessment_id, eval_id, control_id, control_code, module, ret, found) {
  if (found) {
    /*
    console.log("eval_id: "+eval_id);
    console.log("assessment_id: "+assessment_id);
    console.log("control_id: "+parseInt(control_id));
    console.log("ret: ");
    console.log(ret);
    */
    /* GRAPHQL */
    /*
    return update_evaluation_for_control.trigger({
            additionalScope: {
                id: eval_id,
                assessment_id: assessment_id,
                control_id: parseInt(control_id),
                blob: ret,
            }
        }).then(() => {
            const response = update_evaluation_for_control.data;
            if (!response || !response.update_Assessment_Data_item) {
                console.log("ERROR 1");
                return null;
            }
            return response.update_Assessment_Data_item.id;
        });
    */
       // === UPDATE via Worker with JWT ===
    const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";

    try {
      // Generate JWT for authentication (direct call - no trigger overhead)
      const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;
      const jwtToken = await window.generateJWT(secretForSigning, "retool", "sidecar-eval", 60);

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

      const result = await response.json();

      if (!result || result.errors) {
        console.error("ERROR 1 updating record - Full details:");
        console.error("Response status:", response.status);
        console.error("Result object:", result);
        console.error("Result errors:", result?.errors);
        console.error("Eval ID being updated:", eval_id);
        console.error("Control ID:", control_id);
        console.error("Assessment ID:", assessment_id);
        console.error("Module:", module);
        console.error("Blob keys:", ret ? Object.keys(ret) : 'null');
        console.error("Request body sent:", {
          operation: "update",
          id: eval_id,
          Assessment: assessment_id,
          Control_Code: parseInt(control_id),
          blobKeys: ret ? Object.keys(ret) : null
        });
        return null;
      }

      // Return the eval ID as usual
      return eval_id;

    } catch (err) {
      console.error("Error updating via Worker - Full details:");
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      console.error("Eval ID being updated:", eval_id);
      console.error("Control ID:", control_id);
      console.error("Assessment ID:", assessment_id);
      console.error("Module:", module);
      return null;
    }
    } else {
        /* GRAPHQL - commented out, now using worker */
        /*
        return create_evaluation_for_control.trigger({
            additionalScope: {
                assessment_id: assessment_id,
                control_id: parseInt(control_id),
                blob: ret,
            }
        }).then(() => {
            const response = create_evaluation_for_control.data;
            if (!response || !response.create_Assessment_Data_item) {
                console.log("ERROR 1");
                return null;
            }
            return response.create_Assessment_Data_item.id;
        });
        */

        // === CREATE via Worker with JWT ===
        const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";

        try {
          // Generate JWT for authentication (direct call - no trigger overhead)
          const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;
          const jwtToken = await window.generateJWT(secretForSigning, "retool", "sidecar-eval", 60);

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
              // No id for create - Directus will generate it
            })
          });

          const result = await response.json();

          if (!result || result.errors || !result.data || !result.data.id) {
            console.error("ERROR 1 creating record - Full details:");
            console.error("Response status:", response.status);
            console.error("Result object:", result);
            console.error("Result errors:", result?.errors);
            console.error("Result data:", result?.data);
            console.error("Control ID:", control_id);
            console.error("Assessment ID:", assessment_id);
            console.error("Blob keys:", ret ? Object.keys(ret) : 'null');
            return null;
          }

          // Return the NEW id from Directus
          return result.data.id;

        } catch (err) {
          console.error("Error creating via Worker - Full details:");
          console.error("Error message:", err.message);
          console.error("Error stack:", err.stack);
          console.error("Control ID:", control_id);
          console.error("Assessment ID:", assessment_id);
          return null;
        }
    }
}

/* batch create multiple evaluations with throttling and retry logic */
async function create_multiple(assessment_id, evals) {
    /* GRAPHQL - commented out, now using worker */
    /*
    let data = evals.map(e => ({
        Assessment: assessment_id,
        Control_Code: parseInt(e.control_id),
        blob: e.blob
    }));
    return create_evaluations_for_control.trigger({
        additionalScope: {
            data: data
        }
    }).then(() => {
        const response = create_evaluations_for_control.data;

        if (response.create_Assessment_Data_items !== undefined &&
            Array.isArray(response.create_Assessment_Data_items) &&
            response.create_Assessment_Data_items.every(item => item && item.id !== undefined)) {
            // NOP
        } else {
            console.error("Unexpected response structure from create_multiple_evaluations:", response);
            console.log("ERROR ON: ");
            console.log(data);
        }
        return response.create_Assessment_Data_items;
    });
    */

    // === BATCH CREATE via Worker with JWT and Rate Limit Handling ===
    const workerUrl = "https://sidecar-eval.nsip-esa.workers.dev";
    const BATCH_SIZE = 30; // Conservative batch size to avoid rate limits
    const MAX_RETRIES = 3;
    const BASE_DELAY = 300; // Base delay between batches in ms
        let progressBarValue = progressBar1.value;
      let progressBarStatus = progressBar1.hidden;
  
    try {
        // Generate JWT once for all creates (direct call - no trigger overhead)
        const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;
        const jwtToken = await window.generateJWT(secretForSigning, "retool", "sidecar-eval", 60);

        // Helper function to create a single record with retry logic
        async function createWithRetry(evalItem, attempt = 0) {
            try {
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

                // Handle 429 rate limit errors
                if (response.status === 429) {
                    if (attempt < MAX_RETRIES) {
                        const result = await response.json();
                        
                        // Extract retry-after from error message or use exponential backoff
                        let retryAfter = BASE_DELAY * Math.pow(2, attempt);
                        
                        if (result.errors?.[0]?.message) {
                            const match = result.errors[0].message.match(/retry after (\d+)ms/);
                            if (match) {
                                retryAfter = parseInt(match[1]) + 100; // Add buffer
                            }
                        }
                        
                        console.log(`Rate limit hit, retrying after ${retryAfter}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                        await delay(retryAfter);
                        return createWithRetry(evalItem, attempt + 1);
                    } else {
                        console.error(`Max retries reached for control ${evalItem.control_id}`);
                        return null;
                    }
                }

                const result = await response.json();

                // Handle different possible Directus response formats
                let recordId = null;
                
                if (result && result.data) {
                    recordId = result.data.id || result.data;
                } else if (result && result.id) {
                    recordId = result.id;
                } else if (result && !result.errors) {
                    // Sometimes Directus returns the object directly
                    recordId = result;
                }
                
                if (!recordId || result.errors) {
                    console.error("ERROR creating record in batch", {
                        status: response.status,
                        result: result,
                        evalItem: evalItem
                    });
                    return null;
                }

                // Return in same format as GraphQL response
                return {
                    id: typeof recordId === 'object' ? recordId.id : recordId,
                    blob: evalItem.blob,
                    Assessment: assessment_id,
                    Control_Code: parseInt(evalItem.control_id)
                };

            } catch (err) {
                console.error("Error creating record in batch:", err);
                
                // Retry on network errors
                if (attempt < MAX_RETRIES) {
                    const retryDelay = BASE_DELAY * Math.pow(2, attempt);
                    console.log(`Network error, retrying after ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await delay(retryDelay);
                    return createWithRetry(evalItem, attempt + 1);
                }
                
                return null;
            }
        }

        // Process in batches with controlled concurrency
        const allResults = [];
        const totalBatches = Math.ceil(evals.length / BATCH_SIZE);
        
        console.log(`Processing ${evals.length} creates in ${totalBatches} batches of ${BATCH_SIZE}`);
        
        // Initialize progress bar
      progressBar1.setHidden(false);
      progressBar1.setValue(0);

        for (let i = 0; i < evals.length; i += BATCH_SIZE) {
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const batch = evals.slice(i, i + BATCH_SIZE);
            
            console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} records)`);
            
            // Process current batch in parallel (within the batch size limit)
            const batchPromises = batch.map(evalItem => createWithRetry(evalItem));
            const batchResults = await Promise.all(batchPromises);
            
            allResults.push(...batchResults);
            
            // Add delay between batches (except after the last batch)
            if (i + BATCH_SIZE < evals.length) {
                await delay(BASE_DELAY);
            }
                
                    progressBar1.setValue( 100 * i / evals.length);
                
        }

        // Filter out any nulls (failed creates)
        const successfulResults = allResults.filter(r => r !== null);

        if (successfulResults.length !== evals.length) {
            console.warn(`Only ${successfulResults.length} of ${evals.length} records created successfully`);
        } else {
            console.log(`✅ Successfully created all ${successfulResults.length} records`);
        }
      progressBar1.setHidden(progressBarStatus);
      progressBar1.setValue(progressBarValue);

        return successfulResults;

    } catch (err) {
        console.error("Error in batch create:", err);
      progressBar1.setHidden(progressBarStatus);
      progressBar1.setValue(progressBarValue);
      return [];
    }
    
    /* ORIGINAL VERSION WITHOUT THROTTLING/RETRY (kept for reference):
    
    try {
        const secretForSigning = retoolContext.configVars.directus_bearer_token_plaintext;
        const jwtToken = await generateJWT.trigger({
            additionalScope: {
                SECRET: secretForSigning,
                sub: "retool",
                aud: "sidecar-eval",
                ttl: 60
            }
        });

        // Create all records in parallel (NO THROTTLING - causes rate limit errors)
        const createPromises = evals.map(async (evalItem) => {
            try {
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
                let recordId = null;
                
                if (result && result.data) {
                    recordId = result.data.id || result.data;
                } else if (result && result.id) {
                    recordId = result.id;
                } else if (result && !result.errors) {
                    recordId = result;
                }
                
                if (!recordId || result.errors) {
                    console.error("ERROR creating record in batch", {
                        status: response.status,
                        result: result,
                        evalItem: evalItem
                    });
                    return null;
                }

                return {
                    id: typeof recordId === 'object' ? recordId.id : recordId,
                    blob: evalItem.blob,
                    Assessment: assessment_id,
                    Control_Code: parseInt(evalItem.control_id)
                };

            } catch (err) {
                console.error("Error creating record in batch:", err);
                return null;
            }
        });

        const results = await Promise.all(createPromises);
        const successfulResults = results.filter(r => r !== null);

        if (successfulResults.length !== evals.length) {
            console.warn(`Only ${successfulResults.length} of ${evals.length} records created successfully`);
        }

        return successfulResults;

    } catch (err) {
        console.error("Error in batch create:", err);
        return [];
    }
    */
}


/* Save evaluations to the local cache of evaluation data 
(evaluations_per_control).

localstore: local variable copy of the entire evaluation data cache
assessment_id: the assessment ID
evals: the set of evaluations to save
batch: whether we are operating in batch mode; if not, don't recalaculate the tier 

*/
async function save_data_to_cache(localstore, assessment_id, evals, batch) {
    try {
        for (let eval of evals) {
            if (!eval.found) {
                /* we are creating an evaluation record anew for this control on localstore */
                localstore[assessment_id][eval.module][eval.control_code] = {
                    Control_Code: {
                        Code: eval.control_code
                    },
                    /* Retrieve the ID returned from Directus for the create record query that we have just run. 
                    We will need it for future update queries */
                    id: eval.eval_id || eval._tmp_id,
                    blob: eval.blob
                };

            }
            //console.log("Setting local cache: " + eval.control_code);
        }
        // Note: tier_calculate moved to end of save_evaluationBlob for optimization
        evaluations_per_control.setValue(localstore);
    } catch (error) {
        const errorMessage = error?.message || error?.toString() || "Unknown error in save_data_to_cache";
        console.error("save_data_to_cache error:", errorMessage, error);
        
        utils.showNotification({
            title: "save_data_to_cache Error",
            description: errorMessage,
            notificationType: "error",
            duration: 5
        });
        
        // Re-throw to propagate to caller
        throw new Error(`save_data_to_cache failed: ${errorMessage}`);
    }
}

/* Overall function to save the BLOB for evaluation responses of the current control */
async function save_evaluationBlob(evals, batch) {
    /* retrieve the current responses from Retool controls into a BLOB */

    // === PERFORMANCE DIAGNOSTICS ===
    const perfStart = performance.now();
    console.log("⏱️ [PERF] save_evaluationBlob started");

    const assessment_id = assessmentSearch.selectedRow.id;
    let eval_id = "";

    try {
        // === PERF: Cache retrieval ===
        //const t1 = performance.now();
        let localstore = evaluations_per_control.value;
        if (!(assessment_id in localstore)) {
            localstore[assessment_id] = {};
        }
        //console.log(`⏱️ [PERF] Cache retrieval: ${(performance.now() - t1).toFixed(2)}ms`);

        // === PERF: Check found status ===
        const t2 = performance.now();
        for (let eval of evals) {
            /* initialise module evaluations if not present for the given evaluation */
            if (!(eval.module in localstore[assessment_id])) {
                localstore[assessment_id][eval.module] = {};
            }
            let arr = localstore[assessment_id][eval.module];
            if (eval.control_code in arr) {
                // update cache copy 
                localstore[assessment_id][eval.module][eval.control_code].blob = eval.blob;
                eval.found = true;
                eval_id = localstore[assessment_id]?.[eval.module]?.[eval.control_code]?.id;
                // console.log(eval.control_code + " " + eval_id);
                
                // Check if this is a temp ID (contains underscore pattern like "209_0_1763602545466")
                // Temp IDs are not real Directus IDs and should be treated as not found
                const isTempId = eval_id && typeof eval_id === 'string' && eval_id.includes('_');
                
                if (eval_id === undefined || isTempId) {
                    // we defined the eval in setComplianceAndScope as an empty eval, which has never been saved to Directus
                    // OR the ID is a temporary ID that needs to be replaced with a real Directus ID
                    eval.found = false;
                    console.log(`Record ${eval.control_code} has temp/missing ID (${eval_id}), will CREATE instead of UPDATE`);
                } else {
                  eval.eval_id = eval_id;
                }
            }
        }
        //console.log(`⏱️ [PERF] Check found status loop: ${(performance.now() - t2).toFixed(2)}ms`);

        // === PERF: Assign temp IDs ===
        const t3 = performance.now();
        evals.forEach((eval, i) => {
            if (!eval.eval_id && !eval._tmp_id) {
                eval._tmp_id = `${eval.control_id}_${i}_${Date.now()}`; // ensures uniqueness
            }
        });
        //console.log(`⏱️ [PERF] Assign temp IDs: ${(performance.now() - t3).toFixed(2)}ms`);

        // === PERF: Filter updates/creates ===
        const t4 = performance.now();
        const updates = evals.filter(eval => eval.found);
        const creates = evals.filter(eval => !eval.found);
        //console.log(`⏱️ [PERF] Filter updates/creates: ${(performance.now() - t4).toFixed(2)}ms`);
        console.log(`📊 [PERF] Updates: ${updates.length}, Creates: ${creates.length}`);

        /* Update Directus through a promise queue of tasks, but only for updates */
      /* There is no provision for a batch update of multiple objects in GraphQL with different content for each object, so we cannot do it that way */
    
        if (updates.length > 0) {
          // === PERF: UPDATE operations ===
          const tUpdate = performance.now();
          console.log("UPDATE: " + updates.length + " tasks");
          
            const tTasks = performance.now();
            const tasks = updates.map((eval) => () =>
                crupdate(
                    assessment_id,
                    eval.eval_id, // eval_id,
                    eval.control_id,
                    eval.control_code,
                    eval.module,
                    eval.blob,
                    eval.found
                ).then((eval_id_result) => {
                    // Update the eval object with the resolved value
                    eval.eval_id = eval_id_result;
                })
            );
            console.log(`⏱️ [PERF] Create UPDATE tasks: ${(performance.now() - tTasks).toFixed(2)}ms`);
            
          /* We have to throttle this RIGHT down */
            const tQueue = performance.now();
            const queue = new window.PromiseQueue(5, batch ? null : progressBar1);
            queue.open(tasks.length);
            await Promise.all(tasks.map((task) => queue.add(task)));
            queue.close();
            console.log(`⏱️ [PERF] Execute UPDATE queue (5 concurrent): ${(performance.now() - tQueue).toFixed(2)}ms`);


// --- Reconcile _tmp_id to real eval_id ---
const tReconcile = performance.now();
updates.forEach(eval => {
    // Ensure the cache entry exists before trying to reconcile
    // This can be undefined if the module/control structure changed during async operations
    if (!localstore[assessment_id]?.[eval.module]?.[eval.control_code]) {
        console.warn(`Reconcile UPDATE: Cache entry missing for ${eval.module}/${eval.control_code}`);
        console.warn(localstore[assessment_id]);
        console.warn(localstore[assessment_id]?.[eval.module]);
        console.warn(localstore[assessment_id]?.[eval.module]?.[eval.control_code]);
        return;
    }
    const cachedRow = localstore[assessment_id][eval.module][eval.control_code];
    if (eval._tmp_id && cachedRow.id === eval._tmp_id) {
        cachedRow.id = eval.eval_id;
        delete eval._tmp_id; // clean up temp ID
    }
});
//console.log(`⏱️ [PERF] Reconcile UPDATE IDs: ${(performance.now() - tReconcile).toFixed(2)}ms`);
          
            const tCache1 = performance.now();
            await save_data_to_cache(localstore, assessment_id, updates, batch);
            console.log(`⏱️ [PERF] Save UPDATE to cache: ${(performance.now() - tCache1).toFixed(2)}ms`);
            console.log(`⏱️ [PERF] Total UPDATE operations: ${(performance.now() - tUpdate).toFixed(2)}ms`);
        }


        if (creates.length > 0) {
            // === PERF: CREATE operations ===
            const tCreate = performance.now();
            console.log("CREATE: " + creates.length + " in single task");

            const tMultiple = performance.now();
            let response = await create_multiple(assessment_id, creates);
            console.log(`⏱️ [PERF] create_multiple (parallel): ${(performance.now() - tMultiple).toFixed(2)}ms`);
            
            const tMatch = performance.now();
            response.forEach(item => {
                const tmpId = item.blob?._tmp_id;
                const match = creates.find(e => e.blob?._tmp_id === tmpId);
                if (match) {
                    match.eval_id = item.id;
                    // --- Reconcile _tmp_id to real eval_id in cache ---
                    // Ensure the cache entry exists before trying to reconcile
                  /*
                    if (!localstore[assessment_id]?.[match.module]?.[match.control_code]) {
                        console.warn(`Reconcile CREATE: Cache entry missing for ${match.module}/${match.control_code}`);
        console.warn(localstore[assessment_id]);
        console.warn(localstore[assessment_id]?.[match.module]);
        console.warn(localstore[assessment_id]?.[match.module]?.[match.control_code]);
                        return;
                    */
                    const cachedRow = localstore[assessment_id][match.module][match.control_code];
                    if (match._tmp_id && cachedRow?.id === match._tmp_id) {
                        cachedRow.id = match.eval_id;
                        delete match._tmp_id; // clean up temp ID
                    }
                }
            });
            //console.log(`⏱️ [PERF] Match and reconcile CREATE IDs: ${(performance.now() - tMatch).toFixed(2)}ms`);
            
            /* Update cache local storage: cannot run this until we have the IDs retrieved from any create operation on Directus */
            const tCache2 = performance.now();
            await save_data_to_cache(localstore, assessment_id, creates, batch);
            console.log(`⏱️ [PERF] Save CREATE to cache: ${(performance.now() - tCache2).toFixed(2)}ms`);
            console.log(`⏱️ [PERF] Total CREATE operations: ${(performance.now() - tCreate).toFixed(2)}ms`);
            console.log("DONE: CREATE: " + creates.length + " in single task");
            console.log(creates);
            console.log(localstore[assessment_id])
        }


        /* Update the progress chart and tier calculation */
        //const tProgress = performance.now();
        /*if (batch)*/ {
            // Call window functions with direct data pass to avoid race conditions
            // Pass localstore directly so functions don't need to wait for state propagation
            // window.tier_calculate(assessment_id, localstore);
            window.controlsProgress(assessment_id, localstore, controls_by_module.value);
            //console.log(`⏱️ [PERF] Update progress & tier (window calls): ${(performance.now() - tProgress).toFixed(2)}ms`);
        }
        
        // === PERF: Total time ===
        console.log(`⏱️ [PERF] ✅ save_evaluationBlob TOTAL: ${(performance.now() - perfStart).toFixed(2)}ms`);
    } catch (error) {
        // Extract meaningful error information
        const errorMessage = error?.message || error?.toString() || "Unknown error occurred";
        const errorDetails = {
            message: errorMessage,
            stack: error?.stack,
            name: error?.name,
            errorObject: error
        };
        
        console.error("Error during sequential promise execution:", errorDetails);
        console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        utils.showNotification({
            title: "save_evaluationBlob Error",
            description: errorMessage,
            notificationType: "error",
            duration: 5
        });
        
        // Re-throw with proper error information so caller can handle it
        throw new Error(`save_evaluationBlob failed: ${errorMessage}`);
    }
}


return save_evaluationBlob(evals, batch);
