import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Custom pipe to transform a string ID to a MongoDB ObjectId
 * or pass through if it's already an ObjectId
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<unknown, Types.ObjectId> {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- pipes receive arbitrary request input; this method is the validation boundary
  transform(value: unknown): Types.ObjectId {
    if (value == null || value === '') {
      throw new BadRequestException('ID is required');
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validating raw request input at the boundary
    if (typeof value !== 'string' && !(value instanceof Types.ObjectId)) {
      throw new BadRequestException('Invalid ID format');
    }
    if (Types.ObjectId.isValid(value)) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- distinguishes the string input from an existing ObjectId
      return typeof value === 'string' ? new Types.ObjectId(value) : value;
    }
    throw new BadRequestException('Invalid ID format');
  }
}
