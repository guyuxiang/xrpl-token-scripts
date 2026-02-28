import xrpl from "xrpl";
const { Client } = xrpl;

(async () => {
  const client = new Client('wss://s.devnet.rippletest.net:51233');
  await client.connect();
  
  // UserA from last run
  const userA = 'rBmG8h6FEpHRBBi9ZPpUKHjzNwYaXYoupy';
  
  const lines = await client.request({command: 'account_lines', account: userA});
  console.log('UserA TrustLines:', JSON.stringify(lines.result.lines, null, 2));
  
  const offers = await client.request({command: 'account_offers', account: userA});
  console.log('UserA Offers:', JSON.stringify(offers.result.offers, null, 2));
  
  await client.disconnect();
})();
