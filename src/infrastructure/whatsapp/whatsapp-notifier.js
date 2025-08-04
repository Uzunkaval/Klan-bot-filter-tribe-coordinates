import { INotifier } from '../../core/ports/i-notifier.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import pino from 'pino';

const logger = pino({ name: 'whatsapp-notifier' });

/**
 * WhatsApp Web notifier adapter using whatsapp-web.js
 * Handles QR authentication, connection management, and message sending
 */
export class WhatsAppNotifier extends INotifier {
  constructor(recipients = []) {
    super();
    this.client = null;
    this.qrDataUrl = null;
    this.isReady = false;
    this.isInitializing = false;
    this.initPromise = null;
    this.recipients = recipients;
  }

  /**
   * Initializes WhatsApp Web client with QR authentication
   * @returns {Promise<void>}
   * @throws {Error} When initialization fails
   */
  async init() {
    // Prevent multiple simultaneous initializations
    if (this.isInitializing) {
      logger.info('Initialization already in progress, waiting...');
      return this.initPromise;
    }

    if (this.isReady && this.client) {
      logger.info('WhatsApp client already initialized and ready');
      return;
    }

    this.isInitializing = true;
    this.initPromise = this._performInit();
    
    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Performs the actual initialization
   * @returns {Promise<void>}
   * @private
   */
  async _performInit() {
    try {
      logger.info('Initializing WhatsApp Web client');
      
      // Create client with Windows-compatible settings
      this.client = new Client({
        authStrategy: new LocalAuth({ clientId: 'default' }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-ipc-flooding-protection'
          ],
          timeout: 120000, // 2 minute timeout
          executablePath: process.platform === 'win32' ? undefined : undefined // Let it auto-detect on Windows
        }
      });

      // Set up event handlers BEFORE initializing
      this._setupEventHandlers();

      // Initialize the client AFTER setting up event handlers
      logger.info('Starting WhatsApp client initialization...');
      await this.client.initialize();
      
      logger.info('WhatsApp Web client initialized successfully');
      
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to initialize WhatsApp client');
      
      // Clean up on error
      await this._cleanup();
      
      throw new Error(`WhatsApp initialization failed: ${error.message}`);
    }
  }

  /**
   * Sets up all event handlers for the WhatsApp client
   * @private
   */
  _setupEventHandlers() {
    // QR Code event
    this.client.on('qr', async (qr) => {
      try {
        logger.info('QR event received, generating data URL...');
        this.qrDataUrl = await qrcode.toDataURL(qr);
        logger.info('QR code generated and stored, ready for scanning');
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to generate QR code data URL');
      }
    });

    // Ready event
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('WhatsApp client is ready');
      // Keep QR code for a longer time after ready for debugging
      setTimeout(() => {
        this.qrDataUrl = null;
        logger.info('QR code cleared after client ready (10 minutes)');
      }, 600000); // Clear after 10 minutes instead of 5
    });

    // Loading screen event
    this.client.on('loading_screen', (percent, message) => {
      logger.info({ percent, message }, 'WhatsApp loading...');
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.qrDataUrl = null;
      logger.warn({ reason }, 'WhatsApp client disconnected');
    });

    // Authentication failure event
    this.client.on('auth_failure', (message) => {
      this.isReady = false;
      this.qrDataUrl = null;
      logger.error({ message }, 'WhatsApp authentication failed');
    });

    // Message event (for debugging)
    this.client.on('message', (message) => {
      logger.debug({ from: message.from, body: message.body }, 'Message received');
    });

    // Error event
    this.client.on('error', (error) => {
      logger.error({ error: error.message }, 'WhatsApp client error');
    });

    logger.info('Event handlers set up successfully');
  }

  /**
   * Cleans up resources on error
   * @private
   */
  async _cleanup() {
    if (this.client) {
      try {
        // Kill any remaining Puppeteer processes
        if (this.client.pupBrowser) {
          const pages = await this.client.pupBrowser.pages();
          await Promise.all(pages.map(page => page.close()));
          await this.client.pupBrowser.close();
        }
        await this.client.destroy();
      } catch (destroyError) {
        logger.error({ error: destroyError.message }, 'Failed to destroy client on error');
      }
      this.client = null;
    }
    this.isReady = false;
    this.qrDataUrl = null;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Gets the current QR code as a data URL for authentication
   * @returns {string|null} QR code data URL or null if not available
   */
  getCurrentQr() {
    logger.debug({ qrDataUrl: this.qrDataUrl ? 'exists' : 'null', isReady: this.isReady }, 'getCurrentQr called');
    
    if (!this.qrDataUrl) {
      logger.debug('No QR code available');
      return null;
    }
    
    logger.debug('QR code available, returning data URL');
    return this.qrDataUrl;
  }

  /**
   * Sends notifications to multiple phone numbers
   * @param {string[]} numbers - Array of phone numbers (e.g., "905551234567")
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   * @throws {Error} When sending fails
   */
  async notifyMany(numbers, message) {
    if (!this.client || !this.isReady) {
      throw new Error('WhatsApp client not ready. Call init() first and scan QR code.');
    }

    if (!numbers || numbers.length === 0) {
      logger.warn('No phone numbers provided for notification');
      return;
    }

    logger.info({ count: numbers.length }, 'Sending notifications to multiple numbers');

    const results = await Promise.allSettled(
      numbers.map(async (phoneNumber) => {
        try {
          // Convert phone number to chat ID format
          const chatId = `${phoneNumber}@c.us`;
          
          // Send the message
          await this.client.sendMessage(chatId, message);
          
          logger.info({ phoneNumber, chatId }, 'Message sent successfully');
          return { phoneNumber, success: true };
          
        } catch (error) {
          logger.error({ phoneNumber, error: error.message }, 'Failed to send message');
          return { phoneNumber, success: false, error: error.message };
        }
      })
    );

    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    
    logger.info({ 
      total: numbers.length, 
      successful, 
      failed 
    }, 'Notification sending completed');

    if (failed > 0) {
      logger.warn({ failed }, 'Some notifications failed to send');
    }
  }

  /**
   * Sends notification using configured recipients
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   * @throws {Error} When sending fails
   */
  async sendNotification(message) {
    const recipientsToUse = this.recipients && this.recipients.length > 0 ? this.recipients : null;
    
    if (!recipientsToUse) {
      logger.warn('No recipients configured for notification');
      return;
    }

    logger.info({ 
      recipientsCount: recipientsToUse.length,
      messageLength: message.length 
    }, 'Sending notification to configured recipients');

    await this.notifyMany(recipientsToUse, message);
  }

  /**
   * Checks if the WhatsApp client is ready for sending messages
   * @returns {boolean} True if client is ready
   */
  isClientReady() {
    return this.client && this.isReady;
  }

  /**
   * Gracefully disconnects the WhatsApp client
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.destroy();
        await this._cleanup();
        logger.info('WhatsApp client disconnected gracefully');
      } catch (error) {
        logger.error({ error: error.message }, 'Error during WhatsApp client disconnection');
        await this._cleanup();
      }
    }
  }
} 