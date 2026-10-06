import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { API_PORT } from './constants/api';

// eslint-disable-next-line eslint-plugin-next/no-assign-module-variable -- Required for NestJS webpack HMR
declare const module: {
  hot?: { accept: () => void; dispose: (callback: () => void) => void };
};

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const port = process.env.PORT === undefined || process.env.PORT === '' ? API_PORT : process.env.PORT;

  // Parse cookies before CORS middleware
  app.use(cookieParser());

  // Define allowed origins
  const allowedOrigins: (string | RegExp)[] = [
    // Production frontend URL from environment variables (undefined/empty values are filtered out below)
    process.env.NEXT_PUBLIC_WEB_URL,
    // Explicit production frontend URL as fallback
    'https://turborepo-starter-kit-web.vercel.app',
    // Regex for Vercel preview URLs for this project
    /^https:\/\/turborepo-starter-kit-web-.*\.vercel\.app$/u,
    // Local development
    'http://localhost:3000',
    // Mobile development (Expo)
    'http://localhost:8081',
    'http://localhost:19006',
  ].filter((o): o is string | RegExp => o !== undefined && o !== '');

  app.enableCors({
    origin: (origin: string | undefined, respond: (error: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (origin === undefined || origin === '') {
        respond(null, true);
        return;
      }

      const isAllowed = allowedOrigins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));

      if (isAllowed) {
        respond(null, true);
        return;
      }

      respond(new Error(`CORS error: Origin ${origin} not allowed.`));
    },
    // This is crucial for cookies
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'X-XSRF-TOKEN',
      // Explicitly allow Cookie header
      'Cookie',
    ],
    exposedHeaders: [
      'Authorization',
      'XSRF-TOKEN',
      // Expose Set-Cookie header
      'Set-Cookie',
    ],
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Task Management API')
    .setDescription('API documentation for the Task Management System')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      // This name should match the one used in @ApiBearerAuth() in controllers
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  // For Vercel deployment, we'll export the NestJS app's HTTP adapter
  if (process.env.VERCEL !== undefined && process.env.VERCEL !== '') {
    await app.init();
    const instance: unknown = app.getHttpAdapter().getInstance();
    return instance;
  }

  // For local development
  await app.listen(port);

  // Enable hot module replacement for development
  if (module.hot !== undefined) {
    module.hot.accept();
    module.hot.dispose(() => {
      void app.close();
    });
  }

  return app;
};

// Export the serverless function for Vercel
const server = bootstrap();

export default server;
