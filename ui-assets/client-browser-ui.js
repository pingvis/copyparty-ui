(function () {
  "use strict";

  var BROWSER_PATH_PATTERNS = [/^\/shr\//];
  var DROPBOX_HOSTNAMES = ["files.avideo.lt"];
  var DROPBOX_PATH_PATTERNS = [/^\/share\/?$/];

  function matchesPatterns(patterns) {
    return patterns.some(function (re) {
      return re.test(location.pathname);
    });
  }

  function pageMode() {
    if (
      DROPBOX_HOSTNAMES.indexOf(location.hostname) !== -1 &&
      matchesPatterns(DROPBOX_PATH_PATTERNS)
    ) {
      return "dropbox";
    }
    if (matchesPatterns(BROWSER_PATH_PATTERNS)) return "browser";
    return "";
  }

  function matchesPath() {
    return !!pageMode();
  }

  function wantsNativeBrowser() {
    try {
      return new URLSearchParams(location.search).has("v");
    } catch (err) {
      return /^\?v(?:[=&]|$)/.test(location.search || "");
    }
  }

  function text(node) {
    return (node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
  }

  function cleanPathText(pathText) {
    return (pathText || "").replace(/^🌲/, "").trim();
  }

  function formatPathTitle(pathText) {
    return cleanPathText(pathText).replace(/\//g, " / ").trim();
  }

  function pathLinkSegments(pathNode) {
    if (!pathNode) return [];

    return Array.from(pathNode.querySelectorAll("a"))
      .map(function (link) {
        return text(link);
      })
      .filter(function (part) {
        return part && part !== "/" && part !== "🌲";
      });
  }

  function pathSegments(pathText) {
    return cleanPathText(pathText)
      .split("/")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  function isShareRoot(pathText) {
    var segments = pathSegments(pathText);
    if (!segments.length) return true;

    if ((segments[0] || "").toLowerCase() === "shr") {
      return segments.length <= 2;
    }

    return segments.length <= 1;
  }

  function pickHeroTitle(pathText, shareRootName, pathNode) {
    if (shareRootName) return shareRootName;

    var linkSegments = pathLinkSegments(pathNode);
    if (linkSegments.length) {
      if ((linkSegments[0] || "").toLowerCase() === "shr") {
        return linkSegments[linkSegments.length - 1] || "Shared Folder";
      }

      return linkSegments[linkSegments.length - 1] || "Downloads";
    }

    var segments = pathSegments(pathText);
    if (!segments.length) return "Downloads";

    if ((segments[0] || "").toLowerCase() === "shr") {
      var sharedPath = segments.slice(2);
      return sharedPath.length ? sharedPath[sharedPath.length - 1] : "Shared Folder";
    }

    return segments[segments.length - 1] || formatPathTitle(pathText) || "Downloads";
  }

  function looksLikeEchoRoot(entry, hasFiles) {
    return (
      hasFiles &&
      entry.isFolder &&
      /^0(?:\s*B)?$/i.test(entry.size || "0") &&
      (!entry.files || entry.files === "---") &&
      /^zip$/i.test(entry.kind || "")
    );
  }

  function make(tag, className, textContent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  function thumbUrl(href) {
    if (!href || href.charAt(0) === "#") return "";
    return href + (href.indexOf("?") === -1 ? "?" : "&") + "th=wf&cache=i&raster";
  }

  function thumbIconUrl(href) {
    if (!href || href.charAt(0) === "#") return "";
    return href + (href.indexOf("?") === -1 ? "?" : "&") + "th=w&cache=i&raster";
  }

  function shouldUseBlobThumbFallback() {
    var ua = navigator.userAgent || "";
    return !!(
      window.fetch &&
      window.URL &&
      typeof URL.createObjectURL === "function" &&
      (/(?:iPad|iPhone|iPod)/.test(ua) ||
        (/AppleWebKit/i.test(ua) &&
          /Mobile/i.test(ua) &&
          !/(?:CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua)))
    );
  }

  function fetchThumbObjectUrl(url) {
    return fetch(url, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("thumb " + response.status);
        }
        return response.blob();
      })
      .then(function (blob) {
        if (!blob || !blob.size) {
          throw new Error("empty thumb");
        }
        return URL.createObjectURL(blob);
      });
  }

  function thumbFallbackLabel(name) {
    var match = /\.([a-z0-9]{1,8})(?:[?#].*)?$/i.exec(name || "");
    return match ? match[1].toUpperCase() : "FILE";
  }

  function applyThumbFallback(thumbWrap, thumbLink, thumb, entryName) {
    if (thumb && thumb.parentNode) {
      thumb.parentNode.removeChild(thumb);
    }

    thumbWrap.classList.add("is-fallback");
    thumbWrap.setAttribute("data-ext", thumbFallbackLabel(entryName));
    thumbLink.classList.add("is-fallback");
  }

  function attachThumbLoader(thumb, thumbWrap, thumbLink, entry) {
    var candidates = [{ url: thumbUrl(entry.href), blob: false }];
    if (shouldUseBlobThumbFallback()) {
      candidates.push({ url: thumbUrl(entry.href), blob: true });
    }
    candidates.push({ url: thumbIconUrl(entry.href), blob: false });

    var candidateIndex = 0;
    var activeBlobUrl = "";
    var requestId = 0;

    function cleanupBlobUrl() {
      if (!activeBlobUrl || !window.URL || typeof URL.revokeObjectURL !== "function") {
        return;
      }

      try {
        URL.revokeObjectURL(activeBlobUrl);
      } catch (ex) {
        // ignore stale blob revocation failures
      }
      activeBlobUrl = "";
    }

    function finalizeFallback() {
      cleanupBlobUrl();
      applyThumbFallback(thumbWrap, thumbLink, thumb, entry.name);
    }

    function loadCandidate(index) {
      var candidate = candidates[index];
      if (!candidate || !candidate.url) {
        finalizeFallback();
        return;
      }

      cleanupBlobUrl();

      if (candidate.blob) {
        var thisRequest = ++requestId;
        fetchThumbObjectUrl(candidate.url)
          .then(function (objectUrl) {
            if (thisRequest !== requestId) {
              if (window.URL && typeof URL.revokeObjectURL === "function") {
                URL.revokeObjectURL(objectUrl);
              }
              return;
            }

            activeBlobUrl = objectUrl;
            thumb.src = objectUrl;
          })
          .catch(function () {
            if (thisRequest !== requestId) return;
            candidateIndex += 1;
            loadCandidate(candidateIndex);
          });
        return;
      }

      thumb.src = candidate.url;
    }

    thumb.addEventListener("load", function () {
      thumbWrap.classList.remove("is-fallback");
      thumbWrap.removeAttribute("data-ext");
      thumbLink.classList.remove("is-fallback");
    });

    thumb.addEventListener("error", function () {
      candidateIndex += 1;
      loadCandidate(candidateIndex);
    });

    loadCandidate(candidateIndex);
  }

  function pickIndices(table) {
    var headers = Array.from(table.querySelectorAll("thead th")).map(function (node) {
      return text(node).replace(/^[^a-z0-9]+/i, "").toLowerCase();
    });
    var find = function (name) {
      return headers.findIndex(function (value) {
        return value === name;
      });
    };

    return {
      name: find("file name"),
      size: find("size"),
      files: find("files"),
      date: find("date")
    };
  }

  function canUpload() {
    var perms = Array.isArray(window.perms) ? window.perms : [];
    return perms.indexOf("write") !== -1;
  }

  var suppressRefreshUntil = 0;

  function delayActiveTabRefresh(ms) {
    suppressRefreshUntil = Math.max(suppressRefreshUntil, Date.now() + (ms || 0));
  }

  function findIndexedUploadInput(prefix) {
    var index = Number(window.fdom_ctr || 0);
    if (index > 0) {
      var indexed = document.getElementById(prefix + index);
      if (indexed) {
        return indexed;
      }
    }

    var inputs = Array.prototype.slice.call(
      document.querySelectorAll("#op_up2k input[type=file]")
    ).filter(function (input) {
      var isFolder = !!input.webkitdirectory;
      return prefix === "dir" ? isFolder : !isFolder;
    });

    return inputs.length ? inputs[inputs.length - 1] : null;
  }

  function findNativeUploadInput() {
    return (
      findIndexedUploadInput("file") ||
      document.getElementById("file1") ||
      document.querySelector("input[type=file][name='file1[]']")
    );
  }

  function primeUploadContext() {
    if (typeof window.start_actx === "function") {
      window.start_actx();
    }
  }

  function findNativeFolderUploadInput() {
    return (
      findIndexedUploadInput("dir") ||
      document.getElementById("dir1") ||
      document.querySelector("input[type=file][name='dir1[]'][webkitdirectory]")
    );
  }

  function openNativeUploadPicker(uploadLink) {
    delayActiveTabRefresh(15000);
    primeUploadContext();

    var input = findNativeUploadInput();
    if (input && typeof input.click === "function") {
      input.click();
      return true;
    }

    if (uploadLink && typeof uploadLink.click === "function") {
      uploadLink.click();
      return true;
    }

    return false;
  }

  function openNativeFolderPicker(uploadLink) {
    delayActiveTabRefresh(15000);
    primeUploadContext();

    var input = findNativeFolderUploadInput();
    if (input && typeof input.click === "function") {
      input.click();
      return true;
    }

    if (uploadLink && typeof uploadLink.click === "function") {
      uploadLink.click();
      return true;
    }

    return false;
  }

  function findNativeMkdirPanel() {
    return document.getElementById("op_mkdir");
  }

  function findNativeMkdirLauncher() {
    return document.getElementById("opa_mkd");
  }

  function closeNativeFolderCreator() {
    var closeLink = document.getElementById("opa_x");
    if (closeLink && typeof closeLink.click === "function") {
      closeLink.click();
    }

    var panel = findNativeMkdirPanel();
    if (panel) {
      panel.classList.remove("act");
    }

    var modal = document.getElementById("cp-mkdir-modal");
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
    }

    document.body.classList.remove("cp-mkdir-open");
  }

  function openNativeFolderCreator() {
    var panel = findNativeMkdirPanel();
    if (!panel) return false;

    var launcher = findNativeMkdirLauncher();
    if (launcher && typeof launcher.click === "function") {
      launcher.click();
    } else {
      panel.classList.add("act");
    }

    var modal = document.getElementById("cp-mkdir-modal");
    if (modal) {
      modal.setAttribute("aria-hidden", "false");
    }

    document.body.classList.add("cp-mkdir-open");

    window.setTimeout(function () {
      var input = panel.querySelector('input[name="name"]');
      if (input && typeof input.focus === "function") {
        input.focus();
        if (typeof input.select === "function") input.select();
      }
    }, 0);

    return true;
  }

  function enableActiveTabRefresh() {
    var refreshArmed = false;

    document.addEventListener("visibilitychange", function () {
      if (Date.now() < suppressRefreshUntil) {
        refreshArmed = false;
        return;
      }

      if (document.hidden) {
        refreshArmed = true;
        return;
      }

      if (refreshArmed) {
        location.reload();
      }
    });
  }

  function buildHero(zipLink, titleText, titleTooltip, uploadLink, mkdirLink) {
    var hero = make("section", null);
    hero.id = "client-hero";
    var heroTitle = make("h1", null, titleText);

    hero.appendChild(make("p", "cp-kicker", "Shared Download"));
    heroTitle.title = titleTooltip || titleText;
    hero.appendChild(heroTitle);

    var actions = make("div", "cp-actions");
    if (zipLink) {
      var btn = make("a", "cp-btn primary", "Download Everything");
      btn.href = zipLink.getAttribute("href");
      actions.appendChild(btn);
    }

    if (uploadLink && canUpload()) {
      var up = make("button", "cp-btn", "Upload Files");
      up.type = "button";
      up.addEventListener("click", function (event) {
        event.preventDefault();

        if (!openNativeUploadPicker(uploadLink)) {
          location.href = location.pathname + "?v=up2k";
        }
      });
      actions.appendChild(up);
    }

    if (mkdirLink && canUpload()) {
      var mkdirBtn = make("button", "cp-btn", "New Folder");
      mkdirBtn.type = "button";
      mkdirBtn.addEventListener("click", function (event) {
        event.preventDefault();
        openNativeFolderCreator();
      });
      actions.appendChild(mkdirBtn);
    }

    hero.appendChild(actions);
    return hero;
  }

  function buildDropboxHero(titleText, titleTooltip) {
    var hero = make("section", null);
    hero.id = "client-hero";
    var heroTitle = make("h1", null, titleText);

    hero.appendChild(make("p", "cp-kicker", "Secure Upload"));
    heroTitle.title = titleTooltip || titleText;
    hero.appendChild(heroTitle);
    return hero;
  }

  function mountNativeFolderCreator(shell) {
    var panel = findNativeMkdirPanel();
    if (!panel) return;

    var modal = document.getElementById("cp-mkdir-modal");
    var dialog;
    var host;

    if (!modal) {
      modal = make("section", null);
      modal.id = "cp-mkdir-modal";
      modal.setAttribute("aria-hidden", "true");

      var backdrop = make("button", "cp-mkdir-backdrop");
      backdrop.type = "button";
      backdrop.setAttribute("aria-label", "Close new folder dialog");
      backdrop.addEventListener("click", function () {
        closeNativeFolderCreator();
      });

      dialog = make("div", "cp-mkdir-dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "cp-mkdir-title");

      var header = make("div", "cp-mkdir-header");
      var title = make("h2", null, "Create Folder");
      title.id = "cp-mkdir-title";
      var closeBtn = make("button", "cp-mkdir-close", "Close");
      closeBtn.type = "button";
      closeBtn.addEventListener("click", function () {
        closeNativeFolderCreator();
      });

      header.appendChild(title);
      header.appendChild(closeBtn);

      host = make("div", "cp-mkdir-host");

      dialog.appendChild(header);
      dialog.appendChild(host);
      modal.appendChild(backdrop);
      modal.appendChild(dialog);
      shell.appendChild(modal);

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && document.body.classList.contains("cp-mkdir-open")) {
          closeNativeFolderCreator();
        }
      });
    } else {
      dialog = modal.querySelector(".cp-mkdir-dialog");
      host = modal.querySelector(".cp-mkdir-host");
    }

    if (host && panel.parentNode !== host) {
      host.appendChild(panel);
    }

    var form = panel.querySelector("form");
    if (form && !form.dataset.cpSimpleBrowserBound) {
      form.dataset.cpSimpleBrowserBound = "1";
      form.addEventListener("submit", function () {
        delayActiveTabRefresh(15000);
      });
    }

    var submit = panel.querySelector('input[type="submit"]');
    if (submit) {
      submit.value = "Create";
    }
  }

  function mountSimpleShell(hero, cards, table, path, accInfo) {
    var shell = document.getElementById("cp-simple-shell");
    if (!shell) {
      shell = make("main", null);
      shell.id = "cp-simple-shell";
      document.body.insertBefore(shell, document.body.firstChild);
    }

    var helpers = document.getElementById("cp-native-helpers");
    if (!helpers) {
      helpers = make("div", "cp-native-helpers");
      helpers.id = "cp-native-helpers";
      helpers.setAttribute("aria-hidden", "true");
    }

    shell.textContent = "";
    shell.appendChild(hero);
    shell.appendChild(cards);
    if (accInfo) shell.appendChild(accInfo);
    shell.appendChild(helpers);

    if (table) helpers.appendChild(table);
    if (path) helpers.appendChild(path);

    var uploadPanel = document.getElementById("op_up2k");
    if (uploadPanel) helpers.appendChild(uploadPanel);

    mountNativeFolderCreator(shell);
  }

  function normalizeDropboxLifetime() {
    var life = document.getElementById("u2life");
    if (!life || life.dataset.cpDropboxReady) return;

    var minutes = document.getElementById("lifem");
    var hours = document.getElementById("lifeh");
    if (!minutes || !hours) return;

    var expires = document.getElementById("lifew");
    var undo = document.getElementById("undor");

    var fields = make("div", "cp-life-fields");
    fields.appendChild(make("span", null, "autodelete after"));
    fields.appendChild(minutes);
    fields.appendChild(make("span", null, "min"));
    fields.appendChild(make("span", "cp-life-divider", "or"));
    fields.appendChild(hours);
    fields.appendChild(make("span", null, "hours"));

    life.textContent = "";
    life.appendChild(fields);

    if (expires) {
      var expiresRow = make("div", "cp-life-row");
      expiresRow.appendChild(document.createTextNode("upload will be deleted "));
      expiresRow.appendChild(expires);
      life.appendChild(expiresRow);
    }

    if (undo) {
      life.appendChild(undo);
    }

    life.dataset.cpDropboxReady = "1";
  }

  function buildDropboxAction(textContent, primary, onActivate) {
    var button = make("button", "cp-dropbox-btn" + (primary ? " primary" : ""), textContent);
    button.type = "button";
    button.addEventListener("click", function (event) {
      event.preventDefault();
      onActivate();
    });
    return button;
  }

  function buildDropboxPanel(uploadLink) {
    var uploadPanel = document.getElementById("op_up2k");
    if (!uploadPanel) return null;

    var panel = make("section", null);
    panel.id = "cp-dropbox-panel";

    var actions = make("div", "cp-dropbox-actions");
    var hasAction = false;

    if (canUpload()) {
      var fileInput = document.getElementById("file1");
      if (fileInput) {
        actions.appendChild(
          buildDropboxAction("Choose Files", true, function () {
            openNativeUploadPicker(uploadLink);
          })
        );
        hasAction = true;
      } else if (uploadLink) {
        var fileBtn = make("button", "cp-dropbox-btn primary", "Choose Files");
        fileBtn.type = "button";
        fileBtn.addEventListener("click", function (event) {
          event.preventDefault();
          if (!openNativeUploadPicker(uploadLink)) {
            location.href = location.pathname + "?v=up2k";
          }
        });
        actions.appendChild(fileBtn);
        hasAction = true;
      }

      var folderInput = document.getElementById("dir1");
      if (folderInput) {
        actions.appendChild(
          buildDropboxAction("Choose Folder", false, function () {
            openNativeFolderPicker(uploadLink);
          })
        );
        hasAction = true;
      } else if (uploadLink) {
        var folderBtn = make("button", "cp-dropbox-btn", "Choose Folder");
        folderBtn.type = "button";
        folderBtn.addEventListener("click", function (event) {
          event.preventDefault();
          if (!openNativeFolderPicker(uploadLink)) {
            location.href = location.pathname + "?v=up2k";
          }
        });
        actions.appendChild(folderBtn);
        hasAction = true;
      }
    }

    if (hasAction) {
      panel.appendChild(actions);
    }

    panel.appendChild(uploadPanel);

    return panel;
  }

  function mountDropboxShell(hero, dropboxPanel, table, path, accInfo) {
    var shell = document.getElementById("cp-simple-shell");
    if (!shell) {
      shell = make("main", null);
      shell.id = "cp-simple-shell";
      document.body.insertBefore(shell, document.body.firstChild);
    }

    var helpers = document.getElementById("cp-native-helpers");
    if (!helpers) {
      helpers = make("div", "cp-native-helpers");
      helpers.id = "cp-native-helpers";
      helpers.setAttribute("aria-hidden", "true");
    }

    shell.textContent = "";
    shell.appendChild(hero);
    shell.appendChild(dropboxPanel);
    if (accInfo) shell.appendChild(accInfo);
    shell.appendChild(helpers);

    if (table) helpers.appendChild(table);
    if (path) helpers.appendChild(path);
  }

  function buildCards(table, pathText) {
    var idx = pickIndices(table);
    if (idx.name < 0) return null;

    var body = table.tBodies[0];
    if (!body) return null;

    var wrap = make("section", null);
    wrap.id = "client-file-cards";

    var entries = Array.from(body.rows)
      .map(function (row) {
        if (!row.cells || row.cells.length <= idx.name) return null;

        var primaryLink = row.cells[idx.name].querySelector("a");
        if (!primaryLink) return null;

        var kindCell = row.cells[0] ? text(row.cells[0]) : "";
        return {
          kind: kindCell,
          isFolder: kindCell.indexOf("DIR") !== -1 || /\/$/.test(text(primaryLink)),
          href: primaryLink.getAttribute("href"),
          name: text(primaryLink).replace(/\/$/, ""),
          size: idx.size >= 0 && row.cells[idx.size] ? text(row.cells[idx.size]) : "",
          files: idx.files >= 0 && row.cells[idx.files] ? text(row.cells[idx.files]) : "",
          date: idx.date >= 0 && row.cells[idx.date] ? text(row.cells[idx.date]) : ""
        };
      })
      .filter(Boolean);

    var shareRootName = "";
    if (isShareRoot(pathText)) {
      var hasFiles = entries.some(function (entry) {
        return !entry.isFolder;
      });

      entries = entries.filter(function (entry) {
        var isEchoFolder = looksLikeEchoRoot(entry, hasFiles);

        if (isEchoFolder && !shareRootName) {
          shareRootName = entry.name;
        }

        return !isEchoFolder;
      });
    }

    entries.forEach(function (entry) {
      var cardClass = "cp-file-card" + (entry.isFolder ? " is-folder" : " has-thumb");
      var card = make("article", cardClass);
      var top = make("div", "cp-file-top");
      var bodyWrap = make("div", "cp-file-body");
      var main = make("div", "cp-file-main");
      var actions = make("div", "cp-file-actions");

      if (!entry.isFolder) {
        var thumbWrap = make("div", "cp-file-thumb-wrap");
        var thumbLink = make("a", "cp-file-thumb-link");
        thumbLink.href = entry.href;
        var thumb = make("img", "cp-file-thumb");
        thumb.alt = "";
        if (shouldUseBlobThumbFallback()) {
          thumb.loading = "eager";
        } else {
          thumb.loading = "lazy";
          thumb.decoding = "async";
        }
        thumbLink.appendChild(thumb);
        thumbWrap.appendChild(thumbLink);
        top.appendChild(thumbWrap);
        attachThumbLoader(thumb, thumbWrap, thumbLink, entry);
      }

      if (entry.isFolder) {
        main.appendChild(make("span", "cp-kind", "Folder"));
      }

      var nameLink = make("a", "cp-file-name", entry.name || entry.href);
      nameLink.href = entry.href;
      if (!entry.isFolder) {
        nameLink.setAttribute("download", entry.name || "");
      }
      main.appendChild(nameLink);

      var meta = make("div", "cp-file-meta");
      if (entry.size) meta.appendChild(make("span", null, "Size: " + entry.size));
      if (entry.files && entry.files !== "---") meta.appendChild(make("span", null, "Items: " + entry.files));
      if (entry.date && entry.date !== "---") meta.appendChild(make("span", null, "Updated: " + entry.date));
      main.appendChild(meta);

      var openBtn = make("a", "cp-card-btn", entry.isFolder ? "Open Folder" : "Download File");
      openBtn.href = entry.href;
      if (!entry.isFolder) {
        openBtn.setAttribute("download", entry.name || "");
      }
      actions.appendChild(openBtn);

      if (entry.isFolder) {
        var zipBtn = make("a", "cp-card-btn", "Download Folder");
        zipBtn.href = entry.href.replace(/\/?$/, "/") + "?zip";
        actions.appendChild(zipBtn);
      }

      bodyWrap.appendChild(main);
      bodyWrap.appendChild(actions);
      top.appendChild(bodyWrap);
      card.appendChild(top);
      wrap.appendChild(card);
    });

    return {
      cards: wrap,
      shareRootName: shareRootName
    };
  }

  function init() {
    if (!matchesPath()) return;
    if (wantsNativeBrowser()) return;

    enableActiveTabRefresh();

    var mode = pageMode();
    var table = document.getElementById("files");
    var zipLink = document.querySelector('a[href*="?zip"]');
    var uploadLink = document.getElementById("opa_up");
    var mkdirLink = findNativeMkdirLauncher();
    var path = document.getElementById("path");
    var pathText = path ? text(path) : "";
    var titleTooltip = path ? formatPathTitle(pathText) : "Downloads";

    if (mode === "dropbox") {
      var dropboxPanel = buildDropboxPanel(uploadLink);
      if (!dropboxPanel) return;

      var dropboxHero = buildDropboxHero("Send Files", titleTooltip || "Share");

      document.documentElement.classList.add("cp-simple-browser-root");
      document.body.classList.add("cp-simple-browser", "cp-dropbox");

      mountDropboxShell(dropboxHero, dropboxPanel, table, path, document.getElementById("acc_info"));
      normalizeDropboxLifetime();
      return;
    }

    if (!table) return;

    var cardView = buildCards(table, pathText);
    if (!cardView) return;

    var heroTitle = pickHeroTitle(pathText, cardView.shareRootName, path);
    var hero = buildHero(zipLink, heroTitle, titleTooltip || heroTitle, uploadLink, mkdirLink);
    var cards = cardView.cards;

    document.documentElement.classList.add("cp-simple-browser-root");
    document.body.classList.add("cp-simple-browser");

    mountSimpleShell(hero, cards, table, path, document.getElementById("acc_info"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
