# Implementation Plan - Acre OAuth Backend

**Project:** Serverless OAuth backend for Acre API integration with n8n
**Goal:** Login once, use forever - automated token management
**Estimated Total Time:** 6-8 hours (spread across phases)

---

## 🎯 Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INITIAL SETUP (ONE TIME)                  │
│                                                              │
│  You → Visit /auth-start                                     │
│         ↓                                                    │
│  Netlify redirects → Acre Login                              │
│         ↓                                                    │
│  You login → Acre redirects back with code                   │
│         ↓                                                    │
│  /auth-callback exchanges code for tokens                    │
│         ↓                                                    │
│  Tokens stored in Netlify Blobs                              │
│         ↓                                                    │
│  ✅ Done! Never login again                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              EVERY n8n WORKFLOW RUN (AUTOMATED)              │
│                                                              │
│  n8n → GET /get-token (with AUTH_SECRET)                     │
│         ↓                                                    │
│  Function checks: Is token expired?                          │
│         ├─ NO → Return existing token                        │
│         └─ YES → Refresh token → Return new token            │
│         ↓                                                    │
│  n8n uses token → Call Acre API                              │
│         ↓                                                    │
│  ✅ Success!                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Phase-by-Phase Implementation Plan

---

### Phase 1: OAuth Flow Initiation ✅ (CURRENT)

**Status:** Code complete, awaiting testing

**Goal:** Deploy basic function that redirects to Acre login

**What We Built:**
- `auth-start.js` - Generates OAuth URL and redirects to Acre
- Project structure (package.json, netlify.toml, .gitignore)
- Deployed to: https://acre-test.netlify.app

**Deliverable:**
- User visits `/auth-start` → Gets redirected to Acre login page

**Testing:**
1. Set environment variables in Netlify
2. Register callback URL with Acre
3. Visit `/auth-start` and verify redirect works

**Success Criteria:**
✅ Redirect to Acre login page works
✅ No errors in Netlify function logs
✅ OAuth URL parameters are correct

---

### Phase 2: OAuth Callback & Token Storage 📅 (NEXT)

**Goal:** Handle OAuth callback, exchange code for tokens, store securely

**Time Estimate:** 1-2 hours

**Files to Create:**
```javascript
netlify/functions/auth-callback.js
```

**Implementation Steps:**

1. **Validate State Parameter** (CSRF protection)
   - Read state from URL query
   - Read state from cookie
   - Compare - must match
   - Reject if mismatch

2. **Extract Authorization Code**
   - Get `code` parameter from URL
   - Validate it exists
   - Handle error if missing

3. **Exchange Code for Tokens**
   - POST to: `https://oauth.acreplatforms.co.uk/oauth2/token`
   - Headers:
     - `X-API-KEY: ACRE_API_KEY`
     - `Content-Type: application/x-www-form-urlencoded`
   - Body:
     ```
     grant_type=authorization_code
     code=CODE_FROM_URL
     client_id=ACRE_CLIENT_ID
     client_secret=ACRE_CLIENT_SECRET
     redirect_uri=CALLBACK_URL
     ```

4. **Process Token Response**
   - Extract: access_token, refresh_token, expires_in
   - Calculate: expires_at (current time + expires_in)
   - Log success (without exposing full tokens)

5. **Store Tokens in Netlify Blobs**
   - Use `@netlify/blobs` package
   - Store as JSON:
     ```json
     {
       "access_token": "...",
       "refresh_token": "...",
       "expires_at": "ISO timestamp",
       "created_at": "ISO timestamp"
     }
     ```
   - Key: `acre_tokens`

6. **Return Success Page**
   - HTML page: "✅ Authentication successful!"
   - Instructions: "You can close this window"

**Error Handling:**
- Missing code parameter → User-friendly error
- Invalid code → Show Acre error message
- State mismatch → Security warning
- Token exchange fails → Detailed error with logs
- Storage fails → Error message

**Testing:**
1. Complete OAuth flow end-to-end
2. Verify tokens are stored
3. Check Netlify Blobs (or add debug endpoint)
4. Try with invalid code (should fail gracefully)

**Success Criteria:**
✅ Complete OAuth flow works
✅ Tokens stored in Netlify Blobs
✅ Success page displays
✅ Error cases handled gracefully

---

### Phase 3: Token Retrieval API 📅

**Goal:** Provide endpoint for n8n to get valid access tokens

**Time Estimate:** 1 hour

**Files to Create:**
```javascript
netlify/functions/get-token.js
```

**Implementation Steps:**

1. **Authenticate Request**
   - Check `Authorization` header
   - Expected format: `Bearer AUTH_SECRET`
   - Return 401 if missing or invalid

2. **Retrieve Stored Tokens**
   - Get tokens from Netlify Blobs
   - Key: `acre_tokens`
   - Return 404 if no tokens (user needs to run OAuth flow)

3. **Check Token Expiry**
   - Compare current time with `expires_at`
   - Add 5-minute buffer for safety
   - If expired → proceed to refresh (Phase 4)
   - If valid → return token

4. **Return Token Response**
   - JSON format:
     ```json
     {
       "access_token": "...",
       "expires_in": 3543,
       "refreshed": false
     }
     ```

**Error Handling:**
- Missing auth header → 401
- Invalid auth secret → 401
- No tokens stored → 404 with instructions
- Read error → 500 with details

**Testing:**
1. Call endpoint with valid AUTH_SECRET
2. Should return access token
3. Call endpoint with wrong secret (should fail)
4. Call endpoint with no tokens (should fail)
5. Use token to call Acre API (should work)

**Success Criteria:**
✅ Returns valid access token
✅ AUTH_SECRET authentication works
✅ Can use token to call Acre API
✅ Error cases handled

---

### Phase 4: Token Refresh Logic 📅

**Goal:** Automatically refresh expired tokens

**Time Estimate:** 1-2 hours

**Files to Modify:**
```javascript
netlify/functions/get-token.js (add refresh logic)
```

**Implementation Steps:**

1. **Detect Token Expiry**
   - Already implemented in Phase 3
   - If expired → trigger refresh

2. **Refresh Access Token**
   - POST to: `https://oauth.acreplatforms.co.uk/oauth2/token`
   - Headers:
     - `X-API-KEY: ACRE_API_KEY`
     - `Content-Type: application/x-www-form-urlencoded`
   - Body:
     ```
     grant_type=refresh_token
     refresh_token=STORED_REFRESH_TOKEN
     client_id=ACRE_CLIENT_ID
     client_secret=ACRE_CLIENT_SECRET
     ```

3. **Process Refresh Response**
   - Extract new: access_token, refresh_token (if provided), expires_in
   - Calculate new: expires_at
   - Log refresh event

4. **Update Stored Tokens**
   - Update Netlify Blobs with new tokens
   - Preserve refresh_token if Acre doesn't return new one
   - Update created_at timestamp

5. **Return New Token**
   - Same JSON format as Phase 3
   - Set `refreshed: true`

**Error Handling:**
- Refresh token expired → User must re-authenticate
- Refresh request fails → Return 500 with details
- Storage update fails → Return 500
- Network errors → Retry logic (optional)

**Testing:**
1. **Option A:** Wait for token to expire naturally (~1 hour)
2. **Option B:** Manually set expires_at to past time in storage
3. **Option C:** Temporarily modify code to treat all tokens as expired
4. Call `/get-token` → Should refresh automatically
5. Verify new token works with Acre API

**Success Criteria:**
✅ Detects expired tokens
✅ Refreshes tokens automatically
✅ Updates storage with new tokens
✅ Returns working access token
✅ n8n workflows continue working seamlessly

---

### Phase 5: n8n Integration 📅

**Goal:** Use the backend in n8n workflows

**Time Estimate:** 1 hour

**Implementation Steps:**

1. **Store AUTH_SECRET in n8n**
   - Option A: Environment variable `NETLIFY_AUTH_SECRET`
   - Option B: n8n credential (Header Auth)
   - Recommended: Environment variable

2. **Create "Get Token" HTTP Request Node**
   - Method: GET
   - URL: `https://acre-test.netlify.app/get-token`
   - Authentication: Header Auth
   - Header: `Authorization: Bearer {{ $env.NETLIFY_AUTH_SECRET }}`
   - Response format: JSON

3. **Create "Call Acre API" HTTP Request Node**
   - Method: GET (or POST for creating data)
   - URL: `https://api.myac.re/v1/acre/case?page_size=10`
   - Headers:
     - `Cookie: authorization={{ $('Get Token').item.json.access_token }}`
     - `X-API-KEY: 40d50194e`
     - `Accept: application/json`

4. **Build Complete Workflow**
   ```
   [Schedule Trigger]
       ↓
   [Get Acre Token]
       ↓
   [Get Cases from Acre API]
       ↓
   [Your Business Logic]
   ```

5. **Add Error Handling**
   - IF node: Check if token retrieval succeeded
   - IF node: Check if API call succeeded
   - Error notifications if something fails

**Testing:**
1. Execute "Get Token" node manually → Should return token
2. Execute "Call Acre API" node → Should return case data
3. Run complete workflow → Should work end-to-end
4. Wait for token expiry → Verify refresh is automatic
5. Test error scenarios

**Success Criteria:**
✅ n8n can get tokens from backend
✅ n8n can call Acre API with token
✅ Complete workflow runs successfully
✅ Token refresh is automatic and transparent
✅ No manual intervention needed

---

### Phase 6: Production Readiness (Optional) 📅

**Goal:** Polish, monitoring, and documentation

**Time Estimate:** 2-3 hours

**Tasks:**

1. **Enhanced Logging**
   - Add structured logging
   - Log all OAuth events
   - Log all refresh events
   - Log authentication failures
   - Never log sensitive data

2. **Monitoring & Alerts**
   - Track function invocation count
   - Track error rates
   - Set up email alerts for failures
   - Monitor token refresh frequency

3. **Documentation**
   - Update README with complete setup guide
   - Document troubleshooting steps
   - Add architecture diagrams
   - Document all environment variables

4. **Security Enhancements**
   - Review all secrets handling
   - Ensure HTTPS everywhere
   - Add rate limiting (if needed)
   - Security audit

5. **Performance Optimization**
   - Add token caching (optional)
   - Optimize function cold starts
   - Reduce function execution time

6. **Backup & Recovery**
   - Document disaster recovery steps
   - Document secret rotation process
   - Create deployment checklist

**Success Criteria:**
✅ Comprehensive logging in place
✅ Monitoring configured
✅ Complete documentation
✅ Security best practices followed
✅ Performance optimized

---

## 🔧 Technical Details

### Environment Variables Required

| Variable | Purpose | Example | Where |
|----------|---------|---------|-------|
| `ACRE_CLIENT_ID` | OAuth client ID | `abc123...` | Acre dashboard |
| `ACRE_CLIENT_SECRET` | OAuth client secret | `secret123...` | Acre dashboard |
| `ACRE_API_KEY` | Acre API key | `40d50194e` | Existing |
| `AUTH_SECRET` | Protects get-token endpoint | `e4f8b2c6d9...` | Generate new |
| `ACRE_SCOPE` | OAuth scope | `ABCDEFGHIJKLMNOP` | Confirmed |

### Netlify Blobs Storage Structure

**Key:** `acre_tokens`

**Value:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "def50200b3c4d5e6f7g8h9i0j1k2l3m4n5...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": "2025-12-11T15:30:00.000Z",
  "created_at": "2025-12-11T14:30:00.000Z"
}
```

### API Endpoints

**Our Backend:**
- `GET /auth-start` - Initiate OAuth flow (Phase 1)
- `GET /auth-callback` - OAuth callback handler (Phase 2)
- `GET /get-token` - Get valid access token (Phase 3-4)

**Acre OAuth:**
- `GET https://oauth.acreplatforms.co.uk/oauth2/auth` - Authorization
- `POST https://oauth.acreplatforms.co.uk/oauth2/token` - Token exchange/refresh

**Acre API:**
- `GET https://api.myac.re/v1/acre/case` - Get cases
- `POST https://api.myac.re/v1/acre/case` - Create case
- All require:
  - `Cookie: authorization=ACCESS_TOKEN`
  - `X-API-KEY: 40d50194e`

---

## 🎯 Success Metrics

**Project Complete When:**

✅ Can login to Acre once via browser
✅ Tokens stored securely
✅ Tokens refresh automatically
✅ n8n can get valid tokens via API call
✅ n8n workflows run without manual intervention
✅ Zero manual token management
✅ Works reliably for weeks/months

**KPIs:**
- OAuth flow success rate: 100%
- Token refresh success rate: >99%
- n8n workflow success rate: >95%
- Manual interventions per month: 0
- Cost: $0/month

---

## 🐛 Common Issues & Solutions

### Issue 1: "Invalid Redirect URI"
- **Cause:** Callback URL not registered or typo
- **Solution:** Verify exact URL with Acre, including `/.netlify/functions/`

### Issue 2: "State Mismatch"
- **Cause:** Cookie not set/read correctly
- **Solution:** Check browser cookies, use incognito mode

### Issue 3: Token Refresh Fails
- **Cause:** Refresh token expired
- **Solution:** Re-run OAuth flow (visit /auth-start)

### Issue 4: n8n Gets 401 from Backend
- **Cause:** Wrong AUTH_SECRET
- **Solution:** Verify AUTH_SECRET matches in Netlify and n8n

### Issue 5: n8n Gets 401 from Acre
- **Cause:** Token not sent correctly
- **Solution:** Check Cookie header format: `authorization=TOKEN` (no "Bearer")

---

## 📚 Learning Resources

**OAuth 2.0:**
- RFC 6749: https://datatracker.ietf.org/doc/html/rfc6749
- Authorization Code Flow explained

**Netlify:**
- Functions docs: https://docs.netlify.com/functions/overview/
- Blobs docs: https://docs.netlify.com/blobs/overview/

**n8n:**
- HTTP Request node: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/
- Credentials: https://docs.n8n.io/credentials/

---

## 🎬 Next Session Checklist

**Before Starting Next Phase:**

- [ ] Phase 1 tested and working
- [ ] OAuth redirect to Acre works
- [ ] All environment variables set
- [ ] Callback URL registered with Acre
- [ ] Ready to build Phase 2

**Information Needed:**
- Current phase status
- Any errors encountered
- What worked / what didn't
- Ready to proceed to next phase

---

## 💡 Future Enhancements (Beyond MVP)

1. **Multi-User Support**
   - Store tokens per user
   - User management interface
   - Use real database (Supabase/Postgres)

2. **Admin Dashboard**
   - View current token status
   - Manually refresh tokens
   - View logs and metrics
   - Re-trigger OAuth flow

3. **Webhook Integration**
   - Acre calls our backend on events
   - Trigger n8n workflows via webhook
   - Real-time updates

4. **Token Encryption**
   - Encrypt tokens in storage
   - Use Netlify environment for encryption key

5. **Advanced Monitoring**
   - Datadog/Sentry integration
   - Custom metrics dashboard
   - Alert routing

---

**Created:** 2025-12-11
**Status:** Phase 1 in progress
**Next Milestone:** Complete Phase 1 testing, proceed to Phase 2
**Estimated Completion:** 6-8 hours total work time
