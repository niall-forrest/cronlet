import { ERROR_CODES, type ApiResponse } from "@cronlet/cloud-shared";
import type { FastifyReply } from "fastify";
import { AppError } from "./errors.js";

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200): ApiResponse<T> {
  reply.status(statusCode);
  return { ok: true, data };
}

export function handleError(reply: FastifyReply, error: unknown): ApiResponse<never> {
  if (error instanceof AppError) {
    reply.status(error.statusCode);
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  reply.status(500);
  return {
    ok: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected error",
    },
  };
}
