# Build AfuChat APK

## Quick Build (2 minutes)

Your project is fully configured. Just run one command:

### Option A: From Replit Shell (if eas-cli works)
```bash
cd artifacts/mobile
EXPO_TOKEN="YOUR_TOKEN" EAS_NO_VCS=1 npx eas-cli build --platform android --profile preview --non-interactive
```

### Option B: From your computer
1. Download/clone this project
2. Install dependencies:
   ```bash
   npm install -g eas-cli
   cd artifacts/mobile
   pnpm install
   ```
3. Login to Expo:
   ```bash
   eas login
   # Use your amkaweesi1 account
   ```
4. Build the APK:
   ```bash
   eas build --platform android --profile preview
   ```
5. Once complete, EAS will give you a download URL for the APK.

### Configuration Summary
- **EAS Project**: `@amkaweesi1/afuchat` (ID: b55c5d92-7a83-472f-b660-d1838efba5fe)
- **Build Profile**: `preview` (outputs `.apk`)
- **Android Package**: `com.afuchat.app`
- **Version**: 2.0.1.7
- **Supabase**: Pre-configured in eas.json env vars
