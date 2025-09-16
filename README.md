# zero1

A full-stack TypeScript monorepo with Express API and React web application.

## Structure

- `apps/api` - Express TypeScript API with CORS, helmet, and morgan middleware
- `apps/web` - React TypeScript app with Vite, Tailwind CSS, and error boundaries
- `configs` - Shared TypeScript configuration
- `.vscode` - VSCode workspace settings
- `.github/workflows` - CI/CD pipeline for GitHub Actions

## Quick Start

```bash
# Clone repository
git clone https://github.com/KingofSalem33/zero1.git
cd zero1

# Install dependencies
npm ci

# Copy environment files
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env

# Start development servers (both API and web)
npm run dev
```

## Development URLs

- **API**: http://localhost:3001
  - Health: http://localhost:3001/health
  - Hello: http://localhost:3001/api/hello
- **Web**: http://localhost:5173

## Available Scripts

| Script                | Description                                |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Start both API and web development servers |
| `npm run dev:api`     | Start API development server only          |
| `npm run dev:web`     | Start web development server only          |
| `npm run build`       | Build both API and web for production      |
| `npm run build:api`   | Build API for production                   |
| `npm run build:web`   | Build web for production                   |
| `npm run start:api`   | Start API in production mode               |
| `npm run preview:web` | Preview web production build               |
| `npm run lint`        | Lint all TypeScript/JavaScript files       |
| `npm run format`      | Format code with Prettier                  |

## Production Testing

```bash
# Build both applications
npm run build

# Start API in production mode
npm --prefix apps/api run start

# Preview web production build
npm --prefix apps/web run preview
```

## Troubleshooting

### Port Already in Use (EADDRINUSE)

```bash
# Windows: Kill processes on specific ports
netstat -ano | findstr :3001
taskkill /PID <process_id> /F
```

### PATH Refresh Issues

```bash
# Refresh PATH in current PowerShell session
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
```

### CORS Origin Issues

- Development web server runs on port 5173
- Production preview runs on port 4173
- Both origins are configured in the API CORS settings

### PowerShell Execution Policy (Windows)

```bash
# If you encounter execution policy errors
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, CORS, Helmet, Morgan
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Development**: ESLint, Prettier, Husky, lint-staged
- **CI/CD**: GitHub Actions with Windows runner
