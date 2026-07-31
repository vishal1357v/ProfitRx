const crypto = require('crypto');
const fs = require('fs');
const key = crypto.randomBytes(32).toString('base64');
fs.appendFileSync('.env', '\nTOKEN_ENCRYPTION_KEY="' + key + '"\n');
console.log('Appended KEY:', key);
