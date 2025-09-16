import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
  }),
);
app.use(morgan("combined"));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "api",
    version: "0.1.0",
  });
});

app.get("/api/hello", (req, res) => {
  res.json({
    message: "Hello from API",
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error: "Internal Server Error",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
  },
);

app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
});
