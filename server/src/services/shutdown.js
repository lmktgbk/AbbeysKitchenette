export function createShutdown({ readiness, getServer, getRealtime, workers, disconnect, exit, graceMs = 20000 }) {
  let flight;
  return function shutdown() {
    if (flight) return flight;
    readiness.beginShutdown();
    const server = getServer();
    const realtime = getRealtime();
    // The hard deadline also covers peers that never acknowledge WebSocket close.
    const deadline = setTimeout(() => {
      for (const socket of realtime?.wss.clients ?? []) socket.terminate();
      server?.closeAllConnections();
      console.error("[shutdown] Drain deadline exceeded");
      exit(1);
    }, graceMs);
    flight = (async () => {
      try {
        realtime?.stop();
        for (const socket of realtime?.wss.clients ?? []) socket.close(1001, "server shutting down");
        const drained = new Promise((resolve, reject) => {
          if (!server?.listening) return resolve();
          server.close(error => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
        await Promise.all([drained, ...workers.map(worker => worker.stop())]);
        // Keep the pool open until admitted HTTP requests and workers finish.
        await disconnect();
        clearTimeout(deadline);
        exit(0);
      } catch {
        clearTimeout(deadline);
        console.error("[shutdown] Graceful drain failed");
        exit(1);
      }
    })();
    return flight;
  };
}
