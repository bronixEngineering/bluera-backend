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

## Project Structure

```
src/
├── controllers/       # Request handlers
│   └── helloController.ts
├── middleware/        # Express middleware
│   ├── authMiddleware.ts
│   └── errorHandler.ts
├── routes/           # API routes
│   └── helloRoutes.ts
├── utils/            # Utility functions (empty, ready for expansion)
└── index.ts          # Application entry point
```

## Technologies

- **Node.js** - JavaScript runtime
- **Express 5.1.0** - Web framework
- **TypeScript 5.8.3** - Type safety
- **ts-node** - TypeScript execution
- **nodemon** - Development hot-reloading
- **dotenv** - Environment variable management

## Architecture Features

- ✅ TypeScript with strict mode
- ✅ Modular structure (routes, controllers, middleware)
- ✅ API key authentication
- ✅ Centralized error handling
- ✅ Environment-based configuration
- ✅ Hot-reloading in development
- ✅ Production build support

## Extending the API

This project is structured to easily add new features:

1. **Add new routes**: Create files in `src/routes/`
2. **Add controllers**: Create files in `src/controllers/`
3. **Add middleware**: Create files in `src/middleware/`
4. **Add utilities**: Create files in `src/utils/`

## License

ISC

