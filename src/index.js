// Servidor mínimo de Florece. Por ahora solo expone /health para que Railway
// sepa que el servicio arrancó y que la base de datos responde.
const http = require("node:http");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 3000;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", database: "ok" }));
    } catch (err) {
      console.error("Health check failed:", err);
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", database: "unreachable" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`Florece backend escuchando en el puerto ${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
