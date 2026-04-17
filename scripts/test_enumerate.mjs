// Test the ownerOf-scan enumeration logic
const RPC_URL = 'https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41';
const CONTRACT = '0xACF1145AdE250D356e1B2869E392e6c748c14C0E';

async function rpc(method, params) {
  const r = await fetch(RPC_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method,params}) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

async function totalSupply() {
  const res = await rpc('eth_call', [{to: CONTRACT, data: '0x18160ddd'}, 'latest']);
  return BigInt(res);
}

async function ownerOf(id) {
  try {
    const data = '0x6352211e' + id.toString(16).padStart(64,'0');
    const res = await rpc('eth_call', [{to: CONTRACT, data}, 'latest']);
    if (!res || res === '0x') return null;
    return ('0x' + res.slice(-40)).toLowerCase();
  } catch { return null; }
}

async function enumerate(wallet) {
  const w = wallet.toLowerCase();
  const total = await totalSupply();
  console.log(`  totalSupply: ${total}`);
  const owned = [];
  const BATCH = 10;
  for (let start = 0n; start < total; start += BigInt(BATCH)) {
    const end = start + BigInt(BATCH) > total ? total : start + BigInt(BATCH);
    const ids = [];
    for (let i = start; i < end; i++) ids.push(i);
    const results = await Promise.all(ids.map(id => ownerOf(id)));
    ids.forEach((id, idx) => {
      if (results[idx] === w) owned.push(id.toString());
    });
  }
  return owned;
}

const WALLETS = [
  ['test wallet 1 (minter)', '0x0481d354a0f3f2867f1f3d1876ac3401aa1d3074'],
  ['test wallet 2 (buyer)',  '0xDdF40a97D5d9B8719732ec56F2C9066Ca5eE730C'],
];

for (const [name, w] of WALLETS) {
  console.log(`\n== ${name} ${w} ==`);
  const t0 = Date.now();
  const tokens = await enumerate(w);
  console.log(`  OWNED tokenIds: [${tokens.join(', ')}] (${Date.now()-t0}ms)`);
}
