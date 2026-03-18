const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

module.exports = {
    stacks: {
        network: process.env.STACKS_NETWORK || 'testnet',
        apiUrl: process.env.STACKS_API_URL,
        vault: {
            address: process.env.VAULT_CONTRACT_ADDRESS,
            name: process.env.VAULT_CONTRACT_NAME,
        },
        relayerPrivateKey: process.env.RELAYER_STACKS_PRIVATE_KEY,
    },
    solana: {
        rpcUrl: process.env.SOLANA_RPC_URL,
        programId: process.env.SOLANA_PROGRAM_ID,
        ssolMint: process.env.SSOL_MINT_ADDRESS,
        relayerKey: JSON.parse(process.env.RELAYER_SOLANA_PRIVATE_KEY || '[]'),
    },
    relayer: {
        pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS) || 5000,
        dbPath: process.env.VERCEL ? '/tmp/aura-relayer.db' : (process.env.DB_PATH || './aura-relayer.db'),
        logLevel: process.env.LOG_LEVEL || 'info',
    },
};