import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseErrors implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status =
      error.code === 'P2025'
        ? 404
        : ['P2002', 'P2003', 'P2004', 'P2034', 'P2028'].includes(error.code)
          ? 409
          : 500;
    response.status(status).json({
      statusCode: status,
      message:
        status === 404
          ? 'Record not found.'
          : status === 409
            ? 'This change conflicts with the current data. Refresh and try again.'
            : 'An unexpected database error occurred.',
    });
  }
}
