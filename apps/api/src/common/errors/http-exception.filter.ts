import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const structured = typeof payload === 'string' ? undefined : payload as { message?: string | string[]; details?: unknown };
    const message = typeof payload === 'string' ? payload : structured?.message ?? 'Request failed';
    const headerRequestId = request.headers['x-request-id'];
    const requestId = request.id ?? (typeof headerRequestId === 'string' ? headerRequestId : randomUUID());
    response.status(status).json({
      error: { code: `HTTP_${status}`, message, requestId, ...(structured?.details === undefined ? {} : { details: structured.details }) },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
