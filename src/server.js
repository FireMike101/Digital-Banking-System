import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import { app } from './app.js';
import { Customer } from './models/customer.js';
import { Session } from './models/session.js';
import { Onboarding } from './models/onboarding.js';
import { Account } from './models/account.js';
import { safeDatabaseError } from './utils/database-error.js';

// npm start and npm run dev load .env using Node's --env-file option.
const PORT = Number(process.env.PORT || 3000);

// The default DNS resolver on this device refuses Atlas SRV/TXT lookups.
// Use Cloudflare for Node's DNS queries.
dns.setServers(['1.1.1.1', '1.0.0.1']);

async function startServer() {
  try {
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
      console.error('PORT must be a number between 1 and 65535.');
      process.exit(1);
    }

    // Connect to MongoDB before starting the Express server.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully.');

    // Wait for database rules that prevent duplicate emails and onboarding records.
    await Customer.init();
    await Session.init();
    await Onboarding.init();
    await Account.init();

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Swagger docs: http://localhost:${PORT}/api/docs/`);
    });
    server.on('error', (error) => {
      console.error('Server startup failed:', safeDatabaseError(error));
      process.exit(1);
    });
  } catch (error) {
    console.error('Database setup failed:', safeDatabaseError(error));
    // Mongoose can put the useful TLS/network error inside each server's description.
    for (const server of error.reason?.servers?.values() ?? []) {
      if (server.error) console.error('Server connection:', safeDatabaseError(server.error));
      if (server.error?.cause) console.error('Underlying cause:', safeDatabaseError(server.error.cause));
    }
    process.exit(1);
  }
}

startServer();
