export function createAuthQueue(lookup, { capacity, queued = 64, timeoutMs }) {
  const waiting = [];
  let active = 0, stopped = false;
  const unavailable = code => Object.assign(Error("Authentication temporarily unavailable"), { statusCode: 503, code });
  function pump() {
    while (!stopped && active < capacity && waiting.length) {
      const task = waiting.shift();
      if (!task.isActive()) { task.finish(unavailable("AUTH_UNAVAILABLE")); continue; }
      active++;
      // A timed-out caller cannot free a slot while its actual query is still running.
      Promise.resolve().then(() => lookup(task.token)).then(
        user => task.finish(null, user), error => task.finish(error || unavailable("AUTH_UNAVAILABLE")),
      ).finally(() => { active--; pump(); });
    }
  }
  return {
    resolve(token, isActive = () => true) {
      if (stopped || waiting.length >= queued) return Promise.reject(unavailable("AUTH_BUSY"));
      return new Promise((resolve, reject) => {
        let settled = false, timer;
        const task = { token, isActive, finish(error, user) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          const index = waiting.indexOf(task); if (index !== -1) waiting.splice(index, 1);
          if (error) reject(error); else resolve(user);
        } };
        timer = setTimeout(() => task.finish(unavailable("AUTH_TIMEOUT")), timeoutMs); timer.unref?.();
        waiting.push(task); pump();
      });
    },
    stats: () => ({ authQueries: active, authWaiting: waiting.length }),
    stop() { stopped = true; for (const task of [...waiting]) task.finish(unavailable("AUTH_UNAVAILABLE")); },
  };
}
