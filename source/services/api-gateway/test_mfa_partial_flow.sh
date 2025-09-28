#!/bin/bash
# Test MFA setup flow with partial tokens

# Load environment
source /workspaces/edt2/.env

API_URL="http://localhost:8080"
# Use first email from the approved list
EMAIL=$(echo $APPROVED_EMAILS | cut -d',' -f1)

echo "=== Testing MFA Setup Flow with Partial Tokens ==="
echo

# Step 1: Request OTP
echo "1. Requesting OTP..."
OTP_RESPONSE=$(curl -s -X POST "$API_URL/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")

echo "Response: $OTP_RESPONSE"
OTP=$(echo "$OTP_RESPONSE" | jq -r '.dev_otp // empty')

if [ -z "$OTP" ]; then
  echo "Error: No OTP in response. Check server logs."
  exit 1
fi

echo "OTP: $OTP"
echo

# Step 2: Verify OTP (should return partial token for MFA setup)
echo "2. Verifying OTP..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"otp\": \"$OTP\"}")

echo "Response: $VERIFY_RESPONSE"
PARTIAL_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.partial_token // empty')
MFA_SETUP_REQUIRED=$(echo "$VERIFY_RESPONSE" | jq -r '.mfa_setup_required // false')

if [ -z "$PARTIAL_TOKEN" ]; then
  echo "Error: No partial token in response"
  exit 1
fi

if [ "$MFA_SETUP_REQUIRED" != "true" ]; then
  echo "Error: Expected mfa_setup_required to be true"
  exit 1
fi

echo "Partial Token: $PARTIAL_TOKEN"
echo

# Step 3: Setup MFA with partial token
echo "3. Setting up MFA with partial token..."
SETUP_RESPONSE=$(curl -s -X POST "$API_URL/auth/mfa/setup" \
  -H "Content-Type: application/json" \
  -H "X-Partial-Token: $PARTIAL_TOKEN" \
  -d "{}")

echo "Response: $SETUP_RESPONSE"
SECRET=$(echo "$SETUP_RESPONSE" | jq -r '.secret // empty')
QR_CODE=$(echo "$SETUP_RESPONSE" | jq -r '.qr_code_url // empty')
BACKUP_CODES=$(echo "$SETUP_RESPONSE" | jq -r '.backup_codes // empty')

if [ -z "$SECRET" ]; then
  echo "Error: No secret in MFA setup response"
  exit 1
fi

echo "Secret: $SECRET"
echo "QR Code URL: $QR_CODE"
echo "Backup Codes: $BACKUP_CODES"
echo

# Step 4: Generate TOTP code
echo "4. Generating TOTP code..."
# Note: In a real test, you'd use an actual TOTP library
# For testing, we'll prompt for manual entry
echo "Please enter the 6-digit code from your authenticator app:"
read -r TOTP_CODE

if [ -z "$TOTP_CODE" ]; then
  echo "Using test code: 123456"
  TOTP_CODE="123456"
fi

# Step 5: Enable MFA with TOTP code
echo "5. Enabling MFA with TOTP code..."
ENABLE_RESPONSE=$(curl -s -X POST "$API_URL/auth/mfa/enable" \
  -H "Content-Type: application/json" \
  -H "X-Partial-Token: $PARTIAL_TOKEN" \
  -d "{\"code\": \"$TOTP_CODE\", \"backup_acknowledged\": true}")

echo "Response: $ENABLE_RESPONSE"
TOKEN=$(echo "$ENABLE_RESPONSE" | jq -r '.token // empty')
SUCCESS=$(echo "$ENABLE_RESPONSE" | jq -r '.success // false')

if [ "$SUCCESS" != "true" ]; then
  echo "Error: MFA enable failed"
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "Error: No token in enable response"
  exit 1
fi

echo
echo "=== MFA Setup Completed Successfully ==="
echo "Full JWT Token: $TOKEN"
echo

# Step 6: Test authenticated endpoint with full token
echo "6. Testing authenticated endpoint with full token..."
PROFILE_RESPONSE=$(curl -s -X GET "$API_URL/auth/profile" \
  -H "Authorization: Bearer $TOKEN")

echo "Profile Response: $PROFILE_RESPONSE"
echo

echo "=== All Tests Passed! ==="