const { createRequire } = require('node:module');
const path = require('node:path');
module.exports = createRequire(path.join(process.env.AUDIT_TOOLS || __dirname, 'package.json'));
