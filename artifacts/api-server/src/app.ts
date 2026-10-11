import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Send every other hostname (for example the old awsbuilderwars.dev) to the
// main domain. The health check is exempt because the host's load balancer
// calls it directly.
const canonicalHost = process.env.CANONICAL_HOST?.trim().toLowerCase();
if (canonicalHost) {
  app.use((req, res, next) => {
    if (
      req.hostname.toLowerCase() === canonicalHost ||
      req.path === "/api/healthz"
    ) {
      next();
      return;
    }
    res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
  });
}

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

// In production the API also serves the built web app, so the site and the
// API share one origin. Skipped when the web app hasn't been built.
const webDir =
  process.env.WEB_DIST_DIR ??
  fileURLToPath(new URL("../../hackathon/dist/public/", import.meta.url));
const webIndex = path.join(webDir, "index.html");
if (existsSync(webIndex)) {
  app.use(
    express.static(webDir, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so it can be cached for good.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      req.path.startsWith("/api/")
    ) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(webIndex);
  });
}

export default app;
