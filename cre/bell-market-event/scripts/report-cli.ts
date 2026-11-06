// Test-only FFI boundary. Solidity supplies its actual domain/nonce/state.
// No wallet, network, credentials, or authority changes occur in this script.
import { execute } from '../src/core.ts';
import { fixture } from '../tests/fixtures.ts';
const [chainId, oracle, receiver, forwarder, registry, assetId, sessionId, configHash, nonce, stateHash, now, price] = process.argv.slice(2);
if (!price)
    throw new Error('FFI_ARGUMENTS');
const f = fixture();
const config = { ...f.config, chainId, oracle, simulationReceiver: receiver, simulationForwarder: forwarder, registry, assetId, sessionId };
const bundle = { ...f.bundle, assetId, sessionId, configHash, calendar: { ...f.bundle.calendar, observedAt: now, validUntil: (BigInt(now!) + 100n).toString(), scheduledOpen: '1200', scheduledClose: '1500', scheduledReopen: '1501' }, primary: { ...f.bundle.primary, observedAt: now, price }, secondary: { ...f.bundle.secondary, observedAt: now, price }, corporate: { ...f.bundle.corporate, observedAt: now } };
const state = { ...f.state, chainId, oracle, receiver, forwarder, assetId, registryConfigHash: configHash, configEffectiveAt: '1001', nextNonce: nonce, stateHash, configHash, activeSessionId: sessionId, referencePrice: '100000000', session: { ...f.state.session, assetId, configHash, scheduledOpen: '1200', scheduledClose: '1500', closeObservedAt: '1500' } };
let payload = '';
const result = execute(config, { now: () => BigInt(now!), readState: () => state, observe: () => bundle, submit: (_target, bytes) => { payload = bytes; return { status: 'success' }; }, log: () => { } });
if (result.status !== 'submitted')
    throw new Error(`FFI_${result.status}_${result.reason}`);
process.stdout.write(payload);
