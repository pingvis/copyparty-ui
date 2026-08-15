"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ui = require("../ui-assets/client-browser-ui.js");

test("custom UI activates only inside /shr/", () => {
  assert.equal(ui.isSharePath("/shr/abc123/"), true);
  assert.equal(ui.isSharePath("/shr/abc123/folder/"), true);
  assert.equal(ui.isSharePath("/shr/"), true);
  assert.equal(ui.isSharePath("/shr"), false);
  assert.equal(ui.isSharePath("/share/"), false);
  assert.equal(ui.isSharePath("/ui-assets/"), false);
  assert.equal(ui.isSharePath("/"), false);
});

test("native recovery parameters bypass the client UI", () => {
  assert.equal(ui.wantsNativeBrowser("?v"), true);
  assert.equal(ui.wantsNativeBrowser("?v=up2k"), true);
  assert.equal(ui.wantsNativeBrowser("?fullui"), true);
  assert.equal(ui.wantsNativeBrowser("?k=secret"), false);
});

test("listing URL preserves access parameters", () => {
  const url = new URL(ui.listingUrl("https://files.example/shr/abc/?k=keep&v"));
  assert.equal(url.searchParams.get("k"), "keep");
  assert.equal(url.searchParams.has("v"), false);
  assert.equal(url.searchParams.has("ls"), true);
});

test("download URL preserves access parameters", () => {
  const url = new URL(ui.withQuery("https://files.example/shr/abc/?k=keep", "zip"));
  assert.equal(url.searchParams.get("k"), "keep");
  assert.equal(url.searchParams.has("zip"), true);
});

test("share context hides token at root and decodes folders", () => {
  assert.deepEqual(ui.shareContext("/shr/token123/"), {
    token: "token123",
    folders: [],
    root: "/shr/token123/",
    title: "Shared files"
  });
  assert.equal(ui.shareContext("/shr/token123/Client%20Exports/").title, "Client Exports");
});

test("entry names and byte sizes are client friendly", () => {
  assert.equal(ui.entryName("nested/My%20Video.mp4"), "My Video.mp4");
  assert.equal(ui.entryName("nested/A+B.mp4"), "A+B.mp4");
  assert.equal(ui.formatBytes(0), "0 B");
  assert.equal(ui.formatBytes(1024), "1 KB");
  assert.equal(ui.formatBytes(1536), "1.5 KB");
  assert.equal(ui.formatBytes(1024 * 1024), "1 MB");
});
