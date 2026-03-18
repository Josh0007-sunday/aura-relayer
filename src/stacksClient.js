const {
    makeContractCall,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    principalCV,
    uintCV,
    stringAsciiCV,
} = require('@stacks/transactions');
const { STACKS_TESTNET, STACKS_MAINNET } = require('@stacks/network');
const fetch = require('node-fetch');
const https = require('https');
const config = require('./config');
const logger = require('./logger');

const network = config.stacks.network === 'mainnet'
    ? STACKS_MAINNET
    : STACKS_TESTNET;

const customFetch = (url, options) => {
    return fetch(url, {
        ...options,
        agent: new https.Agent({ family: 4 })
    });
};

async function releaseStx(stacksRecipient, amount, nonce) {
    const txOptions = {
        contractAddress: config.stacks.vault.address,
        contractName: config.stacks.vault.name,
        functionName: 'release-stx',
        functionArgs: [
            principalCV(stacksRecipient),
            uintCV(amount),
            stringAsciiCV(nonce),
        ],
        senderKey: config.stacks.relayerPrivateKey,
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        fee: 2000,
    };

    const transaction = await makeContractCall(txOptions);
    const result = await broadcastTransaction({
        transaction,
        network,
        client: { fetch: customFetch }
    });

    if (result.error) {
        throw new Error(`Broadcast failed: ${result.error} — ${result.reason}`);
    }

    logger.info(`release-stx broadcast. txid: ${result.txid}`);
    return result.txid;
}

module.exports = { releaseStx };