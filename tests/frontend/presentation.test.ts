import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './fixtures.ts';
import {demoProgress,displayAmount} from '../../src/state/presentation.ts';
test('missing evidence is not a completed demo',()=>{assert.equal(demoProgress(undefined,'').stage,'readiness');assert.equal(displayAmount(undefined),'—');assert.equal(displayAmount('0'),'0');});
test('demo follows the selected loan session rather than another receipt',()=>{const {frame,session}=sample();frame.state.receipts['88']={receipt:{loanId:99n,status:2n,consent:{sessionId:session}},benchmark:{finalized:true}};assert.equal(demoProgress(frame,'7').stage,'cover');});
test('settlement requires an ended receipt for the selected loan',()=>{const {frame,session}=sample();frame.state.receipts['12']={receipt:{loanId:7n,status:2n,consent:{sessionId:session}},benchmark:{finalized:true}};assert.equal(demoProgress(frame,'7').stage,'outcome');});
test('formatting never rounds a tiny nonzero fee to zero',()=>{assert.equal(displayAmount('0.000001'),'0.000001');assert.equal(displayAmount('499.123456'),'499.12');});

test('a previous ended cover does not complete a new market session',()=>{const {frame,session}=sample();frame.state.receipts['12']={receipt:{loanId:7n,status:2n,consent:{sessionId:'previous-session'}},benchmark:{finalized:true}};assert.equal(demoProgress(frame,'7').stage,'cover');});
