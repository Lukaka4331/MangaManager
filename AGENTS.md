# Repository Guidelines

## Project Structure & Module Organization
This repository is organized around the Node.js server in `personal/server/`. Key files are:
- `personal/server/server.js`: Express app, MongoDB models, upload and comic APIs.
- `personal/server/public/`: static UI assets such as `index.html` and `viewer.html`.
- `personal/uploads/`: runtime image storage, grouped by comic folder name.
- `personal/docker-compose.yml`: local stack for MongoDB and the server.

## Build, Test, and Development Commands
Run commands from `personal/server/` unless noted otherwise.
- `npm install`: install runtime dependencies.
- `npm start`: start the Express server with `node server.js`.
- `docker compose up -d --build` from `personal/`: build and start MongoDB plus the app.

The GitHub workflow references `npm run lint` and `npm test`, but those scripts are not currently defined in `package.json`.

## Coding Style & Naming Conventions
Use CommonJS (`require`) and keep the existing semicolon-free JavaScript style.
- Indent with 2 spaces.
- Use `camelCase` for variables and functions, e.g. `sanitizeName`.
- Use descriptive route names that match the API, such as `/listComics` and `/deleteComic/:name`.
- Prefer short inline comments only where the control flow is not obvious.

## Testing Guidelines
There is no test suite checked in yet. If you add tests, place them near the server code or under a dedicated `tests/` directory and make the command explicit in `package.json`.
- Name tests after the behavior they verify, such as `uploadComic.test.js`.
- For manual verification, exercise the API endpoints in `server.js` and confirm files appear under `personal/uploads/`.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit messages, often prefixed with a type such as `test:` or a brief summary like `web ui refactor`.
- Keep commits focused on one change.
- In pull requests, describe the user-visible effect, note any config or Docker changes, and include screenshots for UI updates.
- Link related issues when available.

## Security & Configuration Tips
Do not commit uploaded media or local database state. Keep MongoDB connection settings and environment-specific paths in `docker-compose.yml` or local overrides rather than hardcoding new ones in source files.
