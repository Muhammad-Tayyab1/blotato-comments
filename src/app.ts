import "reflect-metadata";
import { INestApplication, Module } from "@nestjs/common";
import { Database } from "./database";
import { CommentsService } from "./comments.service";
import { CommentsController, DevelopmentIdentity } from "./comments.controller";
import { ADAPTERS, AdapterRegistry } from "./adapters/registry";
import { MockAlphaAdapter, MockBetaAdapter } from "./adapters/mocks";
import { ErrorFilter } from "./errors";
@Module({
  controllers: [CommentsController],
  providers: [
    Database,
    CommentsService,
    DevelopmentIdentity,
    AdapterRegistry,
    {
      provide: ADAPTERS,
      useFactory: () => [new MockAlphaAdapter(), new MockBetaAdapter()],
    },
  ],
})
export class AppModule {}
export function configure(app: INestApplication) {
  app.useGlobalFilters(new ErrorFilter());
}
