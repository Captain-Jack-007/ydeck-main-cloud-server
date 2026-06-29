import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { startJobWorker } from './modules/decks/jobs.worker';
import { startSourceIndexWorker } from './modules/documents/sourceIndex.worker';
import { connectDB, disconnectDB } from './lib/db';
import { attachRealtimeServer } from './modules/realtime/socket';

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv },
      'YDeck main server started'
    );
  });
  attachRealtimeServer(server);

  // background worker for advancing deck jobs (in-memory MVP)
  const stopWorker = startJobWorker();
  // background worker that indexes uploaded book sources durably
  const stopSourceIndexWorker = startSourceIndexWorker();

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, 'Shutting down');
    stopWorker();
    stopSourceIndexWorker();
    server.close(() => logger.info('HTTP server closed'));
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error', err);
  process.exit(1);
});
