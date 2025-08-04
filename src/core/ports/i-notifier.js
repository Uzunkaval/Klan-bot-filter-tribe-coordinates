/**
 * @description WhatsApp notification interface
 */

/**
 * Initializes the WhatsApp connection
 * @returns {Promise<void>}
 * @throws {Error} When initialization fails
 */
export class INotifier {
  async init() {
    throw new Error('INotifier.init() must be implemented');
  }

  /**
   * Gets the current QR code for WhatsApp Web authentication
   * @returns {string|null} QR code data or null if not available
   */
  getCurrentQr() {
    throw new Error('INotifier.getCurrentQr() must be implemented');
  }

  /**
   * Checks if the WhatsApp client is ready for sending messages
   * @returns {boolean} True if client is ready
   */
  isClientReady() {
    throw new Error('INotifier.isClientReady() must be implemented');
  }

  /**
   * Sends notification using configured recipients and message template
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   * @throws {Error} When notification fails
   */
  async sendNotification(message) {
    throw new Error('INotifier.sendNotification() must be implemented');
  }

  /**
   * Sends notifications to multiple phone numbers
   * @param {string[]} numbers - Array of phone numbers
   * @param {string} msg - Message to send
   * @returns {Promise<void>}
   * @throws {Error} When notification fails
   */
  async notifyMany(numbers, msg) {
    throw new Error('INotifier.notifyMany() must be implemented');
  }

  /**
   * Gracefully disconnects the WhatsApp client
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('INotifier.disconnect() must be implemented');
  }
} 