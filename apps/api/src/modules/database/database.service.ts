import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type mongoose from 'mongoose';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly connection: mongoose.Connection,
  ) {}

  onModuleInit(): void {
    this.connection.on('error', (error: Error) => {
      this.logger.error(`MongoDB connection error: ${error.message}`, error.stack);
    });
  }

  async onModuleDestroy() {
    try {
      await this.connection.close();
      this.logger.log('MongoDB connection closed gracefully');
    } catch (error) {
      this.logger.error('Error closing MongoDB connection', error);
    }
  }
}
