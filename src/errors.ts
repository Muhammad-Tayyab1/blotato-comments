import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ProviderError } from "./adapters/platform";
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let mapped: HttpException;
    if (error instanceof ProviderError) {
      const errors = {
        failure: [502, "PROVIDER_FAILURE", "Social provider request failed."],
        rate_limit: [
          429,
          "PROVIDER_RATE_LIMIT",
          "Social provider rate limit reached.",
        ],
        invalid_cursor: [400, "INVALID_CURSOR", "Invalid pagination cursor."],
        not_found: [
          404,
          "COMMENT_NOT_FOUND",
          "Provider post or comment not found.",
        ],
      } as const;
      const [status, code, message] = errors[error.kind];
      mapped = new ApiError(status, code, message);
    } else if (error instanceof HttpException) mapped = error;
    else
      mapped = new ApiError(
        500,
        "INTERNAL_ERROR",
        "An internal error occurred.",
      );
    const body = mapped.getResponse();
    host
      .switchToHttp()
      .getResponse()
      .status(mapped.getStatus())
      .json(
        mapped instanceof ApiError
          ? body
          : {
              error: {
                code: "HTTP_ERROR",
                message: "Request could not be processed.",
              },
            },
      );
  }
}
