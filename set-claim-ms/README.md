# Express.js TypeScript REST API

A modular REST API built with Node.js, Express, and TypeScript.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```env
PORT=3000
API_KEY=your-api-key-here
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
RPC_URL=your-blockchain-rpc-url
PRIVATE_KEY=your-private-key
CLAIM_CONTRACT_ADDRESS=your-contract-address
```

### Run in Development Mode

```bash
npm run dev
```

### Build for Production

```bash
npm run build
npm start
```

## API Endpoints

### GET /api/hello-world

Returns a Hello World JSON response.

**Authentication**: Required (API Key)

**Headers**:
```
x-api-key: your-api-key-here
```

**Response**:
```json
{
  "message": "Hello World"
}
```

**Example with curl**:
```bash
curl -X GET http://localhost:3000/api/hello-world \
  -H "x-api-key: your-api-key-here"
```

---

### POST /api/set-claimable

Sets claimable token amount for a wallet address on the blockchain using the default amount. This endpoint is designed to handle Supabase database webhooks from the `claimable_addresses` table.

**Authentication**: Required (API Key)

**Headers**:
```
x-api-key: your-api-key-here
Content-Type: application/json
```

**Request Body** (Supabase Webhook Format):
```json
{
  "type": "INSERT",
  "table": "claimable_addresses",
  "schema": "public",
  "record": {
    "created_at": "2025-10-21T18:10:50.351557+00:00",
    "wallet_address": "0x1234567890123456789012345678901234567890",
    "claimable_right": null
  },
  "old_record": null
}
```

**Response (Success)**:
```json
{
  "isSuccess": true,
  "message": "Claimable amount set successfully"
}
```

**Response (Error)**:
```json
{
  "isSuccess": false,
  "message": "Error details..."
}
```

**Example with curl**:
```bash
curl -X POST http://localhost:3000/api/set-claimable \
  -H "x-api-key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "claimable_addresses",
    "schema": "public",
    "record": {
      "wallet_address": "0x1234567890123456789012345678901234567890"
    }
  }'
```

**Note**: 
- The endpoint extracts the wallet address from `record.wallet_address` in the webhook payload
- The claimable amount is set to `DEFAULT_SET_CLAIMABLE_AMOUNT` constant (20000), which is defined in `src/utils/constants.ts`
- This endpoint is designed to be triggered automatically by Supabase webhooks when new records are inserted into the `claimable_addresses` table

## Project Structure

```
src/
├── controllers/       # Request handlers
│   ├── helloController.ts
│   └── setClaimableController.ts
├── middleware/        # Express middleware
│   ├── authMiddleware.ts
│   └── errorHandler.ts
├── routes/           # API routes
│   ├── helloRoutes.ts
│   └── setClaimableRoutes.ts
├── supabase/         # Database connection
│   └── index.ts
├── utils/            # Utility functions
│   ├── constants.ts
│   ├── supabaseUtils.ts
│   └── web3Utils.ts
└── index.ts          # Application entry point
```

## Technologies

- **Node.js** - JavaScript runtime
- **Express 5.1.0** - Web framework
- **TypeScript 5.8.3** - Type safety
- **ts-node** - TypeScript execution
- **nodemon** - Development hot-reloading
- **dotenv** - Environment variable management
- **Supabase** - PostgreSQL database
- **Web3.js 4.16.0** - Blockchain interactions

## Architecture Features

- ✅ TypeScript with strict mode
- ✅ Modular structure (routes, controllers, middleware)
- ✅ API key authentication
- ✅ Centralized error handling
- ✅ Environment-based configuration
- ✅ Hot-reloading in development
- ✅ Production build support
- ✅ Web3 blockchain integration
- ✅ Supabase database integration
- ✅ Singleton pattern for utility classes

## Extending the API

This project is structured to easily add new features:

1. **Add new routes**: Create files in `src/routes/`
2. **Add controllers**: Create files in `src/controllers/`
3. **Add middleware**: Create files in `src/middleware/`
4. **Add utilities**: Create files in `src/utils/`

## License

ISC

