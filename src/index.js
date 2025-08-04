import 'dotenv/config';
import { App } from './app.js';
import pino from 'pino';

const logger = pino({ name: 'index' });

/**
 * Main application entry point
 */
async function main() {
  try {
    logger.info('Starting application...');
    
    const app = new App();
    await app.start();
    
    logger.info('Application is running. Press Ctrl+C to stop.');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await app.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await app.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Unhandled error in main');
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  logger.error({ error: error.message, stack: error.stack }, 'Failed to start application');
  process.exit(1);
}); 