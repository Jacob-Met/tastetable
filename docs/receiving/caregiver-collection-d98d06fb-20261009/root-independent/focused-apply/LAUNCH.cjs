'use strict';
const fs = require('node:fs');
(async () => {
  const packet = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const main = eval('(' + packet.receiverSource + '\n)');
  const receipt = await main(packet);
  process.stdout.write(JSON.stringify(receipt) + '\n');
  process.exitCode = receipt.status === 'passed' ? 0 : 2;
})().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 2; });
