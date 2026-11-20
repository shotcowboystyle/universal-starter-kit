import path from 'node:path';

import { config } from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { demoBoards, demoProjects, demoTasks, demoUsers } from '@/constants/demo-data';
import { Board, BoardSchema } from '@/modules/boards/schemas/boards.schema';
import { Project, ProjectSchema } from '@/modules/projects/schemas/projects.schema';
import { Task, TaskSchema } from '@/modules/tasks/schemas/tasks.schema';
import { User, UserSchema } from '@/modules/users/schemas/users.schema';

// This script should only run in a Node.js environment
if (typeof process === 'undefined') {
  throw new TypeError('This script must be run in a Node.js environment');
}

const isProduction = process.env.NODE_ENV === 'production';

// Load .env file for local development
if (!isProduction) {
  const envPath = path.resolve(process.cwd(), '../../.env');
  const envConfig = config({ path: envPath });
  if (envConfig.error) {
    const fallbackPath = path.resolve(process.cwd(), '.env');
    if (fallbackPath === envPath) {
      console.warn('Warning: No .env file found at', envPath);
      console.warn('Falling back to process environment variables');
    } else {
      config({ path: fallbackPath });
    }
  }
}

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(
  (envVar) => process.env[envVar] === undefined || process.env[envVar] === '',
);

if (missingEnvVars.length > 0) {
  console.error('\u001B[31mError: The following environment variables are required but missing:\u001B[0m');
  for (const envVar of missingEnvVars) {
    console.error(`- ${envVar}`);
  }
  if (!isProduction) {
    console.error(
      '\nFor local development, please create a .env file in the project root with the required variables.',
    );
  }
  process.exit(1);
}

// Extract and validate database name from DATABASE_URL
const getDatabaseNameFromUrl = (url: string): string | null => {
  try {
    // MongoDB URL format: mongodb://[username:password@]host[:port]/[database][?options]
    // Extract database name from the URL
    return /\/\/[^/]+\/(?<name>[^?]+)/u.exec(url)?.groups?.name ?? null;
  } catch {
    return null;
  }
};

// DATABASE_URL presence was validated above
const databaseUrl = process.env.DATABASE_URL ?? '';
const dbName = getDatabaseNameFromUrl(databaseUrl);
const expectedDbName = 'next-project-manager';

console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV === undefined || process.env.NODE_ENV === '' ? 'development' : process.env.NODE_ENV,
  DATABASE_URL: databaseUrl === '' ? 'Not set' : `***${databaseUrl.split('@').pop()}`,
  Database_Name: dbName ?? 'test (default)',
});

// Warn if database name is missing or incorrect
if (dbName === null || dbName === 'test') {
  console.warn('\n\u001B[33m⚠️  WARNING: No database name specified in DATABASE_URL!\u001B[0m');
  console.warn('\u001B[33mMongoDB will use the default "test" database.\u001B[0m');
  console.warn('\u001B[33m\nExpected format:\u001B[0m');
  console.warn(`\u001B[36mmongodb://user:password@host:port/${expectedDbName}?authSource=admin\u001B[0m`);
  console.warn('\n\u001B[33mPlease update your DATABASE_URL to include the database name.\u001B[0m\n');
} else if (dbName !== expectedDbName) {
  console.warn(`\n\u001B[33m⚠️  WARNING: Database name is "${dbName}" but expected "${expectedDbName}"\u001B[0m`);
  console.warn('\u001B[33mProceeding with the specified database name...\u001B[0m\n');
}

const main = async () => {
  // Non-interactive check for CI/Vercel or --force flag
  const isForced = process.argv.includes('--force');
  const isCI = process.env.CI === 'true' || process.env.VERCEL === 'true';

  if (!isForced && !isCI) {
    console.log('\u001B[33mThis script will reset the database. To run it, use the --force flag.\u001B[0m');
    process.exit(0);
  }

  try {
    // Connect to MongoDB directly
    console.log('Connecting to database...');
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 10_000,
    });
    console.log('Database connected successfully.');

    const { connection } = mongoose;

    // Get models from the connection
    const boardModel = connection.model(Board.name, BoardSchema);
    const projectModel = connection.model(Project.name, ProjectSchema);
    const taskModel = connection.model(Task.name, TaskSchema);
    const userModel = connection.model(User.name, UserSchema);

    console.log('\u001B[36mInitializing database...\u001B[0m');

    // Clear existing data
    console.log('\u001B[36mClearing existing data...\u001B[0m');
    await Promise.all([
      boardModel.deleteMany({}),
      projectModel.deleteMany({}),
      taskModel.deleteMany({}),
      userModel.deleteMany({}),
    ]);

    // Insert demo users with explicit _id
    const usersToInsert = demoUsers.map((user) => ({
      _id: new Types.ObjectId(),
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const users = await userModel.insertMany(usersToInsert);
    if (users.length === 0) {
      throw new Error('No users were created. Cannot proceed without users.');
    }
    console.log(`Created ${users.length} users`);

    const boards = await boardModel.insertMany([
      {
        // Mark's Kanban
        ...demoBoards[0],
        // Mark S
        owner: users[2]._id,
        members: [users[2]._id],
        projects: [],
      },
      {
        // John's Kanban
        ...demoBoards[1],
        // John
        owner: users[0]._id,
        members: [users[0]._id],
        projects: [],
      },
      {
        // Jane's Kanban
        ...demoBoards[2],
        // Jane
        owner: users[1]._id,
        members: [users[1]._id],
        projects: [],
      },
      {
        // Dev Team Board
        ...demoBoards[3],
        // John
        owner: users[1]._id,
        // All developers
        members: [users[0]._id, users[1]._id, users[2]._id],
        projects: [],
      },
    ]);
    console.log(`Created ${boards.length} boards`);

    const projects = await projectModel.insertMany([
      {
        // Mark's task list
        ...demoProjects[0],
        // Mark S
        owner: users[2]._id,
        members: [users[2]._id],
        // Mark's Kanban
        board: boards[0]._id,
      },
      {
        // Demo Project 2
        ...demoProjects[1],
        // John
        owner: users[0]._id,
        members: [users[0]._id, users[2]._id],
        // Dev Team Board
        board: boards[3]._id,
      },
      {
        // Demo Project 3
        ...demoProjects[2],
        // Jane
        owner: users[1]._id,
        members: [users[1]._id, users[2]._id],
        // Dev Team Board
        board: boards[3]._id,
      },
    ]);
    console.log(`Created ${projects.length} projects`);

    // Update boards with project references
    await Promise.all([
      boardModel.findByIdAndUpdate(boards[0]._id, {
        $push: { projects: projects[0]._id },
      }),
      boardModel.findByIdAndUpdate(boards[3]._id, {
        $push: { projects: { $each: [projects[1]._id, projects[2]._id] } },
      }),
    ]);
    // Create tasks
    const tasks = await taskModel.insertMany([
      {
        ...demoTasks[0],
        board: boards[0]._id,
        project: projects[0]._id,
        // Mark S
        assignee: users[2]._id,
        creator: users[2]._id,
        lastModifier: users[2]._id,
        // 2 days from now
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        ...demoTasks[1],
        board: boards[1]._id,
        project: projects[1]._id,
        // Mark
        assignee: users[2]._id,
        // Jane
        creator: users[1]._id,
        lastModifier: users[1]._id,
        // 5 days from now
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
      {
        ...demoTasks[2],
        board: boards[2]._id,
        project: projects[2]._id,
        // Jane
        assignee: users[1]._id,
        // John
        creator: users[0]._id,
        // Jane
        lastModifier: users[1]._id,
        // 3 days from now
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    ]);
    console.log(`Created ${tasks.length} tasks`);
    console.log('\u001B[32mDatabase initialized successfully!\u001B[0m');
    console.log('\u001B[33mYou can now log in with the following test accounts:\u001B[0m');
    for (const user of users) {
      console.log({
        name: user.name,
        email: user.email,
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error during database initialization:', error);
    try {
      await mongoose.connection.close();
    } catch (closeError: unknown) {
      console.error('Failed to close connection:', closeError);
    }
    process.exit(1);
  }
};

void main();
