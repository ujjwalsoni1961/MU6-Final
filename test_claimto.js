const { createThirdwebClient, getContract, sendTransaction } = require('thirdweb');
const { claimTo } = require('thirdweb/extensions/erc721');
const { privateKeyToAccount } = require('thirdweb/wallets');
const { defineChain } = require('thirdweb/chains');

const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf8');

// I don't have the private key for the server wallet, it's stored in Engine.
console.log('We cannot sign locally without the private key.');
