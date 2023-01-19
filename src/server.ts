import Fastify from "fastify";
import cors from "@fastify/cors";
import { appRoutes } from "./lib/routes";

const app = Fastify();

app.register(cors);
//trazendo as rotas para o server
app.register(appRoutes);

app
  .listen({
    port: 3333,
  })
  .then(() => {
    console.log("HTTP Server Running");
  });
