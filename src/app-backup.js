import { FetchHttpClient } from './infrastructure/http/fetch-http-client.js';
import { CheerioScraper } from './infrastructure/scraper/cheerio-scraper.js';
import { WhatsAppNotifier } from './infrastructure/whatsapp/whatsapp-notifier.js';
import { FileStateStore } from './infrastructure/store/file-state-store.js';
import { WhatsAppRoutes } from './interfaces/http/whatsapp-routes.js';
import { InspectionRoutes } from './interfaces/http/inspection-routes.js';
import { PollAndNotify } from './core/use-cases/poll-and-notify.js';
import { loadConfig } from './config/env.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import cron from 'node-cron';

const logger = pino({ name: 'app' });

/**
 * Application composition root
 * Wires all dependencies and starts the application
 */
export class App {
  constructor() {
    this.config = loadConfig();
    this.app = null;
    this.server = null;
    this.notifier = null;
    this.scraper = null;
    this.stateStore = null;
    this.pollAndNotify = null;
    this.scheduler = null;
  }

  /**
   * Initializes and starts the application
   * @returns {Promise<void>}
   */
  async start() {
    try {
      logger.info('Starting application...');
      
      // Initialize WhatsApp notifier with graceful fallback
      await this.initializeWhatsAppGracefully();
      
      // Initialize other dependencies
      this.initializeDependencies();
      
      // Setup HTTP server
      await this.setupHttpServer();
      
      // Start scheduled polling
      this.startScheduledPolling();
      
      logger.info('Application started successfully');
      
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start application');
      throw error;
    }
  }

  /**
   * Initializes WhatsApp notifier with graceful fallback
   * @returns {Promise<void>}
   * @private
   */
  async initializeWhatsAppGracefully() {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info({ attempt }, 'Initializing WhatsApp notifier...');
        
        this.notifier = new WhatsAppNotifier();
        await this.notifier.init();
        
        logger.info('WhatsApp notifier initialized successfully');
        return;
        
      } catch (error) {
        lastError = error;
        logger.error({ attempt, error: error.message }, 'WhatsApp initialization failed');
        
        if (attempt < maxRetries) {
          const delay = attempt * 5000; // 5s, 10s, 15s
          logger.info({ delay }, 'Retrying WhatsApp initialization...');
          await this.sleep(delay);
        }
      }
    }
    
    // If all retries failed, create a mock notifier to prevent app crash
    logger.warn('WhatsApp initialization failed after all retries, using mock notifier');
    this.notifier = this.createMockNotifier();
  }

  /**
   * Creates a mock notifier for when WhatsApp fails to initialize
   * @returns {Object} Mock notifier with same interface
   * @private
   */
  createMockNotifier() {
    return {
      init: async () => {
        logger.warn('Mock notifier init called - WhatsApp not available');
      },
      getCurrentQr: () => {
        logger.warn('Mock notifier getCurrentQr called - WhatsApp not available');
        return null;
      },
      isClientReady: () => {
        logger.warn('Mock notifier isClientReady called - WhatsApp not available');
        return false;
      },
      notifyMany: async (numbers, message) => {
        logger.warn({ numbers, messageLength: message.length }, 'Mock notifier notifyMany called - WhatsApp not available');
        // Don't throw error, just log and continue
        logger.info('Skipping WhatsApp notification due to unavailability');
      },
      disconnect: async () => {
        logger.warn('Mock notifier disconnect called - WhatsApp not available');
      }
    };
  }

  /**
   * Initializes WhatsApp notifier with retry mechanism (legacy method)
   * @returns {Promise<void>}
   * @private
   */
  async initializeWhatsAppWithRetry() {
    return this.initializeWhatsAppGracefully();
  }

  /**
   * Initializes WhatsApp notifier (legacy method)
   * @returns {Promise<void>}
   * @private
   */
  async initializeWhatsApp() {
    return this.initializeWhatsAppGracefully();
  }

  /**
   * Initializes other application dependencies
   * @private
   */
  initializeDependencies() {
    logger.info('Initializing dependencies...');
    
    // Initialize HTTP client
    const httpClient = new FetchHttpClient({
      timeout: 30000,
      maxRetries: 3
    });
    
    // Initialize scraper with configured URL and CSS selector
    this.scraper = new CheerioScraper(
      httpClient,
      this.config.scraper.url,
      this.config.scraper.cssSelector
    );
    
    // Initialize state store with configured file path
    this.stateStore = new FileStateStore(this.config.state.filePath);
    
    // Initialize the use-case with configuration
    this.pollAndNotify = new PollAndNotify(
      this.scraper,
      this.notifier,
      this.stateStore,
      this.config.whatsapp.recipients, // Use config recipients
      this.config.whatsapp.messageTemplate,
      {
        clan: 'SiSu',
        xMax: 452,
        yMin: 462
      }
    );
    
    logger.info('Dependencies initialized');
  }

  /**
   * Sets up HTTP server with routes and middleware
   * @returns {Promise<void>}
   * @private
   */
  async setupHttpServer() {
    logger.info('Setting up HTTP server...');
    
    // Create Express app
    this.app = express();
    this.app.use(express.json());
    
    // Add rate limiting middleware
    this.setupRateLimiting();
    
    // Add basic middleware
    this.app.use((req, res, next) => {
      logger.info({ method: req.method, url: req.url }, 'HTTP request');
      next();
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const whatsappStatus = this.notifier ? {
        ready: this.notifier.isClientReady(),
        hasQr: !!this.notifier.getCurrentQr()
      } : { ready: false, hasQr: false };

      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        whatsapp: whatsappStatus,
        services: {
          notifier: !!this.notifier,
          scraper: !!this.scraper,
          stateStore: !!this.stateStore,
          pollAndNotify: !!this.pollAndNotify
        }
      });
    });
    
    // Register WhatsApp routes
    const whatsappRoutes = new WhatsAppRoutes(this.notifier);
    whatsappRoutes.registerRoutes(this.app);
    
    // Register inspection routes (TEMPORARY)
    const inspectionRoutes = new InspectionRoutes(this.scraper, this.pollAndNotify, this.stateStore);
    inspectionRoutes.registerRoutes(this.app);
    
    // Start server
    const port = this.config.server.port;
    this.server = this.app.listen(port, () => {
      logger.info({ port }, 'HTTP server started');
    });
    
    logger.info('HTTP server setup completed');
  }

  /**
   * Sets up rate limiting middleware
   * @private
   */
  setupRateLimiting() {
    // General rate limit for all routes
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });

    // Stricter rate limit for WhatsApp endpoints
    const whatsappLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // limit each IP to 10 requests per minute (increased from 5)
      message: {
        error: 'Too many WhatsApp requests, please try again later.',
        retryAfter: '1 minute'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Stricter rate limit for inspection endpoints
    const inspectionLimiter = rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 20, // limit each IP to 20 requests per 5 minutes
      message: {
        error: 'Too many inspection requests, please try again later.',
        retryAfter: '5 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Apply general rate limiting to all routes
    this.app.use(generalLimiter);
    
    // Apply stricter rate limiting to specific route groups
    this.app.use('/qr', whatsappLimiter);
    this.app.use('/send-test', whatsappLimiter);
    this.app.use('/preview-filtered', inspectionLimiter);
    this.app.use('/run-once', inspectionLimiter);
    this.app.use('/state', inspectionLimiter);
    
    logger.info('Rate limiting middleware configured');
  }

  /**
   * Gracefully shuts down the application
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down application...');
    
    try {
      // Stop scheduler
      if (this.scheduler) {
        this.scheduler.stop();
        logger.info('Scheduler stopped');
      }
      
      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }
      
      // Disconnect WhatsApp
      if (this.notifier) {
        await this.notifier.disconnect();
        logger.info('WhatsApp disconnected');
      }
      
      logger.info('Application shutdown completed');
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error during shutdown');
    }
  }

  /**
   * Gets the Express app instance (for testing)
   * @returns {Object} Express app
   */
  getApp() {
    return this.app;
  }

  /**
   * Gets the WhatsApp notifier instance (for testing)
   * @returns {WhatsAppNotifier} Notifier instance
   */
  getNotifier() {
    return this.notifier;
  }

  /**
   * Gets the scraper instance (for testing)
   * @returns {CheerioScraper} Scraper instance
   */
  getScraper() {
    return this.scraper;
  }

  /**
   * Gets the poll and notify use-case instance (for testing)
   * @returns {PollAndNotify} Use-case instance
   */
  getPollAndNotify() {
    return this.pollAndNotify;
  }

  /**
   * Starts scheduled polling using cron
   * @private
   */
  startScheduledPolling() {
    logger.info({ cronExpression: this.config.scheduler.cronExpression }, 'Starting scheduled polling');
    
    this.scheduler = cron.schedule(this.config.scheduler.cronExpression, async () => {
      await this.executePollingWithRetry();
    }, {
      scheduled: false
    });
    
    this.scheduler.start();
    logger.info('Scheduled polling started');
  }

  /**
   * Executes polling with enhanced retry logic and error recovery
   * @private
   */
  async executePollingWithRetry() {
    const maxRetries = 2;
    const retryDelay = 5000; // 5 seconds
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        logger.info({ attempt }, 'Starting scheduled polling execution');
        
        // Check WhatsApp connection before proceeding, but don't fail if not ready
        if (this.notifier && !this.notifier.isClientReady()) {
          logger.warn('WhatsApp client not ready, but continuing with polling');
          // Don't try to reconnect here to avoid blocking polling
        }
        
        // Get initial state for logging
        const beforeEvents = await this.scraper.scrape();
        const beforeFiltered = this.applyFilterLogicForLogging(beforeEvents);
        
        // Execute use-case
        await this.pollAndNotify.runOnce();
        
        // Get final state for logging
        const afterEvents = await this.scraper.scrape();
        const afterFiltered = this.applyFilterLogicForLogging(afterEvents);
        
        logger.info({ 
          attempt,
          totalEvents: afterEvents.length,
          matchedEvents: afterFiltered.length,
          stateChanged: beforeFiltered.length !== afterFiltered.length || beforeEvents.length !== afterEvents.length,
          whatsappReady: this.notifier ? this.notifier.isClientReady() : false
        }, 'Scheduled polling completed successfully');
        
        return; // Success, exit retry loop
        
      } catch (error) {
        logger.error({ attempt, error: error.message, stack: error.stack }, 'Scheduled polling failed');
        
        // Handle specific error types
        if (error.message.includes('fetch failed') || error.message.includes('network')) {
          logger.warn({ attempt }, 'Network error detected, will retry');
        } else if (error.message.includes('WhatsApp') || error.message.includes('not available')) {
          logger.warn({ attempt }, 'WhatsApp error detected, continuing without WhatsApp');
          // Don't retry for WhatsApp errors, just continue
          return;
        }
        
        if (attempt <= maxRetries) {
          const delay = retryDelay * attempt; // Exponential backoff
          logger.info({ attempt, delay }, 'Retrying scheduled polling');
          await this.sleep(delay);
        } else {
          logger.error('Scheduled polling failed after all retries');
        }
      }
    }
  }

  /**
   * Attempts to reconnect WhatsApp client
   * @private
   */
  async reconnectWhatsApp() {
    try {
      logger.info('Attempting WhatsApp reconnection...');
      
      if (this.notifier) {
        await this.notifier.disconnect();
      }
      
      this.notifier = new WhatsAppNotifier();
      await this.notifier.init();
      
      // Update the use-case with new notifier
      this.pollAndNotify = new PollAndNotify(
        this.scraper,
        this.notifier,
        this.stateStore,
        this.config.whatsapp.recipients,
        this.config.whatsapp.messageTemplate,
        {
          clan: 'SiSu',
          xMax: 452,
          yMin: 462
        }
      );
      
      logger.info('WhatsApp reconnection successful');
      
    } catch (error) {
      logger.error({ error: error.message }, 'WhatsApp reconnection failed');
      throw error;
    }
  }

  /**
   * Helper method to apply filter logic for logging purposes only
   * @param {Array} events - Array of ennoblement events
   * @returns {Array} Filtered events
   * @private
   */
  applyFilterLogicForLogging(events) {
    return events.filter(event => {
      const oldTribeMatch = event.oldTribe && 
        event.oldTribe.trim().toLowerCase() === 'sisu'.toLowerCase();
      const newTribeMatch = event.newTribe && 
        event.newTribe.trim().toLowerCase() === 'sisu'.toLowerCase();
      const clanMatches = oldTribeMatch || newTribeMatch;
      const coordMatches = event.x < 452 && event.y > 462;
      return clanMatches && coordMatches;
    });
  }

  /**
   * Helper method to sleep for a given number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 