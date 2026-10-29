import { useEffect, useState } from "react";
import { socket } from "./services/socket";

function App() {
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const handleConnect = () => setSocketId(socket.id ?? null);
    const handleDisconnect = () => setSocketId(null);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    };
  }, []);

  return (
    <main>
      {socketId ? (
        <p>Connected ✅ {socketId}</p>
      ) : (
        <p>Disconnected ❌</p>
      )}
    </main>
  );
}

export default App;
