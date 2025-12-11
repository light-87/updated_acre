/**
 * Get Token API - Phase 3
 *
 * Returns a valid access token for Acre API.
 * - Retrieves tokens from Netlify Blobs
 * - Checks if token is expired
 * - Refreshes token automatically if needed
 * - Protected by AUTH_SECRET
 */

const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  try {
    console.log('🔑 Get token request received');

    // Check authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authSecret = process.env.AUTH_SECRET;

    if (!authSecret) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Configuration Error',
          message: 'AUTH_SECRET not configured in environment variables'
        })
      };
    }

    // Validate AUTH_SECRET
    const expectedAuth = `Bearer ${authSecret}`;
    if (!authHeader || authHeader !== expectedAuth) {
      console.error('❌ Unauthorized request - invalid or missing AUTH_SECRET');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid or missing Authorization header. Expected: Bearer YOUR_AUTH_SECRET'
        })
      };
    }

    console.log('✅ Authentication successful');

    // Retrieve tokens from Netlify Blobs
    console.log('📦 Retrieving tokens from Netlify Blobs...');

    let tokenStorage;
    try {
      const store = getStore('acre-tokens');
      const tokenData = await store.get('tokens', { type: 'text' });

      if (!tokenData) {
        console.error('❌ No tokens found in storage');
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'No Tokens Found',
            message: 'You need to complete the OAuth flow first. Visit /auth-start to login.',
            action: 'Visit https://acre-test.netlify.app/auth-start to authenticate'
          })
        };
      }

      tokenStorage = JSON.parse(tokenData);
      console.log('✅ Tokens retrieved from storage');
    } catch (blobError) {
      console.error('❌ Error retrieving from Blobs:', blobError.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Storage Error',
          message: 'Failed to retrieve tokens from storage',
          details: blobError.message
        })
      };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(tokenStorage.expires_at);
    const isExpired = now >= expiresAt;

    // Add 5-minute buffer for safety
    const bufferMinutes = 5;
    const needsRefresh = (expiresAt - now) < (bufferMinutes * 60 * 1000);

    console.log('⏰ Token expiry check:', {
      expires_at: tokenStorage.expires_at,
      is_expired: isExpired,
      needs_refresh: needsRefresh,
      time_until_expiry_minutes: Math.floor((expiresAt - now) / 1000 / 60)
    });

    // If token needs refresh, refresh it
    if (needsRefresh || isExpired) {
      console.log('🔄 Token expired or expiring soon, refreshing...');

      try {
        const refreshResult = await refreshAccessToken(tokenStorage);

        // Update storage with new tokens
        const store = getStore('acre-tokens');
        await store.set('tokens', JSON.stringify(refreshResult.tokenStorage), {
          metadata: {
            created_at: refreshResult.tokenStorage.created_at,
            expires_at: refreshResult.tokenStorage.expires_at
          }
        });

        console.log('✅ Token refreshed and updated in storage');

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: refreshResult.tokenStorage.access_token,
            token_type: refreshResult.tokenStorage.token_type || 'Bearer',
            expires_in: refreshResult.tokenStorage.expires_in,
            expires_at: refreshResult.tokenStorage.expires_at,
            refreshed: true
          })
        };
      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError.message);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Token Refresh Failed',
            message: refreshError.message,
            action: 'You may need to re-authenticate. Visit /auth-start'
          })
        };
      }
    }

    // Token is still valid, return it
    console.log('✅ Token is valid, returning existing token');

    const secondsUntilExpiry = Math.floor((expiresAt - now) / 1000);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: tokenStorage.access_token,
        token_type: tokenStorage.token_type || 'Bearer',
        expires_in: secondsUntilExpiry,
        expires_at: tokenStorage.expires_at,
        refreshed: false
      })
    };

  } catch (error) {
    console.error('❌ Unexpected error in get-token:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: error.stack
      })
    };
  }
};

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(tokenStorage) {
  const clientId = process.env.ACRE_CLIENT_ID;
  const clientSecret = process.env.ACRE_CLIENT_SECRET;
  const apiKey = process.env.ACRE_API_KEY;

  if (!clientId || !clientSecret || !apiKey) {
    throw new Error('Missing required environment variables for token refresh');
  }

  const tokenUrl = 'https://oauth.acreplatforms.net/oauth2/token';
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenStorage.refresh_token,
    client_id: clientId,
    client_secret: clientSecret
  });

  console.log('📤 Sending refresh token request...');

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: tokenParams.toString()
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('❌ Token refresh failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      body: errorText
    });
    throw new Error(`Token refresh failed: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  console.log('✅ New tokens received:', {
    has_access_token: !!tokenData.access_token,
    has_refresh_token: !!tokenData.refresh_token,
    expires_in: tokenData.expires_in
  });

  // Calculate new expiration
  const expiresIn = tokenData.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const createdAt = new Date().toISOString();

  // Prepare new token storage
  const newTokenStorage = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokenStorage.refresh_token, // Keep old refresh token if not provided
    token_type: tokenData.token_type || 'Bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    created_at: createdAt,
    scope: tokenData.scope || tokenStorage.scope
  };

  return { tokenStorage: newTokenStorage };
}
