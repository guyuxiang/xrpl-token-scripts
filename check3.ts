import xrpl from "xrpl";
const { Client } = xrpl;

(async () => {
  const client = new Client('wss://s.devnet.rippletest.net:51233');
  await client.connect();
  
  // From last run
  const issuerA = 'rE4mP2HKr2S24S2pHT6WBBHJSfMdff1zZE';
  const issuerB = 'rMbb5aidcCBTgfKWxFgS28KXeFjr9L45LE';
  const userA = 'rfWfbpiRSx343KBzrAhVketMW5ac5iSYGs';
  const userB = 'rPrJYDSPzZoatPsk7dd2o2PgwSGqTkW9Nq';
  
  console.log('=== UserA Account Info ===');
  const infoA = await client.request({command: 'account_info', account: userA});
  console.log('Sequence:', infoA.result.account_data.Sequence);
  console.log('Balance (XRP):', infoA.result.account_data.Balance);
  
  console.log('\n=== UserA TrustLines ===');
  const linesA = await client.request({command: 'account_lines', account: userA});
  linesA.result.lines?.forEach((l: any) => {
    console.log(`  ${l.currency} from ${l.account}: balance=${l.balance}, no_ripple=${l.no_ripple_peer}`);
  });
  
  console.log('\n=== UserA Offers ===');
  const offersA = await client.request({command: 'account_offers', account: userA});
  console.log(JSON.stringify(offersA.result.offers, null, 2));
  
  console.log('\n=== Order Book: ROR/RLSD ===');
  const orderbook = await client.request({
    command: 'book_offers',
    taker_gets: { currency: '524C534400000000000000000000000000000000', issuer: issuerB },
    taker_pays: { currency: 'ROR', issuer: issuerA },
    limit: 10
  });
  console.log('Offers:', JSON.stringify(orderbook.result.offers, null, 2));
  
  await client.disconnect();
})();
