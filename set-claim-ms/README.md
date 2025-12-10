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

### GET /health

Health check endpoint for monitoring service status. No authentication required.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-21T18:10:50.351Z",
  "uptime": 123.456
}
```

**Example with curl**:
```bash
curl -X GET http://localhost:3000/health
```

---

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

Sets claimable token amount for a wallet address on the blockchain using the default amount. This endpoint is designed to handle Supabase database webhooks from the `farcaster_notifications` table.

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
  "table": "farcaster_notifications",
  "schema": "public",
  "record": {
    "fid": "1120453",
    "updated_at": "2025-10-21T18:10:50.351557+00:00",
    "notification_url": "https://api.farcaster.xyz/v1/frame-notifications",
    "notification_token": "019a0aba-ca8a-63eb-85d6-f9c6f31704a5"
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
    "table": "farcaster_notifications",
    "schema": "public",
    "record": {
      "fid": "1120453"
    }
  }'
```

**Note**: 
- The endpoint extracts the Farcaster ID (fid) from `record.fid` in the webhook payload
- The wallet address is fetched from the `wallets_status` table using the fid
- If multiple wallets are found for the same fid, the first one is used
- Returns 400 error if no wallet is found for the given fid
- The claimable amount is set to `DEFAULT_SET_CLAIMABLE_AMOUNT` constant (20000), which is defined in `src/utils/constants.ts`
- This endpoint is designed to be triggered automatically by Supabase webhooks when new records are inserted into the `farcaster_notifications` table

## Project Structure

```
src/
├── controllers/       # Request handlers
│   ├── helloController.ts
│   ├── healthController.ts
│   └── setClaimableController.ts
├── middleware/        # Express middleware
│   ├── authMiddleware.ts
│   └── errorHandler.ts
├── routes/           # API routes
│   ├── helloRoutes.ts
│   ├── healthRoutes.ts
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

- **Node.js 20+** - JavaScript runtime
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

## Deployment to Railway

This project includes a `railway.toml` configuration file for easy deployment to Railway.

### Deploy Steps

1. **Push your code to GitHub**
2. **Connect to Railway**:
   - Go to [Railway](https://railway.app/)
   - Create a new project
   - Connect your GitHub repository

3. **Set Environment Variables** in Railway dashboard:
   ```
   PORT=3000
   API_KEY=your-secure-api-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   RPC_URL=your-blockchain-rpc-url
   PRIVATE_KEY=your-private-key
   CLAIM_CONTRACT_ADDRESS=your-contract-address
   ```

4. **Deploy**: Railway will automatically detect the `railway.toml` and deploy your application

### Railway Configuration

The `railway.toml` file configures:
- **Builder**: Nixpacks (automatic detection)
- **Build Command**: `npm run build` (compiles TypeScript)
- **Start Command**: `npm start` (runs compiled TypeScript from `dist/`)
- **Restart Policy**: Restarts on failure (max 3 retries)
- **Environment**: Production with NODE_ENV and PORT settings
- **Health Check**: Monitors `/health` endpoint every 60 seconds

### Post-Deployment

After deployment, configure your Supabase webhook:
1. Go to your Supabase project → Database → Webhooks
2. Create a new webhook for the `farcaster_notifications` table
3. Set the webhook URL to: `https://your-railway-app.railway.app/api/set-claimable`
4. Add header: `x-api-key: your-api-key`
5. Set trigger to: INSERT events

## Extending the API

This project is structured to easily add new features:

1. **Add new routes**: Create files in `src/routes/`
2. **Add controllers**: Create files in `src/controllers/`
3. **Add middleware**: Create files in `src/middleware/`
4. **Add utilities**: Create files in `src/utils/`

## License

ISC

