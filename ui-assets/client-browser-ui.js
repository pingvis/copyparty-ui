(function () {
  "use strict";

  var PATH_PATTERNS = [/^\/shr\//];

  function matchesPath() {
    return PATH_PATTERNS.some(function (re) {
      return re.test(location.pathname);
    });
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
    return href + (href.indexOf("?") === -1 ? "?" : "&") + "th=w&cache=i&raster";
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

  function findNativeUploadInput() {
    return (
      document.querySelector("#op_up2k input[type=file]:not([webkitdirectory])") ||
      document.getElementById("file1") ||
      document.querySelector("input[type=file][name='file1[]']")
    );
  }

  function openNativeUploadPicker(uploadLink) {
    delayActiveTabRefresh(15000);

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
        thumb.loading = "lazy";
        thumb.decoding = "async";
        thumb.src = thumbUrl(entry.href);
        thumb.addEventListener("error", function () {
          card.classList.remove("has-thumb");
          thumbWrap.remove();
        });
        thumbLink.appendChild(thumb);
        thumbWrap.appendChild(thumbLink);
        top.appendChild(thumbWrap);
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

    var table = document.getElementById("files");
    if (!table) return;

    var zipLink = document.querySelector('a[href*="?zip"]');
    var uploadLink = document.getElementById("opa_up");
    var mkdirLink = findNativeMkdirLauncher();
    var path = document.getElementById("path");
    var pathText = path ? text(path) : "";
    var titleTooltip = path ? formatPathTitle(pathText) : "Downloads";

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
