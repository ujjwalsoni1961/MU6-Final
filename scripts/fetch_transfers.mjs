// Fetch Transfer mint events from the NFT contract
const RPC = 'https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41';
const CONTRACT = '0xACF1145AdE250D356e1B2869E392e6c748c14C0E';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x' + '0'.repeat(64);

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

function decodeAddress(topic) {
  return '0x' + topic.slice(26).toLowerCase();
}

async function main() {
  const latestHex = await rpc('eth_blockNumber', []);
  const latest = BigInt(latestHex);
  console.log('Latest block', latest.toString());

  // Search back ~500k blocks which on Amoy at ~2s blocks = ~11 days; we know mints started ~2026-04-11
  // Expand to 1.5M blocks (~35 days) to be safe
  const span = 1500000n;
  const start = latest > span ? latest - span : 0n;
  const chunk = 50000n; // thirdweb recommended
  const mints = []; // { tokenId, to, block, txHash, logIndex }
  const transfers = []; // all transfers

  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const logs = await rpc('eth_getLogs', [{
      fromBlock: '0x' + from.toString(16),
      toBlock: '0x' + to.toString(16),
      address: CONTRACT,
      topics: [TRANSFER_TOPIC],
    }]);
    for (const log of logs) {
      const fromAddr = decodeAddress(log.topics[1]);
      const toAddr = decodeAddress(log.topics[2]);
      const tokenId = Number(BigInt(log.topics[3]));
      const block = Number(BigInt(log.blockNumber));
      transfers.push({ tokenId, from: fromAddr, to: toAddr, block, txHash: log.transactionHash });
      if (log.topics[1] === ZERO_TOPIC) {
        mints.push({ tokenId, to: toAddr, block, txHash: log.transactionHash });
      }
    }
    process.stdout.write(`.`);
  }
  console.log(`\nFound ${transfers.length} transfers, ${mints.length} mints`);

  mints.sort((a,b) => a.tokenId - b.tokenId);
  console.log('\nMints by tokenId:');
  for (const m of mints) {
    console.log(`  token ${m.tokenId}: -> ${m.to} @ block ${m.block} tx ${m.txHash}`);
  }

  const fs = await import('fs');
  fs.writeFileSync('/home/user/workspace/MU6-Final/scripts/transfers.json', JSON.stringify({ mints, transfers }, null, 2));
  console.log('\nSaved scripts/transfers.json');
}
main().catch(e => { console.error(e); process.exit(1); });
