import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'object' && exceptionResponse && 'message' in exceptionResponse
        ? Array.isArray((exceptionResponse as { message: unknown }).message)
          ? (exceptionResponse as { message: string[] }).message.join('; ')
          : String((exceptionResponse as { message: unknown }).message)
        : exception instanceof Error
          ? exception.message
          : '服务器内部错误';

    response.status(status).send({
      success: false,
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message
      }
    });
  }
}
