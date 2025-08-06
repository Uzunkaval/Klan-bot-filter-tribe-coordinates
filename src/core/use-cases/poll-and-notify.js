import pino from 'pino';

const logger = pino({ name: 'poll-and-notify' });

/**
 * Core use case for polling ennoblement events and sending notifications
 */
export class PollAndNotify {
  constructor(scraper, notifier, stateStore, recipients = null, filters = null) {
    this.scraper = scraper;
    this.notifier = notifier;
    this.stateStore = stateStore;
    this.recipients = recipients;
    this.filters = filters;
    this.executionCount = 0;
  }

  /**
   * Execute one polling cycle
   * @returns {Promise<Object>} Execution result
   */
  async runOnce() {
    this.executionCount++;
    logger.info({ executionCount: this.executionCount }, 'Starting polling cycle');

    try {
      // Scrape events from the website
      const allEvents = await this.scraper.scrape();
      logger.info({ totalEvents: allEvents.length }, 'Events scraped from website');

      if (allEvents.length === 0) {
        logger.warn('No events found on website');
        return { success: true, eventsCount: 0, message: 'No events found' };
      }

      // Load last processed timestamp
      const lastProcessedTimestamp = await this.stateStore.loadLastProcessedTimestamp();
      
      if (!lastProcessedTimestamp) {
        // First run: save the timestamp of the latest event and don't send notification
        const latestEvent = allEvents[0]; // First event is the latest
        await this.stateStore.saveLastProcessedTimestamp(latestEvent.timestamp);
        logger.info({ 
          latestEvent: latestEvent.village, 
          timestamp: latestEvent.timestamp 
        }, 'First run: saved latest event timestamp, no notification sent');
        return { 
          success: true, 
          eventsCount: 0, 
          message: 'First run: timestamp saved, no notification sent' 
        };
      }

      // Find events newer than last processed timestamp
      const newEvents = this.findNewEvents(allEvents, lastProcessedTimestamp);
      
      // Filtreleme: Eğer filtreler aktifse sadece belirli koşulları karşılayan eventleri al
      const filteredEvents = newEvents.filter(event => {
        // Debug: Klan adlarını logla
        logger.info({ 
          newTribe: event.newTribe, 
          oldTribe: event.oldTribe,
          villageName: event.villageName,
          filtersActive: !!this.filters
        }, 'Checking tribe filter');
        
        // Eğer filtreler aktifse, sadece SiSu klanının eventlerini al
        if (this.filters) {
          return (event.newTribe === 'SiSu' || event.oldTribe === 'SiSu')
          // && event.x < 452 && event.y > 462
          ;
        }
        
        // Filtreler aktif değilse, tüm eventleri al
        return true;
      });
      
      // if (filteredEvents.length === 0) {
      //   logger.info('No new filtered events found, skipping notification');
      //   return { success: true, eventsCount: 0, message: 'No new filtered events found' };
      // }

      // Send notification for new events (only if there are events to send)
      if (filteredEvents.length > 0) {
        const message = this.renderMessage(filteredEvents);
        await this._notifyWithRetry(message);
      }

      // Update last processed timestamp to the latest event we just processed
      // Only update if we have new events
      if (newEvents.length > 0) {
        const latestProcessedEvent = newEvents[0]; // First event is the latest (newest)
        await this.stateStore.saveLastProcessedTimestamp(latestProcessedEvent.timestamp);
      }

      logger.info({ 
        eventsCount: filteredEvents.length, 
        recipientsCount: this.recipients?.length || this.notifier.recipients?.length || 0,
        newEvents: filteredEvents.map(e => e.villageName)
      }, 'Notification cycle completed successfully');

      return { 
        success: true, 
        eventsCount: filteredEvents.length, 
        message: `Sent ${filteredEvents.length} new events` 
      };

    } catch (error) {
      logger.error({ error: error.message }, 'Error in polling cycle');
      throw error;
    }
  }

  /**
   * Find events newer than the given timestamp
   * @param {Array} events - All events from website
   * @param {string} lastProcessedTimestamp - Last processed timestamp
   * @returns {Array} New events
   */
  findNewEvents(events, lastProcessedTimestamp) {
    if (!lastProcessedTimestamp) {
      return [];
    }

    const lastProcessedDate = this.parseTimestamp(lastProcessedTimestamp);
    const newEvents = [];

    for (const event of events) {
      const eventDate = this.parseTimestamp(event.timestamp);
      if (eventDate > lastProcessedDate) {
        newEvents.push(event);
      }
    }

    logger.info({ 
      totalEvents: events.length, 
      newEventsCount: newEvents.length, 
      lastProcessedTimestamp,
      latestEvent: events[0]
    }, 'Events scraped, new events identified');

    return newEvents;
  }

  /**
   * Parse timestamp string to Date object
   * @param {string} timestamp - Timestamp in "YYYY-MM-DD - HH:MM:SS" format
   * @returns {Date} Parsed date
   */
  parseTimestamp(timestamp) {
    // Parse "2025-08-02 - 18:08:12" format
    const [datePart, timePart] = timestamp.split(' - ');
    const [year, month, day] = datePart.split('-');
    const [hour, minute, second] = timePart.split(':');
    
    return new Date(
      parseInt(year), 
      parseInt(month) - 1, // Month is 0-indexed
      parseInt(day), 
      parseInt(hour), 
      parseInt(minute), 
      parseInt(second)
    );
  }

  /**
   * Render message for multiple events
   * @param {Array} events - Events to include in message
   * @returns {string} Formatted message
   */
  renderMessage(events) {
    if (events.length === 0) {
      return 'No new ennoblement events found.';
    }

    if (events.length === 1) {
      return this.formatSingleEvent(events[0]);
    }

    // Multiple events
    let message = `*${events.length} Yeni Köy Eventi Bulundu!*\n\n`;
    
    events.forEach((event, index) => {
      message += `${index + 1}. ${this.formatSingleEvent(event)}\n\n`;
    });

    return message;
  }

  /**
   * Format a single event for display
   * @param {Object} event - Event object
   * @returns {string} Formatted event string
   */
  formatSingleEvent(event) {
    const villageName = event.villageName || 'Bilinmeyen Köy';
    const coordinates = `${event.x}|${event.y}`;
    const oldPlayer = event.oldPlayer || 'Bilinmeyen';
    const oldTribe = event.oldTribe || 'null';
    const newPlayer = event.newPlayer || 'Bilinmeyen';
    const newTribe = event.newTribe || 'null';
    const timestamp = event.timestamp || 'Bilinmeyen Zaman';
    
    return `🏰 *${villageName}*\n` +
           `Koordinat: ${coordinates}\n` +
           `🔄 ${oldPlayer} (${oldTribe}) → ${newPlayer} (${newTribe})\n` +
           `⏰ ${timestamp}`;
  }

  /**
   * Send notification with retry logic
   * @param {string} message - Message to send
   */
  async _notifyWithRetry(message) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if notifier is ready, but don't fail completely if not
        if (!this.notifier.isClientReady()) {
          logger.warn('Notifier not ready, attempting to send anyway');
          // Continue with the attempt - the notifier might handle it gracefully
        }

        await this.notifier.sendNotification(message);
        logger.info('Notification sent successfully');
        return;

      } catch (error) {
        lastError = error;
        logger.warn({ attempt, error: error.message }, 'Notification attempt failed');
        
        // If it's a WhatsApp not ready error, don't retry
        if (error.message.includes('not ready') || error.message.includes('Call init() first')) {
          logger.warn('WhatsApp not ready, skipping retry');
          return;
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    logger.error({ error: lastError.message }, 'All notification attempts failed');
    throw lastError;
  }
} 