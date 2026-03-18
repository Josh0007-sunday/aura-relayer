const Database = require('better-sqlite3');
const config = require('./config');

let db;

function getDb() {
    if (!db) {
        db = new Database(config.relayer.dbPath);
        db.exec(`
      CREATE TABLE IF NOT EXISTS processed_deposits (
        stacks_tx_id     TEXT PRIMARY KEY,
        solana_recipient TEXT NOT NULL,
        amount           INTEGER NOT NULL,
        processed_at     INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed_burns (
        solana_sig       TEXT PRIMARY KEY,
        stacks_recipient TEXT NOT NULL,
        amount           INTEGER NOT NULL,
        processed_at     INTEGER NOT NULL
      );
    `);
    }
    return db;
}

function isDepositProcessed(stacksTxId) {
    const row = getDb()
        .prepare('SELECT 1 FROM processed_deposits WHERE stacks_tx_id = ?')
        .get(stacksTxId);
    return !!row;
}

function markDepositProcessed(stacksTxId, solanaRecipient, amount) {
    getDb()
        .prepare('INSERT OR IGNORE INTO processed_deposits (stacks_tx_id, solana_recipient, amount, processed_at) VALUES (?, ?, ?, ?)')
        .run(stacksTxId, solanaRecipient, amount, Date.now());
}

function isBurnProcessed(solanaSig) {
    const row = getDb()
        .prepare('SELECT 1 FROM processed_burns WHERE solana_sig = ?')
        .get(solanaSig);
    return !!row;
}

function markBurnProcessed(solanaSig, stacksRecipient, amount) {
    getDb()
        .prepare('INSERT OR IGNORE INTO processed_burns (solana_sig, stacks_recipient, amount, processed_at) VALUES (?, ?, ?, ?)')
        .run(solanaSig, stacksRecipient, amount, Date.now());
}

module.exports = {
    isDepositProcessed,
    markDepositProcessed,
    isBurnProcessed,
    markBurnProcessed,
};