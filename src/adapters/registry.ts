import { Inject, Injectable } from "@nestjs/common";
import { PlatformAdapter } from "./platform";
import { ApiError } from "../errors";
export const ADAPTERS = Symbol("ADAPTERS");
@Injectable()
export class AdapterRegistry {
  constructor(@Inject(ADAPTERS) private readonly adapters: PlatformAdapter[]) {}
  get(platform: string) {
    const adapter = this.adapters.find((a) => a.platform === platform);
    if (!adapter)
      throw new ApiError(
        422,
        "UNSUPPORTED_PLATFORM",
        "Platform is not supported.",
      );
    return adapter;
  }
}
