import xrpl from "xrpl";
const { Client } = xrpl;

(async () => {
  const client = new Client('wss://s.devnet.rippletest.net:51233');
  await client.connect();
  
  // UserA from last run
  const userA = 'rfWfbpiRSx343KBzrAhVketMW5ac5iSYGs';
  
  const lines = await client.request({command: 'account_lines', account: userA});
  console.log('UserA TrustLines:');
  lines.result.lines?.forEach((l: any) => {
    console.log(`  ${l.currency}: balance=${l.balance}, no_ripple_peer=${l.no_ripple_peer}`);
  });
  
  await client.disconnect();
})();
