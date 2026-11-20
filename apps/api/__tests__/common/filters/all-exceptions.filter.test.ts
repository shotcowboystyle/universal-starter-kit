import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common/interfaces';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter';

const createResponse = () => ({
  status: vi.fn<Response['status']>().mockReturnThis(),
  json: vi.fn<Response['json']>().mockReturnThis(),
});

describe(AllExceptionsFilter, () => {
  let filter: AllExceptionsFilter;
  let handle: (exception: Error | string | null, host: ArgumentsHost) => void;
  let mockResponse: ReturnType<typeof createResponse>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Bound once so Nest's `catch` hook is not mistaken for Promise#catch at each call site
    // oxlint-disable-next-line github/no-then -- Nest ExceptionFilter#catch, not Promise#catch
    handle = filter.catch.bind(filter);

    mockResponse = createResponse();

    mockHost = {
      switchToHttp: vi.fn<() => { getResponse: () => typeof mockResponse }>().mockReturnValue({
        getResponse: vi.fn<() => typeof mockResponse>().mockReturnValue(mockResponse),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HttpException handling', () => {
    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

      handle(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Bad request',
      });
    });

    it('should handle HttpException with object response', () => {
      const exception = new HttpException(
        { error: 'Validation failed', details: 'Field is required' },
        HttpStatus.BAD_REQUEST,
      );

      handle(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Validation failed',
        details: 'Field is required',
      });
    });

    it('should handle HttpException with array response', () => {
      const exception = new HttpException(['error1', 'error2'], HttpStatus.BAD_REQUEST);

      handle(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        0: 'error1',
        1: 'error2',
      });
    });
  });

  describe('non-HttpException handling', () => {
    it('should handle generic Error with 500 status', () => {
      const exception = new Error('Something went wrong');

      handle(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    });

    it('should handle unknown exception type', () => {
      const exception = 'Unknown error string';

      handle(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    });

    it('should handle null exception', () => {
      handle(null, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    });
  });

  describe('logging for 5xx errors', () => {
    it('should log error for 500 status', () => {
      const exception = new Error('Server error');
      const loggerSpy = vi.spyOn(Logger.prototype, 'error');

      handle(exception, mockHost);

      expect(loggerSpy).toHaveBeenCalledWith('Unhandled exception: Server error', expect.any(String));
    });

    it('should not log error for 400 status', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      const loggerSpy = vi.spyOn(Logger.prototype, 'error');

      handle(exception, mockHost);

      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('should handle non-Error 5xx exceptions in logging', () => {
      const exception = { status: 500, message: 'Weird error' };
      const loggerSpy = vi.spyOn(Logger.prototype, 'error');

      handle(exception as any, mockHost);

      expect(loggerSpy).toHaveBeenCalledWith('Unhandled exception: Unknown error', undefined);
    });
  });
});
