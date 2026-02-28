import xrpl from "xrpl";
const { Client } = xrpl;

(async () => {
  const client = new Client('wss://s.devnet.rippletest.net:51233');
  await client.connect();
  
  // Check from latest run
  const issuerA = 'rprfmC8QzesGPK1LPLXzMh1dqfcMBY7RTG';
  const userA = 'rKeNErhBRuM4q3hFjCG2D9NHKdgJnUe8n8';
  
  console.log('=== IssuerA self-issuance check ===');
  const linesI = await client.request({command: 'account_lines', account: issuerA});
  console.log('IssuerA lines:', linesI.result.lines);
  
  console.log('\n=== UserA check ===');
  const linesU = await client.request({command: 'account_lines', account: userA});
  console.log('UserA lines:', linesU.result.lines);
  
  console.log('\n=== UserA balance check ===');
  const bal = await client.request({
    command: 'ledger_entry',    
    index: '00000000000000000000000000000000000000000000556E000000000002'
  });
  // Try another way
  const acc = await client.request({command: 'account_info', account: userA});
  console.log('Account data:', acc.result.account_data);
  
  await client.disconnect();
})();
