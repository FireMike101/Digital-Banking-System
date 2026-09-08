import readline from 'node:readline/promises';
import { postToNibss } from '../src/services/nibss.js';

// This is a one-time bank setup command, not a customer registration route.
const input = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  const name = (await input.question('Bank name: ')).trim();
  const email = (await input.question('Email to receive API credentials: ')).trim();

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Enter a bank name and a valid email address. Nothing was submitted.');
    process.exitCode = 1;
  } else {
    // NibssByPhoenix sends the credentials by email. Do not print its response body.
    await postToNibss('/api/fintech/onboard', { name, email }, 200);
    console.log('Bank registration successful. Check your inbox and spam folder for API credentials.');
  }
} catch (error) {
  if (error.rejected) {
    console.error('The provider rejected registration. Check the bank details and whether this bank is already registered.');
  } else {
    console.error('Registration was not confirmed. Check your email before trying again; the provider may have received the request.');
  }
  process.exitCode = 1;
} finally {
  input.close();
}
