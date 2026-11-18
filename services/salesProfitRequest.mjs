// Serialize expensive snapshot requests so polling/multiple tabs cannot allocate
// several decrypted finance reports and detail tables at the same time.
let queue = Promise.resolve();
export async function withSalesProfitRequest(work) {
  const previous = queue;
  let release;
  queue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}
