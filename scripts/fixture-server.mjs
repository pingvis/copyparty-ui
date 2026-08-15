import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const port = Number(process.env.PORT || 4174);

const sampleListing = (writable) => ({
  dirs: [
    {
      href: "Project%20Files/",
      sz: 7340032,
      ext: "---",
      ts: 1786819096,
      tags: { ".files": 4 }
    }
  ],
  files: [
    {
      href: "campaign-preview.webp",
      sz: 1284500,
      ext: "webp",
      ts: 1786819096,
      tags: { res: "1600x1000", vc: "webp" }
    },
    {
      href: "final-cut.mp4",
      sz: 48234496,
      ext: "mp4",
      ts: 1786818096,
      tags: { res: "1920x1080", vc: "h264" }
    },
    {
      href: "production-notes.pdf",
      sz: 483328,
      ext: "pdf",
      ts: 1786817096,
      tags: {}
    }
  ],
  taglist: [".files", "vc", "res"],
  srvinf: "AVideo",
  acct: "*",
  perms: writable ? ["read", "write"] : ["read"],
  cfg: { idx: true, lifetime: 0 }
});

function page(writable) {
  const access = writable ? "Read-Write access" : "Read-Only access";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AVideo fixture</title>
  <link rel="stylesheet" href="/ui-assets/client-browser-ui.css">
</head>
<body>
  <nav id="tree">native tree</nav>
  <main id="ops">
    <a id="opa_up" href="#v=up2k">native upload</a>
    <a id="opa_mkd" href="#v=mkdir">native mkdir</a>
    <section id="op_up2k" class="opview">
      <form id="u2form"><input id="file1" name="file1[]" type="file" multiple></form>
      <div id="u2btn_ct"><button id="u2btn" type="button">choose files</button></div>
      <div id="u2cards"><a href="#">upload settings</a></div>
      <div id="u2etas">waiting for files</div>
      <div id="u2life">uploads stay in this fixture</div>
      <div id="u2tabw"><table id="u2tab"><tbody></tbody></table></div>
      <table id="u2conf"><tbody><tr><td>
        <a href="#" id="nthread_sub">−</a>
        <input id="nthread" value="2" inputmode="numeric" aria-label="Parallel uploads">
        <a href="#" id="nthread_add">+</a>
      </td></tr></tbody></table>
    </section>
    <section id="op_mkdir" class="opview">
      <form><input name="name" placeholder="Folder name"><input type="submit" value="Create"><span class="msg"></span></form>
      <a id="opa_x" href="#">close</a>
    </section>
  </main>
  <div id="path">/shr/fixture/</div>
  <div id="acc_info">${access}</div>
  <div id="wrap"><p>native file manager must stay hidden</p></div>
  <div id="srv_info">native server footer must stay hidden</div>
  <div id="modal"></div>
  <div id="toast"></div>
  <script src="/ui-assets/client-browser-ui.js"></script>
  <script>
    document.getElementById("u2btn").addEventListener("click", function () {
      document.getElementById("file1").click();
    });
    document.querySelector("#op_mkdir form").addEventListener("submit", function (event) {
      event.preventDefault();
      this.querySelector(".msg").textContent = "fixture folder created";
    });
    document.getElementById("nthread_sub").addEventListener("click", function (event) {
      event.preventDefault();
      var input = document.getElementById("nthread");
      input.value = Math.max(0, Number(input.value || 0) - 1);
    });
    document.getElementById("nthread_add").addEventListener("click", function (event) {
      event.preventDefault();
      var input = document.getElementById("nthread");
      input.value = Math.min(16, Number(input.value || 0) + 1);
    });
  </script>
</body>
</html>`;
}

const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c8cbd1"/><stop offset="1" stop-color="#242529"/></linearGradient></defs>
  <rect width="1600" height="1000" fill="#0d0e10"/><circle cx="1250" cy="180" r="520" fill="url(#g)" opacity=".5"/><rect x="130" y="590" width="980" height="180" rx="42" fill="#ececef" opacity=".9"/>
</svg>`;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/ui-assets/client-browser-ui.js" || url.pathname === "/ui-assets/client-browser-ui.css") {
    const name = path.basename(url.pathname);
    const body = await fs.readFile(path.join(root, "ui-assets", name));
    response.writeHead(200, {
      "content-type": name.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(body);
    return;
  }

  if (url.searchParams.has("th") && url.pathname.endsWith("/")) {
    response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    response.end(preview);
    return;
  }

  if (/\.(?:webp|mp4|pdf)$/.test(url.pathname)) {
    response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    response.end(preview);
    return;
  }

  const writable = !url.pathname.includes("read-only");
  if (url.searchParams.has("ls")) {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(sampleListing(writable)));
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(page(writable));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Writable fixture: http://127.0.0.1:${port}/shr/writable/`);
  console.log(`Read-only fixture: http://127.0.0.1:${port}/shr/read-only/`);
  console.log(`Native/non-share fixture: http://127.0.0.1:${port}/share/`);
});
