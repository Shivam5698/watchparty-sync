import express from "express";
import cors from "cors";
import { env } from "./config/env";
import healthRouter from "./routes/health.routes";

export const app = express();

app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());
app.use(healthRouter);
