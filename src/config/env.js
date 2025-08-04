import pino from 'pino';
import { z } from 'zod';

const logger = pino();

/**
 * Configuration schema using Zod for type-safe validation
 */
const ConfigSchema = z.object({
  // Server configuration
  server: z.object({
    port: z.number()
      .int('PORT must be an integer')
      .min(1, 'PORT must be at least 1')
      .max(65535, 'PORT must be at most 65535')
  }),
  
  // Scraping configuration
  scraper: z.object({
    url: z.string()
      .url('TARGET_URL must be a valid HTTP/HTTPS URL')
      .startsWith('http', 'URL must start with http or https'),
    cssSelector: z.string()
      .min(1, 'CSS_SELECTOR is required')
  }),
  
  // Scheduling configuration
  scheduler: z.object({
    cronExpression: z.string()
      .min(1, 'CRON_EXPRESSION is required')
      .refine(isValidCronExpression, {
        message: 'CRON_EXPRESSION must be a valid cron expression'
      })
  }),
  
  // WhatsApp configuration
  whatsapp: z.object({
    recipients: z.array(
      z.string().regex(/^90\d{10}$/, 'Phone number must be in Turkish format: 90XXXXXXXXXX')
    ).min(0, 'Recipients array can be empty for development'), // Changed from min(1) to min(0)
    messageTemplate: z.string()
      .min(1, 'Message template is required')
      .refine(template => template.includes('{{items}}'), {
        message: 'Message template must contain {{items}} placeholder'
      })
  }),
  
  // State management
  state: z.object({
    filePath: z.string()
      .min(1, 'STATE_FILE path is required')
  })
});

/**
 * Load and validate environment configuration
 * @returns {Object} Validated configuration object
 */
export function loadConfig() {
  try {
    const config = {
      // Server configuration
      server: {
        port: parseInt(process.env.PORT || '3000', 10)
      },
      
      // Scraping configuration
      scraper: {
        url: process.env.TARGET_URL || 'https://tr.twstats.com/tr94/index.php?page=ennoblements',
        cssSelector: process.env.CSS_SELECTOR || 'table.table tbody tr'
      },
      
      // Scheduling configuration
      scheduler: {
        cronExpression: process.env.CRON_EXPRESSION || '*/5 * * * *' // Every 5 minutes by default
      },
      
      // WhatsApp configuration
      whatsapp: {
        recipients: process.env.WHATSAPP_RECIPIENTS ? 
          process.env.WHATSAPP_RECIPIENTS.split(',').map(r => r.trim()) : 
          [], // No default recipients - must be provided in .env
        messageTemplate: process.env.MESSAGE_TEMPLATE || 'SiSu updates (x<452 & y>462):\n{{items}}'
      },
      
      // State management
      state: {
        filePath: process.env.STATE_FILE || './data/state.json'
      }
    };

    // Validate configuration using Zod schema
    const validatedConfig = ConfigSchema.parse(config);
    
    logger.info('Configuration loaded and validated successfully');
    return validatedConfig;
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      const errorMessage = `Configuration validation failed:\n${errorMessages}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
    
    logger.error({ error: error.message }, 'Failed to load configuration');
    throw error;
  }
}

/**
 * Basic cron expression validation
 * @param {string} expression - Cron expression to validate
 * @returns {boolean} True if valid
 */
function isValidCronExpression(expression) {
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
  return cronRegex.test(expression);
} 