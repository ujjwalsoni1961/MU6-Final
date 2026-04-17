// Enumerate all on-chain tokens for the MU6 DropERC721
const RPC = 'https://80002.rpc.thirdweb.com/64c9d6a04c2edcf1c8b117db980edd41';
const CONTRACT = '0xACF1145AdE250D356e1B2869E392e6c748c14C0E';

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

function padAddr(a) {
  return '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}
function uintHex(n) {
  return '0x' + n.toString(16).padStart(64, '0');
}
function hexToBigInt(h) {
  return BigInt(h);
}
function decodeAddress(topic) {
  return '0x' + topic.slice(26).toLowerCase();
}
function decodeString(data) {
  // ABI-encoded string: offset(32) + length(32) + bytes
  const hex = data.replace(/^0x/, '');
  const len = parseInt(hex.slice(64, 128), 16);
  const bytes = hex.slice(128, 128 + len * 2);
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) {
    s += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
  }
  return s;
}

async function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

async function ownerOf(tokenId) {
  // ownerOf(uint256) = 0x6352211e
  const res = await ethCall(CONTRACT, '0x6352211e' + uintHex(tokenId).slice(2));
  return decodeAddress(res);
}
async function tokenURI(tokenId) {
  // tokenURI(uint256) = 0xc87b56dd
  const res = await ethCall(CONTRACT, '0xc87b56dd' + uintHex(tokenId).slice(2));
  return decodeString(res);
}
async function totalSupply() {
  // totalSupply() = 0x18160ddd
  const res = await ethCall(CONTRACT, '0x18160ddd');
  return hexToBigInt(res);
}

async function main() {
  const total = await totalSupply();
  console.log('TOTAL_SUPPLY', total.toString());
  const tokens = [];
  for (let i = 0n; i < total; i++) {
    const owner = await ownerOf(i);
    let uri = '';
    try { uri = await tokenURI(i); } catch (e) { uri = 'ERR:' + e.message; }
    tokens.push({ id: Number(i), owner, uri });
    console.log(`${i}\t${owner}\t${uri}`);
  }
  // Write JSON file
  const fs = await import('fs');
  fs.writeFileSync('/home/user/workspace/MU6-Final/scripts/onchain_tokens.json', JSON.stringify(tokens, null, 2));
  console.log('\nSaved scripts/onchain_tokens.json');
}
main().catch(e => { console.error(e); process.exit(1); });
