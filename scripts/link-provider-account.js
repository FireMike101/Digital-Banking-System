import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import readline from 'node:readline/promises';
import { Customer } from '../src/models/customer.js';
import { Onboarding } from '../src/models/onboarding.js';
import { Account } from '../src/models/account.js';
import { linkProviderAccount } from '../src/services/link-provider-account.js';

const input = readline.createInterface({ input: process.stdin, output: process.stdout });
dns.setServers(['1.1.1.1', '1.0.0.1']);
try {
  const email = (await input.question('Existing app customer email: ')).trim();
  const accountNumber = (await input.question('Existing provider account number: ')).trim();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await Customer.init();
  await Onboarding.init();
  await Account.init();
  const result = await linkProviderAccount(email, accountNumber);
  console.log('Account linked successfully:', result);
} catch (error) {
  // Never print raw database errors, tokens, or connection strings.
  console.error(error.publicMessage ?? 'Linking failed. Check the database/provider connection. No new provider account was created.');
  process.exitCode = 1;
} finally {
  input.close();
  await mongoose.disconnect();
}
