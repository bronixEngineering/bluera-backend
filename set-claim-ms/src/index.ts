import express from "express";
import helloRoutes from "./routes/helloRoutes";
import setClaimableRoutes from "./routes/setClaimableRoutes";
import healthRoutes from "./routes/healthRoutes";
import { errorHandler } from "./middleware/errorHandler";

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use(healthRoutes); // Health check - no /api prefix
app.use("/api", helloRoutes);
app.use("/api", setClaimableRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

