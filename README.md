# Two-Person Socket.io Chat

A simple private two-person real-time chat built with:

- Node.js
- Express
- Socket.io
- HTML/CSS/JavaScript
- No database

## Requirements

Install Node.js 18+.

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Open the same address in two browser tabs/devices and use the same room code.

Example:

```text
Room: MAX123
Person 1: Max
Person 2: Alex
```

## How it works

Each room is stored in a JavaScript `Map` on the Node.js server:

```js
const rooms = new Map();
```

Messages are stored inside the room:

```js
room.messages.push(message);
```

Therefore there is no database.

## Important limitation

All rooms and messages are stored only in server memory.

If the server restarts:

- rooms disappear
- messages disappear
- connected users disconnect

For a production app, persistent storage would be needed.

## Security note

This example is intentionally minimal. A production version should add authentication, HTTPS, rate limiting, input validation, abuse protection, and a proper private-room authorization mechanism.
