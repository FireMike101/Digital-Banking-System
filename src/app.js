import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { authRouter } from './routes/auth.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from './docs/swagger.js';
import { onboardingRouter } from './routes/onboarding.js';
import { accountRouter } from './routes/accounts.js';
import { transactionRouter } from './routes/transactions.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
// Limit request sizes so clients cannot submit arbitrarily large JSON bodies.
app.use(express.json({ limit: '16kb' }));

app.get('/api/docs.json', (req, res) => res.json(swaggerDocument));
// Swagger uses an inline style; keep this exception limited to the documentation page.
app.use('/api/docs', helmet({ contentSecurityPolicy: { directives: {
  'style-src': ["'self'", "'unsafe-inline'"],
  'upgrade-insecure-requests': null,
} } }), swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  swaggerOptions: { persistAuthorization: false, validatorUrl: null },
}));

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    message: connected ? 'Service is ready.' : 'Database is unavailable.',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/transactions', transactionRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Express recognizes error middleware by its four arguments.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (['MongoNetworkError', 'MongoServerSelectionError', 'MongooseServerSelectionError'].includes(err.name)) {
    return res.status(503).json({ success: false, message: 'Database is temporarily unavailable. Please try again later.' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body must contain valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: 'Invalid request.' });
  }

  // Avoid returning stack traces or logging request bodies that may contain private data.
  console.error('Unexpected request error:', err.name);
  res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
});
