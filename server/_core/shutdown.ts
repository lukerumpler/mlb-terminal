import type { Server } from "http";

export interface ShutdownOptions {
  /** Hard deadline for in-flight requests before the process is forced to exit. */
  timeoutMs?: number;
  signals?: NodeJS.Signals[];
  /** Injectable for tests; defaults to the real process. */
  proc?: Pick<NodeJS.Process, "on" | "off">;
  exit?: (code: number) => void;
  log?: (message: string) => void;
  /** Runs after the server has stopped accepting connections (close pools, flush, ...). */
  onClose?: () => Promise<void> | void;
}

/**
 * Stop cleanly on SIGTERM/SIGINT: refuse new connections, let in-flight requests
 * finish, close idle keep-alive sockets, then exit. A host that scales in sends
 * SIGTERM; without this, in-flight requests (and ingestion batches) are cut off.
 * A second signal, or the timeout, forces the exit.
 */
export function installGracefulShutdown(
  server: Server,
  options: ShutdownOptions = {}
): () => void {
  const timeoutMs =
    options.timeoutMs ??
    (Number(process.env.SHUTDOWN_TIMEOUT_MS) > 0
      ? Number(process.env.SHUTDOWN_TIMEOUT_MS)
      : 10_000);
  const signals = options.signals ?? ["SIGTERM", "SIGINT"];
  const proc = options.proc ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((m: string) => console.log(m));
  let shuttingDown = false;

  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      log(`[shutdown] ${signal} received again; exiting now`);
      exit(1);
      return;
    }
    shuttingDown = true;
    log(`[shutdown] ${signal} received; draining connections`);

    const timer = setTimeout(() => {
      log(`[shutdown] drain exceeded ${timeoutMs}ms; forcing exit`);
      exit(1);
    }, timeoutMs);
    timer.unref();

    // A connection that finishes its last request after shutdown began turns idle
    // (keep-alive) and would otherwise hold close() open until keepAliveTimeout.
    // Sweep idle sockets until the server has closed.
    const closeIdle = () =>
      (
        server as Server & { closeIdleConnections?: () => void }
      ).closeIdleConnections?.();
    const sweeper = setInterval(closeIdle, 50);
    sweeper.unref();

    server.close(async error => {
      clearTimeout(timer);
      clearInterval(sweeper);
      if (error) {
        log(`[shutdown] close failed: ${error.message}`);
        exit(1);
        return;
      }
      try {
        await options.onClose?.();
        log("[shutdown] clean exit");
        exit(0);
      } catch (closeError) {
        log(
          `[shutdown] onClose failed: ${closeError instanceof Error ? closeError.message : String(closeError)}`
        );
        exit(1);
      }
    });
    closeIdle();
  };

  for (const signal of signals) proc.on(signal, handler);
  return () => {
    for (const signal of signals) proc.off(signal, handler);
  };
}
