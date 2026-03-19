// Initialization script for deployed Aura Bridge Solana program.
// Uses the existing ssol-mint-keypair.json and relayer keypair from .env.
//
// Run: node src/init.js
//
require('dotenv').config();
const anchor = require('@project-serum/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');
const idl = require('./idl/idl.json');
const logger = require('./logger');

async function init() {
    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    const relayerKey = JSON.parse(process.env.RELAYER_SOLANA_PRIVATE_KEY);
    const relayerKeypair = Keypair.fromSecretKey(Uint8Array.from(relayerKey));

    logger.info(`Relayer: ${relayerKeypair.publicKey.toBase58()}`);

    const wallet = new anchor.Wallet(relayerKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
    const programId = new PublicKey(process.env.SOLANA_PROGRAM_ID);
    const program = new anchor.Program(idl, programId, provider);

    // ── Mint ────────────────────────────────────────────────────────────────
    // Use the pre-generated keypair if it exists, otherwise generate a new one.
    const mintKeypairPath = '/home/joshua/ssol-mint-keypair.json';
    let mintKeypair;
    if (fs.existsSync(mintKeypairPath)) {
        const raw = JSON.parse(fs.readFileSync(mintKeypairPath, 'utf-8'));
        mintKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
        logger.info(`Loaded existing mint keypair: ${mintKeypair.publicKey.toBase58()}`);
    } else {
        mintKeypair = Keypair.generate();
        logger.info(`Generated new mint: ${mintKeypair.publicKey.toBase58()}`);
    }

    // ── Bridge State PDA ──────────────────────────────────────────────────
    const [bridgeStatePda] = await PublicKey.findProgramAddress(
        [Buffer.from('bridge-state')],
        programId
    );
    logger.info(`Bridge State PDA: ${bridgeStatePda.toBase58()}`);

    // Check if already initialized
    const pda = await connection.getAccountInfo(bridgeStatePda);
    if (pda) {
        logger.info('Bridge state already initialized — skipping initializeBridge.');
    }

    try {
        // 1. Initialize Mint
        const tx1 = await program.methods
            .initializeMint()
            .accounts({
                ssolMint: mintKeypair.publicKey,
                mintAuthority: relayerKeypair.publicKey, // relayer is the authority
                payer: relayerKeypair.publicKey,
                systemProgram: SystemProgram.programId,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([mintKeypair, relayerKeypair])
            .rpc();
        logger.info(`✅ Mint initialized: ${tx1}`);
    } catch (e) {
        logger.warn(`initializeMint: ${e.message} (may already exist, continuing...)`);
    }

    if (!pda) {
        try {
            // 2. Initialize Bridge State
            const tx2 = await program.methods
                .initializeBridge()
                .accounts({
                    bridgeState: bridgeStatePda,
                    payer: relayerKeypair.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([relayerKeypair])
                .rpc();
            logger.info(`✅ Bridge state initialized: ${tx2}`);
        } catch (e) {
            logger.error(`initializeBridge failed: ${e.message}`);
        }
    }

    logger.info('');
    logger.info('=== UPDATE RELAYER .env ===');
    logger.info(`SSOL_MINT_ADDRESS=${mintKeypair.publicKey.toBase58()}`);
}

init();
