// Swagger describes our routes so they can be explored and tested in a browser.
const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const customerResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    customer: { $ref: '#/components/schemas/Customer' },
  },
};
const jsonResponse = (description, schema) => ({ description, content: { 'application/json': { schema } } });
const credentials = {
  email: { type: 'string', format: 'email', example: 'customer@example.com' },
  password: { type: 'string', format: 'password', minLength: 12, description: 'At most 72 UTF-8 bytes.', example: 'testing-password-123' },
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Digital Banking API', version: '1.0.0',
    description: 'Learning project. Register, log in, then paste the returned token into Authorize. Use only fictional customer information. Registration does not create a bank account.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Paste the token from login, without the word Bearer. Tokens expire after one hour.' },
    },
    schemas: {
      Account: {
        type: 'object', properties: {
          accountNumber: { type: 'string', example: '1234567890' },
          accountName: { type: 'string', example: 'Test Customer' },
          balance: { type: 'number', example: 15000, description: 'Simulated balance in naira.' },
          currency: { type: 'string', enum: ['NGN'] }, mode: { type: 'string', enum: ['local-test', 'nibss'] },
          status: { type: 'string', enum: ['pending', 'active'] },
          openingBalance: { type: 'number', description: 'Opening balance returned by the provider, in naira.' },
        },
      },
      Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } },
      Customer: {
        type: 'object', properties: {
          id: { type: 'string' }, fullName: { type: 'string' }, email: { type: 'string', format: 'email' },
          onboardingStatus: { type: 'string', enum: ['unverified', 'verified'] },
        },
      },
    },
  },
  paths: {
    '/api/transactions/transfer': {
      post: {
        tags: ['Transactions'], summary: 'Transfer money to a confirmed provider account', security: [{ bearerAuth: [] }],
        description: 'The sender is taken from the logged-in customer. The backend performs name enquiry and a live balance check before transferring. It labels the transfer as intra-bank or inter-bank from the recipient bank code.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false, required: ['recipientAccount', 'amount'],
          properties: {
            recipientAccount: { type: 'string', pattern: '^\\d{10}$', example: '8700000000' },
            amount: { type: 'number', exclusiveMinimum: 0, multipleOf: 0.01, example: 1000 },
            narration: { type: 'string', maxLength: 100, example: 'Test transfer' },
          },
        } } } },
        responses: {
          201: { description: 'Transfer confirmed and saved with local and provider references.' },
          400: errorResponse('Invalid input, insufficient funds, self-transfer, or provider rejection.'),
          401: errorResponse('Customer login required.'), 403: errorResponse('Active provider account required.'),
          404: errorResponse('Sender or recipient account not found.'),
          502: errorResponse('Provider result is invalid or uncertain. Use the returned local reference for status checks.'),
          503: errorResponse('Bank credentials or database unavailable.'),
          504: errorResponse('Provider timeout. Use the returned local reference for status checks.'),
        },
      },
    },
    '/api/accounts/name-enquiry/{accountNumber}': {
      get: {
        tags: ['Accounts'], summary: 'Confirm a recipient account name', security: [{ bearerAuth: [] }],
        description: 'Use this before a transfer. The backend sends the account number to NibssByPhoenix and returns the confirmed account name and bank code.',
        parameters: [{
          in: 'path', name: 'accountNumber', required: true,
          schema: { type: 'string', pattern: '^\\d{10}$', example: '8708090496' },
        }],
        responses: {
          200: jsonResponse('Recipient details confirmed.', { type: 'object', properties: {
            success: { type: 'boolean', example: true },
            account: { type: 'object', properties: {
              accountNumber: { type: 'string', example: '8708090496' },
              accountName: { type: 'string', example: 'Micheal Fire' },
              bankCode: { type: 'string', example: '870' },
            } },
          } }),
          400: errorResponse('Account number must contain exactly 10 digits.'),
          401: errorResponse('Customer login required.'), 404: errorResponse('Recipient account not found.'),
          502: errorResponse('Provider error or incomplete response.'),
          503: errorResponse('Bank credentials not configured.'), 504: errorResponse('Provider timeout.'),
        },
      },
    },
    '/api/accounts/provider': {
      post: {
        tags: ['Provider accounts'], summary: 'Create an account with NibssByPhoenix', security: [{ bearerAuth: [] }],
        description: 'Requires verified onboarding. Bank credentials are read by the server, never supplied here. If you already have a local test account, explicitly replace it using the optional flag. Uncertain creation stays pending; do not retry it automatically.',
        requestBody: { required: false, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false, properties: {
            replaceLocalTestAccount: { type: 'boolean', default: false, description: 'Replaces your local account and simulated balance. No local funds are transferred to the provider.' },
          },
        } } } },
        responses: {
          201: jsonResponse('Provider account confirmed.', { type: 'object', properties: {
            success: { type: 'boolean' }, account: { $ref: '#/components/schemas/Account' },
            openingFundingMatchesRequirement: { type: 'boolean', description: 'True only if the provider returned an opening balance of ₦15,000.' },
          } }),
          400: errorResponse('Invalid input.'), 401: errorResponse('Customer login required.'),
          403: errorResponse('Identity verification required.'), 409: errorResponse('Account exists or creation is pending.'),
          413: errorResponse('Body exceeds 16 KB.'), 500: errorResponse('Unexpected database error.'),
          502: errorResponse('Provider rejected the operation or returned an incomplete response.'),
          503: errorResponse('Bank credentials not configured or database unavailable.'), 504: errorResponse('Provider could not be reached.'),
        },
      },
    },
    '/api/accounts': {
      post: {
        tags: ['Local test accounts'], summary: 'Create your one local test account', security: [{ bearerAuth: [] }],
        description: 'Requires completed BVN/NIN verification. Send no body. Starts with a simulated ₦15,000 balance in MongoDB. Does not call NibssByPhoenix or create an external account.',
        responses: {
          201: jsonResponse('Local account created.', { type: 'object', properties: {
            success: { type: 'boolean', example: true }, account: { $ref: '#/components/schemas/Account' },
          } }),
          400: errorResponse('Request body must be empty.'), 401: errorResponse('Login required.'),
          403: errorResponse('Complete identity verification first.'), 409: errorResponse('You already have an account.'),
          413: errorResponse('Body exceeds 16 KB.'), 500: errorResponse('Unexpected error.'), 503: errorResponse('Service temporarily unavailable.'),
        },
      },
    },
    '/api/accounts/me': {
      get: {
        tags: ['Accounts'], summary: 'View your own account', security: [{ bearerAuth: [] }],
        description: 'Provider accounts fetch a live balance. Pending creation returns only mode and status, without a number or balance.',
        responses: {
          200: jsonResponse('Your account or pending status.', { type: 'object', properties: {
            success: { type: 'boolean', example: true }, account: { $ref: '#/components/schemas/Account' },
          } }),
          401: errorResponse('Login required.'), 404: errorResponse('No account created yet.'),
          500: errorResponse('Unexpected error.'), 502: errorResponse('Provider error.'), 503: errorResponse('Service unavailable.'), 504: errorResponse('Provider timeout.'),
        },
      },
    },
    '/api/accounts/balance': {
      get: {
        tags: ['Accounts'], summary: 'Check your account balance', security: [{ bearerAuth: [] }],
        description: 'Fetches a live provider balance for nibss accounts. Local test accounts return their simulated MongoDB balance.',
        responses: {
          200: jsonResponse('Balance in naira.', { type: 'object', properties: {
            success: { type: 'boolean', example: true }, balance: { type: 'number', example: 15000 },
            currency: { type: 'string', enum: ['NGN'] }, mode: { type: 'string', enum: ['local-test', 'nibss'] },
          } }),
          401: errorResponse('Login required.'), 404: errorResponse('No account created yet.'),
          409: errorResponse('Provider creation is pending.'), 500: errorResponse('Unexpected error.'),
          502: errorResponse('Provider error.'), 503: errorResponse('Service unavailable.'), 504: errorResponse('Provider timeout.'),
        },
      },
    },
    '/api/onboarding': {
      get: {
        tags: ['Onboarding'], summary: 'Check your own onboarding progress', security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Returns onboarding type and status (pending, created or verified), or null if not started.' },
          401: errorResponse('Login required.'), 500: errorResponse('Unexpected error.'), 503: errorResponse('Database unavailable.'),
        },
      },
      post: {
        tags: ['Onboarding'], summary: 'Create a fictional BVN or NIN identity', security: [{ bearerAuth: [] }],
        description: 'Use fictional details only. The server generates the test identity number; do not supply a BVN or NIN. Creation and verification share a limit of 20 attempts per IP per 15 minutes. Pending after a timeout requires provider reconciliation, not another creation request.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false, required: ['type', 'firstName', 'lastName', 'dob'],
          properties: {
            type: { type: 'string', enum: ['BVN', 'NIN'], example: 'BVN' },
            firstName: { type: 'string', minLength: 2, maxLength: 100, example: 'Test' },
            lastName: { type: 'string', minLength: 2, maxLength: 100, example: 'Customer' },
            dob: { type: 'string', format: 'date', example: '1995-06-15', description: 'Valid calendar date, not in the future.' },
            phone: { type: 'string', pattern: '^0[0-9]{10}$', example: '08000000000', description: 'Required for BVN only. Use a test phone number.' },
          },
        } } } },
        responses: {
          201: { description: 'Test identity created; verification is still required.' },
          400: errorResponse('Invalid input or a supplied identity number.'), 401: errorResponse('Login required.'),
          409: errorResponse('Onboarding already exists.'), 413: errorResponse('Body exceeds 16 KB.'),
          429: errorResponse('Too many attempts.'), 500: errorResponse('Unexpected error.'),
          502: errorResponse('Provider did not confirm creation. Check onboarding status.'),
          503: errorResponse('Database unavailable.'), 504: errorResponse('Provider unavailable or timeout; outcome is uncertain.'),
        },
      },
    },
    '/api/onboarding/verify': {
      post: {
        tags: ['Onboarding'], summary: 'Verify your previously created test identity', security: [{ bearerAuth: [] }],
        description: 'No request body is needed. The saved identity belonging to your login is used. Repeating a successful verification is safe.',
        responses: {
          200: { description: 'Identity verified; customer onboardingStatus is verified.' },
          401: errorResponse('Login required.'), 409: errorResponse('Confirmed identity creation is required first.'),
          429: errorResponse('Too many attempts.'), 500: errorResponse('Unexpected error.'),
          502: errorResponse('Provider did not confirm verification.'), 503: errorResponse('Database unavailable.'),
          504: errorResponse('Provider could not be reached; verification can be retried.'),
        },
      },
    },
    '/api/health': {
      get: { tags: ['Health'], summary: 'Check database availability', responses: {
        200: { description: 'Service is ready; success is true.' },
        503: errorResponse('Database is unavailable.'),
      } },
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'], summary: 'Register a customer',
        description: 'Registration and login share a limit of 20 requests per IP every 15 minutes.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['fullName', 'email', 'password'],
          properties: { fullName: { type: 'string', minLength: 2, maxLength: 100, example: 'Test Customer' }, ...credentials },
        } } } },
        responses: {
          201: jsonResponse('Customer registered.', customerResponse), 400: errorResponse('Invalid input or malformed JSON.'),
          409: errorResponse('Email already registered.'), 413: errorResponse('Body exceeds 16 KB.'),
          429: errorResponse('Too many attempts.'), 500: errorResponse('Unexpected error.'), 503: errorResponse('Database unavailable.'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'], summary: 'Log in and receive a token',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email', 'password'], properties: credentials,
        } } } },
        responses: {
          200: jsonResponse('Login successful.', { type: 'object', properties: {
            ...customerResponse.properties, token: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' },
          } }),
          400: errorResponse('Invalid input.'), 401: errorResponse('Invalid email or password.'),
          413: errorResponse('Body exceeds 16 KB.'), 429: errorResponse('Too many attempts.'),
          500: errorResponse('Unexpected error.'), 503: errorResponse('Database unavailable.'),
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication'], summary: 'View your own profile', security: [{ bearerAuth: [] }],
        responses: { 200: jsonResponse('Your profile.', customerResponse), 401: errorResponse('Missing, invalid or expired token.'),
          500: errorResponse('Unexpected error.'), 503: errorResponse('Database unavailable.') },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Authentication'], summary: 'End the current login session', security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Logged out successfully; success is true.' }, 401: errorResponse('Missing, invalid or expired token.'),
          500: errorResponse('Unexpected error.'), 503: errorResponse('Database unavailable.') },
      },
    },
  },
};
