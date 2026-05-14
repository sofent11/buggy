import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (Buffer.isBuffer(data) || typeof data === 'string') return data;
        if (data && typeof data === 'object' && 'success' in data) return data;
        return { success: true, data };
      })
    );
  }
}
