# Tribal Wars TR94 Ennoblement Monitor

A Node.js application that monitors Tribal Wars TR94 ennoblements and sends WhatsApp notifications for events matching specific filters.

## Features

- **Web Scraping**: Monitors Tribal Wars TR94 ennoblements page
- **Smart Filtering**: Filters events by clan (SiSu) and coordinates (x < 452 AND y > 462)
- **WhatsApp Notifications**: Sends notifications via WhatsApp Web
- **Duplicate Prevention**: Uses hash-based deduplication to prevent spam
- **Scheduled Polling**: Configurable cron-based polling
- **Resilient**: Automatic retry logic, circuit breaker pattern, and error recovery
- **Clean Architecture**: Follows SOLID principles and Clean Architecture
- **Enhanced Security**: Rate limiting, input validation, and monitoring
- **Observability**: Comprehensive logging, metrics, and health checks

## Architecture

```
src/
├── core/                    # Domain layer (ports, entities, use-cases)
│   ├── ports/              # Interface definitions
│   ├── entities/           # Domain entities
│   └── use-cases/          # Business logic
├── infrastructure/         # Adapters (implementations)
│   ├── http/              # HTTP client with circuit breaker
│   ├── scraper/           # Web scraper
│   ├── whatsapp/          # WhatsApp integration
│   └── store/             # State persistence
├── interfaces/             # I/O layer (HTTP API)
├── config/                 # Configuration management with Zod validation
├── app.js                  # Composition root
└── index.js                # Entry point
```

## Prerequisites

- Node.js 18+
- WhatsApp Web access
- Internet connection for scraping

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (copy from `env.example`):
   ```bash
   cp env.example .env
   ```

4. Configure environment variables in `.env`:
   ```env
   # Server Configuration
   PORT=3000
   
   # Scraping Configuration
   TARGET_URL=https://tr.twstats.com/tr94/index.php?page=ennoblements
   CSS_SELECTOR=table.table tbody tr
   
   # Scheduling Configuration
   CRON_EXPRESSION=*/5 * * * *
   
   # WhatsApp Configuration
   WHATSAPP_RECIPIENTS=905551234567,905559876543
   MESSAGE_TEMPLATE=SiSu updates (x<452 & y>462):\n{{items}}
   
   # State Management
   STATE_FILE=./data/state.json
   ```

## Usage

### Start the Application

```bash
npm start
```

The application will:
1. Initialize WhatsApp Web client
2. Start HTTP server on configured port
3. Begin scheduled polling based on cron expression

### WhatsApp Setup

On first run:
1. Open `http://localhost:3000/qr` in browser
2. Scan QR code with WhatsApp
3. Wait for "WhatsApp ready" message in logs

### API Endpoints

#### Core Endpoints
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check with component status
- `GET /metrics` - System metrics and circuit breaker statistics

#### WhatsApp Endpoints
- `GET /qr` - Get WhatsApp QR code
- `POST /send-test` - Send test WhatsApp message

#### Inspection Endpoints (Development)
- `GET /preview-filtered?limit=5` - Preview filtered events
- `POST /run-once` - Execute polling once
- `GET /state` - Get current state information
- `POST /state/clear` - Clear stored state

### Testing Endpoints

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/health/detailed

# System metrics
curl http://localhost:3000/metrics

# Preview filtered events
curl "http://localhost:3000/preview-filtered?limit=5"

# Execute polling once
curl -X POST http://localhost:3000/run-once

# Get state information
curl http://localhost:3000/state

# Send test message
curl -X POST http://localhost:3000/send-test \
  -H "Content-Type: application/json" \
  -d '{"to": "905551234567", "message": "Test message"}'
```

## Configuration

### Environment Variables

| Variable | Description | Default | Validation |
|----------|-------------|---------|------------|
| `PORT` | HTTP server port | `3000` | 1-65535 |
| `TARGET_URL` | URL to scrape | TWStats ennoblements | Valid HTTP/HTTPS URL |
| `CSS_SELECTOR` | CSS selector for table rows | `table.table tbody tr` | Required string |
| `CRON_EXPRESSION` | Polling schedule | `*/5 * * * *` | Valid cron expression |
| `WHATSAPP_RECIPIENTS` | Comma-separated phone numbers | Required | Turkish format: 90XXXXXXXXXX |
| `MESSAGE_TEMPLATE` | Message template with `{{items}}` | `SiSu updates (x<452 & y>462):\n{{items}}` | Must contain `{{items}}` |
| `STATE_FILE` | State file path | `./data/state.json` | Valid file path |

### Phone Number Format

Phone numbers must be in Turkish format: `90XXXXXXXXXX`

### Cron Expression

Default: Every 5 minutes (`*/5 * * * *`)

Examples:
- `*/1 * * * *` - Every minute
- `*/10 * * * *` - Every 10 minutes
- `0 */1 * * *` - Every hour

## Filtering Logic

The application filters ennoblement events based on:

1. **Clan Filter**: Tribe name equals "SiSu" (case-insensitive) in either:
   - Old owner tribe
   - New owner tribe

2. **Coordinate Filter**: Village coordinates must satisfy:
   - `x < 452` AND `y > 462`

## Resilience Features

### Circuit Breaker Pattern
- Automatically opens circuit when 50% of HTTP requests fail
- 30-second reset timeout before retrying
- Prevents cascading failures

### Retry Mechanism
- Exponential backoff with jitter
- Configurable retry attempts
- Automatic recovery from transient failures

### Rate Limiting
- General rate limit: 100 requests per 15 minutes
- WhatsApp endpoints: 5 requests per minute
- Inspection endpoints: 20 requests per 5 minutes

## State Management

The application uses file-based state persistence (`./data/state.json`) to:
- Prevent duplicate notifications
- Track last processed events
- Survive application restarts

## Error Handling

- **Network Errors**: Automatic retry with exponential backoff
- **WhatsApp Disconnection**: Automatic reconnection
- **Scraping Errors**: Graceful degradation with logging
- **Configuration Errors**: Schema-based validation with descriptive messages
- **Circuit Breaker**: Automatic failure detection and recovery

## Monitoring & Observability

### Health Checks
- Basic health check: `/health`
- Detailed health check: `/health/detailed`
- Component-level status monitoring

### Metrics
- System metrics: CPU, memory, uptime
- Process metrics: PID, version, platform
- Circuit breaker statistics
- Execution statistics

### Logging
- Structured logging with Pino
- Log levels: debug, info, warn, error
- Never logs sensitive data

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Development Mode

```bash
npm run dev
```

### Project Structure

- **Clean Architecture**: Strict separation of concerns
- **Dependency Injection**: All dependencies injected through ports
- **SOLID Principles**: Single responsibility, dependency inversion
- **Error Handling**: Comprehensive error handling and logging
- **Configuration**: Schema-based validation with Zod
- **Testing**: Unit tests with Vitest and comprehensive mocking

## Security Features

- **Input Validation**: Zod schema validation for all inputs
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Error Sanitization**: No sensitive data in error messages
- **Configuration Security**: Environment-based configuration only

## Troubleshooting

### Common Issues

1. **WhatsApp QR Code Not Appearing**
   - Check if port 3000 is accessible
   - Ensure WhatsApp Web is not already logged in elsewhere
   - Check rate limiting (max 5 requests per minute)

2. **No Notifications**
   - Verify phone numbers in `.env`
   - Check if events match filtering criteria
   - Review logs for errors
   - Check circuit breaker status

3. **Scraping Failures**
   - Verify internet connection
   - Check if target URL is accessible
   - Review circuit breaker statistics
   - Check rate limiting

4. **High Error Rate**
   - Monitor circuit breaker status
   - Check system metrics
   - Review detailed health check
   - Verify configuration

### Logs

The application uses structured logging with Pino. Log levels:
- `debug`: Detailed debugging information
- `info`: Normal operation
- `warn`: Recoverable issues
- `error`: Errors requiring attention

### Monitoring

Use the monitoring endpoints to track application health:
- `/health/detailed` - Component health status
- `/metrics` - System and circuit breaker metrics

## License

ISC License 