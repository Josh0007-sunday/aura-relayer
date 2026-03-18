const anchor = require('@project-serum/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const https = require('https');
const fetch = require('node-fetch');
const config = require('./config');
const store = require('./nonceStore');
const logger = require('./logger');
const idl = require('../../contracts/solana/idl.json');

// Force IPv4 to prevent Node 20+ AggregateError timeouts on Helius / RPCs
const connection = new Connection(config.solana.rpcUrl, {
    commitment: 'confirmed',
    fetch: (url, options) => {
        return fetch(url, {
            ...options,
            agent: new https.Agent({ family: 4 })
        });
    }
});
const relayerKeypair = Keypair.fromSecretKey(Uint8Array.from(config.solana.relayerKey));
const wallet = new anchor.Wallet(relayerKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: 'confirmed',
});
const program = new anchor.Program(
    idl,
    new PublicKey(config.solana.programId),
    provider,
);

async function getBridgeStatePda() {
    const [pda] = await PublicKey.findProgramAddress(
        [Buffer.from('bridge-state')],
        new PublicKey(config.solana.programId),
    );
    return pda;
}

async function mintSsol(recipientBase58, amount, stacksTxId) {
    const mintPubkey = new PublicKey(config.solana.ssolMint);
    const recipientPubkey = new PublicKey(recipientBase58);

    const recipientAta = await getOrCreateAssociatedTokenAccount(
        connection,
        relayerKeypair,
        mintPubkey,
        recipientPubkey,
    );

    const tx = await program.methods
        .mintSsol(new anchor.BN(amount.toString()), stacksTxId)
        .accounts({
            ssolMint: mintPubkey,
            recipientAta: recipientAta.address,
            mintAuthority: relayerKeypair.publicKey,
            bridgeState: await getBridgeStatePda(),
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([relayerKeypair])
        .rpc();

    return tx;
}

const seenSigs = new Set();

async function fetchNewBurnEvents() {
    const sigs = await connection.getSignaturesForAddress(
        new PublicKey(config.solana.programId),
        { limit: 20 },
    );

    // HEARTBEAT: Move to debug to avoid log bloat
    if (sigs.length > 0) logger.debug(`[SOLANA] Synced signatures | Count: ${sigs.length}`);

    const burns = [];
    for (const sigInfo of sigs) {
        if (store.isBurnProcessed(sigInfo.signature) || seenSigs.has(sigInfo.signature)) continue;

        seenSigs.add(sigInfo.signature);

        try {
            const tx = await connection.getTransaction(sigInfo.signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            });
            if (!tx) {
                logger.warn(`Could not fetch tx details for ${sigInfo.signature}`);
                continue;
            }

            const burnEvent = parseBurnEvent(tx);
            if (burnEvent) {
                logger.info(`[SOLANA] BurnEvent detected | tx: ${sigInfo.signature.slice(0, 8)}...`);
                burns.push({ ...burnEvent, solanaSig: sigInfo.signature });
            } else {
                // Not a burn event (e.g. mintSsol or other init instruction)
            }
        } catch (err) {
            seenSigs.delete(sigInfo.signature); // Remove so we retry next loop
            if (err.message.includes('429')) {
                logger.warn(`Solana RPC rate limit hit. Delaying next fetch...`);
                break; // Stop fetching this loop to let rate limit reset
            }
            logger.error(`Error fetching tx ${sigInfo.signature}: ${err.message}`);
        }
    }
    return burns;
}

function parseBurnEvent(tx) {
    const logs = tx.meta?.logMessages || [];
    for (const log of logs) {
        if (!log.startsWith('Program data:')) continue;
        try {
            const b64 = log.replace('Program data: ', '');
            const decoded = program.coder.events.decode(b64);
            if (decoded?.name === 'BurnEvent') {
                return {
                    ...decoded.data,
                    amount: decoded.data.amount.toString(),
                    burner: decoded.data.burner.toString()
                };
            }
        } catch { }
    }
    return null;
}

module.exports = { mintSsol, fetchNewBurnEvents };
