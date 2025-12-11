# Acre OAuth Backend

Serverless OAuth backend for Acre API integration, hosted on Netlify.

## Status: Phase 1 - Testing OAuth Redirect

### Current Progress
- ✅ Project structure created
- ✅ auth-start function implemented
- ⏳ Pending: Deploy to Netlify
- ⏳ Pending: Register callback URL with Acre
- ⏳ Pending: Test OAuth redirect

## Quick Start

### 1. Deploy to Netlify

1. Go to [Netlify](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub and select this repository
4. Deploy settings:
   - Build command: (leave empty)
   - Publish directory: (leave empty)
   - Functions directory: `netlify/functions`
5. Click "Deploy site"

### 2. Rename Site (Optional)

1. Go to Site Settings → General
2. Change site name to: `acre-test`
3. Your site will be at: `https://acre-test.netlify.app`

### 3. Set Environment Variables

Go to Site Settings → Environment Variables and add:

- `ACRE_CLIENT_ID` - Your Application ID from Acre
- `ACRE_CLIENT_SECRET` - Your Application Secret from Acre
- `ACRE_API_KEY` - Your X-API-KEY (e.g., 40d50194e)
- `AUTH_SECRET` - Generate with: `openssl rand -hex 32`
- `ACRE_SCOPE` - ABCDEFGHIJKLMNOP

### 4. Get Your Callback URL

After deployment, your callback URL will be:
```
https://acre-test.netlify.app/.netlify/functions/auth-callback
```

**Register this URL with Acre!**

### 5. Test Phase 1

Once callback URL is registered, visit:
```
https://acre-test.netlify.app/auth-start
```

You should be redirected to Acre's login page.

## Architecture

```
┌─────────────┐
│  You visit  │
│ /auth-start │
└──────┬──────┘
       │
       ↓
┌─────────────────┐
│ auth-start.js   │
│ Redirects to    │
│ Acre OAuth page │
└─────────────────┘
```

## Next Phases

- Phase 2: auth-callback function (exchange code for tokens)
- Phase 3: get-token function (return token to n8n)
- Phase 4: Token refresh logic
- Phase 5: n8n integration

## Support

Check Netlify function logs for debugging:
Netlify Dashboard → Functions → Select function → Logs
