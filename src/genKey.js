const { Keypair } = require('@solana/web3.js');

const keypair = Keypair.generate();
const secretKey = Array.from(keypair.secretKey);

console.log('--- NEW SOLANA KEYPAIR ---');
console.log('Public Key:', keypair.publicKey.toBase58());
console.log('Secret Key (Array):', JSON.stringify(secretKey));
console.log('--------------------------');
console.log('\nCopy the "Secret Key (Array)" into your relayer/.env as RELAYER_SOLANA_PRIVATE_KEY');
