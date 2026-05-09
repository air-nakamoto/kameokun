import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';

export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError('invalid_json', 'Request body must be valid JSON');
  }
}

export class BadRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function validate<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError(
      'invalid_input',
      'Input validation failed',
      parsed.error.issues,
    );
  }
  return parsed.data;
}

export function badRequest(err: BadRequestError) {
  return NextResponse.json(
    { error: err.code, message: err.message, details: err.details ?? null },
    { status: 400 },
  );
}

export function stubResponse<T extends object>(payload: T, promptName: string) {
  return NextResponse.json({
    _stub: true,
    _prompt_loaded: promptName,
    ...payload,
  });
}
