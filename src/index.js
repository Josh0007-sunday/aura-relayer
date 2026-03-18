// Forwarder for Vercel and local development
// This file is kept momentarily to avoid IDE/CLI errors after the move to api/index.js
const app = require('../api/index');
module.exports = app;
