function computeDiff(before, after) {
  const bl = before.split(/\r?\n/);
  const al = after.split(/\r?\n/);
  const max = Math.max(bl.length, al.length);
  const hunks = [];
  for (let i=0;i<max;i+=1){
    const b = bl[i] ?? '';
    const a = al[i] ?? '';
    if (b !== a) hunks.push({ line: i+1, before: b, after: a });
  }
  return hunks;
}

module.exports = { computeDiff };


