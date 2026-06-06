import { createConnection } from 'node:net';

interface LeasedJob {
  id: string;
  template: string;
  renderedText: string;
  attemptNumber: number;
  printer: {
    key: string;
    name: string;
    connectionType: string;
    host: string | null;
    port: number | null;
    autoCut: boolean;
    buzzer: boolean;
  };
}

const apiBaseUrl = required('PRINTER_API_BASE_URL').replace(/\/$/, '');
const agentId = required('PRINTER_AGENT_ID');
const agentKey = required('PRINTER_AGENT_KEY');
const appVersion = process.env.PRINTER_AGENT_VERSION ?? '0.1.0';
const pollIntervalMs = numberEnv('PRINTER_POLL_INTERVAL_MS', 2_000);
const socketTimeoutMs = numberEnv('PRINTER_SOCKET_TIMEOUT_MS', 10_000);

let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

async function main(): Promise<void> {
  console.log(`Printer agent ${agentId} starting against ${apiBaseUrl}`);
  let nextHeartbeat = 0;

  while (!stopping) {
    try {
      if (Date.now() >= nextHeartbeat) {
        await apiRequest('/printer-agent/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ appVersion }),
        });
        nextHeartbeat = Date.now() + 30_000;
      }

      const lease = await apiRequest<{ job: LeasedJob | null }>(
        '/printer-agent/jobs/lease',
        { method: 'POST', body: '{}' },
      );
      if (!lease.job) {
        await sleep(pollIntervalMs);
        continue;
      }

      await processJob(lease.job);
    } catch (error) {
      console.error('Printer agent loop error:', errorMessage(error));
      await sleep(Math.max(pollIntervalMs, 5_000));
    }
  }

  console.log('Printer agent stopped.');
}

async function processJob(job: LeasedJob): Promise<void> {
  console.log(
    `Printing job ${job.id} on ${job.printer.name}, attempt ${job.attemptNumber}`,
  );
  try {
    if (job.printer.connectionType !== 'ESC_POS_LAN') {
      throw new Error(
        `Local agent does not yet support ${job.printer.connectionType}.`,
      );
    }
    if (!job.printer.host || !job.printer.port) {
      throw new Error('Printer host and port are required.');
    }

    await sendEscPos(job);
    await reportWithRetry(
      `/printer-agent/jobs/${job.id}/complete`,
      'Printed successfully.',
    );
    console.log(`Print job ${job.id} completed.`);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`Print job ${job.id} failed: ${message}`);
    await reportWithRetry(`/printer-agent/jobs/${job.id}/fail`, message);
  }
}

function sendEscPos(job: LeasedJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: job.printer.host!,
      port: job.printer.port!,
    });
    const timeout = setTimeout(() => {
      socket.destroy(new Error('Printer connection timed out.'));
    }, socketTimeoutMs);

    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once('connect', () => {
      const initialize = Buffer.from([0x1b, 0x40]);
      const text = Buffer.from(`${job.renderedText}\n`, 'utf8');
      const buzzer = job.printer.buzzer
        ? Buffer.from([0x1b, 0x42, 0x03, 0x02])
        : Buffer.alloc(0);
      const cut = job.printer.autoCut
        ? Buffer.from([0x1d, 0x56, 0x00])
        : Buffer.alloc(0);
      socket.write(Buffer.concat([initialize, text, buzzer, cut]), (error) => {
        clearTimeout(timeout);
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        socket.end();
        resolve();
      });
    });
  });
}

async function reportWithRetry(path: string, message: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-printer-agent-id': agentId,
      'x-printer-agent-key': agentKey,
      ...init.headers,
    },
  });
  const body = (await response.json()) as T & {
    error?: { message?: string | string[] };
  };
  if (!response.ok) {
    throw new Error(
      Array.isArray(body.error?.message)
        ? body.error.message.join(', ')
        : (body.error?.message ?? `API returned ${response.status}`),
    );
  }
  return body;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
