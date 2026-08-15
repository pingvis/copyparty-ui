(function () {
  "use strict";

  var SHARE_PATH = /^\/shr\//;
  var THUMBABLE = /\.(?:avif|bmp|gif|heic|heif|jpe?g|jxl|mkv|mov|mp4|mpeg|mpg|pdf|png|raw|svg|tif?f|webm|webp)$/i;
  var state = {
    data: null,
    listing: null,
    refreshTimer: 0,
    refreshBusy: false,
    refreshQueued: false,
    uploaderMounted: false
  };

  function isSharePath(pathname) {
    return SHARE_PATH.test(pathname || "");
  }

  function wantsNativeBrowser(search, hash, initialHref, fullUiFlag) {
    if (hash === "#cp-native" || fullUiFlag) return true;

    try {
      var params = new URL(initialHref || search || "", "https://copyparty.invalid/").searchParams;
      return params.has("v") || params.has("fullui");
    } catch (err) {
      return /(?:^|[?&])(?:v|fullui)(?:[=&]|$)/.test(initialHref || search || "");
    }
  }

  function listingUrl(href) {
    var url = new URL(href);
    url.searchParams.delete("v");
    url.searchParams.delete("fullui");
    url.searchParams.set("ls", "");
    return url.href;
  }

  function withQuery(href, key) {
    var url = new URL(href, href);
    url.searchParams.delete("v");
    url.searchParams.delete("fullui");
    url.searchParams.delete("ls");
    url.searchParams.set(key, "");
    return url.href;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  }

  function entryName(href) {
    var clean = String(href || "").replace(/[?#].*$/, "").replace(/\/$/, "");
    var bits = clean.split("/");
    return safeDecode(bits[bits.length - 1] || clean);
  }

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (!isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return bytes + " B";

    var units = ["KB", "MB", "GB", "TB", "PB"];
    var size = bytes;
    var unit = -1;
    do {
      size /= 1024;
      unit += 1;
    } while (size >= 1024 && unit < units.length - 1);

    var digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return size.toFixed(digits).replace(/\.0+$/, "").replace(/(\.[0-9])0$/, "$1") + " " + units[unit];
  }

  function formatDate(timestamp) {
    var value = Number(timestamp || 0);
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value * 1000));
    } catch (err) {
      return new Date(value * 1000).toLocaleString();
    }
  }

  function make(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined && textContent !== null) node.textContent = textContent;
    return node;
  }

  function icon(name) {
    var icons = {
      arrow: "M5 12h14M13 6l6 6-6 6",
      back: "M19 12H5m6-6-6 6 6 6",
      chevron: "m9 18 6-6-6-6",
      download: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
      folder: "M3 7h6l2 2h10v10H3z",
      grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
      refresh: "M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7",
      upload: "M12 21V9m0 0-4 4m4-4 4 4M5 4h14",
      x: "M6 6l12 12M18 6 6 18"
    };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", icons[name] || icons.grid);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function button(label, className, iconName) {
    var node = make("button", className || "cp-button");
    node.type = "button";
    if (iconName) node.appendChild(icon(iconName));
    node.appendChild(make("span", null, label));
    return node;
  }

  function linkButton(label, href, className, iconName) {
    var node = make("a", className || "cp-button");
    node.href = href;
    if (iconName) node.appendChild(icon(iconName));
    node.appendChild(make("span", null, label));
    return node;
  }

  function shareContext(pathname) {
    var raw = String(pathname || "").split("/").filter(Boolean);
    var token = raw.length > 1 ? raw[1] : "";
    var folders = raw.slice(2);
    return {
      token: token,
      folders: folders,
      root: "/shr/" + token + "/",
      title: folders.length ? safeDecode(folders[folders.length - 1]) : "Shared folder"
    };
  }

  function buildBreadcrumbs(context) {
    var nav = make("nav", "cp-breadcrumbs");
    nav.setAttribute("aria-label", "Folder path");

    var root = make("a", null, "Shared files");
    root.href = context.root;
    nav.appendChild(root);

    var path = context.root;
    context.folders.forEach(function (segment, index) {
      nav.appendChild(icon("chevron"));
      path += segment + "/";
      if (index === context.folders.length - 1) {
        var current = make("span", null, safeDecode(segment));
        current.setAttribute("aria-current", "page");
        nav.appendChild(current);
      } else {
        var crumb = make("a", null, safeDecode(segment));
        crumb.href = path;
        nav.appendChild(crumb);
      }
    });

    return nav;
  }

  function parentHref(context) {
    if (!context.folders.length) return "";
    var parent = context.folders.slice(0, -1).join("/");
    return context.root + (parent ? parent + "/" : "");
  }

  function canWrite(data) {
    return !!(data && Array.isArray(data.perms) && data.perms.indexOf("write") !== -1);
  }

  function createShell(data) {
    var context = shareContext(location.pathname);
    var parent = parentHref(context);
    var shell = make("main", "cp-shell");
    shell.id = "cp-client-shell";

    var topbar = make("header", "cp-topbar");
    var brand = make("div", "cp-brand");
    if (parent) {
      var headerBack = linkButton("Back", parent, "cp-icon-button cp-header-back", "back");
      headerBack.setAttribute("aria-label", "Back to parent folder");
      brand.appendChild(headerBack);
    }
    var brandWords = make("span", "cp-brand-words");
    brandWords.appendChild(make("strong", null, context.title));
    brandWords.appendChild(make("small", null, "Client delivery"));
    brand.appendChild(brandWords);
    topbar.appendChild(brand);

    var topbarTools = make("div", "cp-topbar-tools");
    var refresh = button("Refresh", "cp-icon-button cp-top-refresh", "refresh");
    refresh.setAttribute("aria-label", "Refresh file list");
    refresh.addEventListener("click", function () {
      refreshListing(true);
    });
    topbarTools.appendChild(refresh);

    var access = make("span", "cp-access " + (canWrite(data) ? "is-write" : "is-read"));
    access.appendChild(make("span", null, canWrite(data) ? "Read/write" : "Read only"));
    topbarTools.appendChild(access);
    topbar.appendChild(topbarTools);
    shell.appendChild(topbar);

    var shareActions = make("nav", "cp-share-actions");
    shareActions.setAttribute("aria-label", "Folder actions");
    var downloadAll = linkButton("Download all", withQuery(location.href, "zip"), "cp-button cp-primary", "download");
    shareActions.appendChild(downloadAll);

    if (canWrite(data) && document.getElementById("op_mkdir")) {
      var mkdir = button("New folder", "cp-button cp-quiet", "folder");
      mkdir.addEventListener("click", openFolderCreator);
      shareActions.appendChild(mkdir);
    }

    shell.appendChild(shareActions);

    if (canWrite(data)) shell.appendChild(buildUploadSection());

    var content = make("section", "cp-content");
    var heading = make("h2", "cp-sr-only", "Files and folders");
    heading.id = "cp-content-title";
    content.appendChild(heading);

    var listing = make("div", "cp-listing");
    listing.id = "cp-listing";
    listing.setAttribute("aria-labelledby", "cp-content-title");
    content.appendChild(listing);
    shell.appendChild(content);

    var live = make("p", "cp-sr-only");
    live.id = "cp-live-status";
    live.setAttribute("aria-live", "polite");
    shell.appendChild(live);

    document.body.insertBefore(shell, document.body.firstChild);
    mountNativePanels(shell);
    return shell;
  }

  function buildUploadSection() {
    var details = make("details", "cp-upload-panel");
    details.id = "cp-upload-panel";
    var summary = make("summary");
    summary.appendChild(icon("upload"));
    var copy = make("span");
    copy.appendChild(make("strong", null, "Upload"));
    summary.appendChild(copy);
    summary.appendChild(icon("chevron"));
    summary.addEventListener("pointerup", function () {
      summary.blur();
    });
    details.appendChild(summary);

    var dropzone = make("button", "cp-dropzone");
    dropzone.type = "button";
    dropzone.appendChild(icon("upload"));
    var dropCopy = make("span");
    dropCopy.appendChild(make("strong", null, "Choose files or drop them here"));
    dropzone.appendChild(dropCopy);
    dropzone.addEventListener("click", function () {
      openUploader(true);
    });
    details.appendChild(dropzone);

    var parallel = make("div", "cp-parallel-control");
    parallel.appendChild(make("span", null, "Parallel uploads"));
    var parallelNative = make("div", "cp-parallel-native");
    parallelNative.id = "cp-parallel-native";
    parallel.appendChild(parallelNative);
    details.appendChild(parallel);

    var host = make("div", "cp-native-upload-host");
    host.id = "cp-native-upload-host";
    details.appendChild(host);
    return details;
  }

  function mountNativePanels(shell) {
    var uploadHost = document.getElementById("cp-native-upload-host");
    var uploadPanel = document.getElementById("op_up2k");
    if (uploadHost && uploadPanel) {
      uploadHost.appendChild(uploadPanel);
      var parallelNative = document.getElementById("cp-parallel-native");
      ["nthread_sub", "nthread", "nthread_add"].forEach(function (id) {
        var control = document.getElementById(id);
        if (parallelNative && control) parallelNative.appendChild(control);
      });
      state.uploaderMounted = true;
      observeUploader(uploadPanel);
    }

    var mkdirPanel = document.getElementById("op_mkdir");
    if (mkdirPanel) {
      var modal = make("section", "cp-mkdir-modal");
      modal.id = "cp-mkdir-modal";
      modal.setAttribute("aria-hidden", "true");
      var backdrop = make("button", "cp-modal-backdrop");
      backdrop.type = "button";
      backdrop.setAttribute("aria-label", "Close new folder dialog");
      backdrop.addEventListener("click", closeFolderCreator);
      modal.appendChild(backdrop);

      var dialog = make("div", "cp-mkdir-dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "cp-mkdir-title");
      var head = make("header");
      var title = make("h2", null, "Create a folder");
      title.id = "cp-mkdir-title";
      head.appendChild(title);
      var close = button("Close", "cp-icon-button", "x");
      close.setAttribute("aria-label", "Close new folder dialog");
      close.addEventListener("click", closeFolderCreator);
      head.appendChild(close);
      dialog.appendChild(head);
      dialog.appendChild(mkdirPanel);
      modal.appendChild(dialog);
      shell.appendChild(modal);

      var form = mkdirPanel.querySelector("form");
      if (form) {
        form.addEventListener("submit", function () {
          setTimeout(function () {
            closeFolderCreator();
            refreshListing(true);
          }, 900);
        });
      }
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeFolderCreator();
    });
  }

  function openFolderCreator() {
    var panel = document.getElementById("op_mkdir");
    var modal = document.getElementById("cp-mkdir-modal");
    if (!panel || !modal) return;
    var launcher = document.getElementById("opa_mkd");
    if (launcher) launcher.click();
    panel.classList.add("act");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("cp-modal-open");
    setTimeout(function () {
      var input = panel.querySelector('input[name="name"]');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function closeFolderCreator() {
    var modal = document.getElementById("cp-mkdir-modal");
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;
    var close = document.getElementById("opa_x");
    if (close) close.click();
    var panel = document.getElementById("op_mkdir");
    if (panel) panel.classList.remove("act");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cp-modal-open");
  }

  function openUploader(chooseFiles) {
    var details = document.getElementById("cp-upload-panel");
    var panel = document.getElementById("op_up2k");
    if (details) details.open = true;
    if (panel) panel.classList.add("act");

    var nativeTab = document.getElementById("opa_up");
    if (nativeTab) nativeTab.click();
    if (!chooseFiles) return;

    var attempts = 0;
    function launch() {
      var nativeButton = document.getElementById("u2btn");
      if (nativeButton) {
        nativeButton.click();
        return;
      }
      attempts += 1;
      if (attempts < 30) {
        setTimeout(launch, 50);
        return;
      }
      announce("Uploader is ready below. Choose files from the upload panel.");
    }
    setTimeout(launch, 0);
  }

  function observeUploader(panel) {
    if (!window.MutationObserver || panel.dataset.cpObserved) return;
    panel.dataset.cpObserved = "1";
    var observer = new MutationObserver(function () {
      var details = document.getElementById("cp-upload-panel");
      var table = document.getElementById("u2tab");
      if (details && table && table.querySelector("tbody tr")) details.open = true;
      scheduleRefresh(1400);
    });
    observer.observe(panel, { childList: true, subtree: true, characterData: true });
  }

  function scheduleRefresh(delay) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(function () {
      refreshListing(false);
    }, delay || 800);
  }

  function announce(message) {
    var live = document.getElementById("cp-live-status");
    if (live) live.textContent = message;
  }

  function thumbHref(item) {
    var url = new URL(item.href, location.href);
    url.searchParams.set("th", "wf");
    url.searchParams.set("cache", "i");
    url.searchParams.set("raster", "");
    return url.href;
  }

  function thumbFallbackHref(item) {
    var url = new URL(item.href, location.href);
    url.searchParams.set("th", "w");
    url.searchParams.set("cache", "i");
    url.searchParams.set("raster", "");
    return url.href;
  }

  function shouldThumb(item) {
    return THUMBABLE.test(entryName(item.href)) || !!(item.tags && (item.tags.res || item.tags.vc));
  }

  function fileType(item) {
    var ext = String(item.ext || "").replace(/^\./, "");
    if (!ext || ext === "---") {
      var match = /\.([a-z0-9]{1,8})$/i.exec(entryName(item.href));
      ext = match ? match[1] : "file";
    }
    return ext.toUpperCase();
  }

  function itemHref(item) {
    return new URL(item.href, location.href).href;
  }

  function folderZipHref(item) {
    var url = new URL(item.href, location.href);
    var current = new URL(location.href);
    current.searchParams.forEach(function (value, key) {
      if (key !== "v" && key !== "fullui" && key !== "ls") url.searchParams.set(key, value);
    });
    url.searchParams.set("zip", "");
    return url.href;
  }

  function renderListing(data) {
    var listing = document.getElementById("cp-listing");
    if (!listing) return;
    listing.textContent = "";

    var dirs = Array.isArray(data.dirs) ? data.dirs : [];
    var files = Array.isArray(data.files) ? data.files : [];
    if (!dirs.length && !files.length) {
      var empty = make("div", "cp-empty");
      empty.appendChild(icon("folder"));
      empty.appendChild(make("h3", null, "Nothing here yet"));
      empty.appendChild(make("p", null, canWrite(data) ? "Upload the first file to get started." : "This shared folder is empty."));
      if (canWrite(data)) {
        var emptyUpload = button("Upload files", "cp-button cp-primary", "upload");
        emptyUpload.addEventListener("click", function () {
          openUploader(true);
        });
        empty.appendChild(emptyUpload);
      }
      listing.appendChild(empty);
      return;
    }

    if (dirs.length) {
      var folderSection = make("section", "cp-group");
      folderSection.appendChild(make("h3", null, "Folders"));
      var folderGrid = make("div", "cp-folder-grid");
      dirs.forEach(function (item) {
        folderGrid.appendChild(renderFolder(item));
      });
      folderSection.appendChild(folderGrid);
      listing.appendChild(folderSection);
    }

    if (files.length) {
      var fileSection = make("section", "cp-group");
      fileSection.appendChild(make("h3", null, "Files"));
      var fileGrid = make("div", "cp-file-grid");
      files.forEach(function (item) {
        fileGrid.appendChild(renderFile(item));
      });
      fileSection.appendChild(fileGrid);
      listing.appendChild(fileSection);
    }
  }

  function renderFolder(item) {
    var card = make("article", "cp-folder-card");
    var folderLink = make("a", "cp-folder-main");
    folderLink.href = itemHref(item);
    var visual = make("span", "cp-folder-icon");
    visual.appendChild(icon("folder"));
    var cover = make("img", "cp-folder-thumb");
    cover.alt = "";
    cover.loading = "lazy";
    cover.decoding = "async";
    cover.src = thumbFallbackHref(item);
    cover.addEventListener("error", function () {
      cover.remove();
    });
    visual.appendChild(cover);
    folderLink.appendChild(visual);
    var copy = make("span", "cp-folder-copy");
    copy.appendChild(make("strong", null, entryName(item.href)));
    var count = item.tags && item.tags[".files"] !== undefined ? Number(item.tags[".files"]) : 0;
    var meta = count ? count + (count === 1 ? " item" : " items") : "Folder";
    if (item.sz) meta += " · " + formatBytes(item.sz);
    copy.appendChild(make("small", null, meta));
    folderLink.appendChild(copy);
    folderLink.appendChild(icon("chevron"));
    card.appendChild(folderLink);

    var zip = linkButton("Download", folderZipHref(item), "cp-folder-download", "download");
    zip.setAttribute("aria-label", "Download " + entryName(item.href));
    card.appendChild(zip);
    return card;
  }

  function renderFile(item) {
    var card = make("article", "cp-file-card");
    var preview = make("a", "cp-preview");
    preview.href = itemHref(item);
    preview.setAttribute("aria-label", "Open " + entryName(item.href));
    var fallback = make("span", "cp-file-fallback", fileType(item));
    preview.appendChild(fallback);

    if (shouldThumb(item)) {
      var image = make("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.src = thumbHref(item);
      image.addEventListener("error", function () {
        if (!image.dataset.cpFallback) {
          image.dataset.cpFallback = "1";
          image.src = thumbFallbackHref(item);
          return;
        }
        image.remove();
      });
      preview.appendChild(image);
    }
    card.appendChild(preview);

    var body = make("div", "cp-file-body");
    var name = make("a", "cp-file-name", entryName(item.href));
    name.href = itemHref(item);
    name.setAttribute("download", entryName(item.href));
    name.title = entryName(item.href);
    body.appendChild(name);
    var meta = make("p", "cp-file-meta");
    meta.appendChild(make("span", null, formatBytes(item.sz)));
    var date = formatDate(item.ts);
    if (date) meta.appendChild(make("span", null, date));
    body.appendChild(meta);
    var download = linkButton("Download", itemHref(item), "cp-file-download", "download");
    download.setAttribute("download", entryName(item.href));
    download.setAttribute("aria-label", "Download " + entryName(item.href));
    body.appendChild(download);
    card.appendChild(body);
    return card;
  }

  function setLoading(loading) {
    var content = document.querySelector(".cp-content");
    if (content) content.classList.toggle("is-loading", !!loading);
  }

  function showError(message) {
    var listing = document.getElementById("cp-listing");
    if (!listing) return;
    listing.textContent = "";
    var error = make("div", "cp-error");
    error.appendChild(make("h3", null, "Could not refresh this folder"));
    error.appendChild(make("p", null, message || "Check the connection and try again."));
    var retry = button("Try again", "cp-button cp-secondary", "refresh");
    retry.addEventListener("click", function () {
      refreshListing(true);
    });
    error.appendChild(retry);
    listing.appendChild(error);
  }

  function fetchListing() {
    return fetch(listingUrl(location.href), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Server returned " + response.status);
      return response.json();
    });
  }

  function refreshListing(announceResult) {
    if (state.refreshBusy) {
      state.refreshQueued = true;
      return Promise.resolve();
    }
    state.refreshBusy = true;
    setLoading(true);
    return fetchListing()
      .then(function (data) {
        state.data = data;
        renderListing(data);
        if (announceResult) announce("File list refreshed.");
      })
      .catch(function (err) {
        if (!state.data) showError(err && err.message);
      })
      .then(function () {
        state.refreshBusy = false;
        setLoading(false);
        if (state.refreshQueued) {
          state.refreshQueued = false;
          return refreshListing(false);
        }
      });
  }

  function init() {
    if (
      !isSharePath(location.pathname) ||
      wantsNativeBrowser(location.search, location.hash, window.sloc0, window.fullui)
    )
      return;
    fetchListing()
      .then(function (data) {
        state.data = data;
        document.documentElement.classList.add("cp-client-ui-root");
        document.body.classList.add("cp-client-ui");
        createShell(data);
        renderListing(data);
        window.addEventListener("focus", function () {
          scheduleRefresh(300);
        });
      })
      .catch(function () {
        // Fail open: leave Copyparty's native interface untouched.
      });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      entryName: entryName,
      formatBytes: formatBytes,
      isSharePath: isSharePath,
      listingUrl: listingUrl,
      shareContext: shareContext,
      wantsNativeBrowser: wantsNativeBrowser,
      withQuery: withQuery
    };
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
