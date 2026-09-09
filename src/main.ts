import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule, configure } from "./app";
async function main() {
  if (
    process.env.DEV_IDENTITY_STUB !== "true" ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "This demo requires DEV_IDENTITY_STUB=true and cannot run in production.",
    );
  const app = await NestFactory.create(AppModule);
  configure(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
