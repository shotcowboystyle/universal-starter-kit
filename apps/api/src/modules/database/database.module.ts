import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MongooseModuleOptions } from '@nestjs/mongoose';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import type mongoose from 'mongoose';

import { DatabaseService } from './database.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService): MongooseModuleOptions => {
        const logger = new Logger('MongoDB');
        const uri = configService.get<string>('DATABASE_URL');

        if (uri === undefined || uri === '') {
          throw new Error('MongoDB connection string (DATABASE_URL) is not defined');
        }

        const maskedUri = uri.replace(/:\/\/(?<user>[^:]+):(?<password>[^@]+)@/u, '://***:***@');
        logger.log(`Connecting to: ${maskedUri}`);

        const isProduction = configService.get('NODE_ENV') === 'production';

        return {
          uri,
          serverSelectionTimeoutMS: 10_000,
          socketTimeoutMS: 45_000,
          connectTimeoutMS: 10_000,
          maxPoolSize: 100,
          minPoolSize: 1,
          retryWrites: true,
          retryReads: true,
          retryAttempts: 3,
          ssl: isProduction,
          autoIndex: !isProduction,
          connectionFactory: (connection: mongoose.Connection) => {
            connection.on('connected', () => {
              logger.log('MongoDB connected successfully');
            });
            connection.on('error', (error: Error) => {
              logger.error(`MongoDB connection error: ${error.message}`);
            });
            connection.on('disconnected', () => {
              logger.warn('MongoDB disconnected');
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: (connection: mongoose.Connection) => connection,
      inject: [getConnectionToken()],
    },
    DatabaseService,
  ],
  exports: [MongooseModule, 'DATABASE_CONNECTION', DatabaseService],
})
export class DatabaseModule {}
