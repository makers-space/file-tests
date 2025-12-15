/**
 * Simple API Client for Tests - Updated for Cookie-Based Authentication
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
        
        this.client = axios.create({
            baseURL,
            headers,
            timeout: 10000,
            withCredentials: true // Enable cookie support
        });

        // Add request interceptor to add cookies to requests
        this.client.interceptors.request.use((config) => {
            const cookies = this.cookieJar.getCookieStringSync(this.baseURL);
            if (cookies) {
                config.headers.Cookie = cookies;
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
        console.log('Cookies cleared from cookie jar');
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
