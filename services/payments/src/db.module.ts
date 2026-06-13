import { Global, Module } from "@nestjs/common";
import { createDb, type Database } from "@neet/db";
import { config } from "./config";

export const DB = Symbol("DB");

@Global()
@Module({
  providers: [{ provide: DB, useFactory: (): Database => createDb(config.DATABASE_URL) }],
  exports: [DB],
})
export class DbModule {}
