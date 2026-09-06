import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import { app } from './app.js';
import { Customer } from './models/customer.js';
import { Session } from './models/session.js';
import { Onboarding } from './models/onboarding.js';

// npm start and npm run dev load .env using Node's --env-file option.
const PORT = Number(process.env.PORT || 3000);

// The default DNS resolver on this device refuses Atlas SRV/TXT lookups.
// Use Cloudflare for Node's DNS queries; this does not change Windows DNS settings.
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

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Swagger docs: http://localhost:${PORT}/api/docs/`);
    });
    server.on('error', () => {
      console.error('Server could not start. Check whether the port is already in use.');
      process.exit(1);
    });
  } catch {
    // Do not print connection details because they may contain the database password.
    console.error('Database setup failed. Check MONGODB_URI and your MongoDB connection.');
    process.exit(1);
  }
}

startServer();
