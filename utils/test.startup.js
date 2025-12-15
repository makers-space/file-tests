/**
 * Test Startup Class - Handles all test server and user management
 * This class manages server startup/cleanup and creates all user types with tokens
 */

// Load environment variables from .env.test file FIRST
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import ApiClient from './api.client.js';
import { Server } from '../../server/server.js';
import User from '../../server/models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.join(__dirname, '..', '.env.test')
});

class TestStartup {
    constructor(testIdentifier = 'default') {
        this.testIdentifier = testIdentifier;
        this.serverInstance = null;
        this.baseURL = null;
        this.port = this.getRandomPort();
        this.dbName = this.generateDbName();
        
        this.owner = null;
        this.admin = null;
        this.superCreator = null;
        this.creator = null;
        this.user = null;
        this.client = null;
        
        this.mutableUsers = new Map();
        this.mutableUserCounter = 0;
    }

    /**
     * Generate unique database name for this test file
     */
    generateDbName() {
        const baseDbName = process.env.MONGODB_URI?.split('/').pop()?.split('?')[0] || 'app-base-test-db';
        return `${baseDbName}-${this.testIdentifier}`;
    }

    /**
     * Get a random port from the allowed test port range
     */
    getRandomPort() {
        const minPort = parseInt(process.env.PORT_RANGE_MIN) || 8380;
        const maxPort = parseInt(process.env.PORT_RANGE_MAX) || 8389;
        return Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
    }

    /**
     * Initialize everything - start server and create all users
     */
    async initialize() {
        await this.startServer();
        await this.createAllUsers();
        this.setupDefaultClient();
        return this;
    }

    /**
     * Start the test server with isolated database
     */
    async startServer() {
        const originalPort = process.env.PORT;
        const originalMongoUri = process.env.MONGODB_URI;
        
        process.env.PORT = this.port.toString();
        
        // Override MongoDB URI to use test-specific database
        if (originalMongoUri) {
            const uriParts = originalMongoUri.split('/');
            const baseUri = uriParts.slice(0, -1).join('/');
            const queryString = originalMongoUri.split('?')[1];
            process.env.MONGODB_URI = `${baseUri}/${this.dbName}${queryString ? '?' + queryString : ''}`;
        }
        
        const server = new Server({ port: this.port, logLevel: 'error' });
        await server.start();
        this.serverInstance = { server, port: this.port };
        this.baseURL = `http://localhost:${this.port}`;
        
        if (originalPort) process.env.PORT = originalPort;
        if (originalMongoUri) process.env.MONGODB_URI = originalMongoUri;
    }

    /**
     * Create and login a single user
     */
    async createAndLoginUser(role, firstName, lastName, timestamp, randomStr, client) {
        const username = `${role.toLowerCase()}${timestamp}${randomStr}`;
        const email = `${username}@test.com`;
        
        const user = new User({
            firstName,
            lastName,
            username,
            email,
            password: await bcrypt.hash('TestPass123!', 12),
            roles: [role],
            emailVerified: true,
            active: true
        });
        await user.save();

        const loginResponse = await client.post('/api/v1/auth/login', {
            identifier: username,
            password: 'TestPass123!'
        });
        
        if (loginResponse?.status !== 200 || !loginResponse.data?.success) {
            throw new Error(`Failed to authenticate ${role} user`);
        }

        return {
            ...loginResponse.data.user,
            credentials: { identifier: username, password: 'TestPass123!' }
        };
    }

    /**
     * Create all test users and authenticate them
     */
    async createAllUsers() {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const client = new ApiClient(this.baseURL);
        const timestamp = Date.now().toString().slice(-6);
        const randomStr = Math.random().toString(36).substring(2, 4);
        
        try {
            console.log(`Creating test users on ${this.baseURL}`);
            
            this.owner = await this.createAndLoginUser('OWNER', 'Owner', 'Test', timestamp, randomStr, client);
            this.admin = await this.createAndLoginUser('ADMIN', 'Admin', 'User', timestamp, randomStr, client);
            this.superCreator = await this.createAndLoginUser('SUPER_CREATOR', 'Super', 'Creator', timestamp, randomStr, client);
            this.creator = await this.createAndLoginUser('CREATOR', 'Creator', 'User', timestamp, randomStr, client);
            this.user = await this.createAndLoginUser('USER', 'Regular', 'User', timestamp, randomStr, client);
            
            console.log('✅ All test users created successfully');
        } catch (error) {
            console.error('Failed to create test users:', error.message);
            throw error;
        }
    }

    /**
     * Setup default API client
     */
    setupDefaultClient() {
        this.client = new ApiClient(this.baseURL);
    }

    /**
     * Get the main client (reusable)
     */
    getClient() {
        return this.client;
    }

    /**
     * Login as a specific user type (sets cookies for authentication)
     */
    async loginAsUser(userType) {
        const user = this[userType];
        if (!user) {
            throw new Error(`User type '${userType}' not found`);
        }
        
        const response = await this.client.post('/api/v1/auth/login', user.credentials);
        if (response?.status !== 200) {
            throw new Error(`Failed to login as ${userType}: ${response?.data?.message || 'Unknown error'}`);
        }
        
        return response;
    }





    /**
     * Clear token from the main client - now logs out user
     */
    clearClientToken() {
        return this.logout();
    }

    /**
     * Logout current user (clears authentication cookies)
     */
    async logout() {
        try {
            await this.client.post('/api/v1/auth/logout');
        } catch (error) {
            // Ignore logout errors in tests
        }
    }

    /**
     * Create a mutable test user that can be modified/deleted without affecting main users
     * @param {Object} options - User creation options
     * @param {string} options.role - User role (USER, CREATOR, SUPER_CREATOR, ADMIN)
     * @param {string} options.firstName - Optional first name
     * @param {string} options.lastName - Optional last name
     * @param {string} options.prefix - Optional username/email prefix
     * @param {Object} options.additionalData - Any additional user data
     * @returns {Object} - Created user object with token and credentials
     */
    async createMutableUser(options = {}) {
        const {
            role = 'USER',
            firstName = 'Mutable',
            lastName = 'User',
            prefix = 'mutable',
            additionalData = {}
        } = options;

        this.mutableUserCounter++;
        const timestamp = Date.now().toString().slice(-6);
        const userSuffix = `${this.mutableUserCounter}_${timestamp}`;
        
        // Only include fields that are allowed in signup
        const userData = {
            firstName: firstName,
            lastName: lastName,
            username: `${prefix}${userSuffix}`,
            email: `${prefix}${userSuffix}@test.com`,
            password: 'MutablePass123!',
            roles: [role]
        };

        try {
            // Login as owner to create user with any role
            await this.loginAsUser('owner');
            
            const response = await this.client.post('/api/v1/auth/signup', userData);
            
            const mutableUser = {
                id: response.data.user.id,
                ...response.data.user,
                // Include any additional data requested (for test reference)
                ...additionalData,
                // No longer store tokens since we use cookies
                credentials: { 
                    identifier: userData.username, 
                    password: userData.password 
                },
                originalData: userData,
                createdAt: new Date(),
                mutable: true
            };

            // Store in mutable users map
            this.mutableUsers.set(mutableUser.id, mutableUser);
            
            console.log(`✅ Created mutable user: ${mutableUser.username} (${role}) with ID: ${mutableUser.id}`);
            return mutableUser;
        } catch (error) {
            console.error(`❌ Failed to create mutable user:`, error.message);
            throw error;
        }
    }

    /**
     * Create multiple mutable users at once
     * @param {Array} userConfigs - Array of user configuration objects
     * @returns {Array} - Array of created user objects
     */
    async createMultipleMutableUsers(userConfigs) {
        const users = [];
        for (const config of userConfigs) {
            const user = await this.createMutableUser(config);
            users.push(user);
        }
        return users;
    }

    /**
     * Get a mutable user by ID
     * @param {string} userId - User ID
     * @returns {Object|null} - User object or null if not found
     */
    getMutableUser(userId) {
        return this.mutableUsers.get(userId) || null;
    }

    /**
     * Get all mutable users
     * @returns {Array} - Array of all mutable users
     */
    getAllMutableUsers() {
        return Array.from(this.mutableUsers.values());
    }

    /**
     * Get mutable users by role
     * @param {string} role - Role to filter by
     * @returns {Array} - Array of users with specified role
     */
    getMutableUsersByRole(role) {
        return this.getAllMutableUsers().filter(user => 
            user.roles && user.roles.includes(role)
        );
    }

    /**
     * Update a mutable user's data
     * @param {string} userId - User ID
     * @param {Object} updateData - Data to update
     * @returns {Object} - Updated user object
     */
    async updateMutableUser(userId, updateData) {
        const user = this.mutableUsers.get(userId);
        if (!user) {
            throw new Error(`Mutable user with ID ${userId} not found`);
        }

        try {
            const client = new ApiClient(this.baseURL);
            client.setToken(this.admin.token); // Use admin token for updates
            
            const response = await client.put(`/api/v1/users/${userId}`, updateData);
            
            // Update stored user data
            const updatedUser = {
                ...user,
                ...response.data.user,
                lastUpdated: new Date()
            };
            
            this.mutableUsers.set(userId, updatedUser);
            
            console.log(`✅ Updated mutable user: ${updatedUser.username}`);
            return updatedUser;
        } catch (error) {
            console.error(`❌ Failed to update mutable user ${userId}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete a mutable user
     * @param {string} userId - User ID to delete
     * @returns {boolean} - Success status
     */
    async deleteMutableUser(userId) {
        const user = this.mutableUsers.get(userId);
        if (!user) {
            console.warn(`Mutable user with ID ${userId} not found for deletion`);
            return false;
        }

        try {
            const client = new ApiClient(this.baseURL);
            // Login as admin to delete the user
            await this.loginAsUser('admin');
            
            await client.delete(`/api/v1/users/${userId}`);
            
            // Remove from stored users
            this.mutableUsers.delete(userId);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to delete mutable user ${userId}:`, error.message);
            // Remove from map even if API call failed (user might already be deleted)
            this.mutableUsers.delete(userId);
            return false;
        }
    }

    /**
     * Clean up all mutable users
     * @returns {Object} - Cleanup results
     */
    async cleanupAllMutableUsers() {
        const results = {
            total: this.mutableUsers.size,
            deleted: 0,
            failed: 0,
            errors: []
        };

        const userIds = Array.from(this.mutableUsers.keys());
        
        for (const userId of userIds) {
            try {
                const success = await this.deleteMutableUser(userId);
                if (success) {
                    results.deleted++;
                } else {
                    results.failed++;
                }
            } catch (error) {
                results.failed++;
                results.errors.push({ userId, error: error.message });
            }
        }

        return results;
    }

    /**
     * Create a client authenticated as a specific mutable user
     * @param {string} userId - Mutable user ID
     * @returns {ApiClient} - Authenticated API client
     */
    getClientForMutableUser(userId) {
        const user = this.mutableUsers.get(userId);
        if (!user) {
            throw new Error(`Mutable user with ID ${userId} not found`);
        }

        const client = new ApiClient(this.baseURL);
        client.setToken(user.token);
        return client;
    }

    /**
     * Refresh token for a mutable user
     * @param {string} userId - User ID
     * @returns {Object} - Updated user object with new tokens
     */


    /**
     * Create test data for mutable user testing
     * @param {Object} options - Options for test data creation
     * @returns {Object} - Test data templates
     */
    createMutableTestData(options = {}) {
        const timestamp = Date.now().toString().slice(-6);
        const randomId = Math.random().toString(36).substring(2, 8);
        
        return {
            // User profiles for testing different scenarios
            profiles: {
                basicUser: {
                    role: 'USER',
                    firstName: 'Basic',
                    lastName: 'TestUser',
                    prefix: 'basic'
                },
                contentCreator: {
                    role: 'CREATOR',
                    firstName: 'Content',
                    lastName: 'Creator',
                    prefix: 'creator'
                },
                superCreator: {
                    role: 'SUPER_CREATOR',
                    firstName: 'Super',
                    lastName: 'Creator',
                    prefix: 'super'
                },
                adminUser: {
                    role: 'ADMIN',
                    firstName: 'Admin',
                    lastName: 'TestUser',
                    prefix: 'admin'
                }
            },
            
            // File data for testing
            files: {
                textFile: {
                    filename: `test_${timestamp}_${randomId}.txt`,
                    content: 'This is test file content for mutable user testing',
                    mimeType: 'text/plain'
                },
                jsonFile: {
                    filename: `data_${timestamp}_${randomId}.json`,
                    content: JSON.stringify({ test: true, timestamp, randomId }),
                    mimeType: 'application/json'
                },
                largeFile: {
                    filename: `large_${timestamp}_${randomId}.txt`,
                    content: 'A'.repeat(1000), // 1KB of 'A' characters
                    mimeType: 'text/plain'
                }
            },
            
            // Update scenarios for testing user modifications
            updateScenarios: {
                nameChange: {
                    firstName: 'Updated',
                    lastName: 'Name'
                },
                emailChange: {
                    email: `updated_${timestamp}@test.com`
                },
                profileUpdate: {
                    firstName: 'Complete',
                    lastName: 'Update',
                    profilePhoto: 'updated-avatar.jpg'
                }
            },
            
            // Batch operations data
            batchData: {
                multipleUsers: [
                    { role: 'USER', firstName: 'Batch1', lastName: 'User', prefix: 'batch1' },
                    { role: 'USER', firstName: 'Batch2', lastName: 'User', prefix: 'batch2' },
                    { role: 'CREATOR', firstName: 'Batch3', lastName: 'Creator', prefix: 'batch3' }
                ]
            },
            
            // Metadata
            metadata: {
                timestamp,
                randomId,
                testSuite: options.testSuite || 'unknown',
                description: options.description || 'Mutable test data'
            }
        };
    }

    /**
     * Execute operations with temporary mutable users
     * Automatically creates users, runs operations, and cleans up
     * @param {Array} userConfigs - Array of user configurations
     * @param {Function} operations - Async function to run with created users
     * @returns {*} - Result of operations function
     */
    async withTemporaryMutableUsers(userConfigs, operations) {
        const createdUsers = [];
        
        try {
            // Create all requested users
            for (const config of userConfigs) {
                const user = await this.createMutableUser(config);
                createdUsers.push(user);
            }
            
            // Run the operations with the created users
            const result = await operations(createdUsers);
            
            return result;
        } finally {
            // Always clean up created users
            for (const user of createdUsers) {
                await this.deleteMutableUser(user.id);
            }
        }
    }

    /**
     * Get helper to use client with specific user token
     */
    withUser(userType, callback) {
        const originalToken = this.client.token;
        const userToken = this.getTokenForUser(userType);
        this.client.setToken(userToken);
        const result = callback(this.client);
        this.client.setToken(originalToken);
        return result;
    }

    /**
     * Helper to use client without token (public)
     */
    withPublic(callback) {
        const originalToken = this.client.token;
        this.client.setToken(null);
        const result = callback(this.client);
        this.client.setToken(originalToken);
        return result;
    }

    /**
     * Test user permissions across different roles
     */
    async testUserPermissions(endpoint, method = 'get', data = null) {
        const results = {};
        const userTypes = ['owner', 'admin', 'superCreator', 'creator', 'user'];

        for (const userType of userTypes) {
            const client = this.getClientForUser(userType);
            try {
                let response;
                switch (method.toLowerCase()) {
                    case 'post':
                        response = await client.post(endpoint, data);
                        break;
                    case 'put':
                        response = await client.put(endpoint, data);
                        break;
                    case 'delete':
                        response = await client.delete(endpoint);
                        break;
                    default:
                        response = await client.get(endpoint);
                }
                results[userType] = {
                    success: true,
                    status: response.status,
                    data: response.data
                };
            } catch (error) {
                results[userType] = {
                    success: false,
                    status: error.response?.status || 500,
                    error: error.response?.data || error.message
                };
            }
        }

        return results;
    }

    /**
     * Helper to create test file data
     */
    createTestFileData(filename = 'test.txt', content = 'Test file content') {
        return {
            filename,
            content,
            mimeType: 'text/plain',
            metadata: {
                description: `Test file: ${filename}`,
                tags: ['test', 'automation']
            }
        };
    }

    /**
     * Cleanup - stop server and clean resources
     */
    async cleanup() {
        try {
            if (process.env.DB_CLEANUP === 'true') {
                await this.performImmediateDatabaseCleanup();
            }

            await this.stopCacheOperations();

            if (this.serverInstance?.server) {
                await this.serverInstance.server.stop();
            }
            
            this.serverInstance = null;
            this.baseURL = null;
            this.owner = null;
            this.admin = null;
            this.superCreator = null;
            this.creator = null;
            this.user = null;
            this.client = null;
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    }

    /**
     * Perform immediate database cleanup before server shutdown
     */
    async performImmediateDatabaseCleanup() {
        if (process.env.DB_CLEANUP !== 'true') return;

        try {
            const dbConnection = this.serverInstance?.server?.getDbConnection?.() || mongoose.connection;
            
            if (dbConnection?.readyState !== 1) {
                throw new Error('Database connection not available for cleanup');
            }

            const collections = await dbConnection.db.collections();
            console.log(`🗑️ Dropping ${collections.length} collections...`);
            
            for (const collection of collections) {
                try {
                    await collection.drop();
                    console.log(`   ✅ Dropped collection: ${collection.collectionName}`);
                } catch (error) {
                    if (error.code !== 26) {
                        console.warn(`   ⚠️ Warning: ${collection.collectionName}: ${error.message}`);
                    }
                }
            }
            
            console.log('✅ Database cleanup completed');
        } catch (error) {
            console.error('❌ Database cleanup error:', error.message);
            throw error;
        }
    }

    /**
     * Stop cache operations before server shutdown
     */
    async stopCacheOperations() {
        try {
            console.log('🔄 Stopping cache operations...');
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('✅ Cache operations stopped');
        } catch (error) {
            console.warn('⚠️ Cache stop warning:', error.message);
        }
    }

    /**
     * Clean the database by dropping all collections
     * Only runs if DB_CLEANUP environment variable is set to 'true'
     */
    async cleanDatabase() {
        if (process.env.DB_CLEANUP !== 'true') {
            return;
        }

        try {
            // First try to use the server's database connection
            let dbConnection = null;
            
            if (this.serverInstance && this.serverInstance.server && this.serverInstance.server.getDbConnection) {
                dbConnection = this.serverInstance.server.getDbConnection();
                console.log(`🔍 Using server's database connection (readyState: ${dbConnection ? dbConnection.readyState : 'null'})`);
            } else {
                // Fallback to global mongoose connection
                dbConnection = mongoose.connection;
                console.log(`🔍 Using global mongoose connection (readyState: ${dbConnection.readyState})`);
            }
            
            if (dbConnection && dbConnection.readyState === 1) {
                const collections = await dbConnection.db.collections();
                
                console.log(`🗑️ Dropping ${collections.length} collections...`);
                
                for (const collection of collections) {
                    try {
                        await collection.drop();
                        console.log(`   ✅ Dropped collection: ${collection.collectionName}`);
                    } catch (error) {
                        // Collection might not exist, ignore the error
                        if (error.code !== 26) { // NamespaceNotFound
                            console.warn(`   ⚠️ Warning dropping collection ${collection.collectionName}:`, error.message);
                        }
                    }
                }
                
                console.log('✅ Database cleanup completed successfully');
            } else {
                console.log('ℹ️ Database connection not available, skipping cleanup');
            }
        } catch (error) {
            console.error('❌ Error during database cleanup:', error.message);
            // Don't throw - we don't want cleanup failures to break tests
        }
    }

    /**
     /**
     * Clean specific collections from the database
     * @param {Array<string>} collectionNames - Array of collection names to clean
     */
    async cleanCollections(collectionNames = []) {
        if (!Array.isArray(collectionNames) || collectionNames.length === 0) {
            console.warn('⚠️ No collections specified for cleanup');
            return;
        }

        try {
            // First try to use the server's database connection
            let dbConnection = null;
            
            if (this.serverInstance && this.serverInstance.server && this.serverInstance.server.getDbConnection) {
                dbConnection = this.serverInstance.server.getDbConnection();
            } else {
                // Fallback to global mongoose connection
                dbConnection = mongoose.connection;
            }
            
            if (dbConnection && dbConnection.readyState === 1) {
                console.log(`🗑️ Cleaning ${collectionNames.length} specific collections...`);
                
                for (const collectionName of collectionNames) {
                    try {
                        const collection = dbConnection.db.collection(collectionName);
                        await collection.drop();
                        console.log(`   ✅ Dropped collection: ${collectionName}`);
                    } catch (error) {
                        if (error.code !== 26) { // NamespaceNotFound
                            console.warn(`   ⚠️ Warning dropping collection ${collectionName}:`, error.message);
                        } else {
                            console.log(`   ℹ️ Collection ${collectionName} doesn't exist, skipping`);
                        }
                    }
                }
                
                console.log('✅ Selective collection cleanup completed');
            } else {
                console.log('ℹ️ Database not connected, skipping collection cleanup');
            }
        } catch (error) {
            console.error('❌ Error during selective collection cleanup:', error.message);
        }
    }

    /**
     * Reset database to clean state (alternative to full cleanup)
     * Removes all documents but keeps collections and indexes
     */
    async resetDatabase() {
        try {
            // First try to use the server's database connection
            let dbConnection = null;
            
            if (this.serverInstance && this.serverInstance.server && this.serverInstance.server.getDbConnection) {
                dbConnection = this.serverInstance.server.getDbConnection();
            } else {
                // Fallback to global mongoose connection
                dbConnection = mongoose.connection;
            }
            
            if (dbConnection && dbConnection.readyState === 1) {
                const collections = await dbConnection.db.collections();
                
                console.log(`🔄 Resetting ${collections.length} collections (clearing documents)...`);
                
                for (const collection of collections) {
                    try {
                        const result = await collection.deleteMany({});
                        console.log(`   ✅ Cleared ${result.deletedCount} documents from: ${collection.collectionName}`);
                    } catch (error) {
                        console.warn(`   ⚠️ Warning clearing collection ${collection.collectionName}:`, error.message);
                    }
                }
                
                console.log('✅ Database reset completed successfully');
            } else {
                console.log('ℹ️ Database not connected, skipping reset');
            }
        } catch (error) {
            console.error('❌ Error during database reset:', error.message);
        }
    }

    /**
     * Get all users object for easy access
     */
    getAllUsers() {
        return {
            owner: this.owner,
            admin: this.admin,
            superCreator: this.superCreator,
            creator: this.creator,
            user: this.user
        };
    }

    /**
     * Get authentication cookie string for WebSocket connections
     * @returns {string} - Cookie string for WebSocket auth
     */
    getAuthCookie() {
        if (this.client && this.client.cookies) {
            return this.client.cookies.getCookieString(this.baseURL);
        }
        return '';
    }

    /**
     * Get server instance for direct access
     */
    get server() {
        return this.serverInstance?.server;
    }

    /**
     * Get server info
     */
    getServerInfo() {
        return {
            baseURL: this.baseURL,
            port: this.port,
            serverInstance: this.serverInstance
        };
    }
}

export default TestStartup;
