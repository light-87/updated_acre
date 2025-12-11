/**
 * OAuth Flow Step 1: Initiate Authorization
 *
 * This function starts the OAuth flow by redirecting the user to Acre's login page.
 * Visit this URL in your browser to begin: https://acre-test.netlify.app/auth-start
 */

exports.handler = async (event, context) => {
  try {
    console.log('🚀 OAuth flow initiated');

    // Get environment variables
    const clientId = process.env.ACRE_CLIENT_ID;
    const scope = process.env.ACRE_SCOPE;
    const redirectUri = process.env.NETLIFY_URL
      ? `${process.env.NETLIFY_URL}/.netlify/functions/auth-callback`
      : `https://acre-test.netlify.app/.netlify/functions/auth-callback`;

    // Validate required environment variables
    if (!clientId) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>❌ Configuration Error</h1>
              <p><strong>Missing ACRE_CLIENT_ID environment variable.</strong></p>
              <p>Please set the following in Netlify Dashboard → Site Settings → Environment Variables:</p>
              <ul>
                <li>ACRE_CLIENT_ID</li>
                <li>ACRE_CLIENT_SECRET</li>
                <li>ACRE_API_KEY</li>
                <li>AUTH_SECRET</li>
                <li>ACRE_SCOPE</li>
              </ul>
            </body>
          </html>
        `
      };
    }

    // Use fixed state parameter as required by Acre documentation
    // Acre requires using the scope value as the state parameter
    const state = scope || 'ABCDEFGHIJKLMNOP';

    // Store state in cookie (will be validated in callback)
    const stateCookie = `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`;

    // Build authorization URL
    const authUrl = new URL('https://oauth.acreplatforms.net/oauth2/auth');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scope || '');
    authUrl.searchParams.append('state', state);

    console.log('✅ Redirecting to Acre OAuth:', {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope || '(empty)',
      state: state
    });

    // Redirect user to Acre login page
    return {
      statusCode: 302,
      headers: {
        'Location': authUrl.toString(),
        'Set-Cookie': stateCookie,
        'Cache-Control': 'no-cache'
      },
      body: ''
    };

  } catch (error) {
    console.error('❌ Error in auth-start:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
            <h1>❌ Error</h1>
            <p><strong>Failed to start OAuth flow</strong></p>
            <p>Error: ${error.message}</p>
            <p>Check the Netlify function logs for more details.</p>
          </body>
        </html>
      `
    };
  }
};
