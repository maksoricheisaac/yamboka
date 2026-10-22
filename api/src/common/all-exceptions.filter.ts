import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Format d'erreur unique ; les erreurs internes ne fuitent jamais vers le client. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const obj =
        typeof raw === 'string'
          ? { message: raw }
          : (raw as Record<string, unknown>);
      const isList = Array.isArray(obj.message);
      const body: ErrorBody = {
        statusCode: status,
        code:
          typeof obj.code === 'string'
            ? obj.code
            : (HttpStatus[status] ?? 'ERROR'),
        message: isList
          ? 'Données invalides.'
          : typeof obj.message === 'string'
            ? obj.message
            : exception.message,
        ...(isList ? { details: obj.message } : {}),
      };
      res.status(status).json(body);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    const body: ErrorBody = {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue. Veuillez réessayer.',
    };
    res.status(500).json(body);
  }
}
