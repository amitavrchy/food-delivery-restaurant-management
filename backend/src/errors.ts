import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class DatabaseErrors implements ExceptionFilter {
  catch(
    error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse();
    const code = 'code' in error ? error.code : '';
    const exclusion = /23P01|exclusion constraint/i.test(error.message);
    const status =
      code === 'P2025'
        ? 404
        : exclusion || ['P2002', 'P2003', 'P2004', 'P2034', 'P2028'].includes(code)
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
