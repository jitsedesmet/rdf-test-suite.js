// Preload: wraps global fetch to count requests, statuses, errors and peak concurrency.
const orig = globalThis.fetch;
const stats = { requests: 0, statuses: {}, errors: {}, inflight: 0, peak: 0 };
globalThis.fetch = async(input, init) => {
  stats.requests++;
  stats.inflight++;
  stats.peak = Math.max(stats.peak, stats.inflight);
  try {
    const res = await orig(input, init);
    stats.statuses[res.status] = (stats.statuses[res.status] || 0) + 1;
    return res;
  } catch (e) {
    const k = (e.cause && (e.cause.code || e.cause.message)) || e.message;
    stats.errors[k] = (stats.errors[k] || 0) + 1;
    throw e;
  } finally {
    stats.inflight--;
  }
};
process.on('exit', () => {
  require('fs').writeFileSync(process.env.FETCH_STATS_FILE || '/dev/stderr', JSON.stringify(stats) + '\n', { flag: 'a' });
});
