# Express.js TypeScript REST API - Project Setup Guide

This guide provides complete instructions for initializing a new Express.js REST API project with TypeScript, following the established architecture pattern. Start with a basic hello world endpoint and the full project structure ready for expansion.

## Project Overview

A modular REST API built with Node.js, Express, and TypeScript, designed to be extended with Web3 integration and database support.

---

## Step 1: Initialize Project Structure

Create the following directory structure:

```
project-root/
├── src/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   └── index.ts
├── package.json
├── tsconfig.json
├── nodemon.json
├── .env
├── .gitignore
└── README.md
```

---

## Step 2: Create package.json

Create `package.json` with the following content:

```json
{
  "name": "api",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "nodemon src/index.ts",
    "build": "tsc",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "@types/express": "^5.0.1",
    "@types/node": "^22.15.3",
    "dotenv": "^16.5.0",
    "express": "^5.1.0",
    "nodemon": "^3.1.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3"
  },
  "devDependencies": {
    "@types/express-serve-static-core": "^5.0.6"
  }
}
```

---

## Step 3: Create tsconfig.json

Create `tsconfig.json` with the following configuration:

```json
{
  "compilerOptions": {
    "target": "es2016",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.spec.ts"]
}
```

---

## Step 4: Create nodemon.json

Create `nodemon.json` for development hot-reloading:

```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node src/index.ts"
}
```

---

## Step 5: Create .env File

Create `.env` file with environment variables:

```env
PORT=3000
API_KEY=your-api-key-here
```

---

## Step 6: Create .gitignore

Create `.gitignore` file:

```
# Dependencies
node_modules/

# Build output
dist/

# Environment variables
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# TypeScript
*.tsbuildinfo
```

---

## Step 7: Create Source Files

### 7.1 Create `src/index.ts` (Main Entry Point)

```typescript
import express from "express";
import helloRoutes from "./routes/helloRoutes";
import { errorHandler } from "./middleware/errorHandler";

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api", helloRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 7.2 Create `src/routes/helloRoutes.ts`

```typescript
import { Router } from "express";
import { apiKeyAuth } from "../middleware/authMiddleware";
import { helloWorld } from "../controllers/helloController";

const router = Router();

router.get("/hello-world", apiKeyAuth, helloWorld);

export default router;
```

### 7.3 Create `src/controllers/helloController.ts`

```typescript
import { Request, Response } from "express";

export const helloWorld = (req: Request, res: Response): void => {
  res.json({ message: "Hello World" });
};
```

### 7.4 Create `src/middleware/authMiddleware.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import * as dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.API_KEY || "";

export const apiKeyAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "API key is missing" });
    return;
  }

  // Extract the API key from the Authorization header
  // Expected format: "Bearer API_KEY" or just "API_KEY"
  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  if (apiKey !== API_KEY) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // API key is valid, proceed to the next middleware or route handler
  next();
};
```

### 7.5 Create `src/middleware/errorHandler.ts`

```typescript
import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error("Error:", err.message);

  // Default server error
  res.status(500).json({ error: "Internal server error" });
};
```

---

## Step 8: Create README.md

Create `README.md` with project documentation:

```markdown
# Express.js TypeScript REST API

A modular REST API built with Node.js, Express, and TypeScript.

## Getting Started

### Install Dependencies

\`\`\`bash
npm install
\`\`\`

### Environment Setup

Create a `.env` file in the project root:

\`\`\`env
PORT=3000
API_KEY=your-api-key-here
\`\`\`

### Run in Development Mode

\`\`\`bash
npm run dev
\`\`\`

### Build for Production

\`\`\`bash
npm run build
npm start
\`\`\`

## API Endpoints

### GET /api/hello-world

Returns a Hello World JSON response.

**Authentication**: Required (API Key)

**Headers**:
\`\`\`
Authorization: Bearer your-api-key-here
\`\`\`

**Response**:
\`\`\`json
{
  "message": "Hello World"
}
\`\`\`

**Example with curl**:
\`\`\`bash
curl -X GET http://localhost:3000/api/hello-world \
  -H "Authorization: Bearer your-api-key-here"
\`\`\`

## Project Structure

\`\`\`
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
\`\`\`

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
\`\`\`

---

## Step 9: Installation and Running

After creating all files, run the following commands:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

The server will start on `http://localhost:3000`.

---

## Step 10: Testing the Hello World Endpoint

Test the endpoint using curl:

```bash
curl -X GET http://localhost:3000/api/hello-world \
  -H "Authorization: Bearer your-api-key-here"
```

Expected response:
```json
{
  "message": "Hello World"
}
```

---

## Future Expansion Paths

This structure is ready to be extended with:

### Database Integration (Supabase)
- Add `src/supabase/index.ts` for connection service
- Add `src/utils/supabaseUtils.ts` for database operations
- Install: `npm install @supabase/supabase-js`

### Web3 Integration
- Add `src/utils/web3Utils/` directory
- Add contract utility classes
- Install: `npm install web3`

### File Upload Support
- Add `src/utils/fileUpload.ts` for multer configuration
- Add `src/utils/fileProcessor.ts` for file parsing
- Install: `npm install multer @types/multer csvtojson xlsx`

### Additional Features
- Add validation middleware
- Add rate limiting
- Add logging service
- Add request/response schemas
- Add unit tests

---

## Notes for Agent

1. Create all directories before creating files
2. Ensure all file paths are correct
3. After creating all files, run `npm install`
4. Update the API_KEY in `.env` to a secure value
5. Test the endpoint after installation
6. The structure follows clean architecture principles
7. TypeScript strict mode is enabled for type safety
8. All endpoints require API key authentication by default

---

## Quick Start Checklist

- [ ] Create project directory structure
- [ ] Create `package.json`
- [ ] Create `tsconfig.json`
- [ ] Create `nodemon.json`
- [ ] Create `.env` file
- [ ] Create `.gitignore`
- [ ] Create all source files in `src/`
- [ ] Create `README.md`
- [ ] Run `npm install`
- [ ] Run `npm run dev`
- [ ] Test the hello-world endpoint
- [ ] Verify authentication works
- [ ] Initialize git repository (optional)

---

## Success Criteria

✅ Server starts without errors  
✅ Hello world endpoint responds with 200 status  
✅ Authentication middleware blocks requests without API key  
✅ Authentication middleware allows requests with valid API key  
✅ TypeScript compiles without errors (`npm run build`)  
✅ Hot-reloading works in development mode  

---

**Project is now ready for development and can be extended with additional features as needed!**

