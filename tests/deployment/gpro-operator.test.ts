import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canRetryAuthentication} from '../../scripts/gpro-demo.ts';
test('only pre-execution transient authentication failures with unchanged oracle state may retry',()=>{
 const state={nextNonce:3n,stateHash:'0xabc'};
 const failed='Initializing...\nCredential validation failed\nauthentication required: context deadline exceeded';
 assert.equal(canRetryAuthentication(failed,state,state),true);
 assert.equal(canRetryAuthentication(failed,state,{...state,nextNonce:4n}),false);
 assert.equal(canRetryAuthentication('unauthorized: invalid token',state,state),false);
 assert.equal(canRetryAuthentication(failed+'\nWorkflow Simulation Result',state,state),false);
 assert.equal(canRetryAuthentication('write timeout',state,state),false);
});
