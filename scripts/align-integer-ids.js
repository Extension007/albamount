const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../config/database.js');
let text = fs.readFileSync(file, 'utf8');

// Normalize line endings for processing
const hadCrlf = text.includes('\r\n');
text = text.replace(/\r\n/g, '\n');

const intPk = `id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  }`;

text = text.replace(
  /id:\s*\{\s*type:\s*DataTypes\.STRING\(50\),\s*primaryKey:\s*true\s*\}/g,
  intPk
);

const fkNames = ['ownerId', 'userId', 'relatedUserId', 'createdById', 'usedById', 'reservedForUserId', 'codeId', 'targetUserId', 'adminId'];
for (const name of fkNames) {
  const re = new RegExp(
    `(${name}:\\s*\\{\\s*type:\\s*)DataTypes\\.STRING\\(50\\)`,
    'g'
  );
  text = text.replace(re, `$1DataTypes.INTEGER`);
}

text = text.replace(/relatedCardId:\s*DataTypes\.STRING\(50\)/g, 'relatedCardId: DataTypes.INTEGER');
text = text.replace(/cardId:\s*DataTypes\.STRING\(50\)/g, 'cardId: DataTypes.INTEGER');
text = text.replace(/relatedCodeId:\s*\{\s*type:\s*DataTypes\.STRING\(50\)/g, 'relatedCodeId: {\n    type: DataTypes.INTEGER');

// Remove virtual result index
text = text.replace(/[ \t]*\{\s*fields:\s*\['result'\]\s*\},?[ \t]*(\/\/[^\n]*)?\n/g, '');

// Remove hex generation helper + hooks
text = text.replace(
  /\/\/ Helper function to generate UUID[\s\S]*?\.forEach\(Model => \{[\s\S]*?\}\);\n/,
  '// IDs are INTEGER SERIAL in Postgres — no client-side hex generation\n'
);

if (hadCrlf) text = text.replace(/\n/g, '\r\n');
fs.writeFileSync(file, text);

const leftPk = (text.match(/STRING\(50\),\s*\r?\n\s*primaryKey:\s*true/g) || []).length;
const hooks = /generateId|beforeValidate.*generateId/.test(text);
console.log({ leftPk, hooksRemoved: !text.includes('function generateId'), string50Left: (text.match(/STRING\(50\)/g) || []).length });
