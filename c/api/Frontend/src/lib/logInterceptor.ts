export const capturedLogs: string[] = [];

export function initLogInterceptor() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const pushLog = (type: string, ...args: any[]) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    capturedLogs.push(`[${new Date().toISOString()}] [${type}] ${message}`);
    if (capturedLogs.length > 100) capturedLogs.shift();
  };

  console.log = (...args) => { pushLog('LOG', ...args); originalLog(...args); };
  console.error = (...args) => { pushLog('ERROR', ...args); originalError(...args); };
  console.warn = (...args) => { pushLog('WARN', ...args); originalWarn(...args); };
}

export function getLogs() { return capturedLogs.join('\n'); }
