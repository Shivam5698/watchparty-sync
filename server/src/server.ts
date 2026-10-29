import { createServer } from "http";
import { app } from "./app";
import { env } from "./config/env";
import { initSocket } from "./socket";

const httpServer = createServer(app);

initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
