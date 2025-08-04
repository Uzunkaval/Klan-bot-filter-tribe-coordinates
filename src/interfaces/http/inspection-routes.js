import pino from 'pino';

const logger = pino({ name: 'inspection-routes' });

/**
 * Temporary inspection routes for debugging scraper and use-case
 * NOTE: This is TEMPORARY - business logic should not live in routes permanently
 */
export class InspectionRoutes {
  constructor(scraper, pollAndNotifyUseCase, stateStore) {
    this.scraper = scraper;
    this.pollAndNotifyUseCase = pollAndNotifyUseCase;
    this.stateStore = stateStore;
  }

  registerRoutes(app) {
    // GET /preview-filtered?limit=10 - Preview filtered events
    app.get('/preview-filtered', async (req, res) => {
      try {
        logger.info('Preview filtered events requested');
        
        const limit = parseInt(req.query.limit || '10', 10);
        
        // No filtering - get all events
        const allEvents = await this.scraper.scrape();
        const limitedEvents = allEvents.slice(0, limit);
        
        res.json({
          total: allEvents.length,
          filtered: allEvents.length, // No filtering - all events
          limited: limitedEvents.length,
          events: limitedEvents
        });
        
        logger.info({ total: allEvents.length, filtered: allEvents.length, limited: limitedEvents.length }, 'Preview completed');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Preview filtered events failed');
        res.status(500).json({ error: error.message });
      }
    });

    // POST /run-once - Execute the use-case once
    app.post('/run-once', async (req, res) => {
      try {
        logger.info('Run once requested');
        
        // Get current state before running
        const beforeEvents = await this.scraper.scrape();
        
        // Execute use-case
        await this.pollAndNotifyUseCase.runOnce();
        
        // Get state after running
        const afterEvents = await this.scraper.scrape();
        
        res.json({
          checked: afterEvents.length,
          matched: afterEvents.length, // No filtering - all events matched
          notified: beforeEvents.length !== afterEvents.length,
          summary: {
            before: { total: beforeEvents.length, filtered: beforeEvents.length },
            after: { total: afterEvents.length, filtered: afterEvents.length }
          }
        });
        
        logger.info({ checked: afterEvents.length, matched: afterEvents.length }, 'Run once completed');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Run once failed');
        res.status(500).json({ error: error.message });
      }
    });

    // GET /state - Get current state information
    app.get('/state', async (req, res) => {
      try {
        logger.info('State information requested');
        
        const currentState = this.stateStore.getCurrentState();
        const lastHash = await this.stateStore.loadLastHash();
        
        res.json({
          currentState,
          lastHash,
          hashExists: lastHash !== null
        });
        
        logger.info({ hashExists: lastHash !== null }, 'State information retrieved');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to get state information');
        res.status(500).json({ error: error.message });
      }
    });



    // GET /filters/status - Get current filter status
    app.get('/filters/status', async (req, res) => {
      try {
        logger.info('Filter status requested');
        
        const filtersActive = !!this.pollAndNotifyUseCase.filters;
        
        res.json({
          filtersActive,
          description: filtersActive ? 
            'Filters are ACTIVE - only SiSu tribe events will be notified' :
            'Filters are INACTIVE - all events will be notified'
        });
        
        logger.info({ filtersActive }, 'Filter status retrieved');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to get filter status');
        res.status(500).json({ error: error.message });
      }
    });

    // POST /filters/activate - Activate filters
    app.post('/filters/activate', async (req, res) => {
      try {
        logger.info('Filter activation requested');
        
        this.pollAndNotifyUseCase.filters = {
          tribe: 'SiSu'
        };
        
        res.json({
          success: true,
          message: 'Filters activated successfully',
          filters: this.pollAndNotifyUseCase.filters
        });
        
        logger.info('Filters activated successfully');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to activate filters');
        res.status(500).json({ error: error.message });
      }
    });

    // POST /filters/deactivate - Deactivate filters
    app.post('/filters/deactivate', async (req, res) => {
      try {
        logger.info('Filter deactivation requested');
        
        this.pollAndNotifyUseCase.filters = null;
        
        res.json({
          success: true,
          message: 'Filters deactivated successfully'
        });
        
        logger.info('Filters deactivated successfully');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to deactivate filters');
        res.status(500).json({ error: error.message });
      }
    });

    // POST /filters/toggle - Toggle filters on/off
    app.post('/filters/toggle', async (req, res) => {
      try {
        logger.info('Filter toggle requested');
        
        const currentStatus = !!this.pollAndNotifyUseCase.filters;
        
        if (currentStatus) {
          // Deactivate
          this.pollAndNotifyUseCase.filters = null;
          res.json({
            success: true,
            message: 'Filters deactivated',
            previousStatus: 'active',
            currentStatus: 'inactive'
          });
        } else {
          // Activate
          this.pollAndNotifyUseCase.filters = {
            tribe: 'SiSu',
            coordinates: {
              x: { max: 452 },
              y: { min: 462 }
            }
          };
          res.json({
            success: true,
            message: 'Filters activated',
            previousStatus: 'inactive',
            currentStatus: 'active'
          });
        }
        
        logger.info({ previousStatus: currentStatus, currentStatus: !currentStatus }, 'Filter toggle completed');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to toggle filters');
        res.status(500).json({ error: error.message });
      }
    });

    // GET /all-events - Get all scraped events (no filtering)
    app.get('/all-events', async (req, res) => {
      try {
        logger.info('All events requested');
        
        const allEvents = await this.scraper.scrape();
        
        res.json({
          total: allEvents.length,
          events: allEvents
        });
        
        logger.info({ total: allEvents.length }, 'All events retrieved');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to get all events');
        res.status(500).json({ error: error.message });
      }
    });

    // POST /state/clear - Clear stored state (for testing)
    app.post('/state/clear', async (req, res) => {
      try {
        logger.info('State clear requested');
        
        await this.stateStore.clear();
        
        res.json({ message: 'State cleared successfully' });
        
        logger.info('State cleared successfully');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to clear state');
        res.status(500).json({ error: error.message });
      }
    });

    // GET /metrics - Get system metrics and circuit breaker stats
    app.get('/metrics', async (req, res) => {
      try {
        logger.info('Metrics requested');
        
        // Get circuit breaker stats if available
        let circuitBreakerStats = null;
        if (this.scraper.httpClient && this.scraper.httpClient.getCircuitBreakerStats) {
          circuitBreakerStats = this.scraper.httpClient.getCircuitBreakerStats();
        }
        
        // Get system metrics
        const systemMetrics = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          arch: process.arch
        };
        
        // Get process metrics
        const processMetrics = {
          title: process.title,
          argv: process.argv,
          execPath: process.execPath,
          cwd: process.cwd()
        };
        
        res.json({
          timestamp: new Date().toISOString(),
          system: systemMetrics,
          process: processMetrics,
          circuitBreaker: circuitBreakerStats
        });
        
        logger.info('Metrics retrieved successfully');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to get metrics');
        res.status(500).json({ error: error.message });
      }
    });

    // GET /health/detailed - Detailed health check
    app.get('/health/detailed', async (req, res) => {
      try {
        logger.info('Detailed health check requested');
        
        const healthChecks = {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          checks: {}
        };
        
        // Check scraper health
        try {
          const events = await this.scraper.scrape();
          healthChecks.checks.scraper = {
            status: 'healthy',
            eventsCount: events.length,
            lastCheck: new Date().toISOString()
          };
        } catch (error) {
          healthChecks.checks.scraper = {
            status: 'unhealthy',
            error: error.message,
            lastCheck: new Date().toISOString()
          };
        }
        
        // Check state store health
        try {
          const lastHash = await this.stateStore.loadLastHash();
          healthChecks.checks.stateStore = {
            status: 'healthy',
            lastHash: lastHash ? 'exists' : 'none',
            lastCheck: new Date().toISOString()
          };
        } catch (error) {
          healthChecks.checks.stateStore = {
            status: 'unhealthy',
            error: error.message,
            lastCheck: new Date().toISOString()
          };
        }
        
        // Check circuit breaker health
        if (this.scraper.httpClient && this.scraper.httpClient.getCircuitBreakerStats) {
          const cbStats = this.scraper.httpClient.getCircuitBreakerStats();
          healthChecks.checks.circuitBreaker = {
            status: cbStats.opened ? 'open' : cbStats.halfOpen ? 'half-open' : 'closed',
            stats: cbStats.stats,
            lastCheck: new Date().toISOString()
          };
        }
        
        // Determine overall health
        const allHealthy = Object.values(healthChecks.checks).every(check => check.status === 'healthy');
        healthChecks.overall = allHealthy ? 'healthy' : 'degraded';
        
        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json(healthChecks);
        
        logger.info({ overall: healthChecks.overall }, 'Detailed health check completed');
        
      } catch (error) {
        logger.error({ error: error.message }, 'Detailed health check failed');
        res.status(500).json({ 
          error: error.message,
          timestamp: new Date().toISOString(),
          overall: 'unhealthy'
        });
      }
    });
  }
}