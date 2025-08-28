const assert = require('assert');
const parseCSV = require('../csv.js');

const csv = 'id,value,notes\n1,"a, b","note1"\n2,"multi\nline","note2"\n3,"quote ""inner""",note';
const rows = parseCSV(csv);
assert.deepStrictEqual(rows, [
  ['id','value','notes'],
  ['1','a, b','note1'],
  ['2','multi\nline','note2'],
  ['3','quote "inner"','note']
]);

console.log('CSV parser handles commas, quotes, and newlines');
