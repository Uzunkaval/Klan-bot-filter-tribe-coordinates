import { INotifier } from '../../core/ports/i-notifier.js';
import pino from 'pino';

const logger = pino({ name: 'whatsapp-routes' });

/**
 * WhatsApp test endpoints for QR code and message sending
 */
export class WhatsAppRoutes {
  /**
   * Creates a new WhatsAppRoutes instance
   * @param {INotifier} notifier - WhatsApp notifier service
   */
  constructor(notifier) {
    this.notifier = notifier;
  }

  /**
   * Registers WhatsApp routes with Express app
   * @param {Object} app - Express application instance
   */
  registerRoutes(app) {
    // GET /qr - Get current QR code
    app.get('/qr', async (req, res) => {
      logger.info('GET /qr - QR code request received');
      
      try {
        // Check if notifier is available
        if (!this.notifier) {
          logger.error('GET /qr - Notifier not available');
          return res.status(500).send(`
            <html>
              <head><title>Error</title></head>
              <body>
                <h1>Error</h1>
                <p>WhatsApp notifier not initialized</p>
                <p>Please check application logs for details.</p>
              </body>
            </html>
          `);
        }

        const qr = this.notifier.getCurrentQr();
        const isReady = this.notifier.isClientReady();
        
        if (!qr) {
          logger.info('GET /qr - No QR code available, showing waiting page');
          
          // Try to trigger QR generation if not ready
          if (!isReady) {
            try {
              logger.info('GET /qr - Attempting to initialize WhatsApp to generate QR');
              await this.notifier.init();
            } catch (error) {
              logger.error({ error: error.message }, 'GET /qr - Failed to initialize WhatsApp');
            }
          }
          
          return res.send(`
            <html>
              <head>
                <title>WhatsApp QR Code - Waiting</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                  .qr-container { margin: 20px; padding: 20px; border: 2px solid #ccc; display: inline-block; }
                  .status { color: #666; margin: 10px; }
                  .loading { color: #007bff; font-weight: bold; }
                  .ready { color: #28a745; font-weight: bold; }
                  .error { color: #dc3545; font-weight: bold; }
                  .refresh-btn { 
                    background: #007bff; color: white; padding: 10px 20px; 
                    border: none; border-radius: 5px; cursor: pointer; margin: 10px;
                  }
                </style>
              </head>
              <body>
                <h1>WhatsApp QR Code - ${isReady ? 'Ready' : 'Waiting'}</h1>
                <div class="qr-container">
                  <div style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; background: #f8f9fa;">
                    <div class="${isReady ? 'ready' : 'loading'}">
                      ${isReady ? 'WhatsApp Connected!' : 'QR Code Generating...'}
                    </div>
                  </div>
                </div>
                <p class="status">${isReady ? 'WhatsApp is ready to send messages' : 'Waiting for WhatsApp QR code to be generated...'}</p>
                <p><small>This page will automatically refresh every 5 seconds.</small></p>
                <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
                <script>
                  setTimeout(() => window.location.reload(), 5000);
                </script>
              </body>
            </html>
          `);
        }
        
        logger.info('GET /qr - QR code returned successfully');
        res.send(`
          <html>
            <head>
              <title>WhatsApp QR Code</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                .qr-container { margin: 20px; padding: 20px; border: 2px solid #ccc; display: inline-block; }
                .status { color: #666; margin: 10px; }
                .refresh-btn { 
                  background: #007bff; color: white; padding: 10px 20px; 
                  border: none; border-radius: 5px; cursor: pointer; margin: 10px;
                }
              </style>
            </head>
            <body>
              <h1>WhatsApp QR Code</h1>
              <p>Scan this QR code with your WhatsApp mobile app:</p>
              <div class="qr-container">
                <img src="${qr}" alt="WhatsApp QR Code" style="width: 300px; height: 300px;">
              </div>
              <p><small>This page will automatically refresh every 30 seconds.</small></p>
              <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
              <script>
                setTimeout(() => window.location.reload(), 30000);
              </script>
            </body>
          </html>
        `);
        
      } catch (error) {
        logger.error({ error: error.message }, 'GET /qr - Error occurred');
        res.status(500).send(`
          <html>
            <head><title>Error</title></head>
            <body>
              <h1>Error</h1>
              <p>Internal server error: ${error.message}</p>
              <p>Please check application logs for details.</p>
            </body>
          </html>
        `);
      }
    });

    // POST /send-test - Send test message
    app.post('/send-test', async (req, res) => {
      logger.info('POST /send-test - Test message request received');
      
      try {
        // Check if notifier is available and ready
        if (!this.notifier) {
          logger.error('POST /send-test - Notifier not available');
          return res.status(500).json({ 
            error: 'WhatsApp notifier not initialized',
            details: 'The WhatsApp service is not available. Please check application logs.'
          });
        }

        if (!this.notifier.isClientReady()) {
          logger.error('POST /send-test - WhatsApp client not ready');
          return res.status(503).json({ 
            error: 'WhatsApp client not ready',
            details: 'Please scan QR code first at /qr endpoint before sending messages.',
            qrEndpoint: '/qr'
          });
        }

        const { to, message } = req.body;
        
        // Validate request body
        if (!to || !message) {
          logger.warn('POST /send-test - Invalid request body', { body: req.body });
          return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'Both "to" (phone number) and "message" fields are required.',
            example: {
              to: "905551234567",
              message: "Test message"
            }
          });
        }
        
        if (typeof to !== 'string' || typeof message !== 'string') {
          logger.warn('POST /send-test - Invalid field types', { to: typeof to, message: typeof message });
          return res.status(400).json({ 
            error: 'Invalid field types',
            details: 'Both "to" and "message" must be strings.'
          });
        }
        
        if (!to.match(/^\d+$/)) {
          logger.warn('POST /send-test - Invalid phone number format', { to });
          return res.status(400).json({ 
            error: 'Invalid phone number format',
            details: 'Phone number must contain only digits (e.g., "905551234567").'
          });
        }
        
        logger.info({ to, messageLength: message.length }, 'POST /send-test - Sending test message');
        
        // Send the message
        await this.notifier.notifyMany([to], message);
        
        logger.info('POST /send-test - Test message sent successfully');
        res.json({ 
          ok: true, 
          message: 'Test message sent successfully',
          details: `Message sent to ${to}`
        });
        
      } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'POST /send-test - Error occurred');
        res.status(500).json({ 
          error: 'Failed to send message',
          details: error.message,
          suggestion: 'Check if WhatsApp is properly connected and the phone number is correct.'
        });
      }
    });
  }
} 