import { IHttpClient } from '../../core/ports/i-http-client.js';
import CircuitBreaker from 'opossum';
import pino from 'pino';

const logger = pino({ name: 'fetch-http-client' });

/**
 * HTTP client adapter using Node.js built-in fetch
 * Implements timeout, retries with exponential backoff, circuit breaker, and proper error handling
 */
export class FetchHttpClient extends IHttpClient {
  constructor(options = {}) {
    super();
    this.timeout = options.timeout || 15000; // 15 seconds
    this.maxRetries = options.maxRetries || 2;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(this._makeRequest.bind(this), {
      timeout: this.timeout + 5000, // Circuit breaker timeout slightly higher than request timeout
      errorThresholdPercentage: 50, // Open circuit when 50% of requests fail
      resetTimeout: 30000, // Wait 30 seconds before trying again
      volumeThreshold: 5, // Minimum number of requests before circuit can open
      name: 'http-client-circuit-breaker'
    });

    // Set up circuit breaker event handlers
    this._setupCircuitBreakerEvents();
  }

  /**
   * Makes a GET request with retry logic, timeout, and circuit breaker protection
   * @param {string} url - The URL to fetch
   * @returns {Promise<string>} The response body as UTF-8 text
   * @throws {Error} When request fails after all retries or returns non-2xx status
   */
  async get(url) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Use circuit breaker for the actual request
        const response = await this.circuitBreaker.fire(url);
        return response;
      } catch (error) {
        lastError = error;
        
        // Check if circuit is open
        if (this.circuitBreaker.opened) {
          logger.error({ url, error: error.message }, 'Circuit breaker is open, skipping retries');
          throw new Error(`Circuit breaker is open: ${error.message}`);
        }
        
        if (attempt === this.maxRetries) {
          logger.error({ url, attempt: attempt + 1, error: error.message }, 'HTTP request failed after all retries');
          throw error;
        }
        
        const delay = this._calculateBackoffDelay(attempt);
        logger.warn({ url, attempt: attempt + 1, delay, error: error.message }, 'HTTP request failed, retrying');
        
        await this._sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Sets up circuit breaker event handlers for monitoring
   * @private
   */
  _setupCircuitBreakerEvents() {
    this.circuitBreaker.on('open', () => {
      logger.warn('Circuit breaker opened - too many failures detected');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('Circuit breaker closed - service appears to be healthy again');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Circuit breaker half-open - testing if service is healthy');
    });

    this.circuitBreaker.on('fallback', (result) => {
      logger.warn({ result }, 'Circuit breaker fallback executed');
    });

    this.circuitBreaker.on('success', (result) => {
      logger.debug('Circuit breaker request succeeded');
    });

    this.circuitBreaker.on('timeout', () => {
      logger.warn('Circuit breaker request timed out');
    });

    this.circuitBreaker.on('reject', (error) => {
      logger.warn({ error: error.message }, 'Circuit breaker request rejected');
    });

    this.circuitBreaker.on('fire', (url) => {
      logger.debug({ url }, 'Circuit breaker request fired');
    });
  }

  /**
   * Makes a single HTTP request with timeout
   * @param {string} url - The URL to fetch
   * @returns {Promise<string>} The response body
   * @private
   */
  async _makeRequest(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      
      const text = await response.text();
      logger.debug({ url, status: response.status, contentLength: text.length }, 'HTTP request successful');
      
      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms for ${url}`);
      }
      
      throw error;
    }
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
   * Gets circuit breaker statistics for monitoring
   * @returns {Object} Circuit breaker stats
   */
  getCircuitBreakerStats() {
    return {
      opened: this.circuitBreaker.opened,
      closed: this.circuitBreaker.closed,
      halfOpen: this.circuitBreaker.halfOpen,
      stats: this.circuitBreaker.stats
    };
  }
} 