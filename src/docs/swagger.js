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
