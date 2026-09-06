import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';

// Fail promptly when MongoDB is unavailable rather than silently buffering operations.
mongoose.set('bufferCommands', false);

let server;
let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  // Bound shutdown time in case an open connection never finishes.
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await mongoose.disconnect();
    process.exitCode = exitCode;
  } catch {
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

try {
  // Only accept HTTP requests after the database connection succeeds.
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  server = app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
  server.on('error', (error) => {
    console.error('HTTP server failed:', error.code ?? error.name);
    void shutdown(1);
  });
} catch (error) {
  // Connection error messages can contain credentials, so log only the error type.
  console.error('Database startup failed. Check MongoDB and MONGODB_URI. Type:', error.name);
  await shutdown(1);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
