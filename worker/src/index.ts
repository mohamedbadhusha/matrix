import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { TickEngine } from './tickEngine';
import { logger } from './logger';

// Validate required env vars
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  },
);

const engine = new TickEngine(supabase);

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down…');
  engine.stop();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err.message);
  // Keep running — Railway will restart if process exits
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', String(reason));
});

// Start
engine.start().catch((err) => {
  logger.error('Failed to start tick engine', err.message);
  process.exit(1);
});
