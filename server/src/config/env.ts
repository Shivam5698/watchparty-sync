import dotenv from "dotenv";

dotenv.config();

type Environment = {
  PORT: number;
  CLIENT_URL: string;
};

export const env: Environment = {
  PORT: Number(process.env.PORT ?? 4000),
  CLIENT_URL: (process.env.CLIENT_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
};
