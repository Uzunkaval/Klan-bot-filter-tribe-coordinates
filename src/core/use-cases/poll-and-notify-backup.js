import { IScraper } from '../ports/i-scraper.js';
import { INotifier } from '../ports/i-notifier.js';
import { IStateStore } from '../ports/i-state-store.js';
import { createEnnoblementEvent } from '../entities/ennoblement-event.js';
import crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'poll-and-notify' });

/**
 * @typedef {Object} NotificationFilters
 * @description Filters for ennoblement events
 * @property {string} clan - Tribe name to filter for (case-insensitive)
 * @property {number} xMax - Maximum X coordinate (x < xMax)
 * @property {number} yMin - Minimum Y coordinate (y > yMin)
 */

/**
 * @description Main use-case for polling Tribal Wars ennoblements and sending notifications
 * 
 * Flow: scrape -> normalize -> filter -> hash -> compare -> notify -> persist
 */
export class PollAndNotify {
  /**
   * Creates a new PollAndNotify instance
   * @param {IScraper} scraper - Web scraper for Tribal Wars
   * @param {INotifier} notifier - WhatsApp notification service
   * @param {IStateStore} store - State persistence for deduplication
   * @param {string[]} recipients - Array of phone numbers to notify
   * @param {string} template - Message template for notifications
   * @param {NotificationFilters} filters - Event filtering criteria
   */
  constructor(scraper, notifier, store, recipients, template, filters) {
    this.scraper = scraper;
    this.notifier = notifier;
    this.store = store;
    this.recipients = recipients;
    this.template = template;
    this.filters = filters;
    this.lastExecutionTime = null;
    this.executionCount = 0;
    this.errorCount = 0;
  }

  /**
   * Executes one polling cycle with enhanced error recovery
   * 
   * Process:
   * 1. Scrape ennoblement events from Tribal Wars
   * 2. Normalize and filter events by clan (oldTribe OR newTribe matches) AND coordinates (x < xMax AND y > yMin)
   * 3. Create stable hash of filtered events
   * 4. Compare with last stored hash
   * 5. If hash changed: send notifications to recipients
   * 6. Persist new hash for next comparison
   * 
   * @returns {Promise<void>}
   * @throws {Error} When scraping, notification, or persistence fails
   */
  async runOnce() {
    const startTime = Date.now();
    this.executionCount++;
    
    try {
      logger.info({ executionCount: this.executionCount }, 'Starting polling cycle');
      
      // 1. Scrape events with retry
      const allEvents = await this._scrapeWithRetry();
      
      // 2. Filter events based on criteria
      const filteredEvents = this.filterEvents(allEvents);
      
      logger.info({ 
        totalEvents: allEvents.length, 
        filteredEvents: filteredEvents.length 
      }, 'Events scraped and filtered');
      
      if (filteredEvents.length === 0) {
        logger.info('No relevant events found, skipping notification');
        this._updateExecutionStats(startTime, true);
        return;
      }
      
      // 3. Build stable signature
      const signature = this.buildSignature(filteredEvents);
      
      // 4. Hash signature
      const newHash = this.hashSignature(signature);
      
      // 5. Compare with last hash
      const lastHash = await this._loadHashWithRetry();
      
      if (lastHash === newHash) {
        logger.info('No changes detected, skipping notification');
        this._updateExecutionStats(startTime, true);
        return;
      }
      
      // 6. Send notifications with retry
      const message = this.renderMessage(filteredEvents);
      await this._notifyWithRetry(message);
      
      // 7. Save new hash with retry
      await this._saveHashWithRetry(newHash);
      
      logger.info({ 
        eventsCount: filteredEvents.length,
        recipientsCount: this.recipients.length 
      }, 'Notification cycle completed successfully');
      
      this._updateExecutionStats(startTime, true);
      
    } catch (error) {
      this.errorCount++;
      this._updateExecutionStats(startTime, false);
      
      logger.error({ 
        error: error.message, 
        executionCount: this.executionCount,
        errorCount: this.errorCount 
      }, 'Polling cycle failed');
      
      throw new Error(`PollAndNotify.runOnce() failed: ${error.message}`);
    }
  }

  /**
   * Scrapes events with retry mechanism
   * @returns {Promise<Array>} Scraped events
   * @private
   */
  async _scrapeWithRetry() {
    return this._retryWithBackoff(async () => {
      return await this.scraper.scrape();
    }, 'scraping');
  }

  /**
   * Loads hash with retry mechanism
   * @returns {Promise<string|null>} Last hash
   * @private
   */
  async _loadHashWithRetry() {
    return this._retryWithBackoff(async () => {
      return await this.store.loadLastHash();
    }, 'loading hash');
  }

  /**
   * Saves hash with retry mechanism
   * @param {string} hash - Hash to save
   * @returns {Promise<void>}
   * @private
   */
  async _saveHashWithRetry(hash) {
    return this._retryWithBackoff(async () => {
      return await this.store.saveLastHash(hash);
    }, 'saving hash');
  }

  /**
   * Sends notifications with retry mechanism
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   * @private
   */
  async _notifyWithRetry(message) {
    return this._retryWithBackoff(async () => {
      // Check if notifier is available and ready
      if (!this.notifier || !this.notifier.isClientReady()) {
        logger.warn('WhatsApp notifier not ready, skipping notification');
        return; // Don't throw error, just skip notification
      }
      
      // Check if we have recipients
      if (!this.recipients || this.recipients.length === 0) {
        logger.warn('No recipients configured, skipping notification');
        return; // Don't throw error, just skip notification
      }
      
      return await this.notifier.notifyMany(this.recipients, message);
    }, 'sending notifications');
  }

  /**
   * Retry mechanism with exponential backoff
   * @param {Function} operation - Operation to retry
   * @param {string} operationName - Name of operation for logging
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<any>} Operation result
   * @private
   */
  async _retryWithBackoff(operation, operationName, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          logger.error({ 
            operation: operationName, 
            attempt: attempt + 1, 
            error: error.message 
          }, `${operationName} failed after all retries`);
          throw error;
        }
        
        const delay = this._calculateBackoffDelay(attempt);
        logger.warn({ 
          operation: operationName, 
          attempt: attempt + 1, 
          delay, 
          error: error.message 
        }, `${operationName} failed, retrying`);
        
        await this._sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Calculates exponential backoff delay with jitter
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateBackoffDelay(attempt) {
    const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
    const jitter = Math.random() * 0.1 * baseDelay; // ±10% jitter
    return Math.min(baseDelay + jitter, 10000); // Cap at 10s
  }

  /**
   * Sleeps for the specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Updates execution statistics
   * @param {number} startTime - Start time of execution
   * @param {boolean} success - Whether execution was successful
   * @private
   */
  _updateExecutionStats(startTime, success) {
    this.lastExecutionTime = new Date();
    const duration = Date.now() - startTime;
    
    logger.debug({ 
      duration, 
      success, 
      executionCount: this.executionCount,
      errorCount: this.errorCount 
    }, 'Execution stats updated');
  }

  /**
   * Gets execution statistics
   * @returns {Object} Execution statistics
   */
  getExecutionStats() {
    return {
      executionCount: this.executionCount,
      errorCount: this.errorCount,
      successRate: this.executionCount > 0 ? 
        ((this.executionCount - this.errorCount) / this.executionCount * 100).toFixed(2) : 0,
      lastExecutionTime: this.lastExecutionTime,
      errorRate: this.executionCount > 0 ? 
        (this.errorCount / this.executionCount * 100).toFixed(2) : 0
    };
  }

  /**
   * Filters events based on clan and coordinate criteria
   * @param {Array} events - Array of ennoblement events
   * @returns {Array} Filtered events
   * @private
   */
  filterEvents(events) {
    // Filter events for SiSu clan and specific coordinates
    return events.filter(event => {
      // Check clan filter (case-insensitive)
      const oldTribeMatch = event.oldTribe && 
        event.oldTribe.trim().toLowerCase() === this.filters.clan.toLowerCase();
      const newTribeMatch = event.newTribe && 
        event.newTribe.trim().toLowerCase() === this.filters.clan.toLowerCase();
      
      const clanMatches = oldTribeMatch || newTribeMatch;
      
      // Check coordinate filter
      const coordMatches = event.x < this.filters.xMax && event.y > this.filters.yMin;
      
      return clanMatches && coordMatches;
    });
  }

  /**
   * Builds a stable signature from filtered events
   * @param {Array} events - Filtered ennoblement events
   * @returns {string} Stable signature
   * @private
   */
  buildSignature(events) {
    return events
      .map(event => {
        const oldTribe = event.oldTribe ? event.oldTribe.trim() : '';
        const newTribe = event.newTribe ? event.newTribe.trim() : '';
        return `${event.timestamp}|${event.x}|${event.y}|${oldTribe}|${newTribe}`;
      })
      .sort() // Ensure deterministic order
      .join('\n');
  }

  /**
   * Creates SHA256 hash of signature
   * @param {string} signature - Event signature
   * @returns {string} SHA256 hash
   * @private
   */
  hashSignature(signature) {
    return crypto.createHash('sha256').update(signature).digest('hex');
  }

  /**
   * Renders notification message from template and events
   * @param {Array} events - Filtered ennoblement events
   * @returns {string} Formatted message
   * @private
   */
  renderMessage(events) {
    if (this.template) {
      // Use template if provided
      return this.template.replace('{{items}}', this.formatEventsForTemplate(events));
    }
    
    // Enhanced message format with detailed information
    const header = `🏰 *SiSu Ennoblement Güncellemeleri* (${events.length} yeni)\n\n`;
    const eventList = events.map(event => {
      return this.formatSingleEvent(event);
    }).join('\n\n');
    
    return header + eventList;
  }

  /**
   * Formats a single ennoblement event with detailed information
   * @param {Object} event - Ennoblement event
   * @returns {string} Formatted event string
   * @private
   */
  formatSingleEvent(event) {
    const isSiSuGain = event.newTribe && event.newTribe.trim().toLowerCase() === 'sisu';
    const isSiSuLoss = event.oldTribe && event.oldTribe.trim().toLowerCase() === 'sisu';
    
    let status = '';
    if (isSiSuGain) {
      status = '🟢 *KÖY KAZANILDI!*';
    } else if (isSiSuLoss) {
      status = '🔴 *KÖY KAYBEDİLDİ!*';
    } else {
      status = '🟡 *KÖY DEĞİŞTİ*';
    }
    
    const oldTribe = event.oldTribe ? `[${event.oldTribe}]` : '[No Tribe]';
    const newTribe = event.newTribe ? `[${event.newTribe}]` : '[No Tribe]';
    
    return `${status}\n` +
           `🏘️ *${event.villageName}* (${event.x}|${event.y})\n` +
           `📊 ${event.points} puan\n` +
           `👤 *Eski Sahip:* ${event.oldPlayer} ${oldTribe}\n` +
           `👤 *Yeni Sahip:* ${event.newPlayer} ${newTribe}\n` +
           `⏰ ${event.timestamp}`;
  }

  /**
   * Formats events for template replacement
   * @param {Array} events - Filtered ennoblement events
   * @returns {string} Formatted events string
   * @private
   */
  formatEventsForTemplate(events) {
    return events.map(event => {
      return this.formatSingleEvent(event);
    }).join('\n\n');
  }
} 