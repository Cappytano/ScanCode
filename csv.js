(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.parseCSV = factory();
}(this, function(){
  return function parseCSV(text){
    var rows = []; var row = []; var cur = ''; var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(cur); cur = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && text[i+1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur); rows.push(row);
    // remove trailing empty rows
    while (rows.length && rows[rows.length-1].every(function(c){return c === '';})) rows.pop();
    return rows;
  };
}));
