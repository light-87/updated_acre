/**
 * OAuth Flow Step 2: Handle Callback & Store Tokens
 *
 * This function:
 * 1. Validates the state parameter (CSRF protection)
 * 2. Exchanges the authorization code for access + refresh tokens
 * 3. Stores tokens securely in Netlify Blobs
 * 4. Shows success page
 */

const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  try {
    console.log('🔄 OAuth callback received');

    // Extract query parameters
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    const error = event.queryStringParameters?.error;
    const errorDescription = event.queryStringParameters?.error_description;

    // Check for OAuth errors from Acre
    if (error) {
      console.error('❌ OAuth error from Acre:', error, errorDescription);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Authentication Failed</h1>
              <p><strong>Error:</strong> ${error}</p>
              <p><strong>Description:</strong> ${errorDescription || 'No details provided'}</p>
              <p><a href="/auth-start">Try again</a></p>
            </body>
          </html>
        `
      };
    }

    // Validate authorization code exists
    if (!code) {
      console.error('❌ Missing authorization code');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Invalid Request</h1>
              <p><strong>Missing authorization code.</strong></p>
              <p>The OAuth callback did not receive a valid authorization code.</p>
              <p><a href="/auth-start">Start over</a></p>
            </body>
          </html>
        `
      };
    }

    // Validate state parameter (CSRF protection)
    const cookies = event.headers.cookie || '';
    const stateCookie = cookies.split(';')
      .find(c => c.trim().startsWith('oauth_state='))
      ?.split('=')[1];

    if (!stateCookie || stateCookie !== state) {
      console.error('❌ State mismatch', {
        expected: stateCookie,
        received: state
      });
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Security Error</h1>
              <p><strong>State parameter mismatch.</strong></p>
              <p>This could be a CSRF attack or an expired session.</p>
              <p><a href="/auth-start">Start over</a></p>
            </body>
          </html>
        `
      };
    }

    console.log('✅ State validation passed');

    // Get environment variables
    const clientId = process.env.ACRE_CLIENT_ID;
    const clientSecret = process.env.ACRE_CLIENT_SECRET;
    const apiKey = process.env.ACRE_API_KEY;
    const redirectUri = process.env.NETLIFY_URL
      ? `${process.env.NETLIFY_URL}/.netlify/functions/auth-callback`
      : `https://acre-test.netlify.app/.netlify/functions/auth-callback`;

    // Validate environment variables
    if (!clientId || !clientSecret || !apiKey) {
      console.error('❌ Missing required environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Configuration Error</h1>
              <p><strong>Missing required environment variables.</strong></p>
              <p>Please ensure these are set in Netlify:</p>
              <ul>
                <li>ACRE_CLIENT_ID</li>
                <li>ACRE_CLIENT_SECRET</li>
                <li>ACRE_API_KEY</li>
              </ul>
            </body>
          </html>
        `
      };
    }

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging authorization code for tokens...');

    const tokenUrl = 'https://oauth.acreplatforms.net/oauth2/token';
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });

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
      console.error('❌ Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText
      });

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Token Exchange Failed</h1>
              <p><strong>Failed to exchange authorization code for tokens.</strong></p>
              <p><strong>Status:</strong> ${tokenResponse.status} ${tokenResponse.statusText}</p>
              <p><strong>Details:</strong> ${errorText}</p>
              <p><a href="/auth-start">Try again</a></p>
            </body>
          </html>
        `
      };
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Tokens received successfully:', {
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      has_access_token: !!tokenData.access_token,
      has_refresh_token: !!tokenData.refresh_token
    });

    // Calculate expiration time
    const expiresIn = tokenData.expires_in || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const createdAt = new Date().toISOString();

    // Prepare token data for storage
    const tokenStorage = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: expiresIn,
      expires_at: expiresAt,
      created_at: createdAt,
      scope: tokenData.scope || event.queryStringParameters?.scope
    };

    // Store tokens in Netlify Blobs
    console.log('💾 Storing tokens in Netlify Blobs...');

    const store = getStore('acre-tokens');
    await store.set('tokens', JSON.stringify(tokenStorage), {
      metadata: {
        created_at: createdAt,
        expires_at: expiresAt
      }
    });

    console.log('✅ Tokens stored successfully');

    // Clear the oauth_state cookie
    const clearCookie = 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';

    // Return success page
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': clearCookie,
        'Cache-Control': 'no-cache'
      },
      body: `
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                padding: 40px;
                max-width: 600px;
                margin: 0 auto;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              }
              h1 {
                color: #10b981;
                margin-top: 0;
              }
              .success-icon {
                font-size: 64px;
                text-align: center;
                margin-bottom: 20px;
              }
              .info {
                background: #f0f9ff;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #3b82f6;
              }
              .info strong {
                color: #1e40af;
              }
              .next-steps {
                background: #f0fdf4;
                padding: 15px;
                border-radius: 8px;
                margin-top: 20px;
                border-left: 4px solid #10b981;
              }
              .next-steps h3 {
                margin-top: 0;
                color: #065f46;
              }
              .next-steps ol {
                margin: 10px 0;
                padding-left: 20px;
              }
              .next-steps li {
                margin: 8px 0;
              }
              code {
                background: #f1f5f9;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Monaco', 'Courier New', monospace;
                font-size: 0.9em;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Authentication Successful!</h1>

              <p>Your Acre account has been successfully connected and your tokens are now stored securely.</p>

              <div class="info">
                <strong>What happened:</strong>
                <ul>
                  <li>✅ Logged in to Acre successfully</li>
                  <li>✅ Received access token and refresh token</li>
                  <li>✅ Tokens stored securely in Netlify Blobs</li>
                  <li>✅ Auto-refresh configured</li>
                </ul>
              </div>

              <div class="info">
                <strong>Token Details:</strong>
                <ul>
                  <li><strong>Expires in:</strong> ${Math.floor(expiresIn / 60)} minutes</li>
                  <li><strong>Auto-refresh:</strong> Enabled</li>
                  <li><strong>Created:</strong> ${new Date(createdAt).toLocaleString()}</li>
                </ul>
              </div>

              <div class="next-steps">
                <h3>🎉 You're all set!</h3>
                <p><strong>What's next:</strong></p>
                <ol>
                  <li>You can close this window</li>
                  <li>Your tokens will refresh automatically when needed</li>
                  <li>Use <code>/get-token</code> endpoint in n8n to retrieve valid tokens</li>
                  <li>You won't need to login again unless tokens are revoked</li>
                </ol>
              </div>

              <p style="text-align: center; color: #6b7280; font-size: 0.9em; margin-top: 30px;">
                🔒 Your tokens are stored securely and will never be exposed in logs or responses.
              </p>
            </div>
          </body>
        </html>
      `
    };

  } catch (error) {
    console.error('❌ Unexpected error in auth-callback:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
            <h1>❌ Unexpected Error</h1>
            <p><strong>An unexpected error occurred during authentication.</strong></p>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Stack:</strong></p>
            <pre style="background: #f1f5f9; padding: 15px; border-radius: 8px; overflow-x: auto;">${error.stack}</pre>
            <p><a href="/auth-start">Try again</a></p>
          </body>
        </html>
      `
    };
  }
};
