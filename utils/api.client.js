/**
 * Simple API Client for Tests - Updated for Cookie-Based Authentication with CSRF Support
 */

import axios from 'axios';
import { CookieJar } from 'tough-cookie';

class ApiClient {
    constructor(baseURL, token = null) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': baseURL,
            'User-Agent': 'Test-Client/1.0'
        };
        
        // Create a cookie jar for manual cookie handling
        this.cookieJar = new CookieJar();
        this.baseURL = baseURL;
        this.csrfToken = null; // Store CSRF token for state-changing requests
        
        this.client = axios.create({
            baseURL,
            headers,
            timeout: 10000,
            withCredentials: true // Enable cookie support
        });

        // Add request interceptor to add cookies and CSRF token to requests
        this.client.interceptors.request.use((config) => {
            const cookies = this.cookieJar.getCookieStringSync(this.baseURL);
            if (cookies) {
                config.headers.Cookie = cookies;
            }
            
            // Add CSRF token for state-changing requests
            if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
                // Get CSRF token from cookie jar if not manually set
                const csrfFromCookie = this.getCsrfTokenFromCookies();
                if (csrfFromCookie || this.csrfToken) {
                    config.headers['X-CSRF-Token'] = this.csrfToken || csrfFromCookie;
                }
            }
            
            return config;
        });

        // Add response interceptor to save cookies from responses
        this.client.interceptors.response.use(
            (response) => {
                if (response.headers['set-cookie']) {
                    response.headers['set-cookie'].forEach(cookie => {
                        this.cookieJar.setCookieSync(cookie, this.baseURL);
                    });
                }
                return response;
            },
            (error) => {
                if (error.response && error.response.headers['set-cookie']) {
                    error.response.headers['set-cookie'].forEach(cookie => {
                        this.cookieJar.setCookieSync(cookie, this.baseURL);
                    });
                }
                return Promise.reject(error);
            }
        );
    }

    // Method to clear cookies for cookie-based authentication
    clearCookies() {
        this.cookieJar.removeAllCookiesSync();
        this.csrfToken = null;
        console.log('Cookies and CSRF token cleared from cookie jar');
    }
    
    /**
     * Get CSRF token from cookies
     * @returns {string|null} CSRF token or null
     */
    getCsrfTokenFromCookies() {
        const cookies = this.getCookiesAsObject();
        return cookies.csrfToken || null;
    }
    
    /**
     * Manually set CSRF token (for testing)
     * @param {string} token - CSRF token
     */
    setCsrfToken(token) {
        this.csrfToken = token;
    }
    
    /**
     * Fetch a fresh CSRF token from the server
     * @returns {Promise<string>} CSRF token
     */
    async fetchCsrfToken() {
        const response = await this.get('/api/v1/auth/csrf-token');
        if (response?.data?.csrfToken) {
            this.csrfToken = response.data.csrfToken;
            return this.csrfToken;
        }
        // Try to get from cookie if response didn't include it
        return this.getCsrfTokenFromCookies();
    }

    async get(url) {
        try {
            return await this.client.get(url);
        } catch (error) {
            return error.response;
        }
    }

    async post(url, data, config = {}) {
        try {
            return await this.client.post(url, data, config);
        } catch (error) {
            return error.response;
        }
    }

    async put(url, data) {
        try {
            return await this.client.put(url, data);
        } catch (error) {
            return error.response;
        }
    }

    async patch(url, data) {
        try {
            return await this.client.patch(url, data);
        } catch (error) {
            return error.response;
        }
    }

    async delete(url, config = {}) {
        try {
            return await this.client.delete(url, config);
        } catch (error) {
            return error.response;
        }
    }

    /**
     * Get current cookies as a string for use in WebSocket connections
     * @returns {string} - Cookie string for WebSocket headers
     */
    getCookiesForWebSocket() {
        return this.cookieJar.getCookieStringSync(this.baseURL) || '';
    }

    /**
     * Get current cookies object for debugging
     * @returns {Object} - All cookies as key-value pairs
     */
    getCookiesAsObject() {
        const cookies = {};
        const cookieString = this.cookieJar.getCookieStringSync(this.baseURL);
        if (cookieString) {
            cookieString.split(';').forEach(cookie => {
                const parts = cookie.trim().split('=');
                if (parts.length === 2) {
                    cookies[parts[0]] = parts[1];
                }
            });
        }
        return cookies;
    }

    /**
     * Encode file path to base64 for API requests
     * @param {string} filePath - The file path to encode
     * @returns {string} - Base64 encoded file path
     */
    encodeFilePath(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path parameter');
        }
        return Buffer.from(filePath, 'utf-8').toString('base64');
    }
}

export default ApiClient;
