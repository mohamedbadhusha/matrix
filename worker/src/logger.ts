type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const COLORS: Record<Level, string> = {
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  DEBUG: '\x1b[90m',
};
const RESET = '\x1b[0m';

function log(level: Level, message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const color = COLORS[level];
  const dataStr = data !== undefined ? ' ' + JSON.stringify(data) : '';
  console.log(`${color}[${ts}] [${level}]${RESET} ${message}${dataStr}`);
}

export const logger = {
  info: (msg: string, data?: unknown) => log('INFO', msg, data),
  warn: (msg: string, data?: unknown) => log('WARN', msg, data),
  error: (msg: string, data?: unknown) => log('ERROR', msg, data),
  debug: (msg: string, data?: unknown) => log('DEBUG', msg, data),
};
