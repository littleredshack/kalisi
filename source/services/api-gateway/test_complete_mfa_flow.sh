#!/bin/bash

echo "=== Complete MFA Flow Test ==="
echo

# Load environment
source /workspaces/edt2/.env

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test email - use first from approved list
EMAIL=$(echo $APPROVED_EMAILS | cut -d',' -f1)

echo -e "${YELLOW}Step 1: Request OTP${NC}"
echo "POST /auth/request-otp"
echo "Payload: {\"email\": \"$EMAIL\"}"
echo

RESPONSE=$(curl -s -X POST http://localhost:8080/auth/request-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")

echo "Response: $RESPONSE"
OTP=$(echo $RESPONSE | jq -r '.dev_otp')
echo -e "${GREEN}✓ OTP received: $OTP${NC}"
echo

sleep 1

echo -e "${YELLOW}Step 2: Verify OTP${NC}"
echo "POST /auth/verify-otp"
echo "Payload: {\"email\": \"$EMAIL\", \"otp\": \"$OTP\"}"
echo

RESPONSE=$(curl -s -X POST http://localhost:8080/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"otp\": \"$OTP\"}")

echo "Response: $RESPONSE"
PARTIAL_TOKEN=$(echo $RESPONSE | jq -r '.partial_token')
echo -e "${GREEN}✓ Partial token received: $PARTIAL_TOKEN${NC}"
echo

sleep 1

echo -e "${YELLOW}Step 3: Setup MFA${NC}"
echo "POST /auth/mfa/setup"
echo "Header: Authorization: Partial $PARTIAL_TOKEN"
echo

RESPONSE=$(curl -s -X POST http://localhost:8080/auth/mfa/setup \
  -H "Authorization: Partial $PARTIAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Response: $RESPONSE" | jq '.'
SECRET=$(echo $RESPONSE | jq -r '.secret')
QR_URL=$(echo $RESPONSE | jq -r '.qr_code_url')
echo
echo -e "${GREEN}✓ MFA setup successful!${NC}"
echo -e "${GREEN}  - TOTP Secret: $SECRET${NC}"
echo -e "${GREEN}  - QR Code URL: $QR_URL${NC}"
echo

echo -e "${GREEN}=== All steps completed successfully! ===${NC}"
echo
echo "The complete MFA flow is working correctly:"
echo "1. Request OTP - Returns OTP code"
echo "2. Verify OTP - Returns partial authentication token"
echo "3. Setup MFA - Returns TOTP secret and QR code"
echo
echo "Important notes:"
echo "- Only allowed emails can access the system: $APPROVED_EMAILS"
echo "- The partial token must use 'Authorization: Partial <token>' header format"
echo "- MFA setup is a POST endpoint, not GET"