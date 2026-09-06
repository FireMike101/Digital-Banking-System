const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI?.trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!mongoUri || !/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
  throw new Error('Set MONGODB_URI to a valid MongoDB connection URI in .env.');
}

export const env = { port, mongoUri };
