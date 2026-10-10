const fs = require("fs");
const path = require("path");
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
  );
const files = walk("src");
const html = fs.readFileSync("index.html", "utf8");
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
let bad = 0;
const graph = {};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\$\("([^"]+)"\)|getElementById\("([^"]+)"\)/g)) {
    const id = m[1] || m[2];
    if (!ids.has(id)) { console.log("MISSING id in index.html:", id, "<-", f); bad++; }
  }
  graph[f] = [...src.matchAll(/from "(\.\/[^"]+)"/g)].map((m) => m[1]);
  for (const spec of graph[f]) {
    const target = path.join(path.dirname(f), spec.slice(2) + ".ts");
    if (!fs.existsSync(target)) { console.log("BROKEN import:", spec, "<-", f); bad++; }
  }
}
const seen = new Set();
const walk2 = (f, p) => {
  if (p.includes(f)) { console.log("CYCLE:", [...p, f].join(" -> ")); bad++; return; }
  if (seen.has(f) || !graph[f]) return;
  seen.add(f);
  graph[f].forEach((n) => walk2(path.join(path.dirname(f), n.slice(2) + ".ts"), [...p, f]));
};
Object.keys(graph).forEach((f) => walk2(f, []));
console.log(bad ? bad + " PROBLEMS" : "OK: all ids resolve, all imports resolve, no cycles");
console.log("tree:\n  root: " + files.filter((f) => !f.includes(path.sep + "lib" + path.sep) && !f.includes(path.sep + "components" + path.sep)).join(" ") + "\n  lib: " + files.filter((f) => f.includes(path.sep + "lib" + path.sep)).map((f) => path.basename(f)).join(" ") + "\n  components: " + files.filter((f) => f.includes(path.sep + "components" + path.sep)).map((f) => path.basename(f)).join(" "));
