export async function runPullJobs(definitions, run, report, now = () => new Date().toISOString()) {
  const jobs = [];
  await Promise.all(definitions.map(async ([name, script]) => {
    const job = { name, status: 'running', startedAt: now() };
    jobs.push(job);
    await report([...jobs]);
    try { await run(script); job.status = 'complete'; }
    catch (error) { job.status = 'failed'; job.error = error.message; }
    job.completedAt = now();
    await report([...jobs]);
  }));
  return jobs;
}
