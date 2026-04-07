# Email App Deployment Guide

## Architecture Decision: Separate Projects vs Monorepo

**Decision: Keep projects separate** ✅

### Why Separate Projects?

1. **Clear Separation of Concerns**
   - Portfolio and email app are distinct applications
   - Each has its own purpose and lifecycle
   - Easier to understand and maintain

2. **Independent Development**
   - Can work on email app without affecting portfolio
   - Can test and iterate independently
   - Separate git histories and version control

3. **Flexibility**
   - Email app could be deployed elsewhere in the future
   - Can use different React versions or dependencies
   - Simpler dependency management

4. **Deployment Automation**
   - Build script handles all the complexity
   - Single command to deploy everything
   - No monorepo tooling overhead (lerna, nx, etc.)

## Deployment Workflow

### Quick Deploy

From the email app directory:
```bash
npm run deploy:portfolio
```

That's it! This single command will:
1. Build the email app
2. Copy it to the portfolio's public folder
3. Build the portfolio (which includes the email app)
4. Deploy everything to Firebase

### Manual Steps (if needed)

If you need to run steps individually:

```bash
# 1. Build email app
cd /Users/joshcocciardi/Downloads/Develop/countdown
npm run build

# 2. Copy to portfolio
mkdir -p /Users/joshcocciardi/Downloads/Develop/joshcocciardi/public/electronic-mail
cp -r build/* /Users/joshcocciardi/Downloads/Develop/joshcocciardi/public/electronic-mail/

# 3. Build and deploy portfolio
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
npm run build
firebase deploy
```

## Development Workflow

### Working on Email App

```bash
cd /Users/joshcocciardi/Downloads/Develop/countdown
npm run dev
```

This starts the dev server at `http://localhost:3000/electronic-mail`

### Working on Portfolio

```bash
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
npm start
```

### Testing Before Deploy

1. Make changes to email app
2. Run `npm run dev` to test locally
3. When satisfied, run `npm run deploy:portfolio`
4. Visit `https://www.joshcocciardi.com/electronic-mail`
5. Hard refresh (Cmd+Shift+R) to see changes

## Project Structure

```
countdown/                          # Email app project
├── deploy-to-portfolio.sh         # Automated deployment script
├── package.json                   # homepage: "/electronic-mail"
├── src/                          # Email app source code
└── build/                        # Built files (gitignored)

joshcocciardi/                     # Portfolio project
├── firebase.json                  # public: "build"
├── package.json                   # homepage: "."
├── src/                          # Portfolio source code
├── public/
│   └── electronic-mail/          # Email app gets copied here
└── build/                        # Built files (gitignored)
    └── electronic-mail/          # Email app in final build
```

## Key Configuration Files

### Email App (countdown/package.json)
```json
{
  "homepage": "/electronic-mail",
  "scripts": {
    "deploy:portfolio": "./deploy-to-portfolio.sh"
  }
}
```

### Portfolio (joshcocciardi/package.json)
```json
{
  "homepage": "."
}
```

### Portfolio (joshcocciardi/firebase.json)
```json
{
  "hosting": {
    "public": "build"
  }
}
```

## Live URLs

- **Portfolio:** https://www.joshcocciardi.com
- **Email App:** https://www.joshcocciardi.com/electronic-mail

## Troubleshooting

### "Command not found: deploy-to-portfolio.sh"
Make sure the script is executable:
```bash
chmod +x deploy-to-portfolio.sh
```

### Email app not updating after deploy
1. Check that the build completed successfully
2. Verify files were copied to portfolio/public/electronic-mail
3. Hard refresh browser (Cmd+Shift+R)
4. Clear browser cache if needed

### OAuth errors after deploy
1. Verify Google Cloud Console has correct URLs:
   - JavaScript Origins: `https://www.joshcocciardi.com`
   - Redirect URIs: `https://www.joshcocciardi.com/electronic-mail`
2. Check that REACT_APP_GOOGLE_CLIENT_ID is set in .env
3. Ensure Firebase project is correct

## Future Considerations

### If you want to deploy email app separately:
1. Create a new Firebase project for email app
2. Update email app's .firebaserc and firebase.json
3. Change homepage to "." in email app's package.json
4. Deploy directly: `firebase deploy`

### If you want to add more apps:
Follow the same pattern:
1. Keep app in separate directory
2. Set homepage: "/app-name"
3. Add deploy script
4. Copy build to portfolio/public/app-name

### If you decide to use a monorepo later:
Consider tools like:
- Turborepo
- Nx
- Lerna
- npm/yarn workspaces

But for 2 apps, the current setup is simpler and more maintainable!