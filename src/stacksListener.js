const axios = require('axios');
const https = require('https');
const config = require('./config');
const store = require('./nonceStore');
const solana = require('./solanaClient');
const logger = require('./logger');

const { apiUrl, vault } = config.stacks;
const CONTRACT_ID = `${vault.address}.${vault.name}`;

async function fetchNewDepositEvents() {
    const url = `${apiUrl}/extended/v1/contract/${CONTRACT_ID}/events`;
    const res = await axios.get(url, {
        params: { limit: 20, offset: 0 }, // Always check latest 20 events
        httpsAgent: new https.Agent({ family: 4 })
    });

    const events = res.data.results || [];
    if (events.length === 0) return;

    logger.debug(`[STACKS] Synced events | Count: ${events.length}`);

    for (const event of events) {
        try {
            await handleEvent(event);
        } catch (err) {
            logger.error(`[STACKS] Process Error | tx: ${event.tx_id.slice(0, 8)}... | ${err.message}`);
        }
    }
}

async function handleEvent(event) {
    if (event.event_type !== 'smart_contract_log') return;

    const raw = event.contract_log?.value?.repr;
    if (!raw) return;

    const parsed = parseClarityTuple(raw);
    if (!parsed || parsed.event !== 'stx-deposited') return;

    const { depositor, amount, solanaRecipient, nonce } = parsed;
    const stacksTxId = event.tx_id;

    if (store.isDepositProcessed(stacksTxId)) {
        // Silently skip processed events to keep logs clean
        return;
    }

    logger.info(`[STACKS] Deposit: ${amount} uSTX | ${depositor.slice(0, 8)}... -> ${solanaRecipient.slice(0, 8)}...`);

    try {
        const sig = await solana.mintSsol(solanaRecipient, BigInt(amount), stacksTxId);
        store.markDepositProcessed(stacksTxId, solanaRecipient, amount);
        logger.info(`[SOLANA] Mint Success | sig: ${sig.slice(0, 10)}...`);
    } catch (err) {
        if (err.message && err.message.includes('AlreadyProcessed')) {
            // If already processed on chain but not in our store, sync the store
            store.markDepositProcessed(stacksTxId, solanaRecipient, amount);
            logger.debug(`[SOLANA] Mint Sync | req: ${stacksTxId.slice(0, 8)}... | Already processed on-chain.`);
            return;
        }
        logger.error(`[SOLANA] Mint Failure | req: ${stacksTxId.slice(0, 8)}... | ${err.message}`);
    }
}

// Parses Clarity tuple repr into a plain JS object.
// Use @stacks/transactions ClarityValue deserialization in production.
function parseClarityTuple(repr) {
    try {
        const obj = {};
        // Match (key val) pairs where val can be: u123, "string", or 'ST123 (principal)
        const matches = repr.matchAll(/\(([\w-]+)\s+(?:u(\d+)|"([^"]+)"|'([A-Z0-9]+))\)/g);
        for (const m of matches) {
            const key = m[1];
            const val = m[2] ?? m[3] ?? m[4];
            const camel = key.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
            obj[camel] = val;
        }
        return obj;
    } catch {
        return null;
    }
}

module.exports = { fetchNewDepositEvents };