const config = require('../src/config');
const logger = require('../src/logger');
const stacksListener = require('../src/stacksListener');
const stacksClient = require('../src/stacksClient');
const solanaClient = require('../src/solanaClient');
const store = require('../src/nonceStore');
const express = require('express');
const cors = require('cors');

// Retry helper: retries a fn up to maxRetries times with exponential backoff.
async function withRetry(fn, maxRetries = 3, baseDelayMs = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = baseDelayMs * Math.pow(2, attempt);
            logger.warn(`Attempt ${attempt + 1} failed (${err.message}). Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

logger.info('Aura Bridge Relayer starting...');
logger.info(`  Stacks : ${config.stacks.network}`);
logger.info(`  Solana : ${config.solana.network}`);
logger.info(`  Poll   : ${config.relayer.pollIntervalMs}ms`);

let isDepositing = false;
async function runDepositLoop() {
    if (isDepositing) return;
    isDepositing = true;
    try {
        await stacksListener.fetchNewDepositEvents();
    } catch (err) {
        logger.error(`Deposit loop error: ${err.message || err.toString()}`);
    } finally {
        isDepositing = false;
    }
}

let isWithdrawing = false;
async function runWithdrawLoop() {
    if (isWithdrawing) return;
    isWithdrawing = true;
    try {
        const burns = await withRetry(() => solanaClient.fetchNewBurnEvents());
        for (const burn of burns) {
            const { stacksRecipient, amount, nonce, solanaSig } = burn;
            if (store.isBurnProcessed(solanaSig)) continue;

            logger.info(`[SOLANA] Burn | amount: ${amount} | tx: ${solanaSig.slice(0, 10)}...`);
            logger.info(`[STACKS] Releasing STX -> ${stacksRecipient.slice(0, 8)}...`);

            try {
                const txid = await stacksClient.releaseStx(stacksRecipient, amount, nonce);
                store.markBurnProcessed(solanaSig, stacksRecipient, amount);
                logger.info(`[STACKS] Release Success | txid: ${txid.slice(0, 10)}...`);
            } catch (err) {
                logger.error(`Release failed: ${err.message}`);
            }
        }
    } catch (err) {
        // Only log once after all retries are exhausted
        logger.error(`Withdraw loop error (all retries failed): ${err.message || err.toString()}`);
    } finally {
        isWithdrawing = false;
    }
}

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Aura Bridge Relayer',
        network: {
            stacks: config.stacks.network,
            solana: config.solana.network
        }
    });
});

app.get('/status/:id', (req, res) => {
    const { id } = req.params;
    const isProcessed = store.isDepositProcessed(id) || store.isBurnProcessed(id);
    res.json({
        id,
        status: isProcessed ? 'Confirmed' : 'Processing'
    });
});

async function main() {
    logger.info('Starting background loops...');
    await Promise.all([runDepositLoop(), runWithdrawLoop()]);
    setInterval(runDepositLoop, config.relayer.pollIntervalMs);
    setInterval(runWithdrawLoop, config.relayer.pollIntervalMs);
}

// Start background loops
main().catch(err => {
    logger.error(`Fatal Loop Error: ${err.message}`);
});

// For Vercel, we export the app
// For local dev, we also start the listener
if (require.main === module) {
    app.listen(port, () => {
        logger.info(`Relayer API listening on port ${port}`);
    });
}

module.exports = app;