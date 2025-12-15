# App Base Test Suite

> **Integration Testing Infrastructure with Vitest**

Comprehensive integration test suite using **Vitest** for fast, parallel test execution. Tests the complete backend API with real MongoDB and Redis instances.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **MongoDB** running and accessible
- **Redis** running (optional but recommended)
- **Server configured** with `.env` file

### Installation

```bash
cd tests
npm install
```

### Running Tests

```bash
# All tests (runs in parallel)
npm test

# Watch mode (reruns tests on file changes)
npm run test:watch

# Tests with UI (browser-based test viewer)
npm run test:ui

# Run specific test files
npm run test:app          # Health endpoints, logs
npm run test:auth         # Authentication & signup
npm run test:user         # User management
npm run test:file         # File operations
npm run test:cache        # Cache management

# Coverage report
npm run test:coverage
```

## 🧪 What Gets Tested

This test suite provides comprehensive integration testing for:

### Authentication (`server/auth.test.js`)
- User signup and login
- JWT token generation and refresh
- Two-factor authentication (2FA)
- Password reset flow
- Email verification
- Role-based access control
- Device tracking and management

### User Management (`server/user.test.js`)
- User CRUD operations
- Profile updates
- Password changes
- User statistics
- Role management
- Public user lists

### File System (`server/file.test.js`)
- File and directory creation
- File upload and download
- Version control
- Auto-save functionality
- File compression
- Collaborative editing
- Bulk operations
- File sharing and permissions

### Cache Management (`server/cache.test.js`)
- Redis cache operations
- Cache invalidation
- Auto-save persistence
- Cleanup services
- Cache statistics

### Application Health (`server/app.test.js`)
- Health check endpoints
- Logging system
- Email service
- System statistics

## 🛠️ Test Utilities

### TestStartup Class

The `TestStartup` utility class manages the complete test environment:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import TestStartup from '../utils/test.startup.js';

describe('My Test Suite', () => {
    let testStartup;
    let client;

    beforeAll(async () => {
        testStartup = new TestStartup();
        await testStartup.initialize();
        client = testStartup.getClient();
    }, 60000);

    afterAll(async () => {
        await testStartup.cleanup();
    }, 30000);

    it('should authenticate as admin', async () => {
        client.setToken(testStartup.getTokenForUser('admin'));
        const response = await client.get('/api/v1/users');
        expect(response.status).toBe(200);
    });
});
```

### Pre-configured Test Users

The following users are automatically created and available in all tests:

| Username | Role | Token Method |
|----------|------|--------------|
| owner | OWNER | `getTokenForUser('owner')` |
| admin | ADMIN | `getTokenForUser('admin')` |
| superCreator | SUPER_CREATOR | `getTokenForUser('superCreator')` |
| creator | CREATOR | `getTokenForUser('creator')` |
| user | USER | `getTokenForUser('user')` |

### Key Methods

```javascript
// Get pre-configured API client
const client = testStartup.getClient();

// Switch user authentication
client.setToken(testStartup.getTokenForUser('admin'));
client.setToken(null); // Clear token

// Create temporary test users
const testUser = await testStartup.createMutableUser({
    role: 'USER',
    firstName: 'Test',
    lastName: 'User',
    prefix: 'temp'
});
await testStartup.deleteMutableUser(testUser.id);

// Database cleanup
await testStartup.cleanDatabase();  // Drop all collections
await testStartup.cleanCollections(['users', 'files']);  // Specific collections
```

## 🔧 Configuration

### Test Environment Setup

**IMPORTANT**: The test suite requires a `.env.test` file to run properly.

1. **Copy the example configuration**:
   ```bash
   cd tests
   cp .env.test.example .env.test
   ```

2. **Configure your test environment**:
   - Set your MongoDB connection (use a separate test database!)
   - Configure JWT secrets (can match development or use new ones)
   - Adjust rate limits (higher limits recommended for tests)
   - Set `EMAIL_ENABLED=false` if you don't have SMTP configured

### Test Environment Characteristics

The test suite uses separate configuration to avoid conflicts with the development server:

- **Dynamic Ports**: Tests use ports 8380-8389 (one per test suite)
- **Isolated Databases**: Each test suite creates its own database (e.g., `test-auth-1234567890`)
- **Real Services**: Tests run against real MongoDB and Redis instances
- **Higher Rate Limits**: Tests use 10x higher rate limits to avoid failures
- **Reduced Logging**: Default log level is `error` to reduce noise

### Critical Environment Variables

**Required:**
- `MONGODB_URI` - Your MongoDB connection (use separate test database!)
- `ACCESS_TOKEN_SECRET` - JWT access token secret
- `REFRESH_TOKEN_SECRET` - JWT refresh token secret
- `ALLOWED_ORIGINS` - CORS origins (includes test ports 8380-8389)

**Recommended:**
- `CACHE_ENABLED=true` - Enable Redis for full test coverage
- `LOG_LEVEL=error` - Reduce test output noise
- `EMAIL_ENABLED=false` - Disable email if not configured

**Optional:**
- Email SMTP settings (only if `EMAIL_ENABLED=true`)

### Database Cleanup

The test suite supports automatic database cleanup through the `DB_CLEANUP` environment variable:

- **`DB_CLEANUP=true`**: Automatically drops all collections after each test suite completes
- **`DB_CLEANUP=false`**: Leaves database state intact (default behavior)

**Additional cleanup methods:**
```javascript
// Full database cleanup (drops all collections)
await testStartup.cleanDatabase();

// Clean specific collections only
await testStartup.cleanCollections(['users', 'files']);

// Reset database (clear documents but keep structure)
await testStartup.resetDatabase();
```

## 📝 Writing New Tests

### Basic Test Structure

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import TestStartup from '../utils/test.startup.js';

describe('My Feature Tests', () => {
    let testStartup;
    let client;

    beforeAll(async () => {
        testStartup = new TestStartup();
        await testStartup.initialize();
        client = testStartup.getClient();
    }, 60000);

    afterAll(async () => {
        await testStartup.cleanup();
    }, 30000);

    it('should test a feature', async () => {
        // Authenticate as admin
        client.setToken(testStartup.getTokenForUser('admin'));
        
        // Make API request
        const response = await client.get('/api/v1/endpoint');
        
        // Assert response
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
    });
});
```

### Testing Different User Roles

```javascript
it('should test role-based access', async () => {
    const roles = ['user', 'creator', 'admin'];
    
    for (const role of roles) {
        client.setToken(testStartup.getTokenForUser(role));
        const response = await client.get('/api/v1/files');
        expect(response.status).toBe(200);
    }
});
```

### Testing File Operations

```javascript
it('should upload and retrieve a file', async () => {
    client.setToken(testStartup.getTokenForUser('creator'));
    
    // Create a file
    const createResponse = await client.post('/api/v1/files', {
        path: '/test.md',
        content: '# Test File'
    });
    expect(createResponse.status).toBe(201);
    
    // Retrieve the file
    const getResponse = await client.get('/api/v1/files/test.md/content');
    expect(getResponse.data.content).toBe('# Test File');
});
```

## 🎯 Test Coverage

### Current Test Coverage

The test suite includes comprehensive tests for:

- ✅ **Authentication** - Login, signup, 2FA, password reset
- ✅ **Authorization** - Role-based access control
- ✅ **User Management** - CRUD operations, profiles, stats
- ✅ **File System** - Files, directories, versions, uploads
- ✅ **Caching** - Redis operations, invalidation, cleanup
- ✅ **Health Checks** - Server, database, Redis status
- ✅ **Logging** - Request logging, log retrieval

### Running Coverage Reports

```bash
npm run test:coverage
```

This generates a detailed coverage report showing:
- Statement coverage
- Branch coverage
- Function coverage
- Line coverage

## 🔗 Integration with Server

The test suite directly tests the server API by:

1. **Starting a real server instance** on port 8380
2. **Using actual MongoDB** for data persistence
3. **Using actual Redis** for caching (if enabled)
4. **Making HTTP requests** via Axios to API endpoints
5. **Testing WebSocket connections** for real-time features

This approach provides true integration testing rather than mocked unit tests.

##  Troubleshooting

### Tests Failing to Connect

```bash
# Ensure MongoDB is running
mongosh mongodb://localhost:27017/app-base-test-db

# Ensure Redis is running (if cache enabled)
redis-cli ping

# Check .env is configured correctly
cat .env
```

### Port Already in Use

```bash
# Check if port 8380 is in use
lsof -i :8380

# Kill the process using the port
kill -9 <PID>
```

### Database State Issues

```bash
# Enable auto-cleanup in tests
DB_CLEANUP=true npm test

# Or manually clean database
# In test file: await testStartup.cleanDatabase();
```

### Timeout Errors

```bash
# Increase timeout in test file
beforeAll(async () => {
    // ... setup
}, 120000);  // Increase from 60000 to 120000
```

## 🤝 Contributing

When adding new tests:

1. **Add integration tests** in the appropriate test file
2. **Test all user roles** to verify permissions
3. **Test error cases** including validation and authorization
4. **Run full test suite** before committing: `npm test`
5. **Check coverage**: `npm run test:coverage`

## 📄 License

See [LICENSE.md](./LICENSE.md) for license information.

---

**Ensuring quality through comprehensive integration testing!**
